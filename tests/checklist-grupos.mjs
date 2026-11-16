import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/modulos/checklist.js',import.meta.url),'utf8');
function setup(){
 const states=[],refs=[],effects=[];let cursor=0,ri=0,envios=0;
 const props={perguntas:[
 {id:'1',texto:'Faróis',grupo:'Elétrica',obrigatoria:true,permiteNA:false,observacaoObrigatoriaNC:true,fotoNC:true},
 {id:'2',texto:'Indicadores',grupo:'Elétrica',obrigatoria:true,permiteNA:true},
 {id:'3',texto:'Pneus',grupo:'Pneus',obrigatoria:true,permiteNA:false,observacaoObrigatoriaNC:true,fotoNC:true}],resps:{},
 setResp(id,campo,v){props.resps[id]={...props.resps[id],[campo]:v}},anexar(){},removerFoto(){},fileRefs:{current:{}},enviar(){envios++},enviando:false};
 const React={useEffect:f=>effects.push(f),createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)})};
 const ctx=vm.createContext({React,document:{activeElement:null},useState(v){const i=cursor++;if(!(i in states))states[i]=v;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]},useRef(v){const i=ri++;return refs[i]||(refs[i]={current:v})},setTimeout:f=>f(),props});
 vm.runInContext(source.slice(0,source.indexOf('function TelaChecklist(')),ctx);
 return{props,states,ctx,refs,flush(){effects.forEach(f=>f());},render(){cursor=0;ri=0;effects.length=0;return vm.runInContext('ChecklistPorGrupos(props)',ctx)},envios:()=>envios};
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

test('NC sem concluir item: foto completa recolhe; texto em edição permanece aberto',()=>{
 const t=setup();let tree=t.render();
 click(tree,'! Não conforme');tree=t.render();t.flush();
 assert(!text(tree).includes('Concluir item'));
 let first=nodes(tree).find(n=>n.props.className==='checklist-item');
 first.props.ref({contains:()=>true});
 t.props.resps['1']={resp:'NC',obs:'Problema',foto:'foto-1'};
 t.ctx.document.activeElement={tagName:'TEXTAREA'};tree=t.render();t.flush();tree=t.render();
 first=nodes(tree).find(n=>n.props.className==='checklist-item');
 assert(nodes(first).some(n=>n.type==='textarea'));
 const evidence=nodes(first).find(n=>n.props.className==='checklist-evidencias');
 evidence.props.onBlur({currentTarget:{contains:()=>true},relatedTarget:{}});
 assert(nodes(t.render()).some(n=>n.type==='textarea'));
 evidence.props.onBlur({currentTarget:{contains:()=>false},relatedTarget:null});
 first=nodes(t.render()).find(n=>n.props.className==='checklist-item');
 assert(!nodes(first).some(n=>n.type==='textarea'));
 const resumo=nodes(first).find(n=>n.props.className==='checklist-item-resumo');resumo.props.onClick();assert(nodes(t.render()).some(n=>n.type==='textarea'));
});
test('foto obrigatória ausente mantém NC aberta; foto pronta fecha automaticamente',()=>{
 const t=setup();let tree=t.render();click(tree,'! Não conforme');
 t.props.resps['1']={resp:'NC',obs:'Problema'};tree=t.render();t.flush();
 const evidence=nodes(tree).find(n=>n.props.className==='checklist-evidencias');
 evidence.props.onBlur({currentTarget:{contains:()=>false},relatedTarget:null});
 assert(nodes(t.render()).some(n=>n.type==='textarea'));
 t.props.resps['1'].foto='foto-pronta';t.render();t.flush();
 assert(!nodes(t.render()).some(n=>n.type==='textarea'));
});
test('foto opcional: descrição suficiente recolhe ao sair, sem impedir anexo',()=>{
 const t=setup();t.props.perguntas[0].fotoNC=false;
 let tree=t.render();click(tree,'! Não conforme');
 t.props.resps['1']={resp:'NC',obs:'Problema'};tree=t.render();
 const e=nodes(tree).find(n=>n.props.className==='checklist-evidencias');
 e.props.onBlur({currentTarget:{contains:()=>true},relatedTarget:{}});
 assert(nodes(t.render()).some(n=>n.type==='textarea'));
 e.props.onBlur({currentTarget:{contains:()=>false},relatedTarget:null});
 assert(!nodes(t.render()).some(n=>n.type==='textarea'));
});
