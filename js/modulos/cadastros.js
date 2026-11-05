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
