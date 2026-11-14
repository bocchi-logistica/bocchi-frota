import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/modulos/premiacao.js',import.meta.url),'utf8');
for(const status of ['FECHADO','CALCULADO','ABERTO'])test('categorias e motivos consultáveis com status '+status,()=>{
 const states=[];let cursor=0;const React={Fragment:'fragment',createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)})};
 const st={apuracoes:status==='ABERTO'?[]:[{resumoMotorista:true,mes:'01/2026',status,premioBruto:500,totalDescontos:50,apurado:450}]};
 const ctx=vm.createContext({React,useState(v){const i=cursor++;if(!(i in states))states[i]=v;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]},
 MES_ATUAL:'01/2026',QUADS:[{meses:['01/2026'],nome:'Quadrimestre',pgto:'Maio'}],mesesAteHoje:()=>['01/2026'],mesLabel:v=>v,brl:v=>'R$ '+v.toFixed(2),brn:v=>String(v),dataBR:v=>v,normalizar:v=>String(v||'').toLowerCase(),
 apuracaoMes:()=>({fat:0,meta:null,status:'ABERTO',prod:999,totDesc:-50,apurado:949,descs:[{item:'Multas',valor:-50,situacao:'Com ocorrência',quantidade:1,motivo:'Motivo de teste',dataOcorrencia:'2026-01-10'}]}),st,user:{nome:'Teste'},dados:{}});
 vm.runInContext(source,ctx);
 const render=()=>{cursor=0;return vm.runInContext('TelaPremiacao({st,user,dados})',ctx)};
 const nodes=n=>!n||typeof n!=='object'?[]:[n,...n.children.flatMap(nodes)];
 const text=n=>n==null?'':typeof n==='object'?n.children.map(text).join(' '):String(n);
 let root=render();
 const grupo=nodes(root).find(n=>n.type==='details'&&n.props.className==='premiacao-descontos-grupo');
 assert(grupo);assert.equal(grupo.props.open,undefined);
 const total=nodes(grupo).find(n=>n.type==='summary');assert.match(text(total),/Total de descontos/);assert.match(text(total),/R\$ -50.00/);
 assert(nodes(grupo).some(n=>n.props.className==='ocorrencia-abrir'));
 for(const label of ['Multas','Auditoria Interna','Notificação / Advertência'])assert(text(root).includes(label));
 const button=nodes(root).find(n=>n.props.className==='ocorrencia-abrir');assert(button);button.props.onClick();root=render();assert.match(text(root),/Motivo de teste/);
 if(status!=='ABERTO'){assert.match(text(root),/R\$ 450.00/);assert.doesNotMatch(text(root),/R\$ 949.00/);assert.match(text(root),/Total de descontos/);}
 assert(!nodes(root).some(n=>n.type==='button'&&/Editar|Salvar/.test(text(n))));
});
