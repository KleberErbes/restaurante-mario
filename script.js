// ========== GOOGLE SHEETS (Cardápio) — TSV para parsing robusto ==========
const SHEETS_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTU8-45F4IYTWaim8pMyNru3071eB87U0-oZy98g8796_m9BKLMJ8vetpfeZ9AOXYZ569vOkvzcfzBS/pub?output=tsv';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyFmzkXOJPdrAIrg5WFu-r91O8lZQbCvkGBzriRB-j7eSllrKPGYCeROAKI7zGixj4/exec';

const WHATSAPP_NUMBER = "554733752227";

// ========== CONFIGURAÇÃO DE HORÁRIO ==========
// Pedidos aceitos a partir das 08h00
const HORARIO_PEDIDOS    = { h: 8,  m: 0  };
// Buffet / atendimento presencial: 10h30
const HORARIO_ABERTURA   = { h: 10, m: 30 };
// Fechamento: 14h00
const HORARIO_FECHAMENTO = { h: 14, m: 0  };

// DIAS_FECHADOS_ESPECIAIS é carregado da planilha (categoria "fechado")
let DIAS_FECHADOS_ESPECIAIS = [];

let cart = [];
let selectedSize = 'media';
let selAcomp  = [];
let selCarne  = {};   // { nomeCarne: quantidade }
let selSalada = [];

let CARDAPIO = { acompanhamentos: [], carnes: [], saladas: [], sobremesas: [] };

// ========== TOAST — substitui todos os alert() ==========
function showToast(msg, tipo = 'info', duracao = 3000) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  toast.innerHTML = msg;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-show'));
  setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duracao);
}

// ========== HORÁRIO DE ATENDIMENTO ==========
// Retorna: 'fechado' | 'pedidos' | 'aberto'
function getEstado() {
  const agora = new Date();
  const dia = agora.getDay(); // 0=dom, 6=sab

  // Verifica dias fechados especiais (formato AAAA-MM-DD)
  const dataHoje = agora.toISOString().slice(0, 10);
  if (DIAS_FECHADOS_ESPECIAIS.includes(dataHoje)) return 'fechado';

  // Domingo sempre fechado
  if (dia === 0) return 'fechado';

  const totalMin = agora.getHours() * 60 + agora.getMinutes();
  const inicioPedidos = HORARIO_PEDIDOS.h    * 60 + HORARIO_PEDIDOS.m;
  const abre          = HORARIO_ABERTURA.h   * 60 + HORARIO_ABERTURA.m;
  const fecha         = HORARIO_FECHAMENTO.h * 60 + HORARIO_FECHAMENTO.m;

  if (totalMin >= inicioPedidos && totalMin < abre)  return 'pedidos'; // 08h–10h30
  if (totalMin >= abre          && totalMin < fecha)  return 'aberto';  // 10h30–14h
  return 'fechado'; // antes das 8h ou depois das 14h
}

// Mantém compatibilidade: estaAberto() = aceita pedidos (ambos os estados)
function estaAberto() {
  const estado = getEstado();
  return estado === 'aberto' || estado === 'pedidos';
}

function atualizarBadgeHorario() {
  const badge = document.getElementById('badgeHorario');
  if (!badge) return;
  const estado = getEstado();
  if (estado === 'aberto') {
    badge.textContent = '🟢 Aberto agora';
    badge.className = 'badge-horario badge-aberto';
  } else if (estado === 'pedidos') {
    badge.textContent = '🟡 Pedidos disponíveis';
    badge.className = 'badge-horario badge-pedidos';
  } else {
    badge.textContent = '🔴 Fechado agora';
    badge.className = 'badge-horario badge-fechado';
  }
}

// ========== CARREGAR CARDÁPIO DO GOOGLE SHEETS (TSV) ==========
// Converte data DD/MM/AAAA → AAAA-MM-DD para comparação
function parseDateBR(str) {
  const partes = str.trim().split('/');
  if (partes.length !== 3) return null;
  const [d, m, a] = partes;
  if (!d || !m || !a) return null;
  return `${a.padStart(4,'0')}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

async function carregarCardapio() {
  mostrarSkeleton(true);
  try {
    const res = await fetch(SHEETS_URL);
    const tsv = await res.text();

    CARDAPIO = { acompanhamentos: [], carnes: [], saladas: [], sobremesas: [] };
    DIAS_FECHADOS_ESPECIAIS = [];

    const linhas = tsv.split('\n').slice(1);
    linhas.forEach(linha => {
      if (!linha.trim()) return;
      const partes = linha.split('\t');
      const categoria = (partes[0] || '').trim().replace(/"/g, '').toLowerCase();
      const item = (partes[1] || '').trim().replace(/"/g, '');
      if (!item) return;

      if (categoria === 'acompanhamentos' || categoria === 'acompanhamento') CARDAPIO.acompanhamentos.push(item);
      else if (categoria === 'carnes' || categoria === 'carne') CARDAPIO.carnes.push(item);
      else if (categoria === 'saladas' || categoria === 'salada') CARDAPIO.saladas.push(item);
      else if (categoria === 'sobremesas' || categoria === 'sobremesa') CARDAPIO.sobremesas.push(item);
      else if (categoria === 'fechado') {
        // Aceita DD/MM/AAAA ou AAAA-MM-DD
        const iso = item.includes('/') ? parseDateBR(item) : item;
        if (iso) DIAS_FECHADOS_ESPECIAIS.push(iso);
      }
    });

    buildCardapio();
    buildGrids();
    updatePrecoPersonalizada();
    // Re-checa badge após carregar (pode ter mudado por dia fechado)
    atualizarBadgeHorario();
  } catch (e) {
    console.error('Erro ao carregar cardápio:', e);
    CARDAPIO = {
      acompanhamentos: ["Arroz branco", "Feijão", "Macarrão espaguete", "Aipim com bacon"],
      carnes: ["Carne do dia"],
      saladas: ["Salada da casa"],
      sobremesas: ["Sobremesa do dia"]
    };
    buildCardapio();
    buildGrids();
    updatePrecoPersonalizada();
    showToast('⚠️ Cardápio padrão carregado. Verifique sua conexão.', 'aviso', 5000);
  } finally {
    mostrarSkeleton(false);
  }
}

// Skeleton loading enquanto carrega
function mostrarSkeleton(show) {
  if (!show) return;
  document.querySelectorAll('.cardapio-box-list, .cpg-list').forEach(el => {
    el.innerHTML = '<span class="skeleton-item"></span><span class="skeleton-item"></span><span class="skeleton-item"></span>';
  });
}

// ========== NAVEGAÇÃO — somente via classe, sem style.display inline ==========
function showSection(id, btn) {
  document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  const sec = document.getElementById(id);
  if (sec) sec.classList.add('active');
  if (btn) btn.classList.add('active');
  window.scrollTo(0, 0);
  const aviso = document.getElementById('avisoBalcao');
  if (aviso) aviso.classList.toggle('visible', id === 'pedidos');
}

function goToMarmitas() { showSection('pedidos', document.querySelector('nav button:nth-child(3)')); }
function goToCardapio()  { showSection('cardapio-dia-sec', document.querySelector('nav button:nth-child(2)')); }

// ========== CARDÁPIO ==========
function buildCardapio() {
  const grupos = [
    { id: 'listaAcomp',     items: CARDAPIO.acompanhamentos, cls: 'tag-acomp' },
    { id: 'listaCarne',     items: CARDAPIO.carnes,          cls: 'tag-carne' },
    { id: 'listaSalada',    items: CARDAPIO.saladas,         cls: 'tag-salada' },
    { id: 'listaSobremesa', items: CARDAPIO.sobremesas,      cls: 'tag-sobremesa' },
  ];
  grupos.forEach(({ id, items, cls }) => {
    const div = document.getElementById(id);
    if (!div) return;
    div.innerHTML = '';
    if (!items.length) { div.innerHTML = '<span style="color:#aaa;font-size:0.85rem;">Nenhum item hoje</span>'; return; }
    items.forEach(item => {
      const tag = document.createElement('span');
      tag.className = `cardapio-item-tag ${cls}`;
      tag.textContent = item;
      div.appendChild(tag);
    });
  });

  const cpgGrupos = [
    { id: 'cpgAcomp',  items: CARDAPIO.acompanhamentos, cls: 'tag-acomp' },
    { id: 'cpgCarne',  items: CARDAPIO.carnes,          cls: 'tag-carne' },
    { id: 'cpgSalada', items: CARDAPIO.saladas,         cls: 'tag-salada' },
  ];
  cpgGrupos.forEach(({ id, items, cls }) => {
    const div = document.getElementById(id);
    if (!div) return;
    div.innerHTML = '';
    items.forEach(item => {
      const tag = document.createElement('span');
      tag.className = `cardapio-item-tag ${cls}`;
      tag.textContent = item;
      div.appendChild(tag);
    });
  });
}

// ========== GRIDS PERSONALIZADA ==========
function buildGrids() {
  buildGrid('acompGrid',  CARDAPIO.acompanhamentos, 'acomp');
  buildGrid('carneGrid',  CARDAPIO.carnes,          'carne');
  buildGrid('saladaGrid', CARDAPIO.saladas,          'salada');
}

function buildGrid(containerId, items, type) {
  const div = document.getElementById(containerId);
  if (!div) return;
  div.innerHTML = '';
  items.forEach(item => {
    if (type === 'carne') {
      const card = document.createElement('div');
      card.className = 'carne-card';
      card.dataset.item = item;

      const nome = document.createElement('span');
      nome.className = 'carne-nome';
      nome.textContent = item;

      const counter = document.createElement('div');
      counter.className = 'carne-counter';
      counter.style.display = 'none';

      const btnMinus = document.createElement('button');
      btnMinus.className = 'carne-btn carne-btn-minus';
      btnMinus.textContent = '−';
      btnMinus.onclick = (e) => { e.stopPropagation(); alterarCarne(card, item, -1); };

      const qty = document.createElement('span');
      qty.className = 'carne-qty';
      qty.textContent = '0';

      const btnPlus = document.createElement('button');
      btnPlus.className = 'carne-btn carne-btn-plus';
      btnPlus.textContent = '+';
      btnPlus.onclick = (e) => { e.stopPropagation(); alterarCarne(card, item, 1); };

      counter.appendChild(btnMinus);
      counter.appendChild(qty);
      counter.appendChild(btnPlus);
      card.appendChild(nome);
      card.appendChild(counter);
      card.onclick = () => alterarCarne(card, item, 1);
      div.appendChild(card);
    } else {
      const chip = document.createElement('button');
      chip.className = 'item-chip';
      chip.textContent = item;
      chip.dataset.item = item;
      chip.dataset.type = type;
      chip.onclick = () => toggleItem(chip, type, item);
      div.appendChild(chip);
    }
  });
}

function alterarCarne(card, item, delta) {
  const atual = selCarne[item] || 0;
  const novo = Math.max(0, atual + delta);

  if (novo === 0) {
    delete selCarne[item];
    card.classList.remove('carne-selecionada');
    card.querySelector('.carne-counter').style.display = 'none';
    card.querySelector('.carne-qty').textContent = '0';
  } else {
    selCarne[item] = novo;
    card.classList.add('carne-selecionada');
    card.querySelector('.carne-counter').style.display = 'flex';
    card.querySelector('.carne-qty').textContent = novo;
  }

  const totalPedacos = Object.values(selCarne).reduce((a, b) => a + b, 0);
  const extras = Math.max(0, totalPedacos - 3);
  const extraInfo = extras > 0 ? ` (+${extras} extra${extras > 1 ? 's' : ''} = +R$${extras * 4})` : '';
  const counter = document.getElementById('carneCounter');
  counter.textContent = `Selecionados: ${totalPedacos} pedaço${totalPedacos !== 1 ? 's' : ''}${extraInfo}`;
  counter.classList.toggle('warn', extras > 0);
  updatePrecoPersonalizada();
}

function toggleItem(chip, type, item) {
  if (type === 'acomp') {
    if (selAcomp.includes(item)) {
      selAcomp = selAcomp.filter(i => i !== item);
      chip.classList.remove('selected');
    } else {
      selAcomp.push(item);
      chip.classList.add('selected');
    }
    const extras = Math.max(0, selAcomp.length - 5);
    const extraInfo = extras > 0 ? ` (+${extras} extra${extras > 1 ? 's' : ''} = +R$${(extras * 4).toFixed(0)})` : '';
    document.getElementById('acompCounter').textContent = `Selecionados: ${selAcomp.length} / 5${extraInfo}`;
    document.getElementById('acompCounter').classList.toggle('warn', selAcomp.length > 5);
  } else if (type === 'salada') {
    if (selSalada.includes(item)) {
      selSalada = selSalada.filter(i => i !== item);
      chip.classList.remove('selected-salada');
    } else {
      if (selSalada.length >= 3) { showToast('Máximo de 3 saladas!', 'aviso'); return; }
      selSalada.push(item);
      chip.classList.add('selected-salada');
    }
    document.getElementById('saladaCounter').textContent =
      `Selecionadas: ${selSalada.length} / 3${selSalada.length > 0 ? ` (+R$${(selSalada.length * 2).toFixed(0)})` : ''}`;
  }
  updatePrecoPersonalizada();
}

function selectSize(size) {
  selectedSize = size;
  document.getElementById('sizeMedia').classList.toggle('selected', size === 'media');
  document.getElementById('sizeGrande').classList.toggle('selected', size === 'grande');
  updatePrecoPersonalizada();
}

function updatePrecoPersonalizada() {
  const base = selectedSize === 'media' ? 28 : 30;
  const extrasAcomp = Math.max(0, selAcomp.length - 5);
  const totalPedacos = Object.values(selCarne).reduce((a, b) => a + b, 0);
  const extrasCarne = Math.max(0, totalPedacos - 3);
  const total = base + (extrasAcomp * 4) + (extrasCarne * 4) + (selSalada.length * 2);
  document.getElementById('precoPersonalizada').textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
}

let qtyPadrao = { media: 1, grande: 1 };

function changeQty(size, delta) {
  qtyPadrao[size] = Math.max(1, qtyPadrao[size] + delta);
  document.getElementById(size === 'media' ? 'qtyMedia' : 'qtyGrande').textContent = qtyPadrao[size];
}

// ========== MARMITA PADRÃO — BUG #1 CORRIGIDO ==========
function addPadrao(size) {
  if (!estaAberto()) {
    showToast('🔴 Estamos fechados', 'aviso', 5000);
    return;
  }
  const precoUnit = size === 'media' ? 25 : 27;
  const label = size === 'media' ? 'Média' : 'Grande';
  const qty = qtyPadrao[size];
  const obsId = size === 'media' ? 'obsMedia' : 'obsGrande';
  const obs = document.getElementById(obsId).value.trim();

  // BUG #1 CORRIGIDO: lista as opções de carne do dia sem repetir
  const carneDesc = CARDAPIO.carnes.length > 0
    ? `3 pedaços — ${CARDAPIO.carnes.join(' / ')}`
    : '3 pedaços — Carne do dia';

  const descBase = `Arroz branco, Feijão, Macarrão espaguete, Aipim com bacon | ${carneDesc}`;
  const desc = obs ? `${descBase} | ⚠️ Obs: ${obs}` : descBase;

  for (let i = 0; i < qty; i++) {
    cart.push({ tipo: `Marmita Padrão ${label}`, desc, descPlanilha: obs ? `Obs: ${obs}` : '', preco: precoUnit });
  }

  salvarCarrinhoLocal();
  qtyPadrao[size] = 1;
  document.getElementById(size === 'media' ? 'qtyMedia' : 'qtyGrande').textContent = '1';
  document.getElementById(obsId).value = '';
  updateCart();

  // UX #4 #5: toast, sem abrir carrinho automaticamente
  showToast(`✅ ${qty > 1 ? qty + 'x ' : ''}Marmita ${label} adicionada!`, 'sucesso');
}

// ========== MARMITA PERSONALIZADA — BUG #3 CORRIGIDO ==========
function addPersonalizada() {
  if (!estaAberto()) {
    showToast('🔴 Estamos fechados', 'aviso', 5000);
    return;
  }
  const totalPedacos = Object.values(selCarne).reduce((a, b) => a + b, 0);

  // BUG #3: valida todos os grupos, não apenas acomp e carne
  if (selAcomp.length === 0 && totalPedacos === 0 && selSalada.length === 0) {
    showToast('⚠️ Selecione ao menos um item para montar sua marmita!', 'aviso');
    return;
  }

  const base = selectedSize === 'media' ? 28 : 30;
  const extrasAcomp = Math.max(0, selAcomp.length - 5);
  const extrasCarne = Math.max(0, totalPedacos - 3);
  const preco = base + (extrasAcomp * 4) + (extrasCarne * 4) + (selSalada.length * 2);
  const label = selectedSize === 'media' ? 'Média' : 'Grande';

  const carnesDesc  = totalPedacos > 0 ? Object.entries(selCarne).map(([c,q]) => `${q}x ${c}`).join(', ') : '';
  const acompDesc   = selAcomp.length  > 0 ? selAcomp.join(', ') : '';
  const saladaDesc  = selSalada.length > 0 ? 'Salada: ' + selSalada.join(', ') : '';
  const descCompleta = [acompDesc, carnesDesc ? `Carnes: ${carnesDesc}` : '', saladaDesc].filter(Boolean).join(' | ');

  cart.push({ tipo: `Marmita Personalizada ${label}`, desc: descCompleta, descPlanilha: descCompleta, preco });

  salvarCarrinhoLocal();
  updateCart();
  clearPersonalizada();
  showToast(`✅ Marmita Personalizada ${label} adicionada!`, 'sucesso');
}

function clearPersonalizada() {
  selAcomp = []; selCarne = {}; selSalada = [];
  buildGrids();
  document.getElementById('acompCounter').textContent  = 'Selecionados: 0 / 5';
  document.getElementById('carneCounter').textContent  = 'Selecionados: 0 pedaços';
  document.getElementById('saladaCounter').textContent = 'Selecionadas: 0 / 3';
  document.getElementById('acompCounter').classList.remove('warn');
  document.getElementById('carneCounter').classList.remove('warn');
  updatePrecoPersonalizada();
}

// ========== CARRINHO ==========
function updateCart() {
  const container = document.getElementById('cartItems');
  document.getElementById('cartCount').textContent = cart.length;

  if (cart.length === 0) {
    container.innerHTML = '<p class="cart-empty">Seu carrinho está vazio.</p>';
    document.getElementById('cartTotal').textContent = 'R$ 0,00';
    return;
  }

  container.innerHTML = '';
  let total = 0;
  cart.forEach((item, i) => {
    total += item.preco;
    const div = document.createElement('div');
    div.className = 'cart-item';
    div.innerHTML = `
      <div class="cart-item-title">${item.tipo}</div>
      <div class="cart-item-desc">${item.desc}</div>
      <div class="cart-item-price">R$ ${item.preco.toFixed(2).replace('.', ',')}</div>
      <button class="remove-item" onclick="confirmarRemocao(${i})" title="Remover">✕</button>
    `;
    container.appendChild(div);
  });

  document.getElementById('cartTotal').textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
}

// UX #6: confirmar antes de remover
function confirmarRemocao(i) {
  abrirModalConfirm(
    'Remover item?',
    `Deseja remover <strong>${cart[i].tipo}</strong> do carrinho?`,
    () => removeItem(i)
  );
}

function removeItem(i) {
  cart.splice(i, 1);
  salvarCarrinhoLocal();
  updateCart();
}

function toggleCart() {
  const panel   = document.getElementById('cartPanel');
  const overlay = document.getElementById('overlay');
  const aviso   = document.getElementById('avisoBalcao');
  panel.classList.toggle('open');
  overlay.classList.toggle('open');
  if (aviso) aviso.classList.toggle('hidden-by-cart', panel.classList.contains('open'));
}

// ========== LOCALSTORAGE (#14) ==========
function salvarCarrinhoLocal() {
  try {
    localStorage.setItem('rdm_cart', JSON.stringify(cart));
    localStorage.setItem('rdm_cart_ts', Date.now());
  } catch(e) {}
}

function carregarCarrinhoLocal() {
  try {
    const ts = parseInt(localStorage.getItem('rdm_cart_ts') || '0');
    if (Date.now() - ts > 4 * 60 * 60 * 1000) {
      localStorage.removeItem('rdm_cart');
      localStorage.removeItem('rdm_cart_ts');
      return;
    }
    const salvo = localStorage.getItem('rdm_cart');
    if (salvo) {
      cart = JSON.parse(salvo);
      updateCart();
      if (cart.length > 0) showToast(`🛒 Você tem ${cart.length} item(ns) do seu último acesso!`, 'info', 4000);
    }
  } catch(e) {}
}

// ========== MODAL DE CONFIRMAÇÃO GENÉRICO ==========
function abrirModalConfirm(titulo, mensagem, onConfirm) {
  const overlay = document.getElementById('modalConfirmOverlay');
  const modal   = document.getElementById('modalConfirm');
  if (!overlay || !modal) { onConfirm(); return; }
  modal.querySelector('.modal-confirm-title').textContent = titulo;
  modal.querySelector('.modal-confirm-msg').innerHTML = mensagem;
  modal.querySelector('.modal-confirm-ok').onclick = () => { fecharModalConfirm(); onConfirm(); };
  overlay.classList.add('open');
  modal.classList.add('open');
}

function fecharModalConfirm() {
  document.getElementById('modalConfirmOverlay').classList.remove('open');
  document.getElementById('modalConfirm').classList.remove('open');
}

// ========== MODAL NOME DO CLIENTE ==========
function abrirModalNome() {
  if (cart.length === 0) { showToast('🛒 Seu carrinho está vazio!', 'aviso'); return; }
  if (!estaAberto()) { showToast('🔴 Estamos fechados', 'aviso', 5000); return; }
  document.getElementById('inputNomeCliente').value = '';
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('modalNome').classList.add('open');
  setTimeout(() => document.getElementById('inputNomeCliente').focus(), 100);
}

function fecharModalNome() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.getElementById('modalNome').classList.remove('open');
}

function confirmarPedido() {
  const nome = document.getElementById('inputNomeCliente').value.trim();
  if (!nome) {
    showToast('Por favor, digite seu nome antes de continuar.', 'aviso');
    document.getElementById('inputNomeCliente').focus();
    return;
  }
  fecharModalNome();
  enviarWhatsApp(nome);
}

// ========== WHATSAPP + GOOGLE DRIVE ==========
function enviarWhatsApp(nomeCliente) {
  if (cart.length === 0) { showToast('🛒 Carrinho vazio!', 'aviso'); return; }

  const total = cart.reduce((sum, item) => sum + item.preco, 0);

  fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({
      nomeCliente,
      itens: cart.map(item => ({ tipo: item.tipo, desc: item.descPlanilha, preco: item.preco })),
      total: total.toFixed(2)
    })
  }).catch(err => console.warn('Erro ao salvar no Drive:', err));

  let msg = `🍽️ *Pedido — Restaurante do Mário*\n`;
  msg += `👤 *Cliente: ${nomeCliente}*\n\n`;
  cart.forEach((item, i) => {
    msg += `*${i + 1}. ${item.tipo}*\n${item.desc}\nR$ ${item.preco.toFixed(2).replace('.', ',')}\n\n`;
  });
  msg += `💰 *Total: R$ ${total.toFixed(2).replace('.', ',')}*\n`;

  // Limpa carrinho após envio
  cart = [];
  salvarCarrinhoLocal();
  updateCart();

  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
  carregarCardapio();
  carregarCarrinhoLocal();
  atualizarBadgeHorario();
  setInterval(atualizarBadgeHorario, 60000);
});