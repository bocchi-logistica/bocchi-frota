import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/modulos/checklist.js',import.meta.url),'utf8');
function setup(){
 const states=[],refs=[];let cursor=0,ri=0,envios=0;
 const props={perguntas:[
 {id:'1',texto:'Faróis',grupo:'Elétrica',obrigatoria:true,permiteNA:false,observacaoObrigatoriaNC:true,fotoNC:true},
 {id:'2',texto:'Indicadores',grupo:'Elétrica',obrigatoria:true,permiteNA:true},
 {id:'3',texto:'Pneus',grupo:'Pneus',obrigatoria:true,permiteNA:false,observacaoObrigatoriaNC:true,fotoNC:true}],resps:{},
 setResp(id,campo,v){props.resps[id]={...props.resps[id],[campo]:v}},anexar(){},removerFoto(){},fileRefs:{current:{}},enviar(){envios++},enviando:false};
 const React={createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)})};
 const ctx=vm.createContext({React,useState(v){const i=cursor++;if(!(i in states))states[i]=v;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]},useRef(v){const i=ri++;return refs[i]||(refs[i]={current:v})},setTimeout:f=>f(),props});
 vm.runInContext(source.slice(0,source.indexOf('function TelaChecklist(')),ctx);
 return{props,states,ctx,render(){cursor=0;ri=0;return vm.runInContext('ChecklistPorGrupos(props)',ctx)},envios:()=>envios};
}
const nodes=n=>!n||typeof n!=='object'?[]:[n,...n.children.flatMap(nodes)];
const text=n=>n==null?'':typeof n==='object'?n.children.map(text).join(' '):String(n);
const click=(tree,label)=>{const b=nodes(tree).find(n=>n.type==='button'&&text(n)===label);assert(b,'Botão '+label);b.props.onClick();};
test('avança por grupo, mantém respostas e só envia todos no último',()=>{
 const t=setup();let r=t.render();assert(!text(r).includes('Enviar checklist'));assert.equal(nodes(r).filter(n=>n.props.className?.startsWith('checklist-escolha NA')).length,0);
 click(r,'Próximo grupo →');assert.equal(t.envios(),0);assert(text(t.render()).includes('Responda este item.'));
 t.props.resps={'1':{resp:'C'},'2':{resp:'C'}};r=t.render();click(r,'Próximo grupo →');r=t.render();assert(text(r).includes('Enviar checklist'));assert.equal(t.envios(),0);
 t.props.resps['3']={resp:'NC',obs:'Desgaste'};click(r,'Enviar checklist');assert.equal(t.envios(),0);assert(text(t.render()).includes('Anexe a foto obrigatória.'));
 t.props.resps['3'].foto='data:image/jpeg;base64,teste';r=t.render();click(r,'Enviar checklist');assert.equal(t.envios(),1);
 click(t.render(),'← Grupo anterior');assert.equal(t.props.resps['2'].resp,'C');
 t.props.resps['1']={resp:'NA'};click(t.render(),'Próximo grupo →');assert(text(t.render()).includes('Escolha Conforme ou Não conforme'));assert.equal(t.envios(),1);
});
test('exigências de observação/foto e opcionalidade seguem cadastro',()=>{
 const {ctx}=setup();
 ctx.p={id:'x',obrigatoria:false,permiteNA:false,observacaoObrigatoriaNC:false,fotoNC:false};
 assert.equal(vm.runInContext('pendenciaItemChecklist(p,{})',ctx),'');
 assert.equal(vm.runInContext('pendenciaItemChecklist(p,{resp:"NC"})',ctx),'');
 ctx.p.observacaoObrigatoriaNC=true;
 assert.match(vm.runInContext('pendenciaItemChecklist(p,{resp:"NC",obs:"  "})',ctx),/Descreva/);
 assert.equal(vm.runInContext('pendenciaItemChecklist({...p,obrigatoria:true},{},true)',ctx),'');
});
