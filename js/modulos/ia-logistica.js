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
  raiz.innerHTML=`<style>.ia-logistica{font:inherit;max-width:1040px;margin:0 auto;color:#173f2e}.ia-logistica *{box-sizing:border-box}.ia-logistica .ia-cabecalho{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:20px}.ia-logistica h2{margin:0;font-size:26px;letter-spacing:-.6px}.ia-logistica .ia-subtitulo{margin:6px 0 0;color:#6a7c73;font-size:14px}.ia-logistica button{font:inherit;cursor:pointer;border:0;border-radius:10px;padding:11px 16px;background:#176344;color:white;font-weight:600}.ia-logistica button:disabled{opacity:.45;cursor:default}.ia-logistica button:focus-visible,.ia-logistica textarea:focus-visible,.ia-logistica input:focus-visible{outline:3px solid #8ec8ad;outline-offset:3px}.ia-logistica button.ia-nova{background:white;color:#176344;border:1px solid #cbdcd2;white-space:nowrap;font-size:14px}.ia-logistica .ia-mensagens{min-height:330px;max-height:52vh;overflow:auto;border:1px solid #dce6df;border-radius:18px;padding:24px;background:#fff;scroll-behavior:smooth}.ia-logistica .ia-boas-vindas{text-align:center;padding:22px 12px}.ia-logistica .ia-simbolo{display:inline-grid;place-items:center;width:44px;height:44px;border-radius:14px;background:#e9f4ed;color:#176344;font-size:25px}.ia-logistica .ia-boas-vindas h3{margin:14px 0 8px;font-size:22px;letter-spacing:-.4px}.ia-logistica .ia-boas-vindas p{margin:0;color:#748278;font-size:14px}.ia-logistica .ia-sugestoes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:24px auto 0;max-width:810px}.ia-logistica button.ia-sugestao{text-align:left;white-space:normal;background:#f6f9f7;color:#355648;border:1px solid #e0e9e3;padding:15px;font-size:13px;font-weight:400;line-height:1.5}.ia-logistica .ia-sugestao strong{display:block;color:#176344;margin-bottom:4px;font-size:13px}.ia-logistica .ia-sugestao:hover{background:#edf6f0;border-color:#a9cdb8}.ia-logistica .ia-msg{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;margin:14px 0;padding:16px 18px;border-radius:14px;background:#f4f7f5;max-width:92%;font-size:15px}.ia-logistica .ia-msg:before{content:"IA Logística";display:block;font-size:11px;font-weight:700;letter-spacing:.4px;color:#648373;margin-bottom:6px}.ia-logistica .ia-msg[data-autor=usuario]{background:#e6f2eb;margin-left:auto;max-width:80%}.ia-logistica .ia-msg[data-autor=usuario]:before{content:"Você"}.ia-logistica form{display:flex;align-items:flex-end;gap:10px;margin-top:14px;padding:12px;background:white;border:1px solid #cbdcd2;border-radius:16px;box-shadow:0 4px 18px #173f2e06}.ia-logistica form:focus-within{border-color:#529c76;box-shadow:0 0 0 3px #1763440c}.ia-logistica textarea{flex:1;min-width:0;width:auto;min-height:54px;max-height:180px;resize:vertical;border:0;border-radius:8px;padding:8px;font:inherit;color:#203f30;background:transparent;line-height:1.5}.ia-logistica textarea:focus{outline:none}.ia-logistica button.ia-microfone{min-width:44px;height:44px;padding:8px;background:#edf4ef;color:#176344;font-size:20px}.ia-logistica button.ia-microfone[aria-pressed=true]{background:#a32630;color:white}.ia-logistica button.ia-enviar{height:44px;padding:10px 20px}.ia-logistica .ia-voz{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px;font-size:12px}.ia-logistica .ia-voz label{display:inline-flex;align-items:center;gap:7px;margin:0 10px 0 0;width:auto;flex:0 1 auto;text-transform:none;letter-spacing:normal;line-height:1.5;cursor:pointer;color:#60776a}.ia-logistica .ia-voz input{width:15px;height:15px;margin:0;flex:none;accent-color:#176344}.ia-logistica .ia-voz button{padding:7px 10px;background:transparent;color:#426651;font-size:12px}.ia-logistica .ia-status{color:#526c5c;margin-top:6px;min-height:1.4em;font-size:13px}.ia-logistica small{display:block;margin-top:8px;color:#7b8980;font-size:11px;line-height:1.7}.ia-logistica .ia-rodape{display:flex;justify-content:space-between;gap:12px}.ia-logistica .ia-somente-leitura{font-size:12px;color:#63816f;white-space:nowrap}@media(max-width:640px){.ia-logistica .ia-cabecalho{gap:10px}.ia-logistica h2{font-size:22px}.ia-logistica .ia-subtitulo{font-size:12px}.ia-logistica .ia-sugestoes{grid-template-columns:1fr;gap:7px;margin-top:18px}.ia-logistica button.ia-sugestao{padding:10px 12px}.ia-logistica .ia-mensagens{padding:14px;min-height:300px;max-height:52vh}.ia-logistica .ia-boas-vindas{padding:12px 0}.ia-logistica .ia-boas-vindas h3{font-size:20px}.ia-logistica form{gap:6px;padding:8px;flex-wrap:wrap}.ia-logistica textarea{flex-basis:100%;min-height:52px}.ia-logistica button.ia-enviar{margin-left:auto}.ia-logistica .ia-rodape{display:block}.ia-logistica .ia-voz{gap:4px}.ia-logistica .ia-voz label{flex-basis:100%;margin-bottom:4px}.ia-logistica .ia-msg{max-width:100%;font-size:14px}.ia-logistica .ia-msg[data-autor=usuario]{max-width:92%}}</style><header class="ia-cabecalho"><div><h2>IA Logística</h2><p class="ia-subtitulo">Informações da operação, em uma conversa.</p></div><button class="ia-nova" type="button">+ Nova conversa</button></header><div class="ia-mensagens" role="log" aria-live="polite"><div class="ia-boas-vindas"><span class="ia-simbolo" aria-hidden="true">✦</span><h3>Como posso ajudar na operação?</h3><p>Consulte os dados da frota e continue a conversa para aprofundar a análise.</p><div class="ia-sugestoes"><button type="button" class="ia-sugestao" data-pergunta="Quantos veículos ativos temos na frota pesada?"><strong>Frota e vínculos</strong>Quantos veículos ativos temos na frota pesada?</button><button type="button" class="ia-sugestao" data-pergunta="Qual foi o faturamento da frota pesada neste mês?"><strong>Faturamento</strong>Qual foi o faturamento da frota pesada neste mês?</button><button type="button" class="ia-sugestao" data-pergunta="Quantas cargas ficaram acima do limite de peso neste mês?"><strong>Cargas e PBT</strong>Quantas cargas ficaram acima do limite de peso neste mês?</button></div></div></div><form><textarea maxlength="600" aria-label="Pergunta para IA Logística" placeholder="O que você quer saber sobre a operação?" required></textarea><button type="button" class="ia-microfone" aria-label="Ditar pergunta" aria-pressed="false" title="Ditar pergunta por voz">🎙️</button><button class="ia-enviar" type="submit">Consultar</button></form><div class="ia-voz"><label><input class="ia-leitura" type="checkbox"> Ler respostas em voz alta</label><button class="ia-ouvir" type="button" disabled>Ouvir resposta</button><button class="ia-parar" type="button" disabled>Parar áudio</button></div><div class="ia-status" role="status" aria-live="polite"></div><div class="ia-rodape"><small>Enter envia · Shift+Enter quebra linha</small><small class="ia-somente-leitura">Consultas somente leitura</small></div><small>As mensagens não são salvas no banco. O ditado pode utilizar serviços de voz do navegador.</small>`;
  const mensagens=raiz.querySelector(".ia-mensagens"),form=raiz.querySelector("form"),entrada=raiz.querySelector("textarea"),botao=raiz.querySelector(".ia-enviar"),microfone=raiz.querySelector(".ia-microfone"),autoFala=raiz.querySelector(".ia-leitura"),ouvir=raiz.querySelector(".ia-ouvir"),parar=raiz.querySelector(".ia-parar"),status=raiz.querySelector(".ia-status");
  const navegador=typeof window!=="undefined"?window:{};
  const Reconhecimento=navegador.SpeechRecognition||navegador.webkitSpeechRecognition;
  const sintese=navegador.speechSynthesis,Voz=navegador.SpeechSynthesisUtterance;
  const possuiAudio=!!sintese&&typeof sintese.speak==="function"&&typeof Voz==="function";
  const nova=raiz.querySelector(".ia-nova");
  let ativo=true,contexto=null,ultimaResposta="",reconhecedor=null,ouvindo=false,enviando=false,controlador=null;
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
  
  function adicionar(autor,texto){if(!ativo)return;mensagens.querySelector(".ia-boas-vindas")?.remove();const div=document.createElement("div");div.className="ia-msg";div.dataset.autor=autor;div.textContent=texto;mensagens.append(div);mensagens.scrollTop=mensagens.scrollHeight;}
  async function enviar(e){e.preventDefault();if(!ativo||enviando)return;const pergunta=entrada.value.trim();if(!podeEnviarMensagem(pergunta,contexto))return;
    enviando=true;nova.disabled=true;aviso("Consultando as informações...");entrada.value="";adicionar("usuario",pergunta);botao.disabled=true;microfone.disabled=true;pararFala();
    controlador=new AbortController();
    const sinal=controlador.signal;
    let tempoLimite;
    const avisoDemora=setTimeout(()=>aviso("A IA ainda está processando. Aguardando resposta..."),8000);
    try{
      const data=await Promise.race([(async()=>{
      const token=await obterToken();
      if(sinal.aborted)throw Error("Consulta interrompida.");if(!token)throw Error("Sessão indisponível.");
      const res=await fetch(apiUrl.replace(/\/$/,"")+"/ia/perguntar",{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({pergunta,contexto}),cache:"no-store",signal:sinal});
      const data=await res.json();if(!res.ok)throw Error(data.erro||"Falha na consulta.");
      return data;
      })(),new Promise((_,reject)=>{tempoLimite=setTimeout(()=>{reject(Error("A consulta demorou além do esperado. Sua pergunta e conversa foram preservadas; tente novamente."));controlador?.abort();},35000);})]);
      if(!ativo)return;
      aviso("");contexto=data.contexto||null;const resultado=data.resultado;
      resposta(data.resposta||(resultado?JSON.stringify(resultado.dados,null,2):"Sem resultados."));
    }catch(err){if(ativo){entrada.value=pergunta;aviso("Não foi possível concluir. Tente novamente.");resposta(err.message||"Não foi possível consultar.");}}
    finally{clearTimeout(tempoLimite);clearTimeout(avisoDemora);controlador=null;enviando=false;if(ativo){nova.disabled=false;botao.disabled=false;microfone.disabled=!Reconhecimento;entrada.focus?.();}}
  }
  function reiniciar(){if(enviando)return;contexto=null;ultimaResposta="";mensagens.innerHTML=`<div class="ia-boas-vindas"><span class="ia-simbolo" aria-hidden="true">✦</span><h3>Como posso ajudar na operação?</h3><p>Consulte os dados da frota e continue a conversa para aprofundar a análise.</p><div class="ia-sugestoes"><button type="button" class="ia-sugestao" data-pergunta="Quantos veículos ativos temos na frota pesada?"><strong>Frota e vínculos</strong>Quantos veículos ativos temos na frota pesada?</button><button type="button" class="ia-sugestao" data-pergunta="Qual foi o faturamento da frota pesada neste mês?"><strong>Faturamento</strong>Qual foi o faturamento da frota pesada neste mês?</button><button type="button" class="ia-sugestao" data-pergunta="Quantas cargas ficaram acima do limite de peso neste mês?"><strong>Cargas e PBT</strong>Quantas cargas ficaram acima do limite de peso neste mês?</button></div></div>`;entrada.value="";ouvir.disabled=true;pararFala();aviso("Nova conversa iniciada.");entrada.focus?.();}
  function sugerir(evento){const sugestao=evento.target.closest?.(".ia-sugestao");if(!sugestao||enviando)return;entrada.value=sugestao.dataset.pergunta;entrada.focus?.();}
  mensagens.addEventListener("click",sugerir);
  nova.addEventListener("click",reiniciar);
  form.addEventListener("submit",enviar);
  entrada.addEventListener("keydown",teclado);
  microfone.addEventListener("click",ditar);
  autoFala.addEventListener("change",alterarLeitura);
  ouvir.addEventListener("click",ouvirUltima);
  parar.addEventListener("click",pararAudio);
  container.append(raiz);
  return {desmontar(){
    ativo=false;controlador?.abort();
    try{reconhecedor?.abort()}catch{}
    if(possuiAudio)try{sintese.cancel()}catch{}
    mensagens.removeEventListener("click",sugerir);
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

