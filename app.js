function useModuloPortal(area, user, modulos) {
    const chave = 'bocchi.portal.modulo.' + area + '.' + (user.id || user.login);
    const [selecionado, setSelecionado] = useState(() => {
        try { return sessionStorage.getItem(chave); } catch { return null; }
    });
    const modulo = modulos.includes(selecionado) ? selecionado : (modulos[0] || '');
    const selecionar = id => {
        if (!modulos.includes(id)) return;
        setSelecionado(id);
        try { sessionStorage.setItem(chave, id); } catch {}
    };
    return [modulo, selecionar];
}
function useAtualizacaoPortal(modulos, atualizar) {
    const callback = React.useRef(atualizar);
    callback.current = atualizar;
    useEffect(() => {
        if (CONFIG.MODO_TESTE_LOCAL) return;
        let ocupado = false;
        let pendente = false;
        let ativo = true;
        const executar = async () => {
            if (!ativo || !pendente || document.hidden || ocupado || !ApiService.token) return;
            pendente = false;
            ocupado = true;
            try { await callback.current(); } catch {} finally {
                ocupado = false;
                if (pendente) executar();
            }
        };
        const avisar = event => {
            if (event.detail && !event.detail.some(modulo => modulos.includes(modulo))) return;
            pendente = true;
            executar();
        };
        window.addEventListener('bocchi:atualizacao', avisar);
        document.addEventListener('visibilitychange', executar);
        return () => {
            ativo = false;
            window.removeEventListener('bocchi:atualizacao', avisar);
            document.removeEventListener('visibilitychange', executar);
        };
    }, []);
}

function useConexaoPortal(usuario) {
    useEffect(() => {
        if (!CONFIG.ATUALIZACAO_TEMPO_REAL || !usuario || !ApiService.token || CONFIG.MODO_TESTE_LOCAL) return;
        const url = new URL(CONFIG.API_URL + '/atualizacoes', location.href);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        let socket, timer, encerrado = false, conectadoAntes = false, atraso = 1000;
        const avisar = modulos => window.dispatchEvent(new CustomEvent('bocchi:atualizacao', { detail: modulos }));
        const conectar = () => {
            if (encerrado || !ApiService.token) return;
            socket = new WebSocket(url.href, ['bocchi.atualizacoes', 'sessao.' + ApiService.token]);
            socket.onopen = () => { if (!encerrado) { atraso = 1000; if (conectadoAntes) avisar(null); conectadoAntes = true; } };
            socket.onmessage = event => {
                if (encerrado) return;
                try { const modulos = JSON.parse(event.data); if (Array.isArray(modulos)) avisar(modulos); } catch {}
            };
            socket.onclose = () => {
                if (encerrado) return;
                timer = setTimeout(conectar, atraso);
                atraso = Math.min(atraso * 2, 60000);
            };
        };
        conectar();
        return () => { encerrado = true; clearTimeout(timer); socket?.close(); };
    }, [usuario]);
}

const { useState, useMemo, useRef, useEffect } = React;
/* ============================================================================
   CONFIGURAÇÕES GERAIS DA PLATAFORMA
   Backend: Cloudflare Worker | Persistência em migração para D1/R2 (homologação)
   API_URL é o ponto central de configuração do serviço de integração.
   Nunca inserir credenciais, tokens ou segredos neste arquivo.
   ========================================================================== */
const CONFIG = {
    API_URL: "https://bocchi-frota-api-homolog.logistica-951.workers.dev",
    // Modo local de testes, desativado em produção: não grava na API.
    MODO_TESTE_LOCAL: false,
    ATUALIZACAO_TEMPO_REAL: false,
    MAX_FOTO_MB: 2,
    QUALIDADE_FOTO: 0.7,
    FOTO_MAX_PX: 1600,
    TIMEOUT_MS: 90000,
    RETRY_DELAYS_MS: [0, 10000, 30000, 120000],
    MAX_TENTATIVAS: 4,
    VERSAO: '2.8.54-homolog'
};
// A versão exibida no login e no título do navegador vem sempre do CONFIG.
document.title = `Logística Bocchi — Portal do Motorista e ADM Logística (${CONFIG.VERSAO})`;
/* ============================================================================
   CONTROLE DE ACESSO — PERFIS + PERMISSÕES
   A API pode devolver `perfis` e `permissoes`. Enquanto a API não devolver
   essas listas, os perfis atuais recebem as permissões-padrão abaixo.
   ========================================================================== */
const normalizarPerfil = p => String(p || '').trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s/]+/g, '_');
const normalizar = valor => String(valor || '').trim().toLocaleLowerCase('pt-BR')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
const usuarioConfiguradoPremiacao = u => normalizarPerfil(u?.perfil) === 'MOTORISTA' &&
    normalizarPerfil(u?.tipoFrotaAcesso) === 'FROTA_PESADA' &&
    u?.acessoPremiacao === true;
const idUsuario = u => String(u?.itemId || u?.id || u?.usuarioItemId || u?.usuarioId || '');
const vinculoPertenceUsuario = (v, u) => {
    const id = idUsuario(u);
    const idV = String(v?.usuarioItemId || v?.usuarioId || v?.userItemId || '');
    if (id && idV)
        return id === idV;
    return normalizar(v?.usuarioNome || v?.motoristaNome || v?.nomeUsuario) === normalizar(u?.nome);
};
const sobrepoePeriodo = (v, inicio, fim) => {
    const ini = String(v?.dataInicio || '').slice(0, 10) || '0000-01-01';
    const encerrado = String(v?.dataFim || '').slice(0, 10);
    const fimV = encerrado || '9999-12-31';
    /*
     * DataInicio é inclusiva e DataFim é exclusiva:
     * - início em 01/03: aplica-se a março;
     * - fim em 01/03: não se aplica a março;
     * - fim em 01/02: não se aplica a fevereiro.
     */
    return ini <= fim && fimV > inicio;
};
const usuarioValidoPremiacaoPeriodo = (u, vinculos, inicio, fim) => {
    if (!usuarioConfiguradoPremiacao(u))
        return false;
    const lista = (Array.isArray(vinculos) ? vinculos : []).filter(v => vinculoPertenceUsuario(v, u));
    /* Compatibilidade: enquanto não houver vínculos retornados, preserva os ativos. */
    if (!lista.length)
        return u?.ativo !== false;
    return lista.some(v => sobrepoePeriodo(v, inicio, fim));
};
function perfisDoUsuario(user) {
    const lista = Array.isArray(user?.perfis) ? user.perfis : [user?.perfil];
    return [...new Set(lista.filter(Boolean).map(normalizarPerfil))];
}
function permissoesDoUsuario(user) {
    return new Set(Array.isArray(user?.permissoes) ? user.permissoes.filter(Boolean) : []);
}
const ACESSO_NOVO_POR_PERMISSAO = {
    'painel_rh.visualizar': { areas: ['RH_FECHAMENTO', 'FECHAMENTO_RH'] },
    'painel.visualizar': { areas: ['PAINEL'] },
    'importar.criar': { areas: ['IMPORTACAO'], editar: true },
    'contestacoes.visualizar': { areas: ['CONTESTACOES'] },
    'sinistros.visualizar': { area: 'SINISTROS', subtela: 'SINISTROS_GESTAO' },
    'sinistros.gerenciar': { area: 'SINISTROS', subtela: 'SINISTROS_GESTAO', editar: true },
    'sinistros.configuracoes': { area: 'SINISTROS', subtela: 'SINISTROS_CONFIGURACOES' },
    'sinistros.configuracoes.editar': { area: 'SINISTROS', subtela: 'SINISTROS_CONFIGURACOES', editar: true },
    'checklist.aprovacao': { area: 'CHECKLIST', subtela: 'CHECKLIST_APROVACAO' },
    'checklist.perguntas': { area: 'CHECKLIST', subtela: 'CHECKLIST_PERGUNTAS' },
    'checklist.relatorio': { area: 'CHECKLIST', subtela: 'CHECKLIST_RELATORIO' },
    'checklist.administrar': { area: 'CHECKLIST', qualquerSubtela: true, editar: true },
    'premiacao.visualizar': { area: 'PREMIACAO', subtela: 'PREMIACAO_PAINEL' },
    'metas.visualizar': { area: 'PREMIACAO', subtela: 'PREMIACAO_METAS' },
    'metas.editar': { area: 'PREMIACAO', subtela: 'PREMIACAO_METAS', editar: true },
    'auditoria.visualizar': { area: 'PREMIACAO', subtela: 'PREMIACAO_AUDITORIA' },
    'auditoria.editar': { area: 'PREMIACAO', subtela: 'PREMIACAO_AUDITORIA', editar: true },
    'descontos.visualizar': { area: 'PREMIACAO', subtela: 'PREMIACAO_DESCONTOS' },
    'descontos.editar': { area: 'PREMIACAO', subtela: 'PREMIACAO_DESCONTOS', editar: true },
    'cadastro.usuarios': { area: 'CADASTROS', subtela: 'CADASTRO_USUARIOS' },
    'cadastro.tipos_veiculo': { area: 'CADASTROS', subtela: 'CADASTRO_TIPOS_VEICULO' },
    'cadastro.veiculos': { area: 'CADASTROS', subtela: 'CADASTRO_VEICULOS' },
    'cadastro.vinculos': { area: 'CADASTROS', subtela: 'CADASTRO_VINCULOS' },
    'cadastro.perfis': { area: 'CADASTROS', subtela: 'CADASTRO_PERFIS' },
    'quadrimestre.atualizar': { area: 'RH_FECHAMENTO', subtela: 'ATUALIZARAPURACOESDOQUADRIMESTRE_RH_FECHAMENTO', editar: true },
    'quadrimestre.fechar': { area: 'RH_FECHAMENTO', subtela: 'FECHARQUADRIMESTRE_RH_FECHAMENTO', editar: true },
    'quadrimestre.reabrir': { area: 'RH_FECHAMENTO', subtela: 'REABRIQUADRIMESTRE_RH_FECHAMENTO', editar: true },
    'agendamentos.agenda': { area: 'AGENDAMENTOS', subtela: 'AGENDAMENTOS_AGENDA_GERAL' },
    'agendamentos.monitoramento': { area: 'AGENDAMENTOS', subtela: 'AGENDAMENTOS_MONITORAMENTO', editar: true },
    'agendamentos.relatorio': { area: 'AGENDAMENTOS', subtela: 'AGENDAMENTOS_RELATORIO' },
    'agendamentos.parametros': { area: 'AGENDAMENTOS', subtela: 'AGENDAMENTOS_PARAMETROS', editar: true }
};
function podePeloPerfilNovo(user, permissao) {
    if (!user?.acessosPerfilDefinidos)
        return false;
    const regra = ACESSO_NOVO_POR_PERMISSAO[permissao];
    if (!regra)
        return false;
    const areas = new Set((user.areasAcesso || []).map(normalizarPerfil));
    const subtelas = new Set((user.subtelasAcesso || []).map(normalizarPerfil));
    const areaOk = regra.areas
        ? regra.areas.some(a => areas.has(normalizarPerfil(a)))
        : areas.has(normalizarPerfil(regra.area));
    if (!areaOk)
        return false;
    if (regra.subtela && !subtelas.has(normalizarPerfil(regra.subtela)))
        return false;
    if (regra.qualquerSubtela && ![...subtelas].some(s => s.startsWith(normalizarPerfil(regra.area) + '_')))
        return false;
    if (regra.editar && !['GERENCIAR', 'ADMIN_COMPLETO'].includes(normalizarPerfil(user.nivelAcesso)))
        return false;
    return true;
}
function pode(user, permissao) {
    if (podePeloPerfilNovo(user, permissao))
        return true;
    return permissoesDoUsuario(user).has(permissao);
}
const ABAS_PAINEL = ['PAINEL_VISAO_GERAL', 'PAINEL_CARGAS'];
const subtelasPainelDefinidas = subtelas => subtelas.some(codigo => codigo.startsWith('PAINEL_'));
function podeAbaPainel(user, aba) {
    if (!user?.acessosPerfilDefinidos) return pode(user, 'painel.visualizar');
    const areas = (user.areasAcesso || []).map(normalizarPerfil);
    const subtelas = (user.subtelasAcesso || []).map(normalizarPerfil);
    return areas.includes('PAINEL') &&
        (subtelasPainelDefinidas(subtelas) ? subtelas.includes(aba) : ABAS_PAINEL.includes(aba));
}
function temPerfil(user, perfil) { return perfisDoUsuario(user).includes(normalizarPerfil(perfil)); }
/* ============================================================================
   UTILITÁRIOS GERAIS
   ========================================================================== */
function gerarUUID() {
    if (window.crypto && crypto.randomUUID)
        return crypto.randomUUID();
    // Alternativa quando crypto.randomUUID não existe (navegadores antigos)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
async function fetchComTimeout(url, options = {}, timeout = CONFIG.TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    }
    finally {
        clearTimeout(timer);
    }
}
const agoraISO = () => new Date().toISOString();
/* ============================================================================
   ARMAZENAMENTO LOCAL — fila de envio e rascunhos
   Status locais: RASCUNHO, PENDENTE, ENVIANDO, ENVIADO, ERRO
   ========================================================================== */
const IDB = {
    _db: null,
    abrir() {
        if (this._db)
            return Promise.resolve(this._db);
        return new Promise((res, rej) => {
            const rq = indexedDB.open('bocchi_frota', 1);
            rq.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('fila'))
                    db.createObjectStore('fila', { keyPath: 'idLocal' });
                if (!db.objectStoreNames.contains('rascunho'))
                    db.createObjectStore('rascunho', { keyPath: 'chave' });
            };
            rq.onsuccess = e => { this._db = e.target.result; res(this._db); };
            rq.onerror = () => rej(rq.error);
        });
    },
    _tx(store, mode, fn) {
        return this.abrir().then(db => new Promise((res, rej) => {
            const tx = db.transaction(store, mode);
            const st = tx.objectStore(store);
            const out = fn(st);
            tx.oncomplete = () => res(out && out.result !== undefined ? out.result : undefined);
            tx.onerror = () => rej(tx.error);
        }));
    },
    salvarFila(item) { return this._tx('fila', 'readwrite', st => st.put(item)); },
    removerFila(idLocal) { return this._tx('fila', 'readwrite', st => st.delete(idLocal)); },
    listarFila() {
        return this.abrir().then(db => new Promise((res, rej) => {
            const rq = db.transaction('fila', 'readonly').objectStore('fila').getAll();
            rq.onsuccess = () => res(rq.result || []);
            rq.onerror = () => rej(rq.error);
        }));
    },
    listarRascunhos() {
        return this.abrir().then(db => new Promise((res, rej) => {
            const rq = db.transaction('rascunho', 'readonly').objectStore('rascunho').getAll();
            rq.onsuccess = () => res(rq.result || []);
            rq.onerror = () => rej(rq.error);
        }));
    },
    salvarRascunho(chave, dados) { return this._tx('rascunho', 'readwrite', st => st.put({ chave, dados, quando: agoraISO() })); },
    lerRascunho(chave) {
        return this.abrir().then(db => new Promise((res) => {
            const rq = db.transaction('rascunho', 'readonly').objectStore('rascunho').get(chave);
            rq.onsuccess = () => res(rq.result ? rq.result.dados : null);
            rq.onerror = () => res(null);
        }));
    },
    apagarRascunho(chave) { return this._tx('rascunho', 'readwrite', st => st.delete(chave)); }
};
/* ============================================================================
   PROCESSAMENTO DE FOTOS — compressão antes do envio
   Redimensiona para no máximo CONFIG.FOTO_MAX_PX no maior lado,
   converte para JPEG qualidade CONFIG.QUALIDADE_FOTO e valida o tamanho.
   Isolada de propósito: se o backend passar a aceitar multipart/form-data,
   basta trocar o retorno de Base64 por Blob aqui.
   ========================================================================== */
function comprimirImagem(arquivo) {
    return new Promise((res, rej) => {
        const url = URL.createObjectURL(arquivo);
        const img = new Image();
        img.onload = () => {
            try {
                let { width: w, height: h } = img;
                const maior = Math.max(w, h);
                if (maior > CONFIG.FOTO_MAX_PX) {
                    const esc = CONFIG.FOTO_MAX_PX / maior;
                    w = Math.round(w * esc);
                    h = Math.round(h * esc);
                }
                const cv = document.createElement('canvas');
                cv.width = w;
                cv.height = h;
                cv.getContext('2d').drawImage(img, 0, 0, w, h);
                const b64 = cv.toDataURL('image/jpeg', CONFIG.QUALIDADE_FOTO);
                URL.revokeObjectURL(url);
                const tamanhoMB = (b64.length * 0.75) / 1048576; // aprox. bytes do Base64
                if (tamanhoMB > CONFIG.MAX_FOTO_MB) {
                    rej(new Error('Foto muito grande mesmo após compressão (' + tamanhoMB.toFixed(1) + ' MB). Tente uma foto mais próxima do problema.'));
                    return;
                }
                res(b64);
            }
            catch (e) {
                URL.revokeObjectURL(url);
                rej(e);
            }
        };
        img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Não foi possível ler a imagem.')); };
        img.src = url;
    });
}
function otimizarArquivoBinario(arquivo) {
    if (!String(arquivo?.type || '').toLowerCase().startsWith('image/')) {
        if (Number(arquivo?.size || 0) > 4 * 1024 * 1024)
            return Promise.reject(new Error('O arquivo ' + arquivo.name + ' ultrapassa 4 MB.'));
        return Promise.resolve({ nome: arquivo.name || 'arquivo', tipo: arquivo.type || 'application/octet-stream', blob: arquivo, tamanho: Number(arquivo.size || 0), chave: [arquivo.name || 'arquivo', arquivo.size || 0, arquivo.lastModified || 0].join('_') });
    }
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(arquivo), img = new Image();
        img.onload = () => {
            try {
                let w = img.width, h = img.height;
                const maior = Math.max(w, h);
                if (maior > CONFIG.FOTO_MAX_PX) {
                    const esc = CONFIG.FOTO_MAX_PX / maior;
                    w = Math.round(w * esc);
                    h = Math.round(h * esc);
                }
                const cv = document.createElement('canvas');
                cv.width = w;
                cv.height = h;
                cv.getContext('2d').drawImage(img, 0, 0, w, h);
                cv.toBlob(blob => {
                    URL.revokeObjectURL(url);
                    if (!blob) {
                        reject(new Error('Não foi possível otimizar ' + arquivo.name));
                        return;
                    }
                    if (blob.size > 4 * 1024 * 1024) {
                        reject(new Error('A foto ' + arquivo.name + ' ainda ultrapassa 4 MB após a otimização.'));
                        return;
                    }
                    resolve({ nome: String(arquivo.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg', tipo: 'image/jpeg', blob, tamanho: blob.size, chave: [arquivo.name || 'foto', arquivo.size || 0, arquivo.lastModified || 0].join('_') });
                }, 'image/jpeg', CONFIG.QUALIDADE_FOTO);
            }
            catch (e) {
                URL.revokeObjectURL(url);
                reject(e);
            }
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler ' + arquivo.name)); };
        img.src = url;
    });
}
/* ============================================================================
   SERVIÇO DE INTEGRAÇÃO
   O front-end acessa somente o backend definido em CONFIG.API_URL.
   O acesso ao banco D1 de homologação é responsabilidade exclusiva do backend.
   Em MODO_TESTE_LOCAL, as funções simulam o servidor localmente.
   ========================================================================== */
let _expiraSessao = null;
let _token = null;
let _loginSessao = null; // identifica o proprietário do token atual
const ApiService = {
    get token() { return _token; },
    get loginAtual() { return _loginSessao; },
    _headers() {
        const h = { 'Content-Type': 'application/json' };
        if (_token)
            h['Authorization'] = 'Bearer ' + _token;
        return h;
    },
    limparCache() { cacheLeiturasPortal.limpar(); },
    async _req(metodo, caminho, corpo) {
        const token = _token;
        if (metodo !== 'GET') {
            this.limparCache();
            try { return await this._reqRede(metodo, caminho, corpo); }
            finally { this.limparCache(); }
        }
        // Decisões, disponibilidade, RH e permissões sempre voltam ao servidor.
        const rota = caminho.split('?')[0];
        const modulo = rota === '/cargas/me' && !new URLSearchParams(caminho.split('?')[1]).has('modo') ? 'cargas' : rota === '/premiacao/me' ? 'premiacao' : rota === '/configuracoes' ? 'configuracoes' : null;
        const ttl = modulo === 'configuracoes' ? 15000 : modulo ? 120000 : 0;
        const privada = rota === '/cargas/me' || modulo === 'premiacao';
        const conferirSessao = () => {
            if (!privada) return;
            if (token !== _token) throw new Error('Sessão alterada durante a consulta.');
            if (!token || !(Date.parse(_expiraSessao) > Date.now())) {
                window.dispatchEvent(new Event('bocchi:sessao-invalida'));
                throw new Error('Sessão inválida ou expirada.');
            }
        };
        conferirSessao();
        const resultado = await cacheLeiturasPortal.obter(token + '|' + caminho, async () => {
            const dados = await this._reqRede(metodo, caminho, corpo);
            if (token !== _token) throw new Error('Sessão alterada durante a consulta.');
            return dados;
        }, ttl, modulo);
        conferirSessao();
        return resultado;
    },
    async _reqRede(metodo, caminho, corpo) {
        const r = await fetchComTimeout(CONFIG.API_URL + caminho, {
            method: metodo, headers: this._headers(),
            body: corpo ? JSON.stringify(corpo) : undefined
        });
        if (!r.ok) {
            if (r.status === 401 && caminho !== '/login' && _token) window.dispatchEvent(new Event('bocchi:sessao-invalida'));
            let detalhe = null;
            let msg = 'Erro ' + r.status;
            try {
                detalhe = await r.json();
                if (detalhe && (detalhe.mensagem || detalhe.message))
                    msg = detalhe.mensagem || detalhe.message;
            }
            catch (e) { }
            // Idempotência: se a API informar que o checklist já existe e devolver o protocolo,
            // considerar o envio confirmado em vez de gerar duplicidade.
            if (r.status === 409 && detalhe && detalhe.protocolo) {
                return { sucesso: true, protocolo: detalhe.protocolo, dataHoraRecebimento: detalhe.dataHoraRecebimento || agoraISO(), status: detalhe.status || 'PENDENTE', duplicado: true };
            }
            const mensagens = { 401: 'Sessão inválida. Entre novamente.', 403: 'Usuário sem permissão.', 413: 'Fotos ou requisição acima do limite.', 429: 'Muitas tentativas. Aguarde e tente novamente.', 500: 'Erro interno do servidor.', 503: 'Serviço temporariamente indisponível.' };
            const textoBase = (detalhe && (detalhe.erro || detalhe.mensagem || detalhe.message)) || mensagens[r.status] || msg;
            const pendencias = Array.isArray(detalhe?.pendencias) ? detalhe.pendencias.filter(Boolean) : [];
            const err = new Error(pendencias.length ? textoBase + ' Pendências: ' + pendencias.join(' | ') : textoBase);
            err.status = r.status;
            err.detalhe = detalhe;
            throw err;
        }
        return r.json();
    },
    async login(login, senha) {
        if (CONFIG.MODO_TESTE_LOCAL)
            return null;
        const r = await this._req('POST', '/login', {
            login,
            pin: senha
        });
        if (r && r.ok) {
            _token = r.token;
            _expiraSessao = r.expiraEm;
            _loginSessao = String(r.motorista.login || login || '').trim().toLowerCase();
            return {
                sucesso: true,
                token: r.token,
                motorista: {
                    id: r.motorista.id || 'teste',
                    nome: r.motorista.nome || 'MOTORISTA TESTE',
                    login: r.motorista.login || login,
                    perfil: (r.motorista.perfil || 'motorista').toLowerCase(),
                    perfis: Array.isArray(r.motorista.perfis) ? r.motorista.perfis : undefined,
                    permissoes: Array.isArray(r.motorista.permissoes) ? r.motorista.permissoes : undefined,
                    permissoesDefinidas: Array.isArray(r.motorista.permissoes),
                    areasAcesso: Array.isArray(r.motorista.areasAcesso) ? r.motorista.areasAcesso : [],
                    subtelasAcesso: Array.isArray(r.motorista.subtelasAcesso) ? r.motorista.subtelasAcesso : [],
                    acessosPerfilDefinidos: Array.isArray(r.motorista.areasAcesso) && Array.isArray(r.motorista.subtelasAcesso),
                    nivelAcesso: r.motorista.nivelAcesso || 'SOMENTE_VISUALIZAR',
                    tipoFrotaAcesso: r.motorista.tipoFrotaAcesso || '',
                    veiculoPadrao: r.motorista.veiculoPadrao || '',
                    acessos: r.motorista.acessos || {},
                    perms: r.motorista.perms || {
                        cargas: false,
                        premiacao: false,
                        checklist: false,
                        sinistros: false,
                        agendamentos: false
                    }
                }
            };
        }
        return {
            sucesso: false,
            erro: r?.erro || 'Login ou PIN inválido.'
        };
    },
    sair() {
        this.limparCache();
        const token = _token;
        if (token) {
            void fetch(CONFIG.API_URL + '/logout', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + token },
                keepalive: true
            }).catch(() => {});
        }
        _token = null; _loginSessao = null; _expiraSessao = null; try { sessionStorage.removeItem('bocchi.portal.sessao'); } catch {} },
    enviarChecklist(registro) {
        if (CONFIG.MODO_TESTE_LOCAL) {
            // Simula o servidor com prefixo DEMO, sem confundir com protocolos reais
            return new Promise(res => setTimeout(() => {
                const d = new Date();
                const dt = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
                res({ sucesso: true, protocolo: 'DEMO-' + dt + '-' + String(Math.floor(Math.random() * 9000) + 1000),
                    dataHoraRecebimento: agoraISO(), status: 'RECEBIDO' });
            }, 700));
        }
        return this._req('POST', '/checklists', registro);
    },
    consultarMeusChecklists() { return this._req('GET', '/checklists/me'); },
    consultarChecklist(protocolo) { return this._req('GET', '/checklists/' + encodeURIComponent(protocolo)); },
    reenviarChecklist(registro) { return this.enviarChecklist(registro); }, // mesmo idLocal = idempotente
    obterConfiguracoes() { return this._req('GET', '/configuracoes'); },
    obterMotoristas() { return this._req('GET', '/motoristas'); },
    obterVeiculos() { return this._req('GET', '/veiculos'); },
    obterCargas(competencia = '', ateCompetencia = '') {
        const q = new URLSearchParams();
        if (competencia)
            q.set('competencia', competencia);
        if (ateCompetencia && ateCompetencia !== competencia)
            q.set('ateCompetencia', ateCompetencia);
        return this._req('GET', '/cargas/me' + (q.toString() ? '?' + q.toString() : ''));
    },
    obterMinhasContestacoes() { return this._req('GET', '/contestacoes/me'); },
    obterOpcoesContestacao(cargaId) {
        return this._req('GET', '/contestacoes/opcoes?cargaId=' + encodeURIComponent(cargaId));
    },
    criarContestacao(cargaId, tipoContestacao, motivoMotorista) {
        return this._req('POST', '/contestacoes', { cargaId, tipoContestacao, motivoMotorista });
    },
    admListarContestacoes(status = '') {
        const q = status && status !== 'todas' ? '?status=' + encodeURIComponent(status) : '';
        return this._req('GET', '/admin/contestacoes' + q);
    },
    admAnalisarContestacao(id, status, justificativaAnalise) {
        return this._req('PATCH', '/admin/contestacoes/' + encodeURIComponent(id) + '/status', { status, justificativaAnalise });
    },
    criarSinistro(dados) { return this._req('POST', '/sinistros', dados); },
    async obterMeusSinistros() {
        const resposta = await this._req('GET', '/sinistros/me');
        return { ...resposta, sinistros: (resposta.sinistros || []).map(s =>
            /^[1-9]\d*$/.test(String(s.id)) ? { ...s, numeroSinistro: 'SIN-' + String(s.id).padStart(4, '0') } : s) };
    },
    obterSinistro(id) { return this._req('GET', '/sinistros/' + encodeURIComponent(id)); },
    async enviarArquivoDocumentoSinistro(id, documentoId, arquivo) {
        const headers = { Authorization: 'Bearer ' + (_token || ''), 'X-File-Name': encodeURIComponent(arquivo.nome || 'arquivo'), 'X-File-Type': arquivo.tipo || 'application/octet-stream', 'X-File-Size': String(arquivo.tamanho || arquivo.blob?.size || 0), 'X-File-Key': encodeURIComponent(arquivo.chave || '') };
        const r = await fetchComTimeout(CONFIG.API_URL + '/sinistros/' + encodeURIComponent(id) + '/documentos/' + encodeURIComponent(documentoId) + '/arquivo', { method: 'POST', headers, body: arquivo.blob }, CONFIG.TIMEOUT_MS);
        if (!r.ok) {
            let d = {};
            try {
                d = await r.json();
            }
            catch { }
            ;
            const e = new Error(d.erro || d.mensagem || ('Erro ' + r.status));
            e.status = r.status;
            throw e;
        }
        return r.json();
    },
    finalizarDocumentoSinistro(id, documentoId, dados) { return this._req('POST', '/sinistros/' + encodeURIComponent(id) + '/documentos/' + encodeURIComponent(documentoId) + '/finalizar', dados); },
    enviarDocumentoSinistro(id, documentoId, dados) { return this._req('POST', '/sinistros/' + encodeURIComponent(id) + '/documentos/' + encodeURIComponent(documentoId) + '/enviar', dados); },
    obterContatoSinistros() { return this._req('GET', '/sinistros/configuracoes-contato'); },
    admListarSinistros() { return this._req('GET', '/admin/sinistros'); },
    admObterSinistro(id) { return this._req('GET', '/admin/sinistros/' + encodeURIComponent(id)); },
    admAtualizarSinistro(id, dados) { return this._req('PATCH', '/admin/sinistros/' + encodeURIComponent(id), dados); },
    admAnalisarDocumentoSinistro(id, documentoId, statusDocumento, motivoRejeicao = '') { return this._req('PATCH', '/admin/sinistros/' + encodeURIComponent(id) + '/documentos/' + encodeURIComponent(documentoId), { statusDocumento, motivoRejeicao }); },
    admObterConfiguracoesSinistros() { return this._req('GET', '/admin/sinistros/configuracoes'); },
    admSalvarConfiguracoesSinistros(dados) { return this._req('PATCH', '/admin/sinistros/configuracoes', dados); },
    obterAgendamentos(de = '', ate = '') { const q = new URLSearchParams(); if (de)
        q.set('de', de); if (ate)
        q.set('ate', ate); return this._req('GET', '/agendamentos/bootstrap' + (q.toString() ? '?' + q.toString() : '')); },
    criarAgendamento(d) { return this._req('POST', '/agendamentos', d); },
    alterarAgendamento(id, d) { return this._req('PATCH', '/agendamentos/' + encodeURIComponent(id), d); },
    cancelarAgendamento(id, motivo, observacao = '') { return this._req('POST', '/agendamentos/' + encodeURIComponent(id) + '/cancelar', { motivo, observacao }); },
    retirarAgendamento(id, d) { return this._req('POST', '/agendamentos/' + encodeURIComponent(id) + '/retirar', d); },
    finalizarAgendamento(id, d) { return this._req('POST', '/agendamentos/' + encodeURIComponent(id) + '/finalizar', d); },
    contextoChecklistAgendamento(placa) { return this._req('GET', '/agendamentos/checklist-contexto?placa=' + encodeURIComponent(placa)); },
    contextoAgendamentoAtual() { return this._req('GET', '/agendamentos/contexto-atual'); },
    admAgendamentos(de = '', ate = '') { const q = new URLSearchParams(); if (de)
        q.set('de', de); if (ate)
        q.set('ate', ate); return this._req('GET', '/admin/agendamentos' + (q.toString() ? '?' + q.toString() : '')); },
    admCorrigirKmAgendamento(id, d) { return this._req('POST', '/admin/agendamentos/' + encodeURIComponent(id) + '/corrigir-km', d); },
    salvarParametrosAgendamento(d) { return this._req('PATCH', '/admin/agendamentos/parametros', d); },
    obterPremiacao() { return this._req('GET', '/premiacao/me'); },
    obterPremiacaoMotorista(nome, competencias = []) {
        const q = new URLSearchParams({ motoristaNome: nome });
        if (Array.isArray(competencias) && competencias.length)
            q.set('competencias', competencias.join(','));
        return this._req('GET', '/premiacao/me?' + q.toString());
    },
    obterApuracoesSalvas(competencia = '', motoristaId = '', opcoes = {}) {
        const q = new URLSearchParams();
        if (competencia)
            q.set('competencia', competencia);
        if (motoristaId)
            q.set('motoristaId', motoristaId);
        if (opcoes?.somenteSalvas === true)
            q.set('somenteSalvas', '1');
        return this._req('GET', '/admin/apuracoes' + (q.toString() ? '?' + q.toString() : ''));
    },
    salvarApuracoes(motoristaId, apuracoes, origem = 'PAINEL_MENSAL') {
        return this._req('POST', '/admin/apuracoes/salvar', { motoristaId, apuracoes, origem });
    },
    alterarStatusApuracao(itemId, status) {
        return this._req('POST', '/admin/apuracoes/status', { itemId, status });
    },
    alterarStatusQuadrimestre(ano, quadrimestre, acao, motoristaId = '') {
        return this._req('POST', '/admin/apuracoes/quadrimestre/status', { ano, quadrimestre, acao, motoristaId });
    },
    admPremiacaoMetas() {
        return this._req('GET', '/admin/premiacao/metas');
    },
    admPremiacaoDescontos(competencia = '') {
        const q = competencia ? '?competencia=' + encodeURIComponent(competencia) : '';
        return this._req('GET', '/admin/premiacao/descontos' + q);
    },
    salvarMeta(d) { return this._req('POST', '/admin/premiacao/metas/salvar', d); },
    salvarDesconto(d) { return this._req('POST', '/admin/premiacao/descontos/salvar', d); },
    importarCargas(competencia, cargas) { return this._req('POST', '/admin/cargas/importar', { competencia, cargas }); },
    admCadastros() { return this._req('GET', '/admin/cadastros'); },
    salvarUsuario(d) { return this._req('POST', '/admin/usuarios/salvar', d); },
    salvarTipoVeiculo(d) { return this._req('POST', '/admin/tipos-veiculo/salvar', d); },
    salvarVeiculo(d) { return this._req('POST', '/admin/veiculos/salvar', d); },
    salvarVinculo(d) { return this._req('POST', '/admin/vinculos/salvar', d); },
    salvarPerfil(d) { return this._req('POST', '/admin/perfis/salvar', d); },
    // Painel administrativo (a API valida o perfil pelo token)
    admListarChecklists(filtros) {
        const q = filtros ? '?' + new URLSearchParams(filtros).toString() : '';
        return this._req('GET', '/admin/checklists' + q);
    },
    admDetalhe(protocolo) { return this._req('GET', '/admin/checklists/' + encodeURIComponent(protocolo)); },
    admStatus(protocolo, status, motivo, opcoes = {}) { return this._req('PATCH', '/admin/checklists/' + encodeURIComponent(protocolo) + '/status', { status, motivo, bloquearVeiculo: opcoes.bloquearVeiculo === true, motivoBloqueio: opcoes.motivoBloqueio || '' }); },
    admVeiculosBloqueados() { return this._req('GET', '/admin/veiculos/bloqueados'); },
    admLiberarVeiculo(itemId, observacao = '') { return this._req('PATCH', '/admin/veiculos/' + encodeURIComponent(itemId) + '/liberar', { observacao }); },
    admObservacao(protocolo, observacao) {
        return this._req('POST', '/admin/checklists/' + encodeURIComponent(protocolo) + '/observacao', { observacao });
    },
    obterPerguntas(tipoFrota = 'TODAS', opcoes = {}) {
        const tipo = String(tipoFrota || 'TODAS').toUpperCase();
        const q = new URLSearchParams({ tipoFrota: tipo });
        if (opcoes.placa)
            q.set('placa', opcoes.placa);
        if (opcoes.incluirInativas)
            q.set('incluirInativas', '1');
        if (opcoes.ignorarFrequencia)
            q.set('ignorarFrequencia', '1');
        return this._req('GET', '/perguntas?' + q.toString());
    },
    criarPergunta(dados) {
        return this._req('POST', '/perguntas', dados);
    },
    atualizarPergunta(id, dados) {
        return this._req('PATCH', '/perguntas/' + encodeURIComponent(id), dados);
    }
};
const aguardar = ms => new Promise(resolve => setTimeout(resolve, ms));
function erroTemporarioDaApi(error) {
    const status = Number(error?.status || 0);
    const texto = String(error?.message || '') + ' ' + JSON.stringify(error?.detalhe || {});
    const falhaRede = /failed to fetch|network|fetch|aborterror|timeout|tempo limite/i.test(texto);
    return falhaRede || ([408, 425, 429, 500, 502, 503, 504].includes(status) &&
        (status !== 500 || /429|throttl|temporari|limite|muitas tentativas/i.test(texto)));
}
async function executarComRetentativa(operacao, maxTentativas = 4) {
    let ultimoErro;
    for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
        try {
            return await operacao();
        }
        catch (error) {
            ultimoErro = error;
            if (!erroTemporarioDaApi(error) || tentativa === maxTentativas)
                throw error;
            await aguardar(Math.min(30000, 4000 * Math.pow(2, tentativa - 1)));
        }
    }
    throw ultimoErro;
}
/* ============================================================================
   FILA DE ENVIO — tratamento de conexão instável
   O checklist é gravado no IndexedDB ANTES da tentativa de envio.
   Só é marcado como ENVIADO com confirmação real da API (protocolo).
   O mesmo idLocal é mantido em todas as tentativas (idempotência).
   ========================================================================== */
const FilaEnvio = {
    _processando: false,
    ouvintes: new Set(),
    _notificar() { this.ouvintes.forEach(f => { try {
        f();
    }
    catch (e) { } }); },
    validar(registro) {
        const faltando = [];
        if (!String(registro?.idLocal || '').trim())
            faltando.push('identificador');
        if (!String(registro?.motorista?.nome || '').trim())
            faltando.push('motorista');
        if (!String(registro?.motorista?.login || '').trim())
            faltando.push('login');
        if (!String(registro?.veiculo?.placa || '').trim())
            faltando.push('placa');
        if (!Array.isArray(registro?.respostas) || !registro.respostas.length)
            faltando.push('respostas');
        return faltando;
    },
    _loginDono(registro) {
        return String(registro?.donoLogin || registro?.motorista?.login || '').trim().toLowerCase();
    },
    async adicionar(registro) {
        const faltando = this.validar(registro);
        if (faltando.length)
            throw new Error('Não foi possível salvar: faltam ' + faltando.join(', ') + '.');
        // Vincula definitivamente o registro ao usuário que o criou neste aparelho.
        // Isso impede que outro motorista veja ou envie a fila após uma troca de login.
        registro.donoLogin = this._loginDono(registro);
        registro.statusEnvio = 'PENDENTE';
        registro.tentativas = 0;
        await IDB.salvarFila(registro);
        this._notificar();
    },
    async pendentes(loginDono) {
        const todos = await IDB.listarFila();
        const login = String(loginDono || '').trim().toLowerCase();
        if (!login)
            return [];
        return todos.filter(x => x.statusEnvio !== 'ENVIADO' && this._loginDono(x) === login);
    },
    async sanear(loginDono) {
        const login = String(loginDono || '').trim().toLowerCase();
        if (!login)
            return { removidos: 0 };
        const todos = await IDB.listarFila();
        let removidos = 0;
        for (const item of todos) {
            if (this._loginDono(item) !== login)
                continue;
            const irrecuperavel = this.validar(item).length > 0 || item.statusEnvio === 'DADOS_INCOMPLETOS';
            if (irrecuperavel) {
                await IDB.removerFila(item.idLocal);
                removidos++;
            }
        }
        if (removidos)
            this._notificar();
        return { removidos };
    },
    async processar(toast, loginDono) {
        const login = String(loginDono || '').trim().toLowerCase();
        if (!login)
            return;
        // Um temporizador de uma sessão anterior pode disparar depois da troca de
        // motorista. Nesse caso ele é encerrado sem acessar nem enviar o registro.
        if (!CONFIG.MODO_TESTE_LOCAL && ApiService.loginAtual !== login)
            return;
        if (this._processando)
            return; // evita tentativas simultâneas
        this._processando = true;
        try {
            const fila = await this.pendentes(login);
            for (const item of fila) {
                const faltando = this.validar(item);
                if (faltando.length) {
                    item.statusEnvio = 'DADOS_INCOMPLETOS';
                    item.ultimoErro = 'Registro antigo incompleto: faltam ' + faltando.join(', ') + '. Exclua e refaça o checklist.';
                    await IDB.salvarFila(item);
                    this._notificar();
                    continue;
                }
                item.statusEnvio = 'ENVIANDO';
                await IDB.salvarFila(item);
                this._notificar();
                try {
                    const resp = await ApiService.enviarChecklist(item);
                    if (resp && resp.sucesso === true && resp.protocolo) {
                        item.statusEnvio = 'ENVIADO';
                        item.protocolo = resp.protocolo;
                        item.dataHoraRecebimento = resp.dataHoraRecebimento;
                        await IDB.salvarFila(item);
                        if (toast)
                            toast('Checklist enviado. Protocolo: ' + resp.protocolo);
                    }
                    else {
                        throw new Error((resp && resp.mensagem) || 'Resposta inválida da API');
                    }
                }
                catch (e) {
                    item.tentativas = (item.tentativas || 0) + 1;
                    item.ultimoErro = e.message;
                    item.statusEnvio = item.tentativas >= CONFIG.MAX_TENTATIVAS ? 'ERRO' : 'PENDENTE';
                    await IDB.salvarFila(item);
                    // Agenda nova tentativa com intervalo crescente
                    if (item.statusEnvio === 'PENDENTE') {
                        const delay = CONFIG.RETRY_DELAYS_MS[Math.min(item.tentativas, CONFIG.RETRY_DELAYS_MS.length - 1)];
                        setTimeout(() => this.processar(toast, login), delay);
                    }
                }
                this._notificar();
            }
        }
        finally {
            this._processando = false;
        }
    }
};
// O reenvio automático é registrado dentro da tela do motorista, onde o login
// atual está disponível. Nunca processar uma fila sem identificar o proprietário.
/* ================= DADOS / HELPERS ================= */
const MESES_2026 = ['01/2026', '02/2026', '03/2026', '04/2026', '05/2026', '06/2026', '07/2026', '08/2026', '09/2026', '10/2026', '11/2026', '12/2026'];
const NOME_MES = { '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr', '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago', '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez' };
const QUADS = [
    { id: 1, nome: '1° Quadrimestre', meses: ['01/2026', '02/2026', '03/2026', '04/2026'], pgto: 'até o 5° dia útil de maio/2026' },
    { id: 2, nome: '2° Quadrimestre', meses: ['05/2026', '06/2026', '07/2026', '08/2026'], pgto: 'até o 5° dia útil de setembro/2026' },
    { id: 3, nome: '3° Quadrimestre', meses: ['09/2026', '10/2026', '11/2026', '12/2026'], pgto: 'até o 5° dia útil de janeiro/2027' },
];
const HOJE = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());
const MES_ATUAL = HOJE.slice(5, 7) + '/' + HOJE.slice(0, 4);
const mesesAteHoje = () => MESES_2026.filter(m => m.slice(3) < HOJE.slice(0, 4) || (m.slice(3) === HOJE.slice(0, 4) && m.slice(0, 2) <= HOJE.slice(5, 7)));
const brl = v => (v == null || isNaN(v)) ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brn = (v, d = 2) => (v == null || isNaN(v)) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const mesLabel = m => NOME_MES[m.slice(0, 2)] + '/' + m.slice(5);
const dataBR = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '—';
const mesDaData = d => d.slice(5, 7) + '/' + d.slice(0, 4);
const primeiroNome = n => { const p = n.split(' '); return p[0].charAt(0) + p[0].slice(1).toLowerCase() + (p[1] ? ' ' + p[1].charAt(0) + p[1].slice(1).toLowerCase() : ''); };
const chaveTipo = v => String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[º°]/g, 'O')
    .trim()
    .toUpperCase();
function estadoInicial() {
    return {
        usuarios: [],
        frota: {},
        cargas: [],
        descontos: [],
        resumos: [],
        metas: [],
        perguntas: [],
        checklists: [],
        contestacoes: []
    };
}
/* Régua da política POL 4.1.1 */
function calcProdutividade(fat, meta) {
    if (!meta || !fat || fat < meta.start)
        return 0;
    if (fat < meta.meta)
        return meta.pctStart / 100 * (fat - meta.start);
    return Math.min(meta.valorMeta + meta.pctMeta / 100 * (fat - meta.meta), meta.teto);
}
function metaDoTipo(metas, tipo, mes) {
    // mes 'MM/AAAA' -> usa vigência
    const ref = mes ? mes.slice(3) + '-' + mes.slice(0, 2) + '-15' : '2026-06-15';
    const tipoBusca = chaveTipo(tipo);
    return metas.find(m => chaveTipo(m.tipo) === tipoBusca && m.vigIni <= ref && m.vigFim >= ref) ||
        metas.find(m => chaveTipo(m.tipo) === tipoBusca);
}
/* Faturamento por motorista/mês: resumos (jan–abr) + cargas detalhadas (mai em diante) */
function usarDadosMensais(st) {
    return useMemo(() => {
        const map = {}; // mot -> mes -> {fat,n,peso,detalhe:boolean}
        st.resumos.forEach(r => {
            map[r.m] = map[r.m] || {};
            map[r.m][r.mes] = { fat: r.fat, n: r.n, peso: r.peso, detalhe: false };
        });
        st.cargas.forEach(c => {
            const mes = mesDaData(c.data);
            map[c.motorista] = map[c.motorista] || {};
            const cur = map[c.motorista][mes] || { fat: 0, n: 0, peso: 0, detalhe: true };
            cur.fat += c.valor;
            cur.n += 1;
            cur.peso += c.peso;
            cur.detalhe = true;
            map[c.motorista][mes] = cur;
        });
        return map;
    }, [st.resumos, st.cargas]);
}
function apuracaoMes(st, dados, motNome, mes) {
    const calculada = (st.apuracoes || []).find(a => a.mes === mes &&
        (!a.motoristaNome || normalizar(a.motoristaNome) === normalizar(motNome)));
    if (calculada) {
        return {
            fat: Number(calculada.faturamento ?? calculada.realizadoInformado ?? calculada.realizado ?? 0),
            realizadoElegivel: Number(calculada.realizadoElegivel ?? calculada.realizado ?? 0),
            prod: Number(calculada.premioBruto || 0),
            descs: Array.isArray(calculada.descontos) ? calculada.descontos : [],
            totDesc: Number(calculada.totalDescontos || 0),
            apurado: Number(calculada.apurado || 0),
            meta: calculada.meta || null,
            tipo: String(calculada.tipoVeiculo || ""),
            temDados: Number(calculada.quantidadeCargas || 0) > 0,
            nCargas: Number(calculada.quantidadeCargas || 0),
            peso: Number(calculada.pesoTon || 0),
            detalhe: true,
            detalhesVigencia: Array.isArray(calculada.detalhesVigencia) ? calculada.detalhesVigencia : [],
            inconsistencias: Array.isArray(calculada.inconsistencias) ? calculada.inconsistencias : [],
            nCargasValidas: Number(calculada.quantidadeCargasValidas || 0)
        };
    }
    const u = st.usuarios.find(x => x.nome === motNome);
    const placa = Object.values(st.frota).find(f => f.motorista === motNome && f.frota !== 'leve');
    const cargaComTipo = [...st.cargas].reverse().find(c => c.motorista === motNome && c.tipoVeiculo);
    const tipo = cargaComTipo ? cargaComTipo.tipoVeiculo : (placa ? placa.tipo : null);
    const meta = tipo ? metaDoTipo(st.metas, tipo, mes) : null;
    const d = (dados[motNome] || {})[mes];
    const fat = d ? d.fat : 0;
    const prod = calcProdutividade(fat, meta);
    const descs = st.descontos.filter(x => x.motorista === motNome && x.mes === mes);
    const totDesc = descs.reduce((s, x) => s + x.valor, 0);
    return { fat, prod, descs, totDesc, apurado: prod + totDesc, meta, tipo, temDados: !!d, nCargas: d ? d.n : 0, peso: d ? d.peso : 0, detalhe: d ? d.detalhe : false };
}
function apuracaoSalvaParaTela(item, motoristaNome = '') {
    const competencia = String(item?.competencia || '');
    return {
        ...item,
        mes: competenciaValidaTela(competencia)
            ? competencia.slice(5, 7) + '/' + competencia.slice(0, 4)
            : '',
        motoristaNome,
        tipoVeiculo: String(item?.tipoVeiculo || ''),
        premioBruto: Number(item?.valorMeta || 0),
        totalDescontos: Number(item?.valorDescontos || 0),
        apurado: Number(item?.apuradoMes || 0),
        descontos: [],
        meta: null,
        quantidadeCargas: 0,
        pesoTon: 0,
        faturamento: 0,
        origemSalva: true,
        status: String(item?.status || 'PENDENTE'),
        atualizadoEm: String(item?.atualizadoEm || ''),
        cargasAlteradasEm: String(item?.cargasAlteradasEm || ''),
        desatualizada: item?.desatualizada === true
    };
}
function competenciaValidaTela(valor) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(valor || ''));
}
/* ================= COMPONENTES BASE ================= */
function Toast({ msg }) { return msg ? React.createElement("div", { className: "toast" }, msg) : null; }
function Modal({ titulo, onClose, children, large = false }) {
    return (React.createElement("div", { className: "overlay" },
        React.createElement("div", { className: 'modal' + (large ? ' modal-lg' : '') },
            React.createElement("div", { className: "row", style: { marginBottom: 8 } },
                React.createElement("h3", { className: "grow" }, titulo),
                React.createElement("button", { className: "btn btn-g btn-sm", onClick: onClose }, "Fechar")),
            children)));
}
function StatusTag({ s }) {
    const statusBruto = String(s || '').trim().toLowerCase();
    const status = statusBruto.startsWith('procede') ? 'procede' :
        statusBruto.startsWith('nao_procede') || statusBruto.startsWith('não procede') ? 'nao_procede' :
            statusBruto;
    const m = { pendente: ['tag-pend', 'Pendente'], aprovado: ['tag-ok', 'Aprovado'], reprovado: ['tag-neg', 'Reprovado'],
        procede: ['tag-ok', 'Procede'], nao_procede: ['tag-neutro', 'Não procede'], corrigida: ['tag-ok', 'Corrigida'] };
    const [cls, txt] = m[status] || ['tag-neutro', String(s || '')];
    return React.createElement("span", { className: 'tag ' + cls }, txt);
}
const TIPOS_DOCUMENTOS_SINISTRO = [
    'CNH - Motorista da frota', 'CNH - Condutor terceiro', 'CRLV - Veículo da frota', 'CRLV - Veículo terceiro',
    'Fotos - Veículo da frota', 'Fotos - Veículo terceiro', 'Fotos - Local do sinistro', 'Boletim de ocorrência', 'Outro'
];
const SINISTRO_STATUS_ROTULOS = {
    ABERTO: 'Aberto', AGUARDANDO_ANALISE: 'Aguardando análise', EM_ATENDIMENTO: 'Em atendimento', AGUARDANDO_DOCUMENTOS: 'Aguardando documentos',
    ENCAMINHADO_SEGURADORA: 'Encaminhado à seguradora', AGUARDANDO_ORCAMENTO: 'Aguardando orçamento', EM_REPARO: 'Em reparo',
    AGUARDANDO_TERCEIRO: 'Aguardando terceiro', CONCLUIDO: 'Concluído', CANCELADO: 'Cancelado'
};
function SinistroStatusTag({ s }) {
    const chave = normalizarPerfil(s);
    return React.createElement("span", { className: 'sinistro-status sinistro-status-' + chave }, SINISTRO_STATUS_ROTULOS[chave] || String(s || ''));
}
function DocumentoStatusTag({ s }) {
    const chave = normalizarPerfil(s);
    return React.createElement("span", { className: 'sinistro-status sinistro-doc-status-' + chave }, String(s || ''));
}
function historicoSinistroApresentacao(h) {
    if (h?.acaoExibicao || h?.tipoEvento) {
        return {
            tipoEvento: h.tipoEvento || 'STATUS',
            acao: h.acaoExibicao || h.acao || 'Atualização',
            observacao: h.observacaoExibicao !== undefined ? h.observacaoExibicao : (h.observacao || ''),
            statusEvento: h.statusEvento || '',
            exibirStatusSinistro: h.exibirStatusSinistro !== false
        };
    }
    const obs = String(h?.observacao || '').trim();
    const acao = String(h?.acao || '').trim();
    if (acao === 'ANDAMENTO') {
        const status = h.statusSinistro || h.status || '';
        const detalhes = [
            status && ('Situação registrada: ' + (SINISTRO_STATUS_ROTULOS[normalizarPerfil(status)] || status)),
            h.gravidade && ('Gravidade: ' + h.gravidade),
            obs
        ].filter(Boolean);
        return { tipoEvento: 'STATUS', acao: 'Atualização do sinistro', observacao: detalhes.join(' · ') || 'Detalhes indisponíveis neste registro.', statusEvento: '', exibirStatusSinistro: false };
    }
    const tirar = prefixo => obs.replace(new RegExp('^' + prefixo + '\\s*:\\s*', 'i'), '').trim();
    if (/^Documento reenviado\s*:/i.test(obs))
        return { tipoEvento: 'DOCUMENTO_REENVIADO', acao: 'Documento reenviado', observacao: tirar('Documento reenviado'), statusEvento: 'Enviado', exibirStatusSinistro: false };
    if (/^Documento enviado\s*:/i.test(obs))
        return { tipoEvento: 'DOCUMENTO_ENVIADO', acao: 'Documento enviado', observacao: tirar('Documento enviado'), statusEvento: 'Enviado', exibirStatusSinistro: false };
    if (/^Documento aceito\s*:/i.test(obs))
        return { tipoEvento: 'DOCUMENTO_ACEITO', acao: 'Documento aceito', observacao: tirar('Documento aceito'), statusEvento: 'Aceito', exibirStatusSinistro: false };
    if (/^Documento rejeitado\s*:/i.test(obs))
        return { tipoEvento: 'DOCUMENTO_REJEITADO', acao: 'Documento rejeitado', observacao: tirar('Documento rejeitado'), statusEvento: 'Rejeitado', exibirStatusSinistro: false };
    if (/^Documento dispensado\s*:/i.test(obs))
        return { tipoEvento: 'DOCUMENTO_DISPENSADO', acao: 'Documento dispensado', observacao: tirar('Documento dispensado'), statusEvento: 'Dispensado', exibirStatusSinistro: false };
    const marcador = 'Documentos solicitados:';
    const pos = obs.toLocaleLowerCase('pt-BR').indexOf(marcador.toLocaleLowerCase('pt-BR'));
    if (pos >= 0) {
        const antes = obs.slice(0, pos).trim().replace(/[.\s]+$/g, '');
        const docs = obs.slice(pos + marcador.length).trim();
        return { tipoEvento: 'DOCUMENTOS_SOLICITADOS', acao: 'Documentos solicitados', observacao: [antes, docs].filter(Boolean).join(antes && docs ? ' — ' : ''), statusEvento: 'Pendente de envio', exibirStatusSinistro: false };
    }
    if (normalizar(acao) === normalizar('E-mail enviado'))
        return { tipoEvento: 'EMAIL_ENVIADO', acao: 'E-mail enviado', observacao: obs, statusEvento: 'Enviado', exibirStatusSinistro: false };
    return { tipoEvento: 'STATUS', acao: acao || 'Atualização', observacao: obs, statusEvento: '', exibirStatusSinistro: true };
}
function HistoricoSinistroTag({ h }) {
    const p = historicoSinistroApresentacao(h);
    if (p.tipoEvento === 'DOCUMENTOS_SOLICITADOS')
        return React.createElement(DocumentoStatusTag, { s: "Pendente de envio" });
    if (['DOCUMENTO_ENVIADO', 'DOCUMENTO_REENVIADO'].includes(p.tipoEvento))
        return React.createElement(DocumentoStatusTag, { s: "Enviado" });
    if (p.tipoEvento === 'DOCUMENTO_ACEITO')
        return React.createElement(DocumentoStatusTag, { s: "Aceito" });
    if (p.tipoEvento === 'DOCUMENTO_REJEITADO')
        return React.createElement(DocumentoStatusTag, { s: "Rejeitado" });
    if (p.tipoEvento === 'DOCUMENTO_DISPENSADO')
        return React.createElement(DocumentoStatusTag, { s: "Dispensado" });
    if (p.exibirStatusSinistro)
        return React.createElement(SinistroStatusTag, { s: h.status });
    return null;
}
function dataHoraBRSinistro(valor) {
    if (!valor)
        return '—';
    const d = new Date(valor);
    if (!Number.isFinite(d.getTime()))
        return String(valor || '');
    return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function arquivoSinistroEhImagem(a) {
    const tipo = String(a?.mimeType || '').toLowerCase();
    const nome = String(a?.nome || '').toLowerCase();
    return tipo.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp|heic|heif)$/i.test(nome);
}
function extensaoArquivoSinistro(nome) {
    const m = String(nome || '').match(/\.([a-z0-9]{1,6})$/i);
    return m ? m[1].toUpperCase() : 'ARQ';
}
function GaleriaArquivosSinistro({ arquivos = [] }) {
    const [aberto, setAberto] = useState(null);
    const lista = Array.isArray(arquivos) ? arquivos : [];
    if (!lista.length)
        return null;
    return React.createElement(React.Fragment, null,
        React.createElement("div", { className: "sinistro-galeria" }, lista.map((a, i) => {
            const imagem = arquivoSinistroEhImagem(a);
            const url = a.downloadUrl || a.webUrl || '';
            const rotulo = (imagem ? 'Foto ' : 'Documento ') + (i + 1);
            return imagem ?
                React.createElement("button", { type: "button", className: "sinistro-galeria-item", key: a.id || a.nome || i, onClick: () => setAberto({ url, rotulo, webUrl: a.webUrl || url }), title: rotulo },
                    React.createElement("img", { className: "sinistro-galeria-foto", src: url, alt: rotulo, loading: "lazy" }),
                    React.createElement("span", { className: "sinistro-galeria-legenda" }, rotulo)) :
                React.createElement("a", { className: "sinistro-galeria-item sinistro-galeria-doc", key: a.id || a.nome || i, href: a.webUrl || url, target: "_blank", rel: "noopener", title: rotulo },
                    React.createElement("span", { className: "icone" }, "\uD83D\uDCC4"),
                    React.createElement("b", null, rotulo),
                    React.createElement("span", { className: "ext" }, extensaoArquivoSinistro(a.nome)));
        })),
        aberto && React.createElement("div", { className: "visualizador-foto", onClick: e => { if (e.target === e.currentTarget)
                setAberto(null); } },
            React.createElement("img", { src: aberto.url, alt: aberto.rotulo }),
            React.createElement("div", { className: "visualizador-foto-acoes" },
                React.createElement("a", { className: "btn btn-s", href: aberto.webUrl || aberto.url, target: "_blank", rel: "noopener" }, "Abrir original"),
                React.createElement("button", { className: "btn btn-g", onClick: () => setAberto(null) }, "Fechar"))));
}
function resumoDocumentosSinistroCliente(s) {
    if (s?.documentosResumo)
        return s.documentosResumo;
    const docs = (s?.solicitacoesDocumentos || []).filter(d => d.ativo !== false);
    const contar = rotulo => docs.filter(d => normalizarPerfil(d.statusDocumento) === normalizarPerfil(rotulo)).length;
    return { totalAtivos: docs.length, pendentesEnvio: contar('Pendente de envio') + contar('Pendente'), enviados: contar('Enviado'), aceitos: contar('Aceito'), rejeitados: contar('Rejeitado'), dispensados: contar('Dispensado') };
}
function situacaoMotoristaSinistro(s) {
    const status = normalizarPerfil(s?.statusSinistro);
    const r = resumoDocumentosSinistroCliente(s);
    if (status === 'AGUARDANDO_DOCUMENTOS') {
        if ((r.rejeitados || 0) > 0 || (r.pendentesEnvio || 0) > 0)
            return { chave: 'ACAO_NECESSARIA', rotulo: 'Aguardando documentos', descricao: 'A Logística solicitou documento(s).' };
        if ((r.enviados || 0) > 0)
            return { chave: 'DOCUMENTOS_ENVIADOS', rotulo: 'Entregue à Logística', descricao: 'Aguardando conferência da Logística.' };
        if ((r.totalAtivos || 0) > 0 && (r.aceitos + r.dispensados) >= r.totalAtivos)
            return { chave: 'EM_ATENDIMENTO', rotulo: 'Em atendimento', descricao: 'Documentação regularizada.' };
        return { chave: 'EM_ATENDIMENTO', rotulo: 'Em atendimento', descricao: 'A Logística está tratando o registro.' };
    }
    if (['ABERTO', 'AGUARDANDO_ANALISE'].includes(status))
        return { chave: 'ABERTO', rotulo: 'Aberto', descricao: 'Registro recebido pela Logística.' };
    if (status === 'CONCLUIDO')
        return { chave: 'CONCLUIDO', rotulo: 'Concluído', descricao: 'Tratamento encerrado.' };
    if (status === 'CANCELADO')
        return { chave: 'CANCELADO', rotulo: 'Cancelado', descricao: 'Registro cancelado.' };
    return { chave: 'EM_ATENDIMENTO', rotulo: 'Em atendimento', descricao: 'A Logística está tratando o registro.' };
}
function SituacaoMotoristaSinistroTag({ sinistro }) {
    const st = situacaoMotoristaSinistro(sinistro);
    return React.createElement("span", { className: 'sinistro-status sinistro-status-' + st.chave }, st.rotulo);
}
/* ================= LOGIN ================= */
const LOGO = 'data:image/png;base64,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';
function AvisoPrivacidade({claro=false}){
 const [aberto,setAberto]=useState(false);
 const secoes=[
 ["Sobre este aviso","A Bocchi Frota apoia a rotina de motoristas e equipes autorizadas da Bocchi Agrobios. Este aviso é preliminar e está em revisão. Não representa uma certificação de conformidade com a LGPD."],
 ["Informações utilizadas","Conforme os serviços utilizados, o portal pode tratar nome, identificação interna, contato cadastrado, perfil, vínculos com veículos, placas, reservas, trajetos informados, datas, horários e quilometragem; registros de cargas, premiação e contestações; respostas de checklist, observações, fotos, documentos e comunicações de sinistros."],
 ["Finalidades","Essas informações são utilizadas para organizar o uso dos veículos, registrar inspeções e ocorrências, acompanhar a operação, apurar premiações, tratar contestações e proteger o acesso. A identificação completa da pessoa jurídica responsável e o detalhamento das bases legais por finalidade estão em validação interna."],
 ["Acessos e anexos","As informações são disponibilizadas às equipes conforme suas atribuições e permissões. Fotos e documentos do portal são consultados por rotas autenticadas. Envie apenas arquivos necessários à ocorrência e evite expor dados de terceiros ou informações de saúde sem necessidade."],
 ["Armazenamento e fornecedores","A infraestrutura identificada utiliza Cloudflare Workers, D1 e R2. O aplicativo também guarda rascunhos e checklists na fila de envio do aparelho. Não compartilhe suas credenciais e encerre a sessão em aparelhos compartilhados. Os prazos de guarda, descarte, condições dos fornecedores e eventuais transferências internacionais estão em validação."],
 ["Privacidade e seus direitos","Você pode solicitar esclarecimentos sobre seus dados, acesso, correção e exercer os demais direitos aplicáveis. Pode ser necessário verificar sua identidade para proteger as informações. O canal oficial de privacidade e o responsável pelo atendimento ainda estão em confirmação; enquanto isso, peça à Logística a indicação do setor responsável. O Canal de Denúncias não foi confirmado como canal para essas solicitações."],
 ["Atualizações","Versão preliminar 0.1 — 30/10/2026. Este texto poderá ser atualizado após revisão interna e jurídica. Consulte esta seção para acompanhar as alterações."]
 ];
 return React.createElement(React.Fragment,null,
 React.createElement("button",{type:"button",onClick:()=>setAberto(true),style:{color:claro?"#d7e8dc":"#345e4b",fontSize:11,textDecoration:"underline",padding:"8px 0",textAlign:"center"}},"Privacidade e seus direitos"),
 aberto&&React.createElement(Modal,{titulo:"Aviso de privacidade — Bocchi Frota",large:true,onClose:()=>setAberto(false)},
 React.createElement("div",{className:"aviso-box",style:{marginBottom:18}},"Versão preliminar em revisão. Contato oficial e prazos de guarda ainda serão confirmados."),
 secoes.map(([titulo,texto])=>React.createElement("section",{key:titulo,style:{marginBottom:20}},React.createElement("h3",{style:{fontSize:16,marginBottom:7}},titulo),React.createElement("p",{style:{fontSize:13,lineHeight:1.75,color:"#526052"}},texto))),
 React.createElement("button",{className:"btn btn-p",onClick:()=>setAberto(false)},"Fechar")));
}

function Login({ st, onLogin }) {
    const [login, setLogin] = useState('');
    const [senha, setSenha] = useState('');
    const [erro, setErro] = useState('');
    const [senhaLoginVisivel, setSenhaLoginVisivel] = useState(false);
    /* Em produção, a autenticação é feita pelo endpoint POST /auth/login.
       O token expira no prazo informado pelo servidor. A senha não é gravada.
       O modo local de testes utiliza uma base simulada. */
    const [carregando, setCarregando] = useState(false);
    const entrar = async () => {
        if(carregando)return;
        setErro('');
        if (CONFIG.MODO_TESTE_LOCAL) {
            const u = st.usuarios.find(x => x.login === login.trim().toLowerCase());
            if (!u) {
                setErro('Usuário ou senha incorretos.');
                return;
            }
            onLogin(u);
            return;
        }
        setCarregando(true);
        try {
            const r = await ApiService.login(login.trim().toLowerCase(), senha);
            if (!r || !r.sucesso) {
                setErro('Usuário ou senha incorretos.');
                return;
            }
            onLogin({
                id: 'api' + r.motorista.id,
                nome: r.motorista.nome,
                login: r.motorista.login || login.trim().toLowerCase(),
                perfil: r.motorista.perfil || 'motorista',
                perfis: Array.isArray(r.motorista.perfis) ? r.motorista.perfis : undefined,
                permissoes: Array.isArray(r.motorista.permissoes) ? r.motorista.permissoes : undefined,
                permissoesDefinidas: r.motorista.permissoesDefinidas,
                areasAcesso: Array.isArray(r.motorista.areasAcesso) ? r.motorista.areasAcesso : [],
                subtelasAcesso: Array.isArray(r.motorista.subtelasAcesso) ? r.motorista.subtelasAcesso : [],
                acessosPerfilDefinidos: r.motorista.acessosPerfilDefinidos === true,
                nivelAcesso: r.motorista.nivelAcesso || 'SOMENTE_VISUALIZAR',
                tipoFrotaAcesso: r.motorista.tipoFrotaAcesso || '',
                perms: r.motorista.perms || {
                    cargas: true,
                    premiacao: true,
                    checklist: true
                },
                veiculoPadrao: r.motorista.veiculoPadrao || '',
                acessos: r.motorista.acessos || {}
            });
        }
        catch (e) {
            setErro(e.status ? (e.status === 401 ? 'Usuário ou senha incorretos.' : e.message) : 'Não foi possível conectar ao servidor. Verifique a internet e tente novamente.');
        }
        finally {
            setCarregando(false);
        }
    };
    return (React.createElement("div", { className: "login-wrap bocchi-login" },
        React.createElement("section",{className:"login-apresentacao","aria-label":"Bocchi Frota"},
            React.createElement("a",{className:"login-empresa",href:"https://bocchiagrobios.com.br/",target:"_blank",rel:"noopener noreferrer"},"BOCCHI AGROBIOS"),
            React.createElement("div",{className:"login-mensagem"},
                React.createElement("div",{className:"login-eyebrow"},"BOCCHI FROTA"),
                React.createElement("h1",null,"Quem move a Bocchi merece estar conectado."),
                React.createElement("p",null,"Um espaço para facilitar sua rotina, cuidar dos nossos veículos e aproximar você da empresa. Juntos, seguimos com segurança, parceria e reconhecimento."),
                React.createElement("div",{className:"login-servicos"},["Agendamento de veículos compartilhados","Checklists","Premiação","Sinistros"].map(s=>React.createElement("span",{key:s},s))),
                React.createElement("div",{className:"login-em-breve"},"Em breve: manuais e controle de manutenção.")),
            React.createElement("div",{className:"login-valores"},"Segurança",React.createElement("span",null,"•"),"Parceria",React.createElement("span",null,"•"),"Reconhecimento")),
        React.createElement("div", { className: "login-card" },
            React.createElement("img", { src: LOGO, className: "logo-login", alt: "Bocchi Agrobios" }),
            React.createElement("div",{className:"login-assinatura"},"Você e a Bocchi, no mesmo caminho."),
            React.createElement("h3",{className:"login-boas-vindas"},"Bem-vindo de volta"),
            React.createElement("p",{className:"login-sub"},"Entre com seu usuário e senha para acessar os serviços disponíveis para você."),
            React.createElement("div", { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "login-usuario" }, "Usu\u00E1rio"),
                    React.createElement("input", { id: "login-usuario", name: "username", value: login, onChange: e => setLogin(e.target.value), placeholder: "ex.: adelir", autoComplete: "username", autoCapitalize: "none", spellCheck: false })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "login-senha" }, "Senha"),
                    React.createElement("div", { className: "row", style: { gap: 8 } },
                        React.createElement("input", { id: "login-senha", name: "password", className: "grow", type: senhaLoginVisivel ? 'text' : 'password', value: senha, onChange: e => setSenha(e.target.value), onKeyDown: e => e.key === 'Enter' && entrar(), placeholder: "\u2022\u2022\u2022\u2022", autoComplete: "current-password" }),
                        React.createElement("button", { type: "button", className: "btn btn-s btn-sm", onClick: () => setSenhaLoginVisivel(v => !v), title: senhaLoginVisivel ? 'Ocultar senha' : 'Visualizar senha', "aria-label": senhaLoginVisivel ? 'Ocultar senha' : 'Visualizar senha', style: { minWidth: 72 } }, senhaLoginVisivel ? 'Ocultar' : 'Ver'))),
                erro && React.createElement("div", { className: "erro-box" }, erro),
                React.createElement("button", { className: "btn btn-p", disabled: carregando, onClick: entrar }, carregando ? 'Entrando...' : 'Entrar')),
            React.createElement("p",{className:"login-ajuda"},"Precisa de acesso ou esqueceu sua senha? Fale com a Logística."),
            React.createElement("div",{style:{textAlign:"center",marginTop:12}},React.createElement(AvisoPrivacidade,null)),
            React.createElement("div",{className:"login-versao"},"Versão ",CONFIG.VERSAO),
            CONFIG.MODO_TESTE_LOCAL && React.createElement("div", { className: "hint" },
                React.createElement("b", null, "MODO LOCAL DE TESTES ATIVO"),
                " \u2014 selecione um usu\u00E1rio cadastrado para navegar sem gravar no banco D1 de homologação."))));
}
/* ================= MOTORISTA: CARGAS ================= */
function TelaCargas({ st: estadoPortal, setSt, user, toast }) {
    const [mes, setMes] = useState(MES_ATUAL);
    const [revisao, setRevisao] = useState(0);
    const [resultado, setResultado] = useState(null);
    const competencia = mes.slice(3) + '-' + mes.slice(0, 2);
    const chave = user.id + '/' + competencia + '/' + revisao;
    useEffect(() => {
        if (CONFIG.MODO_TESTE_LOCAL) return;
        let ativo = true;
        ApiService.obterCargas(competencia).then(r => {
            if (ativo) setResultado({ chave, cargas: Array.isArray(r.cargas) ? r.cargas : [] });
        }).catch(() => {
            if (ativo) setResultado({ chave, erro: true });
        });
        return () => { ativo = false; };
    }, [chave, competencia]);
    useAtualizacaoPortal(['cargas','cadastros'], () => setRevisao(v => v + 1));
    const resultadoAtual = resultado?.chave === chave ? resultado : null;
    const st = CONFIG.MODO_TESTE_LOCAL ? estadoPortal : { ...estadoPortal, cargas: resultadoAtual?.cargas || [] };
    const dados = usarDadosMensais(st);
    const [contestar, setContestar] = useState(null);
    const [detalheContestacao, setDetalheContestacao] = useState('');
    const [motivo, setMotivo] = useState('');
    const [tipoContestacao, setTipoContestacao] = useState('ERRO_CARGA');
    const [opcoesContestacao, setOpcoesContestacao] = useState(['ERRO_CARGA']);
    const [carregandoOpcoes, setCarregandoOpcoes] = useState(false);
    const [enviandoContestacao, setEnviandoContestacao] = useState(false);
    const ap = apuracaoMes(st, dados, user.nome, mes);
    const cargasMes = st.cargas.filter(c => c.motorista === user.nome && mesDaData(c.data) === mes)
        .sort((a, b) => b.data.localeCompare(a.data));
    const contestDaCarga = id => st.contestacoes.find(c => c.cargaId === id && c.motorista === user.nome);
    const abrirContestacao = async (carga) => {
        setContestar(carga);
        setMotivo('');
        setTipoContestacao('ERRO_CARGA');
        if (CONFIG.MODO_TESTE_LOCAL) {
            setOpcoesContestacao(['ERRO_CARGA']);
            return;
        }
        setCarregandoOpcoes(true);
        try {
            const r = await ApiService.obterOpcoesContestacao(carga.id);
            const opcoes = Array.isArray(r.opcoes) ? r.opcoes : ['ERRO_CARGA'];
            setOpcoesContestacao(opcoes);
            if (carga.pbtForaFaixa && opcoes.includes('DIVERGENCIA_PBT'))
                setTipoContestacao('DIVERGENCIA_PBT');
            else if (!opcoes.includes('ERRO_CARGA') && opcoes.length)
                setTipoContestacao(opcoes[0]);
        }
        catch (e) {
            setContestar(null);
            toast('Não foi possível validar esta carga: ' + e.message);
        }
        finally {
            setCarregandoOpcoes(false);
        }
    };
    const enviar = async () => {
        if (!motivo.trim()) {
            toast('Descreva o que está errado na carga.');
            return;
        }
        if (CONFIG.MODO_TESTE_LOCAL) {
            setSt(s => ({ ...s, contestacoes: [...s.contestacoes, { id: 'ct' + Date.now(), motorista: user.nome, cargaId: contestar.id, tipoContestacao, motivo: motivo.trim(), status: 'pendente', resposta: '', data: HOJE }] }));
            setContestar(null);
            setMotivo('');
            toast('Contestação enviada para a logística.');
            return;
        }
        setEnviandoContestacao(true);
        try {
            const r = await ApiService.criarContestacao(contestar.id, tipoContestacao, motivo.trim());
            setSt(s => ({ ...s, contestacoes: [...(s.contestacoes || []), r.contestacao] }));
            setContestar(null);
            setMotivo('');
            toast('Contestação enviada para a logística.');
        }
        catch (e) {
            toast('Não foi possível enviar a contestação: ' + e.message);
        }
        finally {
            setEnviandoContestacao(false);
        }
    };
    const mesesDisp = [...new Set([...mesesAteHoje(), MES_ATUAL, mes, ...estadoPortal.cargas.filter(c => c.motorista === user.nome).map(c => mesDaData(c.data))])].sort((a,b) => (a.slice(3)+a.slice(0,2)).localeCompare(b.slice(3)+b.slice(0,2)));
    const seletor = React.createElement("div", { className: "seletor-mes" }, mesesDisp.map(m => React.createElement("button", { key: m, className: 'mes-pill' + (m === mes ? ' on' : ''), onClick: () => setMes(m) }, mesLabel(m))));
    if (!CONFIG.MODO_TESTE_LOCAL && (!resultadoAtual || resultadoAtual.erro))
        return React.createElement(React.Fragment, null, seletor,
            React.createElement("div", { className: "card muted", role: "status" }, resultadoAtual?.erro ?
                React.createElement(React.Fragment, null, "Não foi possível carregar as cargas. ", React.createElement("button", { className: "btn btn-sm btn-s", onClick: () => setRevisao(v => v + 1) }, "Tentar novamente")) :
                "Carregando cargas do mês..."));
    return (React.createElement(React.Fragment, null,
        seletor,
        React.createElement("div", { className: "totais" },
            React.createElement("div", { className: "card" },
                React.createElement("div", { className: "v num" }, ap.nCargas),
                React.createElement("div", { className: "l" }, "Cargas")),
            React.createElement("div", { className: "card" },
                React.createElement("div", { className: "v num" }, brn(ap.peso, 1)),
                React.createElement("div", { className: "l" }, "Peso (t)")),
            React.createElement("div", { className: "card" },
                React.createElement("div", { className: "v num" }, brl(ap.fat)),
                React.createElement("div", { className: "l" }, "Faturamento"))),
        !ap.temDados && React.createElement("div", { className: "card muted" },
            "Nenhuma carga registrada em ",
            mesLabel(mes),
            "."),
        ap.temDados && !ap.detalhe &&
            React.createElement("div", { className: "aviso-box" },
                "O detalhe carga a carga de ",
                mesLabel(mes),
                " ainda n\u00E3o foi importado para o app \u2014 os totais acima v\u00EAm do fechamento do m\u00EAs. A partir de Mai/2026 a lista completa est\u00E1 dispon\u00EDvel."),
        cargasMes.map(c => {
            const ct = contestDaCarga(c.id);
            const detalhesAbertos = ct && detalheContestacao === String(ct.id);
            const limiteFaixaKg = c.pbtMotivo === 'ABAIXO_DA_FAIXA' ? c.limiteInferiorKg : c.limiteSuperiorKg;
            return (React.createElement("div", { className: "card carga", key: c.id },
                React.createElement("div", { className: "row" },
                    React.createElement("div", { className: "grow" },
                        React.createElement("div", { className: "rota" },
                            c.origem,
                            " ",
                            React.createElement("span", { className: "seta" }, "\u2192"),
                            " ",
                            c.destino),
                        React.createElement("div", { className: "meta-l" },
                            dataBR(c.data),
                            " \u00B7 ",
                            c.produto,
                            " \u00B7 NF ",
                            c.nota,
                            " \u00B7 ",
                            React.createElement("span", { className: "num" },
                                brn(c.peso),
                                " t"),
                            " \u00B7 ",
                            React.createElement("span", { className: "num" },
                                c.valor != null && c.peso > 0 ? brl(c.valor / c.peso) + '/t' : '—')),
                        c.pbtForaFaixa && React.createElement("div", { className: "tag tag-neg", style: { marginTop: 7 } },
                            "PBT fora da faixa \u2014 limite ",
                            React.createElement("span", { style: { whiteSpace: 'nowrap' } },
                                brn(Number(limiteFaixaKg || 0) / 1000, 2),
                                " t"))),
                    React.createElement("div", { style: { textAlign: 'right' } },
                        React.createElement("div", { className: "valor num" }, brl(c.valor)),
                        ct ? React.createElement(StatusTag, { s: ct.status }) :
                            React.createElement("button", { className: 'btn ' + (c.pbtForaFaixa ? 'btn-p' : 'btn-g') + ' btn-sm', style: { marginTop: 4 }, onClick: () => abrirContestacao(c) }, c.pbtForaFaixa ? 'Contestar PBT' : 'Contestar'))),
                ct && React.createElement("div", { style: { marginTop: 8 } },
                    React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => setDetalheContestacao(detalhesAbertos ? '' : String(ct.id)) }, detalhesAbertos ? 'Ocultar detalhes' : 'Ver detalhes'),
                    detalhesAbertos && React.createElement("div", { className: "card", style: { marginTop: 8, marginBottom: 0, boxShadow: 'none', background: 'var(--papel)' } },
                        React.createElement("div", null,
                            React.createElement("b", null, "Tipo:"),
                            " ",
                            ct.tipoContestacao === 'DIVERGENCIA_PBT' ? 'Divergência de PBT' : 'Erro de carga'),
                        React.createElement("div", { style: { marginTop: 6 } },
                            React.createElement("b", null, "Justificativa enviada:"),
                            " ",
                            ct.motivo || 'Não informada'),
                        React.createElement("div", { style: { marginTop: 6 } },
                            React.createElement("b", null, "Data da solicita\u00E7\u00E3o:"),
                            " ",
                            ct.data ? dataBR(ct.data) : 'Não informada'),
                        React.createElement("div", { style: { marginTop: 6 } },
                            React.createElement("b", null, "Resposta da log\u00EDstica:"),
                            " ",
                            ct.resposta || 'Aguardando análise'),
                        ct.dataAnalise && React.createElement("div", { style: { marginTop: 6 } },
                            React.createElement("b", null, "Data da an\u00E1lise:"),
                            " ",
                            dataBR(ct.dataAnalise))))));
        }),
        contestar &&
            React.createElement(Modal, { titulo: "Contestar carga", onClose: () => setContestar(null) },
                React.createElement("div", { className: "card", style: { background: 'var(--papel)', boxShadow: 'none', marginBottom: 12 } },
                    React.createElement("b", null,
                        contestar.origem,
                        " \u2192 ",
                        contestar.destino),
                    React.createElement("div", { className: "muted" },
                        dataBR(contestar.data),
                        " \u00B7 NF ",
                        contestar.nota,
                        " \u00B7 ",
                        brn(contestar.peso),
                        " t \u00B7 ",
                        brl(contestar.valor))),
                React.createElement("label", null, "Tipo de contesta\u00E7\u00E3o"),
                carregandoOpcoes ? React.createElement("div", { className: "muted" }, "Validando as regras desta carga...") :
                    React.createElement("select", { value: tipoContestacao, onChange: e => setTipoContestacao(e.target.value) },
                        opcoesContestacao.includes('ERRO_CARGA') && React.createElement("option", { value: "ERRO_CARGA" }, "Erro de carga"),
                        opcoesContestacao.includes('DIVERGENCIA_PBT') && React.createElement("option", { value: "DIVERGENCIA_PBT" }, "Diverg\u00EAncia de PBT (peso/capacidade)")),
                React.createElement("label", { htmlFor: "tela-cargas-o-que-esta-errado" }, "O que est\u00E1 errado?"),
                React.createElement("textarea", { id: "tela-cargas-o-que-esta-errado", name: "tela-cargas-o-que-esta-errado", rows: "4", value: motivo, onChange: e => setMotivo(e.target.value), placeholder: "Ex.: o peso est\u00E1 diferente do ticket da balan\u00E7a..." }),
                React.createElement("button", { className: "btn btn-p", disabled: carregandoOpcoes || enviandoContestacao, style: { width: '100%', marginTop: 12 }, onClick: enviar }, enviandoContestacao ? 'Enviando...' : 'Enviar contestação'))));
}
/* ================= MOTORISTA: PREMIAÇÃO ================= */
function Regua({ fat, meta }) {
    if (!meta) {
        return (React.createElement("div", { className: "regua", style: { opacity: .55 } },
            React.createElement("div", { className: "fill", style: { width: '0%' } }),
            React.createElement("div", { className: "marco", style: { left: '35%' } },
                React.createElement("span", { className: "flag" }, "START")),
            React.createElement("div", { className: "marco meta", style: { left: '78%' } },
                React.createElement("span", { className: "flag" }, "META")),
            React.createElement("span", { className: "caminhao", style: { left: '3%' } }, "\uD83D\uDE9B")));
    }
    const fim = Math.max(meta.meta * 1.25, meta.start * 1.35, 1);
    const pct = Math.max(0, Math.min(100, fat / fim * 100));
    const pStart = meta.start / fim * 100, pMeta = meta.meta / fim * 100;
    return (React.createElement("div", { className: "regua" },
        React.createElement("div", { className: 'fill' + (fat >= meta.meta ? ' alem' : ''), style: { width: pct + '%' } }),
        React.createElement("div", { className: "marco", style: { left: pStart + '%' } },
            React.createElement("span", { className: "flag" },
                "START ",
                brn(meta.start / 1000, 0),
                "k")),
        React.createElement("div", { className: "marco meta", style: { left: pMeta + '%' } },
            React.createElement("span", { className: "flag" },
                "META ",
                brn(meta.meta / 1000, 0),
                "k")),
        React.createElement("span", { className: "caminhao", style: { left: pct + '%' } }, "\uD83D\uDE9B")));
}
function TelaPremiacao({ st, user, dados }) {
    const [mes, setMes] = useState(MES_ATUAL);
    const [ocorrenciasAbertas, setOcorrenciasAbertas] = useState({});
    const ap = apuracaoMes(st, dados, user.nome, mes);
    const quad = QUADS.find(q => q.meses.includes(mes)) || QUADS[0];
    const apsQuad = quad.meses.map(m => ({ mes: m, ...apuracaoMes(st, dados, user.nome, m) }));
    const somaQuad = apsQuad.reduce((s, a) => s + a.apurado, 0);
    const pctStart = ap.meta ? Math.min(100, ap.fat / ap.meta.start * 100) : 0;
    const pctMeta = ap.meta ? Math.min(100, ap.fat / ap.meta.meta * 100) : 0;
    const faltaStart = ap.meta ? Math.max(0, ap.meta.start - ap.fat) : 0;
    const ganhoStartMil = ap.meta ? ap.meta.pctStart * 10 : 0;
    const ganhoMetaMil = ap.meta ? ap.meta.pctMeta * 10 : 0;
    const mesesVisiveis = mesesAteHoje();
    return (React.createElement(React.Fragment, null,
        React.createElement("div", { className: "seletor-mes" }, mesesVisiveis.map(m => React.createElement("button", { key: m, className: 'mes-pill' + (m === mes ? ' on' : ''), onClick: () => setMes(m) }, mesLabel(m)))),
        React.createElement("div", { className: "aviso-box" }, ap.meta ? "Estimativa conforme cargas, metas e descontos cadastrados. Não substitui o fechamento oficial do RH." : "Premiação indisponível: não foi encontrada meta para o tipo de veículo e período. Valores zerados abaixo não representam uma apuração validada."),
        React.createElement("div", { className: "card regua-wrap" },
            React.createElement("div", { className: "row" },
                React.createElement("div", { className: "grow" },
                    React.createElement("div", { className: "muted" },
                        "Faturamento em ",
                        mesLabel(mes),
                        ap.tipo ? ' · ' + ap.tipo : ''),
                    React.createElement("div", { className: "grande num", style: { color: 'var(--mata)' } }, brl(ap.fat))),
                React.createElement("div", { style: { textAlign: 'right' } },
                    React.createElement("div", { className: "muted" }, "Atingido"),
                    React.createElement("div", { className: "disp num", style: { fontWeight: 800, fontSize: 20, color: pctMeta >= 100 ? 'var(--colheita-escura)' : 'var(--mata)' } }, pctMeta >= 100 ? 'META ✓' : brn(pctStart, 0) + '% do start'))),
            React.createElement(Regua, { fat: ap.fat, meta: ap.meta }),
            React.createElement("div", { className: "muted", style: { textAlign: 'center' } }, !ap.meta ? 'Sem meta cadastrada para o tipo de veículo.' :
                ap.fat >= ap.meta.meta ? 'Meta batida! Cada R$ 1.000 acima da meta soma ' + brl(ganhoMetaMil) + ' (teto ' + brl(ap.meta.teto) + ').' :
                    ap.fat >= ap.meta.start ? 'Start atingido — cada R$ 1.000 a mais soma ' + brl(ganhoStartMil) + ' até a meta.' :
                        'Faltam ' + brl(faltaStart) + ' de frete para começar a pontuar.')),
        React.createElement("div", { className: "card" },
            React.createElement("h3", { style: { marginBottom: 6 } },
                "Apura\u00E7\u00E3o de ",
                mesLabel(mes)),
            ap.inconsistencias && ap.inconsistencias.length > 0 &&
                React.createElement("div", { className: "aviso-box", style: { marginBottom: 10, borderColor: 'var(--erro)' } },
                    React.createElement("b", null,
                        ap.inconsistencias.length,
                        " carga(s) n\u00E3o considerada(s)"),
                    React.createElement("br", null),
                    "Falta ou diverg\u00EAncia no v\u00EDnculo Motorista \u00D7 Ve\u00EDculo vigente na data. A log\u00EDstica deve corrigir o hist\u00F3rico de v\u00EDnculos."),
            ap.detalhesVigencia && ap.detalhesVigencia.length > 1 &&
                React.createElement("div", { className: "aviso-box", style: { marginBottom: 10 } },
                    React.createElement("b", null, "Troca de ve\u00EDculo/tipo no m\u00EAs."),
                    " A apura\u00E7\u00E3o foi separada por vig\u00EAncia e as metas foram proporcionais aos dias de cada per\u00EDodo."),
            ap.detalhesVigencia && ap.detalhesVigencia.map((v, idx) => React.createElement("div", { className: "linha-item", key: (v.vinculoId || idx) + '-' + (v.meta && v.meta.id || '') },
                React.createElement("span", null,
                    React.createElement("b", null,
                        v.placa,
                        " \u00B7 ",
                        v.tipoVeiculo),
                    React.createElement("span", { className: "muted" },
                        " \u2014 ",
                        dataBR(v.inicio),
                        " a ",
                        dataBR(v.fim),
                        " \u00B7 ",
                        v.diasVigencia,
                        " dia(s)")),
                React.createElement("span", { style: { textAlign: 'right' } },
                    React.createElement("b", { className: "num" }, brl(v.realizado)),
                    React.createElement("span", { className: "muted", style: { display: 'block' } },
                        "Meta proporcional: ",
                        brl(v.metaRateada && v.metaRateada.meta || 0))))),
            React.createElement("div", { className: "linha-item" },
                React.createElement("span", null,
                    "Premia\u00E7\u00E3o pelo frete realizado ",
                    React.createElement("span", { className: "muted" }, "(estimativa)")),
                React.createElement("b", { className: "num", style: { color: 'var(--mata)' } }, brl(ap.prod))),
            [
                { rotulo: 'Notificação / Advertência', aliases: ['Notificação / Advertência', 'Notificação / Advertencia'] },
                { rotulo: 'Multas', aliases: ['Multas'] },
                { rotulo: 'Auditoria Interna', aliases: ['Auditoria Interna', 'Check List'] }
            ].map(grupo => {
                const doItem = ap.descs.filter(d => {
                    const categoria = String(d.item || d.categoria || '');
                    return grupo.aliases.includes(categoria) && d.exibir !== false &&
                        (String(d.situacao || 'Com ocorrência').toLowerCase().includes('ocorr') || Number(d.valor || 0) !== 0 || Number(d.percentual || 0) !== 0);
                });
                const tot = doItem.reduce((s, d) => s + (Number(d.valor || 0) > 0 ? -Math.abs(Number(d.valor || 0)) : Number(d.valor || 0)), 0);
                const quantidadeOcorrencias = doItem.reduce((s, d) => {
                    const situacao = normalizar(d.situacao);
                    if (situacao === 'sem ocorrencia') return s;
                    if (d.quantidade != null && d.quantidade !== '') {
                        const quantidade = Number(d.quantidade);
                        if (Number.isInteger(quantidade) && quantidade >= 0) return s + quantidade;
                    }
                    return s + 1;
                }, 0);
                const rotulo = React.createElement("span", null, grupo.rotulo,
                    React.createElement("span", { className: "muted" }, " — ",
                        quantidadeOcorrencias === 0 ? 'Sem ocorrência' :
                            quantidadeOcorrencias + (quantidadeOcorrencias === 1 ? ' ocorrência' : ' ocorrências')));
                const chave = grupo.rotulo;
                const aberta = !!ocorrenciasAbertas[chave];
                return (React.createElement("div", { className: "linha-item ocorrencia-linha", key: grupo.rotulo },
                    React.createElement("div", { className: "ocorrencia-resumo" },
                        doItem.length > 0 ?
                            React.createElement("button", { type: "button", className: "ocorrencia-abrir", onClick: () => setOcorrenciasAbertas(a => ({ ...a, [chave]: !a[chave] })), "aria-expanded": aberta },
                                React.createElement("span", { className: 'ocorrencia-seta' + (aberta ? ' aberta' : '') }, "\u2304"),
                                rotulo) : rotulo,
                        React.createElement("b", { className: "num", style: { color: tot < 0 ? 'var(--erro)' : 'var(--cinza)' } }, tot < 0 ? brl(tot) : brl(0))),
                    aberta && doItem.length > 0 &&
                        React.createElement("div", { className: "ocorrencia-detalhes" }, doItem.map((d, i) => {
                            const valor = Number(d.valor || 0) > 0 ? -Math.abs(Number(d.valor || 0)) : Number(d.valor || 0);
                            return React.createElement("div", { className: "ocorrencia-detalhe", key: d.itemId || d.id || i },
                                React.createElement("div", { className: "row", style: { alignItems: 'flex-start' } },
                                    React.createElement("div", { className: "grow" },
                                        React.createElement("b", null, d.dataOcorrencia ? dataBR(String(d.dataOcorrencia).slice(0, 10)) : 'Data não informada'),
                                        React.createElement("div", { className: "muted" },
                                            d.situacao || 'Com ocorrência',
                                            Number(d.quantidade || 0) > 0 ? ' · Quantidade: ' + d.quantidade : '',
                                            Number(d.percentual || 0) > 0 ? ' · ' + brn(d.percentual, 2) + '%' : '')),
                                    React.createElement("b", { className: "num", style: { color: valor < 0 ? 'var(--erro)' : 'var(--cinza)' } }, brl(valor))),
                                React.createElement("div", { className: "ocorrencia-motivo" },
                                    React.createElement("b", null, "Motivo:"),
                                    " ",
                                    String(d.motivo || d.origem || 'Não informado')),
                                d.auditoriaResumo && React.createElement("div", { className: "ocorrencia-motivo" },
                                    d.auditoriaResumo.meta != null && React.createElement("p", null, "Meta de conformidade: " + brn(d.auditoriaResumo.meta, 2) + "%"),
                                    d.auditoriaResumo.itens.length > 0 && React.createElement(React.Fragment, null,
                                        React.createElement("b", null, "Itens que reduziram a nota"),
                                        React.createElement("ul", null, d.auditoriaResumo.itens.map((item, indice) =>
                                            React.createElement("li", { key: indice }, item.titulo + " · " + item.nota + "/" + item.maximo + (item.motivo ? " · " + item.motivo : "")))))));
                        }))));
            }),
            React.createElement("div", { className: "linha-item", style: { fontSize: 15.5 } },
                React.createElement("b", null, "Apurado no m\u00EAs"),
                React.createElement("b", { className: "num", style: { color: ap.apurado < 0 ? 'var(--erro)' : 'var(--mata)' } }, brl(ap.apurado))),
            React.createElement("div", { className: "aviso-box", style: { marginTop: 10 } }, "Valores estimados conforme POL 4.1.1 e sujeitos a confer\u00EAncia. O apurado mensal pode ficar negativo e ser\u00E1 compensado pelos demais meses do quadrimestre. Nunca haver\u00E1 desconto em folha se o acumulado final ficar negativo.")),
        React.createElement("div", { className: "card" },
            React.createElement("div", { className: "row", style: { marginBottom: 10 } },
                React.createElement("h3", { className: "grow" }, quad.nome),
                React.createElement("span", { className: "tag tag-neutro" },
                    "Pagamento ",
                    quad.pgto)),
            apsQuad.map(a => {
                const futuro = a.mes > MES_ATUAL;
                return (React.createElement("div", { className: 'quad-mes' + (a.mes === mes ? ' on' : ''), key: a.mes, role: "button", tabIndex: "0", style: { cursor: 'pointer' }, onClick: () => setMes(a.mes), onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ')
                        setMes(a.mes); } },
                    React.createElement("span", { style: { fontWeight: 600 } }, mesLabel(a.mes)),
                    futuro ? React.createElement("span", { className: "muted" }, "em andamento") :
                        React.createElement("b", { className: "num", style: { color: a.apurado < 0 ? 'var(--erro)' : 'var(--mata)' } }, brl(a.apurado))));
            }),
            React.createElement("div", { className: "linha-item", style: { fontSize: 16, marginTop: 6 } },
                React.createElement("b", null, "Acumulado do quadrimestre"),
                React.createElement("b", { className: "num", style: { color: 'var(--mata)' } }, brl(Math.max(0, somaQuad)))),
            somaQuad < 0 && React.createElement("div", { className: "muted" },
                "O acumulado ficou negativo (",
                brl(somaQuad),
                "); nesse caso n\u00E3o h\u00E1 desconto em folha \u2014 o pagamento fica em R$ 0,00."))));
}
/* ================= MOTORISTA: SINISTRO ================= */
function TelaSinistro({ user, toast }) {
    const [veiculos, setVeiculos] = useState([]);
    const [agendamentoAtual, setAgendamentoAtual] = useState(null);
    const [historico, setHistorico] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [enviando, setEnviando] = useState(false);
    const [contatoEmergencia, setContatoEmergencia] = useState({ nome: 'Logística', telefone: '' });
    const [registroAberto, setRegistroAberto] = useState(null);
    const [carregandoRegistro, setCarregandoRegistro] = useState(false);
    const [complementos, setComplementos] = useState({});
    const [enviandoDocumentoId, setEnviandoDocumentoId] = useState('');
    const [form, setForm] = useState({
        placa: '', motoristaNome: user.nome || '', motoristaTelefone: '', dataHoraOcorrido: '',
        localOcorrido: '', municipio: '', uf: 'RS', tipoOcorrencia: '', tipoSinistro: '', descricaoOcorrido: '',
        possuiVitima: false, possuiTerceiro: false, veiculoImobilizado: false, necessitaGuincho: false,
        autoridadeAcionada: false, numeroBoletim: '', responsabilidadeInicial: 'Ainda não definida'
    });
    const [arquivos, setArquivos] = useState([]);
    const sinistroEnvioRef = useRef(null);
    const carregar = async () => {
        setCarregando(true);
        try {
            const [rv, rh, rc] = await Promise.allSettled([ApiService.obterVeiculos(), ApiService.obterMeusSinistros(), ApiService.obterContatoSinistros()]);
            let lista = rv.status === 'fulfilled' ? (rv.value.veiculos || []).filter(v => v.placa) : [];
            let ag = null;
            const precisaAgendamento = Boolean(user?.perms?.agendamentos && lista.some(v => v.usoCompartilhado === true && !normalizar(v.tipoFrota).includes('pesada')));
            if (precisaAgendamento) {
                try {
                    const ra = await ApiService.contextoAgendamentoAtual();
                    const bruto = ra?.agendamento || null;
                    const st = String(bruto?.status || '').trim().toUpperCase();
                    if (['EM_USO', 'DEVOLUCAO_ATRASADA', 'PENDENTE_FINALIZACAO'].includes(st))
                        ag = bruto;
                }
                catch { }
            }
            setAgendamentoAtual(ag);
            lista = lista.filter(v => v.usoCompartilhado !== true || Boolean(ag?.placa && normalizar(v.placa) === normalizar(ag.placa)));
            if (ag?.placa && !lista.some(v => normalizar(v.placa) === normalizar(ag.placa)))
                lista = [...lista, { itemId: ag.veiculoId || '', placa: ag.placa, tipoFrota: 'FROTA LEVE', tipoModelo: ag.tipoModelo || '', modelo: ag.modelo || '', usoCompartilhado: true, principal: false }];
            setVeiculos(lista);
            const principal = lista.find(v => v.principal && v.usoCompartilhado !== true), agendado = ag?.placa ? lista.find(v => normalizar(v.placa) === normalizar(ag.placa)) : null, preferido = agendado || principal || lista[0] || null;
            setForm(f => ({ ...f, placa: lista.some(v => v.placa === f.placa) ? f.placa : (preferido?.placa || '') }));
            if (rh.status === 'fulfilled')
                setHistorico(rh.value.sinistros || []);
            if (rc.status === 'fulfilled' && rc.value?.contato)
                setContatoEmergencia({ nome: rc.value.contato.nome || 'Logística', telefone: rc.value.contato.telefone || '' });
        }
        finally {
            setCarregando(false);
        }
    };
    useEffect(() => { carregar(); }, []);
    useAtualizacaoPortal(['sinistros'], async () => { const r = await ApiService.obterMeusSinistros(); setHistorico(r.sinistros || []); });
    const veiculoSelecionado = veiculos.find(v => normalizar(v.placa) === normalizar(form.placa)) || null;
    const ehFrotaPesada = Boolean(veiculoSelecionado && normalizar(veiculoSelecionado.tipoFrota).includes('pesada'));
    const exigeAgendamento = Boolean(veiculoSelecionado && !ehFrotaPesada && veiculoSelecionado.usoCompartilhado === true);
    const agendamentoDaPlaca = Boolean(agendamentoAtual && normalizar(agendamentoAtual.placa) === normalizar(form.placa));
    const bloqueioAgendamento = Boolean(exigeAgendamento && (!user?.perms?.agendamentos || !agendamentoDaPlaca));
    const converterArquivos = async (lista, limiteQtd = 12) => {
        const permitidos = [...lista].slice(0, limiteQtd);
        const convertidos = [];
        let totalConvertido = 0;
        for (const f of permitidos) {
            let nome = f.name, tipo = f.type || 'application/octet-stream', conteudoBase64 = '', tamanhoFinal = f.size;
            if (String(f.type || '').toLowerCase().startsWith('image/')) {
                try {
                    conteudoBase64 = await comprimirImagem(f);
                    tipo = 'image/jpeg';
                    nome = String(f.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg';
                    tamanhoFinal = Math.round((conteudoBase64.split(',')[1] || '').length * 0.75);
                }
                catch (e) {
                    if (f.size > 4 * 1024 * 1024) {
                        toast('A foto ' + f.name + ' é maior que 4 MB e não pôde ser otimizada automaticamente. Tente outra foto.');
                        continue;
                    }
                }
            }
            if (!conteudoBase64) {
                if (f.size > 4 * 1024 * 1024) {
                    toast('O arquivo ' + f.name + ' ultrapassa 4 MB. Para fotos, a Plataforma reduz automaticamente; outros arquivos precisam estar abaixo desse limite.');
                    continue;
                }
                conteudoBase64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result || '')); r.onerror = () => rej(new Error('Falha ao ler ' + f.name)); r.readAsDataURL(f); });
                tamanhoFinal = f.size;
            }
            if (tamanhoFinal > 4 * 1024 * 1024) {
                toast('O arquivo ' + nome + ' ainda ultrapassa 4 MB após a otimização.');
                continue;
            }
            if (totalConvertido + tamanhoFinal > 18 * 1024 * 1024) {
                toast('Os anexos ultrapassam 18 MB após a otimização. Envie em menos arquivos.');
                break;
            }
            totalConvertido += tamanhoFinal;
            convertidos.push({ nome, tipo, conteudoBase64, tamanho: tamanhoFinal });
        }
        return convertidos;
    };
    const lerArquivos = async (lista) => setArquivos(await converterArquivos(lista, 12));
    const enviar = async () => {
        const obrigatorios = [[form.tipoOcorrencia, 'Selecione o tipo de ocorrência.'], [form.tipoSinistro, 'Informe o detalhe da ocorrência.'], [form.placa, 'Selecione a placa.'], [form.motoristaNome, 'Informe o nome do motorista.'], [form.dataHoraOcorrido, 'Informe a data e hora do ocorrido.'], [form.localOcorrido, 'Informe o local.'], [form.descricaoOcorrido, 'Descreva o ocorrido.']];
        const falta = obrigatorios.find(([v]) => !String(v || '').trim());
        if (falta) {
            toast(falta[1]);
            return;
        }
        if (bloqueioAgendamento) {
            toast('Esta placa é Frota Leve compartilhada e precisa estar no seu agendamento atual.');
            return;
        }
        if (form.possuiVitima && !window.confirm('Você informou que há vítima. Confirma o envio imediato deste registro?'))
            return;
        if (!window.confirm('Confirma o envio da ocorrência da placa ' + form.placa + '? A ocorrência será registrada para a Logística.'))
            return;
        setEnviando(true);
        try {
            if (!sinistroEnvioRef.current) sinistroEnvioRef.current = gerarUUID();
            const r = await ApiService.criarSinistro({ ...form, arquivos, idLocal: sinistroEnvioRef.current });
            sinistroEnvioRef.current = null;
            const avisoEmail = r.emailEnviado ? ' · E-mail disparado.' : ' · Atenção: e-mail não confirmado.';
            const avisoCampo = Array.isArray(r.avisosCampos) && r.avisosCampos.length ? ' · Registro salvo com aviso técnico.' : '';
            toast('Ocorrência enviada. Protocolo: ' + r.numeroSinistro + avisoEmail + avisoCampo);
            setArquivos([]);
            setForm(f => ({ ...f, dataHoraOcorrido: '', localOcorrido: '', municipio: '', tipoOcorrencia: '', tipoSinistro: '', descricaoOcorrido: '', possuiVitima: false, possuiTerceiro: false, veiculoImobilizado: false, necessitaGuincho: false, autoridadeAcionada: false, numeroBoletim: '', responsabilidadeInicial: 'Ainda não definida' }));
            try {
                const resumo = await ApiService.obterMeusSinistros();
                setHistorico(resumo.sinistros || []);
            }
            catch { }
        }
        catch (e) {
            toast('Não foi possível enviar a ocorrência: ' + e.message);
        }
        finally {
            setEnviando(false);
        }
    };
    const abrirRegistro = async (s) => {
        setCarregandoRegistro(true);
        try {
            const r = await ApiService.obterSinistro(s.id);
            setRegistroAberto(r.sinistro || null);
            setComplementos({});
        }
        catch (e) {
            toast('Não foi possível abrir o sinistro: ' + e.message);
        }
        finally {
            setCarregandoRegistro(false);
        }
    };
    const selecionarComplemento = async (docId, files) => {
        const atuais = Array.isArray(complementos?.[docId]?.arquivos) ? complementos[docId].arquivos : [];
        const restantes = Math.max(0, 8 - atuais.length);
        if (!restantes) {
            toast('Limite de 8 arquivos por solicitação.');
            return;
        }
        const selecionados = [...files].slice(0, restantes), conv = [];
        let total = atuais.reduce((s, a) => s + Number(a?.tamanho || a?.blob?.size || 0), 0);
        for (const f of selecionados) {
            try {
                const item = await otimizarArquivoBinario(f);
                const duplicado = atuais.some(a => String(a?.chave || '') === String(item?.chave || '') && item?.chave);
                if (duplicado)
                    continue;
                if (total + item.tamanho > 18 * 1024 * 1024) {
                    toast('Os arquivos ultrapassam 18 MB após a otimização. Envie em menos arquivos.');
                    break;
                }
                total += item.tamanho;
                conv.push(item);
            }
            catch (e) {
                toast(e.message || ('Não foi possível preparar ' + f.name));
            }
        }
        if (!conv.length)
            return;
        setComplementos(prev => {
            const base = Array.isArray(prev?.[docId]?.arquivos) ? prev[docId].arquivos : [];
            const combinados = [...base];
            for (const item of conv) {
                if (combinados.length >= 8)
                    break;
                if (item?.chave && combinados.some(a => String(a?.chave || '') === String(item.chave)))
                    continue;
                combinados.push(item);
            }
            return { ...prev, [docId]: { ...(prev[docId] || {}), arquivos: combinados } };
        });
    };
    const removerComplementoArquivo = (docId, indice) => setComplementos(prev => {
        const atual = prev?.[docId] || {};
        return { ...prev, [docId]: { ...atual, arquivos: (atual.arquivos || []).filter((_, i) => i !== indice) } };
    });
    const enviarComplemento = async (doc) => {
        const dados = complementos[doc.id] || {};
        if (!Array.isArray(dados.arquivos) || !dados.arquivos.length) {
            toast('Selecione o arquivo solicitado.');
            return;
        }
        setEnviandoDocumentoId(doc.id);
        try {
            const enviados = [];
            for (let i = 0; i < dados.arquivos.length; i++) {
                const retorno = await ApiService.enviarArquivoDocumentoSinistro(registroAberto.id, doc.id, dados.arquivos[i]);
                if (retorno?.arquivo)
                    enviados.push(retorno.arquivo);
            }
            const fim = await ApiService.finalizarDocumentoSinistro(registroAberto.id, doc.id, { arquivos: enviados, observacaoMotorista: String(dados.observacao || '').trim() });
            const atualizado = fim.solicitacao || { ...doc, statusDocumento: 'Enviado', arquivos: enviados };
            setRegistroAberto(atual => ({ ...atual, solicitacoesDocumentos: (atual?.solicitacoesDocumentos || []).map(x => String(x.id) === String(doc.id) ? atualizado : x) }));
            setHistorico(lista => lista.map(s => String(s.id) === String(registroAberto.id) ? { ...s, documentosResumo: (() => { const docs = (registroAberto.solicitacoesDocumentos || []).map(x => String(x.id) === String(doc.id) ? atualizado : x); return { totalAtivos: docs.filter(x => x.ativo !== false).length, pendentesEnvio: docs.filter(x => normalizarPerfil(x.statusDocumento) === 'PENDENTE_DE_ENVIO').length, enviados: docs.filter(x => normalizarPerfil(x.statusDocumento) === 'ENVIADO').length, aceitos: docs.filter(x => normalizarPerfil(x.statusDocumento) === 'ACEITO').length, rejeitados: docs.filter(x => normalizarPerfil(x.statusDocumento) === 'REJEITADO').length, dispensados: docs.filter(x => normalizarPerfil(x.statusDocumento) === 'DISPENSADO').length }; })() } : s));
            setComplementos(prev => ({ ...prev, [doc.id]: { arquivos: [], observacao: '' } }));
            toast('Documento enviado para conferência da Logística.');
        }
        catch (e) {
            toast('Não foi possível enviar o documento: ' + e.message);
        }
        finally {
            setEnviandoDocumentoId('');
        }
    };
    const configuracaoOcorrencias = {
        'Acidente': {
            detalhes: ['Colisão', 'Abalroamento', 'Saída de pista', 'Tombamento', 'Capotamento', 'Incêndio', 'Fenômeno da natureza', 'Outro'],
            orientacoes: ['Proteja as pessoas e sinalize o local.', 'Acione autoridade ou emergência quando necessário.', 'Não assuma responsabilidade antes da análise da Logística.', 'Fotografe o local, veículos, placas, avarias e painel.'],
            evidencias: ['B.O. se houver', 'Fotos do local', 'Fotos dos veículos', 'Placas e avarias', 'Documentos do terceiro, se houver']
        },
        'Pane': {
            detalhes: ['Pane mecânica', 'Pane elétrica', 'Pneu / roda', 'Iluminação', 'Outro'],
            orientacoes: ['Pare em local seguro e sinalize quando necessário.', 'Não force o funcionamento do veículo.', 'Informe os sintomas e luzes do painel.'],
            evidencias: ['Foto do painel', 'Foto do componente/área afetada', 'Fotos do veículo/local']
        },
        'Avaria': {
            detalhes: ['Quebra de vidro', 'Pneu / roda', 'Iluminação', 'Outro'],
            orientacoes: ['Avalie se é seguro continuar rodando.', 'Fotografe claramente a avaria antes de qualquer intervenção.', 'Informe à Logística o que foi danificado.'],
            evidencias: ['Fotos da avaria', 'Foto geral do veículo', 'Foto do painel, se aplicável']
        },
        'Furto / Roubo / Vandalismo': {
            detalhes: ['Furto', 'Roubo', 'Vandalismo'],
            orientacoes: ['Priorize sua segurança e não confronte envolvidos.', 'Acione a autoridade competente.', 'Preserve evidências e informe a Logística imediatamente.'],
            evidencias: ['B.O. se disponível', 'Fotos do local/veículo', 'Outras evidências disponíveis']
        },
        'Outro': {
            detalhes: ['Outro'],
            orientacoes: ['Pare em local seguro quando necessário.', 'Descreva objetivamente a situação e aguarde orientação da Logística.'],
            evidencias: ['Fotos que ajudem a identificar a situação']
        }
    };
    const configOcorrencia = configuracaoOcorrencias[form.tipoOcorrencia] || null;
    const selecionarTipoOcorrencia = tipo => {
        const cfg = configuracaoOcorrencias[tipo];
        const exigeCamposAcidente = tipo === 'Acidente';
        const exigeAutoridade = tipo === 'Acidente' || tipo === 'Furto / Roubo / Vandalismo';
        setForm(f => ({ ...f,
            tipoOcorrencia: tipo,
            tipoSinistro: cfg?.detalhes?.includes(f.tipoSinistro) ? f.tipoSinistro : (cfg?.detalhes?.[0] || 'Outro'),
            possuiVitima: exigeCamposAcidente ? f.possuiVitima : false,
            possuiTerceiro: exigeCamposAcidente ? f.possuiTerceiro : false,
            autoridadeAcionada: exigeAutoridade ? f.autoridadeAcionada : false,
            numeroBoletim: exigeAutoridade ? f.numeroBoletim : '',
            responsabilidadeInicial: exigeCamposAcidente ? (f.responsabilidadeInicial === 'Não se aplica' ? 'Ainda não definida' : f.responsabilidadeInicial) : 'Não se aplica'
        }));
    };
    return React.createElement(React.Fragment, null,
        React.createElement("div", { className: "card sinistro-hero sinistro-bloco-compacto" },
            React.createElement("div", { className: "row" },
                React.createElement("div", { style: { fontSize: 30 } }, "\uD83D\uDEA8"),
                React.createElement("div", { className: "grow" },
                    React.createElement("h2", { style: { marginBottom: 2 } }, "Comunicar ocorr\u00EAncia"),
                    React.createElement("div", { className: "muted" }, "Escolha o que aconteceu para visualizar somente as orienta\u00E7\u00F5es e perguntas necess\u00E1rias.")))),
        React.createElement("div", { className: "card sinistro-bloco-compacto" },
            React.createElement("label", null, "O que aconteceu? *"),
            React.createElement("div", { className: "sinistro-ocorrencia-escolha" }, ['Acidente', 'Pane', 'Avaria', 'Furto / Roubo / Vandalismo', 'Outro'].map(tipo => React.createElement("button", { type: "button", key: tipo, className: 'sinistro-ocorrencia-btn' + (form.tipoOcorrencia === tipo ? ' on' : '') + (tipo === 'Furto / Roubo / Vandalismo' ? ' largo' : ''), onClick: () => selecionarTipoOcorrencia(tipo) }, tipo)))),
        configOcorrencia && React.createElement(React.Fragment, null,
            React.createElement("div", { className: "card sinistro-bloco-compacto", style: { border: '1.5px solid rgba(20,78,58,.22)', background: 'rgba(20,78,58,.055)' } },
                React.createElement("div", { className: "row" },
                    React.createElement("div", { style: { fontSize: 25 } }, "\uD83D\uDCDE"),
                    React.createElement("div", { className: "grow" },
                        React.createElement("div", { className: "muted", style: { fontSize: 11, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.04em' } }, "Contato da Log\u00EDstica"),
                        React.createElement("b", null, contatoEmergencia.nome || 'Logística'),
                        !contatoEmergencia.telefone && React.createElement("div", { className: "muted" }, "Telefone n\u00E3o cadastrado.")),
                    contatoEmergencia.telefone && React.createElement("a", { className: "btn btn-p btn-sm", href: 'tel:' + String(contatoEmergencia.telefone).replace(/[^0-9+]/g, '') },
                        "Ligar ",
                        contatoEmergencia.telefone))),
            React.createElement("div", { className: "card sinistro-bloco-compacto" },
                React.createElement("div", { className: "row" },
                    React.createElement("h3", { className: "grow", style: { margin: 0 } }, "Antes de enviar"),
                    React.createElement("span", { className: "tag tag-neutro" }, form.tipoOcorrencia)),
                React.createElement("div", { className: "sinistro-orientacao-compacta" }, configOcorrencia.orientacoes.map(x => React.createElement("div", { className: "sinistro-orientacao-item", key: x }, x))),
                React.createElement("div", { className: "muted", style: { marginTop: 10, fontSize: 12, fontWeight: 700 } }, "Evid\u00EAncias \u00FAteis"),
                React.createElement("div", { className: "sinistro-evidencias-compactas" }, configOcorrencia.evidencias.map(x => React.createElement("span", { className: "sinistro-evidencia-chip", key: x }, x)))),
            bloqueioAgendamento && React.createElement("div", { className: "aviso-box" }, "A placa selecionada \u00E9 Frota Leve compartilhada. Para este tipo de ve\u00EDculo, a ocorr\u00EAncia s\u00F3 pode ser enviada quando a placa estiver no seu agendamento atual."),
            React.createElement("div", { className: "card sinistro-bloco-compacto" },
                React.createElement("h3", { style: { marginBottom: 10 } }, "Dados da ocorr\u00EAncia"),
                React.createElement("div", { className: "form-grid" },
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "tela-sinistro-detalhe-da-ocorrencia" }, "Detalhe da ocorr\u00EAncia *"),
                        React.createElement("select", { id: "tela-sinistro-detalhe-da-ocorrencia", name: "tela-sinistro-detalhe-da-ocorrencia", value: form.tipoSinistro, onChange: e => setForm({ ...form, tipoSinistro: e.target.value }) }, (configOcorrencia.detalhes || ['Outro']).map(x => React.createElement("option", { key: x }, x)))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "tela-sinistro-placa" }, "Placa *"),
                        React.createElement("select", { id: "tela-sinistro-placa", name: "tela-sinistro-placa", value: form.placa, onChange: e => setForm({ ...form, placa: e.target.value }) },
                            React.createElement("option", { value: "" }, "Selecionar..."),
                            veiculos.map(v => React.createElement("option", { key: v.itemId || v.placa, value: v.placa },
                                v.placa,
                                v.tipoFrota ? ' · ' + v.tipoFrota : '',
                                v.usoCompartilhado ? ' · compartilhado' : ' · por vínculo')))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "tela-sinistro-data-e-hora" }, "Data e hora *"),
                        React.createElement("input", { id: "tela-sinistro-data-e-hora", name: "tela-sinistro-data-e-hora", autoComplete: "off", type: "datetime-local", value: form.dataHoraOcorrido, onChange: e => setForm({ ...form, dataHoraOcorrido: e.target.value }) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "tela-sinistro-motorista" }, "Motorista *"),
                        React.createElement("input", { id: "tela-sinistro-motorista", name: "tela-sinistro-motorista", autoComplete: "off", value: form.motoristaNome, onChange: e => setForm({ ...form, motoristaNome: e.target.value }) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "tela-sinistro-telefone" }, "Telefone"),
                        React.createElement("input", { id: "tela-sinistro-telefone", name: "tela-sinistro-telefone", autoComplete: "off", value: form.motoristaTelefone, onChange: e => setForm({ ...form, motoristaTelefone: e.target.value }), placeholder: "(54) 99999-9999" })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "tela-sinistro-municipio" }, "Munic\u00EDpio"),
                        React.createElement("input", { id: "tela-sinistro-municipio", name: "tela-sinistro-municipio", autoComplete: "off", value: form.municipio, onChange: e => setForm({ ...form, municipio: e.target.value }) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "tela-sinistro-uf" }, "UF"),
                        React.createElement("select", { id: "tela-sinistro-uf", name: "tela-sinistro-uf", value: form.uf, onChange: e => setForm({ ...form, uf: e.target.value }) }, ['RS', 'SC', 'PR', 'SP', 'MG', 'RJ', 'ES', 'MS', 'MT', 'GO', 'DF', 'BA', 'SE', 'AL', 'PE', 'PB', 'RN', 'CE', 'PI', 'MA', 'TO', 'PA', 'AP', 'AM', 'RR', 'RO', 'AC'].map(x => React.createElement("option", { key: x }, x)))),
                    React.createElement("div", { style: { gridColumn: '1/-1' } },
                        React.createElement("label", { htmlFor: "tela-sinistro-local" }, "Local *"),
                        React.createElement("input", { id: "tela-sinistro-local", name: "tela-sinistro-local", autoComplete: "off", value: form.localOcorrido, onChange: e => setForm({ ...form, localOcorrido: e.target.value }), placeholder: "Rodovia, km, endere\u00E7o ou refer\u00EAncia" }))),
                React.createElement("div", { className: "form-grid", style: { marginTop: 10 } },
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "tela-sinistro-veiculo-imobilizado" }, "Ve\u00EDculo imobilizado?"),
                        React.createElement("select", { id: "tela-sinistro-veiculo-imobilizado", name: "tela-sinistro-veiculo-imobilizado", value: form.veiculoImobilizado ? 'sim' : 'nao', onChange: e => setForm({ ...form, veiculoImobilizado: e.target.value === 'sim' }) },
                            React.createElement("option", { value: "nao" }, "N\u00E3o"),
                            React.createElement("option", { value: "sim" }, "Sim"))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "tela-sinistro-precisa-de-guincho" }, "Precisa de guincho?"),
                        React.createElement("select", { id: "tela-sinistro-precisa-de-guincho", name: "tela-sinistro-precisa-de-guincho", value: form.necessitaGuincho ? 'sim' : 'nao', onChange: e => setForm({ ...form, necessitaGuincho: e.target.value === 'sim' }) },
                            React.createElement("option", { value: "nao" }, "N\u00E3o"),
                            React.createElement("option", { value: "sim" }, "Sim"))),
                    form.tipoOcorrencia === 'Acidente' && React.createElement(React.Fragment, null,
                        React.createElement("div", null,
                            React.createElement("label", { htmlFor: "tela-sinistro-possui-vitima" }, "Possui v\u00EDtima?"),
                            React.createElement("select", { id: "tela-sinistro-possui-vitima", name: "tela-sinistro-possui-vitima", value: form.possuiVitima ? 'sim' : 'nao', onChange: e => setForm({ ...form, possuiVitima: e.target.value === 'sim' }) },
                                React.createElement("option", { value: "nao" }, "N\u00E3o"),
                                React.createElement("option", { value: "sim" }, "Sim"))),
                        React.createElement("div", null,
                            React.createElement("label", { htmlFor: "tela-sinistro-possui-terceiro" }, "Possui terceiro?"),
                            React.createElement("select", { id: "tela-sinistro-possui-terceiro", name: "tela-sinistro-possui-terceiro", value: form.possuiTerceiro ? 'sim' : 'nao', onChange: e => setForm({ ...form, possuiTerceiro: e.target.value === 'sim' }) },
                                React.createElement("option", { value: "nao" }, "N\u00E3o"),
                                React.createElement("option", { value: "sim" }, "Sim"))),
                        React.createElement("div", null,
                            React.createElement("label", { htmlFor: "tela-sinistro-responsabilidade-inicial" }, "Responsabilidade inicial"),
                            React.createElement("select", { id: "tela-sinistro-responsabilidade-inicial", name: "tela-sinistro-responsabilidade-inicial", value: form.responsabilidadeInicial, onChange: e => setForm({ ...form, responsabilidadeInicial: e.target.value }) }, ['Ainda não definida', 'Possivelmente veículo Bocchi', 'Possivelmente terceiro', 'Responsabilidade compartilhada', 'Não se aplica'].map(x => React.createElement("option", { key: x }, x))))),
                    (form.tipoOcorrencia === 'Acidente' || form.tipoOcorrencia === 'Furto / Roubo / Vandalismo') && React.createElement(React.Fragment, null,
                        React.createElement("div", null,
                            React.createElement("label", { htmlFor: "tela-sinistro-autoridade-acionada" }, "Autoridade acionada?"),
                            React.createElement("select", { id: "tela-sinistro-autoridade-acionada", name: "tela-sinistro-autoridade-acionada", value: form.autoridadeAcionada ? 'sim' : 'nao', onChange: e => { const sim = e.target.value === 'sim'; setForm({ ...form, autoridadeAcionada: sim, numeroBoletim: sim ? form.numeroBoletim : '' }); } },
                                React.createElement("option", { value: "nao" }, "N\u00E3o"),
                                React.createElement("option", { value: "sim" }, "Sim"))),
                        form.autoridadeAcionada && React.createElement("div", { style: { gridColumn: '1/-1' } },
                            React.createElement("label", { htmlFor: "tela-sinistro-numero-do-b-o-se-disponivel" }, "N\u00FAmero do B.O., se dispon\u00EDvel"),
                            React.createElement("input", { id: "tela-sinistro-numero-do-b-o-se-disponivel", name: "tela-sinistro-numero-do-b-o-se-disponivel", autoComplete: "off", value: form.numeroBoletim, onChange: e => setForm({ ...form, numeroBoletim: e.target.value }), placeholder: "Informe o n\u00FAmero fornecido pela autoridade" }),
                            React.createElement("div", { className: "muted", style: { marginTop: 4 } }, "Se o n\u00FAmero ainda n\u00E3o estiver dispon\u00EDvel, a ocorr\u00EAncia pode ser enviada normalmente.")))),
                form.necessitaGuincho && React.createElement("div", { className: "sinistro-guincho" },
                    React.createElement("b", null, "\uD83D\uDEA8 Guincho necess\u00E1rio"),
                    React.createElement("div", { style: { marginTop: 3 } }, "A Log\u00EDstica receber\u00E1 esta informa\u00E7\u00E3o e far\u00E1 o acionamento. N\u00E3o acione o guincho diretamente.")),
                form.tipoOcorrencia === 'Acidente' && !form.autoridadeAcionada && React.createElement("div", { className: "aviso-box", style: { marginTop: 10 } }, "Sem atendimento policial no local: envie a ocorr\u00EAncia e as evid\u00EAncias. A Log\u00EDstica avaliar\u00E1 o B.O. online quando aplic\u00E1vel."),
                React.createElement("div", { style: { marginTop: 10 } },
                    React.createElement("label", { htmlFor: "tela-sinistro-descricao-do-ocorrido" }, "Descri\u00E7\u00E3o do ocorrido *"),
                    React.createElement("textarea", { id: "tela-sinistro-descricao-do-ocorrido", name: "tela-sinistro-descricao-do-ocorrido", rows: "4", value: form.descricaoOcorrido, onChange: e => setForm({ ...form, descricaoOcorrido: e.target.value }), placeholder: form.tipoOcorrencia === 'Pane' ? 'Informe sintomas, ruídos, luzes do painel e o que o veículo apresentou.' : form.tipoOcorrencia === 'Avaria' ? 'Informe o que foi avariado e em que condição o veículo ficou.' : 'Relate de forma objetiva o que ocorreu.' })),
                React.createElement("div", { style: { marginTop: 10 } },
                    React.createElement("label", { htmlFor: "tela-sinistro-fotos-e-documentos" }, "Fotos e documentos"),
                    React.createElement("input", { id: "tela-sinistro-fotos-e-documentos", name: "tela-sinistro-fotos-e-documentos", autoComplete: "off", type: "file", multiple: true, accept: "image/*,.pdf,.doc,.docx,video/*", onChange: e => lerArquivos(e.target.files || []) }),
                    React.createElement("div", { className: "muted" }, "Fotos s\u00E3o otimizadas automaticamente. Outros arquivos: at\u00E9 4 MB por arquivo; m\u00E1ximo de 18 MB por envio."),
                    arquivos.map((a, i) => React.createElement("div", { className: "sinistro-arquivo", key: a.nome + i },
                        React.createElement("span", null, "\uD83D\uDCCE"),
                        React.createElement("span", { className: "grow" }, a.nome)))),
                React.createElement("button", { className: "btn btn-d", style: { width: '100%', marginTop: 12 }, disabled: enviando || carregando || bloqueioAgendamento || !form.placa || !form.tipoOcorrencia, onClick: enviar }, enviando ? 'Enviando e notificando...' : 'Enviar ocorrência'))),
        React.createElement("div", { className: "card" },
            React.createElement("div", { className: "row", style: { marginBottom: 5 } },
                React.createElement("h3", { className: "grow" }, "Meus registros"),
                carregandoRegistro && React.createElement("span", { className: "muted" }, "Abrindo...")),
            historico.length ? historico.map(s => { const sit = situacaoMotoristaSinistro(s); return React.createElement("button", { className: 'sinistro-registro-card' + (sit.chave === 'ACAO_NECESSARIA' ? ' acao' : ''), key: s.id, onClick: () => abrirRegistro(s) },
                React.createElement("span", { className: "grow" },
                    React.createElement("b", null, s.numeroSinistro),
                    React.createElement("span", { className: "muted", style: { display: 'block' } },
                        dataBR(String(s.dataHoraOcorrido || '').slice(0, 10)),
                        " \u00B7 ",
                        s.placa),
                    React.createElement("span", { style: { display: 'block', fontSize: 12, marginTop: 2 } },
                        s.tipoOcorrencia || 'Ocorrência',
                        " \u00B7 ",
                        s.tipoSinistro),
                    React.createElement("span", { className: "muted", style: { display: 'block', marginTop: 5 } }, sit.descricao)),
                React.createElement(SituacaoMotoristaSinistroTag, { sinistro: s }),
                React.createElement("span", { style: { fontSize: 20 } }, "\u2192")); }) : React.createElement("div", { className: "muted" }, "Nenhum registro encontrado.")),
        registroAberto && React.createElement(Modal, { large: true, titulo: registroAberto.numeroSinistro + ' — ' + registroAberto.placa, onClose: () => setRegistroAberto(null) },
            React.createElement("div", { className: "cards4" },
                React.createElement("div", { className: "card" },
                    React.createElement("label", null, "Situa\u00E7\u00E3o"),
                    React.createElement(SituacaoMotoristaSinistroTag, { sinistro: registroAberto }),
                    React.createElement("div", { className: "muted", style: { marginTop: 6 } }, situacaoMotoristaSinistro(registroAberto).descricao)),
                React.createElement("div", { className: "card" },
                    React.createElement("label", null, "Ocorrido"),
                    React.createElement("b", null, dataHoraBRSinistro(registroAberto.dataHoraOcorrido))),
                React.createElement("div", { className: "card" },
                    React.createElement("label", null, "Ocorr\u00EAncia"),
                    React.createElement("b", null, registroAberto.tipoOcorrencia || '—'),
                    React.createElement("div", { className: "muted" }, registroAberto.tipoSinistro),
                    registroAberto.necessitaGuincho && React.createElement("div", { style: { marginTop: 6, fontWeight: 800, color: 'var(--erro)' } }, "\uD83D\uDEA8 Guincho necess\u00E1rio")),
                React.createElement("div", { className: "card" },
                    React.createElement("label", null, "Local"),
                    React.createElement("b", null, registroAberto.localOcorrido),
                    React.createElement("div", { className: "muted" },
                        registroAberto.municipio,
                        " / ",
                        registroAberto.uf))),
            React.createElement("div", { className: "card", style: { marginTop: 10 } },
                React.createElement("label", null, "Descri\u00E7\u00E3o do ocorrido"),
                React.createElement("div", { style: { whiteSpace: 'pre-wrap' } }, registroAberto.descricaoOcorrido)),
            (registroAberto.solicitacoesDocumentos || []).length > 0 && React.createElement("div", { className: "card", style: { marginTop: 10 } },
                React.createElement("h3", null, "Solicita\u00E7\u00F5es da Log\u00EDstica"),
                React.createElement("div", { className: "muted", style: { marginTop: 3 } }, "Envie somente os documentos solicitados abaixo. Cada item possui acompanhamento pr\u00F3prio."),
                registroAberto.solicitacoesDocumentos.map(doc => { const chave = normalizarPerfil(doc.statusDocumento); const podeEnviar = normalizarPerfil(registroAberto.statusSinistro) === 'AGUARDANDO_DOCUMENTOS' && ['PENDENTE', 'PENDENTE_DE_ENVIO', 'REJEITADO'].includes(chave); const dados = complementos[doc.id] || {}; return React.createElement("div", { className: 'sinistro-documento-item ' + (chave === 'REJEITADO' ? 'rejeitado' : chave === 'PENDENTE_DE_ENVIO' ? 'pendente' : chave === 'ENVIADO' ? 'enviado' : chave === 'ACEITO' ? 'aceito' : 'dispensado'), key: doc.id },
                    React.createElement("div", { className: "row" },
                        React.createElement("div", { className: "grow" },
                            React.createElement("b", null, doc.tipoDocumento),
                            doc.obrigatorio && React.createElement("span", { className: "muted" }, " \u00B7 obrigat\u00F3rio")),
                        React.createElement(DocumentoStatusTag, { s: doc.statusDocumento })),
                    doc.descricaoSolicitacao && React.createElement("div", { style: { marginTop: 7, whiteSpace: 'pre-wrap' } }, doc.descricaoSolicitacao),
                    doc.motivoRejeicao && React.createElement("div", { className: "erro-box", style: { marginTop: 8 } },
                        React.createElement("b", null, "Motivo para reenviar:"),
                        " ",
                        doc.motivoRejeicao),
                    (doc.arquivos || []).length > 0 && React.createElement(GaleriaArquivosSinistro, { arquivos: doc.arquivos }),
                    podeEnviar && React.createElement("div", { style: { marginTop: 10 } },
                        React.createElement("label", null, chave === 'REJEITADO' ? 'Reenviar arquivo(s)' : 'Adicionar arquivo(s)'),
                        React.createElement("input", { type: "file", multiple: true, accept: "image/*,.pdf,.doc,.docx,video/*", onChange: e => { selecionarComplemento(doc.id, e.target.files || []); e.target.value = ''; } }),
                        React.createElement("div", { className: "muted", style: { marginTop: 5 } }, "At\u00E9 8 arquivos. No celular, voc\u00EA pode selecionar v\u00E1rios de uma vez ou voltar em \u201CEscolher arquivos\u201D para adicionar outros sem perder os j\u00E1 escolhidos."),
                        (dados.arquivos || []).map((a, i) => React.createElement("div", { className: "sinistro-arquivo", key: (a.chave || a.nome) + i },
                            React.createElement("span", null, "\uD83D\uDCCE"),
                            React.createElement("span", { className: "grow" }, a.nome),
                            React.createElement("button", { type: "button", className: "btn btn-g btn-sm", onClick: () => removerComplementoArquivo(doc.id, i) }, "Remover"))),
                        React.createElement("div", { style: { marginTop: 8 } },
                            React.createElement("label", null, "Observa\u00E7\u00E3o (opcional)"),
                            React.createElement("textarea", { rows: "2", value: dados.observacao || '', onChange: e => setComplementos(prev => ({ ...prev, [doc.id]: { ...(prev[doc.id] || {}), observacao: e.target.value } })) })),
                        React.createElement("button", { className: "btn btn-p", style: { width: '100%', marginTop: 8 }, disabled: enviandoDocumentoId === doc.id, onClick: () => enviarComplemento(doc) }, enviandoDocumentoId === doc.id ? 'Enviando...' : (chave === 'REJEITADO' ? 'Reenviar documento' : 'Enviar documento'))),
                    chave === 'ENVIADO' && React.createElement("div", { className: "aviso-box", style: { marginTop: 8 } }, "Documento recebido e aguardando confer\u00EAncia da Log\u00EDstica.")); })),
            React.createElement("div", { className: "card", style: { marginTop: 10 } },
                React.createElement("h3", null, "Documentos e evid\u00EAncias do registro inicial"),
                (registroAberto.documentos || []).length ? React.createElement(GaleriaArquivosSinistro, { arquivos: registroAberto.documentos }) : React.createElement("div", { className: "muted", style: { marginTop: 8 } }, "Nenhum arquivo no envio inicial.")),
            React.createElement("div", { className: "card", style: { marginTop: 10 } },
                React.createElement("h3", null, "Hist\u00F3rico"),
                (registroAberto.historico || []).length ? (registroAberto.historico || []).map(h => { const p = historicoSinistroApresentacao(h); return React.createElement("div", { className: "linha-item", key: h.id },
                    React.createElement("span", null,
                        React.createElement("b", null, p.acao),
                        React.createElement("span", { className: "muted", style: { display: 'block' } },
                            dataHoraBRSinistro(h.dataHora),
                            " \u00B7 ",
                            h.usuario || h.perfil),
                        p.observacao && React.createElement("span", { style: { display: 'block', marginTop: 3, whiteSpace: 'pre-wrap' } }, p.observacao))); }) : React.createElement("div", { className: "muted", style: { marginTop: 8 } }, "Sem movimenta\u00E7\u00F5es adicionais."))));
}
/* ================= SHELL MOTORISTA ================= */
function AlterarSenhaUsuario({user,onSair,toast,claro=false}){
 const [aberto,setAberto]=useState(false),[form,setForm]=useState({senhaAtual:"",novaSenha:"",confirmacao:""}),[salvando,setSalvando]=useState(false),[erro,setErro]=useState("");
 const motorista=normalizarPerfil(user.perfil)==="MOTORISTA";
 const salvar=async e=>{e.preventDefault();setErro("");if(form.novaSenha!==form.confirmacao){setErro("A confirmação não corresponde à nova senha.");return;}setSalvando(true);try{await ApiService._req("POST","/me/senha",form);setForm({senhaAtual:"",novaSenha:"",confirmacao:""});setAberto(false);toast("Senha alterada. Entre novamente com a nova senha.");onSair();}catch(e){setErro(e.message);}finally{setSalvando(false);}};
 return React.createElement(React.Fragment,null,
 React.createElement("button",{className:"btn btn-sm "+(claro?"btn-g":""),style:claro?{}:{color:"rgba(255,255,255,.85)"},onClick:()=>{setErro("");setAberto(true);}},motorista?"Alterar PIN":"Alterar senha"),
 aberto&&React.createElement(Modal,{titulo:motorista?"Alterar PIN":"Alterar senha",onClose:()=>{if(!salvando){setAberto(false);setForm({senhaAtual:"",novaSenha:"",confirmacao:""});}}},
 React.createElement("form",{onSubmit:salvar},
 React.createElement("p",{className:"muted",style:{marginBottom:16}},motorista?"Use seis números. Após alterar, entre novamente.":"Use pelo menos 8 caracteres. Pode usar uma palavra ou frase fácil de lembrar. Após alterar, entre novamente."),
 ["senhaAtual","novaSenha","confirmacao"].map((k,i)=>React.createElement("div",{key:k,style:{marginBottom:14}},React.createElement("label",{htmlFor:"conta-"+k},[motorista?"PIN atual":"Senha atual",motorista?"Novo PIN":"Nova senha","Confirmar "+(motorista?"novo PIN":"nova senha")][i]),React.createElement("input",{id:"conta-"+k,type:"password",required:true,autoComplete:i===0?"current-password":"new-password",inputMode:motorista?"numeric":undefined,maxLength:motorista?6:128,value:form[k],onChange:e=>setForm(f=>({...f,[k]:e.target.value}))}))),
 erro&&React.createElement("div",{className:"erro-box",role:"alert"},erro),
 React.createElement("button",{className:"btn btn-p",type:"submit",disabled:salvando},salvando?"Salvando...":"Salvar alteração"))));
}

function MotoristaApp({ st, setSt, user, onSair, toast }) {
    const abas = [
        user.perms.cargas && { id: 'cargas', ic: '🚛', nome: 'Cargas' },
        user.perms.premiacao && { id: 'prem', ic: '🏆', nome: 'Premiação' },
        user.perms.checklist && { id: 'check', ic: '📋', nome: 'Check list' },
        user.perms.sinistros && { id: 'sinistro', ic: '🚨', nome: 'Sinistro' },
        user.perms.agendamentos && { id: 'agendamento', ic: '📅', nome: 'Agendamento' },
    ].filter(Boolean);
    const [aba, setAba] = useModuloPortal('motorista', user, abas.map(a => a.id));
    const dados = usarDadosMensais(st);
    const [carregandoCargas, setCarregandoCargas] = useState(!CONFIG.MODO_TESTE_LOCAL);
    const [carregandoPremiacao, setCarregandoPremiacao] = useState(!CONFIG.MODO_TESTE_LOCAL);
    useEffect(() => {
        if (CONFIG.MODO_TESTE_LOCAL || !['cargas', 'prem'].includes(aba))
            return;
        let ativo = true;
        Promise.allSettled([
            aba === 'prem' && user.perms.cargas ? ApiService.obterCargas() : Promise.resolve(null),
            user.perms.premiacao ? ApiService.obterPremiacao() : Promise.resolve({metas:[],descontos:[],apuracoes:[]}),
            user.perms.cargas ? ApiService.obterMinhasContestacoes() : Promise.resolve({contestacoes:[]})
        ]).then(([cargasResult, premiacaoResult, contestacoesResult]) => {
            if (!ativo)
                return;
            setSt(s => {
                const proximo = { ...s };
                if (cargasResult.status === 'fulfilled' && cargasResult.value) {
                    const r = cargasResult.value;
                    proximo.cargas = Array.isArray(r.cargas) ? r.cargas : [];
                }
                if (premiacaoResult.status === 'fulfilled') {
                    const p = premiacaoResult.value;
                    proximo.metas = Array.isArray(p.metas) ? p.metas : s.metas;
                    proximo.descontos = Array.isArray(p.descontos) ? p.descontos : s.descontos;
                    proximo.apuracoes = Array.isArray(p.apuracoes) ? p.apuracoes : [];
                }
                if (contestacoesResult.status === 'fulfilled') {
                    const ct = contestacoesResult.value;
                    proximo.contestacoes = Array.isArray(ct.contestacoes) ? ct.contestacoes : [];
                }
                return proximo;
            });
            const falhasEssenciais = [];
            if (cargasResult.status === 'rejected')
                falhasEssenciais.push('cargas');
            if (premiacaoResult.status === 'rejected')
                falhasEssenciais.push('premiação');
            if (falhasEssenciais.length) {
                toast('Não foi possível carregar: ' + falhasEssenciais.join(' e ') + '. Tente novamente.');
            }
            if (contestacoesResult.status === 'rejected') {
                console.warn('Contestações temporariamente indisponíveis:', contestacoesResult.reason);
            }
        }).finally(() => {
            if (ativo) {
                setCarregandoCargas(false);
                setCarregandoPremiacao(false);
            }
        });
        return () => { ativo = false; };
    }, [user.id, aba]);
    useAtualizacaoPortal(['cargas','premiacao','contestacoes','cadastros'], () => {
        if (!['cargas', 'prem'].includes(aba)) return;
        return Promise.allSettled([
            aba === 'prem' && user.perms.cargas ? ApiService.obterCargas() : Promise.resolve(null),
            user.perms.premiacao ? ApiService.obterPremiacao() : Promise.resolve({metas:[],descontos:[],apuracoes:[]}),
            user.perms.cargas ? ApiService.obterMinhasContestacoes() : Promise.resolve({contestacoes:[]})
        ]).then(([cargasResult, premiacaoResult, contestacoesResult]) => {
            setSt(s => {
                const proximo = { ...s };
                if (cargasResult.status === 'fulfilled' && cargasResult.value) {
                    const r = cargasResult.value;
                    proximo.cargas = Array.isArray(r.cargas) ? r.cargas : [];
                }
                if (premiacaoResult.status === 'fulfilled') {
                    const p = premiacaoResult.value;
                    proximo.metas = Array.isArray(p.metas) ? p.metas : s.metas;
                    proximo.descontos = Array.isArray(p.descontos) ? p.descontos : s.descontos;
                    proximo.apuracoes = Array.isArray(p.apuracoes) ? p.apuracoes : [];
                }
                if (contestacoesResult.status === 'fulfilled') {
                    const ct = contestacoesResult.value;
                    proximo.contestacoes = Array.isArray(ct.contestacoes) ? ct.contestacoes : [];
                }
                return proximo;
            });
        });
    });
    const [inicioChecklistAgendamento, setInicioChecklistAgendamento] = useState(null);
    const abrirChecklistDoAgendamento = dados => { setInicioChecklistAgendamento(dados); setAba('check'); };
    const placa = Object.values(st.frota).find(f => f.motorista === user.nome && f.frota !== 'leve');
    const recuperarAplicativo = async () => {
        const ok = window.confirm('Usar a recuperação deste aparelho?\n\n' +
            'Rascunhos e registros incompletos serão apagados. Checklists válidos aguardando internet serão preservados.');
        if (!ok)
            return;
        try {
            await FilaEnvio.sanear(user.login);
            await IDB.apagarRascunho('ck_' + String(user.login || '').toLowerCase() + '_' + HOJE).catch(() => { });
            ApiService.sair();
            const url = new URL(window.location.href);
            url.searchParams.set('atualizar', CONFIG.VERSAO + '-' + Date.now());
            window.location.replace(url.toString());
        }
        catch (e) {
            toast('Não foi possível recuperar automaticamente. Avise a logística.');
        }
    };
    return (React.createElement("div", { className: 'mshell' + (aba === 'agendamento' ? ' mshell-agendamento' : '') },
        React.createElement("div", { className: "mtop row" },
            React.createElement("div", { className: "grow" },
                React.createElement("div", { className: "nome" }, primeiroNome(user.nome)),
                React.createElement("div", { className: "sub" }, placa ? placa.tipo : 'Motorista')),
            placa && React.createElement("span", { className: "chip-placa" }, placa.placa),
            React.createElement(AvisoPrivacidade,{claro:true}),
            React.createElement(AlterarSenhaUsuario,{user,onSair,toast}),
            React.createElement("button", { className: "btn btn-sm", style: { color: 'rgba(255,255,255,.8)' }, onClick: onSair }, "Sair")),
        React.createElement("div", { className: "mbody" },
            abas.length === 0 && React.createElement("div", { className: "card muted" }, "Seu usu\u00E1rio est\u00E1 sem m\u00F3dulos liberados. Fale com a log\u00EDstica."),
            aba === 'cargas' && carregandoCargas && React.createElement("div", { className: "card muted" }, "Carregando cargas do banco D1 de homologação..."),
            aba === 'cargas' && !carregandoCargas && React.createElement(TelaCargas, { st: st, setSt: setSt, user: user, toast: toast }),
            aba === 'prem' && carregandoPremiacao && React.createElement("div", { className: "card muted" }, "Carregando metas, apura\u00E7\u00E3o e descontos do banco D1 de homologação..."),
            aba === 'prem' && !carregandoPremiacao && React.createElement(TelaPremiacao, { st: st, user: user, dados: dados }),
            aba === 'check' && React.createElement(TelaChecklist, { st: st, setSt: setSt, user: user, toast: toast, inicioAgendamento: inicioChecklistAgendamento, onInicioConsumido: () => { setInicioChecklistAgendamento(null); setAba('agendamento'); }, onConcluidoAgendamento: () => { setInicioChecklistAgendamento(null); setAba('agendamento'); } }),
            aba === 'sinistro' && React.createElement(TelaSinistro, { user: user, toast: toast }),
            aba === 'agendamento' && React.createElement(TelaAgendamento, { user: user, toast: toast, onAbrirChecklist: abrirChecklistDoAgendamento }),
            React.createElement("div", { className: "card", style: { padding: 12, marginTop: 2 } },
                React.createElement("div", { className: "row" },
                    React.createElement("div", { className: "grow" },
                        React.createElement("div", { style: { fontWeight: 700, fontSize: 13 } }, "Problema neste aparelho?"),
                        React.createElement("div", { className: "muted" },
                            "Vers\u00E3o ",
                            CONFIG.VERSAO)),
                    React.createElement("button", { className: "btn btn-g btn-sm", onClick: recuperarAplicativo }, "Limpar dados deste aparelho")))),
        React.createElement("nav", { className: "mtabs" }, abas.map(a => React.createElement("button", { key: a.id, className: 'mtab' + (aba === a.id ? ' on' : ''), onClick: () => setAba(a.id) },
            React.createElement("span", { className: "ic" }, a.ic),
            a.nome)))));
}
/* Fila mantida fora da tela: continua enquanto o usuário navega dentro do aplicativo. */
const FilaApuracaoRH = (() => {
    let estado = { rodando: false, total: 0, atual: 0, motorista: '', falhas: [], concluidos: 0, finalizadaEm: '' };
    const ouvintes = new Set();
    const publicar = () => ouvintes.forEach(fn => fn({ ...estado }));
    const iniciar = async ({ motoristas, competenciasPorMotorista }) => {
        if (estado.rodando || !motoristas.length)
            return false;
        estado = { rodando: true, total: motoristas.length, atual: 0, motorista: '', falhas: [], concluidos: 0, finalizadaEm: '' };
        publicar();
        for (let i = 0; i < motoristas.length; i++) {
            const u = motoristas[i];
            const competencias = competenciasPorMotorista.get(idUsuario(u));
            estado = { ...estado, atual: i + 1, motorista: u.nome };
            publicar();
            let concluiu = true;
            for (const competencia of competencias) {
                try {
                    await executarComRetentativa(async () => {
                        const resposta = await ApiService.obterPremiacaoMotorista(u.nome, [competencia]);
                        const apuracao = (resposta.apuracoes || []).find(a => a.competencia === competencia);
                        if (!apuracao)
                            throw new Error('A API não retornou a apuração.');
                        await ApiService.salvarApuracoes(idUsuario(u), [apuracao], 'RH_QUADRIMESTRE');
                    });
                } catch (e) {
                    concluiu = false;
                    estado = { ...estado, falhas: [...estado.falhas, `${u.nome} · ${competencia}: ${e.message}`] };
                    publicar();
                }
            }
            if (concluiu) {
                estado = { ...estado, concluidos: estado.concluidos + 1 };
                publicar();
            }
            if (i < motoristas.length - 1)
                await aguardar(1800);
        }
        estado = { ...estado, rodando: false, motorista: '', finalizadaEm: agoraISO() };
        publicar();
        return true;
    };
    return {
        iniciar,
        obter: () => ({ ...estado }),
        assinar(fn) { ouvintes.add(fn); fn({ ...estado }); return () => ouvintes.delete(fn); }
    };
})();
/* ================= ADM: PAINEL ================= */
function PainelRH({ st, dados, user }) {
    const anoAtual = String(new Date().getFullYear());
    const [ano, setAno] = useState(anoAtual);
    const [quadrimestre, setQuadrimestre] = useState('2');
    const [nome, setNome] = useState('');
    const [aberto, setAberto] = useState('');
    const [usuariosRH, setUsuariosRH] = useState([]);
    const [vinculosRH, setVinculosRH] = useState([]);
    const [apuracoesRH, setApuracoesRH] = useState({});
    const [carregandoRH, setCarregandoRH] = useState(false);
    const [erroRH, setErroRH] = useState('');
    const [progressoRH, setProgressoRH] = useState('');
    const [sucessoRH, setSucessoRH] = useState('');
    const [modoAtualizacao, setModoAtualizacao] = useState('PENDENTES');
    const [selecaoMesesRH, setSelecaoMesesRH] = useState(null);
    const [selecionados, setSelecionados] = useState([]);
    const [filaRH, setFilaRH] = useState(FilaApuracaoRH.obter());
    const [auditoriasRH, setAuditoriasRH] = useState({});
    const mesesPorQuad = { '1': ['01', '02', '03', '04'], '2': ['05', '06', '07', '08'], '3': ['09', '10', '11', '12'] };
    const meses = (mesesPorQuad[quadrimestre] || mesesPorQuad['1']).map(m => m + '/' + ano);
    const competenciaAtual = new Date().toISOString().slice(0, 7);
    const mesesProcessaveis = meses.filter(m => (m.slice(3) + '-' + m.slice(0, 2)) <= competenciaAtual);
    const periodoAindaNaoIniciado = mesesProcessaveis.length === 0;
    const inicioPeriodo = `${ano}-${mesesPorQuad[quadrimestre][0]}-01`;
    const ultimoMes = mesesPorQuad[quadrimestre][3];
    const fimPeriodo = new Date(Number(ano), Number(ultimoMes), 0).toISOString().slice(0, 10);
    const motoristasPeriodo = usuariosRH
        .filter(u => usuarioValidoPremiacaoPeriodo(u, vinculosRH, inicioPeriodo, fimPeriodo))
        .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    const motoristas = motoristasPeriodo
        .filter(u => String(u.nome || '').toLocaleLowerCase('pt-BR').includes(nome.toLocaleLowerCase('pt-BR')));
    useEffect(() => {
        if (CONFIG.MODO_TESTE_LOCAL) {
            setUsuariosRH(st.usuarios || []);
            setVinculosRH(st.vinculos || []);
            return;
        }
        let ativo = true;
        setCarregandoRH(true);
        setErroRH('');
        ApiService._req('GET', '/admin/rh/motoristas')
            .then(r => {
            if (!ativo)
                return;
            setUsuariosRH(Array.isArray(r.usuarios) ? r.usuarios : []);
            setVinculosRH(Array.isArray(r.vinculos) ? r.vinculos : []);
        })
            .catch(e => {
            if (!ativo)
                return;
            setUsuariosRH([]);
            setErroRH('Não foi possível carregar os motoristas: ' + e.message);
        })
            .finally(() => { if (ativo)
            setCarregandoRH(false); });
        return () => { ativo = false; };
    }, []);
    useEffect(() => {
        if (CONFIG.MODO_TESTE_LOCAL)
            return;
        let ativo = true;
        setCarregandoRH(true);
        setErroRH('');
        // Ao entrar ou trocar de quadrimestre, carrega somente o que já foi salvo.
        // A conferência completa das cargas fica restrita à atualização solicitada
        // pelo usuário, evitando consultas pesadas e repetidas ao Graph.
        ApiService.obterApuracoesSalvas('', '', { somenteSalvas: true })
            .then(r => {
            if (!ativo)
                return;
            const porMotorista = {};
            (r.apuracoes || []).forEach(item => {
                const chave = String(item.motoristaId || '');
                porMotorista[chave] = porMotorista[chave] || [];
                porMotorista[chave].push(apuracaoSalvaParaTela(item));
            });
            setApuracoesRH(porMotorista);
        })
            .catch(e => { if (ativo)
            setErroRH('Não foi possível carregar as apurações salvas: ' + e.message); })
            .finally(() => { if (ativo)
            setCarregandoRH(false); });
        return () => { ativo = false; };
    }, [ano, quadrimestre]);
    useEffect(() => FilaApuracaoRH.assinar(setFilaRH), []);
    useEffect(() => {
        if (!filaRH.rodando && filaRH.finalizadaEm) {
            setCarregandoRH(true);
            ApiService.obterApuracoesSalvas('', '', { somenteSalvas: true }).then(atualizadas => {
                const porMotorista = {};
                (atualizadas.apuracoes || []).forEach(item => {
                    const chave = String(item.motoristaId || '');
                    const u = usuariosRH.find(x => idUsuario(x) === chave);
                    porMotorista[chave] = porMotorista[chave] || [];
                    porMotorista[chave].push(apuracaoSalvaParaTela(item, u?.nome || ''));
                });
                setApuracoesRH(porMotorista);
                if (filaRH.falhas.length)
                    setErroRH(`${filaRH.falhas.length} apuração(ões) mensal(is) pendente(s): ${filaRH.falhas.join(' | ')}`);
                else
                    setErroRH('');
            }).catch(e => setErroRH('A atualização terminou, mas não foi possível recarregar a tabela: ' + e.message))
                .finally(() => setCarregandoRH(false));
        }
    }, [filaRH.finalizadaEm]);
    const competenciaRH = mes => mes.slice(3) + '-' + mes.slice(0, 2);
    const competenciasPorMotorista = new Map(motoristasPeriodo.map(u => [
        idUsuario(u),
        meses.map(competenciaRH).filter(competencia => {
            const [anoMes, mesNumero] = competencia.split('-').map(Number);
            const fimMes = new Date(Date.UTC(anoMes, mesNumero, 0)).toISOString().slice(0, 10);
            return usuarioValidoPremiacaoPeriodo(u, vinculosRH, competencia + '-01', fimMes);
        })
    ]));
    const competenciasProcessaveis = new Set(mesesProcessaveis.map(competenciaRH));
    const competenciasParaCalcular = new Map([...competenciasPorMotorista].map(([id, competencias]) => [
        id, competencias.filter(c => competenciasProcessaveis.has(c))
    ]));
    const chavePeriodoRH = ano + '-' + quadrimestre;
    const mesesAtualizacaoRH = selecaoMesesRH?.periodo === chavePeriodoRH
        ? selecaoMesesRH.meses.filter(c => competenciasProcessaveis.has(c))
        : [...competenciasProcessaveis];
    const competenciasSelecionadasRH = new Map([...competenciasParaCalcular].map(([id, competencias]) => [
        id, competencias.filter(c => mesesAtualizacaoRH.includes(c))
    ]));
    const competenciasEsperadas = motoristasPeriodo.flatMap(u => competenciasParaCalcular.get(idUsuario(u))
        .map(competencia => ({ u, competencia, chave: idUsuario(u) + '|' + competencia })));
    const recalcularQuadrimestre = async () => {
        if (filaRH.rodando || periodoBloqueado)
            return;
        if (periodoAindaNaoIniciado) {
            setErroRH(`O ${quadrimestre}º quadrimestre de ${ano} ainda não começou. Não há competências disponíveis para atualizar.`);
            return;
        }
        if (!mesesAtualizacaoRH.length) {
            setErroRH('Selecione pelo menos uma competência para atualizar.');
            return;
        }
        const elegiveis = motoristas.filter(u => competenciasSelecionadasRH.get(idUsuario(u)).length > 0);
        const pendentesPorMotorista = new Map(elegiveis.map(u => {
            const id = idUsuario(u);
            return [id, competenciasSelecionadasRH.get(id).filter(c => !apuracaoProntaRH(apuracoesPorChave.get(id + '|' + c)))];
        }));
        const pendentes = elegiveis.filter(u => pendentesPorMotorista.get(idUsuario(u)).length > 0);
        const escolhidos = modoAtualizacao === 'TODOS' ? elegiveis :
            modoAtualizacao === 'PENDENTES' ? pendentes :
                elegiveis.filter(u => selecionados.includes(idUsuario(u)));
        if (!escolhidos.length) {
            setErroRH(modoAtualizacao === 'SELECIONADOS' ? 'Selecione pelo menos um motorista com competência aplicável.' : 'Não há motoristas pendentes ou com erro neste quadrimestre.');
            return;
        }
        setErroRH('');
        setAuditoriasRH({});
        await FilaApuracaoRH.iniciar({ motoristas: escolhidos, competenciasPorMotorista: modoAtualizacao === 'PENDENTES' ? pendentesPorMotorista : competenciasSelecionadasRH });
    };
    const apuracoesPorChave = new Map();
    motoristasPeriodo.forEach(u => (apuracoesRH[idUsuario(u)] || []).forEach(a => {
        const competencia = String(a.competencia || '');
        if (meses.some(m => competencia === m.slice(3) + '-' + m.slice(0, 2))) {
            apuracoesPorChave.set(idUsuario(u) + '|' + competencia, a);
        }
    }));
    const apuracaoProntaRH = a => ['CALCULADO', 'FECHADO'].includes(String(a?.status || '').toUpperCase()) && a?.desatualizada !== true;
    const apuracoesEsperadasQuadrimestre = motoristasPeriodo.flatMap(u => competenciasPorMotorista.get(idUsuario(u))
        .map(c => apuracoesPorChave.get(idUsuario(u) + '|' + c)));
    const totalProntoRH = apuracoesEsperadasQuadrimestre.filter(apuracaoProntaRH).length;
    const totalAplicavelRH = apuracoesEsperadasQuadrimestre.length;
    const ausentes = competenciasEsperadas.filter(item => !apuracoesPorChave.has(item.chave));
    const totalEsperado = competenciasEsperadas.length;
    const totalAusentes = ausentes.length;
    const totalEncontrado = totalEsperado - totalAusentes;
    const totalFechados = competenciasEsperadas.filter(item => String(apuracoesPorChave.get(item.chave)?.status || '').toUpperCase() === 'FECHADO').length;
    const haRegistrosFechados = totalFechados > 0;
    const quadrimestreFechado = totalAplicavelRH > 0 && totalFechados === totalAplicavelRH;
    const fechadoComPendencias = haRegistrosFechados && !quadrimestreFechado;
    const periodoBloqueado = haRegistrosFechados;
    const podeFechar = totalEsperado > 0 && totalAusentes === 0 &&
        competenciasEsperadas.every(item => ['CALCULADO', 'FECHADO'].includes(String(apuracoesPorChave.get(item.chave)?.status || '').toUpperCase()) &&
            apuracoesPorChave.get(item.chave)?.desatualizada !== true);
    const podeFecharPeloPerfil = pode(user, 'quadrimestre.fechar');
    const podeReabrirPeloPerfil = pode(user, 'quadrimestre.reabrir');
    const alterarFechamento = async (acao) => {
        if (carregandoRH)
            return;
        if (acao === 'FECHAR' && quadrimestreFechado)
            return;
        if (acao === 'REABRIR' && !haRegistrosFechados)
            return;
        if (acao === 'FECHAR' && new Date().toISOString().slice(0, 10) <= fimPeriodo) {
            setErroRH(`O ${quadrimestre}º quadrimestre de ${ano} termina em ${dataBR(fimPeriodo)}. O fechamento definitivo só será liberado após o encerramento do período.`);
            return;
        }
        if (acao === 'FECHAR' && !podeFechar) {
            const amostraAusentes = ausentes.slice(0, 6).map(item => `${item.u.nome} — ${mesLabel(item.competencia.slice(5) + '/' + item.competencia.slice(0, 4))}`);
            const outros = Math.max(0, ausentes.length - amostraAusentes.length);
            setErroRH(totalAusentes
                ? `Não é possível fechar: faltam ${totalAusentes} competência(s) aplicável(is). ${amostraAusentes.join(' | ')}${outros ? ` | e mais ${outros}` : ''}. Atualize as pendências antes de fechar.`
                : 'Não é possível fechar: ainda existem apurações pendentes ou com erro.');
            return;
        }
        const pergunta = acao === 'FECHAR'
            ? `Fechar TODO o ${quadrimestre}º quadrimestre de ${ano}? Os valores ficarão bloqueados. A seleção de motoristas é usada somente para atualizar apurações.`
            : `Reabrir TODO o ${quadrimestre}º quadrimestre de ${ano}? Somente os registros que ainda estão FECHADOS voltarão para PENDENTE. A seleção de motoristas não altera esta ação.`;
        if (!window.confirm(pergunta))
            return;
        setCarregandoRH(true);
        setErroRH('');
        setSucessoRH('');
        setProgressoRH(acao === 'FECHAR'
            ? 'Fechando o quadrimestre e bloqueando os lançamentos. Aguarde...'
            : 'Reabrindo os registros fechados do quadrimestre. Aguarde...');
        try {
            const resposta = await executarComRetentativa(() => ApiService.alterarStatusQuadrimestre(ano, quadrimestre, acao));
            const totalAlterado = Number(resposta.total || 0);
            const atualizadas = await ApiService.obterApuracoesSalvas('', '', { somenteSalvas: true });
            const porMotorista = {};
            (atualizadas.apuracoes || []).forEach(item => {
                const chave = String(item.motoristaId || '');
                const u = usuariosRH.find(x => idUsuario(x) === chave);
                porMotorista[chave] = porMotorista[chave] || [];
                porMotorista[chave].push(apuracaoSalvaParaTela(item, u?.nome || ''));
            });
            setApuracoesRH(porMotorista);
            setSucessoRH(acao === 'FECHAR'
                ? `Quadrimestre fechado com sucesso. ${totalAlterado} apuração(ões) foram bloqueadas.`
                : totalAlterado
                    ? `Quadrimestre reaberto com sucesso. ${totalAlterado} apuração(ões) fechadas voltaram para PENDENTE.`
                    : 'O quadrimestre já não possuía registros FECHADOS para reabrir.');
        }
        catch (e) {
            setErroRH('Falha ao alterar o fechamento: ' + e.message);
            try {
                const atuais = await ApiService.obterApuracoesSalvas('', '', { somenteSalvas: true });
                const porMotorista = {};
                (atuais.apuracoes || []).forEach(item => {
                    const chave = String(item.motoristaId || '');
                    const u = usuariosRH.find(x => idUsuario(x) === chave);
                    porMotorista[chave] = porMotorista[chave] || [];
                    porMotorista[chave].push(apuracaoSalvaParaTela(item, u?.nome || ''));
                });
                setApuracoesRH(porMotorista);
            }
            catch (_) { }
        }
        finally {
            setCarregandoRH(false);
            setProgressoRH('');
        }
    };
    const confirmarSemMovimentoRH = async (motorista, competencia) => {
        if (carregandoRH || filaRH.rodando || periodoBloqueado)
            return;
        if (!window.confirm(`Confirmar que ${motorista.nome} não teve cargas em ${competencia} e gravar a apuração em R$ 0,00?`))
            return;
        const motoristaId = idUsuario(motorista);
        setCarregandoRH(true);
        setErroRH('');
        setSucessoRH('');
        try {
            await ApiService.salvarApuracoes(motoristaId, [{ competencia, apurado: 0, premioBruto: 0, totalDescontos: 0 }], 'RH_SEM_MOVIMENTO');
            const item = apuracaoSalvaParaTela({ competencia, status: 'CALCULADO', semMovimento: true }, motorista.nome);
            setApuracoesRH(v => ({ ...v, [motoristaId]: [...(v[motoristaId] || []).filter(a => a.competencia !== competencia), item] }));
            setAuditoriasRH(v => ({ ...v, [motoristaId]: null }));
            setSucessoRH(`${motorista.nome} — ${competencia} registrado como Sem movimento.`);
        } catch (e) {
            setErroRH(e.message);
        } finally {
            setCarregandoRH(false);
        }
    };
    const alternarAuditoria = async (linha) => {
        const motoristaId = idUsuario(linha.u);
        if (aberto === linha.u.nome) {
            setAberto('');
            return;
        }
        setAberto(linha.u.nome);
        const atual = auditoriasRH[motoristaId];
        if (atual?.carregando || atual?.apuracoes)
            return;
        setAuditoriasRH(v => ({ ...v, [motoristaId]: { carregando: true, erro: '', apuracoes: null } }));
        try {
            const competenciasAuditoria = competenciasParaCalcular.get(motoristaId);
            if (!competenciasAuditoria.length) {
                setAuditoriasRH(v => ({ ...v, [motoristaId]: { carregando: false, erro: '', apuracoes: {} } }));
                return;
            }
            const porCompetencia = {};
            const erros = [];
            for (const competencia of competenciasAuditoria) {
                try {
                    const resposta = await ApiService.obterPremiacaoMotorista(linha.u.nome, [competencia]);
                    const apuracao = (resposta.apuracoes || []).find(a => a.competencia === competencia);
                    if (apuracao)
                        porCompetencia[competencia] = apuracao;
                } catch (e) {
                    erros.push(e.message || String(e));
                }
            }
            setAuditoriasRH(v => ({ ...v, [motoristaId]: {
                    carregando: false, erro: erros.join(' | '), apuracoes: porCompetencia, carregadoEm: agoraISO()
                } }));
        }
        catch (e) {
            setAuditoriasRH(v => ({ ...v, [motoristaId]: {
                    carregando: false, erro: e.message || String(e), apuracoes: null
                } }));
        }
    };
    const linhas = motoristas.map(u => {
        const chave = idUsuario(u);
        const vindas = Array.isArray(apuracoesRH[chave]) ? apuracoesRH[chave] : [];
        const stMotorista = CONFIG.MODO_TESTE_LOCAL ? { ...st, apuracoes: vindas } : { usuarios: usuariosRH, frota: {}, cargas: [], metas: [], descontos: [], apuracoes: vindas };
        const apuracoes = meses.map(m => competenciasPorMotorista.get(chave).includes(competenciaRH(m))
            ? apuracaoMes(stMotorista, CONFIG.MODO_TESTE_LOCAL ? dados : {}, u.nome, m)
            : null);
        const acumulado = apuracoes.reduce((s, a) => s + Number(a?.apurado || 0), 0);
        const competenciasAplicaveis = competenciasPorMotorista.get(chave);
        const aplicaveis = competenciasAplicaveis.map(c => apuracoesPorChave.get(chave + '|' + c));
        const prontas = aplicaveis.filter(apuracaoProntaRH).length;
        const totalMeses = competenciasAplicaveis.length;
        const statusMotorista = totalMeses && aplicaveis.every(a => String(a?.status || '').toUpperCase() === 'FECHADO') ? 'FECHADO' :
            totalMeses && prontas === totalMeses ? 'CALCULADO' : prontas ? 'EM APURAÇÃO' : 'PENDENTE';
        return { u, apuracoes, acumulado, pagar: Math.max(0, acumulado), statusMotorista, prontas, totalMeses };
    });
    const total = linhas.reduce((s, l) => s + l.pagar, 0);
    return React.createElement(React.Fragment, null,
        React.createElement("div", { className: "row", style: { flexWrap: 'wrap' } },
            React.createElement("div", { className: "grow" },
                React.createElement("h2", null, "Fechamento de premia\u00E7\u00E3o \u2014 RH"),
                React.createElement("div", { className: "muted" },
                    "Exibe os \u00FAltimos valores salvos e identifica cargas alteradas ap\u00F3s o c\u00E1lculo. O rec\u00E1lculo ocorre somente quando solicitado. ",
                    React.createElement("b", null,
                        "Vers\u00E3o ",
                        CONFIG.VERSAO,
                        "."))),
            React.createElement("button", { className: 'btn btn-sm ' + (!periodoBloqueado && pode(user, 'quadrimestre.atualizar') ? 'btn-p' : 'btn-g'), disabled: periodoBloqueado || periodoAindaNaoIniciado || carregandoRH || filaRH.rodando || !pode(user, 'quadrimestre.atualizar'), title: periodoBloqueado ? 'Reabra o quadrimestre para atualizar as apurações.' : periodoAindaNaoIniciado ? 'Este quadrimestre ainda não começou.' : '', onClick: recalcularQuadrimestre }, filaRH.rodando ? 'Atualização em andamento' : 'Atualizar selecionados'),
            React.createElement("button", { className: 'btn btn-sm ' + (!periodoBloqueado && podeFecharPeloPerfil ? 'btn-p' : 'btn-g'), disabled: periodoBloqueado || periodoAindaNaoIniciado || carregandoRH || filaRH.rodando || !podeFecharPeloPerfil, title: !periodoBloqueado && !podeFechar ? 'Ao clicar, o sistema informará exatamente quais apurações impedem o fechamento.' : '', onClick: () => alterarFechamento('FECHAR') }, "Fechar quadrimestre"),
            React.createElement("button", { className: 'btn btn-sm ' + (haRegistrosFechados && podeReabrirPeloPerfil ? 'btn-p' : 'btn-g'), disabled: !haRegistrosFechados || carregandoRH || filaRH.rodando || !podeReabrirPeloPerfil, title: !haRegistrosFechados ? 'Disponível somente após o fechamento do quadrimestre.' : '', onClick: () => alterarFechamento('REABRIR') }, "Reabrir quadrimestre")),
        React.createElement("div", { className: "card" },
            React.createElement("div", { className: "filtros-cadastro", style: { margin: 0 } },
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "painel-rh-motorista" }, "Motorista"),
                    React.createElement("input", { id: "painel-rh-motorista", name: "painel-rh-motorista", autoComplete: "off", value: nome, onChange: e => setNome(e.target.value), placeholder: "Filtrar por nome" })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "painel-rh-ano" }, "Ano"),
                    React.createElement("select", { id: "painel-rh-ano", name: "painel-rh-ano", value: ano, onChange: e => setAno(e.target.value) }, [2025, 2026, 2027, 2028].map(a => React.createElement("option", { key: a }, a)))),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "painel-rh-pagamento" }, "Pagamento"),
                    React.createElement("select", { id: "painel-rh-pagamento", name: "painel-rh-pagamento", value: quadrimestre, onChange: e => setQuadrimestre(e.target.value) },
                        React.createElement("option", { value: "1" }, "1\u00BA quadrimestre \u2014 jan a abr"),
                        React.createElement("option", { value: "2" }, "2\u00BA quadrimestre \u2014 mai a ago"),
                        React.createElement("option", { value: "3" }, "3\u00BA quadrimestre \u2014 set a dez"))),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "painel-rh-escopo-da-atualizacao" }, "Escopo da atualiza\u00E7\u00E3o"),
                    React.createElement("select", { id: "painel-rh-escopo-da-atualizacao", name: "painel-rh-escopo-da-atualizacao", value: modoAtualizacao, disabled: filaRH.rodando, onChange: e => setModoAtualizacao(e.target.value) },
                        React.createElement("option", { value: "PENDENTES" }, "Somente pendentes/erros"),
                        React.createElement("option", { value: "TODOS" }, "Todos os motoristas"),
                        React.createElement("option", { value: "SELECIONADOS" }, "Motoristas selecionados")))),
            React.createElement("fieldset", { style: { border: 0, margin: '12px 0 0', padding: 0 }, disabled: filaRH.rodando },
                React.createElement("legend", null, "Competências para atualizar"),
                React.createElement("div", { className: "row", style: { flexWrap: 'wrap', gap: 12 } },
                    React.createElement("button", { type: "button", className: "btn btn-g btn-sm", disabled: periodoAindaNaoIniciado, onClick: () => setSelecaoMesesRH(null) }, "Todos os meses disponíveis"),
                    mesesProcessaveis.map(m => {
                        const c = competenciaRH(m);
                        return React.createElement("label", { key: c },
                            React.createElement("input", { type: "checkbox", checked: mesesAtualizacaoRH.includes(c), onChange: e => setSelecaoMesesRH({
                                periodo: chavePeriodoRH,
                                meses: e.target.checked ? [...mesesAtualizacaoRH, c] : mesesAtualizacaoRH.filter(item => item !== c)
                            }) }), " ", mesLabel(m));
                    }))),
            React.createElement("div", { className: "muted", style: { marginTop: 8 } },
                "A sele\u00E7\u00E3o de motoristas vale somente para ",
                React.createElement("b", null, "Atualizar selecionados"),
                ". Fechar e reabrir s\u00E3o a\u00E7\u00F5es do quadrimestre inteiro.")),
        filaRH.rodando && React.createElement("div", { className: "aviso-box" },
            React.createElement("b", null, "Atualiza\u00E7\u00E3o em andamento:"),
            " ",
            filaRH.atual,
            " de ",
            filaRH.total,
            filaRH.motorista ? ' — ' + filaRH.motorista : '',
            ". Voc\u00EA pode navegar pelas outras telas do aplicativo, mas n\u00E3o feche nem atualize esta p\u00E1gina."),
        React.createElement("div", { className: "cards4" },
            React.createElement("div", { className: "card kpi" },
                React.createElement("div", { className: "l" }, "Motoristas"),
                React.createElement("div", { className: "v num" }, linhas.length)),
            React.createElement("div", { className: "card kpi" },
                React.createElement("div", { className: "l" }, "Total previsto para folha"),
                React.createElement("div", { className: "v num" }, brl(total))),
            React.createElement("div", { className: "card kpi" },
                React.createElement("div", { className: "l" }, "Per\u00EDodo"),
                React.createElement("div", { className: "v", style: { fontSize: 18 } },
                    quadrimestre,
                    "\u00BA quadrimestre/",
                    ano)),
            React.createElement("div", { className: "card kpi" },
                React.createElement("div", { className: "l" }, "Status"),
                React.createElement("div", { className: "v", style: { fontSize: 18 } }, quadrimestreFechado ? 'FECHADO' : podeFechar && new Date().toISOString().slice(0, 10) > fimPeriodo ? 'PRONTO PARA FECHAR' : totalProntoRH ? 'EM APURAÇÃO' : 'ABERTO'))),
        totalAusentes > 0 && React.createElement("div", { className: "aviso-box" },
            React.createElement("b", null, "Confer\u00EAncia do per\u00EDodo:"),
            " ",
            totalEncontrado,
            " de ",
            totalEsperado,
            " compet\u00EAncia(s) aplic\u00E1vel(is) possuem apura\u00E7\u00E3o salva.",
            ' ',
            "Faltam ",
            totalAusentes,
            ". Atualize as pend\u00EAncias antes de fechar o quadrimestre.",
            React.createElement("div", { className: "muted", style: { marginTop: 6 } },
                ausentes.slice(0, 8).map(item => `${item.u.nome} — ${mesLabel(item.competencia.slice(5) + '/' + item.competencia.slice(0, 4))}`).join(' | '),
                ausentes.length > 8 ? ` | e mais ${ausentes.length - 8}` : '')),
        periodoAindaNaoIniciado && React.createElement("div", { className: "aviso-box" },
            React.createElement("b", null, "Per\u00EDodo futuro:"),
            " o ",
            quadrimestre,
            "\u00BA quadrimestre de ",
            ano,
            " come\u00E7a em ",
            mesLabel(meses[0]),
            ". A atualiza\u00E7\u00E3o ser\u00E1 liberada quando a primeira compet\u00EAncia iniciar."),
        carregandoRH && !filaRH.rodando && React.createElement("div", { className: "aviso-box" }, progressoRH || 'Consultando as apurações salvas...'),
        sucessoRH && React.createElement("div", { className: "aviso-box", style: { color: 'var(--mata)' } }, sucessoRH),
        erroRH && React.createElement("div", { className: "aviso-box", style: { color: 'var(--erro)' } }, erroRH),
        React.createElement("div", { className: "card", style: { overflowX: 'auto' } },
            React.createElement("table", null,
                React.createElement("thead", null,
                    React.createElement("tr", null,
                        modoAtualizacao === 'SELECIONADOS' && React.createElement("th", null,
                            React.createElement("input", { type: "checkbox", disabled: filaRH.rodando, checked: motoristas.length > 0 && motoristas.every(u => selecionados.includes(idUsuario(u))), onChange: e => setSelecionados(e.target.checked ? motoristas.map(idUsuario) : []) })),
                        React.createElement("th", null, "Motorista"),
                        React.createElement("th", null, "Status"),
                        meses.map(m => React.createElement("th", { key: m, className: "td-num" }, mesLabel(m))),
                        React.createElement("th", { className: "td-num" }, "Acumulado"),
                        React.createElement("th", { className: "td-num" }, "Valor a pagar"),
                        React.createElement("th", null))),
                React.createElement("tbody", null, linhas.map(l => React.createElement(React.Fragment, { key: l.u.id || l.u.nome },
                    React.createElement("tr", null,
                        modoAtualizacao === 'SELECIONADOS' && React.createElement("td", null,
                            React.createElement("input", { type: "checkbox", disabled: filaRH.rodando, checked: selecionados.includes(idUsuario(l.u)), onChange: e => setSelecionados(v => e.target.checked ? [...new Set([...v, idUsuario(l.u)])] : v.filter(id => id !== idUsuario(l.u))) })),
                        React.createElement("td", null,
                            React.createElement("b", null, l.u.nome)),
                        React.createElement("td", null,
                            React.createElement("span", { className: 'tag ' + (l.statusMotorista === 'CALCULADO' || l.statusMotorista === 'FECHADO' ? 'tag-ok' :
                                    'tag-pend') }, l.statusMotorista === 'EM APURAÇÃO' ? `Em apuração · ${l.prontas}/${l.totalMeses}` : l.statusMotorista)),
                        l.apuracoes.map((a, i) => React.createElement("td", { key: meses[i], className: "td-num num", style: { color: a?.apurado < 0 ? 'var(--erro)' : 'inherit' } }, a ? (apuracoesPorChave.get(idUsuario(l.u) + '|' + competenciaRH(meses[i]))?.semMovimento ? 'Sem movimento' : brl(a.apurado)) : 'Sem vínculo')),
                        React.createElement("td", { className: "td-num num" },
                            React.createElement("b", { style: { color: l.acumulado < 0 ? 'var(--erro)' : 'var(--mata)' } }, brl(l.acumulado))),
                        React.createElement("td", { className: "td-num num" },
                            React.createElement("b", null, brl(l.pagar))),
                        React.createElement("td", null,
                            React.createElement("button", { className: "btn btn-s btn-sm", onClick: () => alternarAuditoria(l) }, aberto === l.u.nome ? 'Fechar' : 'Auditar'))),
                    aberto === l.u.nome && React.createElement("tr", null,
                        React.createElement("td", { colSpan: modoAtualizacao === 'SELECIONADOS' ? "10" : "9" },
                            auditoriasRH[idUsuario(l.u)]?.carregando && React.createElement("div", { className: "aviso-box" }, "Carregando faturamento e mem\u00F3ria de c\u00E1lculo..."),
                            auditoriasRH[idUsuario(l.u)]?.erro && React.createElement("div", { className: "aviso-box", style: { color: 'var(--erro)' } },
                                "Pendências na auditoria: ",
                                auditoriasRH[idUsuario(l.u)].erro),
                            React.createElement("div", { className: "cards4" }, l.apuracoes.map((salva, i) => {
                                if (!salva)
                                    return React.createElement("div", { className: "card", key: meses[i] }, mesLabel(meses[i]), " · Não aplicável — sem vínculo");
                                const competencia = meses[i].slice(3) + '-' + meses[i].slice(0, 2);
                                const aoVivo = auditoriasRH[idUsuario(l.u)]?.apuracoes?.[competencia];
                                const a = aoVivo ? apuracaoMes({ ...st, apuracoes: [{ ...aoVivo, mes: meses[i], motoristaNome: l.u.nome }] }, dados, l.u.nome, meses[i]) : salva;
                                return React.createElement("div", { className: "card", key: meses[i], style: { boxShadow: 'none', border: '1px solid var(--linha)' } },
                                    React.createElement("b", null, mesLabel(meses[i])),
                                    apuracoesPorChave.get(idUsuario(l.u) + '|' + competencia)?.semMovimento
                                        ? React.createElement("div", { className: "muted" }, "Sem movimento confirmado")
                                        : competencia < competenciaAtual && pode(user, 'quadrimestre.atualizar') && !periodoBloqueado && !aoVivo?.quantidadeCargas &&
                                            React.createElement("button", { className: "btn btn-s btn-sm", disabled: carregandoRH || filaRH.rodando, onClick: () => confirmarSemMovimentoRH(l.u, competencia) }, "Confirmar sem movimento"),
                                    React.createElement("div", { className: "linha-item" },
                                        React.createElement("span", null, "Tipo / meta"),
                                        React.createElement("span", null,
                                            a.tipo || '—',
                                            a.meta ? ' · ' + brl(a.meta.meta) : '')),
                                    React.createElement("div", { className: "linha-item" },
                                        React.createElement("span", null, "Faturamento"),
                                        React.createElement("b", null, aoVivo ? brl(a.fat) : '—')),
                                    Number(aoVivo?.meta?.meta) > 0 && React.createElement("div", { className: "linha-item" },
                                        React.createElement("span", null, "Meta atingida"),
                                        React.createElement("b", null, (100 * a.fat / Number(aoVivo.meta.meta)).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%')),
                                    React.createElement("div", { className: "linha-item" },
                                        React.createElement("span", null, "Premia\u00E7\u00E3o calculada"),
                                        React.createElement("span", null, brl(a.prod))),
                                    React.createElement("div", { className: "linha-item" },
                                        React.createElement("span", null, "Descontos"),
                                        React.createElement("span", { style: { color: Number(a.totDesc) !== 0 ? '#b42318' : 'inherit', fontWeight: Number(a.totDesc) !== 0 ? 700 : 400 } }, Number(a.totDesc) !== 0 ? brl(-Math.abs(a.totDesc)) : brl(0))),
                                    React.createElement("div", { className: "linha-item" },
                                        React.createElement("span", null, "Apurado do m\u00EAs"),
                                        React.createElement("b", null, brl(a.apurado))),
                                    aoVivo && React.createElement("div", { className: "muted", style: { marginTop: 6 } }, "Prévia calculada no D1; confira com a apuração salva."));
                            }))))))))),
        React.createElement("div", { className: "aviso-box" }, "O acumulado soma os quatro meses, inclusive resultados negativos. O valor a pagar nunca fica abaixo de R$ 0,00 e o saldo negativo n\u00E3o \u00E9 levado para o quadrimestre seguinte."));
}
/* ================= ADM: IMPORTAÇÃO ================= */
function AdmImportar({ st, setSt, toast }) {
    const [resumo, setResumo] = useState(null);
    const [competenciasSelecionadas, setCompetenciasSelecionadas] = useState([]);
    const [placaSelecionada, setPlacaSelecionada] = useState('');
    const [dataInicial, setDataInicial] = useState('');
    const [dataFinal, setDataFinal] = useState('');
    const [erro, setErro] = useState('');
    const [lendo, setLendo] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [progresso, setProgresso] = useState(null);
    const fileRef = useRef(null);
    const processar = (file) => {
        setErro('');
        setResumo(null);
        setLendo(true);
        const rd = new FileReader();
        rd.onload = ev => {
            try {
                const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: true });
                const nomeAba = wb.SheetNames.find(n => n.toUpperCase().trim() === 'CARGAS FROTA') || wb.SheetNames.find(n => n.toUpperCase().includes('BASE CARGAS FROTA'));
                if (!nomeAba)
                    throw new Error('Nenhuma aba de cargas encontrada. O arquivo precisa ter a aba "CARGAS FROTA".');
                const rows = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], { defval: null });
                if (!rows.length)
                    throw new Error('A aba "' + nomeAba + '" está vazia.');
                const cols = Object.keys(rows[0]);
                const obrig = ['DATA', 'PLACA', 'ORIGEM', 'DESTINO', 'PRODUTO', 'PESO (t)'];
                const faltando = obrig.filter(c => !cols.includes(c));
                if (faltando.length)
                    throw new Error('Colunas não encontradas na aba "' + nomeAba + '": ' + faltando.join(', ') + '. Confira se a planilha não foi alterada.');
                const colNota = cols.includes('N° NOTA') ? 'N° NOTA' : (cols.includes('Nº NOTA') ? 'Nº NOTA' : null);
                const novas = [];
                rows.forEach((r, indiceLinha) => {
                    if (!r['DATA'] || !r['PLACA'])
                        return;
                    let dt;
                    if (r['DATA'] instanceof Date) {
                        const d = r['DATA'];
                        // usa a data "de calendário" do Excel, imune a fuso horário
                        const ut = new Date(d.getTime() + d.getTimezoneOffset() * 60000 + 12 * 3600000);
                        dt = ut.getFullYear() + '-' + String(ut.getMonth() + 1).padStart(2, '0') + '-' + String(ut.getDate()).padStart(2, '0');
                    }
                    else {
                        dt = String(r['DATA']).slice(0, 10);
                    }
                    novas.push({ origemArquivo: file.name, linhaOrigem: indiceLinha + 2, abaOrigem: nomeAba, data: dt, placa: String(r['PLACA'] || '').trim().toUpperCase(), origem: r['ORIGEM'] || '', destino: r['DESTINO'] || '',
                        produto: r['PRODUTO'] || '', numeroNota: colNota ? String(r[colNota] || '') : '', valorTon: Number(r['R$/t']) || 0,
                        pesoTon: Number(r['PESO (t)']) || 0, pesoBruto: Number(r['PESO BRUTO']) || 0, freteTotal: Number(r['R$ TOTAL']) || 0,
                        premiacao: r['PREMIAÇÃO'] == null ? null : Number(r['PREMIAÇÃO']) || 0, maiorKM: String(r['MAIOR KM?'] || ''), distancia: Number(r['DISTANCIA']) || 0,
                        freteOriginal: Number(r['FRETE ORIGINAL']) || 0, diferenca: Number(r['DIFERENÇA']) || 0 });
                });
                // Identidade baseada nos dados, independente de arquivo, aba ou posição.
                // Ocorrências idênticas recebem sequência para não descartar cargas legítimas.
                const ocorrencias = new Map();
                novas.forEach(c => {
                    const identidade = JSON.stringify([c.data,c.placa,c.numeroNota,String(c.origem).toUpperCase(),String(c.destino).toUpperCase(),String(c.produto).toUpperCase(),Number(c.pesoBruto||c.pesoTon*1000),Number(c.pesoTon||0),Number(c.valorTon||0),Number(c.freteTotal||0),Number(c.distancia||0)]);
                    const seq = (ocorrencias.get(identidade) || 0) + 1;
                    ocorrencias.set(identidade,seq);
                    c.ocorrenciaIdentica = seq;
                });
                // Descontos e multas são tratados no módulo Premiação.
                const descNovos = [];
                const porCompetencia = {};
                novas.forEach(c => { const comp = c.data.slice(0, 7); (porCompetencia[comp] || (porCompetencia[comp] = [])).push(c); });
                const competencias = Object.keys(porCompetencia).sort();
                const atual = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
                setCompetenciasSelecionadas([competencias.includes(atual) ? atual : competencias[competencias.length - 1]].filter(Boolean));
                setPlacaSelecionada('');
                setDataInicial('');
                setDataFinal('');
                setResumo({ arquivo: file.name, aba: nomeAba, total: rows.length, novas, porCompetencia, descNovos });
            }
            catch (e) {
                setErro(e.message);
            }
            setLendo(false);
        };
        rd.readAsArrayBuffer(file);
    };
    const competenciasDisponiveis = resumo ? Object.keys(resumo.porCompetencia).sort() : [];
    const placasDisponiveis = resumo ? [...new Set(resumo.novas.map(c => c.placa))].sort() : [];
    const cargasFiltradas = resumo ? resumo.novas.filter(c => competenciasSelecionadas.includes(c.data.slice(0, 7)) &&
        (!placaSelecionada || c.placa === placaSelecionada) &&
        (!dataInicial || c.data >= dataInicial) && (!dataFinal || c.data <= dataFinal)) : [];
    const porCompetenciaFiltrada = {};
    cargasFiltradas.forEach(c => { const comp = c.data.slice(0, 7); (porCompetenciaFiltrada[comp] || (porCompetenciaFiltrada[comp] = [])).push(c); });
    const alternarCompetencia = comp => setCompetenciasSelecionadas(atual => atual.includes(comp) ? atual.filter(x => x !== comp) : [...atual, comp].sort());
    const confirmar = async () => {
        const TAMANHO_LOTE = 25;
        const MAX_TENTATIVAS_LOTE = 6;
        if (!cargasFiltradas.length) {
            setErro('Selecione ao menos uma competência com cargas para importar.');
            return;
        }
        setEnviando(true);
        setErro('');
        setProgresso({ processadas: 0, total: cargasFiltradas.length, lote: 0, totalLotes: Math.ceil(cargasFiltradas.length / TAMANHO_LOTE) });
        try {
            let novas = 0, atualizadas = 0, semAlteracao = 0, duplicadasRemovidas = 0;
            const lotes = [];
            Object.entries(porCompetenciaFiltrada).forEach(([competencia, cargas]) => {
                for (let inicio = 0; inicio < cargas.length; inicio += TAMANHO_LOTE)
                    lotes.push({ competencia, cargas: cargas.slice(inicio, inicio + TAMANHO_LOTE) });
            });
            let processadas = 0;
            for (let indice = 0; indice < lotes.length; indice++) {
                const { competencia, cargas } = lotes[indice];
                let r = null;
                for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_LOTE; tentativa++) {
                    try {
                        r = await ApiService.importarCargas(competencia, cargas);
                        break;
                    }
                    catch (e) {
                        const status = Number(e.status || 0);
                        const falhaTemporaria = !status || [408, 425, 429, 500, 502, 503, 504].includes(status) || e.name === 'AbortError' || /failed to fetch|network|timeout|aborted/i.test(String(e.message || ''));
                        if (tentativa === MAX_TENTATIVAS_LOTE || !falhaTemporaria) {
                            e.message = 'Falha no lote ' + (indice + 1) + ' de ' + lotes.length + ' (' + competencia + '): ' + e.message;
                            throw e;
                        }
                        const espera = Math.min(60000, 5000 * Math.pow(2, tentativa - 1));
                        setErro('Instabilidade no lote ' + (indice + 1) + '. Nova tentativa automática ' + (tentativa + 1) + ' de ' + MAX_TENTATIVAS_LOTE + ' em ' + Math.ceil(espera / 1000) + 's...');
                        await new Promise(resolve => setTimeout(resolve, espera));
                    }
                }
                setErro('');
                novas += Number(r.novas ?? r.gravadas ?? 0);
                atualizadas += Number(r.atualizadas || 0);
                semAlteracao += Number(r.semAlteracao || 0);
                duplicadasRemovidas += Number(r.duplicadasRemovidas || 0);
                processadas += cargas.length;
                setProgresso({ processadas, total: cargasFiltradas.length, lote: indice + 1, totalLotes: lotes.length });
                await new Promise(resolve => setTimeout(resolve, 1200));
            }
            /* A importação já foi confirmada lote a lote pela API. Não consulta
               /cargas/me novamente aqui: essa leitura era pesada e podia falhar depois
               de uma importação bem-sucedida, exibindo um falso "Failed to fetch".
               As telas que precisam das cargas consultam a competência necessária ao
               serem abertas. */
            setErro('');
            toast(novas + ' novas, ' + atualizadas + ' atualizadas, ' + semAlteracao + ' já estavam iguais' + (duplicadasRemovidas ? ' e ' + duplicadasRemovidas + ' duplicadas removidas.' : '.'));
            setResumo(null);
            setProgresso(null);
        }
        catch (e) {
            const inc = e.detalhe && e.detalhe.inconsistencias;
            setErro(e.message + (Array.isArray(inc) && inc.length ? ' Primeiros casos: ' + inc.slice(0, 5).map(x => x.placa + ' em ' + dataBR(x.data) + ' — ' + x.motivo).join('; ') : ''));
        }
        finally {
            setEnviando(false);
        }
    };
    return (React.createElement(React.Fragment, null,
        React.createElement("h2", null, "Importar planilha"),
        React.createElement("div", { className: "card" },
            React.createElement("p", { style: { marginBottom: 12 } },
                "Envie a ",
                React.createElement("b", null, "planilha CARGAS FROTA (.xlsx)"),
                " para importar cargas operacionais no D1. Premiação e descontos são tratados em módulo próprio."),
            React.createElement("div", { className: "drop" },
                React.createElement("div", { style: { fontSize: 30, marginBottom: 6 } }, "\uD83D\uDCE5"),
                lendo ? 'Lendo o arquivo...' : 'Selecione o arquivo .xlsm ou .xlsx',
                React.createElement("div", { style: { marginTop: 12 } },
                    React.createElement("button", { className: "btn btn-p", onClick: () => fileRef.current.click() }, "Escolher arquivo"),
                    React.createElement("input", { type: "file", accept: ".xlsx,.xlsm", style: { display: 'none' }, ref: fileRef, onChange: e => { if (e.target.files[0])
                            processar(e.target.files[0]); e.target.value = ''; } }))),
            erro && React.createElement("div", { className: "erro-box", style: { marginTop: 12 } }, erro)),
        resumo &&
            React.createElement("div", { className: "card" },
                React.createElement("h3", null, "Confer\u00EAncia antes de importar"),
                React.createElement("div", { className: "muted", style: { marginBottom: 8 } },
                    resumo.arquivo,
                    " \u00B7 aba \"",
                    resumo.aba,
                    "\" \u00B7 motorista e tipo ser\u00E3o resolvidos pela placa e vig\u00EAncia"),
                React.createElement("div", { className: "linha-item" },
                    React.createElement("span", null, "Linhas lidas"),
                    React.createElement("b", { className: "num" }, resumo.total)),
                React.createElement("div", { style: { marginTop: 14 } },
                    React.createElement("b", null, "Compet\u00EAncias a importar")),
                React.createElement("div", { className: "row", style: { gap: 8, marginTop: 8, flexWrap: 'wrap' } }, competenciasDisponiveis.map(comp => React.createElement("label", { key: comp, className: "btn btn-s btn-sm", style: { cursor: 'pointer', background: competenciasSelecionadas.includes(comp) ? 'var(--mata)' : 'white', color: competenciasSelecionadas.includes(comp) ? 'white' : 'inherit' } },
                    React.createElement("input", { type: "checkbox", checked: competenciasSelecionadas.includes(comp), onChange: () => alternarCompetencia(comp), style: { display: 'none' } }),
                    comp))),
                React.createElement("div", { className: "row", style: { gap: 10, marginTop: 12, alignItems: 'end', flexWrap: 'wrap' } },
                    React.createElement("label", { style: { minWidth: 170, flex: 1 } },
                        "Placa (opcional)",
                        React.createElement("select", { value: placaSelecionada, onChange: e => setPlacaSelecionada(e.target.value), disabled: enviando },
                            React.createElement("option", { value: "" }, "Todas as placas"),
                            placasDisponiveis.map(p => React.createElement("option", { key: p, value: p }, p)))),
                    React.createElement("label", { style: { minWidth: 145 } },
                        "Data inicial",
                        React.createElement("input", { type: "date", value: dataInicial, onChange: e => setDataInicial(e.target.value), disabled: enviando })),
                    React.createElement("label", { style: { minWidth: 145 } },
                        "Data final",
                        React.createElement("input", { type: "date", value: dataFinal, onChange: e => setDataFinal(e.target.value), disabled: enviando }))),
                React.createElement("div", { className: "linha-item", style: { marginTop: 12 } },
                    React.createElement("span", null, "Cargas que ser\u00E3o comparadas"),
                    React.createElement("b", { className: "num", style: { color: 'var(--mata)' } }, cargasFiltradas.length)),
                React.createElement("div", { className: "linha-item" },
                    React.createElement("span", null, "Compet\u00EAncias selecionadas"),
                    React.createElement("b", { className: "num" }, competenciasSelecionadas.join(', ') || 'Nenhuma')),
                enviando && progresso && React.createElement("div", { className: "aviso-box", style: { marginTop: 12 } },
                    React.createElement("b", null,
                        "Importando: ",
                        progresso.processadas,
                        " de ",
                        progresso.total,
                        " cargas"),
                    React.createElement("div", { className: "muted" },
                        "Lote ",
                        progresso.lote,
                        " de ",
                        progresso.totalLotes,
                        ". N\u00E3o feche esta tela."),
                    React.createElement("div", { style: { height: 8, background: '#dfe7e2', borderRadius: 8, marginTop: 8, overflow: 'hidden' } },
                        React.createElement("div", { style: { height: '100%', width: Math.round((progresso.processadas / Math.max(1, progresso.total)) * 100) + '%', background: 'var(--mata)', transition: 'width .2s' } }))),
                React.createElement("div", { className: "row", style: { marginTop: 12 } },
                    React.createElement("button", { className: "btn btn-g", onClick: () => setResumo(null), disabled: enviando }, "Cancelar"),
                    React.createElement("button", { className: "btn btn-p grow", onClick: confirmar, disabled: enviando || !cargasFiltradas.length }, enviando ? 'Importando em lotes...' : 'Confirmar importação'))),
        React.createElement("div", { className: "aviso-box" }, "A planilha completa \u00E9 lida apenas no navegador. Somente as compet\u00EAncias, placa e per\u00EDodo selecionados s\u00E3o enviados \u00E0 API. Cargas iguais s\u00E3o mantidas, alteradas s\u00E3o atualizadas e novas s\u00E3o inclu\u00EDdas.")));
}
/* ================= ADM: CONTESTAÇÕES ================= */
function AdmContestacoes({ st, setSt, toast, foco }) {
    const [filtro, setFiltro] = useState('pendente');
    const [tipoFiltro, setTipoFiltro] = useState('todos');
    const [motoristaFiltro, setMotoristaFiltro] = useState('');
    const [competenciaFiltro, setCompetenciaFiltro] = useState('');
    const [respondendo, setRespondendo] = useState(null);
    const [resposta, setResposta] = useState('');
    const [decisao, setDecisao] = useState('procede');
    const [carregando, setCarregando] = useState(!CONFIG.MODO_TESTE_LOCAL);
    const [salvando, setSalvando] = useState(false);
    useEffect(() => {
        if (!foco?.chave)
            return;
        setFiltro('pendente');
        setTipoFiltro(foco.parametros?.tipoContestacao || 'todos');
        setMotoristaFiltro('');
        setCompetenciaFiltro(foco.parametros?.competencia || '');
    }, [foco?.chave]);
    const motoristasContestacoes = [...new Set((st.contestacoes || []).map(c => c.motorista).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const lista = (st.contestacoes || [])
        .filter(c => filtro === 'todas' || String(c.status || '').trim().toLowerCase() === filtro)
        .filter(c => tipoFiltro === 'todos' || String(c.tipoContestacao || 'ERRO_CARGA').trim().toUpperCase() === tipoFiltro)
        .filter(c => !motoristaFiltro || c.motorista === motoristaFiltro)
        .filter(c => !competenciaFiltro || String(c.dataCarga || c.data || '').slice(0, 7) === competenciaFiltro)
        .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
    const cargaDe = id => st.cargas.find(c => c.id === id);
    const carregar = async () => {
        if (CONFIG.MODO_TESTE_LOCAL)
            return;
        setCarregando(true);
        try {
            const r = await ApiService.admListarContestacoes();
            setSt(s => ({ ...s, contestacoes: Array.isArray(r.contestacoes) ? r.contestacoes : [] }));
        }
        catch (e) {
            toast('Falha ao carregar contestações: ' + e.message);
        }
        finally {
            setCarregando(false);
        }
    };
    useEffect(() => { carregar(); }, []);
    useAtualizacaoPortal(['contestacoes','cargas'], async () => { const r = await ApiService.admListarContestacoes(); setSt(s => ({ ...s, contestacoes: r.contestacoes || [] })); });
    const responder = async () => {
        if (!resposta.trim()) {
            toast('Informe a justificativa da decisão.');
            return;
        }
        if (CONFIG.MODO_TESTE_LOCAL) {
            setSt(s => ({ ...s, contestacoes: s.contestacoes.map(c => c.id === respondendo.id ? { ...c, status: decisao, resposta: resposta.trim() } : c) }));
            setRespondendo(null);
            setResposta('');
            toast('Contestação respondida.');
            return;
        }
        setSalvando(true);
        try {
            const id = respondendo.id ?? respondendo.itemId;
            const justificativa = resposta.trim();
            await ApiService.admAnalisarContestacao(id, decisao, justificativa);
            setRespondendo(null);
            setResposta('');
            toast('Contestação respondida.');
            void carregar();
        }
        catch (e) {
            toast('Não foi possível concluir a análise: ' + e.message);
        }
        finally {
            setSalvando(false);
        }
    };
    return (React.createElement(React.Fragment, null,
        React.createElement("div", { className: "row", style: { flexWrap: 'wrap' } },
            React.createElement("h2", { className: "grow" }, "Contesta\u00E7\u00F5es de carga"),
            React.createElement("div", { className: "subtabs" }, [['pendente', 'Pendentes'], ['procede', 'Procedem'], ['nao_procede', 'Não procedem'], ['todas', 'Todas']].map(([v, l]) => React.createElement("button", { key: v, className: 'subtab' + (filtro === v ? ' on' : ''), onClick: () => setFiltro(v) }, l)))),
        React.createElement("div", { className: "card", style: { padding: 12 } },
            React.createElement("div", { className: "row", style: { gap: 10, flexWrap: 'wrap', alignItems: 'end' } },
                React.createElement("label", { style: { minWidth: 210, flex: 1 } },
                    "Tipo de contesta\u00E7\u00E3o",
                    React.createElement("select", { value: tipoFiltro, onChange: e => setTipoFiltro(e.target.value) },
                        React.createElement("option", { value: "todos" }, "Todos os tipos"),
                        React.createElement("option", { value: "DIVERGENCIA_PBT" }, "Diverg\u00EAncia de PBT"),
                        React.createElement("option", { value: "ERRO_CARGA" }, "Erro de carga"))),
                React.createElement("label", { style: { minWidth: 170 } },
                    "Compet\u00EAncia",
                    React.createElement("input", { type: "month", value: competenciaFiltro, onChange: e => setCompetenciaFiltro(e.target.value) })),
                React.createElement("label", { style: { minWidth: 210, flex: 1 } },
                    "Motorista",
                    React.createElement("select", { value: motoristaFiltro, onChange: e => setMotoristaFiltro(e.target.value) },
                        React.createElement("option", { value: "" }, "Todos os motoristas"),
                        motoristasContestacoes.map(nome => React.createElement("option", { key: nome, value: nome }, nome)))),
                (tipoFiltro !== 'todos' || motoristaFiltro || competenciaFiltro) &&
                    React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => { setTipoFiltro('todos'); setMotoristaFiltro(''); setCompetenciaFiltro(''); } }, "Limpar filtros"))),
        carregando && React.createElement("div", { className: "card muted" }, "Carregando contesta\u00E7\u00F5es do banco D1 de homologação..."),
        lista.length === 0 && React.createElement("div", { className: "card muted" }, "Nenhuma contesta\u00E7\u00E3o encontrada com os filtros selecionados."),
        lista.map(ct => {
            const c = cargaDe(ct.cargaId);
            return (React.createElement("div", { className: "card", key: ct.id },
                React.createElement("div", { className: "row" },
                    React.createElement("div", { className: "grow" },
                        React.createElement("b", null, ct.motorista || 'Motorista não informado'),
                        React.createElement("div", null,
                            React.createElement("span", { className: "tag tag-neutro" }, ct.tipoContestacao === 'DIVERGENCIA_PBT' ? 'Divergência de PBT' : 'Erro de carga')),
                        c && React.createElement("div", { className: "muted" },
                            dataBR(c.data),
                            " \u00B7 ",
                            c.origem,
                            " \u2192 ",
                            c.destino,
                            " \u00B7 NF ",
                            c.nota,
                            " \u00B7 ",
                            brn(c.peso),
                            " t \u00B7 ",
                            brl(c.valor)),
                        !c && React.createElement("div", { className: "muted" },
                            dataBR(ct.dataCarga),
                            " \u00B7 ",
                            [ct.origemCarga && ct.destinoCarga && (ct.origemCarga + ' → ' + ct.destinoCarga), ct.numeroNota && ('NF ' + ct.numeroNota), ct.placa, ct.tipoVeiculo || 'Tipo não informado'].filter(Boolean).join(' · '),
                            " \u00B7 Peso bruto ",
                            ct.pesoCarga == null ? '—' : brn(Number(ct.pesoCarga), 0),
                            " kg \u00B7 Limite considerado ",
                            ct.limitePBT == null ? '—' : brn(Number(ct.limitePBT) + Number(ct.toleranciaPBT || 0), 0),
                            " kg")),
                    React.createElement(StatusTag, { s: ct.status })),
                React.createElement("div", { className: "row muted", style: { marginTop: 8, gap: 18, flexWrap: 'wrap', fontSize: 13 } },
                    React.createElement("span", null,
                        React.createElement("b", null, "Data do pedido:"),
                        " ",
                        dataBR(ct.data || String(ct.criadoEm || '').slice(0, 10))),
                    React.createElement("span", null,
                        React.createElement("b", null, "Data da carga:"),
                        " ",
                        dataBR(ct.dataCarga || (c && c.data))),
                    String(ct.status || '').trim().toLowerCase() !== 'pendente' && React.createElement("span", null,
                        React.createElement("b", null, "Analisado por:"),
                        " ",
                        ct.analisadoPor || 'Não informado'),
                    String(ct.status || '').trim().toLowerCase() !== 'pendente' && React.createElement("span", null,
                        React.createElement("b", null, "Data da an\u00E1lise:"),
                        " ",
                        dataBR(ct.dataAnalise) || 'Não informada')),
                React.createElement("div", { style: { marginTop: 8, background: 'var(--papel)', borderRadius: 10, padding: '9px 12px', fontSize: 14 } },
                    "\u201C",
                    ct.motivo,
                    "\u201D"),
                ct.resposta && React.createElement("div", { className: "muted", style: { marginTop: 6 } },
                    React.createElement("b", null, "Justificativa da an\u00E1lise:"),
                    " ",
                    ct.resposta),
                String(ct.status || '').trim().toLowerCase() === 'pendente' &&
                    React.createElement("button", { className: "btn btn-s btn-sm", style: { marginTop: 10 }, onClick: () => { setRespondendo(ct); setDecisao('procede'); setResposta(''); } }, "Responder")));
        }),
        respondendo &&
            React.createElement(Modal, { titulo: "Responder contesta\u00E7\u00E3o", onClose: () => setRespondendo(null) },
                React.createElement("label", null, "Decis\u00E3o"),
                React.createElement("div", { className: "subtabs", style: { marginBottom: 12 } },
                    React.createElement("button", { className: 'subtab' + (decisao === 'procede' ? ' on' : ''), onClick: () => setDecisao('procede') }, "Procede"),
                    React.createElement("button", { className: 'subtab' + (decisao === 'nao_procede' ? ' on' : ''), onClick: () => setDecisao('nao_procede') }, "N\u00E3o procede")),
                React.createElement("label", { htmlFor: "adm-contestacoes-resposta-ao-motorista" }, "Resposta ao motorista"),
                React.createElement("textarea", { id: "adm-contestacoes-resposta-ao-motorista", name: "adm-contestacoes-resposta-ao-motorista", rows: "3", value: resposta, onChange: e => setResposta(e.target.value), placeholder: decisao === 'procede' ? 'Ex.: confirmado com o ticket, peso será corrigido na próxima importação.' : 'Ex.: conferimos com a balança e o valor está correto.' }),
                React.createElement("div", { className: "aviso-box", style: { margin: '10px 0' } }, "A corre\u00E7\u00E3o do dado em si \u00E9 feita no sistema de origem \u2014 na pr\u00F3xima importa\u00E7\u00E3o a carga entra atualizada."),
                React.createElement("button", { className: "btn btn-p", disabled: salvando, style: { width: '100%' }, onClick: responder }, salvando ? 'Salvando...' : 'Enviar resposta'))));
}
/* ================= ADM: PREMIAÇÃO (metas + descontos) ================= */
function resumoConformidadeAuditoria(modelo, respostas) {
    let pontos = 0, maximo = 0, pendentes = 0;
    for (const pergunta of modelo.perguntas) {
        const peso = Number(pergunta.peso);
        const nota = respostas[pergunta.id]?.nota;
        maximo += Math.max(...modelo.notas) * peso;
        if (modelo.notas.includes(nota)) pontos += nota * peso;
        else pendentes++;
    }
    const meta = Number(modelo.limitePercentual ?? 85);
    const percentual = !pendentes && maximo > 0 ? 100 * pontos / maximo : null;
    const texto = percentual === null
        ? pontos + ' de ' + maximo + ' pontos registrados · ' + pendentes + ' item(ns) sem nota · Meta ' + meta + '%'
        : pontos + ' de ' + maximo + ' pontos · Conformidade ' + percentual.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '% · Meta ' + meta + '% · ' + (pontos * 100 >= maximo * meta ? 'Meta atingida' : 'Abaixo da meta');
    return texto;
}

async function imprimirAuditoria(linha, competencia, janela) {
    const rota = '/admin/premiacao/auditoria?' + new URLSearchParams({ motoristaId: linha.motoristaId, competencia });
    const doc = janela.document;
    doc.title = 'FO 4.1.1.2 · Auditoria Interna';
    const adicionar = (tag, texto, pai = doc.body) => {
        const el = doc.createElement(tag);
        el.textContent = texto;
        pai.append(el);
        return el;
    };
    adicionar('p', 'Carregando avaliação…');
    const { modelo, rascunho, automaticas } = await ApiService._req('GET', rota);
    if (!rascunho) throw new Error('Ainda não há avaliação salva para este motorista e competência.');
    doc.body.replaceChildren();
    const estilo = doc.createElement('style');
    estilo.textContent = 'body{font:14px system-ui;color:#142c24;margin:32px auto;max-width:800px;padding:0 20px} h1{font-size:23px} section{border-top:1px solid #ddd;padding:12px 0;break-inside:avoid} p{white-space:pre-wrap} img{display:block;max-width:65mm;max-height:45mm;object-fit:contain} @media print{button{display:none}body{margin:0;padding:0}}';
    doc.head.append(estilo);
    adicionar('h1', 'Auditoria Interna da Logística');
    adicionar('p', modelo.formulario + ' · Revisão ' + modelo.revisao);
    adicionar('p', linha.motoristaNome + ' · Competência ' + competencia);
    adicionar('strong', rascunho.fechadaEm ? 'Auditoria fechada · Desconto ' + brl(rascunho.resultado.valorCentavos / 100) : 'Rascunho · Avaliação não publicada');
    adicionar('p', resumoConformidadeAuditoria(modelo, Object.fromEntries(modelo.perguntas.map(p => [p.id, automaticas?.[p.tipo] || rascunho.respostas[p.id]]))));
    const urls = [];
    janela.addEventListener('pagehide', () => urls.forEach(url => URL.revokeObjectURL(url)), { once: true });
    for (const pergunta of modelo.perguntas) {
        const item = automaticas?.[pergunta.tipo] || rascunho.respostas[pergunta.id];
        const secao = adicionar('section', '');
        if (item?.motivo) adicionar('p', item.motivo, secao);
        adicionar('strong', pergunta.ordem + '. ' + pergunta.titulo, secao);
        adicionar('p', pergunta.descricao, secao);
        adicionar('p', 'Peso ' + pergunta.peso + ' · Nota ' + (item?.nota ?? 'pendente'), secao);
        if (item?.justificativa) adicionar('p', item.justificativa, secao);
        if (!item?.foto) continue;
        try {
            const foto = await fetch(CONFIG.API_URL + rota + '&foto=' + encodeURIComponent(pergunta.id), {
                headers: { Authorization: 'Bearer ' + ApiService.token }
            });
            if (!foto.ok) throw new Error();
            const url = URL.createObjectURL(await foto.blob());
            urls.push(url);
            const img = adicionar('img', '', secao);
            img.alt = 'Evidência da pergunta ' + pergunta.ordem;
            img.src = url;
            await img.decode();
        } catch {
            adicionar('p', 'Foto salva indisponível na impressão.', secao);
        }
    }
    const botao = adicionar('button', 'Imprimir ou salvar como PDF');
    botao.onclick = () => janela.print();
}
 
function PainelAuditoriaInterna({ competencia, setCompetencia, abrir, editar }) {
    const h = React.createElement;
    const [aba, setAba] = useState('avaliacoes');
    const [base, setBase] = useState(null);
    const [perguntas, setPerguntas] = useState([]);
    const [mensagem, setMensagem] = useState('');
    const [filtro, setFiltro] = useState('');
    const rota = '/admin/premiacao/auditoria?competencia=' + encodeURIComponent(competencia);
    useEffect(() => {
        let ativo = true;
        setBase(null);
        setMensagem('');
        ApiService._req('GET', rota).then(r => {
            if (!ativo) return;
            setBase(r);
            setPerguntas(r.modelo.perguntas);
        }).catch(e => { if (ativo) setMensagem(e.message); });
        return () => { ativo = false; };
    }, [rota, aba]);
    const alterar = (id, campo, valor) => setPerguntas(v => v.map(p => p.id === id ? { ...p, [campo]: valor } : p));
    const salvar = async () => {
        try { await ApiService._req('PATCH', rota, { perguntas }); setMensagem('Cadastro atualizado.'); }
        catch (e) { setMensagem(e.message); }
    };
    return h('section', { className: 'card' },
        h('h2', null, 'Auditoria Interna'),
        h('div', { className: 'subtabs' }, [['avaliacoes', 'Avaliações'], ['perguntas', 'Cadastro de perguntas'], ['relatorios', 'Relatórios']].map(([id, titulo]) =>
            h('button', { key: id, className: 'subtab' + (aba === id ? ' on' : ''), onClick: () => setAba(id) }, titulo))),
        aba === 'perguntas' ? h('p', { className: 'muted' }, 'Modelo geral da auditoria, usado nas novas avaliações de qualquer competência.') : h('label', null, 'Competência', h('input', { type: 'month', value: competencia, onChange: e => e.target.value && setCompetencia(e.target.value) })),
        mensagem && h('p', { role: 'status' }, mensagem),
        !base && !mensagem && h('p', null, 'Carregando…'),
        base && aba === 'perguntas' && h(React.Fragment, null,
            perguntas.map(p => h('div', { className: 'card', key: p.id },
                h('label', null, 'Título', h('input', { disabled: !editar, value: p.titulo, onChange: e => alterar(p.id, 'titulo', e.target.value) })),
                h('label', null, 'Descrição', h('textarea', { disabled: !editar, value: p.descricao, onChange: e => alterar(p.id, 'descricao', e.target.value) })),
                h('label', null, 'Peso', h('input', { type: 'number', min: 1, max: 100, disabled: !editar, value: p.peso, onChange: e => alterar(p.id, 'peso', Number(e.target.value)) })),
                h('label', null, h('input', { type: 'checkbox', checked: p.ativa, disabled: !editar, onChange: e => alterar(p.id, 'ativa', e.target.checked) }), ' Ativa'),
                h('p', null, 'Notas 1, 3 e 5 · ' + p.tipo))),
            editar && h('button', { className: 'btn btn-p', onClick: salvar }, 'Salvar cadastro')),
        base && aba !== 'perguntas' && h(React.Fragment, null,
            h('label', null, 'Motorista', h('input', { value: filtro, onChange: e => setFiltro(e.target.value) })),
            aba === 'relatorios' && h('p', { className: 'muted' }, 'Acompanhamento mensal das avaliações.'),
            base.avaliacoes.filter(l => l.motoristaNome.toLowerCase().includes(filtro.toLowerCase())).map(l =>
                h('div', { className: 'card row', key: l.motoristaId },
                    h('strong', null, l.motoristaNome), h('span', null, l.status),
                    h('button', { className: 'btn btn-s', onClick: () => abrir(l) }, aba === 'relatorios' || !editar ? 'Consultar' : 'Abrir avaliação'),
                    aba === 'relatorios' && l.status !== 'Não realizada' && h('button', {
                        className: 'btn btn-s',
                        onClick: () => {
                            const janela = window.open('', '_blank');
                            if (!janela) { setMensagem('Permita a abertura de janelas para gerar o relatório.'); return; }
                            janela.opener = null;
                            imprimirAuditoria(l, competencia, janela).catch(e => {
                                if (!janela.closed) janela.close();
                                setMensagem(e.message);
                            });
                        }
                    }, 'Gerar relatório')))));
}

function RascunhoAuditoria({ linha, competencia, onClose, editar }) {
    const h = React.createElement;
    const [fechada, setFechada] = useState(null);
    const [modelo, setModelo] = useState(null);
    const [respostas, setRespostas] = useState({});
    const [automaticas, setAutomaticas] = useState({});
    const [mensagem, setMensagem] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [fotoAberta, setFotoAberta] = useState(null);
    useEffect(() => () => { if (fotoAberta) URL.revokeObjectURL(fotoAberta); }, [fotoAberta]);
    const rota = '/admin/premiacao/auditoria?' + new URLSearchParams({ motoristaId: linha.motoristaId, competencia });
    useEffect(() => {
        let ativo = true;
        ApiService._req('GET', rota).then(r => {
            if (!ativo) return;
            setModelo(r.modelo);
            setFechada(r.rascunho?.resultado || null);
            setAutomaticas(r.automaticas || {});
            setRespostas(r.rascunho?.respostas || {});
        }).catch(e => { if (ativo) setMensagem(e.message); });
        return () => { ativo = false; };
    }, [rota]);
    const salvar = async (fechar = false) => {
        setSalvando(true);
        setMensagem('');
        try {
            const r = await ApiService._req('POST', rota, { respostas, fechar });
            if (r.rascunho.resultado) { setFechada(r.rascunho.resultado); setModelo(r.rascunho.modelo); setAutomaticas(r.rascunho.automaticas); }
            setRespostas(r.rascunho.respostas);
            setMensagem(fechar ? 'Auditoria fechada e conferência registrada em Descontos.' : 'Rascunho salvo. Você pode fechar e retomar em Avaliações, na mesma competência e motorista.');
        } catch (e) { setMensagem(e.message); }
        finally { setSalvando(false); }
    };
    const reabrir = async () => {
        setSalvando(true);
        setMensagem('');
        try {
            await ApiService._req('POST', rota, { reabrir: true });
            setFechada(null);
            setAutomaticas({});
            const r = await ApiService._req('GET', rota);
            setModelo(r.modelo);
            setRespostas(r.rascunho?.respostas || {});
            setAutomaticas(r.automaticas || {});
            setMensagem('Auditoria reaberta. Faça as correções e feche novamente.');
        } catch (e) { setMensagem(e.message); }
        finally { setSalvando(false); }
    };
    const atualizar = (id, campo, valor) => setRespostas(atual => ({
        ...atual, [id]: { nota: null, ...atual[id], [campo]: valor }
    }));
    const selecionarFoto = (id, arquivo) => {
        if (!arquivo) return;
        if (!['image/jpeg', 'image/png'].includes(arquivo.type) || arquivo.size > 512000) {
            setMensagem('Selecione uma foto JPEG ou PNG de até 500 KB.');
            return;
        }
        const leitor = new FileReader();
        leitor.onload = () => atualizar(id, 'fotoNova', leitor.result);
        leitor.onerror = () => setMensagem('Não foi possível ler a foto.');
        leitor.readAsDataURL(arquivo);
    };
    const verFoto = async id => {
        try {
            const r = await fetch(CONFIG.API_URL + rota + '&foto=' + encodeURIComponent(id), {
                headers: { Authorization: 'Bearer ' + ApiService.token }
            });
            if (!r.ok) throw new Error('Não foi possível carregar a foto.');
            setFotoAberta(URL.createObjectURL(await r.blob()));
        } catch (e) { setMensagem(e.message); }
    };
    return h(Modal, { titulo: 'Auditoria interna mensal', onClose },
        h('p', null, linha.motoristaNome + ' · ' + competencia),
        mensagem && h('p', { role: 'status' }, mensagem),
        fotoAberta && h('div', null,
            h('img', { src: fotoAberta, alt: 'Evidência da auditoria', style: { maxWidth: '100%', maxHeight: '35vh' } }),
            h('button', { type: 'button', className: 'btn btn-s', onClick: () => setFotoAberta(null) }, 'Fechar foto')),
        !modelo && !mensagem && h('p', null, 'Carregando formulário…'),
        modelo && h('div', { style: { maxHeight: '55vh', overflowY: 'auto' } },
            h('p', { className: 'muted' }, modelo.formulario + ' · Revisão ' + modelo.revisao),
            modelo.perguntas.map(p => h('section', { className: 'card', key: p.id },
                h('strong', null, p.ordem + '. ' + p.titulo),
                h('p', { className: 'muted' }, p.descricao),
                p.tipo !== 'MANUAL' ? h(React.Fragment, null,
                    h('p', null, 'Nota automática: ' + (automaticas[p.tipo]?.nota ?? 'Pendente')),
                    h('p', { className: 'muted' }, automaticas[p.tipo]?.motivo || 'Dados automáticos indisponíveis.'),
                    automaticas[p.tipo]?.evidencias?.length > 0 && h('details', null,
                        h('summary', null, 'Ver evidências'),
                        automaticas[p.tipo].evidencias.map((item, indice) => h('p', { key: indice }, p.tipo === 'PBT'
                            ? [item.data, item.placa, item.notaFiscal ? 'NF ' + item.notaFiscal : 'Carga ' + item.cargaId, item.pesoKg + ' kg', item.minimo + ' a ' + item.maximo + ' kg', item.situacao.replaceAll('_', ' ')].join(' · ')
                            : [item.periodo, item.frequencia, 'Veículo ' + item.veiculoId, item.cumprido ? 'Cumprido' : 'Faltante'].join(' · '))))) :
                    h(React.Fragment, null,
                        h('label', null, 'Nota', h('select', {
                            disabled: salvando || !editar || !!fechada, value: respostas[p.id]?.nota ?? '',
                            onChange: e => atualizar(p.id, 'nota', e.target.value ? Number(e.target.value) : null)
                        }, h('option', { value: '' }, 'Selecione'), modelo.notas.map(n => h('option', { key: n, value: n }, n)))),
                        h('label', null, 'Justificativa', h('textarea', {
                            disabled: salvando || !editar || !!fechada, maxLength: 1500, value: respostas[p.id]?.justificativa || '',
                            onChange: e => atualizar(p.id, 'justificativa', e.target.value)
                        })),
                        respostas[p.id]?.nota === 1 && h('label', null, 'Foto da evidência (JPEG ou PNG, até 500 KB)', h('input', {
                            type: 'file', accept: 'image/jpeg,image/png', disabled: salvando || !editar || !!fechada,
                            onChange: e => selecionarFoto(p.id, e.target.files?.[0])
                        })),
                        respostas[p.id]?.nota === 1 && respostas[p.id]?.fotoNova && h('img', { src: respostas[p.id].fotoNova, alt: 'Foto selecionada', style: { maxWidth: 160, maxHeight: 120 } }),
                        respostas[p.id]?.nota === 1 && respostas[p.id]?.foto && h('button', { type: 'button', className: 'btn btn-s', onClick: () => verFoto(p.id) }, 'Ver foto salva')
                    )
            ))
        ),
        fechada && editar && h('button', { className: 'btn btn-s', disabled: salvando, onClick: reabrir }, 'Reabrir auditoria'),
        fechada && h('p', null, 'Auditoria fechada · Desconto ' + brl(fechada.valorCentavos / 100)),
        modelo && h('p', { role: 'status' }, resumoConformidadeAuditoria(modelo, Object.fromEntries(modelo.perguntas.map(p => [p.id, automaticas[p.tipo] || respostas[p.id]])))),
        modelo && editar && !fechada && h('button', { className: 'btn btn-p', disabled: salvando || !editar || !!fechada, onClick: () => salvar() }, salvando ? 'Salvando…' : 'Salvar rascunho'),
        modelo && editar && !fechada && h('button', { className: 'btn btn-p', disabled: salvando, onClick: () => salvar(true) }, 'Fechar auditoria'));
}

function RegrasDescontoAuditoria({ editar }) {
    const h = React.createElement;
    const rota = '/admin/premiacao/regras-auditoria';
    const [regras, setRegras] = useState([]);
    const categorias = { AUDITORIA: 'Auditoria Interna', MULTAS: 'Multas', NOTIFICACOES: 'Notificação / Advertência' };
    const [categoria, setCategoria] = useState('AUDITORIA');
    const [edicao, setEdicao] = useState(false);
    const [ativo, setAtivo] = useState(true);
    const [meta, setMeta] = useState('85');
    const [valor, setValor] = useState('');
    const [vigencia, setVigencia] = useState('');
    const [vigenciaFim, setVigenciaFim] = useState('');
    const [mensagem, setMensagem] = useState('');
    const [salvando, setSalvando] = useState(false);
    useEffect(() => {
        ApiService._req('GET', rota).then(r => setRegras(r.regras)).catch(e => setMensagem(e.message));
    }, []);
    const salvar = async e => {
        e.preventDefault();
        setSalvando(true);
        setMensagem('');
        try {
            const r = await ApiService._req(edicao ? 'PATCH' : 'POST', rota, { categoria, vigencia, vigenciaOriginal: edicao || undefined, vigenciaFim, ativo, meta: categoria === 'AUDITORIA' ? Number(meta) : null, valorCentavos: Math.round(Number(valor) * 100) });
            setRegras(atuais => [...atuais.filter(x => (x.categoria || 'AUDITORIA') !== categoria || x.vigencia !== (edicao || vigencia)), r.regra].sort((a, b) => b.vigencia.localeCompare(a.vigencia)));
            setMensagem(edicao ? 'Regra atualizada.' : 'Regra cadastrada.');
            setEdicao(false);
            setAtivo(true);
            setVigencia('');
            setVigenciaFim('');
            setValor('');
        } catch (erro) { setMensagem(erro.message); }
        finally { setSalvando(false); }
    };
    return h('section', { className: 'card' },
        h('h3', null, 'Regras de desconto'),
        h('p', null, 'Defina o valor por ocorrência para multas e notificações, ou a meta e o desconto da auditoria.'),
        regras.length ? h('div', { style: { overflowX: 'auto' } }, h('table', null,
            h('thead', null, h('tr', null, ['Categoria', 'Vigência início', 'Vigência fim', 'Conformidade mínima', 'Valor do desconto', 'Status', 'Ações'].map(t => h('th', { key: t }, t)))),
            h('tbody', null, regras.map(r => h('tr', { key: (r.categoria || 'AUDITORIA') + r.vigencia },
                h('td', null, categorias[r.categoria || 'AUDITORIA']),
                h('td', null, r.vigencia.split('-').reverse().join('/')),
                h('td', null, r.vigenciaFim ? r.vigenciaFim.split('-').reverse().join('/') : 'Sem fim cadastrado'),
                h('td', null, r.meta == null ? '—' : r.meta + '%'),
                h('td', null, brl(r.valorCentavos / 100) + (r.meta == null ? ' por ocorrência' : ' abaixo da meta')),
                h('td', null, h('span', { className: 'tag ' + (r.ativo === false ? 'tag-neutro' : 'tag-ok') }, r.ativo === false ? 'Inativa' : 'Ativa')),
                h('td', null, editar && h('button', { className: 'btn btn-s btn-sm', onClick: () => { setEdicao(r.vigencia); setCategoria(r.categoria || 'AUDITORIA'); setVigencia(r.vigencia); setVigenciaFim(r.vigenciaFim || ''); setMeta(String(r.meta ?? 85)); setValor(String(r.valorCentavos / 100)); setAtivo(r.ativo !== false); } }, 'Editar')))))))
            : h('p', { className: 'muted' }, 'Nenhuma regra cadastrada.'),
        editar && h('form', { className: 'form-grid', onSubmit: salvar },
            h('label', null, 'Categoria', h('select', { value: categoria, disabled: edicao, onChange: e => { setCategoria(e.target.value); setValor(e.target.value === 'AUDITORIA' ? '' : '50'); } }, Object.entries(categorias).map(([id, nome]) => h('option', { key: id, value: id }, nome)))),
            categoria === 'AUDITORIA' && h('label', null, 'Conformidade mínima (%)', h('input', { required: true, type: 'number', min: 0.01, max: 100, step: 0.01, value: meta, onChange: e => setMeta(e.target.value) })),
            h('label', null, categoria === 'AUDITORIA' ? 'Valor do desconto (R$)' : 'Valor por ocorrência (R$)', h('input', { required: true, type: 'number', min: 0.01, max: 10000000, step: 0.01, value: valor, onChange: e => setValor(e.target.value) })),
            h('label', null, 'Vigência início', h('input', { required: true, type: 'month', value: vigencia, onChange: e => setVigencia(e.target.value) })),
            h('label', null, 'Vigência fim', h('input', { required: true, type: 'month', min: vigencia || undefined, value: vigenciaFim, onChange: e => setVigenciaFim(e.target.value) })),
            h('label', null, 'Status', h('select', { value: ativo ? 's' : 'n', onChange: e => setAtivo(e.target.value === 's') }, h('option', { value: 's' }, 'Ativa'), h('option', { value: 'n' }, 'Inativa'))),
            h('button', { className: 'btn btn-p', disabled: salvando }, salvando ? 'Salvando…' : edicao ? 'Salvar alterações' : 'Cadastrar regra'),
            edicao && h('button', { type: 'button', className: 'btn btn-s', onClick: () => { setEdicao(false); setAtivo(true); setVigencia(''); setVigenciaFim(''); setValor(''); } }, 'Cancelar edição')),
        mensagem && h('p', { role: 'status' }, mensagem));
}

function AdmPremiacao({ st, setSt, toast, user }) {
    const podeEditarMetas = pode(user, 'metas.editar');
    const podeEditarDescontos = pode(user, 'descontos.editar');
    const [sub, setSub] = useState(pode(user, 'premiacao.visualizar') ? 'painel' : pode(user, 'metas.visualizar') ? 'metas' : pode(user, 'descontos.visualizar') ? 'desc' : 'auditoria');
    const [edit, setEdit] = useState(null);
    const [editTipo, setEditTipo] = useState(null);
    const [competencia, setCompetencia] = useState(MES_ATUAL.slice(3) + '-' + MES_ATUAL.slice(0, 2));
    const [fMotorista, setFMotorista] = useState('');
    const [fTipoMeta, setFTipoMeta] = useState('');
    const [fStatusDesc, setFStatusDesc] = useState('PENDENTES');
    const [fCategoriaDesc, setFCategoriaDesc] = useState('');
    const [fSituacaoDesc, setFSituacaoDesc] = useState('');
    const [fBuscaDesc, setFBuscaDesc] = useState('');
    const [painel, setPainel] = useState({ metas: [], tiposVeiculo: [], descontos: [], elegiveis: [], pendencias: {} });
    const [novoDesc, setNovoDesc] = useState({ motoristaId: '', motoristaNome: '', categoria: 'Multas', situacao: 'Sem ocorrência', quantidade: 0, valor: 0, percentual: 0, dataOcorrencia: '', motivo: '', exibir: true });
    const categorias = ['Notificação / Advertência', 'Multas', 'Auditoria Interna'];
    const carregarMetas = async () => {
        try {
            const r = await ApiService.admPremiacaoMetas();
            setPainel(p => ({ ...p, metas: r.metas || [], tiposVeiculo: r.tiposVeiculo || [], veiculosPremiacao: r.veiculosPremiacao || [] }));
            setSt(s => ({ ...s, metas: r.metas || s.metas }));
        }
        catch (e) {
            toast('Erro ao carregar metas: ' + e.message);
        }
    };
    const carregarDescontos = async () => {
        try {
            const r = await ApiService.admPremiacaoDescontos(competencia);
            setPainel(p => ({ ...p, competencia: r.competencia, descontos: r.descontos || [], elegiveis: r.elegiveis || [], pendencias: r.pendencias || {}, diagnosticoElegibilidade: r.diagnosticoElegibilidade || [] }));
        }
        catch (e) {
            toast('Erro ao carregar descontos: ' + e.message);
        }
    };
    const carregarAtual = async () => {
        if (sub === 'metas')
            return carregarMetas();
        if (sub === 'desc')
            return carregarDescontos();
        await Promise.all([carregarMetas(), carregarDescontos()]);
    };
    useEffect(() => { carregarAtual(); }, [sub, competencia]);
    const statusMeta = m => {
        const hoje = HOJE;
        if (m.ativo === false)
            return 'Inativa';
        if (m.vigIni && hoje < m.vigIni)
            return 'Programada';
        if (m.vigFim && hoje > m.vigFim)
            return 'Finalizada';
        return 'Ativa';
    };
    const salvarMeta = async (e) => {
        if (e && e.preventDefault)
            e.preventDefault();
        if (!edit.tipo || !edit.vigIni || !edit.vigFim) {
            toast('Preencha tipo de veículo e vigência.');
            return;
        }
        try {
            await ApiService.salvarMeta(edit);
            setEdit(null);
            await carregarMetas();
            toast('Meta salva no banco D1 de homologação.');
        }
        catch (e) {
            toast('Erro ao salvar meta: ' + e.message);
        }
    };
    const addDesc = async () => {
        if (!novoDesc.motoristaId) {
            toast('Selecione o motorista.');
            return;
        }
        if (novoDesc.motoristaId === '__TODOS__') {
            if (novoDesc.situacao !== 'Sem ocorrência') {
                toast('O lançamento em massa é permitido somente para Sem ocorrência.');
                return;
            }
            const pendentes = ((painel.pendencias || {})[novoDesc.categoria] || []);
            if (!pendentes.length) {
                toast('Não há motoristas pendentes nesta categoria.');
                return;
            }
            try {
                for (const motorista of pendentes) {
                    await ApiService.salvarDesconto({
                        ...novoDesc, itemId: undefined, competencia,
                        motoristaId: motorista.motoristaId, motoristaNome: motorista.nome,
                        quantidade: 0, valor: 0, percentual: 0, dataOcorrencia: '', motivo: ''
                    });
                }
                await carregarDescontos();
                setNovoDesc({ motoristaId: '', motoristaNome: '', categoria: novoDesc.categoria, situacao: 'Sem ocorrência', quantidade: 0, valor: 0, percentual: 0, dataOcorrencia: '', motivo: '', exibir: true });
                toast(`${pendentes.length} motoristas foram lançados como Sem ocorrência.`);
            }
            catch (e) {
                toast('Erro no lançamento em massa: ' + e.message);
            }
            return;
        }
        if (novoDesc.situacao === 'Com ocorrência' && novoDesc.categoria === 'Auditoria Interna' && !Number(novoDesc.valor) && !Number(novoDesc.percentual)) {
            toast('Informe o valor ou percentual do desconto.');
            return;
        }
        try {
            await ApiService.salvarDesconto({ ...novoDesc, competencia });
            await carregarDescontos();
            setNovoDesc({ motoristaId: '', motoristaNome: '', categoria: 'Multas', situacao: 'Sem ocorrência', quantidade: 0, valor: 0, percentual: 0, dataOcorrencia: '', motivo: '', exibir: true });
            toast(novoDesc.itemId ? 'Lançamento atualizado no banco D1 de homologação.' : 'Conferência salva no banco D1 de homologação.');
        }
        catch (e) {
            toast('Erro ao salvar conferência: ' + e.message);
        }
    };
    const tiposMeta = [...new Map((painel.tiposVeiculo || []).filter(Boolean).map(tipo => [chaveTipo(tipo), tipo])).values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const tipoPelaChave = chave => {
        const normalizarChave = v => chaveTipo(v).replace(/[^A-Z0-9]/g, '');
        const prefixo = normalizarChave(String(chave || '').split('|')[0]);
        if (!prefixo)
            return '';
        return tiposMeta.find(t => normalizarChave(t) === prefixo) || '';
    };
    const tipoOficial = (tipo, chave) => tiposMeta.find(t => chaveTipo(t) === chaveTipo(tipo)) || tipo || tipoPelaChave(chave);
    const metas = (painel.metas || [])
        .map(m => ({ ...m, tipo: tipoOficial(m.tipo, m.chave) }))
        .filter(m => !fTipoMeta || chaveTipo(m.tipo) === chaveTipo(fTipoMeta));
    const elegiveis = (painel.elegiveis || []).filter(u => !fMotorista || u.motoristaId === fMotorista);
    const acompanhamentoDescontos = (painel.elegiveis || []).flatMap(u => categorias.map(categoria => {
        const registro = (painel.descontos || []).find(d => String(d.motoristaId) === String(u.motoristaId) && String(d.categoria) === categoria);
        return {
            motoristaId: String(u.motoristaId), motoristaNome: u.nome, categoria,
            status: registro ? 'CONFERIDO' : 'PENDENTE', registro: registro || null,
            situacao: registro?.situacao || '', motivo: registro?.motivo || '',
            valor: Number(registro?.valor || 0), dataOcorrencia: registro?.dataOcorrencia || ''
        };
    })).filter(linha => {
        const busca = normalizar(fBuscaDesc);
        const okBusca = !busca || normalizar(linha.motoristaNome).includes(busca) || normalizar(linha.categoria).includes(busca) || normalizar(linha.motivo).includes(busca);
        const okMotorista = !fMotorista || linha.motoristaId === String(fMotorista);
        const okCategoria = !fCategoriaDesc || linha.categoria === fCategoriaDesc;
        const okStatus = fStatusDesc === 'TODOS' || linha.status === fStatusDesc.slice(0, -1);
        const okSituacao = !fSituacaoDesc || linha.situacao === fSituacaoDesc;
        return okBusca && okMotorista && okCategoria && okStatus && okSituacao;
    }).sort((a, b) => a.status.localeCompare(b.status) || a.motoristaNome.localeCompare(b.motoristaNome, 'pt-BR') || a.categoria.localeCompare(b.categoria, 'pt-BR'));
    const selecionarCategoria = categoria => {
        setFCategoriaDesc(categoria);
        setFStatusDesc('PENDENTES');
        setFSituacaoDesc('');
        setNovoDesc(v => ({ ...v, itemId: undefined, motoristaId: '', motoristaNome: '', categoria, situacao: 'Sem ocorrência', quantidade: 0, valor: 0, percentual: 0, dataOcorrencia: '', motivo: '' }));
    };
    const [rascunhoAuditoria, setRascunhoAuditoria] = useState(null);
    const prepararConferencia = linha => {
        if (linha.categoria === 'Auditoria Interna' && pode(user, 'auditoria.visualizar')) {
            setSub('auditoria');
            setRascunhoAuditoria(linha);
            return;
        }
        if (linha.registro) {
            const d = linha.registro;
            setNovoDesc({ itemId: d.itemId, motoristaId: d.motoristaId, motoristaNome: d.motoristaNome, categoria: d.categoria, situacao: d.situacao || 'Sem ocorrência', quantidade: d.quantidade || 0, valor: d.valor || 0, percentual: d.percentual || 0, dataOcorrencia: d.dataOcorrencia || '', motivo: d.motivo || '', exibir: d.exibir !== false });
        }
        else {
            setNovoDesc({ motoristaId: linha.motoristaId, motoristaNome: linha.motoristaNome, categoria: linha.categoria, situacao: 'Sem ocorrência', quantidade: 0, valor: 0, percentual: 0, dataOcorrencia: '', motivo: '', exibir: true });
        }
        setTimeout(() => document.getElementById('form-descontos')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    };
    return (React.createElement(React.Fragment, null,
        React.createElement("div", { className: "row", style: { flexWrap: 'wrap' } },
            React.createElement("h2", { className: "grow" }, "Premia\u00E7\u00E3o"),
            React.createElement("div", { className: "subtabs" },
                pode(user, 'premiacao.visualizar') && React.createElement("button", { className: 'subtab' + (sub === 'painel' ? ' on' : ''), onClick: () => setSub('painel') }, "Painel"),
                pode(user, 'metas.visualizar') && React.createElement("button", { className: 'subtab' + (sub === 'metas' ? ' on' : ''), onClick: () => setSub('metas') }, "Metas"),
                pode(user, 'descontos.visualizar') && React.createElement("button", { className: 'subtab' + (sub === 'desc' ? ' on' : ''), onClick: () => setSub('desc') }, "Descontos"),
                pode(user, "auditoria.visualizar") && React.createElement("button", { className: "subtab" + (sub === "auditoria" ? " on" : ""), onClick: () => setSub("auditoria") }, "Auditoria Interna"))),
        sub === 'painel' && pode(user, 'premiacao.visualizar') && React.createElement(React.Fragment, null,
            React.createElement("div", { className: "form-grid", style: { marginBottom: 12 } },
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-premiacao-competencia" }, "Compet\u00EAncia"),
                    React.createElement("input", { id: "adm-premiacao-competencia", name: "adm-premiacao-competencia", autoComplete: "off", type: "month", value: competencia, onChange: e => setCompetencia(e.target.value) }))),
            React.createElement("div", { className: "kpis" },
                React.createElement("div", { className: "kpi" },
                    React.createElement("span", null, "Metas cadastradas"),
                    React.createElement("b", null, (painel.metas || []).length)),
                React.createElement("div", { className: "kpi" },
                    React.createElement("span", null, "Motoristas eleg\u00EDveis"),
                    React.createElement("b", null, (painel.elegiveis || []).length)),
                React.createElement("div", { className: "kpi" },
                    React.createElement("span", null, "Descontos lan\u00E7ados"),
                    React.createElement("b", null, (painel.descontos || []).filter(d => d.competencia === competencia).length))),
            React.createElement("div", { className: "aviso-box" }, "Vis\u00E3o geral da premia\u00E7\u00E3o na compet\u00EAncia selecionada. O acesso a Metas e Descontos \u00E9 controlado separadamente pelo perfil.")),
        sub === 'metas' && pode(user, 'metas.visualizar') && React.createElement(React.Fragment, null,
            React.createElement(RegrasDescontoAuditoria, { editar: pode(user, 'metas.editar') }),
            React.createElement("div", { className: "row", style: { marginBottom: 12, flexWrap: 'wrap' } },
                React.createElement("select", { style: { width: 'auto' }, value: fTipoMeta, onChange: e => setFTipoMeta(e.target.value) },
                    React.createElement("option", { value: "" }, "Todos os tipos de ve\u00EDculo"),
                    tiposMeta.map(tipo => React.createElement("option", { key: tipo, value: tipo }, tipo))),
                React.createElement("div", { className: "grow" }),
                podeEditarMetas && React.createElement("button", { className: "btn btn-p", onClick: () => setEdit({ tipo: '', start: 0, meta: 0, valorMeta: 0, pctStart: 0, pctMeta: 0, teto: 0, vigIni: HOJE, vigFim: HOJE.slice(0, 4) + '-12-31', status: 'Ativa', ativo: true, observacao: '' }) }, "+ Incluir meta")),
            React.createElement("div", { className: "card", style: { overflowX: 'auto' } },
                React.createElement("table", null,
                    React.createElement("thead", null,
                        React.createElement("tr", null,
                            React.createElement("th", null, "Tipo de ve\u00EDculo"),
                            React.createElement("th", { className: "td-num" }, "Start"),
                            React.createElement("th", { className: "td-num" }, "Meta"),
                            React.createElement("th", { className: "td-num" }, "Na meta"),
                            React.createElement("th", { className: "td-num" }, "% start\u2192meta"),
                            React.createElement("th", { className: "td-num" }, "% acima meta"),
                            React.createElement("th", { className: "td-num" }, "Teto mensal"),
                            React.createElement("th", null, "Vig\u00EAncia"),
                            React.createElement("th", null, "Status"),
                            React.createElement("th", null))),
                    React.createElement("tbody", null, metas.map(m => React.createElement("tr", { key: m.itemId || m.id },
                        React.createElement("td", null,
                            React.createElement("b", null, m.tipo)),
                        React.createElement("td", { className: "td-num num" }, brl(m.start)),
                        React.createElement("td", { className: "td-num num" }, brl(m.meta)),
                        React.createElement("td", { className: "td-num num" }, brl(m.valorMeta)),
                        React.createElement("td", { className: "td-num num" },
                            m.pctStart,
                            "%"),
                        React.createElement("td", { className: "td-num num" },
                            m.pctMeta,
                            "%"),
                        React.createElement("td", { className: "td-num num" }, brl(m.teto)),
                        React.createElement("td", { className: "muted" },
                            dataBR(m.vigIni),
                            " \u2014 ",
                            dataBR(m.vigFim)),
                        React.createElement("td", null,
                            React.createElement("span", { className: "tag tag-neutro" }, statusMeta(m))),
                        React.createElement("td", null, podeEditarMetas && React.createElement("button", { className: "btn btn-s btn-sm", onClick: () => setEdit({ ...m }) }, "Editar"))))))),
            React.createElement("div", { className: "aviso-box" }, "As metas s\u00E3o gravadas por vig\u00EAncia. Cadastre uma nova meta para um novo per\u00EDodo sem alterar o hist\u00F3rico finalizado.")),
        sub === 'desc' && pode(user, 'descontos.visualizar') && React.createElement(React.Fragment, null,
            React.createElement("div", { className: "card", style: { padding: 12 } },
                React.createElement("div", { className: "filtros-operacionais" },
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-premiacao-competencia-2" }, "Compet\u00EAncia"),
                        React.createElement("input", { id: "adm-premiacao-competencia-2", name: "adm-premiacao-competencia-2", autoComplete: "off", type: "month", value: competencia, onChange: e => setCompetencia(e.target.value) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-premiacao-motorista" }, "Motorista"),
                        React.createElement("select", { id: "adm-premiacao-motorista", name: "adm-premiacao-motorista", value: fMotorista, onChange: e => setFMotorista(e.target.value) },
                            React.createElement("option", { value: "" }, "Todos os motoristas"),
                            (painel.elegiveis || []).map(u => React.createElement("option", { key: u.motoristaId, value: u.motoristaId }, u.nome)))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-premiacao-buscar" }, "Buscar"),
                        React.createElement("input", { id: "adm-premiacao-buscar", name: "adm-premiacao-buscar", autoComplete: "off", value: fBuscaDesc, onChange: e => setFBuscaDesc(e.target.value), placeholder: "Motorista, categoria ou motivo" })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-premiacao-status-da-conferencia" }, "Status da confer\u00EAncia"),
                        React.createElement("select", { id: "adm-premiacao-status-da-conferencia", name: "adm-premiacao-status-da-conferencia", value: fStatusDesc, onChange: e => { setFStatusDesc(e.target.value); if (e.target.value === 'PENDENTES')
                                setFSituacaoDesc(''); } },
                            React.createElement("option", { value: "PENDENTES" }, "Somente pendentes"),
                            React.createElement("option", { value: "CONFERIDOS" }, "Somente conferidos"),
                            React.createElement("option", { value: "TODOS" }, "Todos"))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-premiacao-categoria" }, "Categoria"),
                        React.createElement("select", { id: "adm-premiacao-categoria", name: "adm-premiacao-categoria", value: fCategoriaDesc, onChange: e => setFCategoriaDesc(e.target.value) },
                            React.createElement("option", { value: "" }, "Todas as categorias"),
                            categorias.map(c => React.createElement("option", { key: c }, c)))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-premiacao-situacao-lancada" }, "Situa\u00E7\u00E3o lan\u00E7ada"),
                        React.createElement("select", { id: "adm-premiacao-situacao-lancada", name: "adm-premiacao-situacao-lancada", disabled: fStatusDesc === 'PENDENTES', value: fSituacaoDesc, onChange: e => setFSituacaoDesc(e.target.value) },
                            React.createElement("option", { value: "" }, "Todas"),
                            React.createElement("option", null, "Sem ocorr\u00EAncia"),
                            React.createElement("option", null, "Com ocorr\u00EAncia"))),
                    React.createElement("div", null,
                        React.createElement("button", { className: "btn btn-g", style: { width: '100%' }, onClick: () => { setFMotorista(''); setFBuscaDesc(''); setFStatusDesc('PENDENTES'); setFCategoriaDesc(''); setFSituacaoDesc(''); } }, "Limpar filtros")))),
            React.createElement("div", { className: "totais" }, categorias.map(c => {
                const buscaCard = normalizar(fBuscaDesc);
                const quantidade = ((painel.pendencias || {})[c] || []).filter(u => (!fMotorista || String(u.motoristaId) === String(fMotorista)) && (!buscaCard || normalizar(u.nome).includes(buscaCard))).length;
                return React.createElement("button", { className: 'card card-atalho' + (fCategoriaDesc === c && fStatusDesc === 'PENDENTES' ? ' on' : ''), key: c, onClick: () => selecionarCategoria(c) },
                    React.createElement("span", { className: "seta-card" }, "\u2192"),
                    React.createElement("div", { className: "v num", style: { color: quantidade ? 'var(--colheita-escura)' : 'var(--mata)' } }, quantidade),
                    React.createElement("div", { className: "l" },
                        c,
                        React.createElement("br", null),
                        React.createElement("span", { className: "muted" }, "pendentes \u2014 clique para localizar")));
            })),
            podeEditarDescontos && React.createElement("div", { className: "card", id: "form-descontos" },
                React.createElement("div", { className: "row", style: { marginBottom: 10, flexWrap: 'wrap' } },
                    React.createElement("div", { className: "grow" },
                        React.createElement("h3", null, novoDesc.itemId ? 'Editar conferência' : 'Conferir desconto'),
                        React.createElement("div", { className: "muted" }, "Para o cen\u00E1rio padr\u00E3o, selecione todos os pendentes e grave como \u201CSem ocorr\u00EAncia\u201D. As exce\u00E7\u00F5es podem ser tratadas individualmente.")),
                    !novoDesc.itemId && ((painel.pendencias || {})[novoDesc.categoria] || []).length > 0 && React.createElement("button", { className: "btn btn-s btn-sm", onClick: () => setNovoDesc({ ...novoDesc, motoristaId: '__TODOS__', motoristaNome: '', situacao: 'Sem ocorrência', quantidade: 0, valor: 0, percentual: 0, dataOcorrencia: '', motivo: '' }) }, "Selecionar todos os pendentes")),
                novoDesc.itemId && React.createElement("div", { className: "aviso-box", style: { marginBottom: 12 } }, "Editando lan\u00E7amento existente. Ao salvar, o registro ser\u00E1 atualizado sem criar duplicidade."),
                React.createElement("div", { className: "form-grid" },
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-premiacao-motorista-2" }, "Motorista"),
                        React.createElement("select", { id: "adm-premiacao-motorista-2", name: "adm-premiacao-motorista-2", value: novoDesc.motoristaId, onChange: e => { const u = (painel.elegiveis || []).find(x => String(x.motoristaId) === String(e.target.value)); setNovoDesc({ ...novoDesc, motoristaId: e.target.value, motoristaNome: u?.nome || '' }); } },
                            React.createElement("option", { value: "" }, "Selecionar..."),
                            !novoDesc.itemId && React.createElement("option", { value: "__TODOS__" }, "\u2713 Todos os motoristas pendentes"),
                            elegiveis.map(u => React.createElement("option", { key: u.motoristaId, value: u.motoristaId }, u.nome)))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-premiacao-categoria-2" }, "Categoria"),
                        React.createElement("select", { id: "adm-premiacao-categoria-2", name: "adm-premiacao-categoria-2", value: novoDesc.categoria, onChange: e => setNovoDesc({ ...novoDesc, categoria: e.target.value }) }, categorias.map(c => React.createElement("option", { key: c }, c)))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-premiacao-situacao" }, "Situa\u00E7\u00E3o"),
                        React.createElement("select", { id: "adm-premiacao-situacao", name: "adm-premiacao-situacao", value: novoDesc.situacao, onChange: e => setNovoDesc({ ...novoDesc, situacao: e.target.value, motoristaId: e.target.value === 'Com ocorrência' && novoDesc.motoristaId === '__TODOS__' ? '' : novoDesc.motoristaId }) },
                            React.createElement("option", null, "Sem ocorr\u00EAncia"),
                            React.createElement("option", null, "Com ocorr\u00EAncia"))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-premiacao-quantidade" }, "Quantidade"),
                        React.createElement("input", { id: "adm-premiacao-quantidade", name: "adm-premiacao-quantidade", autoComplete: "off", type: "number", min: "0", value: novoDesc.quantidade, onChange: e => setNovoDesc({ ...novoDesc, quantidade: e.target.value }) })),
                    novoDesc.situacao === 'Com ocorrência' && React.createElement(React.Fragment, null,
                        novoDesc.categoria === 'Auditoria Interna' ? React.createElement(React.Fragment, null,
                        React.createElement("div", null,
                            React.createElement("label", { htmlFor: "adm-premiacao-valor-do-desconto-r" }, "Valor do desconto (R$)"),
                            React.createElement("input", { id: "adm-premiacao-valor-do-desconto-r", name: "adm-premiacao-valor-do-desconto-r", autoComplete: "off", type: "number", min: "0", value: novoDesc.valor, onChange: e => setNovoDesc({ ...novoDesc, valor: e.target.value }) })),
                        React.createElement("div", null,
                            React.createElement("label", { htmlFor: "adm-premiacao-percentual" }, "Percentual (%)"),
                            React.createElement("input", { id: "adm-premiacao-percentual", name: "adm-premiacao-percentual", autoComplete: "off", type: "number", min: "0", max: "100", value: novoDesc.percentual, onChange: e => setNovoDesc({ ...novoDesc, percentual: e.target.value }) }))) : React.createElement('p', { className: 'muted' }, 'O valor será calculado ao salvar pela quantidade e pela regra vigente em Metas.'),
                        React.createElement("div", null,
                            React.createElement("label", { htmlFor: "adm-premiacao-data-da-ocorrencia" }, "Data da ocorr\u00EAncia"),
                            React.createElement("input", { id: "adm-premiacao-data-da-ocorrencia", name: "adm-premiacao-data-da-ocorrencia", autoComplete: "off", type: "date", value: novoDesc.dataOcorrencia, onChange: e => setNovoDesc({ ...novoDesc, dataOcorrencia: e.target.value }) })),
                        React.createElement("div", { style: { gridColumn: '1/-1' } },
                            React.createElement("label", { htmlFor: "adm-premiacao-motivo" }, "Motivo"),
                            React.createElement("textarea", { id: "adm-premiacao-motivo", name: "adm-premiacao-motivo", value: novoDesc.motivo, onChange: e => setNovoDesc({ ...novoDesc, motivo: e.target.value }) })))),
                novoDesc.motoristaId === '__TODOS__' && React.createElement("div", { className: "aviso-box", style: { marginTop: 12 } },
                    "Ser\u00E3o gravados como ",
                    React.createElement("b", null, "Sem ocorr\u00EAncia"),
                    " todos os ",
                    ((painel.pendencias || {})[novoDesc.categoria] || []).length,
                    " motoristas ainda pendentes em ",
                    novoDesc.categoria,
                    ". Quem j\u00E1 foi conferido n\u00E3o ser\u00E1 alterado."),
                React.createElement("div", { className: "row", style: { marginTop: 12 } },
                    React.createElement("button", { className: "btn btn-p", onClick: addDesc }, novoDesc.itemId ? 'Salvar edição' : 'Salvar conferência'),
                    (novoDesc.itemId || novoDesc.motoristaId) && React.createElement("button", { className: "btn btn-s", onClick: () => setNovoDesc({ motoristaId: '', motoristaNome: '', categoria: novoDesc.categoria || 'Multas', situacao: 'Sem ocorrência', quantidade: 0, valor: 0, percentual: 0, dataOcorrencia: '', motivo: '', exibir: true }) }, "Limpar lan\u00E7amento"))),
            React.createElement("div", { className: "card", style: { overflowX: 'auto' } },
                React.createElement("div", { className: "row", style: { marginBottom: 10, flexWrap: 'wrap' } },
                    React.createElement("div", { className: "grow" },
                        React.createElement("h3", null, "Acompanhamento da confer\u00EAncia"),
                        React.createElement("div", { className: "muted" },
                            acompanhamentoDescontos.length,
                            " registro(s) encontrados nos filtros."))),
                React.createElement("table", null,
                    React.createElement("thead", null,
                        React.createElement("tr", null,
                            React.createElement("th", null, "Motorista"),
                            React.createElement("th", null, "Categoria"),
                            React.createElement("th", null, "Status"),
                            React.createElement("th", null, "Situa\u00E7\u00E3o"),
                            React.createElement("th", null, "Data / motivo"),
                            React.createElement("th", { className: "td-num" }, "Valor"),
                            React.createElement("th", null))),
                    React.createElement("tbody", null,
                        acompanhamentoDescontos.map(linha => {
                            const d = linha.registro;
                            return React.createElement("tr", { key: linha.motoristaId + '|' + linha.categoria, className: linha.status === 'PENDENTE' ? 'linha-pendente' : 'linha-confirmada' },
                                React.createElement("td", null,
                                    React.createElement("b", null, linha.motoristaNome)),
                                React.createElement("td", null, linha.categoria),
                                React.createElement("td", null,
                                    React.createElement("span", { className: 'tag ' + (linha.status === 'PENDENTE' ? 'tag-pend' : 'tag-ok') }, linha.status === 'PENDENTE' ? 'Pendente' : 'Conferido')),
                                React.createElement("td", null, linha.status === 'PENDENTE' ? React.createElement("span", { className: "muted" }, "Ainda n\u00E3o lan\u00E7ado") : React.createElement("span", { className: 'tag ' + (linha.situacao === 'Com ocorrência' ? 'tag-neg' : 'tag-neutro') }, linha.situacao || 'Conferido')),
                                React.createElement("td", null, d ? React.createElement(React.Fragment, null,
                                    d.dataOcorrencia && React.createElement("div", null, dataBR(String(d.dataOcorrencia).slice(0, 10))),
                                    React.createElement("div", { className: "muted" }, d.motivo || 'Sem motivo informado')) : React.createElement("span", { className: "muted" }, "Aguardando confer\u00EAncia")),
                                React.createElement("td", { className: "td-num num", style: { color: linha.valor ? 'var(--erro)' : 'var(--cinza)' } }, d ? brl(-Math.abs(linha.valor || 0)) : '—'),
                                React.createElement("td", null, podeEditarDescontos && React.createElement("button", { className: "btn btn-s btn-sm", onClick: () => prepararConferencia(linha) }, linha.status === 'PENDENTE' ? 'Conferir' : 'Editar')));
                        }),
                        !acompanhamentoDescontos.length && React.createElement("tr", null,
                            React.createElement("td", { colSpan: "7", className: "muted", style: { textAlign: 'center', padding: 24 } }, "Nenhum registro encontrado para os filtros selecionados.")))))),
        sub === 'auditoria' && pode(user, 'auditoria.visualizar') && React.createElement(PainelAuditoriaInterna, { competencia, setCompetencia, abrir: setRascunhoAuditoria, editar: pode(user, 'auditoria.editar') }),
        rascunhoAuditoria && React.createElement(RascunhoAuditoria, { linha: rascunhoAuditoria, competencia, editar: pode(user, 'auditoria.editar'), onClose: () => setRascunhoAuditoria(null) }),
        edit &&
            React.createElement(Modal, { titulo: edit.itemId ? 'Editar meta' : 'Incluir meta', onClose: () => setEdit(null) },
                React.createElement("div", { className: "form-grid" },
                    React.createElement("div", { style: { gridColumn: '1/-1' } },
                        React.createElement("label", { htmlFor: "adm-premiacao-tipo-de-veiculo" }, "Tipo de ve\u00EDculo"),
                        React.createElement("select", { id: "adm-premiacao-tipo-de-veiculo", name: "adm-premiacao-tipo-de-veiculo", value: edit.tipo, onChange: e => setEdit({ ...edit, tipo: e.target.value }) },
                            React.createElement("option", { value: "" }, "Selecionar..."),
                            edit.tipo && !tiposMeta.includes(edit.tipo) && React.createElement("option", { value: edit.tipo }, edit.tipo),
                            tiposMeta.map(tipo => React.createElement("option", { key: tipo, value: tipo }, tipo))),
                        !tiposMeta.length &&
                            React.createElement("div", { className: "aviso-box", style: { marginTop: 8 } },
                                "Nenhum tipo foi encontrado nas placas da Frota Pesada. Cadastros consultados: ",
                                (painel.diagnosticoVeiculos || {}).totalCadastro || 0,
                                "; placas pesadas identificadas: ",
                                (painel.diagnosticoVeiculos || {}).totalFrotaPesada || 0,
                                ".")),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-premiacao-start-r" }, "Start (R$)"),
                        React.createElement("input", { id: "adm-premiacao-start-r", name: "adm-premiacao-start-r", autoComplete: "off", type: "number", value: edit.start, onChange: e => setEdit({ ...edit, start: Number(e.target.value) }) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-premiacao-meta-r" }, "Meta (R$)"),
                        React.createElement("input", { id: "adm-premiacao-meta-r", name: "adm-premiacao-meta-r", autoComplete: "off", type: "number", value: edit.meta, onChange: e => setEdit({ ...edit, meta: Number(e.target.value) }) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-premiacao-valor-na-meta-r" }, "Valor na meta (R$)"),
                        React.createElement("input", { id: "adm-premiacao-valor-na-meta-r", name: "adm-premiacao-valor-na-meta-r", autoComplete: "off", type: "number", value: edit.valorMeta, onChange: e => setEdit({ ...edit, valorMeta: Number(e.target.value) }) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-premiacao-teto-mensal-r" }, "Teto mensal (R$)"),
                        React.createElement("input", { id: "adm-premiacao-teto-mensal-r", name: "adm-premiacao-teto-mensal-r", autoComplete: "off", type: "number", value: edit.teto, onChange: e => setEdit({ ...edit, teto: Number(e.target.value) }) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-premiacao-start-meta" }, "% start\u2192meta"),
                        React.createElement("input", { id: "adm-premiacao-start-meta", name: "adm-premiacao-start-meta", autoComplete: "off", type: "number", value: edit.pctStart, onChange: e => setEdit({ ...edit, pctStart: Number(e.target.value) }) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-premiacao-acima-da-meta" }, "% acima da meta"),
                        React.createElement("input", { id: "adm-premiacao-acima-da-meta", name: "adm-premiacao-acima-da-meta", autoComplete: "off", type: "number", value: edit.pctMeta, onChange: e => setEdit({ ...edit, pctMeta: Number(e.target.value) }) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-premiacao-vigencia-inicio" }, "Vig\u00EAncia in\u00EDcio"),
                        React.createElement("input", { id: "adm-premiacao-vigencia-inicio", name: "adm-premiacao-vigencia-inicio", autoComplete: "off", type: "date", value: edit.vigIni, onChange: e => setEdit({ ...edit, vigIni: e.target.value }) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-premiacao-vigencia-fim" }, "Vig\u00EAncia fim"),
                        React.createElement("input", { id: "adm-premiacao-vigencia-fim", name: "adm-premiacao-vigencia-fim", autoComplete: "off", type: "date", value: edit.vigFim, onChange: e => setEdit({ ...edit, vigFim: e.target.value }) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-premiacao-ativa" }, "Ativa"),
                        React.createElement("select", { id: "adm-premiacao-ativa", name: "adm-premiacao-ativa", value: edit.ativo === false ? 'nao' : 'sim', onChange: e => setEdit({ ...edit, ativo: e.target.value === 'sim' }) },
                            React.createElement("option", { value: "sim" }, "Sim"),
                            React.createElement("option", { value: "nao" }, "N\u00E3o")))),
                React.createElement("button", { type: "button", className: "btn btn-p", style: { width: '100%', marginTop: 14 }, onClick: salvarMeta }, "Salvar meta"))));
}
const AREAS_E_SUBTELAS = {
    PAINEL: [
        ['PAINEL_VISAO_GERAL', 'Visão Geral'],
        ['PAINEL_CARGAS', 'Cargas']
    ],
    IMPORTACAO: [],
    CONTESTACOES: [],
    RH_FECHAMENTO: [
        ['ATUALIZARAPURACOESDOQUADRIMESTRE_RH_FECHAMENTO', 'Atualizar apurações do quadrimestre'],
        ['FECHARQUADRIMESTRE_RH_FECHAMENTO', 'Fechar quadrimestre'],
        ['REABRIQUADRIMESTRE_RH_FECHAMENTO', 'Reabrir quadrimestre']
    ],
    PREMIACAO: [
        ['PREMIACAO_PAINEL', 'Painel da premiação'],
        ['PREMIACAO_METAS', 'Metas'],
        ['PREMIACAO_DESCONTOS', 'Descontos'], ['PREMIACAO_AUDITORIA', 'Auditoria Interna']
    ],
    CHECKLIST: [
        ['CHECKLIST_APROVACAO', 'Aprovação'],
        ['CHECKLIST_PERGUNTAS', 'Perguntas'],
        ['CHECKLIST_RELATORIO', 'Relatório']
    ],
    SINISTROS: [
        ['SINISTROS_GESTAO', 'Gestão e tratamento de sinistros'],
        ['SINISTROS_CONFIGURACOES', 'Configurações de sinistros']
    ],
    AGENDAMENTOS: [
        ['AGENDAMENTOS_AGENDA_GERAL', 'Agenda geral'],
        ['AGENDAMENTOS_MONITORAMENTO', 'Monitoramento e gestão'],
        ['AGENDAMENTOS_RELATORIO', 'Relatório de agendamentos'],
        ['AGENDAMENTOS_PARAMETROS', 'Parâmetros']
    ],
    CADASTROS: [
        ['CADASTRO_USUARIOS', 'Usuários'],
        ['CADASTRO_TIPOS_VEICULO', 'Tipos de veículo'],
        ['CADASTRO_VEICULOS', 'Veículos'],
        ['CADASTRO_VINCULOS', 'Vínculos'],
        ['CADASTRO_PERFIS', 'Perfis']
    ]
};
const ROTULOS_AREAS = { PAINEL: 'Painel', IMPORTACAO: 'Importação', CONTESTACOES: 'Contestações', RH_FECHAMENTO: 'RH / Fechamento', PREMIACAO: 'Premiação', CHECKLIST: 'Check list', SINISTROS: 'Sinistros', AGENDAMENTOS: 'Agendamentos', CADASTROS: 'Cadastros' };
const normalizarCodigoAcesso = codigo => String(codigo || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
const canonCodigoAcesso = (codigo) => {
    const alvo = normalizarCodigoAcesso(codigo);
    return [...Object.keys(AREAS_E_SUBTELAS), ...Object.values(AREAS_E_SUBTELAS).flat().map(([c]) => c)]
        .find(c => normalizarCodigoAcesso(c) === alvo) || String(codigo || '').trim().toUpperCase();
};
const canonListaAcesso = (lista) => [...new Set((lista || []).map(canonCodigoAcesso).filter(Boolean))];
/* ================= ADM: CADASTROS (usuários + frota + perfis) ================= */
function RegrasCapacidadeProduto({ tipo, onChange }) {
    const regras = tipo.regrasCapacidade;
    const nova = () => ({ aplicar: 'SELECIONADOS', produtos: [], capacidadeCargaKg: Number(tipo.capacidadeCargaKg || 0), toleranciaSuperiorKg: Number(tipo.toleranciaSuperiorKg || 0), toleranciaInferiorKg: Number(tipo.limiteInferiorKg || 0), validarAbaixo: tipo.exigeAprovacaoAbaixo === true });
    const alterar = (i, changes) => onChange({ ...tipo, regrasCapacidade: regras.map((r, j) => j === i ? { ...r, ...changes } : r) });
    return React.createElement('div', { className: 'card', style: { marginTop: 14, background: 'var(--papel)' } },
        React.createElement('h3', null, 'Capacidade por produto'),
        React.createElement('p', { className: 'muted' }, 'Prioridade: produtos selecionados → todos, exceto → todos. Produtos sem regra não geram divergência pela faixa de capacidade. O PBT do conjunto permanece separado.'),
        regras == null ? React.createElement(React.Fragment, null,
            React.createElement('p', { className: 'muted' }, 'Este tipo ainda utiliza a capacidade geral acima.'),
            React.createElement('button', { type: 'button', className: 'btn btn-s', onClick: () => onChange({ ...tipo, regrasCapacidade: [{ ...nova(), aplicar: 'TODOS' }] }) }, 'Configurar regras por produto')) : React.createElement(React.Fragment, null,
            React.createElement('p', { className: 'muted' }, 'Homologação: a regra mais recente vale desde o início dos testes, inclusive para cargas antigas. Contestações já registradas mantêm seus dados originais.'),
            regras.length === 0 && React.createElement('div', { className: 'aviso-box' }, 'Nenhuma regra: a faixa operacional não será validada para nenhum produto.'),
            regras.map((r, i) => React.createElement('div', { className: 'card', key: i, style: { marginTop: 12 } },
                React.createElement('div', { className: 'row' }, React.createElement('b', { className: 'grow' }, 'Regra ' + (i + 1)), React.createElement('button', { type: 'button', className: 'btn btn-g btn-sm', onClick: () => onChange({ ...tipo, regrasCapacidade: regras.filter((_, j) => j !== i) }) }, 'Remover')),
                React.createElement('div', { className: 'form-grid', style: { marginTop: 8 } },
                    React.createElement('label', null, 'Aplicar a', React.createElement('select', { value: r.aplicar, onChange: e => alterar(i, { aplicar: e.target.value }) },
                        React.createElement('option', { value: 'TODOS' }, 'Todos'), React.createElement('option', { value: 'SELECIONADOS' }, 'Produtos selecionados'), React.createElement('option', { value: 'EXCETO' }, 'Todos, exceto os selecionados'))),
                    r.aplicar !== 'TODOS' && React.createElement('label', null, 'Produtos (separe por ponto e vírgula)', React.createElement('input', { value: r.produtosTexto ?? (r.produtos || []).join('; '), placeholder: 'SOJA; MILHO', onChange: e => alterar(i, { produtosTexto: e.target.value, produtos: e.target.value.split(/[;,]/).map(x => x.trim()).filter(Boolean) }) })),
                    ...[['capacidadeCargaKg', 'Capacidade (kg)'], ['toleranciaSuperiorKg', 'Tolerância acima (kg)'], ['toleranciaInferiorKg', 'Tolerância abaixo (kg)']].map(([campo, label]) => React.createElement('label', { key: campo }, label, React.createElement('input', { type: 'number', min: 0, step: 1, value: r[campo], onChange: e => alterar(i, { [campo]: e.target.value }) }))),
                    React.createElement('label', null, 'Validar abaixo do mínimo?', React.createElement('select', { value: r.validarAbaixo ? 's' : 'n', onChange: e => alterar(i, { validarAbaixo: e.target.value === 's' }) }, React.createElement('option', { value: 's' }, 'Sim'), React.createElement('option', { value: 'n' }, 'Não')))))),
            React.createElement('button', { type: 'button', className: 'btn btn-s', style: { marginTop: 10 }, disabled: regras.length >= 30, onClick: () => onChange({ ...tipo, regrasCapacidade: [...regras, nova()] }) }, '+ Adicionar regra')));
}

function AdmCadastros({ st, setSt, toast, user }) {
    const [sub, setSub] = useState(pode(user, 'cadastro.usuarios') ? 'usuarios' : pode(user, 'cadastro.tipos_veiculo') ? 'tipos' : pode(user, 'cadastro.veiculos') ? 'frota' : pode(user, 'cadastro.vinculos') ? 'vinculos' : 'perfis');
    const [edit, setEdit] = useState(null);
    const [editTipo, setEditTipo] = useState(null);
    const [editPlaca, setEditPlaca] = useState(null);
    const [editVinculo, setEditVinculo] = useState(null);
    const [editPerfil, setEditPerfil] = useState(null);
    const [salvandoPerfil, setSalvandoPerfil] = useState(false);
    const [salvandoUsuario, setSalvandoUsuario] = useState(false);
    const [senhaVisivel, setSenhaVisivel] = useState(false);
    const [cad, setCad] = useState({ usuarios: [], tiposVeiculo: [], veiculos: [], vinculos: [], perfis: [] });
    const [carregandoCad, setCarregandoCad] = useState(true);
    const [erroCad, setErroCad] = useState('');
    const [fUsuario, setFUsuario] = useState({ nome: '', perfil: '', ordem: 'nome-asc' });
    const [fVeiculo, setFVeiculo] = useState({ placa: '', frota: '', tipo: '', ordem: 'placa-asc' });
    const [fVinculo, setFVinculo] = useState({ placa: '', usuario: '', status: '', ordem: 'usuario-asc' });
    const perfilSelecionado = edit ? cad.perfis.find(p => String(p.itemId) === String(edit.perfilAcessoId || '')) : null;
    const permiteModulosUsuario = perfilSelecionado?.permiteModulosApp === true;
    const proximoUsuarioId = () => { const maior = cad.usuarios.reduce((m, u) => { const x = String(u.usuarioId || '').match(/^USU-(\d+)$/i); return x ? Math.max(m, Number(x[1])) : m; }, 0); return 'USU-' + String(maior + 1).padStart(3, '0'); };
    const carregar = async () => {
        setCarregandoCad(true);
        setErroCad('');
        try {
            const r = await ApiService.admCadastros();
            setCad({ usuarios: r.usuarios || [], tiposVeiculo: r.tiposVeiculo || [], veiculos: r.veiculos || [], vinculos: r.vinculos || [], perfis: r.perfis || [] });
        }
        catch (e) {
            const msg = 'Erro ao carregar cadastros: ' + e.message;
            setErroCad(msg);
            toast(msg);
        }
        finally {
            setCarregandoCad(false);
        }
    };
    useEffect(() => { carregar(); }, []);
    useAtualizacaoPortal(['cadastros'], async () => {
        const r = await ApiService.admCadastros();
        setCad({ usuarios: r.usuarios || [], tiposVeiculo: r.tiposVeiculo || [], veiculos: r.veiculos || [], vinculos: r.vinculos || [], perfis: r.perfis || [] });
    });
    const salvarUser = async () => {
        if (salvandoUsuario || !edit)
            return;
        const login = String(edit.login || '').trim().toLowerCase(), usuarioId = String(edit.usuarioId || '').trim().toUpperCase();
        if (!String(edit.nome || '').trim() || !login || !usuarioId) {
            toast('Nome, UsuarioID e usuário são obrigatórios.');
            return;
        }
        if (!edit.perfilAcessoId) {
            toast('Selecione um perfil de acesso cadastrado.');
            return;
        }
        const perfilDoUsuario = cad.perfis.find(p => String(p.itemId) === String(edit.perfilAcessoId));
        const modulosPermitidos = perfilDoUsuario?.permiteModulosApp === true;
        if (cad.usuarios.some(u => u.itemId !== edit.itemId && String(u.login || '').trim().toLowerCase() === login)) {
            toast('O usuário ' + login + ' já está cadastrado.');
            return;
        }
        if (cad.usuarios.some(u => u.itemId !== edit.itemId && String(u.usuarioId || '').trim().toUpperCase() === usuarioId)) {
            toast('O UsuarioID ' + usuarioId + ' já está cadastrado.');
            return;
        }
        const novaSenha = String(edit.novaSenha || '');
        if (!edit.itemId && !novaSenha) {
            toast('Digite ou gere a senha inicial.');
            return;
        }
        if (novaSenha && edit.perfil === 'MOTORISTA' && !/^\d{6}$/.test(novaSenha)) {
            toast('Motorista deve usar PIN com exatamente 6 números.');
            return;
        }
        if (novaSenha && edit.perfil !== 'MOTORISTA' && novaSenha.length < 8) {
            toast('Administrador e visualizador devem usar ao menos 8 caracteres.');
            return;
        }
        const dadosUsuario = { ...edit, login, usuarioId,
            acessoCargas: modulosPermitidos && edit.acessoCargas === true,
            acessoPremiacao: modulosPermitidos && edit.acessoPremiacao === true,
            acessoChecklist: modulosPermitidos && edit.acessoChecklist === true,
            acessoSinistros: modulosPermitidos && edit.acessoSinistros === true,
            acessoAgendamentos: modulosPermitidos && edit.acessoAgendamentos === true,
            acessoHistorico: modulosPermitidos && edit.acessoChecklist === true
        };
        setSalvandoUsuario(true);
        try {
            const resposta = await ApiService.salvarUsuario(dadosUsuario);
            if (!resposta?.ok && !resposta?.sucesso)
                throw new Error(resposta?.erro || 'O D1 de homologação não confirmou o salvamento do usuário.');
            setEdit(null);
            await carregar();
            if (novaSenha)
                window.alert('Acesso salvo com sucesso.\n\nUsuário: ' + login + '\nSenha temporária: ' + novaSenha + '\n\nCopie agora: ela não poderá ser visualizada novamente.');
            else
                toast('Usuário salvo no D1 de homologação.');
        }
        catch (e) {
            toast('Erro ao salvar usuário: ' + (e?.message || String(e)));
        }
        finally {
            setSalvandoUsuario(false);
        }
    };
    const gerarSenha = () => {
        if (edit.perfil === 'MOTORISTA') {
            const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
            setEdit({ ...edit, novaSenha: String(n).padStart(6, '0') });
        }
        else {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#';
            const rnd = crypto.getRandomValues(new Uint8Array(12));
            setEdit({ ...edit, novaSenha: Array.from(rnd, b => chars[b % chars.length]).join('') });
        }
        setSenhaVisivel(true);
    };
    const alterarStatusUsuario = async (u) => {
        if (!window.confirm((u.ativo ? 'Inativar' : 'Reativar') + ' o usuário ' + u.nome + '?'))
            return;
        try {
            await ApiService.salvarUsuario({ ...u, ativo: !u.ativo });
            await carregar();
            toast('Usuário ' + u.nome + ' ' + (u.ativo ? 'inativado' : 'reativado') + ' com sucesso.');
        }
        catch (e) {
            toast('Erro ao alterar status do usuário: ' + e.message);
        }
    };
    const salvarPlaca = async () => {
        const placa = String(editPlaca.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!placa) {
            toast('Informe a placa do veículo.');
            return;
        }
        if (!String(editPlaca.tipoModelo || '').trim()) {
            toast('Selecione o tipo do veículo.');
            return;
        }
        const repetida = cad.veiculos.some(v => v.itemId !== editPlaca.itemId && String(v.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === placa);
        if (repetida) {
            toast('A placa ' + placa + ' já está cadastrada.');
            return;
        }
        try {
            await ApiService.salvarVeiculo({ ...editPlaca, placa });
            setEditPlaca(null);
            await carregar();
            toast('Veículo salvo no D1 de homologação.');
        }
        catch (e) {
            toast('Erro ao salvar veículo: ' + e.message);
        }
    };
    const salvarTipo = async () => {
        if (!String(editTipo.nome || '').trim()) {
            toast('Informe o nome do tipo de veículo.');
            return;
        }
        try {
            await ApiService.salvarTipoVeiculo(editTipo);
            setEditTipo(null);
            await carregar();
            toast('Tipo de veículo salvo no D1 de homologação.');
        }
        catch (e) {
            toast('Erro ao salvar tipo de veículo: ' + e.message);
        }
    };
    const alterarStatusTipo = async (t) => {
        if (!window.confirm((t.ativo ? 'Inativar' : 'Reativar') + ' o tipo ' + t.nome + '?'))
            return;
        try {
            await ApiService.salvarTipoVeiculo({ ...t, ativo: !t.ativo });
            await carregar();
            toast('Tipo de veículo atualizado.');
        }
        catch (e) {
            toast('Erro ao alterar tipo de veículo: ' + e.message);
        }
    };
    const alterarStatusPlaca = async (f) => {
        const acao = f.ativo ? 'inativar' : 'reativar';
        if (!window.confirm((f.ativo ? 'Inativar' : 'Reativar') + ' a placa ' + f.placa + '?'))
            return;
        try {
            await ApiService.salvarVeiculo({ ...f, ativo: !f.ativo });
            await carregar();
            toast('Placa ' + f.placa + ' ' + (f.ativo ? 'inativada' : 'reativada') + ' com sucesso.');
        }
        catch (e) {
            toast('Erro ao ' + acao + ' placa: ' + e.message);
        }
    };
    const salvarVinculo = async () => { const u = cad.usuarios.find(x => String(x.itemId) === String(editVinculo.usuarioItemId)), v = cad.veiculos.find(x => String(x.itemId) === String(editVinculo.veiculoItemId)); if (!u || !v) {
        toast('Selecione usuário e veículo.');
        return;
    } try {
        await ApiService.salvarVinculo({ ...editVinculo, usuarioId: u.usuarioId, titulo: u.usuarioId + ' - ' + v.placa });
        setEditVinculo(null);
        await carregar();
        toast('Vínculo salvo no D1 de homologação.');
    }
    catch (e) {
        toast('Erro ao salvar vínculo: ' + e.message);
    } };
    const salvarPerfil = async (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        if (salvandoPerfil || !editPerfil)
            return;
        setSalvandoPerfil(true);
        try {
            if (!String(editPerfil.titulo || '').trim())
                throw new Error('Informe o nome do perfil.');
            const areasCanon = canonListaAcesso(editPerfil.areasAcesso);
            const subtelasCanon = canonListaAcesso(editPerfil.subtelasAcesso);
            const subtelasValidas = subtelasCanon.filter(c => areasCanon.some(a => (AREAS_E_SUBTELAS[a] || []).some(([codigo]) => codigo === c)));
            if (areasCanon.includes('PAINEL') && !ABAS_PAINEL.some(aba => subtelasValidas.includes(aba)))
                throw new Error('Selecione ao menos uma aba do Painel ou desmarque a área.');
            const resposta = await ApiService.salvarPerfil({ ...editPerfil, titulo: String(editPerfil.titulo).toUpperCase(), areasAcesso: areasCanon, subtelasAcesso: subtelasValidas });
            if (!resposta?.ok && !resposta?.sucesso)
                throw new Error(resposta?.erro || 'O D1 de homologação não confirmou o salvamento do perfil.');
            await carregar();
            setEditPerfil(null);
            toast('Perfil salvo no D1 de homologação.');
        }
        catch (e) {
            toast('Erro ao salvar perfil: ' + (e?.message || String(e)));
        }
        finally {
            setSalvandoPerfil(false);
        }
    };
    const alternarArea = (area) => {
        const marcada = (editPerfil.areasAcesso || []).includes(area);
        const areas = marcada ? (editPerfil.areasAcesso || []).filter(a => a !== area) : [...(editPerfil.areasAcesso || []), area];
        const codigos = (AREAS_E_SUBTELAS[area] || []).map(([c]) => c);
        const subtelas = marcada ? (editPerfil.subtelasAcesso || []).filter(c => !codigos.includes(c)) : (editPerfil.subtelasAcesso || []);
        setEditPerfil({ ...editPerfil, areasAcesso: areas, subtelasAcesso: subtelas });
    };
    const alternarSubtela = (codigo) => setEditPerfil({ ...editPerfil, subtelasAcesso: (editPerfil.subtelasAcesso || []).includes(codigo) ? (editPerfil.subtelasAcesso || []).filter(c => c !== codigo) : [...(editPerfil.subtelasAcesso || []), codigo] });
    const podeSub = (codigo) => pode(user, codigo);
    /* A edição da placa deve sempre exibir o cadastro central. O status ou a
       classificação da frota não podem apagar as opções do seletor; o valor
       antigo continua identificado separadamente como histórico. */
    const tiposAtivos = [...new Map(cad.tiposVeiculo
            .filter(t => String(t.nome || '').trim())
            .map(t => [chaveTipo(t.nome), t])).values()]
        .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    const compararTexto = (a, b) => String(a || '').localeCompare(String(b || ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
    const acessosFrota = { FROTA_LEVE: 'Frota leve', FROTA_PESADA: 'Frota pesada', AMBAS: 'Ambos' };
    const acessoFrota = u => {
        const acesso = normalizarPerfil(u.tipoFrotaAcesso);
        return Object.hasOwn(acessosFrota, acesso) ? acesso : 'SEM_ACESSO';
    };
    const usuariosFiltrados = cad.usuarios
        .filter(u => String(u.nome || '').toLocaleLowerCase('pt-BR').includes(fUsuario.nome.toLocaleLowerCase('pt-BR')) && (!fUsuario.perfil || u.perfil === fUsuario.perfil) && (!fUsuario.frota || acessoFrota(u) === fUsuario.frota))
        .sort((a, b) => (fUsuario.ordem.endsWith('desc') ? -1 : 1) * compararTexto(fUsuario.ordem.startsWith('perfil') ? a.perfil : a.nome, fUsuario.ordem.startsWith('perfil') ? b.perfil : b.nome));
    const usuariosAtivos = usuariosFiltrados.filter(u => u.ativo);
    const indicadoresUsuarios = [
        ['Usuários ativos', usuariosAtivos.length],
        ['Usuários inativos', usuariosFiltrados.length - usuariosAtivos.length],
        ...Object.entries(acessosFrota).map(([acesso, titulo]) => [titulo, usuariosAtivos.filter(u => acessoFrota(u) === acesso).length])
    ];
    const veiculosFiltrados = cad.veiculos
        .filter(v => String(v.placa || '').toUpperCase().includes(fVeiculo.placa.toUpperCase()) &&
        (!fVeiculo.frota || v.tipoFrota === fVeiculo.frota) &&
        (!fVeiculo.tipo || chaveTipo(v.tipoModelo) === chaveTipo(fVeiculo.tipo)))
        .sort((a, b) => {
        const campo = fVeiculo.ordem.split('-')[0], dir = fVeiculo.ordem.endsWith('desc') ? -1 : 1;
        const va = campo === 'frota' ? a.tipoFrota : campo === 'tipo' ? a.tipoModelo : a.placa;
        const vb = campo === 'frota' ? b.tipoFrota : campo === 'tipo' ? b.tipoModelo : b.placa;
        return dir * compararTexto(va, vb);
    });
    const statusVinculo = v => v.dataFim ? 'Finalizado' : v.ativo ? 'Ativo' : 'Inativo';
    const vinculosFiltrados = cad.vinculos
        .filter(v => String(v.placa || '').toUpperCase().includes(fVinculo.placa.toUpperCase()) &&
        String(v.usuarioNome || '').toLocaleLowerCase('pt-BR').includes(fVinculo.usuario.toLocaleLowerCase('pt-BR')) &&
        (!fVinculo.status || statusVinculo(v) === fVinculo.status))
        .sort((a, b) => {
        const campo = fVinculo.ordem.split('-')[0], dir = fVinculo.ordem.endsWith('desc') ? -1 : 1;
        const va = campo === 'placa' ? a.placa : campo === 'status' ? statusVinculo(a) : a.usuarioNome;
        const vb = campo === 'placa' ? b.placa : campo === 'status' ? statusVinculo(b) : b.usuarioNome;
        return dir * compararTexto(va, vb);
    });
    return (React.createElement(React.Fragment, null,
        React.createElement("div", { className: "row", style: { flexWrap: 'wrap' } },
            React.createElement("h2", { className: "grow" }, "Cadastros"),
            React.createElement("div", { className: "subtabs" },
                podeSub('cadastro.usuarios') && React.createElement("button", { className: 'subtab' + (sub === 'usuarios' ? ' on' : ''), onClick: () => setSub('usuarios') }, "Usu\u00E1rios e acessos"),
                podeSub('cadastro.tipos_veiculo') && React.createElement("button", { className: 'subtab' + (sub === 'tipos' ? ' on' : ''), onClick: () => setSub('tipos') }, "Tipos de ve\u00EDculo"),
                podeSub('cadastro.veiculos') && React.createElement("button", { className: 'subtab' + (sub === 'frota' ? ' on' : ''), onClick: () => setSub('frota') }, "Ve\u00EDculos"),
                podeSub('cadastro.vinculos') && React.createElement("button", { className: 'subtab' + (sub === 'vinculos' ? ' on' : ''), onClick: () => setSub('vinculos') }, "V\u00EDnculos"),
                podeSub('cadastro.perfis') && React.createElement("button", { className: 'subtab' + (sub === 'perfis' ? ' on' : ''), onClick: () => setSub('perfis') }, "Perfis"))),
        erroCad && React.createElement("div", { className: "aviso-box", style: { borderColor: '#b42318', color: '#b42318' } },
            erroCad,
            React.createElement("div", { style: { marginTop: 8 } },
                React.createElement("button", { className: "btn btn-s btn-sm", onClick: carregar }, "Tentar novamente"))),
        carregandoCad && React.createElement("div", { className: "card" },
            React.createElement("div", { className: "muted" }, "Carregando cadastros do banco D1 de homologação...")),
        sub === 'usuarios' && podeSub('cadastro.usuarios') && !carregandoCad && !erroCad && React.createElement(React.Fragment, null,
            React.createElement("div", null,
                React.createElement("button", { className: "btn btn-p", onClick: () => { setSenhaVisivel(false); const p = cad.perfis.find(x => x.titulo === 'MOTORISTA'); setEdit({ nome: '', usuarioId: proximoUsuarioId(), login: '', telefone: '', perfil: p?.titulo || '', perfilAcessoId: p?.itemId || '', tipoFrotaAcesso: 'FROTA PESADA', ativo: true, novaSenha: '', acessoCargas: false, acessoPremiacao: false, acessoChecklist: false, acessoSinistros: false, acessoAgendamentos: false, acessoHistorico: false }); } }, "+ Novo usu\u00E1rio")),
            React.createElement("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, margin: '12px 0' }, 'aria-label': 'Resumo do cadastro' },
                indicadoresUsuarios.map(([titulo, total]) => React.createElement("div", { className: "card kpi", key: titulo },
                    React.createElement("div", { className: "l" }, titulo),
                    React.createElement("div", { className: "v num" }, total)))),
            React.createElement("div", { className: "filtros-cadastro" },
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-filtrar-por-nome" }, "Filtrar por nome"),
                    React.createElement("input", { id: "adm-cadastros-filtrar-por-nome", name: "adm-cadastros-filtrar-por-nome", autoComplete: "off", value: fUsuario.nome, onChange: e => setFUsuario({ ...fUsuario, nome: e.target.value }), placeholder: "Digite o nome" })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-perfil" }, "Perfil"),
                    React.createElement("select", { id: "adm-cadastros-perfil", name: "adm-cadastros-perfil", value: fUsuario.perfil, onChange: e => setFUsuario({ ...fUsuario, perfil: e.target.value }) },
                        React.createElement("option", { value: "" }, "Todos os perfis"),
                        [...new Set(cad.usuarios.map(u => u.perfil).filter(Boolean))].sort(compararTexto).map(p => React.createElement("option", { key: p }, p)))),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-filtro-frota" }, "Acesso à frota"),
                    React.createElement("select", { id: "adm-cadastros-filtro-frota", value: fUsuario.frota || '', onChange: e => setFUsuario({ ...fUsuario, frota: e.target.value }) },
                        React.createElement("option", { value: "" }, "Todos"),
                        Object.entries(acessosFrota).map(([value, titulo]) => React.createElement("option", { key: value, value }, titulo)),
                        React.createElement("option", { value: "SEM_ACESSO" }, "Sem acesso à frota"))),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-ordenar" }, "Ordenar"),
                    React.createElement("select", { id: "adm-cadastros-ordenar", name: "adm-cadastros-ordenar", value: fUsuario.ordem, onChange: e => setFUsuario({ ...fUsuario, ordem: e.target.value }) },
                        React.createElement("option", { value: "nome-asc" }, "Nome A\u2013Z"),
                        React.createElement("option", { value: "nome-desc" }, "Nome Z\u2013A"),
                        React.createElement("option", { value: "perfil-asc" }, "Perfil A\u2013Z"),
                        React.createElement("option", { value: "perfil-desc" }, "Perfil Z\u2013A")))),
            React.createElement("div", { className: "card", style: { overflowX: 'auto' } },
                React.createElement("table", null,
                    React.createElement("thead", null,
                        React.createElement("tr", null,
                            React.createElement("th", null, "Nome"),
                            React.createElement("th", null, "UsuarioID"),
                            React.createElement("th", null, "Usu\u00E1rio"),
                            React.createElement("th", null, "Perfil"),
                            React.createElement("th", null, "Senha"),
                            React.createElement("th", null, "Status"),
                            React.createElement("th", null, "A\u00E7\u00F5es"))),
                    React.createElement("tbody", null, usuariosFiltrados.map(u => React.createElement("tr", { key: u.itemId },
                        React.createElement("td", null,
                            React.createElement("b", null, u.nome)),
                        React.createElement("td", { className: "muted" }, u.usuarioId),
                        React.createElement("td", { className: "muted" }, u.login),
                        React.createElement("td", null,
                            React.createElement("span", { className: "tag tag-ok" }, u.perfil)),
                        React.createElement("td", null, u.senhaCadastrada ? 'Cadastrada' : 'Pendente'),
                        React.createElement("td", null,
                            React.createElement("span", { className: 'tag ' + (u.bloqueado ? 'tag-neg' : u.ativo ? 'tag-ok' : 'tag-neutro') }, u.bloqueado ? 'Bloqueado' : u.ativo ? 'Ativo' : 'Inativo')),
                        React.createElement("td", null,
                            React.createElement("div", { className: "row", style: { gap: 6, flexWrap: 'nowrap' } },
                                React.createElement("button", { className: "btn btn-s btn-sm", onClick: () => { setSenhaVisivel(false); setEdit({ ...u, novaSenha: '' }); } }, "Editar"),
                                React.createElement("button", { className: 'btn btn-sm ' + (u.ativo ? 'btn-s' : 'btn-p'), onClick: () => alterarStatusUsuario(u) }, u.ativo ? 'Inativar' : 'Reativar'))))))))),
        sub === 'tipos' && podeSub('cadastro.tipos_veiculo') && !carregandoCad && !erroCad && React.createElement(React.Fragment, null,
            React.createElement("div", null,
                React.createElement("button", { className: "btn btn-p", onClick: () => setEditTipo({ nome: '', tipoFrota: 'FROTA PESADA', pbtKg: 0, capacidadeCargaKg: 0, toleranciaSuperiorKg: 0, limiteInferiorKg: 0, exigeAprovacaoAbaixo: false, ativo: true, observacao: '' }) }, "+ Novo tipo de ve\u00EDculo")),
            React.createElement("div", { className: "card", style: { overflowX: 'auto' } },
                React.createElement("table", null,
                    React.createElement("thead", null,
                        React.createElement("tr", null,
                            React.createElement("th", null, "Tipo de ve\u00EDculo"),
                            React.createElement("th", null, "Frota"),
                            React.createElement("th", { className: "td-num" }, "PBT"),
                            React.createElement("th", { className: "td-num" }, "Capacidade"),
                            React.createElement("th", { className: "td-num" }, "Toler\u00E2ncia superior"),
                            React.createElement("th", { className: "td-num" }, "Limite inferior"),
                            React.createElement("th", null, "Status"),
                            React.createElement("th", null, "A\u00E7\u00F5es"))),
                    React.createElement("tbody", null, cad.tiposVeiculo.map(t => React.createElement("tr", { key: t.itemId },
                        React.createElement("td", null,
                            React.createElement("b", null, t.nome)),
                        React.createElement("td", null, t.tipoFrota),
                        React.createElement("td", { className: "td-num num" },
                            Number(t.pbtKg || 0).toLocaleString('pt-BR'),
                            " kg"),
                        React.createElement("td", { className: "td-num num" },
                            Number(t.capacidadeCargaKg || 0).toLocaleString('pt-BR'),
                            " kg"),
                        React.createElement("td", { className: "td-num num" },
                            Number(t.toleranciaSuperiorKg || 0).toLocaleString('pt-BR'),
                            " kg"),
                        React.createElement("td", { className: "td-num num" },
                            Number(t.limiteInferiorKg || 0).toLocaleString('pt-BR'),
                            " kg"),
                        React.createElement("td", null,
                            React.createElement("span", { className: 'tag ' + (t.ativo ? 'tag-ok' : 'tag-neutro') }, t.ativo ? 'Ativo' : 'Inativo')),
                        React.createElement("td", null,
                            React.createElement("div", { className: "row", style: { gap: 6, flexWrap: 'nowrap' } },
                                React.createElement("button", { className: "btn btn-s btn-sm", onClick: () => setEditTipo({ ...t }) }, "Editar"),
                                React.createElement("button", { className: 'btn btn-sm ' + (t.ativo ? 'btn-s' : 'btn-p'), onClick: () => alterarStatusTipo(t) }, t.ativo ? 'Inativar' : 'Reativar')))))))),
            React.createElement("div", { className: "aviso-box" }, "Este cadastro \u00E9 a fonte \u00FAnica dos tipos usados nos ve\u00EDculos, nas metas e nos filtros. Os limites de peso ficam armazenados para a futura auditoria, sem gerar bloqueio nesta etapa.")),
        sub === 'frota' && podeSub('cadastro.veiculos') && !carregandoCad && !erroCad && React.createElement(React.Fragment, null,
            React.createElement("div", null,
                React.createElement("button", { className: "btn btn-p", onClick: () => setEditPlaca({ placa: '', tipoFrota: 'FROTA PESADA', tipoModelo: '', modelo: '', ativo: true, usoCompartilhado: false }) }, "+ Novo ve\u00EDculo")),
            React.createElement("div", { className: "filtros-cadastro" },
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-placa" }, "Placa"),
                    React.createElement("input", { id: "adm-cadastros-placa", name: "adm-cadastros-placa", autoComplete: "off", value: fVeiculo.placa, onChange: e => setFVeiculo({ ...fVeiculo, placa: e.target.value }), placeholder: "Filtrar placa" })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-frota" }, "Frota"),
                    React.createElement("select", { id: "adm-cadastros-frota", name: "adm-cadastros-frota", value: fVeiculo.frota, onChange: e => setFVeiculo({ ...fVeiculo, frota: e.target.value }) },
                        React.createElement("option", { value: "" }, "Todas as frotas"),
                        [...new Set(cad.veiculos.map(v => v.tipoFrota).filter(Boolean))].sort(compararTexto).map(x => React.createElement("option", { key: x }, x)))),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-tipo" }, "Tipo"),
                    React.createElement("select", { id: "adm-cadastros-tipo", name: "adm-cadastros-tipo", value: fVeiculo.tipo, onChange: e => setFVeiculo({ ...fVeiculo, tipo: e.target.value }) },
                        React.createElement("option", { value: "" }, "Todos os tipos"),
                        tiposAtivos.map(t => React.createElement("option", { key: t.itemId || t.nome, value: t.nome }, t.nome)))),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-ordenar-2" }, "Ordenar"),
                    React.createElement("select", { id: "adm-cadastros-ordenar-2", name: "adm-cadastros-ordenar-2", value: fVeiculo.ordem, onChange: e => setFVeiculo({ ...fVeiculo, ordem: e.target.value }) },
                        React.createElement("option", { value: "placa-asc" }, "Placa crescente"),
                        React.createElement("option", { value: "placa-desc" }, "Placa decrescente"),
                        React.createElement("option", { value: "frota-asc" }, "Frota A\u2013Z"),
                        React.createElement("option", { value: "frota-desc" }, "Frota Z\u2013A"),
                        React.createElement("option", { value: "tipo-asc" }, "Tipo A\u2013Z"),
                        React.createElement("option", { value: "tipo-desc" }, "Tipo Z\u2013A")))),
            React.createElement("div", { className: "card", style: { overflowX: 'auto' } },
                React.createElement("table", null,
                    React.createElement("thead", null,
                        React.createElement("tr", null,
                            React.createElement("th", null, "Placa"),
                            React.createElement("th", null, "Frota"),
                            React.createElement("th", null, "Tipo"),
                            React.createElement("th", null, "Modelo"),
                            React.createElement("th", null, "Uso"),
                            React.createElement("th", null, "Status"),
                            React.createElement("th", null, "A\u00E7\u00F5es"))),
                    React.createElement("tbody", null, veiculosFiltrados.map(f => React.createElement("tr", { key: f.placa },
                        React.createElement("td", null,
                            React.createElement("b", { className: "num" }, f.placa)),
                        React.createElement("td", null,
                            React.createElement("span", { className: "tag tag-ok" }, f.tipoFrota || 'Não informado')),
                        React.createElement("td", null, f.tipoModelo),
                        React.createElement("td", null, f.modelo || '—'),
                        React.createElement("td", null, f.usoCompartilhado ? 'Compartilhado' : 'Por vínculo'),
                        React.createElement("td", null,
                            React.createElement("span", { className: 'tag ' + (f.ativo ? 'tag-ok' : 'tag-neutro') }, f.ativo ? 'Ativo' : 'Inativo')),
                        React.createElement("td", null,
                            React.createElement("div", { className: "row", style: { gap: 6, flexWrap: 'nowrap' } },
                                React.createElement("button", { className: "btn btn-s btn-sm", onClick: () => setEditPlaca({ ...f }) }, "Editar"),
                                React.createElement("button", { className: 'btn btn-sm ' + (f.ativo ? 'btn-s' : 'btn-p'), onClick: () => alterarStatusPlaca(f) }, f.ativo ? 'Inativar' : 'Reativar')))))))),
            React.createElement("div", { className: "aviso-box" }, "A classifica\u00E7\u00E3o da frota define qual modelo de check list o ve\u00EDculo recebe. Nos pesados, o tipo de ve\u00EDculo define tamb\u00E9m a meta da premia\u00E7\u00E3o; o v\u00EDnculo com o motorista \u00E9 usado na importa\u00E7\u00E3o quando a planilha n\u00E3o traz a coluna de motorista.")),
        sub === 'vinculos' && podeSub('cadastro.vinculos') && !carregandoCad && !erroCad && React.createElement(React.Fragment, null,
            React.createElement("div", null,
                React.createElement("button", { className: "btn btn-p", onClick: () => setEditVinculo({ vinculoId: 'VIN-' + String(cad.vinculos.length + 1).padStart(3, '0'), usuarioItemId: String(cad.usuarios.find(u => u.ativo)?.itemId || ''), veiculoItemId: String(cad.veiculos.find(v => v.ativo && !v.usoCompartilhado)?.itemId || ''), dataInicio: HOJE, dataFim: '', ativo: true, principal: true, observacao: '' }) }, "+ Novo v\u00EDnculo")),
            React.createElement("div", { className: "filtros-cadastro" },
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-placa-2" }, "Placa"),
                    React.createElement("input", { id: "adm-cadastros-placa-2", name: "adm-cadastros-placa-2", autoComplete: "off", value: fVinculo.placa, onChange: e => setFVinculo({ ...fVinculo, placa: e.target.value }), placeholder: "Filtrar placa" })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-usuario" }, "Usu\u00E1rio"),
                    React.createElement("input", { id: "adm-cadastros-usuario", name: "adm-cadastros-usuario", autoComplete: "off", value: fVinculo.usuario, onChange: e => setFVinculo({ ...fVinculo, usuario: e.target.value }), placeholder: "Filtrar usu\u00E1rio" })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-status" }, "Status"),
                    React.createElement("select", { id: "adm-cadastros-status", name: "adm-cadastros-status", value: fVinculo.status, onChange: e => setFVinculo({ ...fVinculo, status: e.target.value }) },
                        React.createElement("option", { value: "" }, "Todos os status"),
                        React.createElement("option", null, "Ativo"),
                        React.createElement("option", null, "Inativo"),
                        React.createElement("option", null, "Finalizado"))),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-ordenar-3" }, "Ordenar"),
                    React.createElement("select", { id: "adm-cadastros-ordenar-3", name: "adm-cadastros-ordenar-3", value: fVinculo.ordem, onChange: e => setFVinculo({ ...fVinculo, ordem: e.target.value }) },
                        React.createElement("option", { value: "usuario-asc" }, "Usu\u00E1rio A\u2013Z"),
                        React.createElement("option", { value: "usuario-desc" }, "Usu\u00E1rio Z\u2013A"),
                        React.createElement("option", { value: "status-asc" }, "Status A\u2013Z"),
                        React.createElement("option", { value: "status-desc" }, "Status Z\u2013A"),
                        React.createElement("option", { value: "placa-asc" }, "Placa crescente"),
                        React.createElement("option", { value: "placa-desc" }, "Placa decrescente")))),
            React.createElement("div", { className: "card", style: { overflowX: 'auto' } },
                React.createElement("table", null,
                    React.createElement("thead", null,
                        React.createElement("tr", null,
                            React.createElement("th", null, "V\u00EDnculo"),
                            React.createElement("th", null, "Usu\u00E1rio"),
                            React.createElement("th", null, "Ve\u00EDculo"),
                            React.createElement("th", null, "In\u00EDcio"),
                            React.createElement("th", null, "Fim"),
                            React.createElement("th", null, "Principal"),
                            React.createElement("th", null, "Status"),
                            React.createElement("th", null))),
                    React.createElement("tbody", null, vinculosFiltrados.map(v => React.createElement("tr", { key: v.itemId },
                        React.createElement("td", null, v.vinculoId),
                        React.createElement("td", null,
                            React.createElement("b", null, v.usuarioNome)),
                        React.createElement("td", null, v.placa),
                        React.createElement("td", null, dataBR((v.dataInicio || '').slice(0, 10))),
                        React.createElement("td", null, v.dataFim ? dataBR(v.dataFim.slice(0, 10)) : '—'),
                        React.createElement("td", null, v.principal ? 'Sim' : 'Não'),
                        React.createElement("td", null,
                            React.createElement("span", { className: 'tag ' + (v.dataFim ? 'tag-neutro' : v.ativo ? 'tag-ok' : 'tag-neg') }, statusVinculo(v))),
                        React.createElement("td", null,
                            React.createElement("button", { className: "btn btn-s btn-sm", onClick: () => setEditVinculo({ ...v }) }, "Editar")))))))),
        sub === 'perfis' && podeSub('cadastro.perfis') && !carregandoCad && !erroCad && React.createElement(React.Fragment, null,
            React.createElement("div", null,
                React.createElement("button", { className: "btn btn-p", onClick: () => setEditPerfil({ titulo: '', descricao: '', areasAcesso: [], subtelasAcesso: [], nivelAcesso: 'SOMENTE_VISUALIZAR', permiteModulosApp: true, ativo: true }) }, "+ Novo perfil")),
            React.createElement("div", { className: "card", style: { overflowX: 'auto' } },
                React.createElement("table", null,
                    React.createElement("thead", null,
                        React.createElement("tr", null,
                            React.createElement("th", null, "Perfil"),
                            React.createElement("th", null, "Descri\u00E7\u00E3o"),
                            React.createElement("th", null, "\u00C1reas"),
                            React.createElement("th", null, "Subtelas"),
                            React.createElement("th", null, "N\u00EDvel"),
                            React.createElement("th", null, "M\u00F3dulos"),
                            React.createElement("th", null, "Status"),
                            React.createElement("th", null))),
                    React.createElement("tbody", null, cad.perfis.map(p => React.createElement("tr", { key: p.itemId },
                        React.createElement("td", null,
                            React.createElement("b", null, p.titulo)),
                        React.createElement("td", null, p.descricao || '—'),
                        React.createElement("td", null, (p.areasAcesso || []).join(', ') || '—'),
                        React.createElement("td", null, (p.subtelasAcesso || []).length),
                        React.createElement("td", null,
                            React.createElement("span", { className: "tag tag-ok" }, p.nivelAcesso)),
                        React.createElement("td", null, p.permiteModulosApp ? 'Sim' : 'Não'),
                        React.createElement("td", null,
                            React.createElement("span", { className: 'tag ' + (p.ativo ? 'tag-ok' : 'tag-neutro') }, p.ativo ? 'Ativo' : 'Inativo')),
                        React.createElement("td", null,
                            React.createElement("button", { className: "btn btn-s btn-sm", onClick: () => {
                                const areasAcesso = [...(p.areasAcesso || [])], subtelasAcesso = [...(p.subtelasAcesso || [])];
                                if (areasAcesso.includes('PAINEL') && !subtelasPainelDefinidas(subtelasAcesso))
                                    subtelasAcesso.push(...ABAS_PAINEL);
                                setEditPerfil({ ...p, areasAcesso, subtelasAcesso });
                            } }, "Editar")))))))),
        edit &&
            React.createElement(Modal, { titulo: edit.nome ? 'Editar usuário' : 'Novo usuário', onClose: () => setEdit(null) },
                React.createElement("div", { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-cadastros-nome-completo" }, "Nome completo"),
                        React.createElement("input", { id: "adm-cadastros-nome-completo", name: "adm-cadastros-nome-completo", autoComplete: "off", value: edit.nome, onChange: e => setEdit({ ...edit, nome: e.target.value }) })),
                    React.createElement("div", { className: "form-grid" },
                        React.createElement("div", null,
                            React.createElement("label", { htmlFor: "adm-cadastros-usuarioid" }, "UsuarioID"),
                            React.createElement("input", { id: "adm-cadastros-usuarioid", name: "adm-cadastros-usuarioid", autoComplete: "off", value: edit.usuarioId || '', readOnly: Boolean(edit.itemId && String(edit.usuarioId || '').trim()), onChange: e => !(edit.itemId && String(edit.usuarioId || '').trim()) && setEdit({ ...edit, usuarioId: e.target.value.toUpperCase() }), title: edit.itemId && String(edit.usuarioId || '').trim() ? 'Identificador permanente: não pode ser alterado após a criação.' : 'Informe o UsuarioID para concluir este cadastro incompleto.' })),
                        React.createElement("div", null,
                            React.createElement("label", { htmlFor: "adm-cadastros-usuario-2" }, "Usu\u00E1rio"),
                            React.createElement("input", { id: "adm-cadastros-usuario-2", name: "adm-cadastros-usuario-2", autoComplete: "off", value: edit.login, onChange: e => setEdit({ ...edit, login: e.target.value.toLowerCase() }) })),
                        React.createElement("div", null,
                            React.createElement("label", { htmlFor: "adm-cadastros-telefone" }, "Telefone"),
                            React.createElement("input", { id: "adm-cadastros-telefone", name: "adm-cadastros-telefone", autoComplete: "off", value: edit.telefone || '', onChange: e => setEdit({ ...edit, telefone: e.target.value }) }))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-cadastros-perfil-2" }, "Perfil"),
                        React.createElement("select", { id: "adm-cadastros-perfil-2", name: "adm-cadastros-perfil-2", value: edit.perfilAcessoId || '', onChange: e => { const p = cad.perfis.find(x => String(x.itemId) === String(e.target.value)); const permite = p?.permiteModulosApp === true; setEdit({ ...edit, perfilAcessoId: e.target.value, perfil: p?.titulo || edit.perfil, ...(!permite ? { acessoCargas: false, acessoPremiacao: false, acessoChecklist: false, acessoSinistros: false, acessoAgendamentos: false, acessoHistorico: false } : {}) }); } },
                            React.createElement("option", { value: "" }, "Selecionar perfil..."),
                            cad.perfis.filter(p => p.ativo || p.itemId === edit.perfilAcessoId).map(p => React.createElement("option", { key: p.itemId, value: p.itemId }, p.titulo))),
                        !edit.perfilAcessoId && React.createElement("div", { className: "muted", style: { fontSize: 12, marginTop: 5 } }, "Selecione um perfil para definir \u00E1reas, subtelas e n\u00EDvel de acesso.")),
                    edit.perfilAcessoId && React.createElement("div", null,
                        React.createElement("label", null, "M\u00F3dulos liberados para este usu\u00E1rio"),
                        React.createElement("div", { className: "muted", style: { fontSize: 12, marginTop: 5 } },
                            "Perfil selecionado: ",
                            React.createElement("b", null, perfilSelecionado?.titulo || 'não localizado'),
                            " \u00B7 Permite m\u00F3dulos: ",
                            React.createElement("b", null, permiteModulosUsuario ? 'Sim' : 'Não')),
                        permiteModulosUsuario ?
                            React.createElement("div", { className: "perfil-subtelas-grid", style: { marginTop: 8 } }, [
                                ['acessoCargas', 'Cargas'],
                                ['acessoPremiacao', 'Premiação'],
                                ['acessoChecklist', 'Check list'],
                                ['acessoSinistros', 'Sinistros'],
                                ['acessoAgendamentos', 'Agendamento']
                            ].map(([campo, rotulo]) => React.createElement("button", { type: "button", key: campo, className: 'perfil-subtela' + (edit[campo] ? ' on' : ''), onClick: () => setEdit({ ...edit, [campo]: !edit[campo] }) },
                                React.createElement("span", { className: "perfil-subtela-check" }, edit[campo] ? '✓' : ''),
                                React.createElement("span", null, rotulo))))
                            : React.createElement("div", { className: "aviso-box", style: { marginTop: 8 } }, "Este perfil est\u00E1 configurado com \u201CPermite m\u00F3dulos do app? = N\u00E3o\u201D. Nenhum m\u00F3dulo pode ser liberado para este usu\u00E1rio.")),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-cadastros-acesso-a-frota" }, "Acesso \u00E0 frota"),
                        React.createElement("select", { id: "adm-cadastros-acesso-a-frota", name: "adm-cadastros-acesso-a-frota", value: edit.tipoFrotaAcesso, onChange: e => setEdit({ ...edit, tipoFrotaAcesso: e.target.value }) },
                            React.createElement("option", null, "FROTA PESADA"),
                            React.createElement("option", null, "FROTA LEVE"),
                            React.createElement("option", null, "AMBAS"))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-cadastros-status-do-usuario" }, "Status do usu\u00E1rio"),
                        React.createElement("select", { id: "adm-cadastros-status-do-usuario", name: "adm-cadastros-status-do-usuario", value: edit.ativo ? 's' : 'n', onChange: e => setEdit({ ...edit, ativo: e.target.value === 's' }) },
                            React.createElement("option", { value: "s" }, "Ativo"),
                            React.createElement("option", { value: "n" }, "Inativo"))),
                    React.createElement("div", null,
                        React.createElement("label", null, edit.bloqueado ? 'Acesso bloqueado — defina e salve uma nova senha para liberar' : edit.itemId ? (edit.senhaCadastrada ? 'Redefinir senha (deixe vazio para manter)' : 'Definir senha') : 'Senha inicial'),
                        React.createElement("div", { className: "row", style: { gap: 8 } },
                            React.createElement("input", { className: "grow", type: senhaVisivel ? 'text' : 'password', value: edit.novaSenha || '', onChange: e => setEdit({ ...edit, novaSenha: e.target.value }), placeholder: edit.perfil === 'MOTORISTA' ? '6 números' : 'mínimo 8 caracteres' }),
                            React.createElement("button", { type: "button", className: "btn btn-s btn-sm", onClick: () => setSenhaVisivel(!senhaVisivel) }, senhaVisivel ? 'Ocultar' : 'Ver'),
                            React.createElement("button", { type: "button", className: "btn btn-s btn-sm", onClick: gerarSenha }, "Gerar")),
                        React.createElement("div", { className: "muted", style: { fontSize: 12, marginTop: 5 } }, "A senha aparece somente agora. Depois de salva, ser\u00E1 poss\u00EDvel apenas redefini-la.")),
                    React.createElement("button", { className: "btn btn-p", disabled: salvandoUsuario, onClick: salvarUser }, salvandoUsuario ? 'Salvando usuário...' : 'Salvar usuário'))),
        editPlaca &&
            React.createElement(Modal, { titulo: 'Placa ' + editPlaca.placa, onClose: () => setEditPlaca(null) },
                React.createElement("div", { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-cadastros-frota-2" }, "Frota"),
                        React.createElement("select", { id: "adm-cadastros-frota-2", name: "adm-cadastros-frota-2", value: editPlaca.tipoFrota, onChange: e => setEditPlaca({ ...editPlaca, tipoFrota: e.target.value }) },
                            React.createElement("option", null, "FROTA PESADA"),
                            React.createElement("option", null, "FROTA LEVE"))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-cadastros-placa-3" }, "Placa"),
                        React.createElement("input", { id: "adm-cadastros-placa-3", name: "adm-cadastros-placa-3", autoComplete: "off", value: editPlaca.placa, disabled: !!editPlaca.itemId, onChange: e => setEditPlaca({ ...editPlaca, placa: e.target.value.toUpperCase() }) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-cadastros-tipo-do-veiculo" }, "Tipo do ve\u00EDculo"),
                        React.createElement("select", { id: "adm-cadastros-tipo-do-veiculo", name: "adm-cadastros-tipo-do-veiculo", value: editPlaca.tipoModelo, onChange: e => setEditPlaca({ ...editPlaca, tipoModelo: e.target.value }) },
                            React.createElement("option", { value: "" }, "Selecionar..."),
                            editPlaca.tipoModelo && !tiposAtivos.some(t => chaveTipo(t.nome) === chaveTipo(editPlaca.tipoModelo)) && React.createElement("option", { value: editPlaca.tipoModelo },
                                editPlaca.tipoModelo,
                                " (hist\u00F3rico)"),
                            tiposAtivos.map(t => React.createElement("option", { key: t.itemId, value: t.nome }, t.nome)))),
                    React.createElement("div", null,
                        React.createElement("label", null,
                            "Modelo ",
                            React.createElement("span", { className: "muted" }, "(opcional)")),
                        React.createElement("input", { value: editPlaca.modelo || '', onChange: e => setEditPlaca({ ...editPlaca, modelo: e.target.value }), placeholder: "Ex.: Fiat Cronos, Chevrolet Onix" })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-cadastros-uso-compartilhado" }, "Uso compartilhado?"),
                        React.createElement("select", { id: "adm-cadastros-uso-compartilhado", name: "adm-cadastros-uso-compartilhado", value: editPlaca.usoCompartilhado ? 's' : 'n', onChange: e => setEditPlaca({ ...editPlaca, usoCompartilhado: e.target.value === 's' }) },
                            React.createElement("option", { value: "n" }, "N\u00E3o \u2014 exige v\u00EDnculo"),
                            React.createElement("option", { value: "s" }, "Sim"))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-cadastros-status-do-veiculo" }, "Status do ve\u00EDculo"),
                        React.createElement("select", { id: "adm-cadastros-status-do-veiculo", name: "adm-cadastros-status-do-veiculo", value: editPlaca.ativo ? 's' : 'n', onChange: e => setEditPlaca({ ...editPlaca, ativo: e.target.value === 's' }) },
                            React.createElement("option", { value: "s" }, "Ativo"),
                            React.createElement("option", { value: "n" }, "Inativo"))),
                    React.createElement("button", { className: "btn btn-p", onClick: salvarPlaca }, "Salvar placa"))),
        editVinculo && React.createElement(Modal, { titulo: "V\u00EDnculo usu\u00E1rio \u00D7 ve\u00EDculo", onClose: () => setEditVinculo(null) },
            React.createElement("div", { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-usuario-3" }, "Usu\u00E1rio"),
                    React.createElement("select", { id: "adm-cadastros-usuario-3", name: "adm-cadastros-usuario-3", value: editVinculo.usuarioItemId, onChange: e => setEditVinculo({ ...editVinculo, usuarioItemId: e.target.value }) },
                        React.createElement("option", { value: "" }, "Selecionar..."),
                        cad.usuarios.filter(u => u.ativo).map(u => React.createElement("option", { key: u.itemId, value: u.itemId }, u.nome)))),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-veiculo" }, "Ve\u00EDculo"),
                    React.createElement("select", { id: "adm-cadastros-veiculo", name: "adm-cadastros-veiculo", value: editVinculo.veiculoItemId, onChange: e => setEditVinculo({ ...editVinculo, veiculoItemId: e.target.value }) },
                        React.createElement("option", { value: "" }, "Selecionar..."),
                        cad.veiculos.filter(v => v.ativo && !v.usoCompartilhado).map(v => React.createElement("option", { key: v.itemId, value: v.itemId }, v.placa)))),
                React.createElement("div", { className: "form-grid" },
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-cadastros-inicio" }, "In\u00EDcio"),
                        React.createElement("input", { id: "adm-cadastros-inicio", name: "adm-cadastros-inicio", autoComplete: "off", type: "date", value: (editVinculo.dataInicio || '').slice(0, 10), onChange: e => setEditVinculo({ ...editVinculo, dataInicio: e.target.value }) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-cadastros-fim" }, "Fim"),
                        React.createElement("input", { id: "adm-cadastros-fim", name: "adm-cadastros-fim", autoComplete: "off", type: "date", value: (editVinculo.dataFim || '').slice(0, 10), onChange: e => setEditVinculo({ ...editVinculo, dataFim: e.target.value, ativo: !e.target.value }) }))),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-principal" }, "Principal?"),
                    React.createElement("select", { id: "adm-cadastros-principal", name: "adm-cadastros-principal", value: editVinculo.principal ? 's' : 'n', onChange: e => setEditVinculo({ ...editVinculo, principal: e.target.value === 's' }) },
                        React.createElement("option", { value: "s" }, "Sim"),
                        React.createElement("option", { value: "n" }, "N\u00E3o"))),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-observacao" }, "Observa\u00E7\u00E3o"),
                    React.createElement("textarea", { id: "adm-cadastros-observacao", name: "adm-cadastros-observacao", value: editVinculo.observacao || '', onChange: e => setEditVinculo({ ...editVinculo, observacao: e.target.value }) })),
                React.createElement("button", { className: "btn btn-p", onClick: salvarVinculo }, "Salvar v\u00EDnculo"))),
        editPerfil && React.createElement(Modal, { large: true, titulo: editPerfil.itemId ? 'Editar perfil' : 'Novo perfil', onClose: () => setEditPerfil(null) },
            React.createElement("div", { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-nome-do-perfil" }, "Nome do perfil"),
                    React.createElement("input", { id: "adm-cadastros-nome-do-perfil", name: "adm-cadastros-nome-do-perfil", autoComplete: "off", value: editPerfil.titulo || '', onChange: e => setEditPerfil({ ...editPerfil, titulo: e.target.value.toUpperCase() }) })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-descricao" }, "Descri\u00E7\u00E3o"),
                    React.createElement("textarea", { id: "adm-cadastros-descricao", name: "adm-cadastros-descricao", value: editPerfil.descricao || '', onChange: e => setEditPerfil({ ...editPerfil, descricao: e.target.value }) })),
                React.createElement("div", { className: "form-grid" },
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-cadastros-nivel-de-acesso" }, "N\u00EDvel de acesso"),
                        React.createElement("select", { id: "adm-cadastros-nivel-de-acesso", name: "adm-cadastros-nivel-de-acesso", value: editPerfil.nivelAcesso || 'SOMENTE_VISUALIZAR', onChange: e => setEditPerfil({ ...editPerfil, nivelAcesso: e.target.value }) },
                            React.createElement("option", null, "SOMENTE_VISUALIZAR"),
                            React.createElement("option", null, "GERENCIAR"),
                            React.createElement("option", null, "ADMIN_COMPLETO"))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-cadastros-permite-modulos-do-app" }, "Permite m\u00F3dulos do app?"),
                        React.createElement("select", { id: "adm-cadastros-permite-modulos-do-app", name: "adm-cadastros-permite-modulos-do-app", value: editPerfil.permiteModulosApp ? 's' : 'n', onChange: e => setEditPerfil({ ...editPerfil, permiteModulosApp: e.target.value === 's' }) },
                            React.createElement("option", { value: "s" }, "Sim"),
                            React.createElement("option", { value: "n" }, "N\u00E3o"))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-cadastros-status-2" }, "Status"),
                        React.createElement("select", { id: "adm-cadastros-status-2", name: "adm-cadastros-status-2", value: editPerfil.ativo ? 's' : 'n', onChange: e => setEditPerfil({ ...editPerfil, ativo: e.target.value === 's' }) },
                            React.createElement("option", { value: "s" }, "Ativo"),
                            React.createElement("option", { value: "n" }, "Inativo")))),
                React.createElement("div", null,
                    React.createElement("label", null, "\u00C1reas e subtelas"),
                    React.createElement("div", { className: "perfil-acessos" }, Object.entries(AREAS_E_SUBTELAS).map(([area, subtelas]) => {
                        const areaAtiva = (editPerfil.areasAcesso || []).includes(area);
                        const qtdMarcadas = subtelas.filter(([codigo]) => (editPerfil.subtelasAcesso || []).includes(codigo)).length;
                        return React.createElement("div", { key: area, className: 'perfil-area' + (areaAtiva ? ' aberta' : '') },
                            React.createElement("button", { type: "button", className: "perfil-area-cabecalho", onClick: () => alternarArea(area), "aria-expanded": areaAtiva },
                                React.createElement("input", { type: "checkbox", checked: areaAtiva, readOnly: true, tabIndex: "-1" }),
                                React.createElement("span", { className: "perfil-area-titulo" },
                                    React.createElement("b", null, ROTULOS_AREAS[area]),
                                    React.createElement("span", { className: "perfil-area-resumo" }, areaAtiva ? (subtelas.length ? qtdMarcadas + ' de ' + subtelas.length + ' subtelas liberadas' : 'Área liberada') : 'Clique para liberar e abrir')),
                                React.createElement("span", { className: "perfil-area-seta", "aria-hidden": "true" }, "\u2304")),
                            areaAtiva && React.createElement("div", { className: "perfil-subtelas" }, subtelas.length > 0 ? React.createElement(React.Fragment, null,
                                React.createElement("div", { className: "perfil-subtelas-titulo" },
                                    React.createElement("span", null, "Subtelas dispon\u00EDveis"),
                                    React.createElement("span", { className: "muted" },
                                        qtdMarcadas,
                                        "/",
                                        subtelas.length,
                                        " selecionadas")),
                                React.createElement("div", { className: "perfil-subtelas-grid" }, subtelas.map(([codigo, rotulo]) => {
                                    const subtelaAtiva = (editPerfil.subtelasAcesso || []).includes(codigo);
                                    return React.createElement("button", { type: "button", key: codigo, className: 'perfil-subtela' + (subtelaAtiva ? ' on' : ''), onClick: () => alternarSubtela(codigo) },
                                        React.createElement("span", { className: "perfil-subtela-check" }, subtelaAtiva ? '✓' : ''),
                                        React.createElement("span", null, rotulo));
                                }))) : React.createElement("div", { className: "perfil-sem-subtelas" }, "Esta \u00E1rea n\u00E3o possui subdivis\u00F5es. Ao liber\u00E1-la, a tela principal j\u00E1 fica dispon\u00EDvel para o perfil.")));
                    }))),
                React.createElement("button", { type: "button", className: "btn btn-p", disabled: salvandoPerfil, onClick: salvarPerfil }, salvandoPerfil ? 'Salvando...' : 'Salvar perfil'))),
        editTipo && React.createElement(Modal, { titulo: editTipo.itemId ? 'Editar tipo de veículo' : 'Novo tipo de veículo', large: true, onClose: () => setEditTipo(null) },
            React.createElement("div", { className: "form-grid" },
                React.createElement("div", { style: { gridColumn: '1/-1' } },
                    React.createElement("label", { htmlFor: "adm-cadastros-nome-do-tipo-de-veiculo" }, "Nome do tipo de ve\u00EDculo"),
                    React.createElement("input", { id: "adm-cadastros-nome-do-tipo-de-veiculo", name: "adm-cadastros-nome-do-tipo-de-veiculo", autoComplete: "off", value: editTipo.nome, onChange: e => setEditTipo({ ...editTipo, nome: e.target.value.toUpperCase() }) })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-frota-3" }, "Frota"),
                    React.createElement("select", { id: "adm-cadastros-frota-3", name: "adm-cadastros-frota-3", value: editTipo.tipoFrota, onChange: e => setEditTipo({ ...editTipo, tipoFrota: e.target.value }) },
                        React.createElement("option", null, "FROTA PESADA"),
                        React.createElement("option", null, "FROTA LEVE"))),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-status-3" }, "Status"),
                    React.createElement("select", { id: "adm-cadastros-status-3", name: "adm-cadastros-status-3", value: editTipo.ativo ? 's' : 'n', onChange: e => setEditTipo({ ...editTipo, ativo: e.target.value === 's' }) },
                        React.createElement("option", { value: "s" }, "Ativo"),
                        React.createElement("option", { value: "n" }, "Inativo"))),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-pbt-kg" }, "PBT (kg)"),
                    React.createElement("input", { id: "adm-cadastros-pbt-kg", name: "adm-cadastros-pbt-kg", autoComplete: "off", type: "number", min: "0", value: editTipo.pbtKg, onChange: e => setEditTipo({ ...editTipo, pbtKg: Number(e.target.value) }) })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-capacidade-de-carga-kg" }, "Capacidade de carga (kg)"),
                    React.createElement("input", { id: "adm-cadastros-capacidade-de-carga-kg", name: "adm-cadastros-capacidade-de-carga-kg", autoComplete: "off", type: "number", min: "0", value: editTipo.capacidadeCargaKg, onChange: e => setEditTipo({ ...editTipo, capacidadeCargaKg: Number(e.target.value) }) })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-tolerancia-superior-kg" }, "Toler\u00E2ncia superior (kg)"),
                    React.createElement("input", { id: "adm-cadastros-tolerancia-superior-kg", name: "adm-cadastros-tolerancia-superior-kg", autoComplete: "off", type: "number", min: "0", value: editTipo.toleranciaSuperiorKg, onChange: e => setEditTipo({ ...editTipo, toleranciaSuperiorKg: Number(e.target.value) }) })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-tolerancia-inferior-kg" }, "Toler\u00E2ncia inferior (kg)"),
                    React.createElement("input", { id: "adm-cadastros-tolerancia-inferior-kg", name: "adm-cadastros-tolerancia-inferior-kg", autoComplete: "off", type: "number", min: "0", value: editTipo.limiteInferiorKg, onChange: e => setEditTipo({ ...editTipo, limiteInferiorKg: Number(e.target.value) }) })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-cadastros-validar-faixa-de-carga" }, "Validar faixa de carga?"),
                    React.createElement("select", { id: "adm-cadastros-validar-faixa-de-carga", name: "adm-cadastros-validar-faixa-de-carga", value: editTipo.exigeAprovacaoAbaixo ? 's' : 'n', onChange: e => setEditTipo({ ...editTipo, exigeAprovacaoAbaixo: e.target.value === 's' }) },
                        React.createElement("option", { value: "n" }, "N\u00E3o"),
                        React.createElement("option", { value: "s" }, "Sim"))),
                React.createElement("div", { style: { gridColumn: '1/-1' } },
                    React.createElement("label", { htmlFor: "adm-cadastros-observacao-2" }, "Observa\u00E7\u00E3o"),
                    React.createElement("textarea", { id: "adm-cadastros-observacao-2", name: "adm-cadastros-observacao-2", value: editTipo.observacao || '', onChange: e => setEditTipo({ ...editTipo, observacao: e.target.value }) }))),
            React.createElement(RegrasCapacidadeProduto, { tipo: editTipo, onChange: setEditTipo }),
            React.createElement("button", { className: "btn btn-p", style: { width: '100%', marginTop: 14 }, onClick: salvarTipo }, "Salvar tipo de ve\u00EDculo"))));
}
/* ================= ADM: SINISTROS ================= */
function AdmSinistros({ toast, user, foco }) {
    const podeGestao = pode(user, 'sinistros.visualizar');
    const podeConfig = pode(user, 'sinistros.configuracoes');
    const podeEditarConfig = pode(user, 'sinistros.configuracoes.editar');
    const [sub, setSub] = useState(podeGestao ? 'gestao' : 'config');
    const [lista, setLista] = useState([]), [carregando, setCarregando] = useState(false), [selecionado, setSelecionado] = useState(null);
    const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
    const [filtro, setFiltro] = useState({ texto: '', status: 'ABERTOS', gravidade: '', competencia: '', tipoOcorrencia: '' });
    const [edicao, setEdicao] = useState({ statusSinistro: '', gravidade: '', observacao: '' });
    const [solicitacoesNovas, setSolicitacoesNovas] = useState([]);
    const [analisandoDocumento, setAnalisandoDocumento] = useState('');
    const [config, setConfig] = useState(null), [salvandoConfig, setSalvandoConfig] = useState(false);
    const carregar = async () => { if (!podeGestao)
        return; setCarregando(true); try {
        const r = await ApiService.admListarSinistros();
        setLista(r.sinistros || []);
    }
    catch (e) {
        toast('Erro ao carregar sinistros: ' + e.message);
    }
    finally {
        setCarregando(false);
    } };
    useAtualizacaoPortal(['sinistros'], async () => {
        if (!podeGestao || sub !== 'gestao') return;
        const r = await ApiService.admListarSinistros();
        setLista(r.sinistros || []);
    });
    const carregarConfig = async () => { if (!podeConfig)
        return; try {
        const r = await ApiService.admObterConfiguracoesSinistros();
        setConfig(r.configuracao || { titulo: 'Configuração Geral', ativo: true, emailPrincipal: '', emailCopia: '', emailCopiaOculta: '', nomeContatoEmergencia: '', telefoneEmergencia: '', procedimento: '', revisaoProcedimento: 'Revisão 01', permiteReabrirSinistro: false, diasReabertura: 0, enviarEmailAutomatico: false, assuntoEmail: 'URGENTE - Novo Sinistro Registrado', versaoModulo: '1.0', ultimaAtualizacao: '' });
    }
    catch (e) {
        toast('Erro ao carregar configurações: ' + e.message);
    } };
    useEffect(() => { if (podeGestao)
        carregar(); if (podeConfig)
        carregarConfig(); }, []);
    useEffect(() => { if (foco?.chave && podeGestao) {
        setSub('gestao');
        setFiltro(f => ({ ...f, status: 'ABERTOS', competencia: foco.parametros?.competencia || '' }));
    } }, [foco?.chave]);
    useEffect(() => { if (sub === 'gestao' && !podeGestao && podeConfig)
        setSub('config'); if (sub === 'config' && !podeConfig && podeGestao)
        setSub('gestao'); }, [podeGestao, podeConfig]);
    const abrir = async (s) => {
        setCarregandoDetalhe(true);
        try {
            const r = await ApiService.admObterSinistro(s.id);
            const detalhe = r.sinistro || s;
            setSelecionado(detalhe);
            setEdicao({ statusSinistro: detalhe.statusSinistro || 'Aberto', gravidade: detalhe.gravidade || 'Baixa', observacao: '' });
            setSolicitacoesNovas([]);
        }
        catch (e) {
            toast('Erro ao abrir sinistro: ' + e.message);
        }
        finally {
            setCarregandoDetalhe(false);
        }
    };
    const alternarSolicitacao = tipo => setSolicitacoesNovas(prev => prev.some(x => x.tipoDocumento === tipo) ? prev.filter(x => x.tipoDocumento !== tipo) : [...prev, { tipoDocumento: tipo, descricaoSolicitacao: '', obrigatorio: true }]);
    const atualizarSolicitacao = (tipo, campo, valor) => setSolicitacoesNovas(prev => prev.map(x => x.tipoDocumento === tipo ? { ...x, [campo]: valor } : x));
    const salvar = async () => {
        if (!selecionado)
            return;
        const docs = solicitacoesNovas.map(({ tipoDocumento, descricaoSolicitacao, obrigatorio }) => ({ tipoDocumento, descricaoSolicitacao, obrigatorio }));
        if (normalizarPerfil(edicao.statusSinistro) === 'AGUARDANDO_DOCUMENTOS') {
            const existentes = (selecionado.solicitacoesDocumentos || []).filter(d => d.ativo !== false && !['ACEITO', 'DISPENSADO'].includes(normalizarPerfil(d.statusDocumento)));
            if (!docs.length && !existentes.length) {
                toast('Selecione ao menos um documento que o motorista precisa enviar.');
                return;
            }
            const outro = docs.find(d => normalizarPerfil(d.tipoDocumento) === 'OUTRO' && !String(d.descricaoSolicitacao || '').trim());
            if (outro) {
                toast('Descreva qual documento deve ser enviado na opção Outro.');
                return;
            }
        }
        try {
            await ApiService.admAtualizarSinistro(selecionado.id, { ...edicao, documentosSolicitados: docs });
            toast('Sinistro atualizado.');
            setSelecionado(null);
            setSolicitacoesNovas([]);
            await carregar();
        }
        catch (e) {
            toast('Erro ao atualizar sinistro: ' + e.message);
        }
    };
    const analisarDocumento = async (doc, status) => {
        let motivo = '';
        if (status === 'Rejeitado') {
            motivo = window.prompt('Informe o motivo da rejeição. Esta mensagem será exibida ao motorista:', '') || '';
            if (!motivo.trim())
                return;
        }
        if (status === 'Dispensado' && !window.confirm('Dispensar esta solicitação? O motorista não precisará mais enviar este documento.'))
            return;
        setAnalisandoDocumento(doc.id);
        try {
            const r = await ApiService.admAnalisarDocumentoSinistro(selecionado.id, doc.id, status, motivo.trim());
            const docs = r.solicitacoesDocumentos || selecionado.solicitacoesDocumentos || [];
            const novoStatus = r.statusSinistro || selecionado.statusSinistro;
            const agora = new Date().toISOString();
            const historicoDocumento = {
                id: 'auto-doc-' + Date.now(),
                dataHora: agora,
                usuario: user?.login || user?.nome || 'Administrativo',
                perfil: 'Administrativo',
                acao: 'Status alterado',
                status: selecionado.statusSinistro,
                observacao: status === 'Rejeitado'
                    ? 'Documento rejeitado: ' + doc.tipoDocumento + '. Motivo: ' + motivo.trim()
                    : 'Documento ' + status.toLowerCase() + ': ' + doc.tipoDocumento + '.',
                origem: 'Painel Administrativo'
            };
            const historicoAutomatico = r.statusAlteradoAutomaticamente ? {
                id: 'auto-status-' + Date.now(),
                dataHora: agora,
                usuario: 'Sistema',
                perfil: 'Sistema',
                acao: 'Status alterado',
                status: novoStatus,
                observacao: 'Documentação concluída. Todos os documentos obrigatórios foram aceitos ou dispensados. Aguardando documentos → Em atendimento.',
                origem: 'Painel Administrativo'
            } : null;
            setSelecionado(atual => ({ ...atual,
                statusSinistro: novoStatus,
                solicitacoesDocumentos: docs,
                documentosResumo: r.documentosResumo || atual.documentosResumo,
                pendenciaDocumental: r.pendenciaDocumental,
                historico: [...(atual.historico || []), historicoDocumento, ...(historicoAutomatico ? [historicoAutomatico] : [])]
            }));
            if (r.statusAlteradoAutomaticamente)
                setEdicao(atual => ({ ...atual, statusSinistro: novoStatus }));
            setLista(lista => lista.map(s => String(s.id) === String(selecionado.id) ? { ...s,
                statusSinistro: novoStatus,
                documentosResumo: r.documentosResumo || s.documentosResumo,
                pendenciaDocumental: r.pendenciaDocumental
            } : s));
            toast(r.statusAlteradoAutomaticamente
                ? 'Documento ' + (status === 'Dispensado' ? 'dispensado' : 'aceito') + '. Documentação concluída: sinistro voltou para Em atendimento.'
                : (status === 'Aceito' ? 'Documento aceito.' : status === 'Rejeitado' ? 'Documento devolvido para reenvio.' : 'Documento dispensado.'));
        }
        catch (e) {
            toast('Erro ao analisar documento: ' + e.message);
        }
        finally {
            setAnalisandoDocumento('');
        }
    };
    const salvarConfig = async () => { if (!config || !podeEditarConfig)
        return; setSalvandoConfig(true); try {
        const r = await ApiService.admSalvarConfiguracoesSinistros(config);
        setConfig(r.configuracao || config);
        toast('Configurações de sinistros salvas.');
    }
    catch (e) {
        toast('Erro ao salvar configurações: ' + e.message);
    }
    finally {
        setSalvandoConfig(false);
    } };
    const filtrados = lista.filter(s => { const texto = normalizar([s.numeroSinistro, s.placa, s.motoristaNome, s.municipio, s.tipoOcorrencia, s.tipoSinistro].join(' ')); const okTexto = !filtro.texto || texto.includes(normalizar(filtro.texto)); const encerrado = ['CONCLUIDO', 'CANCELADO'].includes(normalizarPerfil(s.statusSinistro)); const okStatus = filtro.status === 'TODOS' || (filtro.status === 'ABERTOS' && !encerrado) || normalizarPerfil(s.statusSinistro) === filtro.status; const okGrav = !filtro.gravidade || normalizarPerfil(s.gravidade) === filtro.gravidade; const okPeriodo = !filtro.competencia || String(s.dataHoraOcorrido || s.dataCriacao || s.created || '').slice(0, 7) === filtro.competencia; const okTipo = !filtro.tipoOcorrencia || normalizarPerfil(s.tipoOcorrencia) === normalizarPerfil(filtro.tipoOcorrencia); return okTexto && okStatus && okGrav && okPeriodo && okTipo; });
    return React.createElement(React.Fragment, null,
        React.createElement("div", { className: "row", style: { flexWrap: 'wrap' } },
            React.createElement("div", { className: "grow" },
                React.createElement("h2", null, "Sinistros"),
                React.createElement("div", { className: "muted" }, "Gest\u00E3o dos registros e par\u00E2metros operacionais do m\u00F3dulo.")),
            sub === 'gestao' && podeGestao && React.createElement("button", { className: "btn btn-s", onClick: carregar }, carregando ? 'Atualizando...' : 'Atualizar')),
        React.createElement("div", { className: "subtabs", style: { marginTop: 14 } },
            podeGestao && React.createElement("button", { className: 'subtab' + (sub === 'gestao' ? ' on' : ''), onClick: () => setSub('gestao') }, "Gest\u00E3o e tratamento"),
            podeConfig && React.createElement("button", { className: 'subtab' + (sub === 'config' ? ' on' : ''), onClick: () => setSub('config') }, "Configura\u00E7\u00F5es")),
        sub === 'gestao' && podeGestao && React.createElement(React.Fragment, null,
            React.createElement("div", { className: "card" },
                React.createElement("div", { className: "filtros-cadastro", style: { margin: 0 } },
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-sinistros-pesquisar" }, "Pesquisar"),
                        React.createElement("input", { id: "adm-sinistros-pesquisar", name: "adm-sinistros-pesquisar", autoComplete: "off", value: filtro.texto, onChange: e => setFiltro({ ...filtro, texto: e.target.value }), placeholder: "Protocolo, placa, motorista..." })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-sinistros-status" }, "Status"),
                        React.createElement("select", { id: "adm-sinistros-status", name: "adm-sinistros-status", value: filtro.status, onChange: e => setFiltro({ ...filtro, status: e.target.value }) },
                            React.createElement("option", { value: "ABERTOS" }, "Em aberto"),
                            React.createElement("option", { value: "TODOS" }, "Todos"),
                            ['ABERTO', 'AGUARDANDO_ANALISE', 'EM_ATENDIMENTO', 'AGUARDANDO_DOCUMENTOS', 'ENCAMINHADO_SEGURADORA', 'AGUARDANDO_ORCAMENTO', 'EM_REPARO', 'AGUARDANDO_TERCEIRO', 'CONCLUIDO', 'CANCELADO'].map(x => React.createElement("option", { key: x, value: x }, x === 'ABERTO' ? 'Aberto (novo)' : (SINISTRO_STATUS_ROTULOS[x] || x.replaceAll('_', ' ')))))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-sinistros-competencia" }, "Compet\u00EAncia"),
                        React.createElement("input", { id: "adm-sinistros-competencia", name: "adm-sinistros-competencia", autoComplete: "off", type: "month", value: filtro.competencia || '', onChange: e => setFiltro({ ...filtro, competencia: e.target.value }) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-sinistros-tipo-de-ocorrencia" }, "Tipo de ocorr\u00EAncia"),
                        React.createElement("select", { id: "adm-sinistros-tipo-de-ocorrencia", name: "adm-sinistros-tipo-de-ocorrencia", value: filtro.tipoOcorrencia || '', onChange: e => setFiltro({ ...filtro, tipoOcorrencia: e.target.value }) },
                            React.createElement("option", { value: "" }, "Todos"),
                            ['Acidente', 'Pane', 'Avaria', 'Furto / Roubo / Vandalismo', 'Outro'].map(x => React.createElement("option", { key: x }, x)))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-sinistros-gravidade" }, "Gravidade"),
                        React.createElement("select", { id: "adm-sinistros-gravidade", name: "adm-sinistros-gravidade", value: filtro.gravidade, onChange: e => setFiltro({ ...filtro, gravidade: e.target.value }) },
                            React.createElement("option", { value: "" }, "Todas"),
                            ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'].map(x => React.createElement("option", { key: x }, x)))))),
            React.createElement("div", { className: "cards4" },
                React.createElement("div", { className: "card kpi" },
                    React.createElement("div", { className: "l" }, "Registros filtrados"),
                    React.createElement("div", { className: "v" }, filtrados.length)),
                React.createElement("div", { className: "card kpi" },
                    React.createElement("div", { className: "l" }, "Com v\u00EDtima"),
                    React.createElement("div", { className: "v" }, filtrados.filter(s => s.possuiVitima).length)),
                React.createElement("div", { className: "card kpi" },
                    React.createElement("div", { className: "l" }, "Alta/cr\u00EDtica"),
                    React.createElement("div", { className: "v" }, filtrados.filter(s => ['ALTA', 'CRITICA'].includes(normalizarPerfil(s.gravidade))).length))),
            React.createElement("div", { className: "card", style: { overflowX: 'auto' } },
                React.createElement("table", null,
                    React.createElement("thead", null,
                        React.createElement("tr", null,
                            React.createElement("th", null, "Protocolo"),
                            React.createElement("th", null, "Ocorrido"),
                            React.createElement("th", null, "Placa"),
                            React.createElement("th", null, "Motorista"),
                            React.createElement("th", null, "Ocorr\u00EAncia"),
                            React.createElement("th", null, "Gravidade"),
                            React.createElement("th", null, "Status"),
                            React.createElement("th", null))),
                    React.createElement("tbody", null, filtrados.map(s => React.createElement("tr", { key: s.id },
                        React.createElement("td", null,
                            React.createElement("b", null, s.numeroSinistro),
                            (s.documentosResumo?.pendentesEnvio || s.documentosResumo?.rejeitados) ? React.createElement("div", { className: "muted", style: { color: '#8A5200' } }, "A\u00E7\u00E3o do motorista pendente") : null),
                        React.createElement("td", null, dataBR(String(s.dataHoraOcorrido || '').slice(0, 10))),
                        React.createElement("td", null,
                            React.createElement("b", null, s.placa)),
                        React.createElement("td", null, s.motoristaNome),
                        React.createElement("td", null,
                            React.createElement("b", null, s.tipoOcorrencia || 'Outro'),
                            React.createElement("div", { className: "muted" }, s.tipoSinistro),
                            s.necessitaGuincho && React.createElement("div", { style: { marginTop: 4, fontWeight: 800, color: 'var(--erro)', fontSize: 12 } }, "\uD83D\uDEA8 GUINCHO NECESS\u00C1RIO")),
                        React.createElement("td", null,
                            React.createElement("span", { className: 'tag sinistro-gravidade-' + normalizarPerfil(s.gravidade) }, s.gravidade)),
                        React.createElement("td", null,
                            React.createElement(SinistroStatusTag, { s: s.statusSinistro })),
                        React.createElement("td", null,
                            React.createElement("button", { className: "btn btn-s btn-sm", disabled: carregandoDetalhe, onClick: () => abrir(s) }, carregandoDetalhe ? 'Abrindo...' : (pode(user, 'sinistros.gerenciar') ? 'Tratar' : 'Visualizar'))))))),
                !carregando && !filtrados.length && React.createElement("div", { className: "muted", style: { padding: 18, textAlign: 'center' } }, "Nenhum sinistro encontrado."))),
        sub === 'config' && podeConfig && React.createElement(React.Fragment, null, !config ? React.createElement("div", { className: "card" },
            React.createElement("div", { className: "muted" }, "Carregando configura\u00E7\u00F5es...")) : React.createElement("div", { className: "card" },
            React.createElement("div", { className: "row", style: { marginBottom: 14 } },
                React.createElement("div", { className: "grow" },
                    React.createElement("h3", null, "Configura\u00E7\u00F5es de sinistros"),
                    React.createElement("div", { className: "muted" }, "Par\u00E2metros lidos da lista Sinistros_Configuracoes.")),
                React.createElement("span", { className: 'tag ' + (podeEditarConfig ? 'tag-ok' : 'tag-neutro') }, podeEditarConfig ? 'Edição liberada' : 'Somente visualização')),
            React.createElement("div", { className: "form-grid" },
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-titulo" }, "T\u00EDtulo"),
                    React.createElement("input", { id: "adm-sinistros-titulo", name: "adm-sinistros-titulo", autoComplete: "off", disabled: !podeEditarConfig, value: config.titulo || '', onChange: e => setConfig({ ...config, titulo: e.target.value }) })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-status-2" }, "Status"),
                    React.createElement("select", { id: "adm-sinistros-status-2", name: "adm-sinistros-status-2", disabled: !podeEditarConfig, value: config.ativo ? 's' : 'n', onChange: e => setConfig({ ...config, ativo: e.target.value === 's' }) },
                        React.createElement("option", { value: "s" }, "Ativo"),
                        React.createElement("option", { value: "n" }, "Inativo"))),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-e-mail-principal" }, "E-mail principal"),
                    React.createElement("input", { id: "adm-sinistros-e-mail-principal", name: "adm-sinistros-e-mail-principal", autoComplete: "off", disabled: !podeEditarConfig, value: config.emailPrincipal || '', onChange: e => setConfig({ ...config, emailPrincipal: e.target.value }) })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-e-mails-em-copia" }, "E-mails em c\u00F3pia"),
                    React.createElement("input", { id: "adm-sinistros-e-mails-em-copia", name: "adm-sinistros-e-mails-em-copia", autoComplete: "off", disabled: !podeEditarConfig, value: config.emailCopia || '', onChange: e => setConfig({ ...config, emailCopia: e.target.value }), placeholder: "Separar por ;" })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-copia-oculta" }, "C\u00F3pia oculta"),
                    React.createElement("input", { id: "adm-sinistros-copia-oculta", name: "adm-sinistros-copia-oculta", autoComplete: "off", disabled: !podeEditarConfig, value: config.emailCopiaOculta || '', onChange: e => setConfig({ ...config, emailCopiaOculta: e.target.value }), placeholder: "Separar por ;" })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-assunto-do-e-mail" }, "Assunto do e-mail"),
                    React.createElement("input", { id: "adm-sinistros-assunto-do-e-mail", name: "adm-sinistros-assunto-do-e-mail", autoComplete: "off", disabled: !podeEditarConfig, value: config.assuntoEmail || '', onChange: e => setConfig({ ...config, assuntoEmail: e.target.value }) })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-contato-de-emergencia" }, "Contato de emerg\u00EAncia"),
                    React.createElement("input", { id: "adm-sinistros-contato-de-emergencia", name: "adm-sinistros-contato-de-emergencia", autoComplete: "off", disabled: !podeEditarConfig, value: config.nomeContatoEmergencia || '', onChange: e => setConfig({ ...config, nomeContatoEmergencia: e.target.value }) })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-telefone-de-emergencia" }, "Telefone de emerg\u00EAncia"),
                    React.createElement("input", { id: "adm-sinistros-telefone-de-emergencia", name: "adm-sinistros-telefone-de-emergencia", autoComplete: "off", disabled: !podeEditarConfig, value: config.telefoneEmergencia || '', onChange: e => setConfig({ ...config, telefoneEmergencia: e.target.value }) })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-revisao-do-procedimento" }, "Revis\u00E3o do procedimento"),
                    React.createElement("input", { id: "adm-sinistros-revisao-do-procedimento", name: "adm-sinistros-revisao-do-procedimento", autoComplete: "off", disabled: !podeEditarConfig, value: config.revisaoProcedimento || '', onChange: e => setConfig({ ...config, revisaoProcedimento: e.target.value }) })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-versao-do-modulo" }, "Vers\u00E3o do m\u00F3dulo"),
                    React.createElement("input", { id: "adm-sinistros-versao-do-modulo", name: "adm-sinistros-versao-do-modulo", autoComplete: "off", disabled: !podeEditarConfig, value: config.versaoModulo || '', onChange: e => setConfig({ ...config, versaoModulo: e.target.value }) })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-enviar-e-mail-automatico" }, "Enviar e-mail autom\u00E1tico?"),
                    React.createElement("select", { id: "adm-sinistros-enviar-e-mail-automatico", name: "adm-sinistros-enviar-e-mail-automatico", disabled: !podeEditarConfig, value: config.enviarEmailAutomatico ? 's' : 'n', onChange: e => setConfig({ ...config, enviarEmailAutomatico: e.target.value === 's' }) },
                        React.createElement("option", { value: "s" }, "Sim"),
                        React.createElement("option", { value: "n" }, "N\u00E3o"))),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-permitir-reabertura" }, "Permitir reabertura?"),
                    React.createElement("select", { id: "adm-sinistros-permitir-reabertura", name: "adm-sinistros-permitir-reabertura", disabled: !podeEditarConfig, value: config.permiteReabrirSinistro ? 's' : 'n', onChange: e => setConfig({ ...config, permiteReabrirSinistro: e.target.value === 's' }) },
                        React.createElement("option", { value: "s" }, "Sim"),
                        React.createElement("option", { value: "n" }, "N\u00E3o"))),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-dias-para-reabertura" }, "Dias para reabertura"),
                    React.createElement("input", { id: "adm-sinistros-dias-para-reabertura", name: "adm-sinistros-dias-para-reabertura", autoComplete: "off", type: "number", min: "0", disabled: !podeEditarConfig, value: config.diasReabertura || 0, onChange: e => setConfig({ ...config, diasReabertura: Number(e.target.value) || 0 }) })),
                React.createElement("div", { style: { gridColumn: '1/-1' } },
                    React.createElement("label", { htmlFor: "adm-sinistros-procedimento" }, "Procedimento"),
                    React.createElement("textarea", { id: "adm-sinistros-procedimento", name: "adm-sinistros-procedimento", rows: "5", disabled: !podeEditarConfig, value: config.procedimento || '', onChange: e => setConfig({ ...config, procedimento: e.target.value }) })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-ultima-atualizacao" }, "\u00DAltima atualiza\u00E7\u00E3o"),
                    React.createElement("input", { id: "adm-sinistros-ultima-atualizacao", name: "adm-sinistros-ultima-atualizacao", autoComplete: "off", disabled: true, value: config.ultimaAtualizacao ? new Date(config.ultimaAtualizacao).toLocaleString('pt-BR') : '' }))),
            podeEditarConfig && React.createElement("button", { className: "btn btn-p", disabled: salvandoConfig, style: { marginTop: 14 }, onClick: salvarConfig }, salvandoConfig ? 'Salvando...' : 'Salvar configurações'))),
        selecionado && React.createElement(Modal, { large: true, titulo: selecionado.numeroSinistro + ' — ' + selecionado.placa, onClose: () => setSelecionado(null) },
            React.createElement("div", { className: "cards4" },
                React.createElement("div", { className: "card" },
                    React.createElement("label", null, "Motorista"),
                    React.createElement("b", null, selecionado.motoristaNome),
                    React.createElement("div", { className: "muted" }, selecionado.motoristaTelefone || 'Sem telefone')),
                React.createElement("div", { className: "card" },
                    React.createElement("label", null, "Ocorr\u00EAncia"),
                    React.createElement("b", null, selecionado.tipoOcorrencia || 'Outro'),
                    React.createElement("div", { className: "muted" }, selecionado.tipoSinistro)),
                React.createElement("div", { className: "card" },
                    React.createElement("label", null, "Data/hora"),
                    React.createElement("b", null, dataHoraBRSinistro(selecionado.dataHoraOcorrido))),
                React.createElement("div", { className: "card" },
                    React.createElement("label", null, "Local"),
                    React.createElement("b", null, selecionado.localOcorrido),
                    React.createElement("div", { className: "muted" },
                        selecionado.municipio,
                        " / ",
                        selecionado.uf)),
                React.createElement("div", { className: "card" },
                    React.createElement("label", null, "Condi\u00E7\u00F5es"),
                    React.createElement("div", null, selecionado.possuiVitima ? '⚠ Possui vítima' : 'Sem vítima informada'),
                    React.createElement("div", null, selecionado.veiculoImobilizado ? 'Veículo imobilizado' : 'Veículo não imobilizado'),
                    selecionado.necessitaGuincho && React.createElement("div", { style: { marginTop: 5, fontWeight: 900, color: 'var(--erro)' } }, "\uD83D\uDEA8 GUINCHO NECESS\u00C1RIO"))),
            React.createElement("div", { className: "card", style: { marginTop: 10 } },
                React.createElement("label", null, "Descri\u00E7\u00E3o"),
                React.createElement("div", { style: { whiteSpace: 'pre-wrap' } }, selecionado.descricaoOcorrido)),
            React.createElement("div", { className: "card", style: { marginTop: 10 } },
                React.createElement("h3", null, "Documentos e evid\u00EAncias do envio inicial"),
                (selecionado.documentos || []).length ? React.createElement(GaleriaArquivosSinistro, { arquivos: selecionado.documentos }) : React.createElement("div", { className: "muted", style: { marginTop: 8 } }, "Nenhum arquivo enviado.")),
            React.createElement("div", { className: "card", style: { marginTop: 10 } },
                React.createElement("div", { className: "row" },
                    React.createElement("h3", { className: "grow" }, "Solicita\u00E7\u00F5es documentais"),
                    React.createElement("span", { className: "muted" },
                        (selecionado.solicitacoesDocumentos || []).length,
                        " item(ns)")),
                (selecionado.solicitacoesDocumentos || []).length ? (selecionado.solicitacoesDocumentos || []).map(doc => { const chave = normalizarPerfil(doc.statusDocumento); return React.createElement("div", { className: 'sinistro-documento-item ' + (chave === 'REJEITADO' ? 'rejeitado' : chave === 'PENDENTE_DE_ENVIO' ? 'pendente' : chave === 'ENVIADO' ? 'enviado' : chave === 'ACEITO' ? 'aceito' : 'dispensado'), key: doc.id },
                    React.createElement("div", { className: "row" },
                        React.createElement("div", { className: "grow" },
                            React.createElement("b", null, doc.tipoDocumento),
                            doc.obrigatorio && React.createElement("span", { className: "muted" }, " \u00B7 obrigat\u00F3rio")),
                        React.createElement(DocumentoStatusTag, { s: doc.statusDocumento })),
                    doc.descricaoSolicitacao && React.createElement("div", { style: { marginTop: 6, whiteSpace: 'pre-wrap' } }, doc.descricaoSolicitacao),
                    doc.observacaoMotorista && React.createElement("div", { className: "muted", style: { marginTop: 6 } },
                        React.createElement("b", null, "Motorista:"),
                        " ",
                        doc.observacaoMotorista),
                    doc.motivoRejeicao && React.createElement("div", { className: "erro-box", style: { marginTop: 7 } },
                        React.createElement("b", null, "Motivo da rejei\u00E7\u00E3o:"),
                        " ",
                        doc.motivoRejeicao),
                    (doc.arquivos || []).length > 0 && React.createElement(GaleriaArquivosSinistro, { arquivos: doc.arquivos }),
                    pode(user, 'sinistros.gerenciar') && React.createElement("div", { className: "row", style: { marginTop: 8, flexWrap: 'wrap' } },
                        chave === 'ENVIADO' && React.createElement(React.Fragment, null,
                            React.createElement("button", { className: "btn btn-p btn-sm", disabled: analisandoDocumento === doc.id, onClick: () => analisarDocumento(doc, 'Aceito') }, "Aceitar"),
                            React.createElement("button", { className: "btn btn-d btn-sm", disabled: analisandoDocumento === doc.id, onClick: () => analisarDocumento(doc, 'Rejeitado') }, "Rejeitar / pedir reenvio")),
                        !['ACEITO', 'DISPENSADO'].includes(chave) && React.createElement("button", { className: "btn btn-g btn-sm", disabled: analisandoDocumento === doc.id, onClick: () => analisarDocumento(doc, 'Dispensado') }, "Dispensar"))); }) : React.createElement("div", { className: "muted", style: { marginTop: 8 } }, "Nenhum documento solicitado pela Log\u00EDstica.")),
            React.createElement("div", { className: "card", style: { marginTop: 10 } },
                React.createElement("h3", null, "Hist\u00F3rico"),
                (selecionado.historico || []).map(h => { const p = historicoSinistroApresentacao(h); return React.createElement("div", { className: "linha-item", key: h.id },
                    React.createElement("span", { className: "grow" },
                        React.createElement("b", null, p.acao),
                        React.createElement("span", { className: "muted", style: { display: 'block' } },
                            dataHoraBRSinistro(h.dataHora),
                            " \u00B7 ",
                            h.usuario || h.perfil),
                        p.observacao && React.createElement("span", { style: { display: 'block', whiteSpace: 'pre-wrap' } }, p.observacao)),
                    React.createElement(HistoricoSinistroTag, { h: h })); })),
            React.createElement("div", { className: "card", style: { marginTop: 10 } },
                React.createElement("div", { className: "form-grid" },
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-sinistros-status-3" }, "Status"),
                        React.createElement("select", { id: "adm-sinistros-status-3", name: "adm-sinistros-status-3", disabled: !pode(user, 'sinistros.gerenciar'), value: edicao.statusSinistro, onChange: e => { setEdicao({ ...edicao, statusSinistro: e.target.value }); if (normalizarPerfil(e.target.value) !== 'AGUARDANDO_DOCUMENTOS')
                                setSolicitacoesNovas([]); } }, ['Aberto', 'Aguardando analise', 'Em atendimento', 'Aguardando documentos', 'Encaminhado seguradora', 'Aguardando orcamento', 'Em reparo', 'Aguardando terceiro', 'Concluido', 'Cancelado'].map(x => React.createElement("option", { key: x }, x)))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-sinistros-gravidade-2" }, "Gravidade"),
                        React.createElement("select", { id: "adm-sinistros-gravidade-2", name: "adm-sinistros-gravidade-2", disabled: !pode(user, 'sinistros.gerenciar'), value: edicao.gravidade, onChange: e => setEdicao({ ...edicao, gravidade: e.target.value }) }, ['Baixa', 'Media', 'Alta', 'Critica'].map(x => React.createElement("option", { key: x }, x)))),
                    React.createElement("div", { style: { gridColumn: '1/-1' } },
                        React.createElement("label", { htmlFor: "adm-sinistros-observacao-administrativa" }, "Observa\u00E7\u00E3o administrativa"),
                        React.createElement("textarea", { id: "adm-sinistros-observacao-administrativa", name: "adm-sinistros-observacao-administrativa", disabled: !pode(user, 'sinistros.gerenciar'), rows: "3", value: edicao.observacao, onChange: e => setEdicao({ ...edicao, observacao: e.target.value }), placeholder: "Registre a orienta\u00E7\u00E3o ou andamento relevante." }))),
                pode(user, 'sinistros.gerenciar') && normalizarPerfil(edicao.statusSinistro) === 'AGUARDANDO_DOCUMENTOS' && React.createElement("div", { style: { marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--linha)' } },
                    React.createElement("div", { className: "row" },
                        React.createElement("div", { className: "grow" },
                            React.createElement("h3", null, "Solicitar documentos ao motorista"),
                            React.createElement("div", { className: "muted" }, "Marque somente o que precisa ser enviado nesta etapa. Solicita\u00E7\u00F5es j\u00E1 existentes continuam v\u00E1lidas."))),
                    TIPOS_DOCUMENTOS_SINISTRO.map(tipo => { const atual = solicitacoesNovas.find(x => x.tipoDocumento === tipo); return React.createElement("div", { className: "sinistro-solicitacao-opcao", key: tipo },
                        React.createElement("label", { style: { display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', letterSpacing: 0, color: 'var(--tinta)', fontSize: 14, margin: 0 } },
                            React.createElement("input", { type: "checkbox", style: { width: 18, height: 18 }, checked: Boolean(atual), onChange: () => alternarSolicitacao(tipo) }),
                            React.createElement("b", null, tipo)),
                        atual && React.createElement(React.Fragment, null,
                            React.createElement("textarea", { rows: "2", style: { marginTop: 8 }, value: atual.descricaoSolicitacao || '', onChange: e => atualizarSolicitacao(tipo, 'descricaoSolicitacao', e.target.value), placeholder: tipo === 'Outro' ? 'Descreva exatamente o documento necessário.' : 'Orientação adicional (opcional): ex. foto frontal e lateral.' }),
                            React.createElement("label", { style: { display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', letterSpacing: 0, marginTop: 7 } },
                                React.createElement("input", { type: "checkbox", style: { width: 18, height: 18 }, checked: atual.obrigatorio !== false, onChange: e => atualizarSolicitacao(tipo, 'obrigatorio', e.target.checked) }),
                                "Obrigat\u00F3rio para encerrar a pend\u00EAncia documental"))); })),
                pode(user, 'sinistros.gerenciar') && React.createElement("button", { className: "btn btn-p", style: { width: '100%', marginTop: 12 }, onClick: salvar }, "Salvar andamento"))));
}
/* ================= SHELL ADM ================= */
function AdmApp({ st, setSt, user, onSair, toast }) {
    const dados = usarDadosMensais(st);
    const abas = [
        pode(user, 'painel_rh.visualizar') && ['rh', 'Fechamento RH'],
        ABAS_PAINEL.some(aba => podeAbaPainel(user, aba)) && ['painel', 'Painel'],
        pode(user, 'importar.criar') && ['importar', 'Importar'],
        pode(user, 'contestacoes.visualizar') && ['contest', 'Contestações'],
        (pode(user, 'sinistros.visualizar') || pode(user, 'sinistros.configuracoes')) && ['sinistros', 'Sinistros'],
        (pode(user, 'agendamentos.agenda') || pode(user, 'agendamentos.monitoramento') || pode(user, 'agendamentos.relatorio')) && ['agendamentos', 'Agendamentos'],
        (pode(user, 'checklist.aprovacao') || pode(user, 'checklist.perguntas') || pode(user, 'checklist.relatorio')) && ['check', 'Check list'],
        (pode(user, 'premiacao.visualizar') || pode(user, 'metas.visualizar') || pode(user, 'descontos.visualizar') || pode(user, 'auditoria.visualizar')) && ['prem', 'Premiação'],
        (pode(user, 'cadastro.usuarios') || pode(user, 'cadastro.tipos_veiculo') || pode(user, 'cadastro.veiculos') || pode(user, 'cadastro.vinculos') || pode(user, 'cadastro.perfis')) && ['cad', 'Cadastros']
    ].filter(Boolean);
    const [aba, setAba] = useModuloPortal('admin', user, abas.map(([id]) => id));
    const [destino, setDestino] = useState(null);
    const [menuAberto,setMenuAberto]=useState(false);
    const navegarPara = (id, parametros = {}) => {
        if (!abas.some(([codigo]) => codigo === id)) {
            toast('Seu perfil não possui acesso ao módulo solicitado.');
            return;
        }
        setDestino({ id, parametros, chave: Date.now() });
        setAba(id);
    };
    useEffect(() => {
        if (CONFIG.MODO_TESTE_LOCAL || !pode(user, 'checklist.administrar'))
            return;
        ApiService.admListarChecklists().then(r => {
            const vindos = (r.itens || r.checklists || []).map(x => ({
                id: x.protocolo || x.id, idLocal: x.idLocal || '', motorista: x.motoristaNome || '', placa: x.placa || '',
                frota: String(x.tipoChecklist || '').toUpperCase().includes('LEVE') ? 'leve' : 'pesada',
                data: String(x.dataHoraLocal || '').slice(0, 10),
                status: String(x.status || 'PENDENTE').toLowerCase() === 'aprovado' ? 'aprovado' : (String(x.status || '').toLowerCase() === 'reprovado' ? 'reprovado' : 'pendente'),
                motivoReprova: x.motivoReprova || x.motivoReprovacao || '', km: String(x.quilometragem || ''), combustivel: '',
                respostas: (x.respostas || []).map(rr => ({ pid: String(rr.idPergunta || ''), pergunta: rr.pergunta || '', resp: rr.resposta || 'NA', obs: rr.observacao || '', foto: rr.linkFoto || null }))
            }));
            setSt(s => ({ ...s, checklists: vindos }));
        }).catch(e => toast('Falha ao carregar checklists do banco D1 de homologação: ' + e.message));
    }, []);
    const icones={rh:"▦",painel:"◫",importar:"↥",contest:"≡",sinistros:"◇",agendamentos:"▤",check:"✓",prem:"☆",cad:"▧"};
    return (React.createElement("div", { className: "ashell admin-lateral" },
        menuAberto && React.createElement("button",{className:"admin-menu-fundo","aria-label":"Fechar menu",onClick:()=>setMenuAberto(false)}),
        React.createElement("aside", { className: "admin-sidebar"+(menuAberto?" aberto":"") },
            React.createElement("div",{className:"admin-identidade"},
                React.createElement("div",{className:"admin-logo-box"},React.createElement("img",{src:LOGO,alt:"Bocchi Agrobios",className:"admin-logo"})),
                React.createElement("div",{className:"admin-produto"},"Gestão de Frota"),
                React.createElement("div",{className:"admin-legenda"},"Logística Bocchi")),
            React.createElement("nav", { className: "admin-nav","aria-label":"Módulos disponíveis" }, abas.map(([id, nome]) => React.createElement("button", { key: id, className: aba === id ? 'on' : '',"aria-current":aba===id?"page":undefined,onClick: () => { setDestino(null); setAba(id);setMenuAberto(false); } },React.createElement("span",{"aria-hidden":true,className:"admin-nav-icon"},icones[id]),nome))),
            React.createElement("div",{className:"admin-sidebar-footer"},React.createElement("span",null,"Bocchi Frota"),React.createElement(AvisoPrivacidade,{claro:true}),React.createElement("small",null,CONFIG.VERSAO))),
        React.createElement("header",{className:"admin-topbar"},
            React.createElement("div",{className:"row"},React.createElement("button",{className:"btn btn-g btn-sm admin-toggle","aria-label":"Abrir menu","aria-expanded":menuAberto,onClick:()=>setMenuAberto(x=>!x)},"☰"),React.createElement("span",{className:"admin-contexto"},abas.find(([id])=>id===aba)?.[1]||"Gestão de Frota")),
            React.createElement("div",{className:"row admin-conta"},React.createElement("div",null,React.createElement("strong",null,user.nome),React.createElement("small",null,user.perfil||"Gestão")),React.createElement(AlterarSenhaUsuario,{user,onSair,toast,claro:true}),React.createElement("button",{className:"btn btn-g btn-sm",onClick:onSair},"Sair"))),
        React.createElement("div", { className: "abody" },
            aba === 'rh' && React.createElement(PainelRH, { st: st, dados: dados, user: user }),
            aba === 'painel' && React.createElement(AdmPainel, { st: st, dados: dados, user: user, onNavegar: navegarPara }),
            aba === 'importar' && React.createElement(AdmImportar, { st: st, setSt: setSt, toast: toast }),
            aba === 'contest' && React.createElement(AdmContestacoes, { st: st, setSt: setSt, toast: toast, foco: destino?.id === 'contest' ? destino : null }),
            aba === 'agendamentos' && React.createElement(AdmAgendamentos, { user: user, toast: toast }),
            aba === 'sinistros' && React.createElement(AdmSinistros, { toast: toast, user: user, foco: destino?.id === 'sinistros' ? destino : null }),
            aba === 'check' && React.createElement(AdmChecklist, { st: st, setSt: setSt, toast: toast, user: user, foco: destino?.id === 'check' ? destino : null }),
            aba === 'prem' && React.createElement(AdmPremiacao, { st: st, setSt: setSt, toast: toast, user: user }),
            aba === 'cad' && React.createElement(AdmCadastros, { st: st, setSt: setSt, toast: toast, user: user }))));
}
/* ================= APP ================= */
function restaurarSessaoPortal() {
    try {
        const sessao = JSON.parse(sessionStorage.getItem('bocchi.portal.sessao') || 'null');
        if (!CONFIG.MODO_TESTE_LOCAL && sessao?.token && sessao.usuario?.login && Date.parse(sessao.expiraEm) > Date.now()) {
            _token = sessao.token;
            _expiraSessao = sessao.expiraEm;
            _loginSessao = sessao.usuario.login.trim().toLowerCase();
            return sessao.usuario;
        }
        sessionStorage.removeItem('bocchi.portal.sessao');
    } catch {}
    return null;
}
function App() {
    const [st, setSt] = useState(estadoInicial);
    const [user, setUser] = useState(restaurarSessaoPortal);
    useConexaoPortal(user);
    useEffect(() => {
        if (!user || !_expiraSessao) return;
        const expirar = () => { ApiService.sair(); setUser(null); };
        const timer = setTimeout(expirar, Math.max(0, Date.parse(_expiraSessao) - Date.now()));
        window.addEventListener('bocchi:sessao-invalida', expirar);
        return () => { clearTimeout(timer); window.removeEventListener('bocchi:sessao-invalida', expirar); };
    }, [user]);
    const [toastMsg, setToastMsg] = useState('');
    const tRef = useRef(null);
    const toast = (m) => { setToastMsg(m); clearTimeout(tRef.current); const tempo = Math.max(3800, Math.min(6500, String(m || '').length * 45)); tRef.current = setTimeout(() => setToastMsg(''), tempo); };
    const userAtual = user ? st.usuarios.find(u => u.id === user.id) || user : null;
    const ehMotorista = temPerfil(userAtual, 'MOTORISTA');
    const acessoGestao = [
        'painel_rh.visualizar',
        'painel.visualizar',
        'importar.criar',
        'contestacoes.visualizar',
        'sinistros.visualizar',
        'sinistros.configuracoes',
        'agendamentos.agenda',
        'agendamentos.monitoramento',
        'agendamentos.relatorio',
        'checklist.aprovacao',
        'checklist.perguntas',
        'checklist.relatorio',
        'premiacao.visualizar',
        'metas.visualizar',
        'descontos.visualizar',
        'auditoria.visualizar',
        'cadastro.usuarios',
        'cadastro.tipos_veiculo',
        'cadastro.veiculos',
        'cadastro.vinculos',
        'cadastro.perfis'
    ].some(permissao => pode(userAtual, permissao)) ||
        permissoesDoUsuario(userAtual).has('*');
    return (React.createElement(React.Fragment, null,
        !userAtual && React.createElement(Login, { st: st, onLogin: usuario => {
            try { if (_token && _expiraSessao) sessionStorage.setItem('bocchi.portal.sessao', JSON.stringify({token: _token, expiraEm: _expiraSessao, usuario})); } catch {}
            setUser(usuario);
        } }),
        userAtual && ehMotorista && !acessoGestao && React.createElement(MotoristaApp, { st: st, setSt: setSt, user: userAtual, onSair: () => { ApiService.sair(); setUser(null); }, toast: toast }),
        userAtual && acessoGestao && React.createElement(AdmApp, { st: st, setSt: setSt, user: userAtual, onSair: () => { ApiService.sair(); setUser(null); }, toast: toast }),
        userAtual && !ehMotorista && !acessoGestao && (React.createElement("div", { className: "login-wrap" },
            React.createElement("div", { className: "login-card" },
                React.createElement("div", { className: "marca" },
                    "Bocchi ",
                    React.createElement("em", null, "Frota")),
                React.createElement("div", { className: "erro-box" },
                    "O perfil \u201C",
                    userAtual.perfil || 'não informado',
                    "\u201D n\u00E3o est\u00E1 configurado para acesso."),
                React.createElement("button", { className: "btn btn-p", onClick: () => setUser(null) }, "Voltar ao login")))),
        React.createElement(Toast, { msg: toastMsg })));
}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App, null));


