// ========== GOOGLE SHEETS (Cardápio) ==========
const SHEETS_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTU8-45F4IYTWaim8pMyNru3071eB87U0-oZy98g8796_m9BKLMJ8vetpfeZ9AOXYZ569vOkvzcfzBS/pub?output=csv';

// ========== APPS SCRIPT URL ==========
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyFmzkXOJPdrAIrg5WFu-r91O8lZQbCvkGBzriRB-j7eSllrKPGYCeROAKI7zGixj4/exec';

const WHATSAPP_NUMBER = "554733752227";

// Horário de funcionamento
const HORARIO_PEDIDOS    = 8 * 60;       // 08:00 — início pedidos marmita
const HORARIO_ABERTURA   = 10 * 60 + 30; // 10:30 — buffet abre
const HORARIO_FECHAMENTO = 14 * 60;      // 14:00 — fechamento
const DIAS_FUNCIONAMENTO = [1, 2, 3, 4, 5, 6]; // segunda a sábado

let cart = [];
let selectedSize = 'media';
let selAcomp = [];
let selCarne = [];
let selSalada = [];

let CARDAPIO = {
  acompanhamentos: [],
  carnes: [],
  saladas: [],
  sobremesas: []
};

let qtyPadrao = { media: 1, grande: 1 };

// ========== UTILITÁRIOS ==========

// Parse CSV robusto (lida com vírgulas dentro de aspas)
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// Toast de feedback 
function showToast(msg, tipo = 'sucesso') {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = `toast toast-${tipo}`;
  toast.innerHTML = msg;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('toast-show'));

  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

// Animação de "pulsar" no botão do carrinho
function pulsarCarrinho() {
  const btn = document.getElementById('cartBtnHeader');
  if (!btn) return;
  btn.classList.remove('cart-pulse');
  void btn.offsetWidth;
  btn.classList.add('cart-pulse');
  setTimeout(() => btn.classList.remove('cart-pulse'), 600);
}

// ========== HORÁRIO DE FUNCIONAMENTO ==========
function verificarHorario() {
  const agora = new Date();
  const diaSemana = agora.getDay();
  const min = agora.getHours() * 60 + agora.getMinutes();
  const badge = document.getElementById('statusBadge');
  if (!badge) return;

  const diaUtil = DIAS_FUNCIONAMENTO.includes(diaSemana);

  if (diaUtil && min >= HORARIO_PEDIDOS && min < HORARIO_ABERTURA) {
    badge.className = 'status-badge status-pedidos';
    badge.innerHTML = '🟡 Disponível para pedidos de marmita';
  } else if (diaUtil && min >= HORARIO_ABERTURA && min < HORARIO_FECHAMENTO) {
    badge.className = 'status-badge status-aberto';
    badge.innerHTML = '🟢 Aberto agora';
  } else {
    badge.className = 'status-badge status-fechado';
    badge.innerHTML = '🔴 Fechado agora';
  }
  badge.style.display = 'inline-flex';
}

// ========== CARREGAR CARDÁPIO DO GOOGLE SHEETS ==========
async function carregarCardapio() {
  mostrarSkeletons();
  try {
    const res = await fetch(SHEETS_URL);
    const csv = await res.text();

    CARDAPIO = { acompanhamentos: [], carnes: [], saladas: [], sobremesas: [] };

    const linhas = csv.split('\n').slice(1);
    linhas.forEach(linha => {
      if (!linha.trim()) return;
      const partes = parseCSVLine(linha);
      const categoria = partes[0].toLowerCase();
      const item = partes.slice(1).join(',').trim().replace(/^"|"$/g, '');
      if (!item) return;
      if (categoria === 'acompanhamentos' || categoria === 'acompanhamento') CARDAPIO.acompanhamentos.push(item);
      else if (categoria === 'carnes' || categoria === 'carne') CARDAPIO.carnes.push(item);
      else if (categoria === 'saladas' || categoria === 'salada') CARDAPIO.saladas.push(item);
      else if (categoria === 'sobremesas' || categoria === 'sobremesa') CARDAPIO.sobremesas.push(item);
    });

    buildCardapio();
    buildGrids();
    updatePrecoPersonalizada();

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
  }
}

function mostrarSkeletons() {
  const ids = ['listaAcomp','listaCarne','listaSalada','listaSobremesa','cpgAcomp','cpgCarne','cpgSalada','cpgSobremesa'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<span class="skeleton-tag"></span><span class="skeleton-tag"></span><span class="skeleton-tag"></span>';
  });
}

// ========== NAVEGAÇÃO ==========
function showSection(id, btn) {
  document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));

  const sec = document.getElementById(id);
  sec.classList.add('active');
  if (btn) btn.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goToMarmitas() {
  const btn = document.querySelector('nav button:nth-child(3)');
  showSection('pedidos', btn);
}

function goToCardapio() {
  const btn = document.querySelector('nav button:nth-child(2)');
  showSection('cardapio-dia-sec', btn);
}

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
    if (items.length === 0) {
      div.innerHTML = '<span style="color:#aaa;font-size:0.85rem;">Nenhum item hoje</span>';
      return;
    }
    items.forEach(item => {
      const tag = document.createElement('span');
      tag.className = `cardapio-item-tag ${cls}`;
      tag.textContent = item;
      div.appendChild(tag);
    });
  });

  const cpgGrupos = [
    { id: 'cpgAcomp',     items: CARDAPIO.acompanhamentos, cls: 'tag-acomp' },
    { id: 'cpgCarne',     items: CARDAPIO.carnes,          cls: 'tag-carne' },
    { id: 'cpgSalada',    items: CARDAPIO.saladas,         cls: 'tag-salada' },
    { id: 'cpgSobremesa', items: CARDAPIO.sobremesas,      cls: 'tag-sobremesa' },
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
  buildGrid('acompGrid', CARDAPIO.acompanhamentos, 'acomp');
  buildGrid('carneGrid', CARDAPIO.carnes, 'carne');
  buildGrid('saladaGrid', CARDAPIO.saladas, 'salada');
}

function buildGrid(containerId, items, type) {
  const div = document.getElementById(containerId);
  if (!div) return;
  div.innerHTML = '';
  if (items.length === 0) {
    div.innerHTML = '<span style="color:#aaa;font-size:0.85rem;">Cardápio não disponível</span>';
    return;
  }
  items.forEach(item => {
    const chip = document.createElement('button');
    chip.className = 'item-chip';
    chip.textContent = item;
    chip.dataset.item = item;
    chip.dataset.type = type;
    chip.setAttribute('aria-pressed', 'false');
    chip.onclick = () => toggleItem(chip, type, item);
    div.appendChild(chip);
  });
}

function toggleItem(chip, type, item) {
  if (type === 'acomp') {
    if (selAcomp.includes(item)) {
      selAcomp = selAcomp.filter(i => i !== item);
      chip.classList.remove('selected');
      chip.setAttribute('aria-pressed', 'false');
    } else {
      selAcomp.push(item);
      chip.classList.add('selected');
      chip.setAttribute('aria-pressed', 'true');
    }
    const extras = Math.max(0, selAcomp.length - 5);
    const extraInfo = extras > 0 ? ` (+${extras} extra${extras > 1 ? 's' : ''} = +R$${extras * 4})` : '';
    const counter = document.getElementById('acompCounter');
    counter.textContent = `Selecionados: ${selAcomp.length} / 5${extraInfo}`;
    counter.classList.toggle('warn', selAcomp.length > 5);

  } else if (type === 'carne') {
    if (selCarne.includes(item)) {
      selCarne = selCarne.filter(i => i !== item);
      chip.classList.remove('selected-carne');
      chip.setAttribute('aria-pressed', 'false');
    } else {
      if (selCarne.length >= 3) {
        showToast('⚠️ Máximo de 3 pedaços de carne!', 'aviso');
        return;
      }
      selCarne.push(item);
      chip.classList.add('selected-carne');
      chip.setAttribute('aria-pressed', 'true');
    }
    document.getElementById('carneCounter').textContent = `Selecionados: ${selCarne.length} / 3`;

  } else if (type === 'salada') {
    if (selSalada.includes(item)) {
      selSalada = selSalada.filter(i => i !== item);
      chip.classList.remove('selected-salada');
      chip.setAttribute('aria-pressed', 'false');
    } else {
      if (selSalada.length >= 3) {
        showToast('⚠️ Máximo de 3 saladas!', 'aviso');
        return;
      }
      selSalada.push(item);
      chip.classList.add('selected-salada');
      chip.setAttribute('aria-pressed', 'true');
    }
    document.getElementById('saladaCounter').textContent =
      `Selecionadas: ${selSalada.length} / 3${selSalada.length > 0 ? ` (+R$${selSalada.length * 2})` : ''}`;
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
  const base = selectedSize === 'media' ? 25 : 27;
  const extrasAcomp = Math.max(0, selAcomp.length - 5);
  const total = base + (extrasAcomp * 4) + (selSalada.length * 2);
  document.getElementById('precoPersonalizada').textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
}

function changeQty(size, delta) {
  qtyPadrao[size] = Math.max(1, qtyPadrao[size] + delta);
  document.getElementById(size === 'media' ? 'qtyMedia' : 'qtyGrande').textContent = qtyPadrao[size];
}

// ========== MARMITA PADRÃO ==========
function addPadrao(size) {
  const precoUnit = size === 'media' ? 25 : 27;
  const label = size === 'media' ? 'Média' : 'Grande';
  const qty = qtyPadrao[size];

  // Descrição correta: lista todos os itens padrão + carne do dia
  const carneDesc = CARDAPIO.carnes.length > 0
    ? `3x pedaços : ${CARDAPIO.carnes.join(', ')}`
    : '1x pedaços — Carne do dia';

  const desc = `Arroz branco, Feijão, Macarrão, Aipim com bacon | ${carneDesc}`;

  for (let i = 0; i < qty; i++) {
    cart.push({
      tipo: `Marmita Padrão ${label}`,
      desc,
      descPlanilha: '',
      preco: precoUnit,
      obs: ''
    });
  }

  qtyPadrao[size] = 1;
  document.getElementById(size === 'media' ? 'qtyMedia' : 'qtyGrande').textContent = '1';
  updateCart();
  pulsarCarrinho();
  showToast(`✅ ${qty}x Marmita ${label} adicionada${qty > 1 ? 's' : ''} ao carrinho!`);
}

// ========== MARMITA PERSONALIZADA ==========
function addPersonalizada() {
  if (selAcomp.length === 0 && selCarne.length === 0 && selSalada.length === 0) {
    showToast('⚠️ Selecione ao menos um item antes de adicionar!', 'aviso');
    return;
  }

  const base = selectedSize === 'media' ? 25 : 27;
  const extrasAcomp = Math.max(0, selAcomp.length - 5);
  const preco = base + (extrasAcomp * 4) + (selSalada.length * 2);
  const label = selectedSize === 'media' ? 'Média' : 'Grande';

  let carnesDesc = '';
  if (selCarne.length === 1) {
    carnesDesc = `3x pedaços ${selCarne[0]}`;
  } else if (selCarne.length === 2) {
    carnesDesc = `2x pedaços ${selCarne[0]}, 1x pedaço ${selCarne[1]}`;
  } else if (selCarne.length === 3) {
    carnesDesc = `1x pedaço ${selCarne[0]}, 1x pedaço ${selCarne[1]}, 1x pedaço ${selCarne[2]}`;
  }

  const acompDesc  = selAcomp.length  > 0 ? selAcomp.join(', ') : '';
  const saladaDesc = selSalada.length > 0 ? 'Salada: ' + selSalada.join(', ') : '';
  const parts = [acompDesc, carnesDesc, saladaDesc].filter(Boolean);
  const descCompleta = parts.join(' | ');

  cart.push({
    tipo: `Marmita Personalizada ${label}`,
    desc: descCompleta,
    descPlanilha: descCompleta,
    preco,
    obs: ''
  });

  updateCart();
  clearPersonalizada();
  pulsarCarrinho();
  showToast(`✅ Marmita Personalizada ${label} adicionada ao carrinho!`);
}

function clearPersonalizada() {
  selAcomp = [];
  selCarne = [];
  selSalada = [];
  buildGrids();
  document.getElementById('acompCounter').textContent = 'Selecionados: 0 / 5';
  document.getElementById('acompCounter').classList.remove('warn');
  document.getElementById('carneCounter').textContent = 'Selecionados: 0 / 3';
  document.getElementById('saladaCounter').textContent = 'Selecionadas: 0 / 3';
  updatePrecoPersonalizada();
}

// ========== CARRINHO ==========
function updateCart() {
  const container = document.getElementById('cartItems');
  document.getElementById('cartCount').textContent = cart.length;

  if (cart.length === 0) {
    container.innerHTML = '<p class="cart-empty">🛒 Seu carrinho está vazio.</p>';
    document.getElementById('cartTotal').textContent = 'R$ 0,00';
    salvarCarrinhoLocal();
    return;
  }

  container.innerHTML = '';
  let total = 0;
  cart.forEach((item, i) => {
    total += item.preco;
    const div = document.createElement('div');
    div.className = 'cart-item';
    div.innerHTML = `
      <button class="remove-item" onclick="removeItem(${i})" title="Remover item" aria-label="Remover ${item.tipo}">✕</button>
      <div class="cart-item-title">${item.tipo}</div>
      <div class="cart-item-desc">${item.desc}</div>
      <div class="cart-item-price">R$ ${item.preco.toFixed(2).replace('.', ',')}</div>
    `;
    container.appendChild(div);
  });

  document.getElementById('cartTotal').textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
  salvarCarrinhoLocal();
}

function removeItem(i) {
  const nome = cart[i].tipo;
  cart.splice(i, 1);
  updateCart();
  showToast(`🗑️ ${nome} removida do carrinho.`, 'aviso');
}

function toggleCart() {
  const panel = document.getElementById('cartPanel');
  const overlay = document.getElementById('overlay');
  const isOpen = panel.classList.toggle('open');
  overlay.classList.toggle('open');
  document.body.style.overflow = isOpen ? 'hidden' : '';
}

// ========== LOCALSTORAGE ==========
function salvarCarrinhoLocal() {
  try {
    localStorage.setItem('rmario_cart', JSON.stringify(cart));
  } catch (e) { /* silencioso */ }
}

function restaurarCarrinhoLocal() {
  try {
    const saved = localStorage.getItem('rmario_cart');
    if (saved) {
      cart = JSON.parse(saved);
      updateCart();
    }
  } catch (e) {
    cart = [];
  }
}

// ========== MODAL NOME DO CLIENTE ==========
function abrirModalNome() {
  if (cart.length === 0) {
    showToast('⚠️ Seu carrinho está vazio!', 'aviso');
    return;
  }
  document.getElementById('inputNomeCliente').value = '';
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('modalNome').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('inputNomeCliente').focus(), 150);
}

function fecharModalNome() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.getElementById('modalNome').classList.remove('open');
  document.body.style.overflow = '';
}

function confirmarPedido() {
  const nome = document.getElementById('inputNomeCliente').value.trim();
  if (!nome) {
    document.getElementById('inputNomeCliente').classList.add('input-erro');
    setTimeout(() => document.getElementById('inputNomeCliente').classList.remove('input-erro'), 600);
    document.getElementById('inputNomeCliente').focus();
    return;
  }
  fecharModalNome();
  enviarWhatsApp(nome);
}

// ========== WHATSAPP + GOOGLE DRIVE ==========
function enviarWhatsApp(nomeCliente) {
  if (cart.length === 0) { showToast('⚠️ Carrinho vazio!', 'aviso'); return; }

  const total = cart.reduce((sum, item) => sum + item.preco, 0);

  // Salva no Google Drive (sem bloquear)
  fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({
      nomeCliente,
      itens: cart.map(item => ({
        tipo: item.tipo,
        desc: item.descPlanilha,
        preco: item.preco
      })),
      total: total.toFixed(2)
    })
  }).catch(err => console.warn('Erro ao salvar no Drive:', err));

  // Monta mensagem do WhatsApp
  let msg = `🍽️ *Pedido — Restaurante do Mário*\n`;
  msg += `👤 *Cliente: ${nomeCliente}*\n\n`;
  cart.forEach((item, i) => {
    msg += `*${i + 1}. ${item.tipo}*\n${item.desc}\nR$ ${item.preco.toFixed(2).replace('.', ',')}\n\n`;
  });
  msg += `💰 *Total: R$ ${total.toFixed(2).replace('.', ',')}*\n`;

  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');

  // Limpa carrinho após envio
  setTimeout(() => {
    cart = [];
    updateCart();
    toggleCart();
    showToast('✅ Pedido enviado com sucesso!');
  }, 500);
}

// ========== INICIALIZAÇÃO ==========
document.addEventListener('DOMContentLoaded', () => {
  carregarCardapio();
  restaurarCarrinhoLocal();
  verificarHorario();
  // Atualiza badge de status a cada minuto
  setInterval(verificarHorario, 60000);

  // Fecha carrinho com ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.getElementById('cartPanel').classList.contains('open')) toggleCart();
      if (document.getElementById('modalNome').classList.contains('open')) fecharModalNome();
    }
  });
});