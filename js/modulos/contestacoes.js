/* ================= ADM: CONTESTAÇÕES ================= */
function AdmContestacoes({ st, setSt, toast, foco, user }) {
    const podeDecidir = pode(user, 'contestacoes.decidir');
    const [filtro, setFiltro] = useState('pendente');
    const [tipoFiltro, setTipoFiltro] = useState('todos');
    const [motoristaFiltro, setMotoristaFiltro] = useState('');
    const [competenciaFiltro, setCompetenciaFiltro] = useState('');
    const [respondendo, setRespondendo] = useState(null);
    const [resposta, setResposta] = useState('');
    const [decisao, setDecisao] = useState('procede');
    const [carregando, setCarregando] = useState(true);
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
        if (!podeDecidir) return;
        if (!resposta.trim()) {
            toast('Informe a justificativa da decisão.');
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
                podeDecidir && String(ct.status || '').trim().toLowerCase() === 'pendente' &&
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

