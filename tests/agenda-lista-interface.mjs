import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/modulos/agendamentos.js',import.meta.url),'utf8');
test('lista agrupa reservas do mês, inclui travessia de mês e abre detalhe original',()=>{
 const ctx=vm.createContext({React:{createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)})}});
 vm.runInContext(source,ctx);
 let aberto=null;
 ctx.props={mes:new Date(2026,10,1),veiculos:[{id:1,placa:'ABC2030',modelo:'Veículo teste'}],eventos:[
 {id:1,placa:'ABC2030',veiculoId:1,saidaPrevista:'2026-11-03T08:00:00',retornoPrevisto:'2026-11-03T17:00:00',destino:'Passo Fundo',status:'AGENDADO',meuAgendamento:true},
 {id:2,placa:'ABC2030',saidaPrevista:'2026-10-31T08:00:00',retornoPrevisto:'2026-11-01T17:00:00',status:'EM_USO'},
 {id:3,saidaPrevista:'2026-12-01T08:00:00',retornoPrevisto:'2026-12-01T17:00:00'}],onAbrir:e=>aberto=e};
 function nodes(n){return !n||typeof n!=='object'?[]:[n,...n.children.flatMap(nodes)]}
 const tree=vm.runInContext('ListaReservasAgenda(props)',ctx),all=nodes(tree),cards=all.filter(n=>n.props.className==='agenda-reserva-card');
 assert.equal(cards.length,2);assert.equal(cards[0].props.key,2);
 const one=cards.find(n=>n.props.key===1);one.props.onClick();assert.equal(aberto,ctx.props.eventos[0]);
 const content=JSON.stringify(tree);assert.match(content,/ABC2030/);assert.match(content,/Veículo teste/);assert.match(content,/Passo Fundo/);assert.match(content,/Saída prevista/);assert.match(content,/Retorno previsto/);
});
