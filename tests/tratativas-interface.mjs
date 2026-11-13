import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../js/modulos/tratativas.js',import.meta.url),'utf8');
function preparar({permitidos=['tratativas.visualizar','contestacoes.visualizar','checklist.aprovacao','sinistros.visualizar'],falharSinistros=false}={}){
    const states=[],effects=[],chamadas=[],destinos=[];let cursor=0;
    const h=(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)});
    const context=vm.createContext({React:{createElement:h},MES_ATUAL:'01/2026',MESES_2026:['01/2026','02/2026'],mesLabel:m=>m,
        normalizarPerfil:v=>String(v).toUpperCase(),pode:(u,p)=>permitidos.includes(p),
        useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},
        useEffect:f=>effects.push(f),ApiService:{limparCache(){},
            async admListarContestacoes(){chamadas.push('contestações');return {contestacoes:[
                {status:'PENDENTE',dataCarga:'2026-01-10',tipoContestacao:'ERRO_CARGA'},
                {status:'PENDENTE',dataCarga:'2026-02-10',tipoContestacao:'DIVERGENCIA_PBT'},
                {status:'APROVADO',dataCarga:'2026-01-10'}]};},
            async admListarChecklists(){chamadas.push('checklists');return {itens:[{status:'PENDENTE',dataHoraLocal:'2026-01-05'},{status:'APROVADO',data:'2026-01-06'}]};},
            async admListarSinistros(){chamadas.push('sinistros');if(falharSinistros)throw Error('offline');return {sinistros:[{statusSinistro:'ABERTO',dataCriacao:'2026-01-12'},{statusSinistro:'CONCLUIDO',dataCriacao:'2026-01-13'}]};}}});
    vm.runInContext(source,context);
    context.props={user:{},onNavegar:(...args)=>destinos.push(args)};
    const render=()=>{cursor=0;return vm.runInContext('AdmTratativas(props)',context);};
    const carregar=async()=>{effects.splice(0).forEach(f=>f());await new Promise(setImmediate);};
    return {render,carregar,chamadas,destinos};
}
function nodes(n){if(!n||typeof n!=='object')return [];return [n,...n.children.flatMap(nodes)];}
function texto(n){return n==null?'':typeof n==='object'?n.children.map(texto).join(' '):String(n);}
function card(root,titulo){return nodes(root).find(n=>n.type==='button'&&n.children.some(c=>c?.props?.className==='l'&&texto(c)===titulo));}

test('central consulta somente pendências, filtra período e abre o módulo de origem',async()=>{
    const t=preparar();t.render();await t.carregar();let root=t.render();
    assert.match(texto(root),/Central de Tratativas/);assert.doesNotMatch(texto(root),/Visão geral|Detalhar|Frete total|Faturamento/);
    assert.deepEqual(t.chamadas,['contestações','checklists','sinistros']);
    assert.match(texto(card(root,'Contestações de carga')),/1/);assert.match(texto(card(root,'PBT')),/0/);
    card(root,'Contestações de carga').props.onClick();assert.equal(t.destinos[0][0],'contest');
    assert.equal(t.destinos[0][1].competencia,'2026-01');assert.equal(t.destinos[0][1].tipoContestacao,'ERRO_CARGA');
    nodes(root).find(n=>n.type==='select').props.onChange({target:{value:'TODOS'}});root=t.render();
    assert.match(texto(card(root,'PBT')),/1/);assert.equal(t.chamadas.length,3);
});

test('módulo sem permissão não é consultado; falha não é apresentada como zero pendências',async()=>{
    const t=preparar({permitidos:['tratativas.visualizar','sinistros.visualizar'],falharSinistros:true});
    t.render();await t.carregar();const root=t.render();
    assert.deepEqual(t.chamadas,['sinistros']);assert.equal(card(root,'Check list').props.disabled,true);
    assert.match(texto(root),/Não foi possível consultar: sinistros/);
    assert.match(texto(card(root,'Sinistros')),/— Consulta indisponível/);
});
