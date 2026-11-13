import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../js/modulos/indicadores.js',import.meta.url),'utf8');
function tela(){
    const states=[]; let cursor=0;
    const React={Fragment:'fragment',createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)}),
        useState(initial){const index=cursor++;if(!(index in states))states[index]=initial;return [states[index],v=>states[index]=typeof v==='function'?v(states[index]):v];},useEffect(){}};
    const ctx=vm.createContext({React,HOJE:'2026-01-01',URLSearchParams,Intl,ApiService:{limparCache(){}},normalizarPerfil:v=>v});
    vm.runInContext(source,ctx);
    const render=()=>{cursor=0;return vm.runInContext('IndicadoresFrotaPesada()',ctx);};
    render();states[9]={chave:'2026-01/2026-01/0',linhas:[{mes:'2026-01',placa:'AAA1111',tipo:'Vanderleia',anoFabricacao:2025,cargas:3,faturamento:300,peso:90,meta:500,
        motoristas:[{id:'1',nome:'Primeiro motorista',cargas:1,faturamento:100,peso:30,inicio:'2026-01-01',fim:'2026-01-01'},
            {id:'sem',nome:'Sem motorista identificado',cargas:2,faturamento:200,peso:60,inicio:'2026-01-02',fim:'2026-01-03'}]}]};
    return {render,states};
}
function nodes(n){if(!n||typeof n!=='object')return [];return [n,...n.children.flatMap(nodes)];}
function texto(n){if(n==null)return '';return typeof n==='object'?n.children.map(texto).join(' '):String(n);}

test('filtro de motorista recorta totais e botão detalhar preserva placa/mês e motorista selecionado',()=>{
    const {render,states}=tela();let root=render();
    const label=nodes(root).find(n=>n.type==='label'&&n.children[0]==='Motorista');
    const select=label.children.find(n=>n.type==='select');
    assert.match(texto(select),/Sem motorista identificado/);
    select.props.onChange({target:{value:'sem'}});root=render();
    assert.match(texto(root),/200,00/);assert.match(texto(root),/60 t/);
    assert.match(texto(root),/500,00/);assert.match(texto(root),/0 \/ 1/);
    assert.match(texto(root),/Fora da meta/);
    const detalhe=nodes(root).find(n=>n.type==='button'&&texto(n)==='Detalhar');
    detalhe.props.onClick();root=render();
    const component=nodes(root).find(n=>typeof n.type==='function'&&n.type.name==='DetalheIndicadoresFrota');
    assert.equal(component.props.motorista,'sem');assert.equal(component.props.linha.placa,'AAA1111');assert.equal(component.props.linha.mes,'2026-01');
    component.props.onVoltar();assert.equal(states[3],'sem');assert.equal(states[0],'2026-01');
});

test('páginas futuras preservam filtros e informam ausência de base sem apresentar valores fictícios',()=>{
    const {render}=tela();let root=render();
    nodes(root).find(n=>n.type==='button'&&texto(n)==='Despesas').props.onClick();root=render();
    assert.match(texto(root),/após a disponibilização da base/);
    assert.doesNotMatch(texto(root),/R\$/);
    nodes(root).find(n=>n.type==='button'&&texto(n)==='Faturamento').props.onClick();root=render();
    assert.match(texto(root),/Conferir valores por placa/);
});
