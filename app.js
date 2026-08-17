const { useState, useMemo, useRef, useEffect } = React;
/* ============================================================================
   ALTERAÇÃO V6 — CONFIG (configuração centralizada)
   >>> AQUI é o ÚNICO lugar onde se configura a URL da API. <<<
   Em produção: MODO_DEMONSTRACAO = false e API_URL = endereço real da Azure Function.
   ========================================================================== */
const CONFIG = {
    // ÚNICO ponto de configuração da integração. Não inserir credenciais neste HTML.
    API_URL: "https://bocchi-frota-api.logistica-951.workers.dev",
    MODO_DEMONSTRACAO: false, // true = funciona offline e não grava no SharePoint
    ORIGEM_PORTAL: "https://bocchi-logistica.github.io",
    SHAREPOINT_ESTRUTURA: {
        listaChecklists: "Checklists_Frota",
        listaRespostas: "Checklists_Respostas",
        bibliotecaFotos: "Fotos_Checklist"
    },
    MAX_FOTO_MB: 2,
    QUALIDADE_FOTO: 0.7,
    FOTO_MAX_PX: 1600,
    TIMEOUT_MS: 90000,
    RETRY_DELAYS_MS: [0, 10000, 30000, 120000],
    MAX_TENTATIVAS: 4,
    VERSAO: '2.8.16'
};
// A versão exibida no login e no título do navegador vem sempre do CONFIG.
document.title = `Bocchi Frota — Portal do Motorista e ADM Logística (${CONFIG.VERSAO})`;
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
    'descontos.visualizar': { area: 'PREMIACAO', subtela: 'PREMIACAO_DESCONTOS' },
    'descontos.editar': { area: 'PREMIACAO', subtela: 'PREMIACAO_DESCONTOS', editar: true },
    'cadastro.usuarios': { area: 'CADASTROS', subtela: 'CADASTRO_USUARIOS' },
    'cadastro.tipos_veiculo': { area: 'CADASTROS', subtela: 'CADASTRO_TIPOS_VEICULO' },
    'cadastro.veiculos': { area: 'CADASTROS', subtela: 'CADASTRO_VEICULOS' },
    'cadastro.vinculos': { area: 'CADASTROS', subtela: 'CADASTRO_VINCULOS' },
    'cadastro.perfis': { area: 'CADASTROS', subtela: 'CADASTRO_PERFIS' },
    'apuracao.mensal.atualizar': { area: 'PAINEL', subtela: 'ATUALIZARAPURACAOMENSAL_PAINEL', editar: true },
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
   ALTERAÇÃO V6 — UTILITÁRIOS
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
   ALTERAÇÃO V6 — INDEXEDDB (fila de envio local + rascunho)
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
   ALTERAÇÃO V6 — FOTOS (compressão antes do envio)
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
   ALTERAÇÃO V6 — API SERVICE
   Toda comunicação com o servidor passa por aqui. Nenhuma credencial do
   SharePoint existe neste arquivo: o HTML só conhece CONFIG.API_URL.
   Em MODO_DEMONSTRACAO as funções simulam o servidor localmente.
   ========================================================================== */
let _token = null; // token de sessão em memória (nunca gravar senha no navegador)
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
    async _req(metodo, caminho, corpo) {
        const r = await fetchComTimeout(CONFIG.API_URL + caminho, {
            method: metodo, headers: this._headers(),
            body: corpo ? JSON.stringify(corpo) : undefined
        });
        if (!r.ok) {
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
            const err = new Error((detalhe && (detalhe.erro || detalhe.mensagem || detalhe.message))
                || mensagens[r.status]
                || msg);
            err.status = r.status;
            err.detalhe = detalhe;
            throw err;
        }
        return r.json();
    },
    async login(login, senha) {
        if (CONFIG.MODO_DEMONSTRACAO)
            return null;
        const r = await this._req('POST', '/login', {
            login,
            pin: senha
        });
        if (r && r.ok) {
            _token = r.token;
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
    sair() { _token = null; _loginSessao = null; },
    enviarChecklist(registro) {
        if (CONFIG.MODO_DEMONSTRACAO) {
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
    obterCargas(competencia = '') {
        const q = competencia ? '?competencia=' + encodeURIComponent(competencia) : '';
        return this._req('GET', '/cargas/me' + q);
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
    obterMeusSinistros() { return this._req('GET', '/sinistros/me'); },
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
function erroTemporarioGraph(error) {
    const status = Number(error?.status || 0);
    const texto = String(error?.message || '') + ' ' + JSON.stringify(error?.detalhe || {});
    const falhaRede = /failed to fetch|network|fetch|aborterror|timeout|tempo limite/i.test(texto);
    return falhaRede || ([408, 425, 429, 500, 502, 503, 504].includes(status) &&
        (status !== 500 || /429|throttl|temporari|limite|muitas tentativas/i.test(texto)));
}
async function executarComRetentativaGraph(operacao, maxTentativas = 4) {
    let ultimoErro;
    for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
        try {
            return await operacao();
        }
        catch (error) {
            ultimoErro = error;
            if (!erroTemporarioGraph(error) || tentativa === maxTentativas)
                throw error;
            await aguardar(Math.min(30000, 4000 * Math.pow(2, tentativa - 1)));
        }
    }
    throw ultimoErro;
}
/* ============================================================================
   ALTERAÇÃO V6 — FILA DE ENVIO (internet instável)
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
        if (!CONFIG.MODO_DEMONSTRACAO && ApiService.loginAtual !== login)
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
const FOTO_DEMO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#D8D6C9"/><text x="100" y="95" font-family="sans-serif" font-size="16" fill="#6B7267" text-anchor="middle">FOTO ANEXADA</text><text x="100" y="118" font-family="sans-serif" font-size="12" fill="#9A9F94" text-anchor="middle">(exemplo)</text></svg>');
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
    return (React.createElement("div", { className: "overlay", onClick: e => { if (e.target === e.currentTarget)
            onClose(); } },
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
    return { totalAtivos: docs.length, pendentesEnvio: contar('Pendente de envio'), enviados: contar('Enviado'), aceitos: contar('Aceito'), rejeitados: contar('Rejeitado'), dispensados: contar('Dispensado') };
}
function situacaoMotoristaSinistro(s) {
    const status = normalizarPerfil(s?.statusSinistro);
    const r = resumoDocumentosSinistroCliente(s);
    if (status === 'AGUARDANDO_DOCUMENTOS') {
        if ((r.rejeitados || 0) > 0 || (r.pendentesEnvio || 0) > 0)
            return { chave: 'ACAO_NECESSARIA', rotulo: 'Ação necessária', descricao: 'A Logística solicitou documento(s).' };
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
function Login({ st, onLogin }) {
    const [login, setLogin] = useState('');
    const [senha, setSenha] = useState('');
    const [erro, setErro] = useState('');
    const [senhaLoginVisivel, setSenhaLoginVisivel] = useState(false);
    /* ALTERAÇÃO V6: em produção a autenticação é feita pelo endpoint POST /auth/login
       da API (o token fica só em memória; a senha nunca é gravada no navegador).
       O modo demonstração usa a base local e está claramente separado. */
    const [carregando, setCarregando] = useState(false);
    const entrar = async () => {
        setErro('');
        if (CONFIG.MODO_DEMONSTRACAO) {
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
            setErro('Não foi possível conectar ao servidor. Verifique a internet e tente novamente.');
        }
        finally {
            setCarregando(false);
        }
    };
    return (React.createElement("div", { className: "login-wrap" },
        React.createElement("div", { className: "login-card" },
            React.createElement("img", { src: LOGO, className: "logo-login", alt: "Bocchi Agrobios" }),
            React.createElement("div", { className: "login-sub" },
                "Portal do motorista e ADM log\u00EDstica \u2014 Vers\u00E3o ",
                CONFIG.VERSAO,
                " \u2014 Edson.B"),
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
            CONFIG.MODO_DEMONSTRACAO && React.createElement("div", { className: "hint" },
                React.createElement("b", null, "MODO DEMONSTRA\u00C7\u00C3O ativo"),
                " \u2014 selecione um usu\u00E1rio cadastrado para navegar sem gravar no SharePoint."))));
}
/* ================= MOTORISTA: CARGAS ================= */
function TelaCargas({ st, setSt, user, dados, toast }) {
    const [mes, setMes] = useState(MES_ATUAL);
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
        if (CONFIG.MODO_DEMONSTRACAO) {
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
        if (CONFIG.MODO_DEMONSTRACAO) {
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
    const mesesDisp = MESES_2026.slice(0, 7);
    return (React.createElement(React.Fragment, null,
        React.createElement("div", { className: "seletor-mes" }, mesesDisp.map(m => React.createElement("button", { key: m, className: 'mes-pill' + (m === mes ? ' on' : ''), onClick: () => setMes(m) }, mesLabel(m)))),
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
                                "R$ ",
                                brn(c.rt),
                                "/t")),
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
                const chave = grupo.rotulo;
                const aberta = !!ocorrenciasAbertas[chave];
                return (React.createElement("div", { className: "linha-item ocorrencia-linha", key: grupo.rotulo },
                    React.createElement("div", { className: "ocorrencia-resumo" },
                        doItem.length > 0 ?
                            React.createElement("button", { type: "button", className: "ocorrencia-abrir", onClick: () => setOcorrenciasAbertas(a => ({ ...a, [chave]: !a[chave] })), "aria-expanded": aberta },
                                React.createElement("span", { className: 'ocorrencia-seta' + (aberta ? ' aberta' : '') }, "\u2304"),
                                React.createElement("span", null,
                                    grupo.rotulo,
                                    React.createElement("span", { className: "muted" },
                                        " \u2014 ",
                                        doItem.length,
                                        " ocorr\u00EAncia",
                                        doItem.length > 1 ? 's' : ''))) :
                            React.createElement("span", null,
                                grupo.rotulo,
                                React.createElement("span", { className: "muted" }, " \u2014 nenhuma ocorr\u00EAncia")),
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
                                    String(d.motivo || d.origem || 'Não informado')));
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
/* ================= MOTORISTA: CHECK LIST ================= */
function TelaChecklist({ st, setSt, user, toast, inicioAgendamento, onInicioConsumido, onConcluidoAgendamento }) {
    /* ALTERAÇÃO V6: o envio agora passa por IndexedDB + ApiService (fila offline
       com idempotência por idLocal). O estado local (setSt) é mantido apenas
       para a demonstração do fluxo de aprovação do ADM. */
    const meus = st.checklists.filter(c => c.motorista === user.nome).sort((a, b) => b.data.localeCompare(a.data));
    const normalizarTexto = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const deHoje = meus.find(c => c.data === HOJE && c.status !== 'reprovado');
    const reprovadoHoje = meus.find(c => c.data === HOJE && c.status === 'reprovado');
    const [preenchendo, setPreenchendo] = useState(false);
    const [resps, setResps] = useState({});
    const [ver, setVer] = useState(null);
    const mesAtualFiltro = String(HOJE || '').slice(0, 7);
    const [filtroMesHistorico, setFiltroMesHistorico] = useState(mesAtualFiltro);
    const [filtroStatusHistorico, setFiltroStatusHistorico] = useState('todos');
    const [extras, setExtras] = useState({ km: '', combustivel: '' });
    const [enviando, setEnviando] = useState(false);
    const [ultimoEnvio, setUltimoEnvio] = useState(null); // confirmação real da API (protocolo)
    const [pendentes, setPendentes] = useState([]); // fila local aguardando envio
    const [online, setOnline] = useState(navigator.onLine);
    const [temRascunho, setTemRascunho] = useState(false);
    const fileRefs = useRef({});
    const veiculosDemo = Object.values(st.frota).filter(f => f.motorista === user.nome);
    const [veiculosPermitidos, setVeiculosPermitidos] = useState(CONFIG.MODO_DEMONSTRACAO ? veiculosDemo : []);
    const [carregandoVeiculos, setCarregandoVeiculos] = useState(!CONFIG.MODO_DEMONSTRACAO);
    const [erroVeiculos, setErroVeiculos] = useState('');
    const [veiculo, setVeiculo] = useState(veiculosDemo[0]?.placa || '');
    const vSel = veiculosPermitidos.find(v => v.placa === veiculo);
    const frotaSel = normalizarTexto(vSel?.tipoFrota || vSel?.frota || '').includes('leve') ? 'leve' : 'pesada';
    const [perguntasAtivas, setPerguntasAtivas] = useState([]);
    const [carregandoPerguntas, setCarregandoPerguntas] = useState(false);
    const [erroPerguntas, setErroPerguntas] = useState('');
    const [modoOcorrenciaAgendamento, setModoOcorrenciaAgendamento] = useState(false);
    const [grupoOcorrencia, setGrupoOcorrencia] = useState('');
    const [ultimoChecklistValido, setUltimoChecklistValido] = useState(null);
    useEffect(() => {
        if (CONFIG.MODO_DEMONSTRACAO)
            return;
        let ativo = true;
        setCarregandoVeiculos(true);
        setErroVeiculos('');
        ApiService.obterVeiculos().then(r => {
            if (!ativo)
                return;
            const recebidos = r.veiculos || [];
            if (inicioAgendamento?.placa) {
                const placaAlvo = String(inicioAgendamento.placa || '').trim().toUpperCase();
                const cadastrado = recebidos.find(v => String(v.placa || '').trim().toUpperCase() === placaAlvo);
                const unico = cadastrado || { placa: placaAlvo, tipoFrota: 'FROTA LEVE', frota: 'FROTA LEVE', tipoModelo: 'CARRO', tipo: 'CARRO', usoCompartilhado: true, ativo: true };
                setVeiculosPermitidos([unico]);
                setVeiculo(unico.placa);
            }
            else {
                // No checklist aberto manualmente, veículos compartilhados de agendamento não podem ser escolhidos.
                // Permanecem somente veículos efetivamente vinculados ao usuário (ex.: Frota Pesada).
                const vinculados = recebidos.filter(v => v.usoCompartilhado !== true);
                setVeiculosPermitidos(vinculados);
                setVeiculo(atual => vinculados.some(v => v.placa === atual) ? atual : (vinculados[0]?.placa || ''));
            }
        }).catch(e => { if (ativo) {
            setVeiculosPermitidos([]);
            setVeiculo('');
            setErroVeiculos(e.message || 'Não foi possível carregar os veículos.');
        } })
            .finally(() => { if (ativo)
            setCarregandoVeiculos(false); });
        return () => { ativo = false; };
    }, [user.id, user.login, inicioAgendamento?.placa]);
    const normalizarStatusChecklist = valor => {
        const s = String(valor || 'pendente').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (s.includes('aprov'))
            return 'aprovado';
        if (s.includes('reprov'))
            return 'reprovado';
        return 'pendente';
    };
    const carregarHistorico = async () => {
        if (CONFIG.MODO_DEMONSTRACAO)
            return;
        try {
            const r = await ApiService.consultarMeusChecklists();
            const vindos = (r.checklists || []).map(x => ({
                id: x.protocolo || x.id,
                idLocal: x.idLocal || '',
                motorista: x.motoristaNome || user.nome,
                placa: x.placa || '',
                frota: String(x.tipoChecklist || '').toUpperCase().includes('LEVE') ? 'leve' : 'pesada',
                data: String(x.dataHoraLocal || '').slice(0, 10),
                status: normalizarStatusChecklist(x.status),
                motivoReprova: x.motivoReprova || '',
                km: String(x.quilometragem || ''),
                respostas: (x.respostas || []).map(rr => ({
                    pid: String(rr.idPergunta || ''),
                    pergunta: rr.pergunta || '',
                    resp: rr.resposta || 'NA',
                    obs: rr.observacao || '',
                    foto: rr.linkFoto || null
                }))
            }));
            setSt(s => ({ ...s, checklists: vindos }));
        }
        catch (e) {
            toast('O checklist foi salvo, mas não foi possível atualizar o histórico: ' + (e.message || e));
        }
    };
    useEffect(() => { carregarHistorico(); }, []);
    useEffect(() => {
        let ativo = true;
        const carregar = async () => {
            setCarregandoPerguntas(true);
            setErroPerguntas('');
            setPerguntasAtivas([]);
            try {
                const tipo = frotaSel === 'leve' ? 'LEVE' : 'PESADA';
                const r = await ApiService.obterPerguntas(tipo, { placa: veiculo, ignorarFrequencia: !!inicioAgendamento?.agendamentoId });
                if (!ativo)
                    return;
                const lista = (r.perguntas || []).map(p => ({
                    id: String(p.id),
                    texto: p.texto || '',
                    grupo: p.grupo || 'Outros',
                    frota: (p.tipoFrota || tipo).toLowerCase(),
                    frequencia: p.frequencia || 'Diária',
                    obrigatoria: p.obrigatoria === true,
                    fotoNC: p.fotoObrigatoriaNC === true,
                    observacaoObrigatoriaNC: p.observacaoObrigatoriaNC === true,
                    ativa: p.ativa !== false,
                    ordem: Number(p.ordem || 999)
                })).sort((a, b) => a.grupo.localeCompare(b.grupo, 'pt-BR') || a.ordem - b.ordem);
                setPerguntasAtivas(lista);
            }
            catch (e) {
                if (ativo)
                    setErroPerguntas(e.message || 'Não foi possível carregar as perguntas.');
            }
            finally {
                if (ativo)
                    setCarregandoPerguntas(false);
            }
        };
        carregar();
        return () => { ativo = false; };
    }, [frotaSel, veiculo]);
    useEffect(() => {
        if (!inicioAgendamento?.placa || carregandoVeiculos)
            return;
        const placaAlvo = String(inicioAgendamento.placa).toUpperCase();
        const encontrado = veiculosPermitidos.find(v => String(v.placa || '').toUpperCase() === placaAlvo);
        if (encontrado && veiculo !== encontrado.placa)
            setVeiculo(encontrado.placa);
    }, [inicioAgendamento, carregandoVeiculos, veiculosPermitidos, veiculo]);
    useEffect(() => {
        if (!inicioAgendamento?.placa || preenchendo || carregandoVeiculos || carregandoPerguntas || erroVeiculos || erroPerguntas)
            return;
        if (String(veiculo || '').toUpperCase() !== String(inicioAgendamento.placa).toUpperCase())
            return;
        if (!perguntasAtivas.length)
            return;
        let ativo = true;
        const preparar = async () => {
            try {
                let modo = String(inicioAgendamento.modoChecklist || '').toUpperCase();
                let ultimo = inicioAgendamento.ultimoChecklist || null;
                if (!modo) {
                    const contexto = await ApiService.contextoChecklistAgendamento(veiculo);
                    modo = contexto?.modoChecklist || 'COMPLETO';
                    ultimo = contexto?.ultimoChecklist || null;
                }
                if (!ativo)
                    return;
                setExtras(x => ({ ...x, km: String(inicioAgendamento.km || x.km || '') }));
                setResps({});
                setGrupoOcorrencia('');
                setUltimoChecklistValido(ultimo);
                setModoOcorrenciaAgendamento(modo === 'OCORRENCIA');
                setPreenchendo(true);
                setUltimoEnvio(null);
            }
            catch (e) {
                if (ativo)
                    toast('Não foi possível preparar o checklist do agendamento: ' + (e.message || e));
            }
            finally { }
        };
        preparar();
        return () => { ativo = false; };
    }, [inicioAgendamento, veiculo, perguntasAtivas, carregandoVeiculos, carregandoPerguntas, erroVeiculos, erroPerguntas, preenchendo]);
    const grupos = [...new Set(perguntasAtivas.map(p => p.grupo))];
    const perguntasExibidas = modoOcorrenciaAgendamento ? (grupoOcorrencia ? perguntasAtivas.filter(p => p.grupo === grupoOcorrencia) : []) : perguntasAtivas;
    const chaveRascunho = 'ck_' + user.login + '_' + HOJE;
    // Histórico e indicadores respeitam o mês/status escolhidos pelo motorista.
    const historicoFiltrado = meus.filter(c => (!filtroMesHistorico || String(c.data || '').slice(0, 7) === filtroMesHistorico) && (filtroStatusHistorico === 'todos' || c.status === filtroStatusHistorico));
    const cont = lista => ({ tot: lista.length, ap: lista.filter(c => c.status === 'aprovado').length, rep: lista.filter(c => c.status === 'reprovado').length, pen: lista.filter(c => c.status === 'pendente').length });
    const cM = cont(historicoFiltrado);
    const mesFiltroLabel = filtroMesHistorico ? mesLabel(filtroMesHistorico.slice(5, 7) + '/' + filtroMesHistorico.slice(0, 4)) : 'todos os meses';
    /* ALTERAÇÃO V6: monitorar fila local e estado da conexão */
    const atualizarFila = () => { FilaEnvio.pendentes(user.login).then(setPendentes).catch(() => { }); };
    useEffect(() => {
        atualizarFila();
        const ouv = () => atualizarFila();
        FilaEnvio.ouvintes.add(ouv);
        const on = () => { setOnline(true); FilaEnvio.processar(toast, user.login); };
        const off = () => setOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        // Remove automaticamente apenas registros locais impossíveis de recuperar.
        // Checklists válidos aguardando internet continuam preservados.
        FilaEnvio.sanear(user.login).then(() => atualizarFila()).catch(() => { });
        IDB.lerRascunho(chaveRascunho).then(r => setTemRascunho(!!r));
        return () => { FilaEnvio.ouvintes.delete(ouv); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    }, [user.login]);
    /* ALTERAÇÃO V6: salvamento automático do rascunho + aviso ao sair da página */
    useEffect(() => {
        if (!preenchendo)
            return;
        const t = setTimeout(() => { IDB.salvarRascunho(chaveRascunho, { resps, extras, veiculo }).catch(() => { }); }, 800);
        return () => clearTimeout(t);
    }, [resps, extras, veiculo, preenchendo]);
    useEffect(() => {
        if (!preenchendo)
            return;
        const aviso = e => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', aviso);
        return () => window.removeEventListener('beforeunload', aviso);
    }, [preenchendo]);
    const abrirFormulario = async () => {
        if (carregandoVeiculos) {
            toast('Aguarde: carregando o veículo vinculado.');
            return;
        }
        if (erroVeiculos) {
            toast('Não foi possível abrir o checklist: ' + erroVeiculos);
            return;
        }
        if (!veiculo) {
            toast('Nenhum veículo ativo está compartilhado ou vinculado ao seu usuário.');
            return;
        }
        if (carregandoPerguntas) {
            toast('Aguarde: carregando as perguntas do SharePoint.');
            return;
        }
        if (erroPerguntas) {
            toast('Não foi possível abrir o checklist: ' + erroPerguntas);
            return;
        }
        if (!perguntasAtivas.length) {
            toast('Não há inspeções pendentes para este veículo neste período.');
            return;
        }
        const r = await IDB.lerRascunho(chaveRascunho).catch(() => null);
        if (r && (Object.keys(r.resps || {}).length || r.extras && r.extras.km)) {
            setResps(r.resps || {});
            setExtras(r.extras || { km: '', combustivel: '' });
            if (r.veiculo)
                setVeiculo(r.veiculo);
            toast('Rascunho recuperado — continue de onde parou.');
        }
        setPreenchendo(true);
        setUltimoEnvio(null);
    };
    const cancelar = () => {
        setPreenchendo(false);
        setResps({});
        setExtras({ km: '', combustivel: '' });
        setModoOcorrenciaAgendamento(false);
        setGrupoOcorrencia('');
        setUltimoChecklistValido(null);
        IDB.apagarRascunho(chaveRascunho).catch(() => { });
        setTemRascunho(false);
        if (inicioAgendamento?.agendamentoId && onInicioConsumido)
            onInicioConsumido();
    };
    const setResp = (pid, campo, v) => setResps(r => ({ ...r, [pid]: { ...(r[pid] || {}), [campo]: v } }));
    /* ALTERAÇÃO V6: foto é comprimida (máx. 1600px, JPEG q=0,7) antes de anexar */
    const anexar = (pid, e) => {
        const f = e.target.files && e.target.files[0];
        if (!f)
            return;
        e.target.value = '';
        comprimirImagem(f)
            .then(b64 => setResp(pid, 'foto', b64))
            .catch(err => toast(err.message));
    };
    const removerFoto = (pid) => setResp(pid, 'foto', null);
    const obterLocalizacao = () => new Promise(res => {
        if (!navigator.geolocation)
            return res({ latitude: null, longitude: null });
        navigator.geolocation.getCurrentPosition(p => res({ latitude: p.coords.latitude, longitude: p.coords.longitude }), () => res({ latitude: null, longitude: null }), { timeout: 4000, maximumAge: 600000 });
    });
    /* ALTERAÇÃO V6: validações, payload padronizado, fila IndexedDB e envio à API */
    const enviar = async () => {
        if (enviando)
            return; // prevenção contra clique duplo
        if (!String(user?.nome || '').trim() || !String(user?.login || '').trim()) {
            toast('Sua sessão está incompleta. Saia, entre novamente e refaça o checklist.');
            return;
        }
        if (!String(veiculo || '').trim()) {
            toast('Selecione um veículo antes de enviar.');
            return;
        }
        // Quilometragem obrigatória e válida para qualquer frota
        const km = parseInt(extras.km || localStorage.getItem('km_' + veiculo) || '0', 10);
        if ((!modoOcorrenciaAgendamento && !extras.km) || isNaN(km) || km <= 0) {
            toast('Informe a quilometragem atual do veículo (somente números).');
            return;
        }
        if (km > 3000000) {
            toast('Quilometragem fora do limite razoável. Confira o valor.');
            return;
        }
        const ultimoKm = parseInt(localStorage.getItem('km_' + veiculo) || '0', 10);
        if (ultimoKm && km < ultimoKm && !window.confirm('Atenção: a quilometragem informada (' + km + ') é MENOR que a última registrada para esta placa (' + ultimoKm + '). Deseja continuar mesmo assim?'))
            return;
        for (const p of perguntasExibidas) {
            const r = resps[p.id];
            // No checklist periódico completo, mantém a obrigatoriedade normal.
            // No modo NC do agendamento, o motorista responde somente o(s) item(ns) com problema.
            if (!modoOcorrenciaAgendamento && p.obrigatoria && (!r || !r.resp)) {
                toast('Responda: "' + p.texto.slice(0, 40) + '..."');
                return;
            }
            if (r && r.resp === 'NC' && !r.obs) {
                toast('Descreva o problema do item não conforme: ' + p.texto.slice(0, 35) + '...');
                return;
            }
            if (r && r.resp === 'NC' && p.fotoNC && !r.foto) {
                toast('Anexe a foto da não conformidade: ' + p.texto.slice(0, 35) + '...');
                return;
            }
        }
        if (modoOcorrenciaAgendamento) {
            if (!grupoOcorrencia) {
                toast('Selecione o grupo onde foi identificada a não conformidade.');
                return;
            }
            const respostasNC = perguntasExibidas.filter(p => resps[p.id]?.resp === 'NC');
            if (!respostasNC.length) {
                toast('Marque ao menos uma pergunta como Não conforme no grupo selecionado.');
                return;
            }
        }
        if (!window.confirm('Confirma o envio do checklist da placa ' + veiculo + '?'))
            return;
        setEnviando(true);
        try {
            const loc = await obterLocalizacao();
            const idLocal = gerarUUID(); // mesmo id em todas as tentativas -> sem duplicidade no SharePoint
            const registro = {
                idLocal,
                dataHoraLocal: agoraISO(),
                motorista: { nome: user.nome, login: user.login },
                veiculo: { placa: veiculo, tipo: vSel ? vSel.tipo : '' },
                quilometragem: km,
                combustivel: frotaSel === 'leve' ? (extras.combustivel || '') : '',
                tipoChecklist: modoOcorrenciaAgendamento ? 'LEVE_NC_AGENDAMENTO' : (frotaSel === 'leve' ? 'LEVE' : 'PESADA'),
                versaoFormulario: CONFIG.VERSAO,
                localizacao: loc,
                respostas: (modoOcorrenciaAgendamento ? perguntasExibidas.filter(p => resps[p.id]?.resp) : perguntasExibidas).map(p => {
                    const r = resps[p.id] || {};
                    return { idPergunta: p.id, grupo: p.grupo, pergunta: p.texto,
                        resposta: r.resp || 'NA', observacao: r.obs || '', possuiFoto: !!r.foto,
                        fotos: r.foto ? [{ nome: p.id + '-01.jpg', tipo: 'image/jpeg', conteudoBase64: r.foto }] : [] };
                }),
                quantidadeNC: perguntasExibidas.filter(p => resps[p.id] && resps[p.id].resp === 'NC').length,
                statusChecklist: 'PENDENTE',
                agendamentoId: inicioAgendamento?.agendamentoId || '',
                etapaAgendamento: inicioAgendamento?.etapa || '',
                origemChecklist: inicioAgendamento?.agendamentoId ? (modoOcorrenciaAgendamento ? 'AGENDAMENTO_NC' : 'AGENDAMENTO_RETIRADA') : 'CHECKLIST_NORMAL',
                regularizacaoTerceiro: inicioAgendamento?.regularizacaoTerceiro === true
            };
            // 1) grava na fila local ANTES de tentar enviar (não se perde sem internet)
            await FilaEnvio.adicionar(registro);
            localStorage.setItem('km_' + veiculo, String(km));
            // Somente no modo demonstração o registro entra diretamente no painel local.
            // Em produção, o painel administrativo deve carregar exclusivamente os dados da API/SharePoint.
            if (CONFIG.MODO_DEMONSTRACAO) {
                const registroLocal = { id: 'demo' + Date.now(), idLocal, motorista: user.nome, placa: veiculo, frota: frotaSel, data: HOJE, status: 'pendente', motivoReprova: '',
                    km: String(km), combustivel: extras.combustivel || '',
                    respostas: perguntasExibidas.map(p => ({ pid: p.id, resp: (resps[p.id] && resps[p.id].resp) || 'NA', obs: (resps[p.id] && resps[p.id].obs) || '', foto: (resps[p.id] && resps[p.id].foto) || null })) };
                setSt(s => ({ ...s, checklists: [...s.checklists, registroLocal] }));
            }
            // 2) tenta enviar agora; só marca ENVIADO com confirmação real da API
            await FilaEnvio.processar(toast, user.login);
            const fila = await IDB.listarFila();
            const meu = fila.find(x => x.idLocal === idLocal);
            if (meu && meu.statusEnvio === 'ENVIADO') {
                setUltimoEnvio({ protocolo: meu.protocolo, placa: veiculo, quando: meu.dataHoraRecebimento || agoraISO() });
                await carregarHistorico();
                if (inicioAgendamento?.agendamentoId && onConcluidoAgendamento) {
                    setTimeout(() => onConcluidoAgendamento(), 350);
                }
            }
            else if (!navigator.onLine) {
                toast('Sem conexão com a internet. O checklist foi salvo neste aparelho e será enviado quando a conexão retornar.');
            }
            else {
                toast('Não foi possível concluir o envio agora. Seus dados continuam salvos neste aparelho.');
            }
            await IDB.apagarRascunho(chaveRascunho);
            setTemRascunho(false);
            setPreenchendo(false);
            setResps({});
            setExtras({ km: '', combustivel: '' });
            setModoOcorrenciaAgendamento(false);
            setGrupoOcorrencia('');
            setUltimoChecklistValido(null);
            atualizarFila();
        }
        finally {
            setEnviando(false);
        }
    };
    const reenviarPendentes = () => { toast('Tentando enviar novamente...'); FilaEnvio.processar(toast, user.login); };
    const excluirRegistroInvalido = async (idLocal) => {
        if (!window.confirm('Excluir este envio incompleto deste aparelho? Depois será necessário refazer o checklist.'))
            return;
        await IDB.removerFila(idLocal);
        atualizarFila();
        toast('Registro incompleto removido. Refaça o checklist.');
    };
    const rotuloStatusEnvio = { RASCUNHO: 'Rascunho', PENDENTE: 'Aguardando envio', ENVIANDO: 'Enviando...', ENVIADO: 'Enviado', ERRO: 'Falha no envio', DADOS_INCOMPLETOS: 'Precisa ser refeito' };
    return (React.createElement(React.Fragment, null,
        !online &&
            React.createElement("div", { className: "erro-box" }, "Sem conex\u00E3o com a internet. Voc\u00EA pode preencher normalmente \u2014 o checklist ficar\u00E1 salvo neste aparelho e ser\u00E1 enviado quando a conex\u00E3o retornar."),
        pendentes.length > 0 &&
            React.createElement("div", { className: "card", style: { borderLeft: '4px solid var(--colheita)' } },
                React.createElement("div", { className: "row" },
                    React.createElement("div", { className: "grow" },
                        React.createElement("b", null,
                            pendentes.length,
                            " checklist(s) aguardando envio"),
                        React.createElement("div", { className: "muted" }, pendentes.map(p => dataBR(String(p.dataHoraLocal || '').slice(0, 10)) + ' · ' + (p.veiculo?.placa || 'placa não informada') + ' · ' + (rotuloStatusEnvio[p.statusEnvio] || p.statusEnvio) + (p.ultimoErro ? ' (' + p.ultimoErro + ')' : '')).join(' — '))),
                    pendentes.some(p => p.statusEnvio === 'DADOS_INCOMPLETOS')
                        ? React.createElement("button", { className: "btn btn-d btn-sm", onClick: () => excluirRegistroInvalido(pendentes.find(p => p.statusEnvio === 'DADOS_INCOMPLETOS').idLocal) }, "Excluir e refazer")
                        : React.createElement("button", { className: "btn btn-s btn-sm", onClick: reenviarPendentes }, "Tentar enviar novamente"))),
        ultimoEnvio &&
            React.createElement("div", { className: "card", style: { borderLeft: '4px solid var(--ok)' } },
                React.createElement("b", null, "Checklist enviado com sucesso."),
                React.createElement("div", { className: "muted", style: { marginTop: 4 } },
                    "Protocolo: ",
                    React.createElement("b", { className: "num" }, ultimoEnvio.protocolo),
                    React.createElement("br", null),
                    "Placa: ",
                    React.createElement("b", null, ultimoEnvio.placa),
                    " \u00B7 Data: ",
                    dataBR(ultimoEnvio.quando.slice(0, 10)),
                    " \u00E0s ",
                    ultimoEnvio.quando.slice(11, 16))),
        !preenchendo && React.createElement(React.Fragment, null,
            React.createElement("div", { className: "totais" },
                React.createElement("div", { className: "card" },
                    React.createElement("div", { className: "v num" }, cM.tot),
                    React.createElement("div", { className: "l" },
                        "Checklists em ",
                        mesFiltroLabel)),
                React.createElement("div", { className: "card" },
                    React.createElement("div", { className: "v num", style: { color: 'var(--mata)' } }, cM.ap),
                    React.createElement("div", { className: "l" }, "Aprovados")),
                React.createElement("div", { className: "card" },
                    React.createElement("div", { className: "v num", style: { color: cM.rep ? 'var(--erro)' : 'var(--mata)' } }, cM.rep),
                    React.createElement("div", { className: "l" }, "Reprovados"))),
            cM.pen > 0 && React.createElement("div", { className: "muted", style: { textAlign: 'center', marginTop: -4 } },
                cM.pen,
                " checklist(s) aguardando an\u00E1lise nos filtros selecionados.")),
        !preenchendo && carregandoPerguntas &&
            React.createElement("div", { className: "aviso-box" }, "Carregando perguntas ativas do SharePoint..."),
        !preenchendo && erroPerguntas &&
            React.createElement("div", { className: "erro-box" },
                "Falha ao carregar as perguntas: ",
                erroPerguntas),
        !preenchendo && !carregandoPerguntas && !erroPerguntas && perguntasAtivas.length === 0 &&
            React.createElement("div", { className: "aviso-box" }, "N\u00E3o h\u00E1 inspe\u00E7\u00F5es pendentes para este ve\u00EDculo neste per\u00EDodo."),
        !preenchendo && carregandoVeiculos && React.createElement("div", { className: "aviso-box" }, "Carregando ve\u00EDculo vinculado..."),
        !preenchendo && erroVeiculos && React.createElement("div", { className: "erro-box" },
            "Falha ao carregar ve\u00EDculos: ",
            erroVeiculos),
        !preenchendo && !carregandoVeiculos && !erroVeiculos && veiculosPermitidos.length === 0 && !inicioAgendamento?.placa && React.createElement("div", { className: "card muted", style: { textAlign: 'center', padding: '24px 16px' } }, "Nenhum checklist pendente no momento."),
        !preenchendo && veiculosPermitidos.length > 0 && !deHoje &&
            React.createElement("div", { className: "card", style: { textAlign: 'center', padding: '26px 16px' } },
                React.createElement("div", { style: { fontSize: 34 } }, "\uD83D\uDCCB"),
                React.createElement("h3", { style: { margin: '6px 0 2px' } }, reprovadoHoje ? 'Check list reprovado — refazer' : 'Check list de hoje pendente'),
                reprovadoHoje && React.createElement("div", { className: "erro-box", style: { margin: '8px 0' } },
                    "Motivo: ",
                    reprovadoHoje.motivoReprova),
                React.createElement("div", { className: "muted", style: { marginBottom: 14 } },
                    "Inspe\u00E7\u00E3o pendente \u2014 ",
                    dataBR(HOJE)),
                React.createElement("button", { className: "btn btn-p", disabled: carregandoVeiculos || !!erroVeiculos || !veiculo, onClick: abrirFormulario }, reprovadoHoje ? 'Refazer check list' : (temRascunho ? 'Continuar rascunho' : 'Preencher agora'))),
        veiculosPermitidos.length > 0 && deHoje &&
            React.createElement("div", { className: "card row" },
                React.createElement("div", { className: "grow" },
                    React.createElement("b", null, "Check list de hoje enviado"),
                    React.createElement("div", { className: "muted" },
                        dataBR(HOJE),
                        " \u00B7 ",
                        deHoje.placa)),
                React.createElement(StatusTag, { s: deHoje.status })),
        preenchendo && React.createElement(React.Fragment, null,
            modoOcorrenciaAgendamento && React.createElement("div", { className: "card", style: { borderLeft: '4px solid var(--colheita)' } },
                React.createElement("h3", null, "Registrar n\u00E3o conformidade do agendamento"),
                React.createElement("div", { className: "muted", style: { margin: '4px 0 10px' } }, "O checklist peri\u00F3dico desta placa j\u00E1 foi realizado. Registre somente o grupo e o item com problema."),
                ultimoChecklistValido && React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => setVer(ultimoChecklistValido) }, "Visualizar \u00FAltimo checklist realizado"),
                React.createElement("div", { style: { marginTop: 12 } },
                    React.createElement("label", { htmlFor: "tela-checklist-grupo-com-problema" }, "Grupo com problema"),
                    React.createElement("select", { id: "tela-checklist-grupo-com-problema", name: "tela-checklist-grupo-com-problema", value: grupoOcorrencia, onChange: e => { setGrupoOcorrencia(e.target.value); setResps({}); } },
                        React.createElement("option", { value: "" }, "Selecionar..."),
                        grupos.map(g => React.createElement("option", { key: g, value: g }, g))))),
            React.createElement("div", { className: "card" },
                React.createElement("label", null, "Ve\u00EDculo"),
                inicioAgendamento?.placa ? React.createElement(React.Fragment, null,
                    React.createElement("input", { value: veiculo, readOnly: true }),
                    React.createElement("div", { className: "muted", style: { marginTop: 6 } }, "Placa definida automaticamente pelo agendamento.")) : React.createElement("select", { value: veiculo, onChange: e => { setVeiculo(e.target.value); setResps({}); } }, veiculosPermitidos.map(f => React.createElement("option", { key: f.placa, value: f.placa },
                    f.placa,
                    " \u2014 ",
                    f.tipoModelo || f.tipo,
                    " (",
                    normalizarTexto(f.tipoFrota || f.frota).includes('leve') ? 'frota leve' : 'frota pesada',
                    ")"))),
                React.createElement("div", { className: "form-grid", style: { marginTop: 12 } },
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "tela-checklist-km-atual" }, "KM atual *"),
                        React.createElement("input", { id: "tela-checklist-km-atual", name: "tela-checklist-km-atual", autoComplete: "off", type: "number", inputMode: "numeric", value: extras.km, onChange: e => setExtras({ ...extras, km: e.target.value }), placeholder: "Ex.: 158420" })),
                    frotaSel === 'leve' && !modoOcorrenciaAgendamento &&
                        React.createElement("div", null,
                            React.createElement("label", { htmlFor: "tela-checklist-nivel-de-combustivel" }, "N\u00EDvel de combust\u00EDvel"),
                            React.createElement("select", { id: "tela-checklist-nivel-de-combustivel", name: "tela-checklist-nivel-de-combustivel", value: extras.combustivel, onChange: e => setExtras({ ...extras, combustivel: e.target.value }) },
                                React.createElement("option", { value: "" }, "Selecionar..."),
                                React.createElement("option", null, "Reserva"),
                                React.createElement("option", null, "1/4"),
                                React.createElement("option", null, "Meio tanque"),
                                React.createElement("option", null, "3/4"),
                                React.createElement("option", null, "Tanque cheio"))))),
            React.createElement("div", { className: "aviso-box" },
                "Marque cada item. Em ",
                React.createElement("b", null, "n\u00E3o conforme (NC)"),
                ", descreva o problema e anexe foto quando o item pedir. Seu preenchimento \u00E9 salvo automaticamente neste aparelho."),
            (modoOcorrenciaAgendamento ? (grupoOcorrencia ? [grupoOcorrencia] : []) : grupos).map(g => React.createElement(React.Fragment, { key: g },
                React.createElement("h3", { style: { margin: '6px 2px 0' } }, g),
                perguntasExibidas.filter(p => p.grupo === g).map(p => {
                    const r = resps[p.id] || {};
                    return (React.createElement("div", { className: "card perg", key: p.id },
                        React.createElement("div", { className: "txt" },
                            p.texto,
                            " ",
                            !modoOcorrenciaAgendamento && p.obrigatoria && React.createElement("span", { style: { color: 'var(--erro)' } }, "*")),
                        React.createElement("div", { className: "resp-btns" },
                            React.createElement("button", { className: 'resp-btn c' + (r.resp === 'C' ? ' on' : ''), onClick: () => setResp(p.id, 'resp', 'C') }, "Conforme"),
                            React.createElement("button", { className: 'resp-btn nc' + (r.resp === 'NC' ? ' on' : ''), onClick: () => setResp(p.id, 'resp', 'NC') }, "N\u00E3o conforme"),
                            React.createElement("button", { className: 'resp-btn na' + (r.resp === 'NA' ? ' on' : ''), onClick: () => setResp(p.id, 'resp', 'NA') }, "N/A")),
                        r.resp === 'NC' && React.createElement("div", { style: { marginTop: 10 } },
                            React.createElement("textarea", { rows: "2", placeholder: "Descreva o problema...", value: r.obs || '', onChange: e => setResp(p.id, 'obs', e.target.value) }),
                            React.createElement("div", { className: "row", style: { marginTop: 8 } },
                                r.foto && React.createElement(React.Fragment, null,
                                    React.createElement("img", { className: "foto-thumb", src: r.foto, alt: "Foto da n\u00E3o conformidade" }),
                                    React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => removerFoto(p.id), "aria-label": "Remover foto" }, "\u2715 Remover")),
                                React.createElement("button", { className: "foto-add", onClick: () => fileRefs.current[p.id] && fileRefs.current[p.id].click(), "aria-label": "Anexar foto" }, "\uD83D\uDCF7"),
                                React.createElement("input", { type: "file", accept: "image/*", capture: "environment", style: { display: 'none' }, ref: el => fileRefs.current[p.id] = el, onChange: e => anexar(p.id, e) }),
                                React.createElement("span", { className: "muted" }, p.fotoNC ? 'Foto obrigatória' : 'Foto opcional')))));
                }))),
            enviando && React.createElement("div", { className: "aviso-box" },
                React.createElement("b", null, "Enviando checklist..."),
                " N\u00E3o feche esta p\u00E1gina."),
            React.createElement("div", { className: "row" },
                React.createElement("button", { className: "btn btn-g grow", disabled: enviando, onClick: cancelar }, "Cancelar"),
                React.createElement("button", { className: "btn btn-p grow", disabled: enviando, style: enviando ? { opacity: .6 } : {}, onClick: enviar }, enviando ? 'Enviando...' : 'Enviar check list'))),
        !preenchendo && meus.length > 0 && React.createElement(React.Fragment, null,
            React.createElement("div", { className: "row", style: { marginTop: 4, flexWrap: 'wrap' } },
                React.createElement("h3", { className: "grow", style: { margin: 0 } }, "Hist\u00F3rico"),
                React.createElement("input", { type: "month", "aria-label": "Filtrar hist\u00F3rico por m\u00EAs", style: { width: 'auto' }, value: filtroMesHistorico, onChange: e => setFiltroMesHistorico(e.target.value) }),
                React.createElement("select", { "aria-label": "Filtrar hist\u00F3rico por status", style: { width: 'auto' }, value: filtroStatusHistorico, onChange: e => setFiltroStatusHistorico(e.target.value) },
                    React.createElement("option", { value: "todos" }, "Todos os status"),
                    React.createElement("option", { value: "pendente" }, "Aguardando an\u00E1lise"),
                    React.createElement("option", { value: "aprovado" }, "Aprovados"),
                    React.createElement("option", { value: "reprovado" }, "Reprovados")),
                React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => { setFiltroMesHistorico(mesAtualFiltro); setFiltroStatusHistorico('todos'); } }, "Limpar filtros")),
            historicoFiltrado.length === 0 && React.createElement("div", { className: "card muted" }, "Nenhum checklist encontrado nos filtros selecionados."),
            historicoFiltrado.map(c => React.createElement("div", { className: "card row", key: c.id },
                React.createElement("div", { className: "grow" },
                    React.createElement("b", null, dataBR(c.data)),
                    React.createElement("div", { className: "muted" },
                        c.placa,
                        " \u00B7 ",
                        c.respostas.filter(r => r.resp === 'NC').length,
                        " NC")),
                React.createElement(StatusTag, { s: c.status }),
                React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => setVer(c) }, "Ver")))),
        ver && React.createElement(ChecklistDetalhe, { ck: ver, perguntas: perguntasAtivas, permitirImpressao: false, onClose: () => setVer(null) })));
}
function ChecklistDetalhe({ ck, perguntas, onClose, acoes, permitirImpressao = true }) {
    const [fotoAberta, setFotoAberta] = useState(null);
    const escHtml = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const escAttr = escHtml;
    const imprimir = () => {
        const statusTexto = ck.status === 'aprovado' ? 'Aprovado' : ck.status === 'reprovado' ? 'Reprovado' : 'Aguardando análise';
        const linhas = ck.respostas.map(r => {
            const p = perguntas.find(x => x.id === r.pid);
            const textoPergunta = p?.texto || r.pergunta || 'Pergunta sem descrição';
            const resposta = r.resp === 'C' ? 'Conforme' : r.resp === 'NC' ? 'Não conforme' : 'N/A';
            return `<section class="item"><div class="item-top"><strong>${escHtml(textoPergunta)}</strong><span class="resp ${r.resp}">${resposta}</span></div>${r.obs ? `<div class="obs"><b>Observação:</b> ${escHtml(r.obs)}</div>` : ''}${r.foto ? `<img src="${escAttr(r.foto)}" alt="Foto da não conformidade">` : ''}</section>`;
        }).join('');
        const w = window.open('', '_blank', 'width=900,height=700');
        if (!w) {
            alert('O navegador bloqueou a janela de impressão. Permita pop-ups para este site.');
            return;
        }
        w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Checklist ${escHtml(ck.placa || '')}</title><style>
      @page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#20231f;margin:0;font-size:11px}.cab{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #234b3b;padding-bottom:10px;margin-bottom:12px}.marca{color:#234b3b;font-size:18px;font-weight:700}.titulo{font-size:20px;margin:0 0 4px}.status{display:inline-block;border:1px solid #bbb;border-radius:5px;padding:4px 8px;font-weight:bold}.dados{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;border:1px solid #d8dcd8;border-radius:7px;padding:10px;margin-bottom:12px}.dados div span{display:block;color:#68716b;font-size:9px;text-transform:uppercase;margin-bottom:2px}.item{border:1px solid #d8dcd8;border-radius:6px;padding:9px;margin-bottom:7px;break-inside:avoid;page-break-inside:avoid}.item-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.resp{white-space:nowrap;border-radius:10px;padding:3px 7px;font-size:9px;font-weight:bold}.resp.C{background:#dff1e7;color:#215a40}.resp.NC{background:#fde5dc;color:#9b3b20}.resp.NA{background:#eee;color:#555}.obs{margin-top:6px;color:#4d554f}.item img{display:block;max-width:100%;max-height:95mm;object-fit:contain;margin-top:8px;border:1px solid #ddd;border-radius:5px}.motivo{border:1px solid #e7a08c;background:#fff4ef;padding:9px;border-radius:6px;margin-bottom:12px}.assinaturas{display:grid;grid-template-columns:1fr 1fr;gap:35px;margin-top:24px;break-inside:avoid}.linha{border-top:1px solid #333;padding-top:5px;color:#555}.rodape{border-top:1px solid #ddd;margin-top:18px;padding-top:6px;color:#777;font-size:9px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body><header class="cab"><div><h1 class="titulo">Registro de Checklist</h1><div>Inspeção veicular</div></div><div class="marca">Bocchi Agrobios</div></header><div class="dados"><div><span>Motorista</span><b>${escHtml(ck.motorista || '—')}</b></div><div><span>Placa</span><b>${escHtml(ck.placa || '—')}</b></div><div><span>Data</span><b>${dataBR(ck.data)}</b></div><div><span>Tipo de frota</span><b>${ck.frota === 'leve' ? 'Frota leve' : 'Frota pesada'}</b></div><div><span>Status</span><b>${statusTexto}</b></div><div><span>Protocolo</span><b>${escHtml(ck.id || '—')}</b></div>${ck.frota === 'leve' ? `<div><span>Quilometragem</span><b>${escHtml(ck.km || '—')}</b></div>` : ''}</div>${ck.status === 'reprovado' && ck.motivoReprova ? `<div class="motivo"><b>Motivo da reprovação:</b> ${escHtml(ck.motivoReprova)}</div>` : ''}${linhas}<div class="assinaturas"><div class="linha">Motorista — nome/data</div><div class="linha">Responsável pela análise — nome/data</div></div><footer class="rodape">Documento gerado pelo Sistema de Gestão de Frota · ${new Date().toLocaleString('pt-BR')}</footer><script>window.onload=()=>setTimeout(()=>window.print(),350)<\/script></body></html>`);
        w.document.close();
    };
    return (React.createElement(Modal, { titulo: 'Check list — ' + dataBR(ck.data), onClose: onClose },
        permitirImpressao && React.createElement("div", { className: "row", style: { justifyContent: 'flex-end', marginBottom: 10 } },
            React.createElement("button", { className: "btn btn-s btn-sm", onClick: imprimir }, "\uD83D\uDDA8 Imprimir")),
        React.createElement("div", { className: "muted", style: { marginBottom: 10 } },
            primeiroNome(ck.motorista),
            " \u00B7 ",
            ck.placa,
            " \u00B7 ",
            ck.frota === 'leve' ? 'Frota leve' : 'Frota pesada',
            " \u00B7 ",
            React.createElement(StatusTag, { s: ck.status })),
        ck.frota === 'leve' && (ck.km || ck.combustivel) &&
            React.createElement("div", { className: "muted", style: { marginBottom: 10 } },
                "KM: ",
                React.createElement("b", { className: "num" }, ck.km || '—'),
                " \u00B7 Combust\u00EDvel: ",
                React.createElement("b", null, ck.combustivel || '—')),
        ck.status === 'reprovado' && ck.motivoReprova && React.createElement("div", { className: "erro-box", style: { marginBottom: 10 } },
            "Motivo da reprova\u00E7\u00E3o: ",
            ck.motivoReprova),
        ck.respostas.map(r => {
            const p = perguntas.find(x => x.id === r.pid);
            const textoPergunta = p?.texto || r.pergunta || 'Pergunta sem descrição';
            return (React.createElement("div", { key: r.pid, style: { padding: '8px 0', borderBottom: '1px solid var(--linha)' } },
                React.createElement("div", { className: "row" },
                    React.createElement("span", { className: "grow", style: { fontSize: 13.5 } }, textoPergunta),
                    React.createElement("span", { className: 'tag ' + (r.resp === 'C' ? 'tag-ok' : r.resp === 'NC' ? 'tag-neg' : 'tag-neutro') }, r.resp === 'C' ? 'Conforme' : r.resp === 'NC' ? 'NC' : 'N/A')),
                r.obs && React.createElement("div", { className: "muted", style: { marginTop: 4 } }, r.obs),
                r.foto && React.createElement("img", { className: "foto-thumb foto-clicavel", style: { marginTop: 6, width: 110, height: 110 }, src: r.foto, alt: "Foto anexada \u2014 clique para ampliar", title: "Clique para ampliar", onClick: () => setFotoAberta(r.foto) })));
        }),
        acoes && React.createElement("div", { style: { marginTop: 14 } }, acoes),
        fotoAberta && React.createElement("div", { className: "visualizador-foto", onClick: e => { if (e.target === e.currentTarget)
                setFotoAberta(null); } },
            React.createElement("img", { src: fotoAberta, alt: "Foto ampliada do checklist" }),
            React.createElement("div", { className: "visualizador-foto-acoes" },
                React.createElement("a", { className: "btn btn-p", href: fotoAberta, download: 'checklist-' + (ck.placa || 'foto') + '.jpg', target: "_blank", rel: "noopener" }, "\u2B07 Baixar foto"),
                React.createElement("a", { className: "btn btn-s", href: fotoAberta, target: "_blank", rel: "noopener" }, "Abrir original"),
                React.createElement("button", { className: "btn btn-g", onClick: () => setFotoAberta(null) }, "Fechar")))));
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
        if (!window.confirm('Confirma o envio da ocorrência da placa ' + form.placa + '? A Logística será notificada.'))
            return;
        setEnviando(true);
        try {
            const r = await ApiService.criarSinistro({ ...form, arquivos });
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
                registroAberto.solicitacoesDocumentos.map(doc => { const chave = normalizarPerfil(doc.statusDocumento); const podeEnviar = normalizarPerfil(registroAberto.statusSinistro) === 'AGUARDANDO_DOCUMENTOS' && ['PENDENTE_DE_ENVIO', 'REJEITADO'].includes(chave); const dados = complementos[doc.id] || {}; return React.createElement("div", { className: 'sinistro-documento-item ' + (chave === 'REJEITADO' ? 'rejeitado' : chave === 'PENDENTE_DE_ENVIO' ? 'pendente' : chave === 'ENVIADO' ? 'enviado' : chave === 'ACEITO' ? 'aceito' : 'dispensado'), key: doc.id },
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
/* ================= AGENDAMENTOS: COMPONENTES ================= */
const AG_STATUS_LABEL = { AGENDADO: 'Agendado', AGUARDANDO_RETIRADA: 'Aguardando retirada', EM_USO: 'Em uso', PENDENTE_FINALIZACAO: 'Pendente finalização', DEVOLUCAO_ATRASADA: 'Devolução atrasada', BLOQUEADO_NC: 'Bloqueado por NC', PENDENTE_ANALISE: 'Pendente análise', FINALIZADO: 'Finalizado', CANCELADO: 'Cancelado' };
const fmtDataHora = v => v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
function AgendaStatus({ status }) { return React.createElement("span", { className: 'agenda-status ' + status }, AG_STATUS_LABEL[status] || status); }
const AGENDA_CORES = [
    { b: '#1F7A55', f: '#E7F4ED', t: '#154C38' },
    { b: '#376FA6', f: '#EAF2FA', t: '#244E78' },
    { b: '#7A56A1', f: '#F1EBF7', t: '#51386E' },
    { b: '#C06A2B', f: '#FAEEE5', t: '#7D421A' },
    { b: '#A54657', f: '#F8E9EC', t: '#6F2D3A' },
    { b: '#547A27', f: '#EEF5E6', t: '#38521B' },
    { b: '#287C83', f: '#E7F4F5', t: '#1C555A' },
    { b: '#9B7622', f: '#F7F0DE', t: '#684F16' }
];
function corAgendaVeiculo(placa) {
    const chave = String(placa || 'SEM_PLACA').toUpperCase();
    let hash = 0;
    for (let i = 0; i < chave.length; i++)
        hash = ((hash * 31) + chave.charCodeAt(i)) >>> 0;
    return AGENDA_CORES[hash % AGENDA_CORES.length];
}
function CalendarioAgenda({ mes, eventos, onAbrir, onSelecionarDia, diaSelecionado = null }) {
    const ano = mes.getFullYear(), m = mes.getMonth(), primeiro = new Date(ano, m, 1), offset = (primeiro.getDay() + 6) % 7, inicio = new Date(ano, m, 1 - offset);
    const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const isoSelecionado = diaSelecionado ? isoLocal(diaSelecionado) : '';
    const dias = [];
    for (let i = 0; i < 42; i++) {
        const d = new Date(inicio);
        d.setDate(inicio.getDate() + i);
        const iso = isoLocal(d);
        dias.push({ d, iso, eventos: eventos.filter(e => String(e.saidaPrevista).slice(0, 10) === iso) });
    }
    return React.createElement("div", { className: "agenda-cal" },
        ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'].map(x => React.createElement("div", { className: "agenda-semana", key: x }, x)),
        dias.map(({ d, iso, eventos: ev }) => React.createElement("div", { className: 'agenda-dia' + (d.getMonth() !== m ? ' off' : '') + (iso === isoSelecionado ? ' selecionado' : ''), key: iso, role: onSelecionarDia ? 'button' : undefined, onClick: () => onSelecionarDia && onSelecionarDia(new Date(d)) },
            React.createElement("b", null, d.getDate()),
            ev.slice(0, 3).map(e => { const c = corAgendaVeiculo(e.placa); return React.createElement("button", { className: "agenda-evento", style: { borderLeftColor: c.b, background: c.f, color: c.t }, key: e.id, onClick: clique => { clique.stopPropagation(); onAbrir(e); } },
                React.createElement("b", null,
                    fmtDataHora(e.saidaPrevista).slice(-5),
                    " \u00B7 ",
                    e.placa || 'Veículo'),
                React.createElement("br", null),
                e.destino); }),
            ev.length > 3 && React.createElement("div", { className: "muted" },
                "+",
                ev.length - 3))));
}
function FormAgendamento({ base, item, onClose, onSalvo, toast, admin = false, dataInicial = null }) {
    const agora = new Date(), pad = n => String(n).padStart(2, '0'), local = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const dataSelecionada = (!item && dataInicial instanceof Date && Number.isFinite(dataInicial.getTime())) ? new Date(dataInicial.getFullYear(), dataInicial.getMonth(), dataInicial.getDate(), agora.getHours(), agora.getMinutes()) : agora;
    const dataBase = dataSelecionada < agora ? agora : dataSelecionada;
    const retorno = new Date(dataBase.getTime() + 2 * 3600000);
    const minimoSaida = local(agora);
    const [form, setForm] = useState({ veiculoId: item?.veiculoId || '', motorista: item?.motorista || '', origem: item?.origem || '', destino: item?.destino || '', saidaPrevista: item?.saidaPrevista ? local(new Date(item.saidaPrevista)) : local(dataBase), retornoPrevisto: item?.retornoPrevisto ? local(new Date(item.retornoPrevisto)) : local(retorno), possuiPassageiros: item?.possuiPassageiros || false, quantidadePassageiros: item?.quantidadePassageiros || 0, observacao: item?.observacao || '', criadoManualmente: admin });
    const [salvando, setSalvando] = useState(false);
    const salvar = async () => { if (!form.veiculoId || !form.motorista.trim() || !form.origem.trim() || !form.destino.trim()) {
        toast('Informe veículo, motorista, origem e destino.');
        return;
    } const saidaLocal = new Date(form.saidaPrevista), retornoLocal = new Date(form.retornoPrevisto); if (!Number.isFinite(saidaLocal.getTime()) || !Number.isFinite(retornoLocal.getTime())) {
        toast('Informe datas e horários válidos.');
        return;
    } const agoraValidacao = new Date(); agoraValidacao.setSeconds(0, 0); if (saidaLocal < agoraValidacao) {
        toast('Não é permitido agendar veículo com saída em data ou horário anterior ao atual.');
        return;
    } if (retornoLocal <= saidaLocal) {
        toast('O retorno deve ser posterior à saída.');
        return;
    } const payload = { ...form, saidaPrevista: saidaLocal.toISOString(), retornoPrevisto: retornoLocal.toISOString() }; setSalvando(true); try {
        if (item)
            await ApiService.alterarAgendamento(item.id, payload);
        else
            await ApiService.criarAgendamento(payload);
        toast(item ? 'Agendamento alterado.' : 'Agendamento criado.');
        await onSalvo();
        onClose();
    }
    catch (e) {
        toast(e.message);
    }
    finally {
        setSalvando(false);
    } };
    return React.createElement(Modal, { titulo: item ? 'Alterar agendamento' : 'Novo agendamento', onClose: onClose, large: true },
        React.createElement("div", { className: "agenda-modal-grid" },
            React.createElement("div", null,
                React.createElement("label", { htmlFor: "form-agendamento-saida-prevista" }, "Sa\u00EDda prevista"),
                React.createElement("input", { id: "form-agendamento-saida-prevista", name: "form-agendamento-saida-prevista", autoComplete: "off", type: "datetime-local", min: minimoSaida, value: form.saidaPrevista, onChange: e => setForm({ ...form, saidaPrevista: e.target.value }) }),
                React.createElement("div", { className: "muted", style: { marginTop: 4 } }, "N\u00E3o \u00E9 permitido selecionar data/hor\u00E1rio anterior ao atual.")),
            React.createElement("div", null,
                React.createElement("label", { htmlFor: "form-agendamento-retorno-previsto" }, "Retorno previsto"),
                React.createElement("input", { id: "form-agendamento-retorno-previsto", name: "form-agendamento-retorno-previsto", autoComplete: "off", type: "datetime-local", min: form.saidaPrevista || minimoSaida, value: form.retornoPrevisto, onChange: e => setForm({ ...form, retornoPrevisto: e.target.value }) })),
            React.createElement("div", null,
                React.createElement("label", { htmlFor: "form-agendamento-veiculo-compartilhado" }, "Ve\u00EDculo compartilhado"),
                React.createElement("select", { id: "form-agendamento-veiculo-compartilhado", name: "form-agendamento-veiculo-compartilhado", value: form.veiculoId, onChange: e => setForm({ ...form, veiculoId: e.target.value }) },
                    React.createElement("option", { value: "" }, "Selecionar..."),
                    base.veiculos.map(v => React.createElement("option", { key: v.id, value: v.id },
                        v.placa,
                        " \u2014 ",
                        v.modelo || v.tipoModelo || 'Sem modelo')))),
            React.createElement("div", null,
                React.createElement("label", { htmlFor: "form-agendamento-motorista" }, "Motorista"),
                React.createElement("input", { id: "form-agendamento-motorista", name: "form-agendamento-motorista", autoComplete: "off", value: form.motorista, onChange: e => setForm({ ...form, motorista: e.target.value }) })),
            React.createElement("div", null,
                React.createElement("label", { htmlFor: "form-agendamento-origem" }, "Origem"),
                React.createElement("input", { id: "form-agendamento-origem", name: "form-agendamento-origem", autoComplete: "off", value: form.origem, onChange: e => setForm({ ...form, origem: e.target.value }) })),
            React.createElement("div", null,
                React.createElement("label", { htmlFor: "form-agendamento-destino" }, "Destino"),
                React.createElement("input", { id: "form-agendamento-destino", name: "form-agendamento-destino", autoComplete: "off", value: form.destino, onChange: e => setForm({ ...form, destino: e.target.value }) })),
            React.createElement("div", null,
                React.createElement("label", { htmlFor: "form-agendamento-possui-passageiros" }, "Possui passageiros?"),
                React.createElement("select", { id: "form-agendamento-possui-passageiros", name: "form-agendamento-possui-passageiros", value: form.possuiPassageiros ? 'sim' : 'nao', onChange: e => setForm({ ...form, possuiPassageiros: e.target.value === 'sim', quantidadePassageiros: e.target.value === 'sim' ? form.quantidadePassageiros : 0 }) },
                    React.createElement("option", { value: "nao" }, "N\u00E3o"),
                    React.createElement("option", { value: "sim" }, "Sim"))),
            form.possuiPassageiros && React.createElement("div", null,
                React.createElement("label", { htmlFor: "form-agendamento-quantidade" }, "Quantidade"),
                React.createElement("input", { id: "form-agendamento-quantidade", name: "form-agendamento-quantidade", autoComplete: "off", type: "number", min: "1", value: form.quantidadePassageiros, onChange: e => setForm({ ...form, quantidadePassageiros: Number(e.target.value) }) })),
            React.createElement("div", { style: { gridColumn: '1/-1' } },
                React.createElement("label", { htmlFor: "form-agendamento-observacao" }, "Observa\u00E7\u00E3o"),
                React.createElement("textarea", { id: "form-agendamento-observacao", name: "form-agendamento-observacao", rows: "3", value: form.observacao, onChange: e => setForm({ ...form, observacao: e.target.value }) }))),
        React.createElement("div", { className: "agenda-acoes", style: { marginTop: 14 } },
            React.createElement("button", { className: "btn btn-g", onClick: onClose }, "Voltar"),
            React.createElement("button", { className: "btn btn-p", disabled: salvando, onClick: salvar }, salvando ? 'Salvando...' : 'Validar e salvar')));
}
function DetalheAgendamento({ item, admin, onClose, onAtualizar, toast, onAbrirChecklist, parametros = {} }) {
    const [acao, setAcao] = useState(''), [km, setKm] = useState(''), [motivo, setMotivo] = useState(''), [obs, setObs] = useState(''), [problema, setProblema] = useState(false), [salvando, setSalvando] = useState(false), [avisoRetirada, setAvisoRetirada] = useState(false);
    const kmReferencia = Number(item.kmMinimoRetirada || 0);
    const regularizacaoTerceiro = item.regularizacaoTerceiro === true;
    const somenteLeitura = !admin && item.meuAgendamento === false && !regularizacaoTerceiro;
    const janelaRetiradaMinutos = Math.max(0, Number(parametros?.janelaRetiradaMinutos || 0));
    const inicioPrevistoRetirada = new Date(item.saidaPrevista || 0);
    const liberaRetiradaEm = Number.isFinite(inicioPrevistoRetirada.getTime()) ? new Date(inicioPrevistoRetirada.getTime() - janelaRetiradaMinutos * 60000) : null;
    const retiradaLiberada = admin || !liberaRetiradaEm || Date.now() >= liberaRetiradaEm.getTime();
    const textoLiberacaoRetirada = liberaRetiradaEm ? liberaRetiradaEm.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const executar = async () => { if (acao === 'retirar' && kmReferencia && Number(km) < kmReferencia) {
        toast(`KM inicial não pode ser menor que o último KM final registrado da placa (${kmReferencia}).`);
        return;
    } setSalvando(true); try {
        let resposta = null;
        if (acao === 'cancelar')
            resposta = await ApiService.cancelarAgendamento(item.id, motivo, obs);
        if (acao === 'retirar')
            resposta = await ApiService.retirarAgendamento(item.id, { kmInicial: Number(km), possuiNC: problema, dataHora: new Date().toISOString() });
        if (acao === 'finalizar')
            resposta = await ApiService.finalizarAgendamento(item.id, { kmFinal: Number(km), possuiProblema: problema, dataHora: new Date().toISOString(), regularizacaoTerceiro });
        if (acao === 'corrigir')
            resposta = await ApiService.admCorrigirKmAgendamento(item.id, { kmInicial: Number(km), kmFinal: Number(obs || 0), motivo });
        toast(resposta?.mensagem || 'Ação concluída.');
        await onAtualizar();
        onClose();
        if (resposta?.abrirChecklist && onAbrirChecklist)
            onAbrirChecklist({ placa: resposta.placa || item.placa, agendamentoId: resposta.agendamentoId || item.id, etapa: resposta.etapa || acao, km: Number(resposta.km || km || 0), modoChecklist: resposta.modoChecklist || '', ultimoChecklist: resposta.ultimoChecklist || null, regularizacaoTerceiro: resposta.regularizacaoTerceiro === true || regularizacaoTerceiro });
    }
    catch (e) {
        toast(e.message);
    }
    finally {
        setSalvando(false);
    } };
    if (avisoRetirada && !admin)
        return React.createElement(Modal, { titulo: "Orienta\u00E7\u00F5es antes da retirada", onClose: () => setAvisoRetirada(false) },
            React.createElement("div", { className: "orientacao-retirada" },
                React.createElement("div", { className: "orientacao-alerta" },
                    React.createElement("b", null, "\uD83C\uDD98 ATEN\u00C7\u00C3O"),
                    React.createElement("span", null,
                        "Em caso de acidente ou sinistro, use imediatamente o m\u00F3dulo ",
                        React.createElement("strong", null, "Sinistro"),
                        ".")),
                React.createElement("div", { className: "orientacao-bloco" },
                    React.createElement("b", null, "\u26A0\uFE0F Diretrizes de condu\u00E7\u00E3o segura"),
                    React.createElement("div", { className: "orientacao-lista" },
                        React.createElement("span", null, "\u2022 Respeite a sinaliza\u00E7\u00E3o e o limite de velocidade da via."),
                        React.createElement("span", null,
                            "\u2022 ",
                            React.createElement("strong", null, "Nunca ultrapasse 120 km/h.")),
                        React.createElement("span", null, "\u2022 Ultrapasse somente onde for permitido e seguro."),
                        React.createElement("span", null,
                            "\u2022 ",
                            React.createElement("strong", null, "N\u00E3o use ou manuseie o celular dirigindo;"),
                            " pare em local seguro."),
                        React.createElement("span", null, "\u2022 Cinto de seguran\u00E7a obrigat\u00F3rio para todos os ocupantes."),
                        React.createElement("span", null, "\u2022 Conduza de forma preventiva e sem manobras de risco."))),
                React.createElement("div", { className: "orientacao-bloco orientacao-veiculo" },
                    React.createElement("b", null, "\uD83E\uDD33\uD83C\uDFFB Condi\u00E7\u00E3o do ve\u00EDculo"),
                    React.createElement("span", null,
                        "Registre qualquer avaria, n\u00E3o conformidade ou condi\u00E7\u00E3o anormal no ",
                        React.createElement("strong", null, "Checklist"),
                        ".")),
                React.createElement("button", { className: "btn btn-p orientacao-ciente", onClick: () => { setAvisoRetirada(false); setKm(String(kmReferencia || item.kmInicial || '')); setAcao('retirar'); } }, "Li e estou ciente \u2014 Continuar retirada")));
    const aguardando = ['AGENDADO', 'AGUARDANDO_RETIRADA'].includes(item.status), emUso = ['EM_USO', 'DEVOLUCAO_ATRASADA', 'PENDENTE_FINALIZACAO'].includes(item.status);
    const linhasDetalhe = aguardando
        ? [['Veículo', item.placa], ['Motorista', item.motorista], ['Previsto', fmtDataHora(item.saidaPrevista) + ' até ' + fmtDataHora(item.retornoPrevisto)], ['Real', fmtDataHora(item.saidaReal) + ' até ' + fmtDataHora(item.retornoReal)], ['Último KM registrado', kmReferencia || '—']]
        : [['Veículo', item.placa], ['Motorista', item.motorista], ['Previsto', fmtDataHora(item.saidaPrevista) + ' até ' + fmtDataHora(item.retornoPrevisto)], ['Real', fmtDataHora(item.saidaReal) + ' até ' + fmtDataHora(item.retornoReal)], ['KM', `${item.kmInicial || '—'} → ${item.kmFinal || '—'}`]];
    return React.createElement(Modal, { titulo: `${item.origem} → ${item.destino}`, onClose: onClose },
        React.createElement("div", { className: "row" },
            React.createElement(AgendaStatus, { status: item.status }),
            React.createElement("span", { className: "muted" }, item.codigo)),
        React.createElement("div", { className: "divider" }),
        linhasDetalhe.map(([l, v]) => React.createElement("div", { className: "linha-item", key: l },
            React.createElement("b", null, l),
            React.createElement("span", null, v))),
        !acao && React.createElement("div", { className: "agenda-acoes", style: { marginTop: 14 } },
            somenteLeitura && React.createElement("div", { className: "aviso-box", style: { width: '100%' } },
                "Somente consulta. Este agendamento pertence a ",
                item.motorista || 'outro motorista',
                "."),
            !somenteLeitura && !regularizacaoTerceiro && aguardando && React.createElement(React.Fragment, null,
                React.createElement("button", { className: "btn btn-d", onClick: () => setAcao('cancelar') }, "Cancelar agendamento"),
                React.createElement("button", { className: "btn btn-p", disabled: !retiradaLiberada, onClick: () => { if (!retiradaLiberada)
                        return; admin ? (setKm(String(kmReferencia || item.kmInicial || '')), setAcao('retirar')) : setAvisoRetirada(true); } }, admin ? 'Retirar manualmente' : retiradaLiberada ? 'Retirar veículo' : 'Retirada ainda não liberada'),
                !admin && !retiradaLiberada && React.createElement("div", { className: "muted", style: { width: '100%', fontSize: 12, textAlign: 'right' } },
                    "Dispon\u00EDvel a partir de ",
                    textoLiberacaoRetirada)),
            regularizacaoTerceiro && emUso && React.createElement(React.Fragment, null,
                React.createElement("div", { className: "aviso-box", style: { width: '100%' } },
                    "Este ve\u00EDculo possui uma devolu\u00E7\u00E3o anterior ainda aberta por ",
                    item.motorista || 'outro motorista',
                    ". Informe a condi\u00E7\u00E3o atual do ve\u00EDculo para liberar sua retirada."),
                React.createElement("button", { className: "btn btn-p", onClick: () => { setKm(String(item.kmFinal || '')); setProblema(item.status === 'PENDENTE_FINALIZACAO'); setAcao('finalizar'); } }, "Regularizar devolu\u00E7\u00E3o anterior")),
            admin && item.status === 'EM_USO' && React.createElement(React.Fragment, null,
                React.createElement("button", { className: "btn btn-s", onClick: () => { setKm(item.kmInicial || ''); setObs(item.kmFinal || ''); setAcao('corrigir'); } }, "Corrigir KM"),
                React.createElement("button", { className: "btn btn-d", onClick: () => setAcao('cancelar') }, "Cancelar agendamento"),
                React.createElement("button", { className: "btn btn-p", onClick: () => setAcao('finalizar') }, "Finalizar manualmente")),
            admin && item.status === 'DEVOLUCAO_ATRASADA' && React.createElement(React.Fragment, null,
                React.createElement("button", { className: "btn btn-s", onClick: () => { setKm(item.kmInicial || ''); setObs(item.kmFinal || ''); setAcao('corrigir'); } }, "Corrigir KM"),
                React.createElement("button", { className: "btn btn-p", onClick: () => setAcao('finalizar') }, "Finalizar manualmente")),
            admin && item.status === 'PENDENTE_FINALIZACAO' && React.createElement(React.Fragment, null,
                React.createElement("button", { className: "btn btn-s", onClick: () => { setKm(item.kmInicial || ''); setObs(item.kmFinal || ''); setAcao('corrigir'); } }, "Corrigir KM"),
                React.createElement("button", { className: "btn btn-p", onClick: () => setAcao('finalizar') }, "Concluir finaliza\u00E7\u00E3o")),
            !admin && !somenteLeitura && !regularizacaoTerceiro && emUso && React.createElement("button", { className: "btn btn-p", onClick: () => setAcao('finalizar') }, item.status === 'PENDENTE_FINALIZACAO' ? 'Concluir devolução' : 'Devolver veículo'),
            admin && item.status === 'FINALIZADO' && React.createElement("button", { className: "btn btn-s", onClick: () => { setKm(item.kmInicial || ''); setObs(item.kmFinal || ''); setAcao('corrigir'); } }, "Corrigir KM")),
        acao && React.createElement("div", { style: { marginTop: 14 } },
            acao === 'cancelar' ? React.createElement(React.Fragment, null,
                React.createElement("label", { htmlFor: "detalhe-agendamento-motivo-obrigatorio" }, "Motivo obrigat\u00F3rio"),
                React.createElement("select", { id: "detalhe-agendamento-motivo-obrigatorio", name: "detalhe-agendamento-motivo-obrigatorio", value: motivo, onChange: e => setMotivo(e.target.value) },
                    React.createElement("option", { value: "" }, "Selecionar..."),
                    ['VIAGEM_CANCELADA', 'ALTERACAO_PROGRAMACAO', 'VEICULO_NAO_NECESSARIO', 'MOTORISTA_INDISPONIVEL', 'VEICULO_INDISPONIVEL', 'ERRO_AGENDAMENTO', 'DUPLICIDADE', 'OUTRO'].map(x => React.createElement("option", { key: x }, x))),
                React.createElement("label", { style: { marginTop: 8 }, htmlFor: "detalhe-agendamento-observacao" }, "Observa\u00E7\u00E3o"),
                React.createElement("textarea", { id: "detalhe-agendamento-observacao", name: "detalhe-agendamento-observacao", value: obs, onChange: e => setObs(e.target.value) })) : React.createElement(React.Fragment, null,
                React.createElement("label", null, acao === 'finalizar' ? (regularizacaoTerceiro ? 'KM atual / final da devolução anterior' : 'KM final') : 'KM inicial'),
                React.createElement("input", { type: "number", min: acao === 'retirar' && kmReferencia ? kmReferencia : 1, value: km, onChange: e => setKm(e.target.value) }),
                acao === 'retirar' && kmReferencia > 0 && React.createElement("div", { className: "muted", style: { marginTop: 5 } },
                    "\u00DAltimo KM registrado: ",
                    kmReferencia,
                    ". Informe este valor ou um superior."),
                acao === 'corrigir' && React.createElement(React.Fragment, null,
                    React.createElement("label", { style: { marginTop: 8 }, htmlFor: "detalhe-agendamento-km-final-correto" }, "KM final correto"),
                    React.createElement("input", { id: "detalhe-agendamento-km-final-correto", name: "detalhe-agendamento-km-final-correto", autoComplete: "off", type: "number", value: obs, onChange: e => setObs(e.target.value) }),
                    React.createElement("label", { style: { marginTop: 8 }, htmlFor: "detalhe-agendamento-motivo" }, "Motivo"),
                    React.createElement("textarea", { id: "detalhe-agendamento-motivo", name: "detalhe-agendamento-motivo", value: motivo, onChange: e => setMotivo(e.target.value) })),
                acao !== 'corrigir' && React.createElement("div", { style: { marginTop: 8 } },
                    React.createElement("label", null, acao === 'retirar' ? 'Possui alguma NC?' : regularizacaoTerceiro ? 'Há alguma NC na condição atual?' : 'Houve problema?'),
                    regularizacaoTerceiro && item.status === 'PENDENTE_FINALIZACAO' ? React.createElement("div", { className: "aviso-box" }, "Existe uma ocorr\u00EAncia pendente nesta devolu\u00E7\u00E3o. O registro da NC \u00E9 obrigat\u00F3rio para concluir.") : React.createElement("select", { value: problema ? 'sim' : 'nao', onChange: e => setProblema(e.target.value === 'sim') },
                        React.createElement("option", { value: "nao" }, "N\u00E3o"),
                        React.createElement("option", { value: "sim" }, "Sim")))),
            React.createElement("div", { className: "agenda-acoes", style: { marginTop: 12 } },
                React.createElement("button", { className: "btn btn-g", onClick: () => setAcao('') }, "Voltar"),
                React.createElement("button", { className: "btn btn-p", disabled: salvando || acao === 'cancelar' && !motivo, onClick: executar }, "Confirmar"))));
}
function TelaAgendamento({ user, toast, onAbrirChecklist }) {
    const [base, setBase] = useState({ veiculos: [], agendamentos: [], parametros: {} }), [carregando, setCarregando] = useState(true), [mes, setMes] = useState(new Date()), [form, setForm] = useState(false), [detalhe, setDetalhe] = useState(null), [visual, setVisual] = useState('todos'), [veiculoFiltro, setVeiculoFiltro] = useState(''), [modoVisao, setModoVisao] = useState('mes'), [diaSelecionado, setDiaSelecionado] = useState(new Date()), [filtroRapido, setFiltroRapido] = useState('proximo');
    const carregar = async () => { setCarregando(true); try {
        const r = await ApiService.obterAgendamentos();
        setBase({ veiculos: r.veiculos || [], agendamentos: r.agendamentos || [], parametros: r.parametros || {} });
    }
    catch (e) {
        toast(e.message);
    }
    finally {
        setCarregando(false);
    } };
    useEffect(() => { carregar(); }, []);
    const norm = v => String(v || '').trim().toLocaleLowerCase('pt-BR');
    // Agenda compartilhada visível; as ações continuam restritas ao responsável.
    const meus = base.agendamentos.filter(a => a.meuAgendamento === true);
    const eventos = base.agendamentos.filter(a => (visual === 'todos' || a.meuAgendamento === true) && (!veiculoFiltro || String(a.placa) === veiculoFiltro));
    const agora = new Date();
    const janelaRetirada = Number(base.parametros?.janelaRetiradaMinutos || 30);
    const ativos = meus.filter(a => !['FINALIZADO', 'CANCELADO'].includes(a.status));
    const emUso = ativos.filter(a => ['EM_USO', 'DEVOLUCAO_ATRASADA'].includes(a.status)).sort((a, b) => new Date(a.retornoPrevisto || 0) - new Date(b.retornoPrevisto || 0));
    const pendencias = ativos.filter(a => a.status === 'PENDENTE_FINALIZACAO').sort((a, b) => new Date(a.retornoPrevisto || 0) - new Date(b.retornoPrevisto || 0));
    const agendados = ativos.filter(a => ['AGENDADO', 'AGUARDANDO_RETIRADA'].includes(a.status)).sort((a, b) => new Date(a.saidaPrevista || 0) - new Date(b.saidaPrevista || 0));
    // Prioridade operacional: qualquer agendamento cuja janela de retirada já abriu
    // vem antes de um agendamento futuro, mesmo que RetornoPrevisto esteja vazio.
    const liberadosRetirada = agendados.filter(a => {
        const inicio = new Date(a.saidaPrevista || 0);
        return Number.isFinite(inicio.getTime()) && agora >= new Date(inicio.getTime() - janelaRetirada * 60000);
    });
    const agendadosFuturos = agendados.filter(a => {
        const inicio = new Date(a.saidaPrevista || 0);
        return Number.isFinite(inicio.getTime()) && inicio > agora;
    });
    const mesmoVeiculoTela = (a, b) => {
        if (a?.veiculoId && b?.veiculoId && String(a.veiculoId) === String(b.veiculoId))
            return true;
        const pa = String(a?.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase(), pb = String(b?.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
        return Boolean(pa && pb && pa === pb);
    };
    const retiradaPronta = liberadosRetirada[0] || null;
    const bloqueadorRetirada = retiradaPronta ? base.agendamentos
        .filter(a => a.meuAgendamento !== true && String(a.id) !== String(retiradaPronta.id) && mesmoVeiculoTela(a, retiradaPronta) && ['EM_USO', 'DEVOLUCAO_ATRASADA', 'PENDENTE_FINALIZACAO'].includes(a.status))
        .sort((a, b) => new Date(b.saidaReal || b.saidaPrevista || 0) - new Date(a.saidaReal || a.saidaPrevista || 0))[0] || null : null;
    const proxima = pendencias[0] || emUso[0] || (bloqueadorRetirada ? { ...bloqueadorRetirada, regularizacaoTerceiro: true, agendamentoSeguinteId: retiradaPronta.id } : retiradaPronta) || agendadosFuturos[0] || null;
    const configAcao = proxima ? (proxima.regularizacaoTerceiro ? { titulo: 'Regularizar devolução anterior', sub: `${proxima.motorista || 'Outro motorista'} ainda não concluiu a devolução deste veículo. Regularize a condição atual antes da sua retirada.`, botao: 'Regularizar devolução' } :
        proxima.status === 'PENDENTE_FINALIZACAO' ? { titulo: 'Finalizar pendência', sub: 'A devolução possui uma pendência e precisa ser concluída.', botao: 'Concluir devolução' } :
            ['EM_USO', 'DEVOLUCAO_ATRASADA'].includes(proxima.status) ? { titulo: 'Devolver veículo', sub: proxima.status === 'DEVOLUCAO_ATRASADA' ? 'O horário previsto de retorno já passou.' : 'A utilização está aberta e precisa ser encerrada ao retornar.', botao: 'Devolver veículo' } :
                ['AGENDADO', 'AGUARDANDO_RETIRADA'].includes(proxima.status) && agora >= new Date(new Date(proxima.saidaPrevista).getTime() - janelaRetirada * 60000) ? { titulo: 'Retirar veículo', sub: `Seu agendamento começa às ${fmtDataHora(proxima.saidaPrevista).slice(-5)}.`, botao: 'Retirar veículo' } :
                    { titulo: 'Próximo agendamento', sub: `Previsto para ${fmtDataHora(proxima.saidaPrevista)}. A retirada será liberada dentro da janela configurada.`, botao: 'Ver agendamento' }) : null;
    const irHoje = () => { const h = new Date(); setMes(h); setDiaSelecionado(h); };
    const isoDia = d => { const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
    const eventosDia = eventos.filter(a => String(a.saidaPrevista || '').slice(0, 10) === isoDia(diaSelecionado));
    const moverDia = delta => { const d = new Date(diaSelecionado); d.setDate(d.getDate() + delta); setDiaSelecionado(d); setMes(d); };
    const mesmaPlacaLocal = (a, b) => {
        if (a?.veiculoId && b?.veiculoId && String(a.veiculoId) === String(b.veiculoId))
            return true;
        const pa = String(a?.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
        const pb = String(b?.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
        return Boolean(pa && pb && pa === pb);
    };
    const detalheAtual = detalhe ? (() => {
        const refs = base.agendamentos
            .filter(a => String(a.id) !== String(detalhe.id) && Number(a.kmFinal) > 0 && (a.status === 'FINALIZADO' || a.retornoReal) && mesmaPlacaLocal(a, detalhe))
            .map(a => Number(a.kmFinal) || 0);
        const local = refs.length ? Math.max(...refs) : 0;
        return { ...detalhe, kmMinimoRetirada: Math.max(Number(detalhe.kmMinimoRetirada || 0), local) };
    })() : null;
    return React.createElement(React.Fragment, null,
        carregando ? React.createElement("div", { className: "card muted" }, "Carregando agenda...") : React.createElement(React.Fragment, null,
            React.createElement("div", { className: "agenda-top" },
                React.createElement("div", { className: "agenda-filtros" },
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "tela-agendamento-veiculo" }, "Ve\u00EDculo"),
                        React.createElement("select", { id: "tela-agendamento-veiculo", name: "tela-agendamento-veiculo", value: veiculoFiltro, onChange: e => setVeiculoFiltro(e.target.value) },
                            React.createElement("option", { value: "" }, "Todos os ve\u00EDculos"),
                            base.veiculos.map(v => React.createElement("option", { key: v.id, value: v.placa },
                                v.placa,
                                " \u2014 ",
                                v.modelo || v.tipoModelo || 'Sem modelo')))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "tela-agendamento-visualizar" }, "Visualizar"),
                        React.createElement("select", { id: "tela-agendamento-visualizar", name: "tela-agendamento-visualizar", value: visual, onChange: e => setVisual(e.target.value) },
                            React.createElement("option", { value: "todos" }, "Todos os agendamentos"),
                            React.createElement("option", { value: "meus" }, "Meus agendamentos")))),
                React.createElement("div", { className: "agenda-top-nav" },
                    React.createElement("button", { className: "btn btn-sm", style: { color: '#fff' }, onClick: () => { if (modoVisao === 'dia')
                            moverDia(-1);
                        else
                            setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1)); } }, "\u2039"),
                    React.createElement("div", { className: "agenda-top-mes" }, modoVisao === 'dia' ? diaSelecionado.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : (() => { const m = mes.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''); return m.charAt(0).toUpperCase() + m.slice(1) + '/' + String(mes.getFullYear()).slice(-2); })()),
                    React.createElement("button", { className: "btn btn-sm", style: { color: '#fff' }, onClick: () => { if (modoVisao === 'dia')
                            moverDia(1);
                        else
                            setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1)); } }, "\u203A"),
                    React.createElement("div", { className: "agenda-top-spacer" }),
                    React.createElement("button", { className: "btn btn-sm", style: { color: '#fff', border: '1px solid rgba(255,255,255,.35)' }, onClick: irHoje }, "Hoje"),
                    React.createElement("div", { className: "agenda-view-toggle" },
                        React.createElement("button", { className: modoVisao === 'mes' ? 'on' : '', onClick: () => setModoVisao('mes') }, "M\u00EAs"),
                        React.createElement("button", { className: modoVisao === 'dia' ? 'on' : '', onClick: () => setModoVisao('dia') }, "Dia")))),
            configAcao ? React.createElement("div", { className: "agenda-proxima card" },
                React.createElement("div", { className: "kicker" },
                    React.createElement("span", null, "\u25CF"),
                    " Pr\u00F3xima a\u00E7\u00E3o"),
                React.createElement("div", { className: "titulo" }, configAcao.titulo),
                React.createElement("div", { className: "muted", style: { fontSize: 14 } }, configAcao.sub),
                React.createElement("div", { className: "agenda-proxima-grid" },
                    React.createElement("div", { className: "agenda-proxima-info" },
                        React.createElement("b", null, "Ve\u00EDculo"),
                        proxima.placa || '—'),
                    React.createElement("div", { className: "agenda-proxima-info" },
                        React.createElement("b", null, "Trajeto"),
                        proxima.origem,
                        " \u2192 ",
                        proxima.destino),
                    React.createElement("div", { className: "agenda-proxima-info" },
                        React.createElement("b", null, "Hor\u00E1rio"),
                        fmtDataHora(proxima.saidaPrevista).slice(-5),
                        " \u00E0s ",
                        fmtDataHora(proxima.retornoPrevisto).slice(-5)),
                    React.createElement("div", { className: "agenda-proxima-info" },
                        React.createElement("b", null, "Status"),
                        AG_STATUS_LABEL[proxima.status] || proxima.status)),
                React.createElement("button", { className: "btn btn-p", style: { width: '100%', marginTop: 13, fontSize: 16 }, onClick: () => setDetalhe(proxima) }, configAcao.botao)) : React.createElement("div", { className: "card", style: { margin: '14px 0' } },
                React.createElement("b", null, "Nenhuma a\u00E7\u00E3o dispon\u00EDvel agora"),
                React.createElement("div", { className: "muted" }, "Voc\u00EA n\u00E3o possui retirada, devolu\u00E7\u00E3o ou finaliza\u00E7\u00E3o pendente neste momento.")),
            modoVisao === 'mes' ? React.createElement(CalendarioAgenda, { mes: mes, eventos: eventos, onAbrir: setDetalhe, diaSelecionado: diaSelecionado, onSelecionarDia: d => { setDiaSelecionado(d); setMes(d); setModoVisao('dia'); } }) : React.createElement("div", { className: "agenda-dia-lista" },
                React.createElement("div", { className: "card row" },
                    React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => moverDia(-1) }, "\u2039"),
                    React.createElement("b", { className: "grow", style: { textAlign: 'center' } }, diaSelecionado.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })),
                    React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => moverDia(1) }, "\u203A")),
                eventosDia.length ? eventosDia.sort((a, b) => new Date(a.saidaPrevista) - new Date(b.saidaPrevista)).map(e => { const c = corAgendaVeiculo(e.placa); return React.createElement("button", { key: e.id, className: "agenda-dia-card", style: { borderLeftColor: c.b }, onClick: () => setDetalhe(e) },
                    React.createElement("div", { className: "row" },
                        React.createElement("div", { className: "grow" },
                            React.createElement("b", null,
                                "Sa\u00EDda: ",
                                fmtDataHora(e.saidaPrevista).slice(-5),
                                " \u00B7 Retorno: ",
                                fmtDataHora(e.retornoPrevisto).slice(-5),
                                " \u00B7 ",
                                e.placa),
                            React.createElement("div", { className: "muted" },
                                e.origem,
                                " \u2192 ",
                                e.destino)),
                        React.createElement(AgendaStatus, { status: e.status }))); }) : React.createElement("div", { className: "card muted" }, "Nenhum agendamento neste dia.")),
            React.createElement("button", { className: "btn btn-p agenda-fab", onClick: () => setForm(true) }, "+")),
        form && React.createElement(FormAgendamento, { base: base, dataInicial: diaSelecionado, onClose: () => setForm(false), onSalvo: carregar, toast: toast }),
        " ",
        detalheAtual && React.createElement(DetalheAgendamento, { item: detalheAtual, parametros: base.parametros, onClose: () => setDetalhe(null), onAtualizar: carregar, toast: toast, onAbrirChecklist: onAbrirChecklist }));
}
function AdmAgendamentos({ user, toast }) {
    const podeAgenda = pode(user, 'agendamentos.agenda'), podeMonitor = pode(user, 'agendamentos.monitoramento'), podeRel = pode(user, 'agendamentos.relatorio'), podeParam = pode(user, 'agendamentos.parametros');
    const inicial = podeAgenda ? 'agenda' : podeMonitor ? 'monitor' : podeRel ? 'relatorio' : 'parametros';
    const [sub, setSub] = useState(inicial), [base, setBase] = useState({ veiculos: [], agendamentos: [], parametros: {}, diagnosticoVeiculos: {} }), [carregando, setCarregando] = useState(true), [mes, setMes] = useState(new Date()), [detalhe, setDetalhe] = useState(null), [form, setForm] = useState(false), [monitorFiltro, setMonitorFiltro] = useState('AGUARDANDO_RETIRADA'), [fStatus, setFStatus] = useState('TODOS'), [fPlacaRel, setFPlacaRel] = useState('TODAS'), [fDataIniRel, setFDataIniRel] = useState(''), [fDataFimRel, setFDataFimRel] = useState(''), [paramForm, setParamForm] = useState({}), [salvandoParam, setSalvandoParam] = useState(false), [modoVisao, setModoVisao] = useState('mes'), [diaSelecionado, setDiaSelecionado] = useState(new Date());
    const carregar = async () => { setCarregando(true); try {
        const r = await ApiService.admAgendamentos();
        const dados = { veiculos: r.veiculos || [], agendamentos: r.agendamentos || [], parametros: r.parametros || {}, diagnosticoVeiculos: r.diagnosticoVeiculos || {} };
        setBase(dados);
        setParamForm(dados.parametros);
    }
    catch (e) {
        toast(e.message);
    }
    finally {
        setCarregando(false);
    } };
    useEffect(() => { carregar(); }, []);
    const placasRel = [...new Set(base.agendamentos.map(a => a.placa).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const filtrados = base.agendamentos.filter(a => {
        if (fStatus !== 'TODOS' && a.status !== fStatus)
            return false;
        if (fPlacaRel !== 'TODAS' && a.placa !== fPlacaRel)
            return false;
        const data = String(a.saidaPrevista || '').slice(0, 10);
        if (fDataIniRel && data < fDataIniRel)
            return false;
        if (fDataFimRel && data > fDataFimRel)
            return false;
        return true;
    });
    const exportar = () => { const linhas = filtrados.map(a => ({ Codigo: a.codigo, Placa: a.placa, UsuarioAgendou: a.solicitante || '', Modelo: a.modelo || '', Motorista: a.motorista, Origem: a.origem, Destino: a.destino, SaidaPrevista: a.saidaPrevista, RetornoPrevisto: a.retornoPrevisto, SaidaReal: a.saidaReal, RetornoReal: a.retornoReal, KmInicial: a.kmInicial, KmFinal: a.kmFinal, KmRodado: a.kmRodado, Status: AG_STATUS_LABEL[a.status] || a.status, MotivoCancelamento: a.motivoCancelamento })); const ws = XLSX.utils.json_to_sheet(linhas), wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Agendamentos'); XLSX.writeFile(wb, 'Relatorio_Agendamentos.xlsx'); };
    const alterarParam = (campo, valor) => setParamForm(p => ({ ...p, [campo]: valor }));
    const salvarParametros = async () => { setSalvandoParam(true); try {
        const r = await ApiService.salvarParametrosAgendamento(paramForm);
        toast(r.mensagem || 'Parâmetros atualizados.');
        await carregar();
    }
    catch (e) {
        toast(e.message);
    }
    finally {
        setSalvandoParam(false);
    } };
    const SimNao = ({ campo }) => React.createElement("select", { value: paramForm[campo] ? 'sim' : 'nao', onChange: e => alterarParam(campo, e.target.value === 'sim') },
        React.createElement("option", { value: "sim" }, "Sim"),
        React.createElement("option", { value: "nao" }, "N\u00E3o"));
    const isoDiaAdm = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const eventosDiaAdm = base.agendamentos.filter(a => String(a.saidaPrevista || '').slice(0, 10) === isoDiaAdm(diaSelecionado)).sort((a, b) => new Date(a.saidaPrevista) - new Date(b.saidaPrevista));
    const moverDiaAdm = delta => { const d = new Date(diaSelecionado); d.setDate(d.getDate() + delta); setDiaSelecionado(d); setMes(d); };
    const irHojeAdm = () => { const h = new Date(); setMes(h); setDiaSelecionado(h); };
    const selecionarDiaAdm = d => { setDiaSelecionado(d); setMes(d); setModoVisao('dia'); };
    const ConteudoAgendaGeral = () => React.createElement(React.Fragment, null,
        React.createElement("div", { className: "row", style: { flexWrap: 'wrap' } },
            React.createElement("div", { className: "grow" },
                React.createElement("h2", null, "Agenda geral"),
                React.createElement("div", { className: "muted" }, "Somente ve\u00EDculos ativos da Frota Leve marcados como uso compartilhado."),
                base.veiculos.length === 0 && React.createElement("div", { className: "aviso-box", style: { marginTop: 8 } },
                    "Nenhuma placa dispon\u00EDvel. Cadastro: ",
                    base.diagnosticoVeiculos.totalCadastro || 0,
                    "; ativos: ",
                    base.diagnosticoVeiculos.totalAtivos || 0,
                    "; Frota Leve: ",
                    base.diagnosticoVeiculos.totalFrotaLeve || 0,
                    "; compartilhados: ",
                    base.diagnosticoVeiculos.totalCompartilhados || 0,
                    ". Regra: ",
                    base.diagnosticoVeiculos.regra || 'ATIVO + FROTA LEVE + USO COMPARTILHADO',
                    ".")),
            React.createElement("button", { className: "btn btn-p", onClick: () => setForm(true) }, "+ Novo agendamento")),
        React.createElement("div", { className: "row card", style: { flexWrap: 'wrap' } },
            React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => { if (modoVisao === 'dia')
                    moverDiaAdm(-1);
                else
                    setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1)); } }, "\u2039"),
            React.createElement("h2", { className: "grow" }, modoVisao === 'dia' ? diaSelecionado.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })),
            React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => { if (modoVisao === 'dia')
                    moverDiaAdm(1);
                else
                    setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1)); } }, "\u203A"),
            React.createElement("button", { className: "btn btn-s btn-sm", onClick: irHojeAdm }, "Hoje"),
            React.createElement("div", { className: "subtabs" },
                React.createElement("button", { className: 'subtab' + (modoVisao === 'mes' ? ' on' : ''), onClick: () => setModoVisao('mes') }, "M\u00EAs"),
                React.createElement("button", { className: 'subtab' + (modoVisao === 'dia' ? ' on' : ''), onClick: () => setModoVisao('dia') }, "Dia"))),
        modoVisao === 'mes'
            ? React.createElement(CalendarioAgenda, { mes: mes, eventos: base.agendamentos, onAbrir: setDetalhe, diaSelecionado: diaSelecionado, onSelecionarDia: selecionarDiaAdm })
            : React.createElement("div", { className: "agenda-dia-lista" }, eventosDiaAdm.length ? eventosDiaAdm.map(e => { const c = corAgendaVeiculo(e.placa); return React.createElement("button", { key: e.id, className: "agenda-dia-card", style: { borderLeftColor: c.b }, onClick: () => setDetalhe(e) },
                React.createElement("div", { className: "row" },
                    React.createElement("div", { className: "grow" },
                        React.createElement("b", null,
                            "Sa\u00EDda: ",
                            fmtDataHora(e.saidaPrevista).slice(-5),
                            " \u00B7 Retorno: ",
                            fmtDataHora(e.retornoPrevisto).slice(-5),
                            " \u00B7 ",
                            e.placa),
                        React.createElement("div", { className: "muted" },
                            e.motorista,
                            " \u00B7 ",
                            e.origem,
                            " \u2192 ",
                            e.destino)),
                    React.createElement(AgendaStatus, { status: e.status }))); }) : React.createElement("div", { className: "card muted" }, "Nenhum agendamento neste dia.")));
    const monitorStatus = ['AGUARDANDO_RETIRADA', 'EM_USO', 'DEVOLUCAO_ATRASADA', 'PENDENTE_FINALIZACAO', 'FINALIZADO'];
    const monitorMatch = (a, s) => s === 'AGUARDANDO_RETIRADA' ? ['AGENDADO', 'AGUARDANDO_RETIRADA'].includes(a.status) : a.status === s;
    const monitorLista = base.agendamentos.filter(a => monitorMatch(a, monitorFiltro));
    return React.createElement(React.Fragment, null,
        React.createElement("div", { className: "subtabs" },
            podeAgenda && React.createElement("button", { className: 'subtab' + (sub === 'agenda' ? ' on' : ''), onClick: () => setSub('agenda') }, "Agenda geral"),
            podeMonitor && React.createElement("button", { className: 'subtab' + (sub === 'monitor' ? ' on' : ''), onClick: () => setSub('monitor') }, "Monitoramento e gest\u00E3o"),
            podeRel && React.createElement("button", { className: 'subtab' + (sub === 'relatorio' ? ' on' : ''), onClick: () => setSub('relatorio') }, "Relat\u00F3rio"),
            podeParam && React.createElement("button", { className: 'subtab' + (sub === 'parametros' ? ' on' : ''), onClick: () => setSub('parametros') }, "Par\u00E2metros")),
        carregando ? React.createElement("div", { className: "card muted" }, "Carregando agendamentos...") : sub === 'agenda' ? React.createElement(ConteudoAgendaGeral, null) : sub === 'monitor' ? React.createElement(React.Fragment, null,
            React.createElement("div", { className: "agenda-kpis" }, monitorStatus.map(s => { const total = base.agendamentos.filter(a => monitorMatch(a, s)).length; return React.createElement("button", { type: "button", className: "agenda-kpi", key: s, onClick: () => setMonitorFiltro(s), style: { textAlign: 'left', outline: monitorFiltro === s ? '2px solid var(--folha)' : 'none', cursor: 'pointer' } },
                React.createElement("b", null, total),
                React.createElement("span", null, AG_STATUS_LABEL[s])); })),
            React.createElement("div", { className: "card" }, monitorLista.length === 0 ? React.createElement("div", { className: "muted" }, "Nenhum agendamento neste status.") : monitorLista.map(a => React.createElement("div", { className: "agenda-lista-item row", key: a.id },
                React.createElement("div", { className: "grow" },
                    React.createElement("b", null,
                        a.placa,
                        " \u00B7 ",
                        a.origem,
                        " \u2192 ",
                        a.destino),
                    React.createElement("div", { className: "muted" },
                        a.motorista,
                        " \u00B7 Sa\u00EDda prevista: ",
                        fmtDataHora(a.saidaPrevista)),
                    React.createElement("div", { className: "muted" },
                        "Devolu\u00E7\u00E3o prevista: ",
                        fmtDataHora(a.retornoPrevisto),
                        a.retornoReal ? React.createElement(React.Fragment, null,
                            " \u00B7 Devolu\u00E7\u00E3o real: ",
                            fmtDataHora(a.retornoReal)) : a.status === 'DEVOLUCAO_ATRASADA' ? React.createElement("span", { style: { color: 'var(--erro)', fontWeight: 700 } }, " \u00B7 Atrasada") : null)),
                React.createElement(AgendaStatus, { status: a.status }),
                React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => setDetalhe(a) }, "Abrir"))))) : sub === 'relatorio' ? React.createElement(React.Fragment, null,
            React.createElement("div", { className: "row" },
                React.createElement("div", { className: "grow" },
                    React.createElement("h2", null, "Relat\u00F3rio de agendamentos")),
                React.createElement("button", { className: "btn btn-p", onClick: exportar }, "Exportar Excel")),
            React.createElement("div", { className: "card" },
                React.createElement("div", { className: "form-grid" },
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-periodo-de" }, "Per\u00EDodo de"),
                        React.createElement("input", { id: "adm-agendamentos-periodo-de", name: "adm-agendamentos-periodo-de", autoComplete: "off", type: "date", value: fDataIniRel, onChange: e => setFDataIniRel(e.target.value) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-ate" }, "At\u00E9"),
                        React.createElement("input", { id: "adm-agendamentos-ate", name: "adm-agendamentos-ate", autoComplete: "off", type: "date", value: fDataFimRel, onChange: e => setFDataFimRel(e.target.value) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-veiculo" }, "Ve\u00EDculo"),
                        React.createElement("select", { id: "adm-agendamentos-veiculo", name: "adm-agendamentos-veiculo", value: fPlacaRel, onChange: e => setFPlacaRel(e.target.value) },
                            React.createElement("option", { value: "TODAS" }, "Todas as placas"),
                            placasRel.map(p => React.createElement("option", { key: p, value: p }, p)))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-status" }, "Status"),
                        React.createElement("select", { id: "adm-agendamentos-status", name: "adm-agendamentos-status", value: fStatus, onChange: e => setFStatus(e.target.value) },
                            React.createElement("option", { value: "TODOS" }, "Todos os status"),
                            Object.keys(AG_STATUS_LABEL).map(s => React.createElement("option", { key: s, value: s }, AG_STATUS_LABEL[s]))))),
                React.createElement("div", { style: { overflowX: 'auto', marginTop: 12 } },
                    React.createElement("table", null,
                        React.createElement("thead", null,
                            React.createElement("tr", null,
                                React.createElement("th", null, "C\u00F3digo"),
                                React.createElement("th", null, "Ve\u00EDculo"),
                                React.createElement("th", null, "Usu\u00E1rio que agendou"),
                                React.createElement("th", null, "Motorista"),
                                React.createElement("th", null, "Trajeto"),
                                React.createElement("th", null, "Previsto"),
                                React.createElement("th", null, "Real"),
                                React.createElement("th", null, "KM"),
                                React.createElement("th", null, "Status"))),
                        React.createElement("tbody", null, filtrados.map(a => React.createElement("tr", { key: a.id },
                            React.createElement("td", null, a.codigo),
                            React.createElement("td", null, a.placa),
                            React.createElement("td", null, a.solicitante || '—'),
                            React.createElement("td", null, a.motorista),
                            React.createElement("td", null,
                                a.origem,
                                " \u2192 ",
                                a.destino),
                            React.createElement("td", null,
                                fmtDataHora(a.saidaPrevista),
                                React.createElement("br", null),
                                fmtDataHora(a.retornoPrevisto)),
                            React.createElement("td", null,
                                fmtDataHora(a.saidaReal),
                                React.createElement("br", null),
                                fmtDataHora(a.retornoReal)),
                            React.createElement("td", null,
                                a.kmInicial || '—',
                                " \u2192 ",
                                a.kmFinal || '—'),
                            React.createElement("td", null,
                                React.createElement(AgendaStatus, { status: a.status }))))))))) : React.createElement(React.Fragment, null,
            React.createElement("div", { className: "row" },
                React.createElement("div", { className: "grow" },
                    React.createElement("h2", null, "Par\u00E2metros de agendamentos"),
                    React.createElement("div", { className: "muted" }, "Configura\u00E7\u00F5es lidas da lista Agendamentos_Parametros.")),
                React.createElement("button", { className: "btn btn-p", disabled: salvandoParam, onClick: salvarParametros }, salvandoParam ? 'Salvando...' : 'Salvar parâmetros')),
            React.createElement("div", { className: "card" },
                React.createElement("div", { className: "form-grid" },
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-dias-permitidos-para-frente" }, "Dias permitidos para frente"),
                        React.createElement("input", { id: "adm-agendamentos-dias-permitidos-para-frente", name: "adm-agendamentos-dias-permitidos-para-frente", autoComplete: "off", type: "number", value: paramForm.diasPermitidosFrente ?? '', onChange: e => alterarParam('diasPermitidosFrente', Number(e.target.value)) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-antecedencia-minima-para-criar-agendar-hor" }, "Anteced\u00EAncia m\u00EDnima para criar/agendar (horas)"),
                        React.createElement("input", { id: "adm-agendamentos-antecedencia-minima-para-criar-agendar-hor", name: "adm-agendamentos-antecedencia-minima-para-criar-agendar-hor", autoComplete: "off", type: "number", value: paramForm.antecedenciaMinimaHoras ?? '', onChange: e => alterarParam('antecedenciaMinimaHoras', Number(e.target.value)) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-duracao-maxima-horas" }, "Dura\u00E7\u00E3o m\u00E1xima (horas)"),
                        React.createElement("input", { id: "adm-agendamentos-duracao-maxima-horas", name: "adm-agendamentos-duracao-maxima-horas", autoComplete: "off", type: "number", value: paramForm.duracaoMaximaHoras ?? '', onChange: e => alterarParam('duracaoMaximaHoras', Number(e.target.value)) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-intervalo-entre-reservas-minutos" }, "Intervalo entre reservas (minutos)"),
                        React.createElement("input", { id: "adm-agendamentos-intervalo-entre-reservas-minutos", name: "adm-agendamentos-intervalo-entre-reservas-minutos", autoComplete: "off", type: "number", value: paramForm.intervaloReservasMinutos ?? '', onChange: e => alterarParam('intervaloReservasMinutos', Number(e.target.value)) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-hora-inicial-permitida" }, "Hora inicial permitida"),
                        React.createElement("input", { id: "adm-agendamentos-hora-inicial-permitida", name: "adm-agendamentos-hora-inicial-permitida", autoComplete: "off", type: "time", value: paramForm.horaInicialPermitida || '00:00', onChange: e => alterarParam('horaInicialPermitida', e.target.value) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-hora-final-permitida" }, "Hora final permitida"),
                        React.createElement("input", { id: "adm-agendamentos-hora-final-permitida", name: "adm-agendamentos-hora-final-permitida", autoComplete: "off", type: "time", value: paramForm.horaFinalPermitida || '23:59', onChange: e => alterarParam('horaFinalPermitida', e.target.value) })),
                    React.createElement("div", null,
                        React.createElement("label", null, "Permite s\u00E1bado"),
                        React.createElement(SimNao, { campo: "permiteSabado" })),
                    React.createElement("div", null,
                        React.createElement("label", null, "Permite domingo"),
                        React.createElement(SimNao, { campo: "permiteDomingo" })),
                    React.createElement("div", null,
                        React.createElement("label", null, "Permite feriado"),
                        React.createElement(SimNao, { campo: "permiteFeriado" })),
                    React.createElement("div", null,
                        React.createElement("label", null, "Confirma\u00E7\u00E3o autom\u00E1tica"),
                        React.createElement(SimNao, { campo: "confirmacaoAutomatica" })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-periodicidade-do-checklist" }, "Periodicidade do checklist"),
                        React.createElement("select", { id: "adm-agendamentos-periodicidade-do-checklist", name: "adm-agendamentos-periodicidade-do-checklist", value: paramForm.checklistPeriodicidade || 'SEMANAL', onChange: e => alterarParam('checklistPeriodicidade', e.target.value) },
                            React.createElement("option", null, "DIARIO"),
                            React.createElement("option", null, "SEMANAL"),
                            React.createElement("option", null, "A_CADA_RETIRADA"))),
                    React.createElement("div", null,
                        React.createElement("label", null, "Abre checklist na NC"),
                        React.createElement(SimNao, { campo: "abreChecklistNaNC" })),
                    React.createElement("div", null,
                        React.createElement("label", null, "Resposta impeditiva bloqueia"),
                        React.createElement(SimNao, { campo: "respostaImpeditivaBloqueia" })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-codigo-checklist-frota-leve" }, "C\u00F3digo checklist Frota Leve"),
                        React.createElement("input", { id: "adm-agendamentos-codigo-checklist-frota-leve", name: "adm-agendamentos-codigo-checklist-frota-leve", autoComplete: "off", value: paramForm.codigoChecklistFrotaLeve || '', onChange: e => alterarParam('codigoChecklistFrotaLeve', e.target.value) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-libera-retirada-antes-da-saida-minutos" }, "Libera retirada antes da sa\u00EDda (minutos)"),
                        React.createElement("input", { id: "adm-agendamentos-libera-retirada-antes-da-saida-minutos", name: "adm-agendamentos-libera-retirada-antes-da-saida-minutos", autoComplete: "off", type: "number", value: paramForm.janelaRetiradaMinutos ?? '', onChange: e => alterarParam('janelaRetiradaMinutos', Number(e.target.value)) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-tolerancia-devolucao-minutos" }, "Toler\u00E2ncia devolu\u00E7\u00E3o (minutos)"),
                        React.createElement("input", { id: "adm-agendamentos-tolerancia-devolucao-minutos", name: "adm-agendamentos-tolerancia-devolucao-minutos", autoComplete: "off", type: "number", value: paramForm.toleranciaDevolucaoMinutos ?? '', onChange: e => alterarParam('toleranciaDevolucaoMinutos', Number(e.target.value)) })),
                    React.createElement("div", null,
                        React.createElement("label", null, "Permite finalizar antes"),
                        React.createElement(SimNao, { campo: "permiteFinalizarAnterior" })),
                    React.createElement("div", null,
                        React.createElement("label", null, "Libera no retorno real"),
                        React.createElement(SimNao, { campo: "liberaNoRetornoReal" }))))),
        form && React.createElement(FormAgendamento, { base: base, admin: true, dataInicial: diaSelecionado, onClose: () => setForm(false), onSalvo: carregar, toast: toast }),
        " ",
        detalhe && React.createElement(DetalheAgendamento, { item: detalhe, admin: true, onClose: () => setDetalhe(null), onAtualizar: carregar, toast: toast }));
}
/* ================= SHELL MOTORISTA ================= */
function MotoristaApp({ st, setSt, user, onSair, toast }) {
    const dados = usarDadosMensais(st);
    const [carregandoCargas, setCarregandoCargas] = useState(!CONFIG.MODO_DEMONSTRACAO);
    const [carregandoPremiacao, setCarregandoPremiacao] = useState(!CONFIG.MODO_DEMONSTRACAO);
    useEffect(() => {
        if (CONFIG.MODO_DEMONSTRACAO)
            return;
        let ativo = true;
        Promise.allSettled([
            ApiService.obterCargas(),
            ApiService.obterPremiacao(),
            ApiService.obterMinhasContestacoes()
        ]).then(([cargasResult, premiacaoResult, contestacoesResult]) => {
            if (!ativo)
                return;
            setSt(s => {
                const proximo = { ...s };
                if (cargasResult.status === 'fulfilled') {
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
    }, [user.id]);
    const abas = [
        user.perms.cargas && { id: 'cargas', ic: '🚛', nome: 'Cargas' },
        user.perms.premiacao && { id: 'prem', ic: '🏆', nome: 'Premiação' },
        user.perms.checklist && { id: 'check', ic: '📋', nome: 'Check list' },
        user.perms.sinistros && { id: 'sinistro', ic: '🚨', nome: 'Sinistro' },
        user.perms.agendamentos && { id: 'agendamento', ic: '📅', nome: 'Agendamento' },
    ].filter(Boolean);
    const [aba, setAba] = useState(abas.length ? abas[0].id : '');
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
            React.createElement("button", { className: "btn btn-sm", style: { color: 'rgba(255,255,255,.8)' }, onClick: onSair }, "Sair")),
        React.createElement("div", { className: "mbody" },
            abas.length === 0 && React.createElement("div", { className: "card muted" }, "Seu usu\u00E1rio est\u00E1 sem m\u00F3dulos liberados. Fale com a log\u00EDstica."),
            aba === 'cargas' && carregandoCargas && React.createElement("div", { className: "card muted" }, "Carregando cargas do SharePoint..."),
            aba === 'cargas' && !carregandoCargas && React.createElement(TelaCargas, { st: st, setSt: setSt, user: user, dados: dados, toast: toast }),
            aba === 'prem' && carregandoPremiacao && React.createElement("div", { className: "card muted" }, "Carregando metas, apura\u00E7\u00E3o e descontos do SharePoint..."),
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
    const confirmarGravacao = async (motoristaId, competencias) => {
        const r = await ApiService.obterApuracoesSalvas('', motoristaId, { somenteSalvas: true });
        const existentes = new Set((r.apuracoes || []).map(a => String(a.competencia || '')));
        return competencias.every(c => existentes.has(c));
    };
    const iniciar = async ({ motoristas, meses }) => {
        if (estado.rodando || !motoristas.length)
            return false;
        estado = { rodando: true, total: motoristas.length, atual: 0, motorista: '', falhas: [], concluidos: 0, finalizadaEm: '' };
        publicar();
        const competencias = meses.map(m => m.slice(3) + '-' + m.slice(0, 2));
        for (let i = 0; i < motoristas.length; i++) {
            const u = motoristas[i];
            estado = { ...estado, atual: i + 1, motorista: u.nome };
            publicar();
            try {
                await executarComRetentativaGraph(async () => {
                    const r = await ApiService.obterPremiacaoMotorista(u.nome, competencias);
                    const conjunto = new Set(competencias);
                    const apuracoes = (r.apuracoes || []).filter(a => conjunto.has(String(a.competencia || '')));
                    if (apuracoes.length !== competencias.length) {
                        const recebidas = new Set(apuracoes.map(a => String(a.competencia || '')));
                        const faltantes = competencias.filter(c => !recebidas.has(c));
                        throw new Error('A API não calculou as competências: ' + faltantes.join(', '));
                    }
                    await ApiService.salvarApuracoes(idUsuario(u), apuracoes, 'RH_QUADRIMESTRE');
                });
                estado = { ...estado, concluidos: estado.concluidos + 1 };
                publicar();
            }
            catch (e) {
                let gravado = false;
                if (/failed to fetch|network|fetch/i.test(String(e?.message || e))) {
                    try {
                        gravado = await confirmarGravacao(idUsuario(u), competencias);
                    }
                    catch (_) { }
                }
                if (gravado)
                    estado = { ...estado, concluidos: estado.concluidos + 1 };
                else
                    estado = { ...estado, falhas: [...estado.falhas, `${u.nome}: ${e.message}`] };
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
        if (CONFIG.MODO_DEMONSTRACAO) {
            setUsuariosRH(st.usuarios || []);
            setVinculosRH(st.vinculos || []);
            return;
        }
        let ativo = true;
        setCarregandoRH(true);
        setErroRH('');
        ApiService.admCadastros()
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
        if (CONFIG.MODO_DEMONSTRACAO)
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
                    setErroRH(`${filaRH.falhas.length} motorista(s) não puderam ser atualizados: ${filaRH.falhas.join(' | ')}`);
                else
                    setErroRH('');
            }).catch(e => setErroRH('A atualização terminou, mas não foi possível recarregar a tabela: ' + e.message))
                .finally(() => setCarregandoRH(false));
        }
    }, [filaRH.finalizadaEm]);
    const recalcularQuadrimestre = async () => {
        if (filaRH.rodando || periodoBloqueado)
            return;
        if (periodoAindaNaoIniciado) {
            setErroRH(`O ${quadrimestre}º quadrimestre de ${ano} ainda não começou. Não há competências disponíveis para atualizar.`);
            return;
        }
        const competencias = mesesProcessaveis.map(m => m.slice(3) + '-' + m.slice(0, 2));
        const pendentes = motoristas.filter(u => {
            const itens = (apuracoesRH[idUsuario(u)] || []).filter(a => competencias.includes(String(a.competencia || '')));
            return itens.length < competencias.length || itens.some(a => a.desatualizada === true ||
                ['PENDENTE', 'ERRO'].includes(String(a.status || '').toUpperCase()));
        });
        const escolhidos = modoAtualizacao === 'TODOS' ? motoristas :
            modoAtualizacao === 'PENDENTES' ? pendentes :
                motoristas.filter(u => selecionados.includes(idUsuario(u)));
        if (!escolhidos.length) {
            setErroRH(modoAtualizacao === 'SELECIONADOS' ? 'Selecione pelo menos um motorista.' : 'Não há motoristas pendentes ou com erro neste quadrimestre.');
            return;
        }
        setErroRH('');
        await FilaApuracaoRH.iniciar({ motoristas: escolhidos, meses: mesesProcessaveis });
    };
    /*
     * A conferência é mensal. Um motorista só gera uma competência esperada
     * quando está configurado para a premiação e possui vínculo sobreposto ao mês.
     * Na ausência total de histórico de vínculo para o usuário, preserva-se a
     * compatibilidade atual: usuário ativo é aplicável aos quatro meses.
     */
    const competenciasEsperadas = motoristasPeriodo.flatMap(u => mesesProcessaveis
        .map(m => {
        const competencia = m.slice(3) + '-' + m.slice(0, 2);
        const [anoMes, mesNumero] = competencia.split('-').map(Number);
        const inicioMes = `${anoMes}-${String(mesNumero).padStart(2, '0')}-01`;
        const fimMes = new Date(anoMes, mesNumero, 0).toISOString().slice(0, 10);
        return usuarioValidoPremiacaoPeriodo(u, vinculosRH, inicioMes, fimMes)
            ? { u, competencia, chave: idUsuario(u) + '|' + competencia }
            : null;
    })
        .filter(Boolean));
    const apuracoesPorChave = new Map();
    motoristasPeriodo.forEach(u => (apuracoesRH[idUsuario(u)] || []).forEach(a => {
        const competencia = String(a.competencia || '');
        if (meses.some(m => competencia === m.slice(3) + '-' + m.slice(0, 2))) {
            apuracoesPorChave.set(idUsuario(u) + '|' + competencia, a);
        }
    }));
    const itensQuadrimestre = [...apuracoesPorChave.values()];
    const ausentes = competenciasEsperadas.filter(item => !apuracoesPorChave.has(item.chave));
    const totalEsperado = competenciasEsperadas.length;
    const totalAusentes = ausentes.length;
    const totalEncontrado = totalEsperado - totalAusentes;
    const totalFechados = competenciasEsperadas.filter(item => String(apuracoesPorChave.get(item.chave)?.status || '').toUpperCase() === 'FECHADO').length;
    const haRegistrosFechados = totalFechados > 0;
    const quadrimestreFechado = totalEsperado > 0 && totalAusentes === 0 && totalFechados === totalEsperado;
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
            const resposta = await executarComRetentativaGraph(() => ApiService.alterarStatusQuadrimestre(ano, quadrimestre, acao));
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
            const resposta = await ApiService.obterPremiacaoMotorista(linha.u.nome);
            const porCompetencia = {};
            (resposta.apuracoes || []).forEach(a => { porCompetencia[String(a.competencia || '')] = a; });
            setAuditoriasRH(v => ({ ...v, [motoristaId]: {
                    carregando: false, erro: '', apuracoes: porCompetencia, carregadoEm: agoraISO()
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
        const stMotorista = { ...st, apuracoes: vindas };
        const apuracoes = meses.map(m => apuracaoMes(stMotorista, dados, u.nome, m));
        const acumulado = apuracoes.reduce((s, a) => s + Number(a.apurado || 0), 0);
        const competenciasAplicaveis = mesesProcessaveis
            .map(m => m.slice(3) + '-' + m.slice(0, 2))
            .filter(competencia => {
            const [anoMes, mesNumero] = competencia.split('-').map(Number);
            const inicioMes = `${anoMes}-${String(mesNumero).padStart(2, '0')}-01`;
            const fimMes = new Date(anoMes, mesNumero, 0).toISOString().slice(0, 10);
            return usuarioValidoPremiacaoPeriodo(u, vinculosRH, inicioMes, fimMes);
        });
        const aplicaveis = vindas.filter(a => competenciasAplicaveis.includes(String(a.competencia || '')));
        const faltantes = Math.max(0, competenciasAplicaveis.length - aplicaveis.length);
        const statusSalvos = aplicaveis.map(a => String(a.status || 'PENDENTE').toUpperCase());
        const quantidadeFechada = statusSalvos.filter(s => s === 'FECHADO').length;
        const statusMotorista = statusSalvos.some(s => s === 'ERRO') ? 'ERRO' :
            faltantes > 0 ? 'NÃO CALCULADO' :
                aplicaveis.some(a => a.desatualizada === true) ? 'NOVAS CARGAS — RECALCULAR' :
                    statusSalvos.length && quantidadeFechada === statusSalvos.length ? 'FECHADO' :
                        quantidadeFechada > 0 ? 'FECHADO PARCIAL' :
                            statusSalvos.some(s => s === 'PENDENTE') ? 'PENDENTE' :
                                statusSalvos.length ? 'CALCULADO' : 'AGUARDANDO';
        return { u, apuracoes, acumulado, pagar: Math.max(0, acumulado), statusMotorista };
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
                React.createElement("div", { className: "v", style: { fontSize: 18 } }, quadrimestreFechado ? 'FECHADO' : fechadoComPendencias ? 'FECHADO COM PENDÊNCIAS' : periodoAindaNaoIniciado ? 'AGUARDANDO PERÍODO' : podeFechar ? 'PRONTO PARA FECHAR' : 'EM APURAÇÃO'))),
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
                                    l.statusMotorista === 'ERRO' ? 'tag-neg' : 'tag-pend') }, l.statusMotorista)),
                        l.apuracoes.map((a, i) => React.createElement("td", { key: meses[i], className: "td-num num", style: { color: a.apurado < 0 ? 'var(--erro)' : 'inherit' } }, brl(a.apurado))),
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
                                "N\u00E3o foi poss\u00EDvel carregar a auditoria: ",
                                auditoriasRH[idUsuario(l.u)].erro),
                            React.createElement("div", { className: "cards4" }, l.apuracoes.map((salva, i) => {
                                const competencia = meses[i].slice(3) + '-' + meses[i].slice(0, 2);
                                const aoVivo = auditoriasRH[idUsuario(l.u)]?.apuracoes?.[competencia];
                                const a = aoVivo ? apuracaoMes({ ...st, apuracoes: [aoVivo] }, dados, l.u.nome, meses[i]) : salva;
                                return React.createElement("div", { className: "card", key: meses[i], style: { boxShadow: 'none', border: '1px solid var(--linha)' } },
                                    React.createElement("b", null, mesLabel(meses[i])),
                                    React.createElement("div", { className: "linha-item" },
                                        React.createElement("span", null, "Tipo / meta"),
                                        React.createElement("span", null,
                                            a.tipo || '—',
                                            a.meta ? ' · ' + brl(a.meta.meta) : '')),
                                    React.createElement("div", { className: "linha-item" },
                                        React.createElement("span", null, "Faturamento"),
                                        React.createElement("b", null, brl(a.fat))),
                                    React.createElement("div", { className: "linha-item" },
                                        React.createElement("span", null, "Premia\u00E7\u00E3o calculada"),
                                        React.createElement("span", null, brl(a.prod))),
                                    React.createElement("div", { className: "linha-item" },
                                        React.createElement("span", null, "Descontos"),
                                        React.createElement("span", { style: { color: a.totDesc < 0 ? 'var(--erro)' : 'inherit' } }, brl(a.totDesc))),
                                    React.createElement("div", { className: "linha-item" },
                                        React.createElement("span", null, "Apurado do m\u00EAs"),
                                        React.createElement("b", null, brl(a.apurado))),
                                    aoVivo && React.createElement("div", { className: "muted", style: { marginTop: 6 } }, "Dados atuais conferidos na origem."));
                            }))))))))),
        React.createElement("div", { className: "aviso-box" }, "O acumulado soma os quatro meses, inclusive resultados negativos. O valor a pagar nunca fica abaixo de R$ 0,00 e o saldo negativo n\u00E3o \u00E9 levado para o quadrimestre seguinte."));
}
function AdmPainel({ st, dados, user, onNavegar }) {
    const [mes, setMes] = useState(MES_ATUAL);
    const [usuariosPainel, setUsuariosPainel] = useState([]);
    const [vinculosPainel, setVinculosPainel] = useState([]);
    const [veiculosPainel, setVeiculosPainel] = useState([]);
    const [cargasPainel, setCargasPainel] = useState([]);
    const [apuracoesPainel, setApuracoesPainel] = useState({});
    const [contestacoesPainel, setContestacoesPainel] = useState([]);
    const [checklistsPainel, setChecklistsPainel] = useState([]);
    const [sinistrosPainel, setSinistrosPainel] = useState([]);
    const [periodoPendencias, setPeriodoPendencias] = useState(MES_ATUAL);
    const [carregandoPainel, setCarregandoPainel] = useState(false);
    const [carregandoCargasPainel, setCarregandoCargasPainel] = useState(false);
    const [erroPainel, setErroPainel] = useState('');
    const [erroCargasPainel, setErroCargasPainel] = useState('');
    const [progressoPainel, setProgressoPainel] = useState('');
    const [revisaoPendencias, setRevisaoPendencias] = useState(0);
    const [revisaoCargas, setRevisaoCargas] = useState(0);
    const [cargasCarregadas, setCargasCarregadas] = useState(false);
    const [fMotorista, setFMotorista] = useState('');
    const [fTipo, setFTipo] = useState('');
    const [fSituacao, setFSituacao] = useState('');
    const [subPainel, setSubPainel] = useState('visao');
    const [motoristaDetalhe, setMotoristaDetalhe] = useState(null);
    const [fBuscaDetalhe, setFBuscaDetalhe] = useState('');
    const [fProdutoDetalhe, setFProdutoDetalhe] = useState('');
    const [fDataInicialDetalhe, setFDataInicialDetalhe] = useState('');
    const [fDataFinalDetalhe, setFDataFinalDetalhe] = useState('');
    const [mesNumero, anoNumero] = String(mes).split('/');
    const competencia = anoNumero + '-' + mesNumero;
    const inicioMes = `${competencia}-01`;
    const fimMes = new Date(Number(anoNumero), Number(mesNumero), 0).toISOString().slice(0, 10);
    /* Visão geral: carrega somente os módulos de pendência. */
    useEffect(() => {
        let ativo = true;
        const carregarPendencias = async () => {
            setCarregandoPainel(true);
            setErroPainel('');
            try {
                if (CONFIG.MODO_DEMONSTRACAO) {
                    if (!ativo)
                        return;
                    setContestacoesPainel(st.contestacoes || []);
                    setChecklistsPainel(st.checklists || []);
                    setSinistrosPainel(st.sinistros || []);
                    return;
                }
                const [contestacoesResp, checklistsResp, sinistrosResp] = await Promise.allSettled([
                    pode(user, 'contestacoes.visualizar') ? ApiService.admListarContestacoes() : Promise.resolve({ contestacoes: [] }),
                    pode(user, 'checklist.aprovacao') ? ApiService.admListarChecklists() : Promise.resolve({ checklists: [] }),
                    pode(user, 'sinistros.visualizar') ? ApiService.admListarSinistros() : Promise.resolve({ sinistros: [] })
                ]);
                if (!ativo)
                    return;
                setContestacoesPainel(contestacoesResp.status === 'fulfilled' ? (contestacoesResp.value.contestacoes || []) : []);
                const dadosChecklist = checklistsResp.status === 'fulfilled' ? (checklistsResp.value.itens || checklistsResp.value.checklists || []) : [];
                setChecklistsPainel(dadosChecklist.map(x => ({
                    ...x,
                    motorista: x.motorista || x.motoristaNome || '',
                    data: String(x.data || x.dataHoraLocal || '').slice(0, 10),
                    status: String(x.status || 'PENDENTE').toLowerCase()
                })));
                setSinistrosPainel(sinistrosResp.status === 'fulfilled' ? (sinistrosResp.value.sinistros || []) : []);
            }
            catch (e) {
                if (ativo)
                    setErroPainel('Não foi possível carregar as pendências: ' + e.message);
            }
            finally {
                if (ativo)
                    setCarregandoPainel(false);
            }
        };
        carregarPendencias();
        return () => { ativo = false; };
    }, [revisaoPendencias]);
    /* Subtela Cargas: dados pesados somente sob demanda. */
    useEffect(() => {
        if (revisaoCargas === 0)
            return;
        let ativo = true;
        const carregarCargas = async () => {
            setCarregandoCargasPainel(true);
            setErroCargasPainel('');
            try {
                if (CONFIG.MODO_DEMONSTRACAO) {
                    if (!ativo)
                        return;
                    setUsuariosPainel(st.usuarios || []);
                    setVinculosPainel(st.vinculos || []);
                    setVeiculosPainel(Object.values(st.frota || {}));
                    setCargasPainel((st.cargas || []).filter(c => String(c.mes || c.competencia || '') === mes || String(c.competencia || '') === competencia));
                    const salvas = {};
                    (st.apuracoes || []).filter(a => String(a.competencia || '') === competencia).forEach(a => { salvas[String(a.motoristaId || a.usuarioId || '')] = a; });
                    setApuracoesPainel(salvas);
                    setCargasCarregadas(true);
                    return;
                }
                const [cadastros, cargasResp, apuracoesResp] = await Promise.all([
                    ApiService.admCadastros(),
                    ApiService.obterCargas(competencia),
                    ApiService.obterApuracoesSalvas(competencia)
                ]);
                if (!ativo)
                    return;
                const usuarios = Array.isArray(cadastros.usuarios) ? cadastros.usuarios : [];
                setUsuariosPainel(usuarios);
                setVinculosPainel(Array.isArray(cadastros.vinculos) ? cadastros.vinculos : []);
                setVeiculosPainel(Array.isArray(cadastros.veiculos) ? cadastros.veiculos : []);
                setCargasPainel(Array.isArray(cargasResp.cargas) ? cargasResp.cargas : []);
                const salvas = {};
                (apuracoesResp.apuracoes || []).forEach(item => {
                    const u = usuarios.find(x => idUsuario(x) === String(item.motoristaId || ''));
                    salvas[String(item.motoristaId || '')] = apuracaoSalvaParaTela(item, u?.nome || '');
                });
                setApuracoesPainel(salvas);
                setCargasCarregadas(true);
            }
            catch (e) {
                if (ativo)
                    setErroCargasPainel('Não foi possível carregar Cargas: ' + e.message);
            }
            finally {
                if (ativo)
                    setCarregandoCargasPainel(false);
            }
        };
        carregarCargas();
        return () => { ativo = false; };
    }, [mes, revisaoCargas]);
    const motoristas = usuariosPainel.filter(u => usuarioValidoPremiacaoPeriodo(u, vinculosPainel, inicioMes, fimMes));
    const mesFechado = Object.values(apuracoesPainel).some(item => String(item?.status || '').toUpperCase() === 'FECHADO');
    const recalcularMes = async () => {
        if (!motoristas.length || carregandoCargasPainel)
            return;
        setCarregandoCargasPainel(true);
        setErroCargasPainel('');
        setProgressoPainel('');
        const falhas = [];
        try {
            for (let i = 0; i < motoristas.length; i++) {
                const u = motoristas[i];
                setProgressoPainel(`Processando ${i + 1} de ${motoristas.length}: ${u.nome}`);
                try {
                    await executarComRetentativaGraph(async () => {
                        const r = await ApiService.obterPremiacaoMotorista(u.nome);
                        const apuracao = (r.apuracoes || []).find(a => String(a.competencia || '') === competencia);
                        if (apuracao)
                            await ApiService.salvarApuracoes(idUsuario(u), [apuracao]);
                    });
                }
                catch (e) {
                    falhas.push(`${u.nome}: ${e.message}`);
                }
                if (i < motoristas.length - 1)
                    await aguardar(1800);
            }
            setProgressoPainel('Carregando os resultados salvos...');
            const atualizadas = await ApiService.obterApuracoesSalvas(competencia);
            const saida = {};
            (atualizadas.apuracoes || []).forEach(item => {
                const u = usuariosPainel.find(x => idUsuario(x) === String(item.motoristaId || ''));
                saida[String(item.motoristaId || '')] = apuracaoSalvaParaTela(item, u?.nome || '');
            });
            setApuracoesPainel(saida);
            if (falhas.length)
                setErroCargasPainel(`${falhas.length} motorista(s) não puderam ser atualizados: ${falhas.join(' | ')}`);
        }
        catch (e) {
            setErroCargasPainel('Falha ao atualizar a apuração mensal: ' + e.message);
        }
        finally {
            setCarregandoCargasPainel(false);
            setProgressoPainel('');
        }
    };
    const veiculoPorPlaca = new Map((veiculosPainel || []).map(v => [String(v.placa || '').trim().toUpperCase(), v]));
    const cargasPorMotorista = new Map();
    for (const carga of cargasPainel) {
        const uid = String(carga.usuarioId || '');
        const chave = uid || normalizar(carga.motorista || '');
        if (!cargasPorMotorista.has(chave))
            cargasPorMotorista.set(chave, []);
        cargasPorMotorista.get(chave).push(carga);
    }
    const pendenciasNome = nome => {
        const contestacoes = contestacoesPainel.filter(c => String(c.status || '').toLowerCase() === 'pendente' && String(c.dataCarga || c.data || '').slice(0, 7) === competencia && normalizar(c.motorista) === normalizar(nome)).length;
        const checklists = checklistsPainel.filter(c => String(c.status || '').toLowerCase() === 'pendente' && String(c.data || '').slice(0, 7) === competencia && normalizar(c.motoristaNome || c.motorista) === normalizar(nome)).length;
        return contestacoes + checklists;
    };
    const linhas = motoristas.map(u => {
        const uid = idUsuario(u);
        const cargas = (cargasPorMotorista.get(uid) || cargasPorMotorista.get(normalizar(u.nome)) || []).slice().sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
        const peso = cargas.reduce((s, c) => s + Number(c.peso || c.pesoTon || 0), 0);
        const frete = cargas.reduce((s, c) => s + Number(c.freteTotal || 0), 0);
        const premiacao = cargas.reduce((s, c) => s + Number(c.valor || c.premiacao || 0), 0);
        const tipos = [...new Set(cargas.map(c => {
                const placa = String(c.placa || '').trim().toUpperCase();
                return String(c.tipoVeiculo || veiculoPorPlaca.get(placa)?.tipoModelo || veiculoPorPlaca.get(placa)?.tipo || '').trim();
            }).filter(Boolean))];
        const tipo = tipos.join(' / ');
        const oficial = apuracoesPainel[uid];
        const pendencias = pendenciasNome(u.nome);
        const inconsistencias = cargas.filter(c => !Number(c.peso || c.pesoTon || 0) || !Number(c.freteTotal || 0) || !String(c.tipoVeiculo || veiculoPorPlaca.get(String(c.placa || '').trim().toUpperCase())?.tipoModelo || '').trim()).length;
        let situacao = 'CONFERIDO';
        if (oficial && String(oficial.status || '').toUpperCase() === 'FECHADO')
            situacao = 'FECHADO';
        else if (!cargas.length)
            situacao = 'SEM_MOVIMENTO';
        else if (inconsistencias > 0 || !oficial)
            situacao = 'DIVERGENTE';
        else if (pendencias > 0)
            situacao = 'PENDENTE';
        return { u, uid, cargas, peso, frete, premiacao, tipo, pendencias, inconsistencias, oficial, situacao };
    }).sort((a, b) => b.frete - a.frete || a.u.nome.localeCompare(b.u.nome, 'pt-BR'));
    const tipos = [...new Set(linhas.map(l => l.tipo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const linhasFiltradas = linhas.filter(l => (!fMotorista || l.uid === fMotorista) && (!fTipo || l.tipo === fTipo) && (!fSituacao || l.situacao === fSituacao));
    const totalPeso = linhasFiltradas.reduce((s, l) => s + l.peso, 0);
    const totalFrete = linhasFiltradas.reduce((s, l) => s + l.frete, 0);
    const totalCargas = linhasFiltradas.reduce((s, l) => s + l.cargas.length, 0);
    const totalPendencias = linhasFiltradas.reduce((s, l) => s + l.pendencias, 0);
    const totalDivergencias = linhasFiltradas.filter(l => l.situacao === 'DIVERGENTE').length;
    const competenciaPendencias = periodoPendencias === 'TODOS' ? '' : periodoPendencias.slice(3) + '-' + periodoPendencias.slice(0, 2);
    const dentroPeriodo = data => !competenciaPendencias || String(data || '').slice(0, 7) === competenciaPendencias;
    const contestacoesPendentes = contestacoesPainel.filter(c => String(c.status || '').toLowerCase() === 'pendente' && dentroPeriodo(c.dataCarga || c.data));
    const totalContestacoesCarga = contestacoesPendentes.filter(c => String(c.tipoContestacao || 'ERRO_CARGA').toUpperCase() === 'ERRO_CARGA').length;
    const totalPBT = contestacoesPendentes.filter(c => String(c.tipoContestacao || '').toUpperCase() === 'DIVERGENCIA_PBT').length;
    const totalChecklist = checklistsPainel.filter(c => String(c.status || '').toLowerCase() === 'pendente' && dentroPeriodo(c.data || c.dataHoraLocal)).length;
    const totalSinistros = sinistrosPainel.filter(s => !['CONCLUIDO', 'CANCELADO'].includes(normalizarPerfil(s.statusSinistro)) &&
        dentroPeriodo(s.dataHoraOcorrido || s.dataCriacao || s.created)).length;
    const limparFiltros = () => { setFMotorista(''); setFTipo(''); setFSituacao(''); };
    const rotuloSituacao = s => ({ CONFERIDO: 'Conferido', PENDENTE: 'Pendente', DIVERGENTE: 'Divergente', SEM_MOVIMENTO: 'Sem movimento', FECHADO: 'Fechado' }[s] || s);
    const corSituacao = s => ({ CONFERIDO: 'var(--mata)', PENDENTE: 'var(--colheita-escura)', DIVERGENTE: 'var(--erro)', SEM_MOVIMENTO: 'var(--texto-suave)', FECHADO: 'var(--azul)' }[s] || 'inherit');
    const abrirDetalhe = linha => {
        setMotoristaDetalhe(linha);
        setFBuscaDetalhe('');
        setFProdutoDetalhe('');
        setFDataInicialDetalhe('');
        setFDataFinalDetalhe('');
        setSubPainel('detalhes');
    };
    const abrirModulo = (id, parametros = {}) => {
        if (onNavegar)
            onNavegar(id, parametros);
    };
    const produtosDetalhe = [...new Set((motoristaDetalhe?.cargas || []).map(c => String(c.produto || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const cargasDetalhe = (motoristaDetalhe?.cargas || []).filter(c => {
        const busca = normalizar(fBuscaDetalhe);
        const data = String(c.data || '').slice(0, 10);
        const correspondeBusca = !busca || [c.nota, c.numeroNota, c.origem, c.destino, c.placa, c.produto].some(v => normalizar(v).includes(busca));
        return correspondeBusca && (!fProdutoDetalhe || String(c.produto || '') === fProdutoDetalhe) && (!fDataInicialDetalhe || data >= fDataInicialDetalhe) && (!fDataFinalDetalhe || data <= fDataFinalDetalhe);
    });
    const totaisDetalhe = {
        cargas: cargasDetalhe.length,
        peso: cargasDetalhe.reduce((s, c) => s + Number(c.peso || c.pesoTon || 0), 0),
        frete: cargasDetalhe.reduce((s, c) => s + Number(c.freteTotal || 0), 0),
        premiacao: cargasDetalhe.reduce((s, c) => s + Number(c.valor || c.premiacao || 0), 0)
    };
    const Subtabs = () => React.createElement("div", { className: "subtabs", style: { marginBottom: 12 } },
        React.createElement("button", { className: 'subtab' + (subPainel === 'visao' ? ' on' : ''), onClick: () => setSubPainel('visao') }, "Vis\u00E3o geral"),
        React.createElement("button", { className: 'subtab' + (['cargas', 'detalhes'].includes(subPainel) ? ' on' : ''), onClick: () => { setSubPainel('cargas'); if (!cargasCarregadas)
                setRevisaoCargas(v => v + 1); } }, "Cargas"));
    const emCargas = ['cargas', 'detalhes'].includes(subPainel);
    const Cabecalho = () => React.createElement("div", { className: "row", style: { flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' } },
        React.createElement("div", { className: "grow" },
            React.createElement("h2", { style: { marginBottom: 2 } }, "Painel operacional"),
            React.createElement("div", { className: "muted" }, "Pend\u00EAncias que aguardam an\u00E1lise, aprova\u00E7\u00E3o ou reprova\u00E7\u00E3o")),
        subPainel === 'visao' && React.createElement("button", { className: "btn btn-s btn-sm", disabled: carregandoPainel, onClick: () => setRevisaoPendencias(v => v + 1) }, carregandoPainel ? 'Carregando...' : 'Atualizar pendências'),
        emCargas && React.createElement("button", { className: "btn btn-s btn-sm", disabled: carregandoCargasPainel, onClick: () => setRevisaoCargas(v => v + 1) }, carregandoCargasPainel ? 'Carregando...' : 'Recarregar dados'),
        emCargas && pode(user, 'apuracao.mensal.atualizar') && React.createElement("button", { className: "btn btn-p btn-sm", disabled: carregandoCargasPainel || mesFechado, title: mesFechado ? 'O quadrimestre está fechado. Reabra-o no Fechamento RH para atualizar este mês.' : '', onClick: recalcularMes }, carregandoCargasPainel ? 'Atualizando...' : mesFechado ? 'Quadrimestre fechado' : 'Atualizar apuração mensal'));
    const FiltrosCargas = () => React.createElement("div", { className: "card", style: { marginTop: 12 } },
        React.createElement("div", { className: "form-grid", style: { alignItems: 'end' } },
            React.createElement("div", null,
                React.createElement("label", { htmlFor: "adm-painel-competencia" }, "Compet\u00EAncia"),
                React.createElement("select", { id: "adm-painel-competencia", name: "adm-painel-competencia", value: mes, onChange: e => setMes(e.target.value) }, MESES_2026.map(m => React.createElement("option", { key: m, value: m }, mesLabel(m))))),
            React.createElement("div", null,
                React.createElement("label", { htmlFor: "adm-painel-motorista" }, "Motorista"),
                React.createElement("select", { id: "adm-painel-motorista", name: "adm-painel-motorista", value: fMotorista, onChange: e => setFMotorista(e.target.value) },
                    React.createElement("option", { value: "" }, "Todos"),
                    linhas.map(l => React.createElement("option", { key: l.uid, value: l.uid }, l.u.nome)))),
            React.createElement("div", null,
                React.createElement("label", { htmlFor: "adm-painel-tipo-de-veiculo" }, "Tipo de ve\u00EDculo"),
                React.createElement("select", { id: "adm-painel-tipo-de-veiculo", name: "adm-painel-tipo-de-veiculo", value: fTipo, onChange: e => setFTipo(e.target.value) },
                    React.createElement("option", { value: "" }, "Todos"),
                    tipos.map(t => React.createElement("option", { key: t, value: t }, t)))),
            React.createElement("div", null,
                React.createElement("label", { htmlFor: "adm-painel-situacao" }, "Situa\u00E7\u00E3o"),
                React.createElement("select", { id: "adm-painel-situacao", name: "adm-painel-situacao", value: fSituacao, onChange: e => setFSituacao(e.target.value) },
                    React.createElement("option", { value: "" }, "Todas"),
                    ['CONFERIDO', 'PENDENTE', 'DIVERGENTE', 'SEM_MOVIMENTO', 'FECHADO'].map(s => React.createElement("option", { key: s, value: s }, rotuloSituacao(s))))),
            React.createElement("div", null,
                React.createElement("button", { className: "btn btn-s", style: { width: '100%' }, onClick: limparFiltros }, "Limpar filtros"))));
    if (subPainel === 'detalhes' && motoristaDetalhe) {
        return React.createElement(React.Fragment, null,
            React.createElement(Cabecalho, null),
            React.createElement(Subtabs, null),
            React.createElement("div", { className: "row", style: { marginBottom: 12, flexWrap: 'wrap' } },
                React.createElement("button", { className: "btn btn-s btn-sm", onClick: () => setSubPainel('cargas') }, "\u2190 Voltar para cargas"),
                React.createElement("div", { className: "grow" },
                    React.createElement("h3", { style: { margin: 0 } }, motoristaDetalhe.u.nome),
                    React.createElement("div", { className: "muted" },
                        mesLabel(mes),
                        " \u00B7 ",
                        motoristaDetalhe.tipo || 'Tipo não identificado'))),
            React.createElement("div", { className: "cards4" },
                React.createElement("div", { className: "card kpi" },
                    React.createElement("div", { className: "l" }, "Cargas"),
                    React.createElement("div", { className: "v num" }, totaisDetalhe.cargas)),
                React.createElement("div", { className: "card kpi" },
                    React.createElement("div", { className: "l" }, "Peso transportado"),
                    React.createElement("div", { className: "v num" },
                        brn(totaisDetalhe.peso, 1),
                        " t")),
                React.createElement("div", { className: "card kpi" },
                    React.createElement("div", { className: "l" }, "Frete total"),
                    React.createElement("div", { className: "v num" }, brl(totaisDetalhe.frete))),
                React.createElement("div", { className: "card kpi" },
                    React.createElement("div", { className: "l" }, "Premia\u00E7\u00E3o das cargas"),
                    React.createElement("div", { className: "v num" }, brl(totaisDetalhe.premiacao)))),
            React.createElement("div", { className: "card", style: { marginTop: 12 } },
                React.createElement("div", { className: "form-grid", style: { alignItems: 'end' } },
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-painel-buscar-nf-rota-placa-ou-produto" }, "Buscar NF, rota, placa ou produto"),
                        React.createElement("input", { id: "adm-painel-buscar-nf-rota-placa-ou-produto", name: "adm-painel-buscar-nf-rota-placa-ou-produto", autoComplete: "off", value: fBuscaDetalhe, onChange: e => setFBuscaDetalhe(e.target.value), placeholder: "Digite para localizar" })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-painel-produto" }, "Produto"),
                        React.createElement("select", { id: "adm-painel-produto", name: "adm-painel-produto", value: fProdutoDetalhe, onChange: e => setFProdutoDetalhe(e.target.value) },
                            React.createElement("option", { value: "" }, "Todos"),
                            produtosDetalhe.map(p => React.createElement("option", { key: p, value: p }, p)))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-painel-data-inicial" }, "Data inicial"),
                        React.createElement("input", { id: "adm-painel-data-inicial", name: "adm-painel-data-inicial", autoComplete: "off", type: "date", value: fDataInicialDetalhe, onChange: e => setFDataInicialDetalhe(e.target.value) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-painel-data-final" }, "Data final"),
                        React.createElement("input", { id: "adm-painel-data-final", name: "adm-painel-data-final", autoComplete: "off", type: "date", value: fDataFinalDetalhe, onChange: e => setFDataFinalDetalhe(e.target.value) })))),
            React.createElement("div", { className: "card", style: { overflowX: 'auto', marginTop: 12 } },
                React.createElement("table", null,
                    React.createElement("thead", null,
                        React.createElement("tr", null,
                            React.createElement("th", null, "Data"),
                            React.createElement("th", null, "Placa"),
                            React.createElement("th", null, "Rota entrada"),
                            React.createElement("th", null, "Rota sa\u00EDda"),
                            React.createElement("th", null, "Produto"),
                            React.createElement("th", null, "NF"),
                            React.createElement("th", { className: "td-num" }, "Peso (t)"),
                            React.createElement("th", { className: "td-num" }, "Frete"),
                            React.createElement("th", { className: "td-num" }, "Premia\u00E7\u00E3o"))),
                    React.createElement("tbody", null,
                        cargasDetalhe.map(c => React.createElement("tr", { key: c.id || [c.data, c.placa, c.nota, c.origem, c.destino].join('|') },
                            React.createElement("td", null, dataBR(c.data)),
                            React.createElement("td", null,
                                React.createElement("b", null, c.placa || '—')),
                            React.createElement("td", null, c.origem || '—'),
                            React.createElement("td", null, c.destino || '—'),
                            React.createElement("td", null, c.produto || '—'),
                            React.createElement("td", null, c.nota || c.numeroNota || '—'),
                            React.createElement("td", { className: "td-num num" }, brn(Number(c.peso || c.pesoTon || 0), 2)),
                            React.createElement("td", { className: "td-num num" }, brl(Number(c.freteTotal || 0))),
                            React.createElement("td", { className: "td-num num" }, brl(Number(c.valor || c.premiacao || 0))))),
                        !cargasDetalhe.length && React.createElement("tr", null,
                            React.createElement("td", { colSpan: "9", className: "muted", style: { textAlign: 'center', padding: 24 } }, "Nenhuma carga encontrada para os filtros selecionados."))),
                    React.createElement("tfoot", null,
                        React.createElement("tr", null,
                            React.createElement("td", { colSpan: "6" },
                                React.createElement("b", null, "Total filtrado")),
                            React.createElement("td", { className: "td-num num" },
                                React.createElement("b", null, brn(totaisDetalhe.peso, 2))),
                            React.createElement("td", { className: "td-num num" },
                                React.createElement("b", null, brl(totaisDetalhe.frete))),
                            React.createElement("td", { className: "td-num num" },
                                React.createElement("b", null, brl(totaisDetalhe.premiacao))))))));
    }
    return React.createElement(React.Fragment, null,
        React.createElement(Cabecalho, null),
        React.createElement(Subtabs, null),
        subPainel === 'visao' && carregandoPainel && React.createElement("div", { className: "aviso-box" }, "Carregando pend\u00EAncias operacionais..."),
        subPainel === 'visao' && erroPainel && React.createElement("div", { className: "aviso-box", style: { color: 'var(--erro)' } }, erroPainel),
        ['cargas', 'detalhes'].includes(subPainel) && carregandoCargasPainel && React.createElement("div", { className: "aviso-box" }, progressoPainel || 'Carregando cargas, motoristas e apurações salvas...'),
        ['cargas', 'detalhes'].includes(subPainel) && erroCargasPainel && React.createElement("div", { className: "aviso-box", style: { color: 'var(--erro)' } }, erroCargasPainel),
        !carregandoPainel && !erroPainel && subPainel === 'visao' && React.createElement(React.Fragment, null,
            React.createElement("div", { className: "card", style: { padding: 12 } },
                React.createElement("div", { className: "row", style: { flexWrap: 'wrap', alignItems: 'end' } },
                    React.createElement("label", { style: { minWidth: 220 } },
                        "Per\u00EDodo das pend\u00EAncias",
                        React.createElement("select", { value: periodoPendencias, onChange: e => setPeriodoPendencias(e.target.value) },
                            React.createElement("option", { value: "TODOS" }, "Todos os meses"),
                            MESES_2026.map(m => React.createElement("option", { key: m, value: m }, mesLabel(m))))),
                    React.createElement("div", { className: "muted grow" }, "Os cards mostram somente registros aguardando decis\u00E3o. Clique para abrir diretamente a tela respons\u00E1vel."))),
            React.createElement("div", { className: "cards4" },
                React.createElement("button", { className: "card kpi card-atalho", disabled: !pode(user, 'contestacoes.visualizar'), onClick: () => abrirModulo('contest', { tipoContestacao: 'ERRO_CARGA', competencia: competenciaPendencias }) },
                    React.createElement("span", { className: "seta-card" }, "\u2192"),
                    React.createElement("div", { className: "l" }, "Cargas"),
                    React.createElement("div", { className: "v num", style: { color: totalContestacoesCarga ? 'var(--erro)' : 'var(--mata)' } }, pode(user, 'contestacoes.visualizar') ? totalContestacoesCarga : '—'),
                    React.createElement("div", { className: "muted" }, "Contesta\u00E7\u00F5es de carga pendentes")),
                React.createElement("button", { className: "card kpi card-atalho", disabled: !pode(user, 'contestacoes.visualizar'), onClick: () => abrirModulo('contest', { tipoContestacao: 'DIVERGENCIA_PBT', competencia: competenciaPendencias }) },
                    React.createElement("span", { className: "seta-card" }, "\u2192"),
                    React.createElement("div", { className: "l" }, "PBT"),
                    React.createElement("div", { className: "v num", style: { color: totalPBT ? 'var(--erro)' : 'var(--mata)' } }, pode(user, 'contestacoes.visualizar') ? totalPBT : '—'),
                    React.createElement("div", { className: "muted" }, "Diverg\u00EAncias de peso aguardando decis\u00E3o")),
                React.createElement("button", { className: "card kpi card-atalho", disabled: !pode(user, 'checklist.aprovacao'), onClick: () => abrirModulo('check', { sub: 'aprovar', competencia: competenciaPendencias }) },
                    React.createElement("span", { className: "seta-card" }, "\u2192"),
                    React.createElement("div", { className: "l" }, "Check list"),
                    React.createElement("div", { className: "v num", style: { color: totalChecklist ? 'var(--colheita-escura)' : 'var(--mata)' } }, pode(user, 'checklist.aprovacao') ? totalChecklist : '—'),
                    React.createElement("div", { className: "muted" }, "Aguardando aprova\u00E7\u00E3o ou reprova\u00E7\u00E3o")),
                React.createElement("button", { className: "card kpi card-atalho", disabled: !pode(user, 'sinistros.visualizar'), onClick: () => abrirModulo('sinistros', { sub: 'gestao', status: 'ABERTOS', competencia: competenciaPendencias }) },
                    React.createElement("span", { className: "seta-card" }, "\u2192"),
                    React.createElement("div", { className: "l" }, "Sinistros"),
                    React.createElement("div", { className: "v num", style: { color: totalSinistros ? 'var(--erro)' : 'var(--mata)' } }, pode(user, 'sinistros.visualizar') ? totalSinistros : '—'),
                    React.createElement("div", { className: "muted" }, "Registros em aberto para tratamento"))),
            React.createElement("div", { className: "aviso-box" }, "O painel apenas sinaliza o volume pendente e direciona para o m\u00F3dulo de origem. A decis\u00E3o continua sendo registrada na tela respons\u00E1vel.")),
        !carregandoCargasPainel && !erroCargasPainel && subPainel === 'cargas' && React.createElement(React.Fragment, null,
            React.createElement(FiltrosCargas, null),
            React.createElement("div", { className: "cards4", style: { marginTop: 12 } },
                React.createElement("div", { className: "card kpi" },
                    React.createElement("div", { className: "l" }, "Motoristas"),
                    React.createElement("div", { className: "v num" }, linhasFiltradas.length)),
                React.createElement("div", { className: "card kpi" },
                    React.createElement("div", { className: "l" }, "Cargas"),
                    React.createElement("div", { className: "v num" }, totalCargas)),
                React.createElement("div", { className: "card kpi" },
                    React.createElement("div", { className: "l" }, "Peso transportado"),
                    React.createElement("div", { className: "v num" },
                        brn(totalPeso, 1),
                        " t")),
                React.createElement("div", { className: "card kpi" },
                    React.createElement("div", { className: "l" }, "Frete total"),
                    React.createElement("div", { className: "v num" }, brl(totalFrete)))),
            React.createElement("div", { className: "cards4" },
                React.createElement("button", { className: "card kpi", style: { textAlign: 'left', cursor: 'pointer', border: fSituacao === 'PENDENTE' ? '2px solid var(--colheita-escura)' : 'none' }, onClick: () => setFSituacao(fSituacao === 'PENDENTE' ? '' : 'PENDENTE') },
                    React.createElement("div", { className: "l" }, "Pend\u00EAncias"),
                    React.createElement("div", { className: "v num", style: { color: totalPendencias ? 'var(--colheita-escura)' : 'var(--mata)' } }, totalPendencias)),
                React.createElement("button", { className: "card kpi", style: { textAlign: 'left', cursor: 'pointer', border: fSituacao === 'DIVERGENTE' ? '2px solid var(--erro)' : 'none' }, onClick: () => setFSituacao(fSituacao === 'DIVERGENTE' ? '' : 'DIVERGENTE') },
                    React.createElement("div", { className: "l" }, "Diverg\u00EAncias"),
                    React.createElement("div", { className: "v num", style: { color: totalDivergencias ? 'var(--erro)' : 'var(--mata)' } }, totalDivergencias)),
                React.createElement("div", { className: "card kpi" },
                    React.createElement("div", { className: "l" }, "Compet\u00EAncia"),
                    React.createElement("div", { className: "v", style: { fontSize: 18 } }, mesLabel(mes)))),
            React.createElement("div", { className: "card", style: { overflowX: 'auto' } },
                React.createElement("table", null,
                    React.createElement("thead", null,
                        React.createElement("tr", null,
                            React.createElement("th", null, "Motorista"),
                            React.createElement("th", null, "Tipo"),
                            React.createElement("th", { className: "td-num" }, "Cargas"),
                            React.createElement("th", { className: "td-num" }, "Peso (t)"),
                            React.createElement("th", { className: "td-num" }, "Frete"),
                            React.createElement("th", { className: "td-num" }, "Premia\u00E7\u00E3o"),
                            React.createElement("th", { className: "td-num" }, "Pend\u00EAncias"),
                            React.createElement("th", null, "Situa\u00E7\u00E3o"),
                            React.createElement("th", null))),
                    React.createElement("tbody", null,
                        linhasFiltradas.map(l => React.createElement("tr", { key: l.uid || l.u.nome },
                            React.createElement("td", null,
                                React.createElement("b", null, l.u.nome)),
                            React.createElement("td", { className: "muted" }, l.tipo || '—'),
                            React.createElement("td", { className: "td-num num" }, l.cargas.length),
                            React.createElement("td", { className: "td-num num" }, brn(l.peso, 1)),
                            React.createElement("td", { className: "td-num num" }, brl(l.frete)),
                            React.createElement("td", { className: "td-num num" }, brl(l.premiacao)),
                            React.createElement("td", { className: "td-num num" }, l.pendencias || '—'),
                            React.createElement("td", null,
                                React.createElement("b", { style: { color: corSituacao(l.situacao) } }, rotuloSituacao(l.situacao))),
                            React.createElement("td", null,
                                React.createElement("button", { className: "btn btn-s btn-sm", onClick: () => abrirDetalhe(l) }, "Detalhar")))),
                        !linhasFiltradas.length && React.createElement("tr", null,
                            React.createElement("td", { colSpan: "9", className: "muted", style: { textAlign: 'center', padding: 24 } }, "Nenhum motorista encontrado para os filtros selecionados."))))),
            React.createElement("div", { className: "aviso-box" }, "O resumo consulta os dados existentes. O detalhamento abre em uma subtela pr\u00F3pria para evitar uma p\u00E1gina extensa.")));
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
                const nomeAba = wb.SheetNames.find(n => n.toUpperCase().includes('BASE CARGAS FROTA')) ||
                    wb.SheetNames.find(n => n.toUpperCase().trim() === 'CARGAS FROTA');
                if (!nomeAba)
                    throw new Error('Nenhuma aba de cargas encontrada. O arquivo precisa ter a aba "BASE CARGAS FROTA manual" (planilha da premiação) ou "CARGAS FROTA" (relatório).');
                const rows = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], { defval: null });
                if (!rows.length)
                    throw new Error('A aba "' + nomeAba + '" está vazia.');
                const cols = Object.keys(rows[0]);
                const obrig = ['DATA', 'PLACA', 'ORIGEM', 'DESTINO', 'PRODUTO', 'PESO (t)', 'PREMIAÇÃO'];
                const faltando = obrig.filter(c => !cols.includes(c));
                if (faltando.length)
                    throw new Error('Colunas não encontradas na aba "' + nomeAba + '": ' + faltando.join(', ') + '. Confira se a planilha não foi alterada.');
                const colNota = cols.includes('N° NOTA') ? 'N° NOTA' : (cols.includes('Nº NOTA') ? 'Nº NOTA' : null);
                const novas = [];
                rows.forEach(r => {
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
                    novas.push({ data: dt, placa: String(r['PLACA'] || '').trim().toUpperCase(), origem: r['ORIGEM'] || '', destino: r['DESTINO'] || '',
                        produto: r['PRODUTO'] || '', numeroNota: colNota ? String(r[colNota] || '') : '', valorTon: Number(r['R$/t']) || 0,
                        pesoTon: Number(r['PESO (t)']) || 0, pesoBruto: Number(r['PESO BRUTO']) || 0, freteTotal: Number(r['R$ TOTAL']) || 0,
                        premiacao: Number(r['PREMIAÇÃO']) || 0, maiorKM: String(r['MAIOR KM?'] || ''), distancia: Number(r['DISTANCIA']) || 0,
                        freteOriginal: Number(r['FRETE ORIGINAL']) || 0, diferenca: Number(r['DIFERENÇA']) || 0 });
                });
                // Descontos da aba "Lançamento", se existir
                const descNovos = [];
                if (wb.SheetNames.includes('Lançamento')) {
                    const lrows = XLSX.utils.sheet_to_json(wb.Sheets['Lançamento'], { range: 6, defval: null });
                    const jaTem = new Set(st.descontos.map(d => [d.motorista, d.mes, d.item, d.valor].join('|')));
                    lrows.forEach(r => {
                        const item = r['ITEM CONTROLE'];
                        if (!['Multas', 'Notificação / Advertencia', 'Check List'].includes(item))
                            return;
                        const v = Number(r['R$']);
                        if (!v)
                            return;
                        const d = { motorista: r['MOTORISTA'], mes: String(r['MÊS/ANO']), item, valor: v };
                        if (!jaTem.has([d.motorista, d.mes, d.item, d.valor].join('|')))
                            descNovos.push(d);
                    });
                }
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
                React.createElement("b", null, "planilha da premia\u00E7\u00E3o (.xlsm)"),
                " salva no SharePoint \u2014 o app l\u00EA a aba de cargas e tamb\u00E9m a aba \"Lan\u00E7amento\" (multas, advert\u00EAncias e check list). O relat\u00F3rio de cargas (.xlsx) tamb\u00E9m \u00E9 aceito."),
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
    const [carregando, setCarregando] = useState(!CONFIG.MODO_DEMONSTRACAO);
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
        .filter(c => filtro === 'todas' || c.status === filtro)
        .filter(c => tipoFiltro === 'todos' || c.tipoContestacao === tipoFiltro)
        .filter(c => !motoristaFiltro || c.motorista === motoristaFiltro)
        .filter(c => !competenciaFiltro || String(c.dataCarga || c.data || '').slice(0, 7) === competenciaFiltro)
        .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
    const cargaDe = id => st.cargas.find(c => c.id === id);
    const carregar = async () => {
        if (CONFIG.MODO_DEMONSTRACAO)
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
    const responder = async () => {
        if (!resposta.trim()) {
            toast('Informe a justificativa da decisão.');
            return;
        }
        if (CONFIG.MODO_DEMONSTRACAO) {
            setSt(s => ({ ...s, contestacoes: s.contestacoes.map(c => c.id === respondendo.id ? { ...c, status: decisao, resposta: resposta.trim() } : c) }));
            setRespondendo(null);
            setResposta('');
            toast('Contestação respondida.');
            return;
        }
        setSalvando(true);
        try {
            const r = await ApiService.admAnalisarContestacao(respondendo.id, decisao, resposta.trim());
            setSt(s => ({ ...s, contestacoes: s.contestacoes.map(c => c.id === respondendo.id ? r.contestacao : c) }));
            setRespondendo(null);
            setResposta('');
            toast('Contestação respondida.');
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
        carregando && React.createElement("div", { className: "card muted" }, "Carregando contesta\u00E7\u00F5es do SharePoint..."),
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
                            ct.tipoVeiculo || 'Tipo não informado',
                            " \u00B7 Peso bruto ",
                            brn(Number(ct.pesoCarga || 0), 0),
                            " kg \u00B7 Limite considerado ",
                            brn(Number(ct.limitePBT || 0) + Number(ct.toleranciaPBT || 0), 0),
                            " kg")),
                    React.createElement(StatusTag, { s: ct.status })),
                React.createElement("div", { className: "row muted", style: { marginTop: 8, gap: 18, flexWrap: 'wrap', fontSize: 13 } },
                    React.createElement("span", null,
                        React.createElement("b", null, "Data do pedido:"),
                        " ",
                        dataBR(ct.data)),
                    React.createElement("span", null,
                        React.createElement("b", null, "Data da carga:"),
                        " ",
                        dataBR(ct.dataCarga || (c && c.data))),
                    ct.status !== 'pendente' && React.createElement("span", null,
                        React.createElement("b", null, "Analisado por:"),
                        " ",
                        ct.analisadoPor || 'Não informado'),
                    ct.status !== 'pendente' && React.createElement("span", null,
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
                ct.status === 'pendente' &&
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
/* ================= ADM: CHECK LIST (aprovação + perguntas + relatório) ================= */
function AdmChecklist({ st, setSt, toast, user, foco }) {
    /* ALTERAÇÃO V6: fora do modo demonstração, o painel carrega os registros pela
       API (GET /admin/checklists) em vez de usar apenas o estado do navegador. */
    const [sub, setSub] = useState(pode(user, 'checklist.aprovacao') ? 'aprovar' : pode(user, 'checklist.perguntas') ? 'perguntas' : 'relatorio');
    const [sincronizando, setSincronizando] = useState(false);
    const sincronizar = async () => {
        if (CONFIG.MODO_DEMONSTRACAO) {
            toast('Modo demonstração: dados locais. Configure a URL da Azure Function e desative MODO_DEMONSTRACAO para consultar o SharePoint.');
            return;
        }
        setSincronizando(true);
        try {
            const r = await ApiService.admListarChecklists();
            const vindos = (r.itens || r.checklists || []).map(x => ({
                id: x.protocolo, idLocal: x.idLocal, motorista: x.motoristaNome, placa: x.placa,
                frota: (x.tipoChecklist === 'LEVE' ? 'leve' : 'pesada'), data: (x.dataHoraLocal || '').slice(0, 10),
                status: (x.status || 'PENDENTE').toLowerCase() === 'aprovado' ? 'aprovado' : ((x.status || '').toLowerCase() === 'reprovado' ? 'reprovado' : 'pendente'),
                motivoReprova: x.motivoReprovacao || '', km: x.quilometragem, combustivel: '',
                respostas: (x.respostas || []).map(rr => ({ pid: rr.idPergunta, pergunta: rr.pergunta || '', resp: rr.resposta, obs: rr.observacao || '', foto: rr.linkFoto || null }))
            }));
            setSt(s => ({ ...s, checklists: vindos.length ? vindos : s.checklists }));
            toast('Sincronizado: ' + vindos.length + ' checklist(s) carregado(s) do servidor.');
        }
        catch (e) {
            toast('Falha ao sincronizar: ' + e.message);
        }
        finally {
            setSincronizando(false);
        }
    };
    const [ver, setVer] = useState(null);
    const [reprovando, setReprovando] = useState(null);
    const [motivoRep, setMotivoRep] = useState('');
    const [bloquearAoAprovar, setBloquearAoAprovar] = useState(false);
    const [motivoBloqueio, setMotivoBloqueio] = useState('');
    const [veiculosBloqueados, setVeiculosBloqueados] = useState([]);
    const [carregandoBloqueados, setCarregandoBloqueados] = useState(false);
    const [liberandoVeiculo, setLiberandoVeiculo] = useState(null);
    const [observacaoLiberacao, setObservacaoLiberacao] = useState('');
    const perguntaVazia = { texto: '', grupo: 'Anomalias estéticas', frota: 'pesada', frequencia: 'Diária', ordem: 10, obrigatoria: true, fotoNC: false, ativa: true };
    const [novaPerg, setNovaPerg] = useState(perguntaVazia);
    const [editandoPergunta, setEditandoPergunta] = useState(null);
    const [fFrota, setFFrota] = useState('pesada');
    const [fMot, setFMot] = useState('todos');
    const mesAtualFiltro = String(HOJE || '').slice(0, 7);
    const [fMes, setFMes] = useState(mesAtualFiltro);
    const [fPlaca, setFPlaca] = useState('todas');
    const [fStatus, setFStatus] = useState('todos');
    const [fMesAprovacao, setFMesAprovacao] = useState('');
    const [carregandoCatalogo, setCarregandoCatalogo] = useState(false);
    useEffect(() => {
        if (!foco?.chave || !pode(user, 'checklist.aprovacao'))
            return;
        setSub('aprovar');
        setFMesAprovacao(foco.parametros?.competencia || '');
    }, [foco?.chave]);
    const carregarCatalogo = async () => {
        setCarregandoCatalogo(true);
        try {
            const r = await ApiService.obterPerguntas('TODAS', { incluirInativas: true });
            const lista = (r.perguntas || []).map(p => ({
                id: String(p.id),
                texto: p.texto || '',
                grupo: p.grupo || 'Outros',
                frota: (p.tipoFrota || '').toLowerCase(),
                frequencia: p.frequencia || 'Diária',
                obrigatoria: p.obrigatoria === true,
                fotoNC: p.fotoObrigatoriaNC === true,
                observacaoObrigatoriaNC: p.observacaoObrigatoriaNC === true,
                ativa: p.ativa !== false,
                ordem: Number(p.ordem || 999)
            })).sort((a, b) => a.grupo.localeCompare(b.grupo, 'pt-BR') || a.ordem - b.ordem);
            setSt(s => ({ ...s, perguntas: lista }));
        }
        catch (e) {
            toast('Erro ao carregar perguntas do SharePoint: ' + e.message);
        }
        finally {
            setCarregandoCatalogo(false);
        }
    };
    const carregarBloqueados = async () => {
        setCarregandoBloqueados(true);
        try {
            const r = await ApiService.admVeiculosBloqueados();
            setVeiculosBloqueados(r.veiculos || []);
        }
        catch (e) {
            toast('Erro ao carregar veículos bloqueados: ' + e.message);
        }
        finally {
            setCarregandoBloqueados(false);
        }
    };
    useEffect(() => { carregarCatalogo(); sincronizar(); carregarBloqueados(); }, []);
    const pendentesTodos = st.checklists.filter(c => c.status === 'pendente');
    const pendentes = pendentesTodos.filter(c => !fMesAprovacao || String(c.data || '').slice(0, 7) === fMesAprovacao);
    const decidir = async (ck, status, motivo, opcoes = {}) => {
        if (status === 'aprovado' && opcoes.bloquearVeiculo === true && !String(opcoes.motivoBloqueio || '').trim()) {
            toast('Informe o motivo do bloqueio do veículo.');
            return;
        }
        if (!CONFIG.MODO_DEMONSTRACAO && ck.id && !String(ck.id).startsWith('DEMO-')) {
            try {
                await ApiService.admStatus(ck.id, status === 'aprovado' ? 'APROVADO' : 'REPROVADO', motivo || '', opcoes);
            }
            catch (e) {
                toast('Não foi possível gravar a decisão no SharePoint: ' + e.message);
                return;
            }
        }
        setSt(s => ({ ...s, checklists: s.checklists.map(x => x.id === ck.id ? { ...x, status, motivoReprova: motivo || '' } : x) }));
        setVer(null);
        setReprovando(null);
        setMotivoRep('');
        setBloquearAoAprovar(false);
        setMotivoBloqueio('');
        if (opcoes.bloquearVeiculo === true)
            await carregarBloqueados();
        toast(status === 'aprovado' ? (opcoes.bloquearVeiculo ? 'Check list aprovado e veículo bloqueado.' : 'Check list aprovado.') : 'Check list reprovado — o motorista deverá refazer.');
    };
    const liberarVeiculo = async () => {
        if (!liberandoVeiculo)
            return;
        try {
            await ApiService.admLiberarVeiculo(liberandoVeiculo.itemId, observacaoLiberacao);
            toast('Veículo liberado com sucesso.');
            setLiberandoVeiculo(null);
            setObservacaoLiberacao('');
            await carregarBloqueados();
        }
        catch (e) {
            toast('Erro ao liberar veículo: ' + e.message);
        }
    };
    const salvarPergunta = async () => {
        if (!novaPerg.texto.trim()) {
            toast('Escreva o texto da pergunta.');
            return;
        }
        const ordem = Number(novaPerg.ordem);
        if (!Number.isFinite(ordem) || ordem < 0) {
            toast('Informe uma ordem numérica igual ou maior que zero.');
            return;
        }
        try {
            const dados = {
                texto: novaPerg.texto.trim(),
                grupo: novaPerg.grupo,
                tipoFrota: novaPerg.frota.toUpperCase(),
                frequencia: novaPerg.frequencia,
                ordem,
                obrigatoria: novaPerg.obrigatoria,
                fotoObrigatoriaNC: novaPerg.fotoNC,
                observacaoObrigatoriaNC: true,
                ativa: novaPerg.ativa !== false
            };
            if (editandoPergunta)
                await ApiService.atualizarPergunta(editandoPergunta.id, dados);
            else
                await ApiService.criarPergunta(dados);
            await carregarCatalogo();
            setNovaPerg({ ...perguntaVazia, grupo: novaPerg.grupo, frota: novaPerg.frota, frequencia: novaPerg.frequencia, ordem: ordem + 10 });
            setEditandoPergunta(null);
            toast(editandoPergunta ? 'Pergunta atualizada no SharePoint.' : 'Pergunta salva no SharePoint.');
        }
        catch (e) {
            toast('Erro ao salvar pergunta: ' + e.message);
        }
    };
    const iniciarEdicao = p => { setEditandoPergunta(p); setNovaPerg({ texto: p.texto, grupo: p.grupo, frota: p.frota, frequencia: p.frequencia, ordem: p.ordem, obrigatoria: p.obrigatoria, fotoNC: p.fotoNC, ativa: p.ativa }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    const alternarPergunta = async (p) => { try {
        await ApiService.atualizarPergunta(p.id, { texto: p.texto, grupo: p.grupo, tipoFrota: p.frota.toUpperCase(), frequencia: p.frequencia, ordem: p.ordem, obrigatoria: p.obrigatoria, fotoObrigatoriaNC: p.fotoNC, observacaoObrigatoriaNC: p.observacaoObrigatoriaNC, ativa: !p.ativa });
        await carregarCatalogo();
        toast(p.ativa ? 'Pergunta inativada.' : 'Pergunta reativada.');
    }
    catch (e) {
        toast('Erro ao alterar pergunta: ' + e.message);
    } };
    const motoristas = [...new Set(st.checklists.map(c => c.motorista).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const placas = [...new Set(st.checklists.map(c => c.placa).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const relatorio = st.checklists.filter(c => (!fMes || String(c.data || '').slice(0, 7) === fMes) && (fPlaca === 'todas' || c.placa === fPlaca) && (fMot === 'todos' || c.motorista === fMot) && (fStatus === 'todos' || c.status === fStatus)).sort((a, b) => b.data.localeCompare(a.data));
    const totaisRelatorio = { total: relatorio.length, aprovados: relatorio.filter(c => c.status === 'aprovado').length, reprovados: relatorio.filter(c => c.status === 'reprovado').length, pendentes: relatorio.filter(c => c.status === 'pendente').length };
    return (React.createElement(React.Fragment, null,
        React.createElement("div", { className: "row", style: { flexWrap: 'wrap' } },
            React.createElement("h2", { className: "grow" }, "Check list veicular"),
            React.createElement("button", { className: "btn btn-s btn-sm", disabled: sincronizando, onClick: sincronizar }, sincronizando ? 'Sincronizando...' : 'Sincronizar com servidor'),
            React.createElement("div", { className: "subtabs" },
                pode(user, 'checklist.aprovacao') && React.createElement("button", { className: 'subtab' + (sub === 'aprovar' ? ' on' : ''), onClick: () => setSub('aprovar') },
                    "Aprovar (",
                    pendentes.length,
                    ")"),
                pode(user, 'checklist.aprovacao') && React.createElement("button", { className: 'subtab' + (sub === 'bloqueados' ? ' on' : ''), onClick: () => { setSub('bloqueados'); carregarBloqueados(); } },
                    "Ve\u00EDculos bloqueados (",
                    veiculosBloqueados.length,
                    ")"),
                pode(user, 'checklist.perguntas') && React.createElement("button", { className: 'subtab' + (sub === 'perguntas' ? ' on' : ''), onClick: () => setSub('perguntas') }, "Perguntas"),
                pode(user, 'checklist.relatorio') && React.createElement("button", { className: 'subtab' + (sub === 'relatorio' ? ' on' : ''), onClick: () => setSub('relatorio') }, "Relat\u00F3rio"))),
        sub === 'aprovar' && pode(user, 'checklist.aprovacao') && React.createElement(React.Fragment, null,
            React.createElement("div", { className: "card", style: { padding: 12 } },
                React.createElement("div", { className: "row", style: { flexWrap: 'wrap', alignItems: 'end' } },
                    React.createElement("label", { style: { minWidth: 190 } },
                        "Compet\u00EAncia",
                        React.createElement("input", { type: "month", value: fMesAprovacao, onChange: e => setFMesAprovacao(e.target.value) })),
                    fMesAprovacao && React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => setFMesAprovacao('') }, "Todos os meses"),
                    React.createElement("div", { className: "muted grow" },
                        pendentes.length,
                        " checklist(s) aguardando decis\u00E3o no per\u00EDodo selecionado."))),
            pendentes.length === 0 && React.createElement("div", { className: "card muted" }, "Nenhum check list aguardando aprova\u00E7\u00E3o no per\u00EDodo selecionado."),
            pendentes.map(ck => React.createElement("div", { className: "card row", key: ck.id },
                React.createElement("div", { className: "grow" },
                    React.createElement("b", null, primeiroNome(ck.motorista)),
                    React.createElement("div", { className: "muted" },
                        dataBR(ck.data),
                        " \u00B7 ",
                        ck.placa,
                        " \u00B7 ",
                        ck.respostas.filter(r => r.resp === 'NC').length,
                        " n\u00E3o conformidade(s)")),
                React.createElement("button", { className: "btn btn-s btn-sm", onClick: () => setVer(ck) }, "Analisar")))),
        sub === 'bloqueados' && pode(user, 'checklist.aprovacao') && React.createElement(React.Fragment, null,
            React.createElement("div", { className: "card" },
                React.createElement("div", { className: "row" },
                    React.createElement("div", { className: "grow" },
                        React.createElement("h3", null, "Ve\u00EDculos bloqueados temporariamente"),
                        React.createElement("div", { className: "muted" }, "Bloqueios definidos ap\u00F3s an\u00E1lise de checklist, sinistro ou decis\u00E3o operacional.")),
                    React.createElement("button", { className: "btn btn-s btn-sm", onClick: carregarBloqueados }, carregandoBloqueados ? 'Atualizando...' : 'Atualizar'))),
            !carregandoBloqueados && veiculosBloqueados.length === 0 && React.createElement("div", { className: "card muted" }, "Nenhum ve\u00EDculo bloqueado no momento."),
            veiculosBloqueados.map(v => React.createElement("div", { className: "card row", key: v.itemId },
                React.createElement("div", { className: "grow" },
                    React.createElement("b", null, v.placa),
                    React.createElement("div", { className: "muted" },
                        v.motivo || 'Motivo não informado',
                        v.bloqueadoEm ? ' · ' + fmtDataHora(v.bloqueadoEm) : '')),
                React.createElement("button", { className: "btn btn-p btn-sm", onClick: () => { setLiberandoVeiculo(v); setObservacaoLiberacao(''); } }, "Liberar ve\u00EDculo")))),
        sub === 'perguntas' && pode(user, 'checklist.perguntas') && React.createElement(React.Fragment, null,
            React.createElement("div", { className: "card" },
                React.createElement("h3", { style: { marginBottom: 10 } }, editandoPergunta ? 'Editar pergunta' : 'Nova pergunta'),
                React.createElement("div", { className: "form-grid" },
                    React.createElement("div", { style: { gridColumn: '1/-1' } },
                        React.createElement("label", { htmlFor: "adm-checklist-texto" }, "Texto"),
                        React.createElement("input", { id: "adm-checklist-texto", name: "adm-checklist-texto", autoComplete: "off", value: novaPerg.texto, onChange: e => setNovaPerg({ ...novaPerg, texto: e.target.value }), placeholder: "Ex.: Cintas e catracas de amarra\u00E7\u00E3o em condi\u00E7\u00F5es" })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-checklist-tipoveiculo" }, "TipoVe\u00EDculo"),
                        React.createElement("select", { id: "adm-checklist-tipoveiculo", name: "adm-checklist-tipoveiculo", value: novaPerg.frota, onChange: e => setNovaPerg({ ...novaPerg, frota: e.target.value }) },
                            React.createElement("option", { value: "leve" }, "FROTA LEVE"),
                            React.createElement("option", { value: "pesada" }, "FROTA PESADA"))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-checklist-grupo" }, "Grupo"),
                        React.createElement("select", { id: "adm-checklist-grupo", name: "adm-checklist-grupo", value: novaPerg.grupo, onChange: e => setNovaPerg({ ...novaPerg, grupo: e.target.value }) },
                            React.createElement("option", { value: "Anomalias est\u00E9ticas" }, "Anomalias est\u00E9ticas"),
                            React.createElement("option", { value: "Anomalias mec\u00E2nicas" }, "Anomalias mec\u00E2nicas"),
                            React.createElement("option", { value: "Anomalias el\u00E9tricas" }, "Anomalias el\u00E9tricas"))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-checklist-frequencia" }, "Frequ\u00EAncia"),
                        React.createElement("select", { id: "adm-checklist-frequencia", name: "adm-checklist-frequencia", value: novaPerg.frequencia, onChange: e => setNovaPerg({ ...novaPerg, frequencia: e.target.value }) },
                            React.createElement("option", { value: "Di\u00E1ria" }, "Di\u00E1ria"),
                            React.createElement("option", { value: "Semanal" }, "Semanal"),
                            React.createElement("option", { value: "Mensal" }, "Mensal"))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-checklist-ordem-dentro-do-grupo" }, "Ordem dentro do grupo"),
                        React.createElement("input", { id: "adm-checklist-ordem-dentro-do-grupo", name: "adm-checklist-ordem-dentro-do-grupo", autoComplete: "off", type: "number", min: "0", step: "1", value: novaPerg.ordem, onChange: e => setNovaPerg({ ...novaPerg, ordem: e.target.value }) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-checklist-resposta-obrigatoria" }, "Resposta obrigat\u00F3ria?"),
                        React.createElement("select", { id: "adm-checklist-resposta-obrigatoria", name: "adm-checklist-resposta-obrigatoria", value: novaPerg.obrigatoria ? 's' : 'n', onChange: e => setNovaPerg({ ...novaPerg, obrigatoria: e.target.value === 's' }) },
                            React.createElement("option", { value: "s" }, "Sim"),
                            React.createElement("option", { value: "n" }, "N\u00E3o"))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-checklist-foto-obrigatoria-se-nc" }, "Foto obrigat\u00F3ria se NC?"),
                        React.createElement("select", { id: "adm-checklist-foto-obrigatoria-se-nc", name: "adm-checklist-foto-obrigatoria-se-nc", value: novaPerg.fotoNC ? 's' : 'n', onChange: e => setNovaPerg({ ...novaPerg, fotoNC: e.target.value === 's' }) },
                            React.createElement("option", { value: "n" }, "N\u00E3o"),
                            React.createElement("option", { value: "s" }, "Sim")))),
                React.createElement("div", { className: "row", style: { marginTop: 12 } },
                    React.createElement("button", { className: "btn btn-p", onClick: salvarPergunta }, editandoPergunta ? 'Salvar alterações' : 'Adicionar pergunta'),
                    editandoPergunta && React.createElement("button", { className: "btn btn-s", onClick: () => { setEditandoPergunta(null); setNovaPerg(perguntaVazia); } }, "Cancelar edi\u00E7\u00E3o"))),
            React.createElement("div", { className: "row", style: { flexWrap: 'wrap' } },
                React.createElement("div", { className: "subtabs grow" }, [['pesada', 'Frota pesada'], ['leve', 'Frota leve'], ['todas', 'Todas']].map(([v, l]) => React.createElement("button", { key: v, className: 'subtab' + (fFrota === v ? ' on' : ''), onClick: () => setFFrota(v) }, l))),
                React.createElement("button", { className: "btn btn-s btn-sm", disabled: carregandoCatalogo, onClick: carregarCatalogo }, carregandoCatalogo ? 'Atualizando...' : 'Atualizar do SharePoint')),
            React.createElement("div", { className: "card", style: { overflowX: 'auto' } },
                React.createElement("table", null,
                    React.createElement("thead", null,
                        React.createElement("tr", null,
                            React.createElement("th", null, "Pergunta"),
                            React.createElement("th", null, "Grupo"),
                            React.createElement("th", null, "Ordem"),
                            React.createElement("th", null, "TipoVe\u00EDculo"),
                            React.createElement("th", null, "Frequ\u00EAncia"),
                            React.createElement("th", null, "Obrigat\u00F3ria"),
                            React.createElement("th", null, "Foto se NC"),
                            React.createElement("th", null, "Ativa"),
                            React.createElement("th", null, "A\u00E7\u00F5es"))),
                    React.createElement("tbody", null, st.perguntas.filter(p => fFrota === 'todas' || p.frota === fFrota || p.frota === 'ambas').map(p => React.createElement("tr", { key: p.id, style: { opacity: p.ativa ? 1 : .45 } },
                        React.createElement("td", null, p.texto),
                        React.createElement("td", { className: "muted" }, p.grupo),
                        React.createElement("td", null,
                            React.createElement("b", null, p.ordem)),
                        React.createElement("td", null,
                            React.createElement("span", { className: "tag tag-neutro" }, p.frota === 'leve' ? 'Frota leve' : 'Frota pesada')),
                        React.createElement("td", null,
                            React.createElement("span", { className: "tag tag-neutro" }, p.frequencia || 'Diária')),
                        React.createElement("td", null, p.obrigatoria ? 'Sim' : 'Não'),
                        React.createElement("td", null, p.fotoNC ? 'Sim' : 'Não'),
                        React.createElement("td", null,
                            React.createElement("span", { className: 'tag ' + (p.ativa ? 'tag-ok' : 'tag-neg') }, p.ativa ? 'Ativa' : 'Inativa')),
                        React.createElement("td", null,
                            React.createElement("div", { className: "row", style: { gap: 6, flexWrap: 'nowrap' } },
                                React.createElement("button", { className: "btn btn-s btn-sm", onClick: () => iniciarEdicao(p) }, "Editar"),
                                React.createElement("button", { className: 'btn btn-sm ' + (p.ativa ? 'btn-s' : 'btn-p'), onClick: () => alternarPergunta(p) }, p.ativa ? 'Inativar' : 'Reativar'))))))))),
        sub === 'relatorio' && pode(user, 'checklist.relatorio') && React.createElement(React.Fragment, null,
            React.createElement("div", { className: "row", style: { flexWrap: 'wrap' } },
                React.createElement("div", { className: "row", style: { gap: 6, flexWrap: 'nowrap' } },
                    React.createElement("input", { type: "month", "aria-label": "Filtrar relat\u00F3rio por m\u00EAs", style: { width: 'auto' }, value: fMes, onChange: e => setFMes(e.target.value) }),
                    React.createElement("button", { className: "btn btn-g btn-sm", type: "button", onClick: () => setFMes('') }, "Todos os meses")),
                React.createElement("select", { style: { width: 'auto' }, value: fPlaca, onChange: e => setFPlaca(e.target.value) },
                    React.createElement("option", { value: "todas" }, "Todas as placas"),
                    placas.map(p => React.createElement("option", { key: p, value: p }, p))),
                React.createElement("select", { style: { width: 'auto' }, value: fMot, onChange: e => setFMot(e.target.value) },
                    React.createElement("option", { value: "todos" }, "Todos os motoristas"),
                    motoristas.map(m => React.createElement("option", { key: m, value: m }, primeiroNome(m)))),
                React.createElement("select", { style: { width: 'auto' }, value: fStatus, onChange: e => setFStatus(e.target.value) },
                    React.createElement("option", { value: "todos" }, "Todos os status"),
                    React.createElement("option", { value: "pendente" }, "Aguardando an\u00E1lise"),
                    React.createElement("option", { value: "aprovado" }, "Aprovados"),
                    React.createElement("option", { value: "reprovado" }, "Reprovados")),
                React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => { setFMes(''); setFPlaca('todas'); setFMot('todos'); setFStatus('todos'); } }, "Limpar filtros")),
            React.createElement("div", { className: "totais" },
                React.createElement("div", { className: "card" },
                    React.createElement("div", { className: "v num" }, totaisRelatorio.total),
                    React.createElement("div", { className: "l" }, "Checklists")),
                React.createElement("div", { className: "card" },
                    React.createElement("div", { className: "v num", style: { color: 'var(--mata)' } }, totaisRelatorio.aprovados),
                    React.createElement("div", { className: "l" }, "Aprovados")),
                React.createElement("div", { className: "card" },
                    React.createElement("div", { className: "v num", style: { color: totaisRelatorio.reprovados ? 'var(--erro)' : 'var(--mata)' } }, totaisRelatorio.reprovados),
                    React.createElement("div", { className: "l" }, "Reprovados")),
                React.createElement("div", { className: "card" },
                    React.createElement("div", { className: "v num" }, totaisRelatorio.pendentes),
                    React.createElement("div", { className: "l" }, "Aguardando"))),
            relatorio.length === 0 && React.createElement("div", { className: "card muted" }, "Nenhum checklist encontrado nos filtros selecionados."),
            relatorio.map(ck => React.createElement("div", { className: "card row", key: ck.id },
                React.createElement("div", { className: "grow" },
                    React.createElement("b", null, primeiroNome(ck.motorista)),
                    " ",
                    React.createElement("span", { className: "muted" },
                        "\u00B7 ",
                        dataBR(ck.data),
                        " \u00B7 ",
                        ck.placa),
                    React.createElement("div", { className: "muted" },
                        ck.respostas.filter(r => r.resp === 'NC').length,
                        " NC \u00B7 ",
                        ck.respostas.filter(r => r.foto).length,
                        " foto(s)")),
                React.createElement(StatusTag, { s: ck.status }),
                React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => setVer(ck) }, "Ver")))),
        ver && !reprovando &&
            React.createElement(ChecklistDetalhe, { ck: ver, perguntas: st.perguntas, onClose: () => setVer(null), acoes: ver.status === 'pendente' &&
                    React.createElement("div", null,
                        React.createElement("div", { className: "card", style: { boxShadow: 'none', border: '1px solid var(--linha)', marginBottom: 10 } },
                            React.createElement("label", { htmlFor: "adm-checklist-bloquear-o-veiculo-apos-aprovar" }, "Bloquear o ve\u00EDculo ap\u00F3s aprovar?"),
                            React.createElement("select", { id: "adm-checklist-bloquear-o-veiculo-apos-aprovar", name: "adm-checklist-bloquear-o-veiculo-apos-aprovar", value: bloquearAoAprovar ? 's' : 'n', onChange: e => setBloquearAoAprovar(e.target.value === 's') },
                                React.createElement("option", { value: "n" }, "N\u00E3o"),
                                React.createElement("option", { value: "s" }, "Sim")),
                            bloquearAoAprovar && React.createElement("div", { style: { marginTop: 10 } },
                                React.createElement("label", { htmlFor: "adm-checklist-motivo-do-bloqueio" }, "Motivo do bloqueio"),
                                React.createElement("textarea", { id: "adm-checklist-motivo-do-bloqueio", name: "adm-checklist-motivo-do-bloqueio", rows: "2", value: motivoBloqueio, onChange: e => setMotivoBloqueio(e.target.value), placeholder: "Ex.: pneu com avaria impeditiva; aguardar manuten\u00E7\u00E3o." }))),
                        React.createElement("div", { className: "row" },
                            React.createElement("button", { className: "btn btn-d grow", onClick: () => setReprovando(ver) }, "Reprovar"),
                            React.createElement("button", { className: "btn btn-p grow", onClick: () => decidir(ver, 'aprovado', '', { bloquearVeiculo: bloquearAoAprovar, motivoBloqueio }) }, "Aprovar"))) }),
        reprovando &&
            React.createElement(Modal, { titulo: "Reprovar check list", onClose: () => setReprovando(null) },
                React.createElement("label", { htmlFor: "adm-checklist-motivo-o-motorista-vera-e-devera-refazer" }, "Motivo (o motorista ver\u00E1 e dever\u00E1 refazer)"),
                React.createElement("textarea", { id: "adm-checklist-motivo-o-motorista-vera-e-devera-refazer", name: "adm-checklist-motivo-o-motorista-vera-e-devera-refazer", rows: "3", value: motivoRep, onChange: e => setMotivoRep(e.target.value), placeholder: "Ex.: foto do vazamento n\u00E3o permite identificar o local; refazer com foto mais pr\u00F3xima." }),
                React.createElement("button", { className: "btn btn-d", style: { width: '100%', marginTop: 12 }, onClick: () => { if (!motivoRep.trim()) {
                        toast('Informe o motivo da reprovação.');
                        return;
                    } decidir(reprovando, 'reprovado', motivoRep.trim()); } }, "Confirmar reprova\u00E7\u00E3o")),
        liberandoVeiculo && React.createElement(Modal, { titulo: 'Liberar veículo ' + liberandoVeiculo.placa, onClose: () => setLiberandoVeiculo(null) },
            React.createElement("div", { className: "aviso-box" },
                "Motivo atual: ",
                liberandoVeiculo.motivo || 'Não informado'),
            React.createElement("label", { htmlFor: "adm-checklist-observacao-da-liberacao" }, "Observa\u00E7\u00E3o da libera\u00E7\u00E3o"),
            React.createElement("textarea", { id: "adm-checklist-observacao-da-liberacao", name: "adm-checklist-observacao-da-liberacao", rows: "3", value: observacaoLiberacao, onChange: e => setObservacaoLiberacao(e.target.value), placeholder: "Ex.: manuten\u00E7\u00E3o conclu\u00EDda e ve\u00EDculo conferido." }),
            React.createElement("button", { className: "btn btn-p", style: { width: '100%', marginTop: 12 }, onClick: liberarVeiculo }, "Confirmar libera\u00E7\u00E3o"))));
}
/* ================= ADM: PREMIAÇÃO (metas + descontos) ================= */
function AdmPremiacao({ st, setSt, toast, user }) {
    const podeEditarMetas = pode(user, 'metas.editar');
    const podeEditarDescontos = pode(user, 'descontos.editar');
    const [sub, setSub] = useState(pode(user, 'premiacao.visualizar') ? 'painel' : pode(user, 'metas.visualizar') ? 'metas' : 'desc');
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
            toast('Meta salva no SharePoint.');
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
        if (novoDesc.situacao === 'Com ocorrência' && !Number(novoDesc.valor) && !Number(novoDesc.percentual)) {
            toast('Informe o valor ou percentual do desconto.');
            return;
        }
        try {
            await ApiService.salvarDesconto({ ...novoDesc, competencia });
            await carregarDescontos();
            setNovoDesc({ motoristaId: '', motoristaNome: '', categoria: 'Multas', situacao: 'Sem ocorrência', quantidade: 0, valor: 0, percentual: 0, dataOcorrencia: '', motivo: '', exibir: true });
            toast(novoDesc.itemId ? 'Lançamento atualizado no SharePoint.' : 'Conferência salva no SharePoint.');
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
    const prepararConferencia = linha => {
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
                pode(user, 'descontos.visualizar') && React.createElement("button", { className: 'subtab' + (sub === 'desc' ? ' on' : ''), onClick: () => setSub('desc') }, "Descontos"))),
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
                        React.createElement("div", null,
                            React.createElement("label", { htmlFor: "adm-premiacao-valor-do-desconto-r" }, "Valor do desconto (R$)"),
                            React.createElement("input", { id: "adm-premiacao-valor-do-desconto-r", name: "adm-premiacao-valor-do-desconto-r", autoComplete: "off", type: "number", min: "0", value: novoDesc.valor, onChange: e => setNovoDesc({ ...novoDesc, valor: e.target.value }) })),
                        React.createElement("div", null,
                            React.createElement("label", { htmlFor: "adm-premiacao-percentual" }, "Percentual (%)"),
                            React.createElement("input", { id: "adm-premiacao-percentual", name: "adm-premiacao-percentual", autoComplete: "off", type: "number", min: "0", max: "100", value: novoDesc.percentual, onChange: e => setNovoDesc({ ...novoDesc, percentual: e.target.value }) })),
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
        ['ATUALIZARAPURACAOMENSAL_PAINEL', 'Atualizar apuração mensal']
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
        ['PREMIACAO_DESCONTOS', 'Descontos']
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
                throw new Error(resposta?.erro || 'O SharePoint não confirmou o salvamento do usuário.');
            setEdit(null);
            await carregar();
            if (novaSenha)
                window.alert('Acesso salvo com sucesso.\n\nUsuário: ' + login + '\nSenha temporária: ' + novaSenha + '\n\nCopie agora: ela não poderá ser visualizada novamente.');
            else
                toast('Usuário salvo no SharePoint.');
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
            toast('Veículo salvo no SharePoint.');
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
            toast('Tipo de veículo salvo no SharePoint.');
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
    const salvarVinculo = async () => { const u = cad.usuarios.find(x => x.itemId === editVinculo.usuarioItemId), v = cad.veiculos.find(x => x.itemId === editVinculo.veiculoItemId); if (!u || !v) {
        toast('Selecione usuário e veículo.');
        return;
    } try {
        await ApiService.salvarVinculo({ ...editVinculo, usuarioId: u.usuarioId, titulo: u.usuarioId + ' - ' + v.placa });
        setEditVinculo(null);
        await carregar();
        toast('Vínculo salvo no SharePoint.');
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
            const resposta = await ApiService.salvarPerfil({ ...editPerfil, titulo: String(editPerfil.titulo).toUpperCase(), areasAcesso: areasCanon, subtelasAcesso: subtelasValidas });
            if (!resposta?.ok && !resposta?.sucesso)
                throw new Error(resposta?.erro || 'O SharePoint não confirmou o salvamento do perfil.');
            await carregar();
            setEditPerfil(null);
            toast('Perfil salvo no SharePoint.');
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
    const usuariosFiltrados = cad.usuarios
        .filter(u => String(u.nome || '').toLocaleLowerCase('pt-BR').includes(fUsuario.nome.toLocaleLowerCase('pt-BR')) && (!fUsuario.perfil || u.perfil === fUsuario.perfil))
        .sort((a, b) => (fUsuario.ordem.endsWith('desc') ? -1 : 1) * compararTexto(fUsuario.ordem.startsWith('perfil') ? a.perfil : a.nome, fUsuario.ordem.startsWith('perfil') ? b.perfil : b.nome));
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
            React.createElement("div", { className: "muted" }, "Carregando cadastros do SharePoint...")),
        sub === 'usuarios' && podeSub('cadastro.usuarios') && !carregandoCad && !erroCad && React.createElement(React.Fragment, null,
            React.createElement("div", null,
                React.createElement("button", { className: "btn btn-p", onClick: () => { setSenhaVisivel(false); const p = cad.perfis.find(x => x.titulo === 'MOTORISTA'); setEdit({ nome: '', usuarioId: proximoUsuarioId(), login: '', telefone: '', perfil: p?.titulo || '', perfilAcessoId: p?.itemId || '', tipoFrotaAcesso: 'FROTA PESADA', ativo: true, novaSenha: '', acessoCargas: false, acessoPremiacao: false, acessoChecklist: false, acessoSinistros: false, acessoAgendamentos: false, acessoHistorico: false }); } }, "+ Novo usu\u00E1rio")),
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
                            React.createElement("span", { className: 'tag ' + (u.ativo ? 'tag-ok' : 'tag-neutro') }, u.ativo ? 'Ativo' : 'Inativo')),
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
                React.createElement("button", { className: "btn btn-p", onClick: () => setEditVinculo({ vinculoId: 'VIN-' + String(cad.vinculos.length + 1).padStart(3, '0'), usuarioItemId: '', veiculoItemId: '', dataInicio: HOJE, dataFim: '', ativo: true, principal: true, observacao: '' }) }, "+ Novo v\u00EDnculo")),
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
                            React.createElement("button", { className: "btn btn-s btn-sm", onClick: () => setEditPerfil({ ...p, areasAcesso: [...(p.areasAcesso || [])], subtelasAcesso: [...(p.subtelasAcesso || [])] }) }, "Editar")))))))),
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
                        React.createElement("label", null, edit.itemId ? (edit.senhaCadastrada ? 'Redefinir senha (deixe vazio para manter)' : 'Definir senha') : 'Senha inicial'),
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
        editTipo && React.createElement(Modal, { titulo: editTipo.itemId ? 'Editar tipo de veículo' : 'Novo tipo de veículo', onClose: () => setEditTipo(null) },
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
        pode(user, 'painel.visualizar') && ['painel', 'Painel'],
        pode(user, 'importar.criar') && ['importar', 'Importar'],
        pode(user, 'contestacoes.visualizar') && ['contest', 'Contestações'],
        (pode(user, 'sinistros.visualizar') || pode(user, 'sinistros.configuracoes')) && ['sinistros', 'Sinistros'],
        (pode(user, 'agendamentos.agenda') || pode(user, 'agendamentos.monitoramento') || pode(user, 'agendamentos.relatorio')) && ['agendamentos', 'Agendamentos'],
        (pode(user, 'checklist.aprovacao') || pode(user, 'checklist.perguntas') || pode(user, 'checklist.relatorio')) && ['check', 'Check list'],
        (pode(user, 'premiacao.visualizar') || pode(user, 'metas.visualizar') || pode(user, 'descontos.visualizar')) && ['prem', 'Premiação'],
        (pode(user, 'cadastro.usuarios') || pode(user, 'cadastro.tipos_veiculo') || pode(user, 'cadastro.veiculos') || pode(user, 'cadastro.vinculos') || pode(user, 'cadastro.perfis')) && ['cad', 'Cadastros']
    ].filter(Boolean);
    const [aba, setAba] = useState(abas[0]?.[0] || '');
    const [destino, setDestino] = useState(null);
    const navegarPara = (id, parametros = {}) => {
        if (!abas.some(([codigo]) => codigo === id)) {
            toast('Seu perfil não possui acesso ao módulo solicitado.');
            return;
        }
        setDestino({ id, parametros, chave: Date.now() });
        setAba(id);
    };
    useEffect(() => {
        if (CONFIG.MODO_DEMONSTRACAO || !pode(user, 'checklist.administrar'))
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
        }).catch(e => toast('Falha ao carregar checklists do SharePoint: ' + e.message));
    }, []);
    return (React.createElement("div", { className: "ashell" },
        React.createElement("div", { className: "atop" },
            React.createElement("div", { className: "atop-in" },
                React.createElement("div", { className: "marca" },
                    "Bocchi ",
                    React.createElement("em", null, "Frota")),
                React.createElement("nav", { className: "anav grow" }, abas.map(([id, nome]) => React.createElement("button", { key: id, className: aba === id ? 'on' : '', onClick: () => { setDestino(null); setAba(id); } }, nome))),
                React.createElement("button", { className: "btn btn-sm", style: { color: 'rgba(255,255,255,.8)' }, onClick: onSair }, "Sair"))),
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
function App() {
    const [st, setSt] = useState(estadoInicial);
    const [user, setUser] = useState(null);
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
        'cadastro.usuarios',
        'cadastro.tipos_veiculo',
        'cadastro.veiculos',
        'cadastro.vinculos',
        'cadastro.perfis'
    ].some(permissao => pode(userAtual, permissao)) ||
        permissoesDoUsuario(userAtual).has('*');
    return (React.createElement(React.Fragment, null,
        !userAtual && React.createElement(Login, { st: st, onLogin: setUser }),
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
