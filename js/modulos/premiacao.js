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
    const resumo = m => {
        const estimativa = apuracaoMes(st, dados, user.nome, m);
        const salva = (st.apuracoes || []).find(a => a.resumoMotorista && a.mes === m);
        return salva ? { ...estimativa, status: salva.status, prod: salva.premioBruto, totDesc: salva.totalDescontos, apurado: salva.apurado } : estimativa;
    };
    const ap = resumo(mes);
    const fechado = ap.status === 'FECHADO';
    const calculado = ap.status === 'CALCULADO';
    const salvo = fechado || calculado;
    const status = fechado ? 'Fechado' : calculado ? 'Calculado' : 'Em aberto';
    const quad = QUADS.find(q => q.meses.includes(mes)) || QUADS[0];
    const apsQuad = quad.meses.map(m => ({ mes: m, ...resumo(m) }));
    const somaQuad = apsQuad.reduce((s, a) => s + a.apurado, 0);
    const pctStart = ap.meta ? Math.min(100, ap.fat / ap.meta.start * 100) : 0;
    const pctMeta = ap.meta ? Math.min(100, ap.fat / ap.meta.meta * 100) : 0;
    const faltaStart = ap.meta ? Math.max(0, ap.meta.start - ap.fat) : 0;
    const ganhoStartMil = ap.meta ? ap.meta.pctStart * 10 : 0;
    const ganhoMetaMil = ap.meta ? ap.meta.pctMeta * 10 : 0;
    const mesesVisiveis = mesesAteHoje();
    return (React.createElement(React.Fragment, null,
        React.createElement("div", { className: "seletor-mes" }, mesesVisiveis.map(m => React.createElement("button", { key: m, className: 'mes-pill' + (m === mes ? ' on' : ''), onClick: () => setMes(m) }, mesLabel(m)))),
        React.createElement("details", {className:"aviso-box premiacao-aviso-recolhivel"},
            React.createElement("summary",null,fechado?"Apuração fechada pelo RH":calculado?"Calculado · aguardando fechamento":ap.meta?"Estimativa da premiação":"Premiação indisponível · meta não encontrada"),
            React.createElement("div",{className:"premiacao-aviso-conteudo"},fechado ? "Apuração fechada pelo RH. Valores oficiais abaixo." : calculado ? "Valor calculado, aguardando fechamento pelo RH." : ap.meta ? "Estimativa conforme cargas, metas e descontos cadastrados. Não substitui o fechamento oficial do RH." : "Premiação indisponível: não foi encontrada meta para o tipo de veículo e período. Valores zerados abaixo não representam uma apuração validada.")),
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
                mesLabel(mes), " · ", status),
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
                    React.createElement("span", { className: "muted" }, fechado ? "(oficial)" : calculado ? "(calculado)" : "(estimativa)")),
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
            salvo && React.createElement("div",{className:"linha-item"},
                React.createElement("span",null,"Total de descontos"),
                React.createElement("b",null,brl(-Math.abs(ap.totDesc)))),
            React.createElement("div", { className: "linha-item", style: { fontSize: 15.5 } },
                React.createElement("b", null, "Apurado no m\u00EAs"),
                React.createElement("b", { className: "num", style: { color: ap.apurado < 0 ? 'var(--erro)' : 'var(--mata)' } }, brl(ap.apurado))),
            React.createElement("details", { className: "aviso-box premiacao-aviso-recolhivel", style: { marginTop: 10 } },
                React.createElement("summary",null,"Regras e compensação de valores"),
                React.createElement("div",{className:"premiacao-aviso-conteudo"},"Conforme POL 4.1.1, o apurado mensal pode ficar negativo e será compensado pelos demais meses do quadrimestre. Nunca haverá desconto em folha se o acumulado final ficar negativo."))),
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
                React.createElement("b", null, apsQuad.every(a => a.status === "FECHADO") ? "Acumulado do quadrimestre" : "Acumulado provisório do quadrimestre"),
                React.createElement("b", { className: "num", style: { color: 'var(--mata)' } }, brl(Math.max(0, somaQuad)))),
            somaQuad < 0 && React.createElement("div", { className: "muted" },
                "O acumulado ficou negativo (",
                brl(somaQuad),
                "); nesse caso n\u00E3o h\u00E1 desconto em folha \u2014 o pagamento fica em R$ 0,00."))));
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
