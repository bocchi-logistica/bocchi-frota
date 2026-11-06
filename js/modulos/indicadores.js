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
                key: codigo, type: 'button', className: 'subtab' + (ativa === codigo ? ' ativa' : ''),
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
    const linhas = base.filter(linha => (!placa || linha.placa === placa) && (!tipo || linha.tipo === tipo) &&
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
    const card = (titulo, valor, detalhe, destaque) => h('div',{key:titulo,className:'card',
        style:destaque?{background:'#163c30',color:'#fff'}:{borderTop:'3px solid #d8a928'}},
        h('small',null,titulo),h('div',{style:{fontSize:'clamp(21px, 2.4vw, 30px)',fontWeight:800,margin:'6px 0'}},valor),
        h('small',null,detalhe));

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
                    style:{display:'flex',gap:8,alignItems:'center',width:'100%',background:'transparent',color:'inherit',padding:'5px 0',textAlign:'left'}},conteudo);
            })));
    }

    return h('section',null,
        h('header',{style:{background:'linear-gradient(115deg,#102e25,#205844)',borderRadius:18,color:'#fff',padding:'22px 24px',marginBottom:14}},
            h('small',{style:{color:'#f0cc67',letterSpacing:2,fontWeight:700}},'BOCCHI FROTA · INDICADORES'),
            h('h2',{style:{color:'inherit',fontSize:32,margin:'5px 0'}},'Faturamento da frota pesada'),
            h('div',null,'Acompanhe receita, volume transportado e metas por placa e competência.')),
        h('div',{className:'card',style:{...grid(150),marginBottom:14,alignItems:'end'}},
            h('label',null,'Competência inicial',h('input',{type:'month',value:inicio,onChange:e=>setInicio(e.target.value)})),
            h('label',null,'Competência final',h('input',{type:'month',value:fim,onChange:e=>setFim(e.target.value)})),
            select('Placa',placa,setPlaca,unicos('placa').map(v=>[v,v])),
            select('Tipo de veículo',tipo,setTipo,unicos('tipo').map(v=>[v,v])),
            select('Situação',situacao,setSituacao,Object.entries(rotulos)),
            h('button',{type:'button',onClick:()=>{setInicio(mesAtual);setFim(mesAtual);setPlaca('');setTipo('');setSituacao('');}},'Limpar filtros'),
            h('button',{type:'button',disabled:!periodoValido||!atual,onClick:()=>setRevisao(v=>v+1)},'Atualizar dados')),
        !periodoValido && h('p',{className:'aviso-box'},'Selecione um intervalo válido de até 12 competências.'),
        periodoValido && !atual && h('p',{role:'status'},'Carregando indicadores…'),
        atual?.erro && h('p',{className:'aviso-box',role:'alert'},atual.erro),
        atual?.linhas && h(React.Fragment,null,
            h('div',{style:grid(175)},
                card('Faturamento total',moeda(soma(linhas,'faturamento')),placas.length+' placas com cargas',true),
                card('Peso transportado',numero(soma(linhas,'peso'))+' t','Total no filtro'),
                card('Faturamento médio',placas.length?moeda(soma(linhas,'faturamento')/linhas.length):'—','Por placa com carga, por mês'),
                card('Peso médio',placas.length?numero(soma(linhas,'peso')/linhas.length)+' t':'—','Por placa com carga, por mês'),
                card('Cargas',numero(soma(linhas,'cargas')),'Total no filtro'),
                card('Meta atingida',naMeta+' / '+comMeta,'Placas por mês com meta válida')),
            linhas.length === 0 ? h('p',{className:'aviso-box'},'Nenhuma carga para os filtros selecionados.') :
            h(React.Fragment,null,
                h('p',{className:'muted'},'Verde · dentro da meta   |   Vermelho · fora da meta   |   Cinza · sem meta válida. Clique em uma placa no gráfico para filtrar.'),
                h('div',{style:grid(410)},
                    grafico('Faturamento por placa',placas,'faturamento',moeda,p=>setPlaca(placa===p?'':p)),
                    grafico('Faturamento total por mês',meses,'faturamento',moeda),
                    grafico('Peso transportado por placa',placas,'peso',v=>numero(v)+' t',p=>setPlaca(placa===p?'':p)),
                    grafico('Peso total por mês',meses,'peso',v=>numero(v)+' t')),
                h('details',{className:'card',style:{marginTop:14,overflowX:'auto'}},
                    h('summary',{style:{cursor:'pointer',fontWeight:700}},'Conferir valores por placa e mês ('+linhas.length+')'),
                    h('table',null,h('thead',null,h('tr',null,['Mês','Placa','Tipo','Cargas','Peso (t)','Faturamento','Meta','Diferença','Situação']
                        .map(t=>h('th',{key:t,scope:'col'},t)))),
                        h('tbody',null,linhas.map(l=>h('tr',{key:l.mes+'/'+l.placa},
                            [mesTexto(l.mes),l.placa,l.tipo,l.cargas,numero(l.peso),moeda(l.faturamento),l.meta===null?'—':moeda(l.meta),
                                l.meta===null?'—':moeda(l.faturamento-l.meta)].map((v,i)=>h('td',{key:i},v)),
                            h('td',{style:{color:cores[estado(l)],fontWeight:700}},rotulos[estado(l)])))))))));
}
