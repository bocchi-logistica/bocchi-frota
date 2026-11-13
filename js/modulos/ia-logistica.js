// Componente visual desacoplado: nao persiste perguntas ou respostas.
// O host fornece token por callback; nunca gravar credenciais no browser storage.
export function deveEnviarComEnter(evento){
  return evento?.key==="Enter"&&!evento.shiftKey&&!evento.isComposing&&evento.keyCode!==229;
}
export function podeEnviarMensagem(pergunta,contexto){
  const texto=String(pergunta||"").trim();
  if(texto.length>=3&&texto.length<=600)return true;
  return texto.length>=1&&texto.length<3&&!!contexto?.assunto;
}
export function montarChatIaLogistica(container,{apiUrl="",obterToken}){
  if(!(container instanceof HTMLElement)||typeof obterToken!=="function")throw new Error("Configuracao de chat invalida.");
  const raiz=document.createElement("section");raiz.className="ia-logistica";
  raiz.innerHTML=`<style>.ia-logistica{font:inherit;max-width:900px;margin:auto;color:#173f2e}.ia-logistica .ia-mensagens{min-height:260px;max-height:56vh;overflow:auto;border:1px solid #d7e1da;border-radius:14px;padding:16px;background:#fafcfb}.ia-logistica .ia-msg{white-space:pre-wrap;margin:12px 0;padding:12px;border-radius:12px;background:#eef4ef}.ia-logistica .ia-msg[data-autor=usuario]{background:#e3f1e8}.ia-logistica form{display:flex;gap:8px;margin-top:12px}.ia-logistica textarea{flex:1;min-height:56px;resize:vertical;border:1px solid #b9c9be;border-radius:10px;padding:10px;font:inherit}.ia-logistica button{border:0;border-radius:10px;padding:12px 18px;background:#176344;color:white;font-weight:600;cursor:pointer}.ia-logistica button:disabled{opacity:.5}.ia-logistica small{display:block;margin-top:10px;color:#63776a}.ia-logistica button.ia-microfone{padding:10px;min-width:50px;font-size:1.2rem}.ia-logistica button.ia-microfone[aria-pressed=true]{background:#a32630}.ia-logistica .ia-voz{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px}.ia-logistica .ia-voz button{padding:8px 10px;background:#e1ede6;color:#173f2e}.ia-logistica .ia-voz label{display:flex;align-items:center;gap:6px;cursor:pointer}.ia-logistica .ia-status{color:#526c5c;margin-top:6px;min-height:1.4em}.ia-logistica textarea{min-width:0}@media(max-width:520px){.ia-logistica form{gap:6px}.ia-logistica button.ia-enviar{padding:10px}}</style><h2>IA Logística</h2><button class="ia-nova" type="button">Nova conversa</button><div class="ia-mensagens" role="log" aria-live="polite"></div><form><textarea maxlength="600" aria-label="Pergunta para IA Logística" placeholder="Pergunte sobre a operação logística..." required></textarea><button type="button" class="ia-microfone" aria-label="Ditar pergunta" aria-pressed="false" title="Ditar pergunta por voz">🎙️</button><button class="ia-enviar" type="submit">Consultar</button></form><div class="ia-voz"><label><input class="ia-leitura" type="checkbox"> 🔊 Ler respostas em voz alta</label><button class="ia-ouvir" type="button" disabled>Ouvir última resposta</button><button class="ia-parar" type="button" disabled>Parar áudio</button></div><div class="ia-status" role="status" aria-live="polite"></div><small>Enter envia · Shift+Enter quebra linha. O ditado pode utilizar serviços de voz do navegador. Consultas somente leitura; mensagens não são salvas no banco.</small>`;
  const mensagens=raiz.querySelector(".ia-mensagens"),form=raiz.querySelector("form"),entrada=raiz.querySelector("textarea"),botao=raiz.querySelector(".ia-enviar"),microfone=raiz.querySelector(".ia-microfone"),autoFala=raiz.querySelector(".ia-leitura"),ouvir=raiz.querySelector(".ia-ouvir"),parar=raiz.querySelector(".ia-parar"),status=raiz.querySelector(".ia-status");
  const navegador=typeof window!=="undefined"?window:{};
  const Reconhecimento=navegador.SpeechRecognition||navegador.webkitSpeechRecognition;
  const sintese=navegador.speechSynthesis,Voz=navegador.SpeechSynthesisUtterance;
  const possuiAudio=!!sintese&&typeof sintese.speak==="function"&&typeof Voz==="function";
  const nova=raiz.querySelector(".ia-nova");
  let ativo=true,contexto=null,ultimaResposta="",reconhecedor=null,ouvindo=false,enviando=false;
  if(!Reconhecimento){microfone.disabled=true;microfone.title="O navegador não oferece reconhecimento de voz.";}
  if(!possuiAudio){autoFala.disabled=true;ouvir.disabled=true;parar.disabled=true;}
  function aviso(texto){if(ativo)status.textContent=texto||"";}
  function pararFala(){if(possuiAudio)try{sintese.cancel()}catch{}if(ativo)parar.disabled=true;}
  function falar(texto){
    if(!ativo||!possuiAudio||!texto)return;
    pararFala();
    try{
      const fala=new Voz(String(texto).slice(0,3000));fala.lang="pt-BR";fala.rate=1;
      fala.onend=()=>{if(ativo)parar.disabled=true;};
      fala.onerror=()=>{if(ativo){parar.disabled=true;aviso("Não foi possível reproduzir o áudio.");}};
      parar.disabled=false;sintese.speak(fala);
    }catch{parar.disabled=true;aviso("Áudio indisponível.");}
  }
  function resposta(texto){adicionar("assistente",texto);ultimaResposta=texto;ouvir.disabled=!possuiAudio||!texto;if(autoFala.checked)falar(texto);}
  function teclado(evento){if(!deveEnviarComEnter(evento))return;evento.preventDefault();if(!enviando&&podeEnviarMensagem(entrada.value,contexto))form.requestSubmit();}
  function atualizarMicrofone(emUso){ouvindo=emUso;microfone.setAttribute("aria-pressed",String(emUso));microfone.textContent=emUso?"⏹️":"🎙️";}
  function ditar(){
    if(!ativo||enviando||!Reconhecimento)return;
    if(ouvindo){try{reconhecedor?.stop()}catch{}return;}
    try{
      reconhecedor=new Reconhecimento();reconhecedor.lang="pt-BR";reconhecedor.continuous=false;reconhecedor.interimResults=false;
      reconhecedor.onresult=evento=>{
        if(!ativo)return;
        const frase=Array.from(evento.results||[]).filter(x=>x.isFinal!==false).map(x=>String(x[0]?.transcript||"")).join(" ").trim();
        if(frase){entrada.value=frase;aviso("Pergunta reconhecida. Enviando...");if(!enviando&&podeEnviarMensagem(frase,contexto))form.requestSubmit();}
      };
      reconhecedor.onerror=evento=>{if(ativo)aviso(["not-allowed","service-not-allowed"].includes(evento?.error)?"Permita o uso do microfone no navegador.":evento?.error==="no-speech"?"Nenhuma fala detectada.":"Não foi possível reconhecer a fala.");};
      reconhecedor.onend=()=>{if(ativo){atualizarMicrofone(false);if(status.textContent==="Ouvindo...")aviso("Ditado encerrado.");}};
      pararFala();atualizarMicrofone(true);aviso("Ouvindo...");reconhecedor.start();
    }catch{atualizarMicrofone(false);aviso("Microfone indisponível neste navegador.");}
  }
  function alterarLeitura(){if(!autoFala.checked)pararFala();else aviso("Leitura em voz alta ativada.");}
  function ouvirUltima(){falar(ultimaResposta);}
  function pararAudio(){pararFala();}
  
  function adicionar(autor,texto){if(!ativo)return;const div=document.createElement("div");div.className="ia-msg";div.dataset.autor=autor;div.textContent=texto;mensagens.append(div);mensagens.scrollTop=mensagens.scrollHeight;}
  async function enviar(e){e.preventDefault();if(!ativo||enviando)return;const pergunta=entrada.value.trim();if(!podeEnviarMensagem(pergunta,contexto))return;
    enviando=true;nova.disabled=true;aviso("Consultando as informações...");entrada.value="";adicionar("usuario",pergunta);botao.disabled=true;microfone.disabled=true;pararFala();
    try{
      const token=await obterToken();if(!token)throw Error("Sessão indisponível.");
      const res=await fetch(apiUrl.replace(/\/$/,"")+"/ia/perguntar",{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({pergunta,contexto}),cache:"no-store"});
      const data=await res.json();if(!res.ok)throw Error(data.erro||"Falha na consulta.");
      if(!ativo)return;
      aviso("");contexto=data.contexto||null;const resultado=data.resultado;
      resposta(data.resposta||(resultado?JSON.stringify(resultado.dados,null,2):"Sem resultados."));
    }catch(err){if(ativo){entrada.value=pergunta;aviso("Não foi possível concluir. Tente novamente.");resposta(err.message||"Não foi possível consultar.");}}
    finally{enviando=false;if(ativo){nova.disabled=false;botao.disabled=false;microfone.disabled=!Reconhecimento;entrada.focus?.();}}
  }
  function reiniciar(){if(enviando)return;contexto=null;ultimaResposta="";mensagens.textContent="";entrada.value="";ouvir.disabled=true;pararFala();aviso("Nova conversa iniciada.");entrada.focus?.();}
  nova.addEventListener("click",reiniciar);
  form.addEventListener("submit",enviar);
  entrada.addEventListener("keydown",teclado);
  microfone.addEventListener("click",ditar);
  autoFala.addEventListener("change",alterarLeitura);
  ouvir.addEventListener("click",ouvirUltima);
  parar.addEventListener("click",pararAudio);
  container.append(raiz);
  return {desmontar(){
    ativo=false;
    try{reconhecedor?.abort()}catch{}
    if(possuiAudio)try{sintese.cancel()}catch{}
    nova.removeEventListener("click",reiniciar);
    form.removeEventListener("submit",enviar);
    entrada.removeEventListener("keydown",teclado);
    microfone.removeEventListener("click",ditar);
    autoFala.removeEventListener("change",alterarLeitura);
    ouvir.removeEventListener("click",ouvirUltima);
    parar.removeEventListener("click",pararAudio);
    raiz.remove();
  }};
}

