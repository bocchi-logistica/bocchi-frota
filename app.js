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
        if (!CONFIG.ATUALIZACAO_TEMPO_REAL || !usuario || !ApiService.token) return;
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
    ATUALIZACAO_TEMPO_REAL: false,
    MAX_FOTO_MB: 2,
    QUALIDADE_FOTO: 0.7,
    FOTO_MAX_PX: 1600,
    TIMEOUT_MS: 90000,
    RETRY_DELAYS_MS: [0, 10000, 30000, 120000],
    MAX_TENTATIVAS: 4,
    VERSAO: '2.8.70-homolog-tratativas'
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
    'tratativas.visualizar': { areas: ['PAINEL'] },
    'importar.criar': { areas: ['IMPORTACAO'], editar: true },
    'contestacoes.visualizar': { areas: ['CONTESTACOES'] },
    'contestacoes.decidir': { areas: ['CONTESTACOES'], editar: true },
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
   ========================================================================== */
let _expiraSessao = null;
function mesmaSessaoToken(a,b){
    if(a===b)return true;
    if(!a||!b)return false;
    try{
        const ler=t=>JSON.parse(atob(t.split('.')[0].replace(/-/g,'+').replace(/_/g,'/')));
        const x=ler(a),y=ler(b);
        return !!x.nonce&&x.nonce===y.nonce&&x.sub===y.sub&&x.sv===y.sv;
    }catch{return false;}
}
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
            if (!mesmaSessaoToken(token,_token)) throw new Error('Sessão alterada durante a consulta.');
            if (!token || !(Date.parse(_expiraSessao) > Date.now())) {
                window.dispatchEvent(new Event('bocchi:sessao-invalida'));
                throw new Error('Sessão inválida ou expirada.');
            }
        };
        conferirSessao();
        const resultado = await cacheLeiturasPortal.obter(token + '|' + caminho, async () => {
            const dados = await this._reqRede(metodo, caminho, corpo);
            if (!mesmaSessaoToken(token,_token)) throw new Error('Sessão alterada durante a consulta.');
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
    enviarChecklist(registro, sessaoEsperada = null) {
        if (sessaoEsperada && (!mesmaSessaoToken(sessaoEsperada.token,_token) || sessaoEsperada.login !== _loginSessao)) {
            const erro = new Error('Sessão alterada. O checklist permanece com o usuário que o criou.');
            erro.code = 'SESSAO_ALTERADA';
            throw erro;
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
    obterPremiacaoMotorista(nome, competencias = [], motoristaItemId = '') {
        const q = new URLSearchParams(motoristaItemId ? { motoristaItemId: String(motoristaItemId) } : { motoristaNome: nome });
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
    salvarApuracoes(motoristaId, apuracoes, origem = 'RH_QUADRIMESTRE') {
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
        const tokenInicial = ApiService.token;
        const sessaoValida = () => !!tokenInicial && ApiService.loginAtual === login && mesmaSessaoToken(ApiService.token,tokenInicial);
        if (!sessaoValida())
            return;
        if (this._processando)
            return; // evita tentativas simultâneas
        this._processando = true;
        try {
            const fila = await this.pendentes(login);
            if (!sessaoValida()) return;
            for (const item of fila) {
                if (!sessaoValida() || this._loginDono(item) !== login) return;
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
                if (!sessaoValida()) {
                    item.statusEnvio = 'PENDENTE';
                    await IDB.salvarFila(item);
                    return;
                }
                this._notificar();
                try {
                    const resp = await ApiService.enviarChecklist(item, { token: tokenInicial, login });
                    if (resp && resp.sucesso === true && resp.protocolo) {
                        item.statusEnvio = 'ENVIADO';
                        item.protocolo = resp.protocolo;
                        item.dataHoraRecebimento = resp.dataHoraRecebimento;
                        await IDB.salvarFila(item);
                        if (toast && sessaoValida())
                            toast('Checklist enviado. Protocolo: ' + resp.protocolo);
                    }
                    else {
                        throw new Error((resp && resp.mensagem) || 'Resposta inválida da API');
                    }
                }
                catch (e) {
                    if (!sessaoValida() || e.code === 'SESSAO_ALTERADA') {
                        item.statusEnvio = 'PENDENTE';
                        await IDB.salvarFila(item);
                        return;
                    }
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
    const calculada = (st.apuracoes || []).find(a => !a.resumoMotorista && a.mes === mes &&
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

function Login({ onLogin }) {
    const [apresentacaoAberta, setApresentacaoAberta] = useState(false);
    const botaoApresentacao = React.useRef(null), cartaoLogin = React.useRef(null);
    React.useEffect(() => {
        const mobile = window.matchMedia('(max-width:800px)');
        const overflowAnterior = document.body.style.overflow;
        const sincronizar = () => {
            const aberta = apresentacaoAberta && mobile.matches;
            if (cartaoLogin.current) cartaoLogin.current.inert = aberta;
            document.body.style.overflow = aberta ? 'hidden' : overflowAnterior;
            if (!mobile.matches) setApresentacaoAberta(false);
        };
        sincronizar(); mobile.addEventListener('change', sincronizar);
        return () => { mobile.removeEventListener('change', sincronizar); document.body.style.overflow = overflowAnterior; if (cartaoLogin.current) cartaoLogin.current.inert = false; };
    }, [apresentacaoAberta]);
    const fecharApresentacao = () => { setApresentacaoAberta(false); botaoApresentacao.current?.focus(); };
    const [login, setLogin] = useState('');
    const [senha, setSenha] = useState('');
    const [erro, setErro] = useState('');
    const [senhaLoginVisivel, setSenhaLoginVisivel] = useState(false);
    /* O endpoint POST /login valida as credenciais e informa a expiração da sessão. */
    const [carregando, setCarregando] = useState(false);
    const entrar = async () => {
        if(carregando)return;
        setErro('');
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
    return (React.createElement("div", { className: "login-wrap bocchi-login" + (apresentacaoAberta ? " apresentacao-aberta" : ""), onKeyDown: e => {
        if (!apresentacaoAberta) return;
        if (e.key === "Escape") { e.preventDefault(); fecharApresentacao(); }
        if (e.key === "Tab") {
            const itens = [botaoApresentacao.current, ...e.currentTarget.querySelectorAll(".login-apresentacao a[href]")].filter(Boolean);
            const i = itens.indexOf(document.activeElement);
            e.preventDefault(); itens[(i + (e.shiftKey ? -1 : 1) + itens.length) % itens.length]?.focus();
        }
    } },
        React.createElement("button", { ref: botaoApresentacao, type: "button", className: "login-menu-toggle", "aria-expanded": apresentacaoAberta, "aria-controls": "login-apresentacao", "aria-label": apresentacaoAberta ? "Fechar apresentação da plataforma" : "Abrir apresentação da plataforma", onClick: () => setApresentacaoAberta(v => !v) }, apresentacaoAberta ? "✕" : "☰"),
        apresentacaoAberta && React.createElement("button", { type: "button", className: "login-menu-fundo", "aria-label": "Fechar apresentação", tabIndex: -1, onClick: fecharApresentacao }),
        React.createElement("section",{id:"login-apresentacao",className:"login-apresentacao","aria-label":"Conheça a plataforma Bocchi Frota"},
            React.createElement("a",{className:"login-empresa",href:"https://bocchiagrobios.com.br/",target:"_blank",rel:"noopener noreferrer"},"BOCCHI AGROBIOS"),
            React.createElement("div",{className:"login-mensagem"},
                React.createElement("div",{className:"login-eyebrow"},"BOCCHI FROTA"),
                React.createElement("h1",null,"Quem move a Bocchi merece estar conectado."),
                React.createElement("p",null,"Um espaço para facilitar sua rotina, cuidar dos nossos veículos e aproximar você da empresa. Juntos, seguimos com segurança, parceria e reconhecimento."),
                React.createElement("div",{className:"login-servicos"},["Agendamento de veículos compartilhados","Checklists","Premiação","Sinistros","Indicadores","IA Logística"].map(s=>React.createElement("span",{key:s},s))),
                React.createElement("div",{className:"login-em-breve"},"Em breve: manuais e controle de manutenção.")),
            React.createElement("div",{className:"login-valores"},"Segurança",React.createElement("span",null,"•"),"Parceria",React.createElement("span",null,"•"),"Reconhecimento")),
        React.createElement("div", { ref: cartaoLogin, className: "login-card" },
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
            React.createElement("div",{className:"login-versao"},"Versão ",CONFIG.VERSAO))));
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
    const [carregandoCargas, setCarregandoCargas] = useState(true);
    const [carregandoPremiacao, setCarregandoPremiacao] = useState(true);
    useEffect(() => {
        if (!['cargas', 'prem'].includes(aba))
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
/* ================= SHELL ADM ================= */
function AdmIaLogistica({user}) {
    const referencia = React.useRef(null);
    React.useEffect(() => {
        let ativo = true, instancia = null;
        import('/js/modulos/ia-logistica.js').then(modulo => {
            if (!ativo || !referencia.current) return;
            instancia = modulo.montarChatIaLogistica(referencia.current, {
                apiUrl: CONFIG.API_URL,
                obterToken: () => ApiService.token
            });
        }).catch(() => { if (ativo && referencia.current) referencia.current.textContent = 'Não foi possível carregar a IA Logística.'; });
        return () => { ativo = false; instancia?.desmontar(); };
    }, [user.id]);
    return React.createElement('div', {ref: referencia});
}
function AdmApp({ st, setSt, user, onSair, toast }) {
    const dados = usarDadosMensais(st);
    const abas = [
        pode(user, 'painel_rh.visualizar') && ['rh', 'Fechamento RH'],
        (user?.areasAcesso || []).includes('IA_LOGISTICA') && (user?.subtelasAcesso || []).includes('IA_LOGISTICA_CONSULTAR') && !/MOTORISTA/i.test(String(user?.perfil || '')) && ['ia', 'IA Logística'],
        ABAS_INDICADORES.some(([codigo]) => podeAbaIndicadores(user, codigo)) && ['indicadores', 'Indicadores'],
        pode(user, 'tratativas.visualizar') && ['tratativas', 'Tratativas'],
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
        if (!pode(user, 'checklist.administrar'))
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
    const icones={ia:"✦",indicadores:React.createElement("svg",{width:18,height:18,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"},React.createElement("path",{d:"M3 3v18h18M7 15l5-5 4 3 5-7"})),rh:"▦",tratativas:"◫",importar:"↥",contest:"≡",sinistros:"◇",agendamentos:"▤",check:"✓",prem:"☆",cad:"▧"};
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
            aba === 'ia' && React.createElement(AdmIaLogistica, { user }),
            aba === 'indicadores' && React.createElement(AdmIndicadores, { user }),
            aba === 'tratativas' && React.createElement(AdmTratativas, { user: user, onNavegar: navegarPara }),
            aba === 'importar' && React.createElement(AdmImportar, { st: st, setSt: setSt, toast: toast }),
            aba === 'contest' && React.createElement(AdmContestacoes, { st: st, setSt: setSt, user: user, toast: toast, foco: destino?.id === 'contest' ? destino : null }),
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
        if (sessao?.token && sessao.usuario?.login && Date.parse(sessao.expiraEm) > Date.now()) {
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
        let timer, renovando=false, ultimaRenovacao=0, encerrado=false;
        const expirar = () => { if(encerrado)return; encerrado=true; ApiService.sair(); setUser(null); };
        const programar = () => {
            clearTimeout(timer);
            timer=setTimeout(expirar, Math.max(0, Date.parse(_expiraSessao)-Date.now()));
        };
        const atividade = async event => {
            if(!event.isTrusted || encerrado || document.visibilityState==='hidden')return;
            if(Date.now()>=Date.parse(_expiraSessao)){expirar();return;}
            if(renovando || Date.now()-ultimaRenovacao<15000)return;
            renovando=true;ultimaRenovacao=Date.now();
            const tokenAnterior=_token;
            try{
                const r=await fetchComTimeout(CONFIG.API_URL+'/sessao/atividade',{
                    method:'POST',headers:{Authorization:'Bearer '+tokenAnterior}
                });
                if(encerrado || _token!==tokenAnterior)return;
                if(r.status===401){expirar();return;}
                if(!r.ok)return;
                const data=await r.json();
                if(encerrado || _token!==tokenAnterior)return;
                if(!data.ok || !data.token || !Number.isFinite(Date.parse(data.expiraEm)))return;
                _token=data.token;_expiraSessao=data.expiraEm;
                try{sessionStorage.setItem('bocchi.portal.sessao',JSON.stringify({token:_token,expiraEm:_expiraSessao,usuario:user}));}catch{}
                programar();
            }catch{}finally{renovando=false;}
        };
        const eventos=['pointerdown','keydown','touchstart','scroll'];
        programar();
        eventos.forEach(e=>window.addEventListener(e,atividade,{passive:true}));
        window.addEventListener('bocchi:sessao-invalida',expirar);
        return ()=>{
            encerrado=true;clearTimeout(timer);
            eventos.forEach(e=>window.removeEventListener(e,atividade));
            window.removeEventListener('bocchi:sessao-invalida',expirar);
        };
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
        !userAtual && React.createElement(Login, { onLogin: usuario => {
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





