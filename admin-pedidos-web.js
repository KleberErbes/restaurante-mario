(() => {
  const box = document.getElementById('tab-confirmar');
  box.innerHTML = '<span class="section-eyebrow">COZINHA · PEDIDOS ONLINE</span><h2>Pedidos para confirmar</h2><p>Confira os itens e confirme o recebimento pela cozinha.</p><button class="btn-salvar" id="refreshConfirmations">Atualizar</button><p id="confirmationFeedback" role="status"></p><div class="web-queue-list"></div>';
  const list = box.querySelector('.web-queue-list');
  const feedback = document.getElementById('confirmationFeedback');
  const operation=document.createElement('div');box.insertBefore(operation,list);
  const pause=element('button','Carregando recebimento…');pause.className='btn-salvar';pause.disabled=true;
  const printer=element('p','Situação da impressão: aguardando atualização.');
  operation.append(pause,printer);
  let paused=false;
  pause.onclick=async()=>{pause.disabled=true;try{const {error}=await sb.rpc('rdm_pausar',{p_pausado:!paused});if(error)throw error;await load();}catch{feedback.textContent='Não foi possível alterar o recebimento.';}finally{pause.disabled=false;}};
  async function action(order,kind,button){
    let params;
    if(kind==='rdm_cancelar'){
      const reason=prompt('Motivo do cancelamento (visível ao cliente). Se já imprimiu, avise a cozinha.');
      if(reason===null)return;
      if(reason.trim().length<3 || reason.trim().length>300){alert('Informe entre 3 e 300 caracteres.');return;}
      params={p_id:order.banco_id,p_motivo:reason};
    }else{
      if(!confirm('Reimprimir esta comanda? Confira se ela já saiu para evitar uma cópia desnecessária.'))return;
      params={p_id:order.banco_id,p_chave:crypto.randomUUID()};
    }
    button.disabled=true;
    try{const {error}=await sb.rpc(kind,params);if(error)throw error;feedback.textContent=kind==='rdm_cancelar'?'Pedido cancelado. Se a comanda já saiu, avise a cozinha.':'Reimpressão solicitada. Aguarde e confira o papel.';await load();}
    catch(e){feedback.textContent='Confira a lista antes de tentar novamente. '+(e.message||'Falha de conexão.');button.disabled=false;}
  }
  let loading = false;
  let audio=null, soundOn=false, seen=null;
  const sound=element('button','Ativar som de novos pedidos');
  sound.className='btn-salvar'; sound.type='button'; sound.setAttribute('aria-pressed','false');
  document.getElementById('refreshConfirmations').after(sound);
  function beep(){
    if(!soundOn || !audio || audio.state!=='running')return;
    const oscillator=audio.createOscillator(), gain=audio.createGain();
    oscillator.connect(gain);gain.connect(audio.destination);oscillator.frequency.value=880;
    gain.gain.setValueAtTime(0.08,audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001,audio.currentTime+0.65);
    oscillator.start();oscillator.stop(audio.currentTime+0.65);
  }
  sound.onclick=async()=>{
    try{
      if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();
      await audio.resume();soundOn=!soundOn;
      sound.textContent=soundOn?'Silenciar novos pedidos':'Ativar som de novos pedidos';
      sound.setAttribute('aria-pressed',String(soundOn));if(soundOn)beep();
    }catch{feedback.textContent='Não foi possível ativar o som neste navegador.';}
  };
  const confirming = new Set();
  function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }
  async function confirmOrder(order, button) {
    if (confirming.has(order.id)) return;
    confirming.add(order.id);
    button.disabled = true;
    feedback.textContent = 'Confirmando pedido…';
    try {
      const { error } = await sb.rpc('rdm_confirmar', { p_id: order.id });
      if (error) throw error;
      feedback.textContent = order.pedido.whatsappOptIn
        ? 'Pedido confirmado. A mensagem de WhatsApp entrou na fila de envio.'
        : 'Pedido confirmado. O cliente poderá acompanhar pelo site.';
      await load();
    } catch {
      feedback.textContent = 'Não foi possível verificar a confirmação. Atualize a lista antes de tentar novamente.';
      button.disabled = false;
    } finally {
      confirming.delete(order.id);
    }
  }
  async function load() {
    if (loading || document.getElementById('telaAdmin').style.display !== 'block') return;
    loading = true;
    try {
      const { data: result, error } = await sb.rpc('rdm_painel_operacao');
      if (error) throw error;
      const data=result.pedidos;
      paused=result.operacao.pausado;pause.disabled=false;pause.textContent=paused?'Retomar pedidos online':'Pausar pedidos online';
      const pr=result.impressora;
      printer.textContent=!pr || Date.now()-Date.parse(pr.atualizado_em)>60000?'Programa de impressão sem comunicação há mais de 1 minuto. Confira o PC.':('Impressão: '+pr.detalhe);
      const pending=data.filter(order=>!order.confirmado_em && !order.cancelado_em && order.origem==='site');
      if(pending.some(order=>!seen || !seen.has(order.banco_id)))beep();
      seen=new Set(data.map(order=>order.banco_id));
      list.replaceChildren();
      if (!data.length) list.append(element('p', 'Nenhum pedido para confirmar.'));
      const rank=o=>o.cancelado_em?3:o.origem==='balcao'?2:o.confirmado_em?1:0;
      data.sort((a,b)=>rank(a)-rank(b)||Date.parse(a.recebido_em)-Date.parse(b.recebido_em));
      for (const order of data) {
        const card = element('article', '');
        card.className = 'pedido-card';
        card.append(element('h3', order.pedido.nomeCliente));
        if(!order.confirmado_em && !order.cancelado_em && order.origem==='site'){
          const minutes=Math.max(0,Math.floor((Date.now()-Date.parse(order.recebido_em))/60000));
          card.append(element('strong', 'Aguardando há '+minutes+' min'));
          if(minutes>=5){card.style.border='2px solid #b54708';card.append(element('p','Atenção: pedido aguardando confirmação há mais de 5 minutos.'));}
        }
        card.append(element('p', new Date(order.recebido_em).toLocaleString('pt-BR')));
        for (const item of order.pedido.itens) {
          card.append(element('p', (item.qty || 1) + '× ' + item.tipo + ' — ' + item.desc));
        }
        if (order.pedido.whatsappOptIn) {
          const status = {
            pendente: 'WhatsApp aguardando envio',
            processando: 'WhatsApp em processamento',
            encaminhado: 'Mensagem encaminhada ao WhatsApp',
            falhou: 'Falha no WhatsApp — verifique a configuração do serviço',
            incerto: 'Envio do WhatsApp incerto — confira no provedor',
          };
          card.append(element('p', order.confirmado_em
            ? status[order.whatsapp_estado] || 'WhatsApp aguardando envio'
            : 'Cliente deseja confirmação pelo WhatsApp'));
        } else {
          card.append(element('p', 'Acompanhamento pelo site'));
        }
        if(order.cancelado_em) card.append(element('strong','Cancelado: '+order.cancelamento_motivo));
        else if(order.origem==='balcao') card.append(element('strong','Pedido do balcão'));
        else if (order.confirmado_em) card.append(element('strong', 'Pedido confirmado'));
        else {
          const button = element('button', 'Confirmar pedido');
          button.className = 'btn-salvar';
          button.disabled = confirming.has(order.id);
          button.onclick = () => confirmOrder(order, button);
          card.append(button);
        }
        if(!order.cancelado_em){
          const cancel=element('button','Cancelar pedido');cancel.className='btn-salvar';cancel.onclick=()=>action(order,'rdm_cancelar',cancel);card.append(cancel);
          if(order.impresso_em){const reprint=element('button','Reimprimir comanda');reprint.className='btn-salvar';reprint.disabled=['pendente','processando'].includes(order.reimpressao);reprint.onclick=()=>action(order,'rdm_reimprimir',reprint);card.append(reprint);}
        }
        if(order.reimpressao)card.append(element('p','Última reimpressão: '+order.reimpressao+(order.reimpressao==='incerto'?' — confira o papel antes de solicitar outra.':'')));
        list.append(card);
      }
    } catch {
      feedback.textContent = 'Não foi possível atualizar. Confira a conexão e a autorização da equipe.';
    } finally {
      loading = false;
    }
  }
  document.getElementById('refreshConfirmations').onclick = load;
  setInterval(load, 10000);
  new MutationObserver(load).observe(document.getElementById('telaAdmin'), { attributes: true, attributeFilter: ['style'] });
  load();
})();
