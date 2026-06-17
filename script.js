// ========== GOOGLE SHEETS (Cardápio) — TSV para parsing robusto ==========
const SHEETS_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTU8-45F4IYTWaim8pMyNru3071eB87U0-oZy98g8796_m9BKLMJ8vetpfeZ9AOXYZ569vOkvzcfzBS/pub?output=tsv';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyFmzkXOJPdrAIrg5WFu-r91O8lZQbCvkGBzriRB-j7eSllrKPGYCeROAKI7zGixj4/exec';

const WHATSAPP_NUMBER = "554733752227";

// ========== CONFIGURAÇÃO DE HORÁRIO ==========
// Pedidos aceitos a partir das 08h00
const HORARIO_PEDIDOS    = { h: 8,  m: 0  };
// Buffet / atendimento presencial: 10h30
const HORARIO_ABERTURA   = { h: 10, m: 30  };
// Fechamento: 14h00
const HORARIO_FECHAMENTO = { h: 14, m: 0  };
// Fechamento dos pedidos de marmitas às 11h00
let HORARIO_FECHAMENTO_PEDIDOS = { h: 11, m: 0  };

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
// Usa sempre o fuso de Brasília (America/Sao_Paulo) para evitar erros
// se o cliente estiver em outro fuso horário.
// Retorna: 'fechado' | 'pedidos' | 'aberto'
function getEstado() {
  const agora = new Date();

  // Data e hora no fuso de Brasília
  const partesBR = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false
  }).formatToParts(agora);

  const get = (tipo) => partesBR.find(p => p.type === tipo)?.value ?? '';
  const hora    = parseInt(get('hour'),   10);
  const minuto  = parseInt(get('minute'), 10);
  const dataHoje = `${get('year')}-${get('month')}-${get('day')}`;

  // Dia da semana no fuso de Brasília (0 = domingo) — confiável em todos os navegadores
  const dataBR = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const diaSem = dataBR.getDay();

  // Verifica dias fechados especiais (formato AAAA-MM-DD)
  if (DIAS_FECHADOS_ESPECIAIS.includes(dataHoje)) return 'fechado';

  // Domingo sempre fechado (0 = domingo)
  if (diaSem === 0) return 'fechado';

  const totalMin           = hora * 60 + minuto;
  const inicioPedidos      = HORARIO_PEDIDOS.h           * 60 + HORARIO_PEDIDOS.m;
  const fechaPedidos       = HORARIO_FECHAMENTO_PEDIDOS.h * 60 + HORARIO_FECHAMENTO_PEDIDOS.m;
  const abre               = HORARIO_ABERTURA.h          * 60 + HORARIO_ABERTURA.m;
  const fechaBuffet        = HORARIO_FECHAMENTO.h        * 60 + HORARIO_FECHAMENTO.m;

  if (totalMin >= inicioPedidos && totalMin < fechaPedidos && totalMin < abre) return 'pedidos';
  if (totalMin >= abre          && totalMin < fechaBuffet)  return 'aberto';
  // Pedidos ainda abertos mesmo depois de abrir o buffet (se fechamento de pedidos > abertura buffet)
  if (totalMin >= inicioPedidos && totalMin < fechaPedidos) return 'pedidos';
  return 'fechado';
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
    badge.textContent = 'Aberto agora';
    badge.className = 'badge-horario badge-aberto';
  } else if (estado === 'pedidos') {
    badge.textContent = 'Pedidos disponíveis';
    badge.className = 'badge-horario badge-pedidos';
  } else {
    badge.textContent = 'Fechado agora';
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
  if (show) {
    document.querySelectorAll('.cardapio-box-list, .cpg-list').forEach(el => {
      el.innerHTML = '<span class="skeleton-item"></span><span class="skeleton-item"></span><span class="skeleton-item"></span>';
    });
  } else {
    document.querySelectorAll('.skeleton-item').forEach(el => el.remove());
  }
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

function isModoPesar() {
  const temAcomp  = selAcomp.length > 0;
  const totalPedacos = Object.values(selCarne).reduce((a, b) => a + b, 0);
  const temCarne  = totalPedacos > 0;
  const temSalada = selSalada.length > 0;
  // Unica combinacao com salada que NAO pesa: acomp + carne + salada (completo)
  if (temSalada && temAcomp && temCarne) return false;
  // Qualquer outra combinacao com salada -> pesar
  if (temSalada) return true;
  // Sem salada: pesar se for categoria isolada (so acomp ou so carne)
  const gruposSelecionados = [temAcomp, temCarne].filter(Boolean).length;
  return gruposSelecionados === 1;
}

function updatePrecoPersonalizada() {
  const totalPedacos = Object.values(selCarne).reduce((a, b) => a + b, 0);
  const el = document.getElementById('precoPersonalizada');
  const infoEl = document.getElementById('infoPesar');

  if (isModoPesar()) {
    el.textContent = 'A pesar';
    el.classList.add('preco-a-pesar');
    if (infoEl) infoEl.style.display = 'block';
  } else {
    el.classList.remove('preco-a-pesar');
    if (infoEl) infoEl.style.display = 'none';
    if (selAcomp.length === 0 && totalPedacos === 0 && selSalada.length === 0) {
      const base = selectedSize === 'media' ? (window._PRECO_MEDIA || 26) : (window._PRECO_GRANDE || 28);
      el.textContent = `R$ ${base.toFixed(2).replace('.', ',')}`;
    } else {
      const base = selectedSize === 'media' ? (window._PRECO_MEDIA || 26) : (window._PRECO_GRANDE || 28);
      const extrasAcomp = Math.max(0, selAcomp.length - 5);
      const extrasCarne = Math.max(0, totalPedacos - 3);
      const total = base + (extrasAcomp * 4) + (extrasCarne * 4) + (selSalada.length * 2);
      el.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
    }
  }
}

let qtyPadrao = { media: 1, grande: 1 };
let qtyPersonalizada = 1;

function changeQtyPersonalizada(delta) {
  qtyPersonalizada = Math.max(1, qtyPersonalizada + delta);
  document.getElementById('qtyPersonalizada').textContent = qtyPersonalizada;
}

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
  const precoUnit = (size === 'media' ? (window._PRECO_MEDIA || 26) : (window._PRECO_GRANDE || 28));
  const label = size === 'media' ? 'Média' : 'Grande';
  const qty = qtyPadrao[size];
  const obsId = size === 'media' ? 'obsMedia' : 'obsGrande';
  const obs = document.getElementById(obsId).value.trim();

  // Lista as 3 primeiras carnes do cardápio (ou menos, se houver menos de 3)
  const carnesOpcoes = CARDAPIO.carnes.length > 0 ? CARDAPIO.carnes.slice(0, 3) : ['Carne do dia'];
  const carneDesc = `3 pedaços — ${carnesOpcoes.join(' / ')}`;

  // Itens fixos do buffet padrão, ordenados conforme a sequência do buffet
  const itensPadrao = ordenarItensPorBuffet(['Arroz branco', 'Feijão', 'Macarrão', 'Aipim com bacon']);
  const descBase = `${itensPadrao.join(' / ')} | ${carneDesc}`;
  const desc = obs ? `${descBase} | ⚠️ Obs: ${obs}` : descBase;
  const descPlanilha = obs ? `${descBase} | ⚠️ Obs: ${obs}` : descBase;

  // Agrupa todas as unidades em um único item com quantidade
  cart.push({ tipo: `Marmita Padrão ${label}`, desc, descPlanilha, preco: precoUnit * qty, qty });

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
    showToast('Selecione ao menos um item para montar sua marmita!', 'aviso');
    return;
  }

  const label = selectedSize === 'media' ? 'Média' : 'Grande';
  const pesar = isModoPesar();

  let preco;
  if (pesar) {
    preco = 0; // preço definido no restaurante na balança
  } else {
    const base = selectedSize === 'media' ? (window._PRECO_MEDIA || 26) : (window._PRECO_GRANDE || 28);
    const extrasAcomp = Math.max(0, selAcomp.length - 5);
    const extrasCarne = Math.max(0, totalPedacos - 3);
    preco = base + (extrasAcomp * 4) + (extrasCarne * 4) + (selSalada.length * 2);
  }

  const carnesDesc  = totalPedacos > 0 ? Object.entries(selCarne).map(([c,q]) => `${q}x ${c}`).join(' / ') : '';
  const acompOrdenado = ordenarItensPorBuffet(selAcomp);
  const acompDesc   = acompOrdenado.length > 0 ? acompOrdenado.join(' / ') : '';
  const saladaDesc  = selSalada.length > 0 ? 'Salada: ' + selSalada.join(' / ') : '';
  const obs = document.getElementById('obsPersonalizada') ? document.getElementById('obsPersonalizada').value.trim() : '';
  const descCompleta = [acompDesc, carnesDesc ? `Carnes: ${carnesDesc}` : '', saladaDesc, obs ? `⚠️ Obs: ${obs}` : ''].filter(Boolean).join(' | ');
  const qty = qtyPersonalizada;

  cart.push({ tipo: `Marmita Personalizada ${label}`, desc: descCompleta, descPlanilha: descCompleta, preco: preco * qty, qty, aPesar: pesar });

  salvarCarrinhoLocal();
  updateCart();
  clearPersonalizada();
  showToast(`✅ ${qty > 1 ? qty + 'x ' : ''}Marmita Personalizada ${label} adicionada!`, 'sucesso');
}

function clearPersonalizada() {
  selAcomp = []; selCarne = {}; selSalada = [];
  qtyPersonalizada = 1;
  const qtyEl = document.getElementById('qtyPersonalizada');
  if (qtyEl) qtyEl.textContent = '1';
  buildGrids();
  document.getElementById('acompCounter').textContent  = 'Selecionados: 0 / 5';
  document.getElementById('carneCounter').textContent  = 'Selecionados: 0 pedaços';
  document.getElementById('saladaCounter').textContent = 'Selecionadas: 0 / 3';
  document.getElementById('acompCounter').classList.remove('warn');
  document.getElementById('carneCounter').classList.remove('warn');
  const obsP = document.getElementById('obsPersonalizada');
  if (obsP) obsP.value = '';
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
  let temAPesar = false;
  cart.forEach((item, i) => {
    total += item.preco;
    if (item.aPesar) temAPesar = true;
    const div = document.createElement('div');
    div.className = 'cart-item';
    const precoExibido = item.aPesar
      ? `<span class="cart-item-price-pesar">A pesar</span>`
      : `<div class="cart-item-price">R$ ${item.preco.toFixed(2).replace('.', ',')}</div>`;
    div.innerHTML = `
      <div class="cart-item-title">${item.qty > 1 ? item.qty + 'x ' : ''}${item.tipo}</div>
      <div class="cart-item-desc">${item.desc}</div>
      ${precoExibido}
      <button class="remove-item" onclick="confirmarRemocao(${i})" title="Remover">✕</button>
    `;
    container.appendChild(div);
  });

  const totalEl = document.getElementById('cartTotal');
  if (temAPesar) {
    totalEl.innerHTML = `R$ ${total.toFixed(2).replace('.', ',')} <span class="total-pesar-aviso">+ itens a pesar</span>`;
  } else {
    totalEl.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
  }
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
      const parsed = JSON.parse(salvo);
      // Valida estrutura mínima esperada de cada item
      if (Array.isArray(parsed) && parsed.every(i => i && typeof i.tipo === 'string' && typeof i.preco === 'number')) {
        cart = parsed;
        updateCart();
        if (cart.length > 0) showToast(`Você tem ${cart.length} item(ns) do seu último acesso!`, 'info', 4000);
      } else {
        localStorage.removeItem('rdm_cart');
        localStorage.removeItem('rdm_cart_ts');
      }
    }
  } catch(e) {
    localStorage.removeItem('rdm_cart');
    localStorage.removeItem('rdm_cart_ts');
  }
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
  if (cart.length === 0) { showToast('Seu carrinho está vazio!', 'aviso'); return; }
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

// ========== ORDENAÇÃO DOS ITENS CONFORME O BUFFET ==========
// Ordem fixa do buffet: arroz/macarrão/aipim → acompanhamento do dia → feijão →
// farofa/batata palha → sopa (se houver) → carnes → demais acompanhamentos/saladas
const ORDEM_BUFFET = [
  'arroz',
  'macarrão', 'macarrao',
  'aipim',
  'feijão', 'feijao',
  'farofa',
  'batata palha',
  'sopa',
];

function ordenarItensPorBuffet(itens) {
  // Retorna o índice de prioridade de um item conforme a ordem do buffet
  function prioridade(nome) {
    const lower = nome.toLowerCase();
    // Arroz primeiro
    if (lower.includes('arroz')) return 0;
    // Macarrão
    if (lower.includes('macarr')) return 1;
    // Aipim / mandioca
    if (lower.includes('aipim') || lower.includes('mandioca')) return 2;
    // Acompanhamento genérico do dia (não é feijão, farofa, batata palha, sopa, carne, salada)
    if (!lower.includes('feij') && !lower.includes('farofa') && !lower.includes('batata palha') &&
        !lower.includes('sopa') && !lower.includes('salada')) return 3;
    // Feijão
    if (lower.includes('feij')) return 4;
    // Farofa
    if (lower.includes('farofa')) return 5;
    // Batata palha
    if (lower.includes('batata palha')) return 6;
    // Sopa
    if (lower.includes('sopa')) return 7;
    // Salada e demais ficam no final
    if (lower.includes('salada')) return 9;
    return 8;
  }
  return [...itens].sort((a, b) => prioridade(a) - prioridade(b));
}

// ========== WHATSAPP + GOOGLE DRIVE ==========
function enviarWhatsApp(nomeCliente) {
  if (cart.length === 0) { showToast('Carrinho vazio!', 'aviso'); return; }

  const total = cart.reduce((sum, item) => sum + item.preco, 0);
  const temAPesar = cart.some(item => item.aPesar);

  fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({
      nomeCliente,
      itens: cart.map(item => ({ tipo: item.tipo, desc: item.descPlanilha, preco: item.aPesar ? 'A pesar' : item.preco, qty: item.qty || 1 })),
      total: temAPesar ? `${total.toFixed(2)} + itens a pesar` : total.toFixed(2),
      totalMarmitas: cart.reduce((sum, item) => sum + (item.qty || 1), 0)
    })
  }).catch(err => console.warn('Erro ao salvar no Drive:', err));

  const totalMarmitas = cart.reduce((sum, item) => sum + (item.qty || 1), 0);
  let msg = `*Pedido — Restaurante do Mário*\n`;
  msg += `*Cliente: ${nomeCliente}*\n`;
  msg += `*Total de marmitas: ${totalMarmitas}*\n\n`;
  cart.forEach((item, i) => {
    const prefixo = item.qty > 1 ? `${item.qty}x ` : '';
    const precoStr = item.aPesar ? 'A pesar' : `R$ ${item.preco.toFixed(2).replace('.', ',')}`;
    msg += `*${i + 1}. ${prefixo}${item.tipo}*\n${item.desc}\n${precoStr}\n\n`;
  });
  const totalStr = temAPesar
    ? `R$ ${total.toFixed(2).replace('.', ',')} + itens a pesar`
    : `R$ ${total.toFixed(2).replace('.', ',')}`;
  msg += `*Total: ${totalStr}*\n`;

  // Limpa carrinho após envio
  cart = [];
  salvarCarrinhoLocal();
  updateCart();

  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}
    // ===== SCROLL SUAVE PARA SEÇÕES =====
    function scrollToSection(id) {
      const el = document.getElementById(id);
      if (!el) return;
      // Calcula a posição levando em conta o header fixo
      const headerHeight = document.querySelector('header').offsetHeight;
      const top = el.getBoundingClientRect().top + window.scrollY - headerHeight;
      window.scrollTo({ top, behavior: 'smooth' });
    }

    // ===== DESTACA BOTÃO DA NAV CONFORME SEÇÃO VISÍVEL =====
    function atualizarNavAtiva() {
      const headerH = document.querySelector('header').offsetHeight;
      const secoes = [
        { id: 'inicio', navIdx: 0 },
        { id: 'cardapio-dia-sec', navIdx: 1 },
        { id: 'pedidos', navIdx: 2 },
        { id: 'localizacao', navIdx: 3 },
      ];

      let ativa = 0;
      secoes.forEach(({ id, navIdx }) => {
        const el = document.getElementById(id);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.top <= headerH + 10) ativa = navIdx;
      });

      document.querySelectorAll('nav button').forEach((btn, i) => {
        btn.classList.toggle('active', i === ativa);
      });

      // Mostra/esconde aviso balcão conforme seção marmitas visível
      const pedidosEl = document.getElementById('pedidos');
      const aviso = document.getElementById('avisoBalcao');
      if (pedidosEl && aviso) {
        const rect = pedidosEl.getBoundingClientRect();
        const visivel = rect.top < window.innerHeight && rect.bottom > headerH;
        aviso.classList.toggle('visible', visivel);
      }
    }

    window.addEventListener('scroll', atualizarNavAtiva, { passive: true });
    window.addEventListener('load', atualizarNavAtiva);

    // ===== SUBSTITUI as funções de navegação original =====
    // (goToMarmitas e goToCardapio redirecionam para scroll)
    function goToMarmitas() { scrollToSection('pedidos'); }
    function goToCardapio() { scrollToSection('cardapio-dia-sec'); }

    // showSection original usava display:none — sobrescrevemos para só rolar
    function showSection(id) { scrollToSection(id); }


// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
  carregarCardapio();
  carregarCarrinhoLocal();
  carregarConfigsDaPlanilha(); // Carrega configs salvas (horários, preços) para todos
  atualizarBadgeHorario();
  setInterval(atualizarBadgeHorario, 60000);
  adminRegistrarAtalho(); // Registra Ctrl+Shift+P para abrir admin
});
// ========== PAINEL ADMIN ==========
// ALTERE ESTA SENHA antes de publicar o site
const ADMIN_SENHA = 'mario1997';

let adminAutenticado = false;

// Registra o atalho de teclado Ctrl+Shift+P para abrir o painel admin
function adminRegistrarAtalho() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'P') {
      e.preventDefault(); // Evita conflito com atalhos do navegador
      adminAbrirSenha();
    }
  });
}

// Abre o modal de senha
function adminAbrirSenha() {
  document.getElementById('adminSenhaOverlay').classList.add('open');
  document.getElementById('adminSenhaModal').classList.add('open');
  document.getElementById('adminSenhaErro').style.display = 'none';
  document.getElementById('adminSenhaInput').value = '';
  setTimeout(() => document.getElementById('adminSenhaInput').focus(), 100);
}

function adminFecharSenha() {
  document.getElementById('adminSenhaOverlay').classList.remove('open');
  document.getElementById('adminSenhaModal').classList.remove('open');
}

// Verifica a senha e abre o painel
function adminVerificarSenha() {
  const senha = document.getElementById('adminSenhaInput').value;
  if (senha === ADMIN_SENHA) {
    adminAutenticado = true;
    adminFecharSenha();
    adminAbrirPainel();
  } else {
    document.getElementById('adminSenhaErro').style.display = 'block';
    document.getElementById('adminSenhaInput').value = '';
    document.getElementById('adminSenhaInput').focus();
  }
}

// Abre o painel principal
function adminAbrirPainel() {
  if (!adminAutenticado) return;
  document.getElementById('adminOverlay').classList.add('open');
  document.getElementById('adminPanel').classList.add('open');
  document.getElementById('adminLoadingMsg').style.display = 'block';
  document.getElementById('adminContent').style.display = 'none';
  adminCarregarConfigs();
}

function adminFechar() {
  document.getElementById('adminOverlay').classList.remove('open');
  document.getElementById('adminPanel').classList.remove('open');
}

// Fecha o painel ao clicar no overlay
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('adminOverlay').addEventListener('click', adminFechar);
});

// Preenche os campos do painel com um objeto de config
function adminPreencherCampos(cfg) {
  document.getElementById('cfgHorarioPedidos').value          = cfg.horarioPedidos          || `${String(HORARIO_PEDIDOS.h).padStart(2,'0')}:${String(HORARIO_PEDIDOS.m).padStart(2,'0')}`;
  document.getElementById('cfgHorarioFechamentoPedidos').value = cfg.horarioFechamentoPedidos || `${String(HORARIO_FECHAMENTO_PEDIDOS.h).padStart(2,'0')}:${String(HORARIO_FECHAMENTO_PEDIDOS.m).padStart(2,'0')}`;
  document.getElementById('cfgHorarioAbertura').value          = cfg.horarioAbertura          || `${String(HORARIO_ABERTURA.h).padStart(2,'0')}:${String(HORARIO_ABERTURA.m).padStart(2,'0')}`;
  document.getElementById('cfgHorarioFechamento').value        = cfg.horarioFechamento        || `${String(HORARIO_FECHAMENTO.h).padStart(2,'0')}:${String(HORARIO_FECHAMENTO.m).padStart(2,'0')}`;
  document.getElementById('cfgPrecoMedia').value        = cfg.precoMedia        || '26.00';
  document.getElementById('cfgPrecoGrande').value       = cfg.precoGrande       || '28.00';
  document.getElementById('cfgPrecoBuffetSemana').value = cfg.precoBuffetSemana || '39.00';
  document.getElementById('cfgPrecoBuffetSabado').value = cfg.precoBuffetSabado || '42.00';
  document.getElementById('cfgDiasFechados').value      = cfg.diasFechados      || DIAS_FECHADOS_ESPECIAIS.join('\n');
  document.getElementById('adminLoadingMsg').style.display = 'none';
  document.getElementById('adminContent').style.display   = 'block';
}

// Carrega as configs da planilha — abre o painel mesmo se falhar
async function adminCarregarConfigs() {
  // Mostra o painel imediatamente com os valores atuais do site
  // para não travar caso a planilha demore ou falhe
  adminPreencherCampos({});

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s máximo
    const res = await fetch(`${APPS_SCRIPT_URL}?acao=lerConfig`, { signal: controller.signal });
    clearTimeout(timeout);
    const cfg = await res.json();
    // Sobrescreve com os valores da planilha se a leitura funcionou
    if (cfg && typeof cfg === 'object' && !cfg.error) {
      adminPreencherCampos(cfg);
    }
  } catch (e) {
    // Silencioso — os valores padrão já estão preenchidos acima
  }
}

// Salva as configs na planilha e aplica no site
async function adminSalvar() {
  const btn = document.getElementById('adminBtnSalvar');
  const salvoMsg = document.getElementById('adminSalvoMsg');
  const erroMsg  = document.getElementById('adminErroMsg');
  salvoMsg.style.display = 'none';
  erroMsg.style.display  = 'none';

  const horarioPedidos           = document.getElementById('cfgHorarioPedidos').value;
  const horarioFechamentoPedidos = document.getElementById('cfgHorarioFechamentoPedidos').value;
  const horarioAbertura          = document.getElementById('cfgHorarioAbertura').value;
  const horarioFechamento        = document.getElementById('cfgHorarioFechamento').value;
  const precoMedia        = parseFloat(document.getElementById('cfgPrecoMedia').value) || 26;
  const precoGrande       = parseFloat(document.getElementById('cfgPrecoGrande').value) || 28;
  const precoBuffetSemana = parseFloat(document.getElementById('cfgPrecoBuffetSemana').value) || 39;
  const precoBuffetSabado = parseFloat(document.getElementById('cfgPrecoBuffetSabado').value) || 42;
  const diasFechados      = document.getElementById('cfgDiasFechados').value.trim();

  const payload = {
    acao: 'salvarConfig',
    horarioPedidos,
    horarioFechamentoPedidos,
    horarioAbertura,
    horarioFechamento,
    precoMedia,
    precoGrande,
    precoBuffetSemana,
    precoBuffetSabado,
    diasFechados
  };

  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    });

    // Aplica as configs imediatamente no site
    window._adminMostrarToast = true;
    adminAplicarConfigs({ horarioPedidos, horarioFechamentoPedidos, horarioAbertura, horarioFechamento, precoMedia, precoGrande, precoBuffetSemana, precoBuffetSabado, diasFechados });

    salvoMsg.style.display = 'block';
    setTimeout(() => salvoMsg.style.display = 'none', 4000);
  } catch (e) {
    erroMsg.style.display = 'block';
    setTimeout(() => erroMsg.style.display = 'none', 4000);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salvar Configurações';
  }
}

// Aplica as configs dinamicamente no site (sem precisar recarregar)
function adminAplicarConfigs(cfg) {
  // Horários
  const [ph, pm]   = cfg.horarioPedidos.split(':').map(Number);
  const [fph, fpm] = (cfg.horarioFechamentoPedidos || cfg.horarioFechamento || '14:00').split(':').map(Number);
  const [ah, am]   = cfg.horarioAbertura.split(':').map(Number);
  const [fh, fm]   = cfg.horarioFechamento.split(':').map(Number);
  HORARIO_PEDIDOS.h              = ph;  HORARIO_PEDIDOS.m              = pm;
  HORARIO_FECHAMENTO_PEDIDOS.h   = fph; HORARIO_FECHAMENTO_PEDIDOS.m   = fpm;
  HORARIO_ABERTURA.h             = ah;  HORARIO_ABERTURA.m             = am;
  HORARIO_FECHAMENTO.h           = fh;  HORARIO_FECHAMENTO.m           = fm;
  atualizarBadgeHorario();

  // Atualiza textos de horario visiveis nos cards da pagina
  function fmtH(h, m) { return h + "h" + (m > 0 ? String(m).padStart(2,"0") : "00"); }
  const txtBuffet  = fmtH(ah, am) + " às " + fmtH(fh, fm);
  const txtPedidos = fmtH(ph, pm) + " até as " + fmtH(fph, fpm);
  const elBuffet  = document.getElementById("textoHorarioBuffet");
  const elPedidos = document.getElementById("textoHorarioPedidos");
  const elLoc     = document.getElementById("textoHorarioLocalizacao");
  if (elBuffet)  elBuffet.textContent  = txtBuffet;
  if (elPedidos) elPedidos.textContent = txtPedidos;
  if (elLoc)     elLoc.textContent     = "Segunda a Sábado · " + txtBuffet;

  // Preços das marmitas
  const precoMedia   = parseFloat(cfg.precoMedia)   || 26;
  const precoGrande  = parseFloat(cfg.precoGrande)  || 28;

  // Atualiza os cards de preço na página
  const priceTagMedia  = document.querySelector('.marmita-card:nth-child(1) .price-tag');
  const priceTagGrande = document.querySelector('.marmita-card:nth-child(2) .price-tag');
  if (priceTagMedia)  priceTagMedia.textContent  = `R$ ${precoMedia.toFixed(2).replace('.', ',')}`;
  if (priceTagGrande) priceTagGrande.textContent = `R$ ${precoGrande.toFixed(2).replace('.', ',')}`;

  // Atualiza botões de tamanho na personalizada
  const btnMedia  = document.getElementById('sizeMedia');
  const btnGrande = document.getElementById('sizeGrande');
  if (btnMedia)  btnMedia.querySelector('small').textContent  = `R$ ${precoMedia.toFixed(2).replace('.', ',')}`;
  if (btnGrande) btnGrande.querySelector('small').textContent = `R$ ${precoGrande.toFixed(2).replace('.', ',')}`;

  // Preços do buffet
  const precoBuffetSemana = parseFloat(cfg.precoBuffetSemana) || 39;
  const precoBuffetSabado = parseFloat(cfg.precoBuffetSabado) || 42;
  const buffetCards = document.querySelectorAll('.buffet-card .buffet-price');
  if (buffetCards[0]) buffetCards[0].innerHTML = `<span>R$</span> ${precoBuffetSemana.toFixed(2).replace('.', ',')}`;
  if (buffetCards[1]) buffetCards[1].innerHTML = `<span>R$</span> ${precoBuffetSabado.toFixed(2).replace('.', ',')}`;

  // Dias fechados
  DIAS_FECHADOS_ESPECIAIS = (cfg.diasFechados || '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.includes('/') ? parseDateBR(s) : s)
    .filter(Boolean);

  // Atualiza o preço nas variáveis internas (para cálculo do carrinho)
  // Sobrescreve as funções de preço base
  window._PRECO_MEDIA  = precoMedia;
  window._PRECO_GRANDE = precoGrande;

  if (window._adminMostrarToast) showToast('✅ Configurações aplicadas!', 'sucesso', 3000);
}

// Carrega as configs da planilha ao iniciar o site (para todos os visitantes)
async function carregarConfigsDaPlanilha() {
  try {
    const url = `${APPS_SCRIPT_URL}?acao=lerConfig`;
    const res = await fetch(url);
    const cfg = await res.json();
    if (cfg && cfg.horarioPedidos) {
      window._adminMostrarToast = false;
      adminAplicarConfigs(cfg);
    }
  } catch (e) {
    // Silencioso — usa os valores padrão do código
  }
}