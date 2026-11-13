import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const api=source.slice(source.indexOf('let _expiraSessao = null;'),source.indexOf('\n};',source.indexOf('let _expiraSessao = null;'))+3);
const fila=source.slice(source.indexOf('const FilaEnvio = {'),source.indexOf('// O reenvio automático'));
function fixture({duringSave,duringFetch,items=1}={}){
 const records=Array.from({length:items},(_,i)=>({idLocal:'checklist-'+i,donoLogin:'mot-a',motorista:{nome:'Teste A',login:'mot-a'},veiculo:{placa:'ABC1234'},respostas:[{idPergunta:1,resposta:'C'}],statusEnvio:'PENDENTE',tentativas:0}));
 const requests=[],toasts=[];let changed=false,ctx;
 const context={URLSearchParams,Date,Event,console,CONFIG:{API_URL:'https://teste.local',MAX_TENTATIVAS:3,RETRY_DELAYS_MS:[1]},cacheLeiturasPortal:{limpar(){},obter(_key,fn){return fn()}},window:{dispatchEvent(){}},agoraISO:()=>new Date().toISOString(),IDB:{async listarFila(){return structuredClone(records)},async salvarFila(item){records[Number(item.idLocal.split('-').at(-1))]=structuredClone(item);if(item.statusEnvio==='ENVIANDO'&&!changed&&duringSave){changed=true;duringSave(ctx)}}},async fetchComTimeout(url,opts){requests.push({url,...opts});if(duringFetch)await duringFetch(ctx);return new Response(JSON.stringify({sucesso:true,protocolo:'CK-TESTE'}),{status:200})},setTimeout(){throw Error('Não deve agendar retentativa neste teste')}};
 ctx=vm.createContext(context);vm.runInContext(api+'\n'+fila+'\nglobalThis.app={ApiService,FilaEnvio,entrar(token,login){_token=token;_loginSessao=login;_expiraSessao=new Date(Date.now()+60000).toISOString()}};',ctx);
 ctx.app.entrar('token-a','mot-a');return {ctx,records,requests,toasts,async run(){await ctx.app.FilaEnvio.processar(x=>toasts.push(x),'mot-a')}};
}
for(const [label,token,login] of [['outro motorista','token-b','mot-b'],['nova sessão do mesmo motorista','token-novo','mot-a']])test('troca para '+label+' durante IndexedDB suspende envio',async()=>{
 const f=fixture({duringSave:ctx=>ctx.app.entrar(token,login)});await f.run();assert.equal(f.requests.length,0);assert.equal(f.records[0].statusEnvio,'PENDENTE');assert.equal(f.records[0].tentativas,0);assert.equal(f.toasts.length,0);
});
test('sessão estável envia uma vez com token do proprietário',async()=>{
 const f=fixture();await f.run();assert.equal(f.requests.length,1);assert.equal(f.requests[0].headers.Authorization,'Bearer token-a');assert.equal(f.records[0].statusEnvio,'ENVIADO');assert.equal(f.toasts.length,1);
});
test('troca após início da requisição não envia o próximo registro nem avisa outro usuário',async()=>{
 const f=fixture({items:2,duringFetch:ctx=>ctx.app.entrar('token-b','mot-b')});await f.run();assert.equal(f.requests.length,1);assert.equal(f.requests[0].headers.Authorization,'Bearer token-a');assert.equal(f.records[0].statusEnvio,'ENVIADO');assert.equal(f.records[1].statusEnvio,'PENDENTE');assert.equal(f.toasts.length,0);
});
test('RH transmite ID do motorista em vez de nome homônimo',async()=>{
 const f=fixture();await f.ctx.app.ApiService.obterPremiacaoMotorista('Mesmo Nome',['2025-01'],'3');const url=new URL(f.requests[0].url);assert.equal(url.searchParams.get('motoristaItemId'),'3');assert.equal(url.searchParams.has('motoristaNome'),false);
});
