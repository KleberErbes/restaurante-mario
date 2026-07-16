/**
 * Restaurante do Mário — Script Principal
 * Arquitetura: Modular com estado centralizado e DOM cache
 */

// ============ CONFIG ============
const CONFIG = {
  sheetsUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTU8-45F4IYTWaim8pMyNru3071eB87U0-oZy98g8796_m9BKLMJ8vetpfeZ9AOXYZ569vOkvzcfzBS/pub?output=tsv',
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbzk9p47SYi4t9HEotN6FmelyTwf3nuioTsDDbR2TdqvTX7NDldxmev7VxTgQpLS5A1E/exec',
  whatsappNumber: '554733752227',
  horario: { pedidos: { h: 8, m: 0 }, abertura: { h: 14, m: 0 }, fechamento: { h: 14, m: 0 } },
  cartExpireHours: 4,
  limits: { acompMax: 5, carneMax: 3, saladaMax: 3 }
};

// ============ STATE (centralizado) ============
const state = {
  cart: [],
  cardapio: { acompanhamentos: [], carnes: [], saladas: [], sobremesas: [] },
  cardapioAtualizado: '',
  diasFechados: [],
  personalizadaSel: { acomp: [], carne: {}, salada: [] },
  qtyPadrao: { media: 1, grande: 1 },
  qtyPersonalizada: 1,
  selectedSize: 'media'
};

// ============ DOM CACHE ============
const dom = {
  cartPanel: null,
  cartItems: null,
  cartCount: null,
  cartTotal: null,
  overlay: null,
  badgeHorario: null,
  avisoBalcao: null,
  modalNome: null,
  modalOverlay: null,
  inputNome: null,
  modalConfirm: null,
  modalConfirmOverlay: null,
  header: null,
  toastContainer: null,

  init() {
    this.cartPanel = document.getElementById('cartPanel');
    this.cartItems = document.getElementById('cartItems');
    this.cartCount = document.getElementById('cartCount');
    this.cartTotal = document.getElementById('cartTotal');
    this.overlay = document.getElementById('overlay');
    this.badgeHorario = document.getElementById('badgeHorario');
    this.avisoBalcao = document.getElementById('avisoBalcao');
    this.modalNome = document.getElementById('modalNome');
    this.modalOverlay = document.getElementById('modalOverlay');
    this.inputNome = document.getElementById('inputNomeCliente');
    this.modalConfirm = document.getElementById('modalConfirm');
    this.modalConfirmOverlay = document.getElementById('modalConfirmOverlay');
    this.header = document.querySelector('header');
  }
};

// ============ UTILS ============
const Utils = {
  gerarIdPedido() {
    return window.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  },

  parseDateBR(str) {
    const partes = str.trim().split('/');
    if (partes.length !== 3) return null;
    const [d, m, a] = partes;
    return d && m && a ? `${a.padStart(4,'0')}-${m.padStart(2,'0')}-${d.padStart(2,'0')}` : null;
  },

  formatPrice(value) {
    return `R$ ${value.toFixed(2).replace('.', ',')}`;
  },

  sanitizeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

// ============ UI MANAGER ============
const UI = {
  showToast(msg, tipo = 'info', duracao = 3000) {
    if (!dom.toastContainer) {
      dom.toastContainer = document.createElement('div');
      dom.toastContainer.id = 'toastContainer';
      document.body.appendChild(dom.toastContainer);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.textContent = msg;
    dom.toastContainer.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-show'));
    setTimeout(() => {
      toast.classList.remove('toast-show');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, duracao);
  },

  toggleOverlay(show) {
    dom.overlay.classList.toggle('open', show);
  },

  toggleCart(show) {
    const shouldOpen = show !== undefined ? show : !dom.cartPanel.classList.contains('open');
    dom.cartPanel.classList.toggle('open', shouldOpen);
    dom.overlay.classList.toggle('open', shouldOpen);
  },

  toggleModal(modalEl, overlayEl, show) {
    if (!modalEl || !overlayEl) return;
    const shouldOpen = show !== undefined ? show : !modalEl.classList.contains('open');
    modalEl.classList.toggle('open', shouldOpen);
    overlayEl.classList.toggle('open', shouldOpen);
    if (shouldOpen && modalEl === dom.modalNome) {
      setTimeout(() => dom.inputNome?.focus(), 100);
    }
  },

  updateCartUI() {
    dom.cartCount.textContent = state.cart.length;
    const container = dom.cartItems;

    if (state.cart.length === 0) {
      container.innerHTML = '<p class="cart-empty">Seu carrinho está vazio.</p>';
      dom.cartTotal.textContent = 'R$ 0,00';
      return;
    }

    container.innerHTML = '';
    let total = 0;
    let temAPesar = false;

    state.cart.forEach((item, i) => {
      total += item.preco;
      if (item.aPesar) temAPesar = true;

      const div = document.createElement('div');
      div.className = 'cart-item';
      const precoHTML = item.aPesar
        ? '<span class="cart-item-price-pesar">A pesar</span>'
        : `<div class="cart-item-price">${Utils.formatPrice(item.preco)}</div>`;

      div.innerHTML = `
        <div class="cart-item-title">${item.qty > 1 ? item.qty + 'x ' : ''}${item.tipo}</div>
        <div class="cart-item-desc">${item.desc}</div>
        ${precoHTML}
        <button class="remove-item" onclick="CartManager.removerItem(${i})" title="Remover" aria-label="Remover item do carrinho">✕</button>
      `;
      container.appendChild(div);
    });

    const totalEl = dom.cartTotal;
    if (temAPesar) {
      totalEl.innerHTML = `${Utils.formatPrice(total)} <span class="total-pesar-aviso">+ itens a pesar</span>`;
    } else {
      totalEl.textContent = Utils.formatPrice(total);
    }
  }
};

// ============ SCHEDULE MANAGER ============
const Schedule = {
  getEstado() {
    const agora = new Date();
    const partesBR = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(agora);

    const get = tipo => partesBR.find(p => p.type === tipo)?.value ?? '';
    const hora = parseInt(get('hour'), 10);
    const minuto = parseInt(get('minute'), 10);
    const dataHoje = `${get('year')}-${get('month')}-${get('day')}`;
    const dataBR = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const diaSem = dataBR.getDay();

    if (state.diasFechados.includes(dataHoje) || diaSem === 0) return 'fechado';

    const totalMin = hora * 60 + minuto;
    const { pedidos, abertura, fechamento } = CONFIG.horario;
    const inicioPedidos = pedidos.h * 60 + pedidos.m;
    const abre = abertura.h * 60 + abertura.m;
    const fecha = fechamento.h * 60 + fechamento.m;

    if (totalMin >= inicioPedidos && totalMin < abre) return 'pedidos';
    if (totalMin >= abre && totalMin < fecha) return 'aberto';
    return 'fechado';
  },

  isAberto() {
    return this.getEstado() === 'pedidos';
  },

  atualizarBadge() {
    if (!dom.badgeHorario) return;
    const estado = this.getEstado();
    const estadoMap = {
      aberto: { text: 'Aberto agora', class: 'badge-aberto' },
      pedidos: { text: 'Pedidos disponíveis', class: 'badge-pedidos' },
      fechado: { text: 'Fechado agora', class: 'badge-fechado' }
    };
    const { text, class: cls } = estadoMap[estado];
    dom.badgeHorario.textContent = text;
    dom.badgeHorario.className = `badge-horario ${cls}`;
  }
};

// ============ CARDÁPIO MANAGER ============
const CardapioManager = {
  async carrega() {
    this.mostrarSkeleton(true);
    try {
      const res = await fetch(CONFIG.sheetsUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const tsv = await res.text();
      state.cardapio = { acompanhamentos: [], carnes: [], saladas: [], sobremesas: [] };
      state.diasFechados = [];

      tsv.split('\n').slice(1).forEach(linha => {
        if (!linha.trim()) return;
        const [categoria, item] = linha.split('\t').map(s => (s || '').trim().replace(/"/g, ''));
        if (!item) return;

        const cat = categoria.toLowerCase();
        if (cat.includes('acomp')) state.cardapio.acompanhamentos.push(item);
        else if (cat.includes('carne')) state.cardapio.carnes.push(item);
        else if (cat.includes('salada')) state.cardapio.saladas.push(item);
        else if (cat.includes('sobremesa')) state.cardapio.sobremesas.push(item);
        else if (cat === 'fechado') {
          const iso = item.includes('/') ? Utils.parseDateBR(item) : item;
          if (iso) state.diasFechados.push(iso);
        }
        else if (cat === 'atualizado') state.cardapioAtualizado = item;
      });

      this.renderizar();
      this.mostrarSkeleton(false);
    } catch (e) {
      console.error('Erro ao carregar cardápio:', e);
      state.cardapio = {
        acompanhamentos: ["Arroz branco", "Feijão", "Macarrão espaguete", "Aipim com bacon"],
        carnes: ["Carne do dia"],
        saladas: ["Salada da casa"],
        sobremesas: ["Sobremesa do dia"]
      };
      this.renderizar();
      this.mostrarSkeleton(false);
      UI.showToast('Cardápio padrão carregado. Verifique sua conexão.', 'aviso', 5000);
    }
  },

  mostrarSkeleton(show) {
    document.querySelectorAll('.cardapio-box-list, .cpg-list').forEach(el => {
      if (show) {
        el.innerHTML = '<span class="skeleton-item"></span><span class="skeleton-item"></span><span class="skeleton-item"></span>';
      } else {
        el.querySelectorAll('.skeleton-item').forEach(s => s.remove());
      }
    });
  },

  renderizar() {
    this.renderCardapioVisao();
    this.renderGridsPedidos();
    this.atualizarPrecoPersonalizada();
    Schedule.atualizarBadge();
    this.mostrarSelo();
  },

  renderCardapioVisao() {
    const grupos = [
      { id: 'listaAcomp', items: state.cardapio.acompanhamentos, cls: 'tag-acomp' },
      { id: 'listaCarne', items: state.cardapio.carnes, cls: 'tag-carne' },
      { id: 'listaSalada', items: state.cardapio.saladas, cls: 'tag-salada' },
      { id: 'listaSobremesa', items: state.cardapio.sobremesas, cls: 'tag-sobremesa' },
    ];

    grupos.forEach(({ id, items, cls }) => {
      const div = document.getElementById(id);
      if (!div) return;
      div.innerHTML = '';
      if (!items.length) {
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
      { id: 'cpgAcomp', items: state.cardapio.acompanhamentos, cls: 'tag-acomp' },
      { id: 'cpgCarne', items: state.cardapio.carnes, cls: 'tag-carne' },
      { id: 'cpgSalada', items: state.cardapio.saladas, cls: 'tag-salada' },
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
  },

  renderGridsPedidos() {
    this.renderGrid('acompGrid', state.cardapio.acompanhamentos, 'acomp');
    this.renderGrid('carneGrid', state.cardapio.carnes, 'carne');
    this.renderGrid('saladaGrid', state.cardapio.saladas, 'salada');
  },

  renderGrid(containerId, items, type) {
    const div = document.getElementById(containerId);
    if (!div) return;
    div.innerHTML = '';

    items.forEach(item => {
      if (type === 'carne') {
        const card = this.criarCarneCard(item);
        div.appendChild(card);
      } else {
        const chip = document.createElement('button');
        chip.className = 'item-chip';
        chip.textContent = item;
        chip.dataset.item = item;
        chip.dataset.type = type;
        chip.onclick = () => PersonalizadaManager.toggleItem(chip, type, item);
        div.appendChild(chip);
      }
    });
  },

  criarCarneCard(item) {
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
    btnMinus.className = 'carne-btn';
    btnMinus.textContent = '−';
    btnMinus.onclick = (e) => { e.stopPropagation(); PersonalizadaManager.alterarCarne(item, -1); };

    const qty = document.createElement('span');
    qty.className = 'carne-qty';
    qty.textContent = '0';

    const btnPlus = document.createElement('button');
    btnPlus.className = 'carne-btn';
    btnPlus.textContent = '+';
    btnPlus.onclick = (e) => { e.stopPropagation(); PersonalizadaManager.alterarCarne(item, 1); };

    counter.appendChild(btnMinus);
    counter.appendChild(qty);
    counter.appendChild(btnPlus);
    card.appendChild(nome);
    card.appendChild(counter);
    card.onclick = () => PersonalizadaManager.alterarCarne(item, 1);
    return card;
  },

  atualizarPrecoPersonalizada() {
    PersonalizadaManager.atualizarPreco();
  },

  mostrarSelo() {
    const selo = document.getElementById('cardapioAtualizado');
    if (!selo) return;
    if (!state.cardapioAtualizado) {
      selo.hidden = true;
      return;
    }
    let dataBR = state.cardapioAtualizado;
    if (/^\d{4}-\d{2}-\d{2}/.test(state.cardapioAtualizado)) {
      const [a, m, d] = state.cardapioAtualizado.slice(0, 10).split('-');
      dataBR = `${d}/${m}/${a}`;
    }
    selo.textContent = `Cardápio atualizado em ${dataBR}`;
    selo.hidden = false;
  }
};

// ============ PERSONALIZADA MANAGER ============
const PersonalizadaManager = {
  alterarCarne(item, delta) {
    const atual = state.personalizadaSel.carne[item] || 0;
    const novo = Math.max(0, atual + delta);

    if (novo === 0) {
      delete state.personalizadaSel.carne[item];
    } else {
      state.personalizadaSel.carne[item] = novo;
    }
    this.atualizarUICarnes();
    this.atualizarPreco();
  },

  atualizarUICarnes() {
    const totalPedacos = Object.values(state.personalizadaSel.carne).reduce((a, b) => a + b, 0);
    const extras = Math.max(0, totalPedacos - CONFIG.limits.carneMax);
    const extraInfo = extras > 0 ? ` (+${extras} extra${extras > 1 ? 's' : ''} = +R$${extras * 4})` : '';
    const counter = document.getElementById('carneCounter');
    counter.textContent = `Selecionados: ${totalPedacos} pedaço${totalPedacos !== 1 ? 's' : ''}${extraInfo}`;
    counter.classList.toggle('warn', extras > 0);
  },

  toggleItem(chip, type, item) {
    const arr = type === 'acomp' ? state.personalizadaSel.acomp : state.personalizadaSel.salada;
    const maxLimit = type === 'acomp' ? CONFIG.limits.acompMax : CONFIG.limits.saladaMax;

    if (arr.includes(item)) {
      state.personalizadaSel[type === 'acomp' ? 'acomp' : 'salada'] = arr.filter(i => i !== item);
      chip.classList.remove(type === 'acomp' ? 'selected' : 'selected-salada');
    } else {
      if (arr.length >= maxLimit) {
        UI.showToast(`Máximo de ${maxLimit} itens!`, 'aviso');
        return;
      }
      arr.push(item);
      chip.classList.add(type === 'acomp' ? 'selected' : 'selected-salada');
    }
    this.atualizarUIItems(type);
    this.atualizarPreco();
  },

  atualizarUIItems(type) {
    if (type === 'acomp') {
      const extras = Math.max(0, state.personalizadaSel.acomp.length - CONFIG.limits.acompMax);
      const extraInfo = extras > 0 ? ` (+${extras} extra${extras > 1 ? 's' : ''} = +R$${extras * 4})` : '';
      document.getElementById('acompCounter').textContent = `Selecionados: ${state.personalizadaSel.acomp.length} / ${CONFIG.limits.acompMax}${extraInfo}`;
      document.getElementById('acompCounter').classList.toggle('warn', extras > 0);
    } else if (type === 'salada') {
      const priceExtra = state.personalizadaSel.salada.length > 0 ? ` (+R$${state.personalizadaSel.salada.length * 2})` : '';
      document.getElementById('saladaCounter').textContent = `Selecionadas: ${state.personalizadaSel.salada.length} / ${CONFIG.limits.saladaMax}${priceExtra}`;
    }
  },

  selecionarTamanho(size) {
    state.selectedSize = size;
    document.getElementById('sizeMedia').classList.toggle('selected', size === 'media');
    document.getElementById('sizeGrande').classList.toggle('selected', size === 'grande');
    this.atualizarPreco();
  },

  mudarQty(delta) {
    state.qtyPersonalizada = Math.max(1, state.qtyPersonalizada + delta);
    document.getElementById('qtyPersonalizada').textContent = state.qtyPersonalizada;
  },

  isModoPesar() {
    const totalPedacos = Object.values(state.personalizadaSel.carne).reduce((a, b) => a + b, 0);
    return !(state.personalizadaSel.acomp.length === 4 && totalPedacos === 3);
  },

  calcularBase(totalAcomp, totalPedacos, tamanho) {
    const offset = tamanho === 'grande' ? 2 : 0;
    const base = 26 + offset;
    const difAcomp = (totalAcomp - 4) * 2;
    const difCarne = (totalPedacos - 3) * 4;
    return base + difAcomp + difCarne;
  },

  atualizarPreco() {
    const totalPedacos = Object.values(state.personalizadaSel.carne).reduce((a, b) => a + b, 0);
    const el = document.getElementById('precoPersonalizada');
    const infoEl = document.getElementById('infoPesar');

    const nadaSelecionado = !state.personalizadaSel.acomp.length && !totalPedacos && !state.personalizadaSel.salada.length;

    if (nadaSelecionado) {
      el.textContent = 'R$ 0,00';
      el.classList.remove('preco-a-pesar');
      if (infoEl) infoEl.style.display = 'none';
      return;
    }

    if (this.isModoPesar()) {
      el.textContent = 'A pesar';
      el.classList.add('preco-a-pesar');
      if (infoEl) infoEl.style.display = 'block';
    } else {
      el.classList.remove('preco-a-pesar');
      if (infoEl) infoEl.style.display = 'none';
      const base = this.calcularBase(state.personalizadaSel.acomp.length, totalPedacos, state.selectedSize);
      const total = base + (state.personalizadaSel.salada.length * 2);
      el.textContent = Utils.formatPrice(total);
    }
  },

  limpar() {
    state.personalizadaSel = { acomp: [], carne: {}, salada: [] };
    state.qtyPersonalizada = 1;
    document.getElementById('qtyPersonalizada').textContent = '1';
    CardapioManager.renderGridsPedidos();
    document.getElementById('acompCounter').textContent = 'Selecionados: 0 / 5';
    document.getElementById('carneCounter').textContent = 'Selecionados: 0 pedaços';
    document.getElementById('saladaCounter').textContent = 'Selecionadas: 0 / 3';
    ['acompCounter', 'carneCounter'].forEach(id => document.getElementById(id).classList.remove('warn'));
    const obsP = document.getElementById('obsPersonalizada');
    if (obsP) obsP.value = '';
    this.atualizarPreco();
  }
};

// ============ CART MANAGER ============
const CartManager = {
  adicionarPadrao(size) {
    if (!Schedule.isAberto()) {
      const msg = Schedule.getEstado() === 'fechado'
        ? 'Estamos fechados'
        : 'Horário de pedidos encerrado! Aceitamos pedidos das 08h às 11h.';
      UI.showToast(msg, 'aviso', 5000);
      return;
    }

    const precoUnit = size === 'media' ? 26 : 28;
    const label = size === 'media' ? 'Média' : 'Grande';
    const qty = state.qtyPadrao[size];
    const obsId = size === 'media' ? 'obsMedia' : 'obsGrande';
    const obs = (document.getElementById(obsId)?.value || '').trim();
    const carnesOpcoes = state.cardapio.carnes.length > 0 ? state.cardapio.carnes.slice(0, 3) : ['Carne do dia'];

    const desc = this.montarDescricao({
      carnes: {}, acompanhamentos: [], saladas: [], obs,
      incluiFixos: true, carnesOpcoes, tamanho: label
    });

    state.cart.push({
      tipo: `Marmita ${label}`, desc, descPlanilha: desc,
      preco: precoUnit * qty, qty,
      composicao: { tipoPedido: 'padrao', tamanho: size, pesar: false }
    });

    this.salvarLocal();
    state.qtyPadrao[size] = 1;
    document.getElementById(size === 'media' ? 'qtyMedia' : 'qtyGrande').textContent = '1';
    document.getElementById(obsId).value = '';
    UI.updateCartUI();
    UI.showToast(`✅ ${qty > 1 ? qty + 'x ' : ''}Marmita ${label} adicionada!`, 'sucesso');
  },

  adicionarPersonalizada() {
    if (!Schedule.isAberto()) {
      const msg = Schedule.getEstado() === 'fechado'
        ? 'Estamos fechados'
        : 'Horário de pedidos encerrado! Aceitamos pedidos das 08h às 11h.';
      UI.showToast(msg, 'aviso', 5000);
      return;
    }

    const totalPedacos = Object.values(state.personalizadaSel.carne).reduce((a, b) => a + b, 0);
    if (!state.personalizadaSel.acomp.length && !totalPedacos && !state.personalizadaSel.salada.length) {
      UI.showToast('Selecione ao menos um item!', 'aviso');
      return;
    }

    const label = state.selectedSize === 'media' ? 'Média' : 'Grande';
    const pesar = PersonalizadaManager.isModoPesar();
    let preco = 0;

    if (!pesar) {
      const base = PersonalizadaManager.calcularBase(state.personalizadaSel.acomp.length, totalPedacos, state.selectedSize);
      preco = base + (state.personalizadaSel.salada.length * 2);
    }

    const obs = (document.getElementById('obsPersonalizada')?.value || '').trim();
    const descCompleta = this.montarDescricao({
      carnes: state.personalizadaSel.carne,
      acompanhamentos: state.personalizadaSel.acomp,
      saladas: state.personalizadaSel.salada,
      obs, incluiFixos: false
    });

    const qty = state.qtyPersonalizada;
    state.cart.push({
      tipo: `Marmita ${label}`, desc: descCompleta, descPlanilha: descCompleta,
      preco: pesar ? 0 : preco * qty, qty, aPesar: pesar,
      composicao: {
        tipoPedido: 'personalizada', tamanho: state.selectedSize, pesar,
        qtyAcomp: state.personalizadaSel.acomp.length,
        qtyCarnePedacos: totalPedacos,
        qtySalada: state.personalizadaSel.salada.length
      }
    });

    this.salvarLocal();
    UI.updateCartUI();
    PersonalizadaManager.limpar();
    UI.showToast(`✅ ${qty > 1 ? qty + 'x ' : ''}Marmita ${label} adicionada!`, 'sucesso');
  },

  montarDescricao({ carnes, acompanhamentos, saladas, obs, incluiFixos, carnesOpcoes }) {
    const partes = [];

    if (incluiFixos) {
      const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const ehSabado = hoje.getDay() === 6;
      let fixos = ['Arroz branco', 'Macarrão', 'Aipim com bacon', 'Feijão'];
      if (ehSabado) fixos = ['Lasanha de Frango', ...fixos];
      partes.push(fixos.join(', '));
      if (carnesOpcoes?.length > 0) {
        partes.push('Carnes: ' + carnesOpcoes.map(c => `1x ${c}`).join(', '));
      }
    } else {
      if (acompanhamentos.length > 0) {
        const ordenados = [...acompanhamentos].sort((a, b) =>
          state.cardapio.acompanhamentos.indexOf(a) - state.cardapio.acompanhamentos.indexOf(b)
        );
        partes.push(ordenados.join(', '));
      }
      if (Object.keys(carnes).length > 0) {
        partes.push('Carnes: ' + Object.entries(carnes).map(([c, q]) => `${q}x ${c}`).join(', '));
      }
    }

    if (saladas?.length > 0) partes.push('Salada: ' + saladas.join(', '));
    if (obs) partes.push(`⚠️ Obs: ${obs}`);

    return partes.join(' | ');
  },

  removerItem(i) {
    state.cart.splice(i, 1);
    this.salvarLocal();
    UI.updateCartUI();
  },

  salvarLocal() {
    try {
      localStorage.setItem('rdm_cart', JSON.stringify(state.cart));
      localStorage.setItem('rdm_cart_ts', Date.now().toString());
    } catch (e) {
      console.warn('localStorage indisponível:', e);
    }
  },

  carregarLocal() {
    try {
      const ts = parseInt(localStorage.getItem('rdm_cart_ts') || '0');
      if (Date.now() - ts > CONFIG.cartExpireHours * 60 * 60 * 1000) {
        localStorage.removeItem('rdm_cart');
        localStorage.removeItem('rdm_cart_ts');
        return;
      }
      const salvo = localStorage.getItem('rdm_cart');
      if (salvo) {
        const parsed = JSON.parse(salvo);
        if (Array.isArray(parsed) && parsed.every(i => i?.tipo && typeof i.preco === 'number')) {
          state.cart = parsed;
          UI.updateCartUI();
          if (state.cart.length > 0) {
            UI.showToast(`Você tem ${state.cart.length} item(ns) do seu último acesso!`, 'info', 4000);
          }
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar carrinho:', e);
    }
  },

  confirmarRemocao(i) {
    const item = state.cart[i];
    if (!item) return;
    abrirModalConfirm(
      'Remover item?',
      `Deseja remover <strong>${item.tipo}</strong> do carrinho?`,
      () => this.removerItem(i)
    );
  }
};

// ============ WHATSAPP / PEDIDO ============
const PedidoManager = {
  abrirModalNome() {
    if (state.cart.length === 0) {
      UI.showToast('Seu carrinho está vazio!', 'aviso');
      return;
    }
    if (!Schedule.isAberto()) {
      UI.showToast('Estamos fechados', 'aviso', 5000);
      return;
    }
    dom.inputNome.value = '';
    UI.toggleModal(dom.modalNome, dom.modalOverlay, true);
  },

  fecharModalNome() {
    UI.toggleModal(dom.modalNome, dom.modalOverlay, false);
  },

  confirmarPedido() {
    const nome = (dom.inputNome?.value || '').trim();
    if (!nome) {
      UI.showToast('Digite seu nome', 'aviso');
      dom.inputNome?.focus();
      return;
    }
    this.fecharModalNome();
    this.enviarWhatsApp(nome);
  },

  enviarWhatsApp(nomeCliente) {
    if (state.cart.length === 0) return;

    const total = state.cart.reduce((sum, item) => sum + item.preco, 0);
    const temAPesar = state.cart.some(item => item.aPesar);
    const pedidoId = Utils.gerarIdPedido();

    // Salvar no Drive (não-blocking)
    fetch(CONFIG.appsScriptUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        pedidoId, nomeCliente,
        itens: state.cart.map(item => ({
          tipo: item.tipo, desc: item.descPlanilha,
          preco: item.aPesar ? 'A pesar' : item.preco,
          qty: item.qty || 1,
          composicao: item.composicao || null
        })),
        total: temAPesar ? `${total.toFixed(2)} + itens a pesar` : total.toFixed(2),
        totalMarmitas: state.cart.reduce((sum, item) => sum + (item.qty || 1), 0)
      })
    }).catch(err => console.warn('Erro ao salvar:', err));

    // Montar mensagem WhatsApp
    const totalMarmitas = state.cart.reduce((sum, item) => sum + (item.qty || 1), 0);
    let msg = `*Pedido — Restaurante do Mário*\n`;
    msg += `*Cliente: ${nomeCliente}*\n`;
    msg += `*Total de marmitas: ${totalMarmitas}*\n\n`;
    state.cart.forEach((item, i) => {
      const prefixo = item.qty > 1 ? `${item.qty}x ` : '';
      const precoStr = item.aPesar ? 'A pesar' : Utils.formatPrice(item.preco);
      msg += `*${i + 1}. ${prefixo}${item.tipo}*\n${item.desc}\n${precoStr}\n\n`;
    });
    const totalStr = temAPesar
      ? `${Utils.formatPrice(total)} + itens a pesar`
      : Utils.formatPrice(total);
    msg += `*Total: ${totalStr}*\n`;

    state.cart = [];
    this.salvarLocal();
    UI.updateCartUI();

    const url = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  },

  salvarLocal() {
    CartManager.salvarLocal();
  }
};

// ============ MODAIS ============
function abrirModalConfirm(titulo, mensagem, onConfirm) {
  if (!dom.modalConfirm || !dom.modalConfirmOverlay) {
    onConfirm();
    return;
  }
  dom.modalConfirm.querySelector('.modal-confirm-title').textContent = titulo;
  dom.modalConfirm.querySelector('.modal-confirm-msg').innerHTML = mensagem;
  dom.modalConfirm.querySelector('.modal-confirm-ok').onclick = () => {
    fecharModalConfirm();
    onConfirm();
  };
  UI.toggleModal(dom.modalConfirm, dom.modalConfirmOverlay, true);
}

function fecharModalConfirm() {
  UI.toggleModal(dom.modalConfirm, dom.modalConfirmOverlay, false);
}

// ============ NAVEGAÇÃO ============
function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const headerHeight = dom.header?.offsetHeight || 120;
  const top = el.getBoundingClientRect().top + window.scrollY - headerHeight;
  window.scrollTo({ top, behavior: 'smooth' });
}

function atualizarNavAtiva() {
  const headerH = dom.header?.offsetHeight || 120;
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

  const pedidosEl = document.getElementById('pedidos');
  if (pedidosEl && dom.avisoBalcao) {
    const rect = pedidosEl.getBoundingClientRect();
    const visivel = rect.top < window.innerHeight && rect.bottom > headerH;
    dom.avisoBalcao.classList.toggle('visible', visivel);
  }
}

// ============ EXPOSIÇÃO GLOBAL (para onclick no HTML) ============
window.toggleCart = () => UI.toggleCart();
window.scrollToSection = scrollToSection;
window.changeQty = (size, delta) => {
  state.qtyPadrao[size] = Math.max(1, state.qtyPadrao[size] + delta);
  document.getElementById(size === 'media' ? 'qtyMedia' : 'qtyGrande').textContent = state.qtyPadrao[size];
};
window.changeQtyPersonalizada = (delta) => PersonalizadaManager.mudarQty(delta);
window.selectSize = (size) => PersonalizadaManager.selecionarTamanho(size);
window.addPadrao = (size) => CartManager.adicionarPadrao(size);
window.addPersonalizada = () => CartManager.adicionarPersonalizada();
window.abrirModalNome = () => PedidoManager.abrirModalNome();
window.fecharModalNome = () => PedidoManager.fecharModalNome();
window.confirmarPedido = () => PedidoManager.confirmarPedido();
window.confirmarRemocao = (i) => CartManager.confirmarRemocao(i);

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
  dom.init();
  CardapioManager.carrega();
  CartManager.carregarLocal();
  Schedule.atualizarBadge();
  setInterval(() => Schedule.atualizarBadge(), 60000);
  window.addEventListener('scroll', atualizarNavAtiva, { passive: true });
  window.addEventListener('load', atualizarNavAtiva);

  // Close cart on overlay click
  dom.overlay?.addEventListener('click', () => UI.toggleCart(false));
  dom.modalOverlay?.addEventListener('click', () => PedidoManager.fecharModalNome());
  dom.modalConfirmOverlay?.addEventListener('click', fecharModalConfirm);

  // Allow Enter key in name input
  dom.inputNome?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') PedidoManager.confirmarPedido();
  });
});
