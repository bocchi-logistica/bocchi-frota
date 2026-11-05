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
