/* Pedido web: recibo de envio; impressão independente. */
(() => {
 let operationPaused=false;
 const pauseNotice=document.createElement('p');pauseNotice.setAttribute('role','status');pauseNotice.style.cssText='padding:16px;text-align:center;color:#8a3416;font-weight:bold';pauseNotice.hidden=true;
 document.getElementById('pedidos').prepend(pauseNotice);
 async function checkOperation(){
   const {data,error}=await sbCardapio.rpc('rdm_operacao_publica');
   if(error)throw error;
   operationPaused=!!data.pausado;pauseNotice.hidden=!operationPaused;pauseNotice.textContent=data.mensagem;
   return operationPaused;
 }
 checkOperation().catch(()=>{});setInterval(()=>checkOperation().catch(()=>{}),15000);
 const KEY='rdm_pedidos_v1';
 let busy=false, checking=false;
 let records=[];
 try { records=JSON.parse(localStorage.getItem(KEY)||'[]'); if(!Array.isArray(records)) records=[]; } catch {}
 const panel=document.getElementById('meusPedidos');
 const list=document.getElementById('meusPedidosLista');
 function save(){records=records.filter(r=>r.created>Date.now()-30*86400000);localStorage.setItem(KEY,JSON.stringify(records));}
 records=records.filter(r=>r.created>Date.now()-30*86400000); try{save();}catch{}
 function persist(){try{save();return true;}catch{UI.showToast('Não foi possível salvar o acompanhamento neste navegador. Libere o armazenamento antes de enviar.','aviso',8000);return false;}}
 function random(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');}
 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 function button(label,action){const b=el('button',label,'order-action');b.type='button';b.onclick=action;return b;}
 function open(){if(!panel.open)panel.showModal();render();refresh();}
 document.getElementById('openMyOrders').onclick=open;
 document.getElementById('closeMyOrders').onclick=()=>panel.close();
 window.openMyOrders=open;
 const sent = document.getElementById('pedidoEnviado');
 let activeOrderId = null;
 const progressTitle = document.getElementById('enviadoTitulo');
 const progressText = document.getElementById('progressText');
 function whatsappOrderUrl(record) {
  const p = record.payload;
  const lines = [record.recebido_em ? 'Olá! Este pedido já foi enviado pelo site. É o mesmo pedido, não duplicar.' : 'Olá! Gostaria de solicitar este pedido. O envio pelo site ainda não foi confirmado; confira se já foi recebido antes de registrar novamente.', 'Pedido: ' + p.pedidoId, 'Nome: ' + p.nomeCliente, ''];
  for (const item of p.itens) {
   lines.push((item.qty || 1) + '× ' + item.tipo);
   if(item.nomePessoa) lines.push('Para: ' + item.nomePessoa);
   if(item.desc) lines.push(item.desc);
   lines.push(item.preco == null ? 'Valor a pesar' : 'Valor do item: ' + Number(item.preco).toLocaleString('pt-BR', {style:'currency',currency:'BRL'}));
   lines.push('');
  }
  lines.push('Total de marmitas: ' + p.totalMarmitas);
  return 'https://wa.me/' + CONFIG.whatsappNumber + '?text=' + encodeURIComponent(lines.join('\n'));
 }
 function showProgress(record) {
  activeOrderId = record.payload.pedidoId;
  if (panel.open) panel.close();
  if (!sent.open) sent.showModal();
  updateProgress();
 }
 function updateProgress() {
  const record = records.find(item => item.payload.pedidoId === activeOrderId);
  if (!record) return;
  const received = !!record.recebido_em;
  const whatsappAction = document.getElementById('sendOrderWhatsApp');
  whatsappAction.hidden = !received;
  if(received) whatsappAction.href = whatsappOrderUrl(record);
  sent.dataset.state = received ? 'confirmed' : record.lastError ? 'error' : 'sending';
  progressTitle.textContent = received ? 'Pedido enviado!' : record.lastError ? 'Não foi possível confirmar o envio' : 'Enviando seu pedido…';
  progressText.hidden = received;
  progressText.textContent = record.lastError ? 'Seu carrinho foi mantido. Consulte ou tente novamente em Meus pedidos.' : 'Aguarde um instante.';
  sent.querySelector('.send-arrow').textContent = received ? '✓' : '→';
 }
 document.getElementById('closeProgress').onclick = () => sent.close();
 document.getElementById('verAgora').onclick = () => { sent.close(); open(); };
 let lastRender;
 function render(){
  updateProgress();
  const signature = JSON.stringify(records);
  if (signature === lastRender) return;
  lastRender = signature;
  const expanded = new Set([...list.querySelectorAll('details[open]')].map(node => node.dataset.order));
  list.replaceChildren();
  if(!records.length){list.append(el('p','Você ainda não enviou pedidos neste navegador.'));return;}
  [...records].reverse().forEach((r,i)=>{
   const card=el('article',undefined,'order-card');
   card.append(el('h3',i===0?'Último pedido':'Pedido anterior'));
   card.append(el('p',r.recebido_em?'Pedido enviado!':'Envio não confirmado — consulte ou tente novamente','order-status'));
   card.append(el('p',new Date(r.created).toLocaleString('pt-BR')));
   const details=el('details');
   details.dataset.order=r.payload.pedidoId;
   details.open=expanded.has(r.payload.pedidoId);
   details.append(el('summary','Itens e opções do pedido'));
   for(const item of r.items) details.append(el('p',`${item.qty||1}× ${item.tipo} · ${item.desc}`));
   if(r.lastError)card.append(el('p','Não foi possível atualizar agora. A informação acima é a última disponível.','order-warning'));
   const actions=el('div',undefined,'order-actions');
   if(!r.recebido_em)card.append(button('Tentar novamente',()=>send(r)));
   if(i===0&&r.recebido_em)actions.append(button('Repetir último pedido',()=>repeat(r)));
   const wa=el('a','Enviar pedido pelo WhatsApp (opcional)','order-action');wa.href=whatsappOrderUrl(r);wa.target='_blank';wa.rel='noopener';actions.append(wa);
   details.append(actions);card.append(details);list.append(card);
  });
 }
 async function refresh(){
  if(checking)return;checking=true;
  try{for(const r of records){
   if(r.recebido_em)continue;
   try{const {data,error}=await sbCardapio.rpc('rdm_consultar',{p_id:r.payload.pedidoId,p_token:r.token});if(error)throw error;
    if(data){Object.assign(r,data);settle(r);}r.lastError=false;
   }catch{r.lastError=true;}
  }try{save();}catch{}render();}finally{checking=false;}
 }
 function settle(r){
  if(!r.recebido_em||r.cartCleared)return;
  // Não apaga alterações feitas no carrinho enquanto o envio era incerto.
  if(JSON.stringify(state.cart)===JSON.stringify(r.items)){state.cart=[];CartManager.salvarLocal();UI.updateCartUI();}
  r.cartCleared=true;
 }
 async function send(r){
  if(busy)return;busy=true;document.querySelector('#modalNome .modal-btn-confirmar').disabled=true;
  UI.toggleModal(dom.modalNome,dom.modalOverlay,false);
  UI.toggleCart(false);
  r.lastError = false;
  showProgress(r);
  try{
   const found=await sbCardapio.rpc('rdm_consultar',{p_id:r.payload.pedidoId,p_token:r.token});
   if(found.error)throw found.error;
   let data=found.data;
   if(!data){
    if(await checkOperation())throw new Error('paused');
    if(!Schedule.isAberto())throw new Error('closed');
    const result=await sbCardapio.rpc('rdm_enviar',{p:r.payload,p_token:r.token});if(result.error)throw result.error;data=result.data;
   }
   if(!data?.recebido_em)throw new Error('invalid-response');
   Object.assign(r,data,{lastError:false});settle(r);persist();
   UI.toggleModal(dom.modalNome,dom.modalOverlay,false);UI.toggleCart(false);
   updateProgress();
  }catch(e){r.lastError=true;persist();updateProgress();UI.showToast(e.message==='paused'?'Pedidos temporariamente pausados. Aguarde a retomada.':e.message==='closed'?'Pedidos encerrados. O pedido pendente não foi reenviado.':'Envio ainda não confirmado. Consulte em Meus pedidos antes de fazer outro.','aviso',8000);}
  finally{busy=false;document.querySelector('#modalNome .modal-btn-confirmar').disabled=false;}
 }
 PedidoManager.confirmarPedido=async function(){
  if(busy)return;
  try{if(await checkOperation()){UI.showToast('Pedidos temporariamente pausados.','aviso');return;}}catch{UI.showToast('Não foi possível verificar o recebimento. Tente novamente.','aviso');return;}
  const pending=records.find(r=>!r.recebido_em);
  if(pending){UI.toggleModal(dom.modalNome,dom.modalOverlay,false);open();UI.showToast('Confira o envio pendente antes de fazer outro pedido.','aviso');return;}
  const name=dom.inputNome.value.trim();if(!name){dom.inputNome.focus();return;}
  if(!state.cart.length||!Schedule.isAberto()){UI.showToast('Não é possível enviar agora. Confira o carrinho e o horário.','aviso');return;}
  if(!state.cardapioValidado){UI.showToast('Atualize o cardápio com conexão à internet antes de enviar.','aviso');return;}
  let changed=false;
  for(const item of state.cart){
   if(!item.receita){UI.showToast('Este carrinho é de uma versão anterior. Remova os itens e monte novamente para conferir o cardápio atual.','aviso',9000);return;}
   const recipe=item.receita;
   if(recipe.pers && (recipe.acomp.some(x=>!state.cardapio.acompanhamentos.includes(x)) || Object.keys(recipe.carne).some(x=>!state.cardapio.carnes.includes(x)) || recipe.salada.some(x=>!state.cardapio.saladas.includes(x)))){UI.showToast('Um item não está mais no cardápio. Remova a marmita e monte novamente.','aviso',8000);return;}
   const price=item.aPesar?0:Builder.PRECOS[recipe.tamanho]*(item.qty||1);
   if(price!==item.preco){item.preco=price;changed=true;}
  }
  if(changed){CartManager.salvarLocal();UI.updateCartUI();UI.showToast('Os preços foram atualizados. Confira o total e confirme novamente.','aviso',8000);return;}
  const items=JSON.parse(JSON.stringify(state.cart));
  const r={token:random(),created:Date.now(),items,payload:{pedidoId:crypto.randomUUID(),nomeCliente:name,whatsappOptIn:false,whatsappNumero:'',itens:items.map(item=>({tipo:item.tipo,desc:item.descPlanilha,nomePessoa:item.nome||'',preco:item.aPesar?null:item.preco,qty:item.qty||1,composicao:item.composicao||null})),totalMarmitas:items.reduce((n,i)=>n+(i.qty||1),0)}};
  records.push(r);if(!persist()){records.pop();return;}await send(r);
 };
 function repeat(r){
  if(!state.cardapioValidado){UI.showToast('Aguarde o cardápio atualizado para repetir o pedido.','aviso');return;}
  if(records.some(x=>!x.recebido_em)){UI.showToast('Confira o envio pendente antes de repetir.','aviso');return;}
  const copy=[],missing=[];
  for(const item of r.items){
   const recipe=item.receita;
   if(!recipe){missing.push('Pedido antigo sem composição detalhada. Monte novamente.');continue;}
   if(recipe.pers){
    const unavailable=[...recipe.acomp.filter(x=>!state.cardapio.acompanhamentos.includes(x)),...Object.keys(recipe.carne).filter(x=>!state.cardapio.carnes.includes(x)),...recipe.salada.filter(x=>!state.cardapio.saladas.includes(x))];
    if(unavailable.length){missing.push(...unavailable);continue;}
   }
   const next=JSON.parse(JSON.stringify(item));
   const carnes=state.cardapio.carnes.slice(0,3);
   next.desc=CartManager.montarDescricao({carnes:recipe.carne,acompanhamentos:recipe.acomp,saladas:recipe.salada,obs:recipe.obs,incluiFixos:!recipe.pers,carnesOpcoes:carnes,tamanho:recipe.label});
   next.descPlanilha=next.nome?`Para: ${next.nome} | ${next.desc}`:next.desc;
   next.preco=next.aPesar?0:Builder.PRECOS[recipe.tamanho]*(next.qty||1);copy.push(next);
  }
  if(missing.length){UI.showToast('Monte novamente para substituir os itens indisponíveis: '+[...new Set(missing)].join(', '),'aviso',10000);panel.close();scrollToSection('pedidos');return;}
  if(!copy.length)return;
  if(!window.confirm('Adicionar o último pedido ao carrinho? Marmitas padrão usam o cardápio de hoje e os preços serão os atuais.'))return;
  state.cart.push(...copy);CartManager.salvarLocal();UI.updateCartUI();panel.close();UI.toggleCart(true);
  UI.showToast('Pedido copiado. Revise antes de enviar.','sucesso');
 }
 window.addEventListener('online',refresh);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
 setInterval(()=>{if(!document.hidden&&records.some(r=>!r.recebido_em))refresh();},15000);
 document.addEventListener('DOMContentLoaded',async()=>{
  const match=location.hash.match(/^#acompanhar=([0-9a-f-]{36})\.([0-9a-f]{64})$/);
  if(match){
   try{const {data,error}=await sbCardapio.rpc('rdm_consultar',{p_id:match[1],p_token:match[2]});if(error||!data?.pedido)throw new Error();
    if(!records.some(r=>r.payload.pedidoId===match[1])){records.push({token:match[2],payload:data.pedido,created:Date.parse(data.recebido_em),recebido_em:data.recebido_em,confirmado_em:data.confirmado_em,cancelado_em:data.cancelado_em,cancelamento_motivo:data.cancelamento_motivo,cartCleared:true,items:data.pedido.itens.map(i=>({tipo:i.tipo,qty:i.qty,desc:i.desc}))});persist();}
    history.replaceState(null,'',location.pathname+location.search);open();
   }catch{UI.showToast('Não foi possível abrir o acompanhamento. Confira sua conexão e tente o link novamente.','aviso',8000);}
  }
  refresh();
 });
})();
