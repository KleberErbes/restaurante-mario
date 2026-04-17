// ========== DADOS ==========
const CARDAPIO = {
  acompanhamentos: [
    "Arroz branco","Macarrão espaguete","Aipim com bacon","Nhoque","Purê de batata doce",
    "Feijão","Batata frita","Calabresa acebolada","Farofa","Batata palha"
  ],
  carnes: [
    "Língua bovina ao molho","Sassami à milanesa","Bife acebolado"
  ],
  saladas: [
    "Beterraba","Vinagrete","Cenoura","Chuchu","Pepino",
    "Alface","Repolho ralado","Tomate com pepino",
    "Maionese","Macarronese"
  ],
  sobremesas: [
    "Sagu com molho branco","Pudim de chocolate",
    "Pudim de morango","Pudim de baunilha","Manjar de coco"
  ]
};

const WHATSAPP_NUMBER = "554733752227"; // <-- Substitua pelo número real

let cart = [];
let selectedSize = 'media';
let selAcomp = [];
let selCarne = [];
let selSalada = [];

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
  // Versão flat para uso legado (cardapioDia se existir)
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

  // Versão organizada para a aba Cardápio do Dia
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

  // Caixinha do cardápio dentro da aba Marmitas
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
  div.innerHTML = '';
  items.forEach(item => {
    const chip = document.createElement('button');
    chip.className = 'item-chip';
    chip.textContent = item;
    chip.dataset.item = item;
    chip.dataset.type = type;
    chip.onclick = () => toggleItem(chip, type, item);
    div.appendChild(chip);
  });
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
    document.getElementById('acompCounter').textContent = `Selecionados: ${selAcomp.length} / 5`;
    if (selAcomp.length > 5) {
      document.getElementById('acompCounter').classList.add('warn');
    } else {
      document.getElementById('acompCounter').classList.remove('warn');
    }
  } else if (type === 'carne') {
    if (selCarne.includes(item)) {
      selCarne = selCarne.filter(i => i !== item);
      chip.classList.remove('selected-carne');
    } else {
      if (selCarne.length >= 3) { alert('Máximo de 3 pedaços de carne!'); return; }
      selCarne.push(item);
      chip.classList.add('selected-carne');
    }
    document.getElementById('carneCounter').textContent = `Selecionados: ${selCarne.length} / 3`;
  } else if (type === 'salada') {
    if (selSalada.includes(item)) {
      selSalada = selSalada.filter(i => i !== item);
      chip.classList.remove('selected-salada');
    } else {
      selSalada.push(item);
      chip.classList.add('selected-salada');
    }
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
  let base = selectedSize === 'media' ? 25 : 27;
  const extras = Math.max(0, selAcomp.length - 5);
  const total = base + (extras * 2);
  document.getElementById('precoPersonalizada').textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
}

let qtyPadrao = { media: 1, grande: 1 };

function changeQty(size, delta) {
  qtyPadrao[size] = Math.max(1, qtyPadrao[size] + delta);
  document.getElementById(size === 'media' ? 'qtyMedia' : 'qtyGrande').textContent = qtyPadrao[size];
}
function addPadrao(size) {
  const precoUnit = size === 'media' ? 25 : 27;
  const label = size === 'media' ? 'Média' : 'Grande';
  const qty = qtyPadrao[size];
  const carneDesc = CARDAPIO.carnes.map(c => `1x pedaço ${c}`).join(' / ');
  const desc = `Arroz branco, Feijão, Macarrão espaguete, Aipim com bacon, ${carneDesc}`;
  for (let i = 0; i < qty; i++) {
    cart.push({ tipo: `Marmita Padrão ${label}`, desc, preco: precoUnit });
  }
  // Resetar quantidade para 1
  qtyPadrao[size] = 1;
  document.getElementById(size === 'media' ? 'qtyMedia' : 'qtyGrande').textContent = '1';
  updateCart();
  toggleCart();
}

// ========== MARMITA PERSONALIZADA ==========
function addPersonalizada() {
  if (selAcomp.length === 0 && selCarne.length === 0) {
    alert('Selecione ao menos um item antes de adicionar!');
    return;
  }
  const base = selectedSize === 'media' ? 25 : 27;
  const extras = Math.max(0, selAcomp.length - 5);
  const preco = base + extras * 2;
  const label = selectedSize === 'media' ? 'Média' : 'Grande';

  // Formatar carnes
  const carnesDesc = selCarne.length > 0
    ? selCarne.map(c => `3x pedaços ${c}`).join(', ')
    : '';

  const acompDesc = selAcomp.length > 0 ? selAcomp.join(', ') : '';
  const saladaDesc = selSalada.length > 0 ? 'Salada: ' + selSalada.join(', ') : '';

  const parts = [acompDesc, carnesDesc, saladaDesc].filter(Boolean);

  cart.push({
    tipo: `Marmita Personalizada ${label}`,
    desc: parts.join(' | '),
    preco
  });

  updateCart();
  clearPersonalizada();
  toggleCart();
}

function clearPersonalizada() {
  selAcomp = [];
  selCarne = [];
  selSalada = [];
  buildGrids();
  document.getElementById('acompCounter').textContent = 'Selecionados: 0 / 5';
  document.getElementById('carneCounter').textContent = 'Selecionados: 0 / 3';
  document.getElementById('acompCounter').classList.remove('warn');
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
  panel.classList.toggle('open');
  overlay.classList.toggle('open');
}

// ========== WHATSAPP ==========
function enviarWhatsApp() {
  if (cart.length === 0) { alert('Carrinho vazio!'); return; }
  let msg = '🍽️ *Pedido — Restaurante do Mário*\n\n';
  let total = 0;
  cart.forEach((item, i) => {
    total += item.preco;
    msg += `*${i + 1}. ${item.tipo}*\n${item.desc}\nR$ ${item.preco.toFixed(2).replace('.', ',')}\n\n`;
  });
  msg += `💰 *Total: R$ ${total.toFixed(2).replace('.', ',')}*\n\n`;
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

// ========== INIT ==========
buildCardapio();
buildGrids();
updatePrecoPersonalizada();