function AdmPainel({ st, dados, user, onNavegar }) {
    const podeVisao = podeAbaPainel(user, 'PAINEL_VISAO_GERAL');
    const podeCargas = podeAbaPainel(user, 'PAINEL_CARGAS');
    const [mes, setMes] = useState(MES_ATUAL);
    const [mesAte, setMesAte] = useState(MES_ATUAL);
    const [usuariosPainel, setUsuariosPainel] = useState([]);
    const [vinculosPainel, setVinculosPainel] = useState([]);
    const [resumosPainel, setResumosPainel] = useState([]);
    const [apuracoesPainel, setApuracoesPainel] = useState({});
    const [contestacoesPainel, setContestacoesPainel] = useState([]);
    const [checklistsPainel, setChecklistsPainel] = useState([]);
    const [sinistrosPainel, setSinistrosPainel] = useState([]);
    const [periodoPendencias, setPeriodoPendencias] = useState(MES_ATUAL);
    const [carregandoPainel, setCarregandoPainel] = useState(false);
    const [carregandoCargasPainel, setCarregandoCargasPainel] = useState(false);
    const [erroPainel, setErroPainel] = useState('');
    const [erroCargasPainel, setErroCargasPainel] = useState('');
    const [revisaoPendencias, setRevisaoPendencias] = useState(0);
    const [revisaoCargas, setRevisaoCargas] = useState(podeCargas && !podeVisao ? 1 : 0);
    const [cargasCarregadas, setCargasCarregadas] = useState(false);
    const [fMotorista, setFMotorista] = useState('');
    const [fTipo, setFTipo] = useState('');
    const [fSituacao, setFSituacao] = useState('');
    const [abaPainel, setSubPainel] = useState(podeVisao ? 'visao' : 'cargas');
    const subPainel = abaPainel === 'visao' ? (podeVisao ? 'visao' : 'cargas') : (podeCargas ? abaPainel : 'visao');
    const [motoristaDetalhe, setMotoristaDetalhe] = useState(null);
    const [fBuscaDetalhe, setFBuscaDetalhe] = useState('');
    const [fProdutoDetalhe, setFProdutoDetalhe] = useState('');
    const [fDataInicialDetalhe, setFDataInicialDetalhe] = useState('');
    const [fDataFinalDetalhe, setFDataFinalDetalhe] = useState('');
    const [paginaDetalhe, setPaginaDetalhe] = useState({ chave: '', numero: 1 });
    const [resultadoDetalhe, setResultadoDetalhe] = useState(null);
    const compDeTela = m => { const [mm, aa] = String(m).split('/'); return aa + '-' + mm; };
    const competenciaDe = compDeTela(mes), competenciaAte = compDeTela(mesAte);
    const competenciaInicio = competenciaDe <= competenciaAte ? competenciaDe : competenciaAte;
    const competenciaFim = competenciaDe <= competenciaAte ? competenciaAte : competenciaDe;
    const competencia = competenciaInicio;
    const periodoMultiplo = competenciaInicio !== competenciaFim;
    const inicioMes = `${competenciaInicio}-01`;
    const [anoFim, mesFim] = competenciaFim.split('-');
    const fimMes = new Date(Number(anoFim), Number(mesFim), 0).toISOString().slice(0, 10);
    const rotuloPeriodo = periodoMultiplo ? `${mesLabel(competenciaInicio.slice(5) + '/' + competenciaInicio.slice(0, 4))} a ${mesLabel(competenciaFim.slice(5) + '/' + competenciaFim.slice(0, 4))}` : mesLabel(mes);
    /* Visão geral: carrega somente os módulos de pendência. */
    useEffect(() => {
        if (!podeVisao) return;
        let ativo = true;
        const carregarPendencias = async () => {
            setCarregandoPainel(true);
            setErroPainel('');
            try {
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
    }, [revisaoPendencias, podeVisao]);
    /* Subtela Cargas: dados pesados somente sob demanda. */
    useEffect(() => {
        if (!podeCargas || revisaoCargas === 0)
            return;
        let ativo = true;
        const carregarCargas = async () => {
            setCarregandoCargasPainel(true);
            setErroCargasPainel('');
            try {
                const cargasResp = await ApiService._req('GET', '/cargas/me?' + new URLSearchParams({
                    modo: 'resumo-painel', competencia: competenciaInicio, ateCompetencia: competenciaFim
                }));
                if (!ativo)
                    return;
                if (!Array.isArray(cargasResp.motoristas) || !Array.isArray(cargasResp.resumos))
                    throw new Error('Resposta de Cargas incompatível com esta versão do painel.');
                setUsuariosPainel(cargasResp.motoristas);
                setResumosPainel(cargasResp.resumos);
                setApuracoesPainel(Object.fromEntries(cargasResp.motoristas.filter(u => u.fechado)
                    .map(u => [String(u.id), { status: 'FECHADO' }])));
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
    }, [mes, mesAte, revisaoCargas, podeCargas]);
    const motoristas = usuariosPainel;
    const pendenciasNome = (nome, inicio = competenciaInicio, fim = competenciaFim) => {
        const contestacoes = contestacoesPainel.filter(c => String(c.status || '').toLowerCase() === 'pendente' && String(c.dataCarga || c.data || '').slice(0, 7) >= inicio && String(c.dataCarga || c.data || '').slice(0, 7) <= fim && normalizar(c.motorista) === normalizar(nome)).length;
        const checklists = checklistsPainel.filter(c => String(c.status || '').toLowerCase() === 'pendente' && String(c.data || '').slice(0, 7) >= inicio && String(c.data || '').slice(0, 7) <= fim && normalizar(c.motoristaNome || c.motorista) === normalizar(nome)).length;
        return contestacoes + checklists;
    };
    const motivosCarga = c => [
        !Number(c.peso || c.pesoTon || 0) && 'Peso ausente, zerado ou inválido',
        !Number(c.freteTotal || 0) && 'Frete ausente, zerado ou inválido',
        !String(c.tipoVeiculo ?? "").trim() && 'Tipo de veículo não identificado'
    ].filter(Boolean);
    const rotulosAlertas = ['Peso ausente, zerado ou inválido', 'Frete ausente, zerado ou inválido', 'Tipo de veículo não identificado'];
    const resumir = (u, uid, meses, mesLinha = '') => {
        const quantidade = meses.reduce((s, m) => s + m.quantidade, 0);
        const peso = meses.reduce((s, m) => s + m.peso, 0);
        const frete = meses.reduce((s, m) => s + m.frete, 0);
        const premiacao = meses.reduce((s, m) => s + m.premiacao, 0);
        const tipo = [...new Set(meses.flatMap(m => m.tipos))].join(' / ');
        const codigoMotorista = String(u.usuarioId || '');
        const oficial = (codigoMotorista && apuracoesPainel[codigoMotorista]) || apuracoesPainel[uid];
        const pendencias = pendenciasNome(u.nome, mesLinha || competenciaInicio, mesLinha || competenciaFim);
        const motivos = rotulosAlertas.map((rotulo, i) => {
            const total = meses.reduce((s, m) => s + m.alertas[i], 0);
            return total ? `${rotulo} (${total})` : '';
        }).filter(Boolean);
        let situacao = 'CONFERIDO';
        if (oficial && String(oficial.status || '').toUpperCase() === 'FECHADO')
            situacao = 'FECHADO';
        else if (!quantidade)
            situacao = 'SEM_MOVIMENTO';
        else if (motivos.length > 0)
            situacao = 'DIVERGENTE';
        else if (pendencias > 0)
            situacao = 'PENDENTE';
        return { u, uid, mesLinha, meses, quantidade, peso, frete, premiacao, tipo, pendencias, motivos, oficial, situacao };
    };
    const resumoPorMotorista = new Map();
    for (const resumo of resumosPainel) {
        const uid = String(resumo.usuarioId);
        if (!resumoPorMotorista.has(uid)) resumoPorMotorista.set(uid, []);
        resumoPorMotorista.get(uid).push(resumo);
    }
    const linhas = motoristas.map(u => {
        const uid = idUsuario(u);
        let meses = resumoPorMotorista.get(uid) || [];
        return resumir(u, uid, meses);
    }).sort((a, b) => b.frete - a.frete || a.u.nome.localeCompare(b.u.nome, 'pt-BR'));
    const tipos = [...new Set(linhas.map(l => l.tipo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const linhasComMovimento = linhas.filter(l => l.quantidade > 0);
    const linhasDisponiveis = fSituacao === 'SEM_MOVIMENTO' ? linhas : linhasComMovimento;
    const motoristaSelecionado = linhasDisponiveis.some(l => l.uid === fMotorista) ? fMotorista : '';
    const linhasFiltradas = linhasDisponiveis.filter(l => (!motoristaSelecionado || l.uid === motoristaSelecionado) && (!fTipo || l.tipo === fTipo) && (!fSituacao || l.situacao === fSituacao));
    const [visaoAnalitica, setVisaoAnalitica] = useState(false);
    const linhasTabela = visaoAnalitica && fSituacao !== 'SEM_MOVIMENTO' ? linhasFiltradas.flatMap(l => l.meses.map(m => resumir(l.u, l.uid, [m], m.mes))).sort((a, b) => b.mesLinha.localeCompare(a.mesLinha) || b.frete - a.frete) : linhasFiltradas;
    const rotuloMesLinha = mesLinha => mesLabel(mesLinha.slice(5) + '/' + mesLinha.slice(0, 4));
    const totalPeso = linhasFiltradas.reduce((s, l) => s + l.peso, 0);
    const totalFrete = linhasFiltradas.reduce((s, l) => s + l.frete, 0);
    const totalCargas = linhasFiltradas.reduce((s, l) => s + l.quantidade, 0);
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
        setResultadoDetalhe(null);
        setPaginaDetalhe({ chave: '', numero: 1 });
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
    const consultaDetalhe = motoristaDetalhe ? new URLSearchParams({
        modo: 'detalhe-painel', motorista: motoristaDetalhe.uid,
        competencia: motoristaDetalhe.mesLinha || competenciaInicio,
        ateCompetencia: motoristaDetalhe.mesLinha || competenciaFim,
        busca: fBuscaDetalhe.trim(), produto: fProdutoDetalhe,
        dataDe: fDataInicialDetalhe, dataAte: fDataFinalDetalhe
    }).toString() : '';
    const pagina = paginaDetalhe.chave === consultaDetalhe ? paginaDetalhe.numero : 1;
    const chaveDetalhe = consultaDetalhe + '&pagina=' + pagina + '|' + revisaoCargas;
    useEffect(() => {
        if (subPainel !== 'detalhes' || !consultaDetalhe) return;
        let ativo = true;
        const timer = setTimeout(() => {
            ApiService._req('GET', '/cargas/me?' + consultaDetalhe + '&pagina=' + pagina).then(dados => {
                if (!ativo) return;
                if (pagina > 1 && !dados.cargas.length) {
                    setPaginaDetalhe({ chave: consultaDetalhe, numero: 1 });
                    return;
                }
                setResultadoDetalhe({ chave: chaveDetalhe, dados });
            }).catch(e => {
                if (ativo) setResultadoDetalhe({ chave: chaveDetalhe, erro: e.message });
            });
        }, 250);
        return () => { ativo = false; clearTimeout(timer); };
    }, [subPainel, chaveDetalhe]);
    const detalheAtual = resultadoDetalhe?.chave === chaveDetalhe ? resultadoDetalhe : null;
    const tamanhoPagina = 50;
    const produtosDetalhe = resultadoDetalhe?.dados?.produtos || [];
    const cargasDetalhe = detalheAtual?.dados?.cargas || [];
    const totaisDetalhe = detalheAtual?.dados ? { ...detalheAtual.dados.totais, cargas: detalheAtual.dados.totais.quantidade } :
        { cargas: 0, peso: 0, frete: 0, premiacao: 0 };
    const mudarPagina = numero => setPaginaDetalhe({ chave: consultaDetalhe, numero });
    const Subtabs = () => React.createElement("div", { className: "subtabs", style: { marginBottom: 12 } },
        podeVisao && React.createElement("button", { className: 'subtab' + (subPainel === 'visao' ? ' on' : ''), onClick: () => setSubPainel('visao') }, "Vis\u00E3o geral"),
        podeCargas && React.createElement("button", { className: 'subtab' + (['cargas', 'detalhes'].includes(subPainel) ? ' on' : ''), onClick: () => { setSubPainel('cargas'); if (!cargasCarregadas)
                setRevisaoCargas(v => v + 1); } }, "Cargas"));
    const emCargas = ['cargas', 'detalhes'].includes(subPainel);
    const Cabecalho = () => React.createElement("div", { className: "row", style: { flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' } },
        React.createElement("div", { className: "grow" },
            React.createElement("h2", { style: { marginBottom: 2 } }, "Painel operacional"),
            React.createElement("div", { className: "muted" }, "Pend\u00EAncias que aguardam an\u00E1lise, aprova\u00E7\u00E3o ou reprova\u00E7\u00E3o")),
        subPainel === 'visao' && React.createElement("button", { className: "btn btn-s btn-sm", disabled: carregandoPainel, onClick: () => setRevisaoPendencias(v => v + 1) }, carregandoPainel ? 'Carregando...' : 'Atualizar pendências'),
        emCargas && React.createElement("button", { className: "btn btn-s btn-sm", disabled: carregandoCargasPainel, onClick: () => { ApiService.limparCache(); setRevisaoCargas(v => v + 1); } }, carregandoCargasPainel ? 'Carregando...' : 'Recarregar dados'));
    const FiltrosCargas = () => React.createElement("div", { className: "card", style: { marginTop: 12 } },
        React.createElement("div", { className: "form-grid", style: { alignItems: 'end' } },
            React.createElement("div", null,
                React.createElement("label", { htmlFor: "adm-painel-competencia-de" }, "Compet\u00EAncia de"),
                React.createElement("select", { id: "adm-painel-competencia-de", name: "adm-painel-competencia-de", value: mes, onChange: e => { setMes(e.target.value); if (compDeTela(e.target.value) > compDeTela(mesAte))
                        setMesAte(e.target.value); } }, MESES_2026.map(m => React.createElement("option", { key: m, value: m }, mesLabel(m))))),
            React.createElement("div", null,
                React.createElement("label", { htmlFor: "adm-painel-competencia-ate" }, "At\u00E9"),
                React.createElement("select", { id: "adm-painel-competencia-ate", name: "adm-painel-competencia-ate", value: mesAte, onChange: e => { setMesAte(e.target.value); if (compDeTela(e.target.value) < compDeTela(mes))
                        setMes(e.target.value); } }, MESES_2026.map(m => React.createElement("option", { key: m, value: m }, mesLabel(m))))),
            React.createElement("div", null,
                React.createElement("label", { htmlFor: "adm-painel-motorista" }, "Motorista"),
                React.createElement("select", { id: "adm-painel-motorista", name: "adm-painel-motorista", value: motoristaSelecionado, onChange: e => setFMotorista(e.target.value) },
                    React.createElement("option", { value: "" }, "Todos"),
                    linhasDisponiveis.map(l => React.createElement("option", { key: l.uid, value: l.uid }, l.u.nome)))),
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
                React.createElement("button", { className: "btn btn-s", style: { width: '100%' }, onClick: limparFiltros }, "Limpar filtros")),
            React.createElement("div", null,
                React.createElement("label", { htmlFor: "adm-painel-visao" }, "Visualização"),
                React.createElement("select", { id: "adm-painel-visao", value: visaoAnalitica ? "analitica" : "unificada", onChange: e => setVisaoAnalitica(e.target.value === "analitica") },
                    React.createElement("option", { value: "unificada" }, "Unificada"),
                    React.createElement("option", { value: "analitica" }, "Analítica")))));
    if (subPainel === 'detalhes' && motoristaDetalhe) {
        return React.createElement(React.Fragment, null,
            React.createElement(Cabecalho, null),
            React.createElement(Subtabs, null),
            React.createElement("div", { className: "row", style: { marginBottom: 12, flexWrap: 'wrap' } },
                React.createElement("button", { className: "btn btn-s btn-sm", onClick: () => setSubPainel('cargas') }, "\u2190 Voltar para cargas"),
                React.createElement("div", { className: "grow" },
                    React.createElement("h3", { style: { margin: 0 } }, motoristaDetalhe.u.nome),
                    React.createElement("div", { className: "muted" },
                        motoristaDetalhe.mesLinha ? rotuloMesLinha(motoristaDetalhe.mesLinha) : rotuloPeriodo,
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
            !detalheAtual && React.createElement("div", { className: "aviso-box", role: "status" }, "Carregando cargas..."),
            detalheAtual?.erro && React.createElement("div", { className: "aviso-box", role: "alert" }, detalheAtual.erro),
            (detalheAtual?.dados) && React.createElement("div", { className: "card", style: { overflowX: 'auto', marginTop: 12 } },
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
                            React.createElement("th", { className: "td-num" }, "Frete/T"),
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
                            React.createElement("td", null, c.nota || c.numeroNota || '—',
                                motivosCarga(c).map(motivo => React.createElement("div", { key: motivo, className: "muted", style: { color: 'var(--erro)' } }, motivo))),
                            React.createElement("td", { className: "td-num num" }, brn(Number(c.peso || c.pesoTon || 0), 2)),
                            React.createElement("td", { className: "td-num num" }, Number(c.peso || c.pesoTon || 0) > 0 ? brl(Number(c.freteTotal || 0) / Number(c.peso || c.pesoTon || 0)) : '—'),
                            React.createElement("td", { className: "td-num num" }, brl(Number(c.freteTotal || 0))),
                            React.createElement("td", { className: "td-num num" }, brl(c.premiacao == null ? null : Number(c.premiacao))))),
                        !cargasDetalhe.length && React.createElement("tr", null,
                            React.createElement("td", { colSpan: "10", className: "muted", style: { textAlign: 'center', padding: 24 } }, "Nenhuma carga encontrada para os filtros selecionados."))),
                    React.createElement("tfoot", null,
                        React.createElement("tr", null,
                            React.createElement("td", { colSpan: "6" },
                                React.createElement("b", null, "Total filtrado")),
                            React.createElement("td", { className: "td-num num" },
                                React.createElement("b", null, brn(totaisDetalhe.peso, 2))),
                            React.createElement("td", { className: "td-num num" },
                                React.createElement("b", null, totaisDetalhe.peso > 0 ? brl(totaisDetalhe.frete / totaisDetalhe.peso) : '—')),
                            React.createElement("td", { className: "td-num num" },
                                React.createElement("b", null, brl(totaisDetalhe.frete))),
                            React.createElement("td", { className: "td-num num" },
                                React.createElement("b", null, brl(totaisDetalhe.premiacao))))))),
            (detalheAtual?.dados) && React.createElement("div", { className: "row", style: { marginTop: 12, gap: 8, flexWrap: 'wrap' } },
                React.createElement("span", { className: "muted grow" }, totaisDetalhe.cargas ?
                    `${(pagina - 1) * tamanhoPagina + 1}–${Math.min(pagina * tamanhoPagina, totaisDetalhe.cargas)} de ${totaisDetalhe.cargas} cargas` : "0 cargas"),
                React.createElement("button", { className: "btn btn-s btn-sm", disabled: pagina <= 1, onClick: () => mudarPagina(pagina - 1) }, "Anterior"),
                React.createElement("button", { className: "btn btn-s btn-sm", disabled: pagina * tamanhoPagina >= totaisDetalhe.cargas, onClick: () => mudarPagina(pagina + 1) }, "Próxima")));
    }
    return React.createElement(React.Fragment, null,
        React.createElement(Cabecalho, null),
        React.createElement(Subtabs, null),
        subPainel === 'visao' && carregandoPainel && React.createElement("div", { className: "aviso-box" }, "Carregando pend\u00EAncias operacionais..."),
        subPainel === 'visao' && erroPainel && React.createElement("div", { className: "aviso-box", style: { color: 'var(--erro)' } }, erroPainel),
        ['cargas', 'detalhes'].includes(subPainel) && carregandoCargasPainel && React.createElement("div", { className: "aviso-box" }, 'Carregando resumo de cargas...'),
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
                    React.createElement("div", { className: "v num" }, new Set(linhasFiltradas.filter(l => l.quantidade > 0).map(l => l.uid)).size)),
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
                    React.createElement("div", { className: "v", style: { fontSize: 18 } }, rotuloPeriodo))),
            React.createElement("div", { className: "card", style: { overflowX: 'auto' } },
                React.createElement("table", null,
                    React.createElement("thead", null,
                        React.createElement("tr", null,
                            visaoAnalitica && React.createElement("th", null, "Competência"),
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
                        linhasTabela.map(l => React.createElement("tr", { key: (l.uid || l.u.nome) + ":" + l.mesLinha },
                            visaoAnalitica && React.createElement("td", null, l.mesLinha ? rotuloMesLinha(l.mesLinha) : "—"),
                            React.createElement("td", null,
                                React.createElement("b", null, l.u.nome)),
                            React.createElement("td", { className: "muted" }, l.tipo || '—'),
                            React.createElement("td", { className: "td-num num" }, l.quantidade),
                            React.createElement("td", { className: "td-num num" }, brn(l.peso, 1)),
                            React.createElement("td", { className: "td-num num" }, brl(l.frete)),
                            React.createElement("td", { className: "td-num num" }, brl(l.premiacao)),
                            React.createElement("td", { className: "td-num num" }, l.pendencias || '—'),
                            React.createElement("td", null,
                                React.createElement("b", { style: { color: corSituacao(l.situacao) } }, rotuloSituacao(l.situacao)),
                                l.situacao === 'DIVERGENTE' && l.motivos.map(motivo =>
                                    React.createElement("div", { key: motivo, className: "muted" }, motivo))),
                            React.createElement("td", null,
                                React.createElement("button", { className: "btn btn-s btn-sm", onClick: () => abrirDetalhe(l) }, "Detalhar")))),
                        !linhasTabela.length && React.createElement("tr", null,
                            React.createElement("td", { colSpan: visaoAnalitica ? 10 : 9, className: "muted", style: { textAlign: 'center', padding: 24 } }, "Nenhum motorista encontrado para os filtros selecionados."))))),
            React.createElement("div", { className: "aviso-box" }, "O resumo consulta os dados existentes. O detalhamento abre em uma subtela pr\u00F3pria para evitar uma p\u00E1gina extensa.")));
}
