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
