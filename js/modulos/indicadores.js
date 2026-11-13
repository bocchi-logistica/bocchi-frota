const ABAS_INDICADORES = [
    ['INDICADORES_FROTA_PESADA', 'Frota Pesada'],
    ['INDICADORES_FROTA_LEVE', 'Frota Leve']
];

function podeAbaIndicadores(user, codigo) {
    return (user?.areasAcesso || []).map(normalizarPerfil).includes('INDICADORES') &&
        (user?.subtelasAcesso || []).map(normalizarPerfil).includes(codigo);
}

function AdmIndicadores({ user }) {
    const h = React.createElement;
    const abas = ABAS_INDICADORES.filter(([codigo]) => podeAbaIndicadores(user, codigo));
    const [selecionada, setSelecionada] = React.useState(null);
    const ativa = abas.some(([codigo]) => codigo === selecionada) ? selecionada : abas[0]?.[0];

    if (!ativa) return null;
    return h('section', null,
        h('div', { className: 'subtabs', style: { marginBottom: 14 }, 'aria-label': 'Subtelas de Indicadores' },
            abas.map(([codigo, rotulo]) => h('button', {
                key: codigo, type: 'button', className: 'subtab' + (ativa === codigo ? ' on' : ''),
                'aria-pressed': ativa === codigo, onClick: () => setSelecionada(codigo)
            }, rotulo))),
        ativa === 'INDICADORES_FROTA_PESADA' ? h(IndicadoresFrotaPesada) :
            h('div', { className: 'card' }, h('h2', null, 'Frota Leve'),
                h('p', null, 'Os indicadores da frota leve serão disponibilizados nesta subtela.')));
}

function IndicadoresFrotaPesada() {
    const h = React.createElement;
    const mesAtual = HOJE.slice(0, 7);
    const [inicio, setInicio] = React.useState(mesAtual);
    const [fim, setFim] = React.useState(mesAtual);
    const [paginaIndicador, setPaginaIndicador] = React.useState('faturamento');
    const [motorista, setMotorista] = React.useState('');
    const [anoFabricacao, setAnoFabricacao] = React.useState('');
    const [detalhe, setDetalhe] = React.useState(null);
    const [placa, setPlaca] = React.useState('');
    const [tipo, setTipo] = React.useState('');
    const [situacao, setSituacao] = React.useState('');
    const [resultado, setResultado] = React.useState(null);
    const [revisao, setRevisao] = React.useState(0);
    const chave = [inicio, fim, revisao].join('/');
    const indice = mes => Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5));
    const periodoValido = inicio && fim && inicio <= fim && indice(fim) - indice(inicio) < 12;

    React.useEffect(() => {
        if (!periodoValido) return;
        let ativo = true;
        const params = new URLSearchParams({ modo: 'indicadores', competencia: inicio, ateCompetencia: fim });
        ApiService._req('GET', '/cargas/me?' + params).then(dados => {
            if (ativo) setResultado({ chave, linhas: dados.linhas });
        }).catch(erro => {
            if (ativo) setResultado({ chave, erro: erro.message });
        });
        return () => { ativo = false; };
    }, [chave, periodoValido]);

    const atual = resultado?.chave === chave ? resultado : null;
    const base = atual?.linhas || [];
    const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format;
    const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format;
    const mesTexto = mes => mes.slice(5) + '/' + mes.slice(0, 4);
    const centavos = valor => Math.round(valor * 100);
    const estado = linha => linha.meta === null ? 'sem' : centavos(linha.faturamento) >= centavos(linha.meta) ? 'dentro' : 'fora';
    const rotulos = { dentro: 'Dentro da meta', fora: 'Fora da meta', sem: 'Sem meta válida' };
    const cores = { dentro: '#218454', fora: '#bd4237', sem: '#65747b' };
    const unicos = campo => [...new Set(base.map(linha => linha[campo]))].sort((a,b) => a.localeCompare(b,'pt-BR'));
    const motoristas = [...new Map(base.flatMap(l => (l.motoristas || []).map(m => [m.id,m.nome])))]
        .sort((a,b) => a[1].localeCompare(b[1],'pt-BR'));
    const porMotorista = base.flatMap(linha => {
        if (!motorista) return [linha];
        const m = (linha.motoristas || []).find(m => m.id === motorista);
        return m ? [{...linha,faturamento:m.faturamento,peso:m.peso,cargas:m.cargas,motoristas:[m]}] : [];
    });
    const linhas = porMotorista.filter(linha => (!anoFabricacao || String(linha.anoFabricacao || 'sem') === anoFabricacao) && (!placa || linha.placa === placa) && (!tipo || linha.tipo === tipo) &&
        (!situacao || estado(linha) === situacao));
    const soma = (itens, campo) => itens.reduce((total, item) => total + item[campo], 0);
    const agrupar = campo => {
        const grupos = new Map();
        for (const linha of linhas) {
            if (!grupos.has(linha[campo])) grupos.set(linha[campo], []);
            grupos.get(linha[campo]).push(linha);
        }
        return [...grupos].map(([nome, itens]) => ({
            nome, faturamento: soma(itens, 'faturamento'), peso: soma(itens, 'peso'),
            meta: itens.every(item => item.meta !== null) ? soma(itens, 'meta') : null
        }));
    };
    const placas = agrupar('placa').sort((a,b) => b.faturamento-a.faturamento);
    const meses = agrupar('mes').sort((a,b) => a.nome.localeCompare(b.nome));
    const naMeta = linhas.filter(linha => estado(linha) === 'dentro').length;
    const comMeta = linhas.filter(linha => linha.meta !== null).length;
    const grid = min => ({display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(min(100%, '+min+'px),1fr))',gap:14});
    const select = (nome, valor, mudar, opcoes) => h('label',null,nome,
        h('select',{value:valor,onChange:e=>mudar(e.target.value)},
            h('option',{value:''},'Todos'),opcoes.map(([id,texto])=>h('option',{key:id,value:id},texto))));
    const card = (titulo, valor, detalhe, destaque) => h('div',{key:titulo,className:'card ind-kpi' + (destaque?' ind-destaque':'')},
        h('small',null,titulo),h('div',{className:'ind-valor num'},valor),h('small',null,detalhe));
    const dataTexto = data => data ? data.slice(8,10)+'/'+data.slice(5,7)+'/'+data.slice(0,4) : '—';
    const nomeMotoristas = linha => (linha.motoristas || []).map(m => m.nome).join(' / ') || 'Sem motorista identificado';
    const paginas = [['faturamento','Faturamento'],['despesas','Despesas'],['km','Km e consumo'],['resultado','Resultado']];
    const estilo = h('style',null,`
        .ind-conteudo{display:grid;gap:16px;min-width:0}.ind-conteudo .card{min-width:0}
        .ind-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
        .ind-kpi{border-top:3px solid #d8a928;display:flex;flex-direction:column;gap:8px;min-width:0;padding:18px}
        .ind-kpi small{line-height:1.45}.ind-valor{font-size:clamp(22px,2vw,30px);font-weight:800;line-height:1.2;overflow-wrap:anywhere}
        .ind-destaque{background:#163c30;color:#fff;border-color:#163c30}
        .ind-filtros{display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:12px;align-items:end}
        .ind-filtros label{margin:0;min-width:0}.ind-filtros select,.ind-filtros input{margin-top:5px}
        .ind-acoes{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;grid-column:1/-1}
        .ind-tabela{overflow-x:auto}.ind-tabela td{vertical-align:top}.ind-tabela th{white-space:nowrap}
        .ind-grafico-linha{display:grid;grid-template-columns:82px minmax(24px,1fr) minmax(112px,auto);gap:10px;align-items:center;width:100%;padding:8px 0;text-align:left;color:inherit}
        .ind-roteiro{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
        @media(max-width:850px){.ind-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:480px){.ind-kpis{grid-template-columns:1fr}.ind-filtros{grid-template-columns:1fr}.ind-grafico-linha{grid-template-columns:72px minmax(12px,1fr) minmax(100px,auto);font-size:12px}.ind-valor{font-size:26px}}
    `);
    const navegacao = h('nav',{className:'subtabs','aria-label':'Indicadores da frota pesada'},paginas.map(([id,nome]) =>
        h('button',{key:id,type:'button',className:'subtab'+(paginaIndicador===id?' on':''),'aria-pressed':paginaIndicador===id,
            onClick:()=>{setPaginaIndicador(id);setDetalhe(null);}},nome)));
    if (detalhe) return h('section',{className:'ind-conteudo'},estilo,navegacao,
        h(DetalheIndicadoresFrota,{linha:detalhe,motorista,revisao,onVoltar:()=>setDetalhe(null)}));
    if (paginaIndicador !== 'faturamento') {
        const planos = {
            despesas:{titulo:'Despesas da frota pesada',texto:'Estrutura prevista conforme o dashboard de despesas. Os valores serão exibidos após a disponibilização da base de despesas.',
                itens:[['Custos por veículo','Total e média por placa, competência e ano de fabricação.'],['Categorias de despesa','Combustível, salários e encargos, depreciação, manutenção, pneus, pedágio, seguro, sistema, multas, impostos e indenizações.'],['Evolução mensal','Despesa total, custo médio por placa/mês e participação de cada categoria.']]},
            km:{titulo:'Quilometragem e consumo',texto:'Aguardando a base de quilometragem e abastecimentos para calcular os indicadores.',
                itens:[['Quilometragem','Km rodados por placa e mês.'],['Consumo','Litros abastecidos, km/L e evolução do consumo.'],['Custo por km','Despesas e combustível divididos pelos km do mesmo período.']]},
            resultado:{titulo:'Resultado da frota pesada',texto:'Estrutura prevista conforme o dashboard de resultado final. O resultado depende da conciliação de receitas e despesas na mesma competência.',
                itens:[['Resultado financeiro','Receita, despesas, resultado e margem percentual.'],['Resultado por veículo','Comparação entre receita e despesa por placa, ano de fabricação e competência.'],['Evolução e custo por tonelada','Receita e despesa por tonelada e evolução mensal do resultado.']]}
        }, plano = planos[paginaIndicador];
        return h('section',{className:'ind-conteudo'},estilo,navegacao,h('div',{className:'card'},
            h('h2',null,plano.titulo),h('p',{className:'muted',style:{marginTop:8}},plano.texto)),
            h('div',{className:'ind-roteiro'},plano.itens.map(([titulo,texto]) => h('div',{key:titulo,className:'card'},h('h3',null,titulo),h('p',{style:{marginTop:8}},texto)))));
    }

    function grafico(titulo, itens, campo, formato, selecionar) {
        const max = Math.max(1,...itens.map(item=>item[campo]));
        return h('div',{className:'card'},h('h3',null,titulo),
            h('div',{style:{maxHeight:330,overflowY:'auto',display:'grid',gap:9,marginTop:12}},itens.map(item=>{
                const nome = itens === meses ? mesTexto(item.nome) : item.nome;
                const cor = campo === 'peso' ? '#267a70' : cores[estado(item)];
                const conteudo = [h('span',{key:'nome',style:{minWidth:66,fontWeight:700}},nome),
                    h('span',{key:'barra','aria-hidden':true,style:{flex:1,height:12,borderRadius:10,background:'#e9eeea'}},
                        h('span',{style:{display:'block',height:'100%',width:Math.max(0,item[campo]/max*100)+'%',background:cor,borderRadius:10}})),
                    h('span',{key:'valor',style:{minWidth:105,textAlign:'right',fontVariantNumeric:'tabular-nums'}},formato(item[campo]))];
                return h(selecionar?'button':'div',{key:item.nome,type:selecionar?'button':undefined,
                    onClick:selecionar?()=>selecionar(item.nome):undefined,
                    title:campo==='faturamento' ? (item.meta===null?'Sem meta válida':'Meta '+moeda(item.meta)) : undefined,
                    className:'ind-grafico-linha'},conteudo);
            })));
    }

    return h('section',{className:'ind-conteudo'},estilo,navegacao,
        h('header',{style:{background:'linear-gradient(115deg,#102e25,#205844)',borderRadius:18,color:'#fff',padding:'18px 22px'}},
            h('small',{style:{color:'#f0cc67',letterSpacing:2,fontWeight:700}},'BOCCHI FROTA · INDICADORES'),
            h('h2',{style:{color:'inherit',fontSize:'clamp(23px,2.5vw,30px)',margin:'5px 0'}},'Faturamento da frota pesada'),
            h('div',null,'Acompanhe receita, volume transportado e metas por placa e competência.')),
        h('div',{className:'card ind-filtros'},
            h('label',null,'Competência inicial',h('input',{type:'month',value:inicio,onChange:e=>setInicio(e.target.value)})),
            h('label',null,'Competência final',h('input',{type:'month',value:fim,onChange:e=>setFim(e.target.value)})),
            select('Motorista',motorista,v=>{setMotorista(v);setSituacao('');},motoristas),
            select('Ano de fabricação',anoFabricacao,setAnoFabricacao,[...new Set(base.map(l=>String(l.anoFabricacao || 'sem')))].sort().map(v=>[v,v==='sem'?'Não informado':v])),
            select('Placa',placa,setPlaca,unicos('placa').map(v=>[v,v])),
            select('Tipo de veículo',tipo,setTipo,unicos('tipo').map(v=>[v,v])),
            select('Situação',situacao,setSituacao,Object.entries(rotulos)),
            h('div',{className:'ind-acoes'},
                h('button',{type:'button',className:'btn btn-s btn-sm',onClick:()=>{setInicio(mesAtual);setFim(mesAtual);setPlaca('');setTipo('');setSituacao('');setMotorista('');setAnoFabricacao('');}},'Limpar filtros'),
                h('button',{type:'button',className:'btn btn-p btn-sm',disabled:!periodoValido||!atual,onClick:()=>{ApiService.limparCache();setRevisao(v=>v+1);}},'Atualizar dados'))),
        !periodoValido && h('p',{className:'aviso-box'},'Selecione um intervalo válido de até 12 competências.'),
        periodoValido && !atual && h('p',{role:'status'},'Carregando indicadores…'),
        atual?.erro && h('p',{className:'aviso-box',role:'alert'},atual.erro),
        atual?.linhas && h(React.Fragment,null,
            motorista && h('div',{className:'aviso-box'},'Exibindo somente as cargas do motorista no período, comparadas à meta mensal cadastrada para o tipo de veículo. A meta é integral, sem rateio pelo período trabalhado.'),
            h('div',{className:'ind-kpis'},
                card('Faturamento total',moeda(soma(linhas,'faturamento')),placas.length+(placas.length===1?' placa com cargas':' placas com cargas'),true),
                card('Peso transportado',numero(soma(linhas,'peso'))+' t','Total no filtro'),
                card('Faturamento médio',placas.length?moeda(soma(linhas,'faturamento')/linhas.length):'—','Por placa com carga, por mês'),
                card('Peso médio',placas.length?numero(soma(linhas,'peso')/linhas.length)+' t':'—','Por placa com carga, por mês'),
                card('Cargas',numero(soma(linhas,'cargas')),'Total no filtro'),
                card('Meta atingida',naMeta+' / '+comMeta,'Placas por mês com meta válida')),
            linhas.length === 0 ? h('p',{className:'aviso-box'},'Nenhuma carga para os filtros selecionados.') :
            h(React.Fragment,null,
                h('p',{className:'muted'},'Verde · dentro da meta   |   Vermelho · fora da meta   |   Cinza · sem meta válida. Clique em uma placa no gráfico para filtrar.'),
                h('div',{style:grid(390)},
                    grafico('Faturamento por placa',placas,'faturamento',moeda,p=>setPlaca(placa===p?'':p)),
                    grafico('Faturamento total por mês',meses,'faturamento',moeda),
                    grafico('Peso transportado por placa',placas,'peso',v=>numero(v)+' t',p=>setPlaca(placa===p?'':p)),
                    grafico('Peso total por mês',meses,'peso',v=>numero(v)+' t')),
                h('details',{className:'card ind-tabela',style:{marginTop:16}},
                    h('summary',{style:{cursor:'pointer',fontWeight:700}},'Conferir valores por placa e mês ('+linhas.length+')'),
                    h('table',null,h('thead',null,h('tr',null,['Mês','Placa','Motorista(s) nas cargas','Ano fab.','Tipo','Cargas','Peso (t)','Faturamento','Meta','Diferença','Situação','Ações']
                        .map(t=>h('th',{key:t,scope:'col'},t)))),
                        h('tbody',null,linhas.map(l=>h('tr',{key:l.mes+'/'+l.placa},
                            [mesTexto(l.mes),l.placa,
                                h('span',{title:(l.motoristas||[]).map(m=>m.nome+': cargas de '+dataTexto(m.inicio)+' a '+dataTexto(m.fim)).join(' | ')},nomeMotoristas(l)),
                                l.anoFabricacao || '—',l.tipo,l.cargas,numero(l.peso),moeda(l.faturamento),l.meta===null?'—':moeda(l.meta),
                                l.meta===null?'—':moeda(l.faturamento-l.meta)].map((v,i)=>h('td',{key:i},v)),
                            h('td',{style:{color:cores[estado(l)],fontWeight:700}},rotulos[estado(l)]),
                            h('td',null,h('button',{type:'button',className:'btn btn-s btn-sm',onClick:()=>setDetalhe(l)},'Detalhar'))))))))));
}


function DetalheIndicadoresFrota({linha,motorista,revisao,onVoltar}) {
    const h = React.createElement;
    const [busca,setBusca] = React.useState(''), [produto,setProduto] = React.useState('');
    const [dataDe,setDataDe] = React.useState(''), [dataAte,setDataAte] = React.useState('');
    const [paginacao,setPaginacao] = React.useState({chave:'',numero:1});
    const [resultado,setResultado] = React.useState(null);
    const consulta = new URLSearchParams({modo:'detalhe-indicadores',competencia:linha.mes,ateCompetencia:linha.mes,
        placa:linha.placa,motorista,busca:busca.trim(),produto,dataDe,dataAte}).toString();
    const pagina = paginacao.chave===consulta ? paginacao.numero : 1;
    const chave = consulta+'&pagina='+pagina+'|'+revisao;
    React.useEffect(()=>{
        let ativo = true;
        const timer = setTimeout(()=>ApiService._req('GET','/cargas/me?'+consulta+'&pagina='+pagina)
            .then(dados=>{if(ativo)setResultado({chave,dados});})
            .catch(erro=>{if(ativo)setResultado({chave,erro:erro.message});}),250);
        return ()=>{ativo=false;clearTimeout(timer);};
    },[chave]);
    const atual = resultado?.chave===chave ? resultado : null, dados = atual?.dados;
    const moeda = v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);
    const numero = v=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(v);
    const campo = (nome,elemento)=>h('label',null,nome,elemento);
    const nomes = (linha.motoristas||[]).map(m=>m.nome).join(' / ') || 'Sem motorista identificado';
    const mudarPagina = numero=>setPaginacao({chave:consulta,numero});
    return h(React.Fragment,null,
        h('div',{className:'row',style:{flexWrap:'wrap'}},
            h('button',{type:'button',className:'btn btn-s btn-sm',onClick:onVoltar},'← Voltar aos indicadores'),
            h('div',null,h('h2',null,'Cargas da placa '+linha.placa),h('p',{className:'muted'},
                linha.mes.slice(5)+'/'+linha.mes.slice(0,4)+' · '+linha.tipo),h('p',null,nomes))),
        h('div',{className:'card ind-filtros'},
            campo('Buscar NF, rota, produto ou motorista',h('input',{value:busca,onChange:e=>setBusca(e.target.value),placeholder:'Digite para localizar'})),
            campo('Produto',h('select',{value:produto,onChange:e=>setProduto(e.target.value)},h('option',{value:''},'Todos'),
                (resultado?.dados?.produtos||[]).map(p=>h('option',{key:p,value:p},p)))),
            campo('Data inicial',h('input',{type:'date',value:dataDe,onChange:e=>setDataDe(e.target.value)})),
            campo('Data final',h('input',{type:'date',value:dataAte,onChange:e=>setDataAte(e.target.value)})),
            h('div',{className:'ind-acoes'},h('button',{className:'btn btn-s btn-sm',type:'button',onClick:()=>{setBusca('');setProduto('');setDataDe('');setDataAte('');}},'Limpar filtros do detalhe'))),
        !atual && h('p',{role:'status'},'Carregando cargas…'),
        atual?.erro && h('p',{className:'aviso-box',role:'alert'},atual.erro),
        dados && h(React.Fragment,null,
            h('div',{className:'ind-kpis'},[['Cargas',dados.totais.quantidade],['Peso transportado',numero(dados.totais.peso)+' t'],['Frete total',moeda(dados.totais.frete)]]
                .map(([titulo,valor])=>h('div',{className:'card ind-kpi',key:titulo},h('small',null,titulo),h('div',{className:'ind-valor num'},valor)))),
            h('div',{className:'card ind-tabela'},h('table',null,
                h('thead',null,h('tr',null,['Data','Placa','Motorista','Origem','Destino','Produto','NF','Peso (t)','Frete/t','Frete'].map(t=>h('th',{key:t},t)))),
                h('tbody',null,dados.cargas.map(c=>h('tr',{key:c.id},
                    [c.data.slice(8,10)+'/'+c.data.slice(5,7)+'/'+c.data.slice(0,4),c.placa,c.motorista,c.origem||'—',c.destino||'—',c.produto||'—',c.nota||'—',
                        numero(c.peso),c.peso>0?moeda(c.freteTotal/c.peso):'—',moeda(c.freteTotal)]
                        .map((valor,i)=>h('td',{key:i,className:i>=7?'td-num num':undefined},valor)))),
                    !dados.cargas.length && h('tr',null,h('td',{colSpan:10},'Nenhuma carga encontrada para os filtros selecionados.'))),
                h('tfoot',null,h('tr',null,h('td',{colSpan:7},'Total do filtro · '+dados.totais.quantidade+' cargas'),
                    h('td',{className:'td-num num'},numero(dados.totais.peso)),h('td'),h('td',{className:'td-num num'},moeda(dados.totais.frete))))),
                h('div',{className:'row',style:{marginTop:14,flexWrap:'wrap'}},
                    h('button',{type:'button',className:'btn btn-s btn-sm',disabled:pagina===1,onClick:()=>mudarPagina(pagina-1)},'Anterior'),
                    h('span',null,'Página '+pagina+' de '+Math.max(1,Math.ceil(dados.totais.quantidade/dados.tamanho))),
                    h('button',{type:'button',className:'btn btn-s btn-sm',disabled:pagina*dados.tamanho>=dados.totais.quantidade,onClick:()=>mudarPagina(pagina+1)},'Próxima')))));
}
