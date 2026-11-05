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
/* ================= ADM: FECHAMENTO RH ================= */
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
        // pelo usuário, evitando consultas pesadas e repetidas à API.
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
