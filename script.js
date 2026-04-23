// ========== GOOGLE SHEETS (Cardápio) ==========
const SHEETS_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTU8-45F4IYTWaim8pMyNru3071eB87U0-oZy98g8796_m9BKLMJ8vetpfeZ9AOXYZ569vOkvzcfzBS/pub?output=csv';

// ========== COLE AQUI A URL DO SEU APPS SCRIPT ==========
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyFmzkXOJPdrAIrg5WFu-r91O8lZQbCvkGBzriRB-j7eSllrKPGYCeROAKI7zGixj4/exec';

const WHATSAPP_NUMBER = "554733752227";

let cart = [];
let selectedSize = 'media';
let selAcomp = [];
let selCarne = {}; // { nomeCarne: quantidade }
let selSalada = [];

let CARDAPIO = {
  acompanhamentos: [],
  carnes: [],
  saladas: [],
  sobremesas: []
};

// ========== CARREGAR CARDÁPIO DO GOOGLE SHEETS ==========
async function carregarCardapio() {
  try {
    const res = await fetch(SHEETS_URL);
    const csv = await res.text();

    CARDAPIO = { acompanhamentos: [], carnes: [], saladas: [], sobremesas: [] };

    const linhas = csv.split('\n').slice(1);
    linhas.forEach(linha => {
      if (!linha.trim()) return;
      const partes = linha.split(',');
      const categoria = partes[0].trim().replace(/"/g, '').toLowerCase();
      const item = partes.slice(1).join(',').trim().replace(/"/g, '');
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
      acompanhamentos: ["Arroz branco","Feijão","Macarrão espaguete","Aipim com bacon"],
      carnes: ["Carne do dia"],
      saladas: ["Salada da casa"],
      sobremesas: ["Sobremesa do dia"]
    };
    buildCardapio();
    buildGrids();
    updatePrecoPersonalizada();
  }
}

// ========== NAVEGAÇÃO ==========
function showSection(id, btn) {
  document.querySelectorAll('section').forEach(s => {
    s.classList.remove('active');
    s.style.display = '';
  });
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  const sec = document.getElementById(id);
  sec.classList.add('active');
  if (id === 'inicio') sec.style.cssText = 'display:block;padding:0;max-width:100%;';
  if (btn) btn.classList.add('active');
  window.scrollTo(0, 0);

  // Aviso de balcão só na seção de pedidos
  const aviso = document.getElementById('avisoBalcao');
  if (aviso) aviso.classList.toggle('visible', id === 'pedidos');
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
  const flat = document.getElementById('cardapioDia');
  if (flat) {
    flat.innerHTML = '';
    [...CARDAPIO.acompanhamentos, ...CARDAPIO.carnes, ...CARDAPIO.saladas, ...CARDAPIO.sobremesas].forEach(item => {
      const tag = document.createElement('span');
      tag.className = 'cardapio-tag';
      tag.textContent = item;
      flat.appendChild(tag);
    });
  }

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
  items.forEach(item => {
    if (type === 'carne') {
      // Card de carne com contador inline
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

      // Clique no card (fora dos botões) = adiciona 1
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

function removeCarne(card, item) {
  alterarCarne(card, item, -1);
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
    if (selAcomp.length > 5) {
      document.getElementById('acompCounter').classList.add('warn');
    } else {
      document.getElementById('acompCounter').classList.remove('warn');
    }
  } else if (type === 'carne') {
    // tratado por alterarCarne()
  } else if (type === 'salada') {
    if (selSalada.includes(item)) {
      selSalada = selSalada.filter(i => i !== item);
      chip.classList.remove('selected-salada');
    } else {
      if (selSalada.length >= 3) { alert('Máximo de 3 saladas!'); return; }
      selSalada.push(item);
      chip.classList.add('selected-salada');
    }
    document.getElementById('saladaCounter').textContent = `Selecionadas: ${selSalada.length} / 3${selSalada.length > 0 ? ` (+R$${(selSalada.length * 2).toFixed(0)})` : ''}`;
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

// ========== MARMITA PADRÃO ==========
function addPadrao(size) {
  const precoUnit = size === 'media' ? 25 : 27;
  const label = size === 'media' ? 'Média' : 'Grande';
  const qty = qtyPadrao[size];
  const carneDesc = `3 pedaços de carne | ${CARDAPIO.carnes.join(', ')}`;
  const obsId = size === 'media' ? 'obsMedia' : 'obsGrande';
  const obs = document.getElementById(obsId).value.trim();

  const descBase = `Arroz branco, Feijão, Macarrão espaguete, Aipim com bacon | ${carneDesc}`;
  const desc = obs ? `${descBase} | ⚠️ Obs: ${obs}` : descBase;

  for (let i = 0; i < qty; i++) {
    cart.push({
      tipo: `Marmita Padrão ${label}`,
      desc,
      descPlanilha: obs ? `Obs: ${obs}` : '',
      preco: precoUnit
    });
  }

  qtyPadrao[size] = 1;
  document.getElementById(size === 'media' ? 'qtyMedia' : 'qtyGrande').textContent = '1';
  document.getElementById(obsId).value = '';
  updateCart();
  toggleCart();
}

// ========== MARMITA PERSONALIZADA ==========
function addPersonalizada() {
  const totalPedacos = Object.values(selCarne).reduce((a, b) => a + b, 0);
  if (selAcomp.length === 0 && totalPedacos === 0) {
    alert('Selecione ao menos um item antes de adicionar!');
    return;
  }
  const base = selectedSize === 'media' ? 28 : 30;
  const extrasAcomp = Math.max(0, selAcomp.length - 5);
  const extrasCarne = Math.max(0, totalPedacos - 3);
  const preco = base + (extrasAcomp * 4) + (extrasCarne * 4) + (selSalada.length * 2);
  const label = selectedSize === 'media' ? 'Média' : 'Grande';

  const carnesDesc = totalPedacos > 0
    ? Object.entries(selCarne).map(([c, q]) => `${q}x ${c}`).join(', ')
    : '';
  const acompDesc  = selAcomp.length  > 0 ? selAcomp.join(', ') : '';
  const saladaDesc = selSalada.length > 0 ? 'Salada: ' + selSalada.join(', ') : '';

  const parts = [acompDesc, carnesDesc ? `Carnes: ${carnesDesc}` : '', saladaDesc].filter(Boolean);
  const descCompleta = parts.join(' | ');

  cart.push({
    tipo: `Marmita Personalizada ${label}`,
    desc: descCompleta,
    descPlanilha: descCompleta,
    preco
  });

  updateCart();
  clearPersonalizada();
  toggleCart();
}

function clearPersonalizada() {
  selAcomp = [];
  selCarne = {};
  selSalada = [];
  buildGrids();
  document.getElementById('acompCounter').textContent = 'Selecionados: 0 / 5';
  document.getElementById('carneCounter').textContent = 'Selecionados: 0 pedaços';
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
      <button class="remove-item" onclick="removeItem(${i})" title="Remover">✕</button>
    `;
    container.appendChild(div);
  });

  document.getElementById('cartTotal').textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
}

function removeItem(i) {
  cart.splice(i, 1);
  updateCart();
}

function toggleCart() {
  const panel = document.getElementById('cartPanel');
  const overlay = document.getElementById('overlay');
  const aviso = document.getElementById('avisoBalcao');
  panel.classList.toggle('open');
  overlay.classList.toggle('open');
  // Esconde o aviso quando o carrinho estiver aberto
  if (aviso) aviso.classList.toggle('hidden-by-cart', panel.classList.contains('open'));
}

// ========== MODAL NOME DO CLIENTE ==========
function abrirModalNome() {
  if (cart.length === 0) { alert('Carrinho vazio!'); return; }
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
    alert('Por favor, digite seu nome antes de continuar.');
    document.getElementById('inputNomeCliente').focus();
    return;
  }
  fecharModalNome();
  enviarWhatsApp(nome);
}

// ========== WHATSAPP + GOOGLE DRIVE ==========
function enviarWhatsApp(nomeCliente) {
  if (cart.length === 0) { alert('Carrinho vazio!'); return; }

  const total = cart.reduce((sum, item) => sum + item.preco, 0);

  // ── Salva no Google Drive ──
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

  // ── Monta mensagem do WhatsApp ──
  let msg = `🍽️ *Pedido — Restaurante do Mário*\n`;
  msg += `👤 *Cliente: ${nomeCliente}*\n\n`;
  cart.forEach((item, i) => {
    msg += `*${i + 1}. ${item.tipo}*\n${item.desc}\nR$ ${item.preco.toFixed(2).replace('.', ',')}\n\n`;
  });
  msg += `💰 *Total: R$ ${total.toFixed(2).replace('.', ',')}*\n`;

  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

// ========== INIT ==========
carregarCardapio();