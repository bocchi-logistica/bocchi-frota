/* Central de pendências: as decisões permanecem nos módulos responsáveis. */
function AdmTratativas({ user, onNavegar }) {
    const h = React.createElement;
    const [periodo,setPeriodo] = useState(MES_ATUAL);
    const [revisao,setRevisao] = useState(0);
    const [resultado,setResultado] = useState(null);
    const permitido = pode(user,'tratativas.visualizar');
    const consultarContestacoes = pode(user,'contestacoes.visualizar');
    const consultarChecklist = pode(user,'checklist.aprovacao');
    const consultarSinistros = pode(user,'sinistros.visualizar');
    useEffect(()=>{
        if (!permitido) return;
        let ativo = true;
        Promise.allSettled([
            consultarContestacoes ? ApiService.admListarContestacoes() : Promise.resolve(null),
            consultarChecklist ? ApiService.admListarChecklists() : Promise.resolve(null),
            consultarSinistros ? ApiService.admListarSinistros() : Promise.resolve(null)
        ]).then(respostas=>{
            if (!ativo) return;
            const dados = respostas.map(r=>r.status==='fulfilled'?r.value:null);
            setResultado({revisao,contestacoes:dados[0]?.contestacoes || [],
                checklists:dados[1]?.itens || dados[1]?.checklists || [],sinistros:dados[2]?.sinistros || [],
                falhas:respostas.map((r,i)=>r.status==='rejected'?['contestações','checklists','sinistros'][i]:null).filter(Boolean)});
        });
        return ()=>{ativo=false;};
    },[revisao,permitido,consultarContestacoes,consultarChecklist,consultarSinistros]);
    if (!permitido) return null;
    const atual = resultado?.revisao===revisao ? resultado : null;
    const competencia = periodo==='TODOS'?'':periodo.slice(3)+'-'+periodo.slice(0,2);
    const noPeriodo = data=>!competencia || String(data || '').slice(0,7)===competencia;
    const contestacoes = (atual?.contestacoes || []).filter(c=>String(c.status || '').toUpperCase()==='PENDENTE' && noPeriodo(c.dataCarga || c.data));
    const falhou = modulo=>atual?.falhas.includes(modulo);
    const itens = [
        {titulo:'Contestações de carga',modulo:'contestações',permissao:consultarContestacoes,
            total:contestacoes.filter(c=>String(c.tipoContestacao || 'ERRO_CARGA').toUpperCase()==='ERRO_CARGA').length,
            descricao:'Contestações de carga pendentes',destino:'contest',parametros:{tipoContestacao:'ERRO_CARGA',competencia}},
        {titulo:'PBT',modulo:'contestações',permissao:consultarContestacoes,
            total:contestacoes.filter(c=>String(c.tipoContestacao || '').toUpperCase()==='DIVERGENCIA_PBT').length,
            descricao:'Divergências de peso aguardando decisão',destino:'contest',parametros:{tipoContestacao:'DIVERGENCIA_PBT',competencia}},
        {titulo:'Check list',modulo:'checklists',permissao:consultarChecklist,
            total:(atual?.checklists || []).filter(c=>String(c.status || 'PENDENTE').toUpperCase()==='PENDENTE' && noPeriodo(c.data || c.dataHoraLocal)).length,
            descricao:'Aguardando aprovação ou reprovação',destino:'check',parametros:{sub:'aprovar',competencia}},
        {titulo:'Sinistros',modulo:'sinistros',permissao:consultarSinistros,
            total:(atual?.sinistros || []).filter(s=>!['CONCLUIDO','CANCELADO'].includes(normalizarPerfil(s.statusSinistro)) && noPeriodo(s.dataHoraOcorrido || s.dataCriacao || s.created)).length,
            descricao:'Registros em aberto para tratamento',destino:'sinistros',parametros:{sub:'gestao',status:'ABERTOS',competencia}}
    ];
    return h('section',{style:{display:'grid',gap:16}},
        h('div',{className:'row',style:{flexWrap:'wrap'}},
            h('div',{className:'grow'},h('h2',null,'Central de Tratativas'),
                h('p',{className:'muted'},'Pendências que precisam de análise, validação ou decisão da Logística.')),
            h('button',{type:'button',className:'btn btn-s btn-sm',disabled:!atual,onClick:()=>{ApiService.limparCache();setRevisao(v=>v+1);}},atual?'Atualizar pendências':'Carregando…')),
        h('div',{className:'card'},h('label',null,'Período das pendências',
            h('select',{value:periodo,onChange:e=>setPeriodo(e.target.value),style:{maxWidth:280}},
                h('option',{value:'TODOS'},'Todos os meses'),MESES_2026.map(m=>h('option',{key:m,value:m},mesLabel(m))))),
            h('p',{className:'muted',style:{marginTop:8}},'Clique em uma pendência para abrir o módulo responsável.')),
        !atual && h('p',{role:'status'},'Carregando pendências operacionais…'),
        !!atual?.falhas.length && h('div',{className:'aviso-box',role:'alert'},'Não foi possível consultar: '+atual.falhas.join(', ')+'. Atualize as pendências para tentar novamente.'),
        h('div',{className:'cards4'},itens.map(item=>h('button',{
            key:item.titulo,type:'button',className:'card kpi card-atalho',disabled:!item.permissao,
            onClick:()=>onNavegar?.(item.destino,item.parametros)},
            h('span',{className:'seta-card','aria-hidden':true},'→'),h('div',{className:'l'},item.titulo),
            h('div',{className:'v num'},!item.permissao || !atual || falhou(item.modulo)?'—':item.total),
            h('div',{className:'muted'},!item.permissao?'Sem acesso a este módulo':falhou(item.modulo)?'Consulta indisponível':item.descricao)))),
        h('div',{className:'aviso-box'},'A Central de Tratativas reúne as pendências e direciona para cada módulo. A análise e a decisão são registradas na tela responsável.'));
}
