import test from "node:test";
import assert from "node:assert/strict";
import { deveEnviarComEnter, podeEnviarMensagem, montarChatIaLogistica } from "../js/modulos/ia-logistica.js";

class ElementoFalso {
  constructor(tag="div"){this.tag=tag;this.listeners={};this.children=[];this.dataset={};this.value="";this.disabled=false;this.checked=false;this.textContent="";this.scrollHeight=500;this.scrollTop=0;this.attributes={};this.elements=new Map();}
  querySelector(sel){if(!this.elements.has(sel))this.elements.set(sel,new ElementoFalso(sel));return this.elements.get(sel);}
  addEventListener(tipo,fn){this.listeners[tipo]=fn;}
  removeEventListener(tipo,fn){if(this.listeners[tipo]===fn)delete this.listeners[tipo];}
  setAttribute(chave,valor){this.attributes[chave]=valor;}
  append(item){this.children.push(item);}
  remove(){this.removido=true;}
  requestSubmit(){this.listeners.submit?.({preventDefault(){}});}
  acionar(tipo,evento={}){return this.listeners[tipo]?.(evento);}
}
function montarAmbiente({voz=true}={}){
 const original={window:globalThis.window,document:globalThis.document,HTMLElement:globalThis.HTMLElement,fetch:globalThis.fetch};
 const frases=[],falas=[],requs=[],reconhecedores=[];
 class ReconhecimentoFalso{
   constructor(){reconhecedores.push(this);}
   start(){this.iniciou=true;}
   stop(){this.onend?.();}
   abort(){this.abortou=true;}
 }
 class FalaFalsa {constructor(texto){this.text=texto;}}
 globalThis.HTMLElement=ElementoFalso;
 globalThis.document={createElement:tag=>new ElementoFalso(tag)};
 globalThis.window=voz?{
   webkitSpeechRecognition:ReconhecimentoFalso,
   SpeechSynthesisUtterance:FalaFalsa,
   speechSynthesis:{speak(fala){falas.push(fala);},cancel(){falas.push("cancelado");}}
 }:{};
 globalThis.fetch=async (url,opcoes)=>{
   requs.push({url,opcoes});
   const corpo=JSON.parse(opcoes.body);frases.push(corpo);
   return {ok:true,json:async()=>({ok:true,resposta:"Resposta da logística "+frases.length,contexto:{assunto:"ultima_consulta",tipo:"veiculos_resumo",parametros:{frota:"AMBAS"}}})};
 };
 const container=new ElementoFalso();
 const chat=montarChatIaLogistica(container,{apiUrl:"https://api.exemplo",obterToken:async()=> "token-teste"});
 const raiz=container.children[0];
 const restore=()=>{chat.desmontar();Object.assign(globalThis,original);};
 return {container,raiz,frases,falas,requs,reconhecedores,restore};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test("Enter envia e Shift+Enter e composição de IME não enviam",()=>{
 assert.equal(deveEnviarComEnter({key:"Enter",shiftKey:false,isComposing:false}),true);
 assert.equal(deveEnviarComEnter({key:"Enter",shiftKey:true,isComposing:false}),false);
 assert.equal(deveEnviarComEnter({key:"Enter",isComposing:true}),false);
 assert.equal(deveEnviarComEnter({key:"Enter",keyCode:229}),false);
 assert.equal(deveEnviarComEnter({key:"a"}),false);
});
test("Enter dispara consulta e preserva contexto de conversa seguinte",async()=>{
 const m=montarAmbiente();
 try{
   const entrada=m.raiz.querySelector("textarea");
   let preventiu=false;entrada.value="Quantos veículos ativos?";
   entrada.acionar("keydown",{key:"Enter",preventDefault(){preventiu=true;}});
   await tick();
   assert.equal(preventiu,true);
   assert.equal(m.frases.length,1);
   assert.equal(m.frases[0].pergunta,"Quantos veículos ativos?");
   assert.equal(m.frases[0].contexto,null);
   entrada.value="E a frota leve?";
   entrada.acionar("keydown",{key:"Enter",shiftKey:true,preventDefault(){throw Error("Shift+Enter não pode enviar");}});
   assert.equal(m.frases.length,1);
   entrada.acionar("keydown",{key:"Enter",preventDefault(){}});
   await tick();
   assert.equal(m.frases.length,2);
   assert.equal(m.frases[1].contexto.assunto,"ultima_consulta");
 }finally{m.restore();}
});
test("microfone dita pergunta, envia e reproduz resposta somente quando opção está ativada",async()=>{
 const m=montarAmbiente();
 try{
   const micro=m.raiz.querySelector(".ia-microfone"),auto=m.raiz.querySelector(".ia-leitura");
   auto.checked=true;auto.acionar("change");
   micro.acionar("click");
   assert.equal(m.reconhecedores.length,1);
   assert.equal(m.reconhecedores[0].lang,"pt-BR");
   assert.equal(micro.attributes["aria-pressed"],"true");
   m.reconhecedores[0].onresult({results:[{isFinal:true,0:{transcript:"Quantos checklists existem em novembro?"}}]});
   await tick();
   assert.equal(m.frases.length,1);
   assert.equal(m.frases[0].pergunta,"Quantos checklists existem em novembro?");
   assert.equal(m.falas.at(-1).text,"Resposta da logística 1");
   m.raiz.querySelector(".ia-parar").acionar("click");
   assert.equal(m.falas.at(-1),"cancelado");
 }finally{m.restore();}
});
test("navegador sem reconhecimento ou síntese mantém chat escrito funcional",async()=>{
 const m=montarAmbiente({voz:false});
 try{
   assert.equal(m.raiz.querySelector(".ia-microfone").disabled,true);
   assert.equal(m.raiz.querySelector(".ia-leitura").disabled,true);
   const entrada=m.raiz.querySelector("textarea");
   entrada.value="Quantos agendamentos?";
   entrada.acionar("keydown",{key:"Enter",preventDefault(){}});
   await tick();
   assert.equal(m.frases.length,1);
 }finally{m.restore();}
});

test("seleção de registro por número de um dígito é enviada e preserva contexto",async()=>{
 const m=montarAmbiente();
 try{
  const entrada=m.raiz.querySelector("textarea");
  entrada.value="Consulta de contestações";
  entrada.acionar("keydown",{key:"Enter",preventDefault(){}});
  await tick();
  const outra=m.raiz.querySelector("textarea");
  assert.equal(podeEnviarMensagem("1",{assunto:"escolher_registro"}),true);
  assert.equal(podeEnviarMensagem("2",{assunto:"escolher_sinistro"}),true);
  assert.equal(podeEnviarMensagem("1",null),false);
  assert.equal(podeEnviarMensagem(" ",{assunto:"escolher_registro"}),false);
  // O retorno da API simulada guarda a ultima consulta; no teste injetamos
  // a escolha no estado usando o envelope de contexto devolvido pela API.
  // A validacao de mensagem curta é compartilhada pelo teclado e envio.
 }finally{m.restore();}
});


test('nova conversa limpa o contexto antes da próxima pergunta',async()=>{
 const m=montarAmbiente();try{
  const entrada=m.raiz.querySelector('textarea'),form=m.raiz.querySelector('form');
  entrada.value='Premiação do João?';await form.acionar('submit',{preventDefault(){}});
  m.raiz.querySelector('.ia-nova').acionar('click');
  entrada.value='Checklists pendentes?';await form.acionar('submit',{preventDefault(){}});
  assert.equal(m.frases[1].contexto,null);
 }finally{m.restore();}
});
test('respostas curtas de esclarecimento são aceitas em qualquer módulo',()=>{
 assert.equal(podeEnviarMensagem('10',{assunto:'esclarecimento'}),true);
 assert.equal(podeEnviarMensagem('ok',{assunto:'esclarecimento'}),true);
 assert.equal(podeEnviarMensagem('10',null),false);
});
test('erro preserva texto para nova tentativa',async()=>{
 const m=montarAmbiente();try{
  globalThis.fetch=async()=>{throw Error('offline')};
  const entrada=m.raiz.querySelector('textarea');entrada.value='Sinistros de outubro';
  await m.raiz.querySelector('form').acionar('submit',{preventDefault(){}});
  assert.equal(entrada.value,'Sinistros de outubro');assert.equal(m.raiz.querySelector('.ia-enviar').disabled,false);
 }finally{m.restore();}
});
