function AdmIndicadores() {
    const [mes, setMes] = React.useState(HOJE.slice(0, 7));
    const [resultado, setResultado] = React.useState(null);
    const [revisao, setRevisao] = React.useState(0);
    React.useEffect(() => {
        if (!mes) return;
        let ativo = true;
        ApiService._req('GET', '/cargas/me?modo=indicadores&competencia=' + encodeURIComponent(mes))
            .then(dados => { if (ativo) setResultado({ mes, revisao, linhas: dados.linhas }); })
            .catch(erro => { if (ativo) setResultado({ mes, revisao, erro: erro.message }); });
        return () => { ativo = false; };
    }, [mes, revisao]);

    const h = React.createElement;
    const atual = resultado?.mes === mes && resultado.revisao === revisao ? resultado : null;
    const linhas = atual?.linhas || [];
    const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const peso = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
    const total = linhas.reduce((soma, linha) => soma + linha.faturamento, 0);
    const colunas = ['Placa', 'Tipo de veículo', 'Cargas', 'Peso (t)', 'Faturamento', 'Meta mensal', 'Diferença', 'Situação'];

    return h('section', null,
        h('h2', null, 'Indicadores'),
        h('p', { className: 'muted' }, 'Faturamento por placa · metas mensais vigentes da Premiação'),
        h('div', { className: 'card row', style: { gap: 12, flexWrap: 'wrap', alignItems: 'center' } },
            h('label', null, 'Competência ', h('input', { type: 'month', value: mes, onChange: e => setMes(e.target.value) })),
            h('button', { type: 'button', disabled: !mes, onClick: () => setRevisao(v => v + 1) }, 'Atualizar')),
        !mes && h('p', null, 'Selecione uma competência.'),
        mes && !atual && h('p', { role: 'status' }, 'Carregando faturamento…'),
        atual?.erro && h('p', { className: 'aviso-box', role: 'alert' }, atual.erro),
        atual?.linhas && !linhas.length && h('p', null, 'Nenhuma carga nesta competência.'),
        linhas.length > 0 && h('div', { className: 'card', style: { overflowX: 'auto', marginTop: 12 } },
            h('h3', null, 'Faturamento total · ', moeda.format(total)),
            h('table', null,
                h('thead', null, h('tr', null, colunas.map(coluna => h('th', { key: coluna, scope: 'col' }, coluna)))),
                h('tbody', null, linhas.map(linha => {
                    const diferenca = linha.meta === null ? null : Math.round((linha.faturamento - linha.meta) * 100) / 100;
                    const situacao = diferenca === null ? 'Sem meta válida' : diferenca >= 0 ? 'Dentro da meta' : 'Fora da meta';
                    const cor = diferenca === null ? undefined : diferenca >= 0 ? '#17633d' : '#a82a23';
                    const valores = [linha.placa, linha.tipo, linha.cargas, peso.format(linha.peso), moeda.format(linha.faturamento),
                        linha.meta === null ? '—' : moeda.format(linha.meta), diferenca === null ? '—' : moeda.format(diferenca)];
                    return h('tr', { key: linha.placa }, valores.map((valor, i) => h('td', { key: colunas[i] }, valor)),
                        h('td', { style: { color: cor, fontWeight: 700 } }, situacao));
                })))));
}
