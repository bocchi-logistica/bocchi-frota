import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=source.indexOf('    useEffect(() => {\n        if (!user || !_expiraSessao) return;');
const effect=source.slice(start,source.indexOf('    const [toastMsg',start));
function fixture(status=200){
 let now=1000000,callback,clean,requests=0,exits=0,delay;
 const events={};const ctx=vm.createContext({user:{login:'teste'},_token:'original',_expiraSessao:new Date(now+300000).toISOString(),Date:{now:()=>now,parse:Date.parse},
 CONFIG:{API_URL:'https://teste.local'},document:{visibilityState:'visible'},sessionStorage:{setItem(){}},
 ApiService:{sair(){exits++}},setUser(){},useEffect(f){clean=f()},clearTimeout(){},setTimeout(f,d){callback=f;delay=d;return 1},
 window:{addEventListener(n,f){events[n]=f},removeEventListener(n){delete events[n]}},
 async fetchComTimeout(){requests++;return {status,ok:status===200,async json(){return {ok:true,token:'renovado',expiraEm:new Date(now+300000).toISOString()}}}}
 });
 vm.runInContext(effect,ctx);
 return {ctx,events,advance(ms){now+=ms},expire(){callback()},clean:()=>clean(),get requests(){return requests},get exits(){return exits},get delay(){return delay}};
}
test('inatividade encerra sessão sem polling',()=>{
 const f=fixture();assert.equal(f.delay,300000);assert.equal(f.requests,0);f.expire();assert.equal(f.exits,1);
});
test('interação real renova; evento sintético não mantém sessão',async()=>{
 const f=fixture();await f.events.keydown({isTrusted:false});assert.equal(f.requests,0);
 f.advance(60000);await f.events.keydown({isTrusted:true});assert.equal(f.requests,1);assert.equal(f.ctx._token,'renovado');assert.equal(f.delay,300000);
 await f.events.scroll({isTrusted:true});assert.equal(f.requests,1);
});
test('interação após expiração não renova sessão',async()=>{
 const f=fixture();f.advance(300000);await f.events.pointerdown({isTrusted:true});assert.equal(f.requests,0);assert.equal(f.exits,1);
});
test('servidor revoga sessão e desmontagem retira ouvintes',async()=>{
 const f=fixture(401);await f.events.keydown({isTrusted:true});assert.equal(f.exits,1);f.clean();assert.deepEqual(Object.keys(f.events),[]);
});
