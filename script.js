/**
 * Restaurante do Mário — Script Principal
 * Arquitetura: Modular com estado centralizado e DOM cache
 */

// ============ CONFIG ============
const CONFIG = {
  // Cardápio: vem do Supabase. A anon key é pública por design — ela só
  // permite ler o cardápio e criar pedido, nada mais.
  supabaseUrl: 'https://kjbwnesvygisuwvoveli.supabase.co',
  supabaseKey: 'COLE_A_ANON_KEY_AQUI',
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbzk9p47SYi4t9HEotN6FmelyTwf3nuioTsDDbR2TdqvTX7NDldxmev7VxTgQpLS5A1E/exec',
  whatsappNumber: '554733752227',
  horario: { pedidos: { h: 8, m: 0 }, abertura: { h: 14, m: 0 }, fechamento: { h: 14, m: 0 } },
  cartExpireHours: 4,
  limits: { acompMax: 6, carneMax: 3, saladaMax: 3 }
};

// window.supabase é a BIBLIOTECA; sbCardapio é o CLIENTE.
const sbCardapio = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

// ============ STATE (centralizado) ============
const state = {
  cart: [],
  cardapio: { acompanhamentos: [], carnes: [], saladas: [], sobremesas: [] },
  cardapioAtualizado: '',
  diasFechados: [],
  personalizadaSel: { acomp: [], carne: {}, salada: [] },
  // Fluxo único de montagem (espelha o balcão)
  pedido: {
    tipo: 'padrao-media',   // padrao-media | padrao-grande | pers-media | pers-grande
    qty: 1
  }
};

// ============ DOM CACHE ============
const dom = {
  cartPanel: null,
  cartItems: null,
  cartCount: null,
  cartTotal: null,
  cartBtn: null,
  btnIrCarrinho: null,
  btnIrCarrinhoCount: null,
  overlay: null,
  badgeHorario: null,
  avisoBalcao: null,
  modalNome: null,
  modalOverlay: null,
  inputNome: null,
  modalConfirm: null,
  modalConfirmOverlay: null,
  modalAjuda: null,
  modalAjudaOverlay: null,
  header: null,
  toastContainer: null,

  init() {
    this.cartPanel = document.getElementById('cartPanel');
    this.cartItems = document.getElementById('cartItems');
    this.cartCount = document.getElementById('cartCount');
    this.cartBtn = document.querySelector('.cart-btn');
    this.btnIrCarrinho = document.getElementById('btnIrCarrinho');
    this.btnIrCarrinhoCount = document.getElementById('btnIrCarrinhoCount');
    this.cartTotal = document.getElementById('cartTotal');
    this.overlay = document.getElementById('overlay');
    this.badgeHorario = document.getElementById('badgeHorario');
    this.avisoBalcao = document.getElementById('avisoBalcao');
    this.modalNome = document.getElementById('modalNome');
    this.modalOverlay = document.getElementById('modalOverlay');
    this.inputNome = document.getElementById('inputNomeCliente');
    this.modalConfirm = document.getElementById('modalConfirm');
    this.modalConfirmOverlay = document.getElementById('modalConfirmOverlay');
    this.modalAjuda = document.getElementById('modalAjuda');
    this.modalAjudaOverlay = document.getElementById('modalAjudaOverlay');
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

  // Mostra o atalho "Ir ao carrinho" apenas quando há algo dentro
  sincronizarBotaoIrCarrinho() {
    if (!dom.btnIrCarrinho) return;
    const n = state.cart.length;
    dom.btnIrCarrinho.hidden = n === 0;
    if (dom.btnIrCarrinhoCount) dom.btnIrCarrinhoCount.textContent = n;
  },

  /* Animação de "foi pro carrinho": um chip sai do botão adicionar,
     voa até o carrinho do cabeçalho e o carrinho dá uma pulsada.
     Respeita prefers-reduced-motion (nesse caso só pulsa o carrinho). */
  animarParaCarrinho() {
    const destino = dom.cartBtn;
    if (!destino) return;

    const pulsar = () => {
      destino.classList.remove('cart-pulse');
      void destino.offsetWidth;              // força reinício da animação
      destino.classList.add('cart-pulse');
      dom.cartCount?.classList.remove('cart-count-bump');
      void dom.cartCount?.offsetWidth;
      dom.cartCount?.classList.add('cart-count-bump');
      setTimeout(() => {
        destino.classList.remove('cart-pulse');
        dom.cartCount?.classList.remove('cart-count-bump');
      }, 650);
    };

    const semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const origemEl = document.getElementById('btnAdicionar');
    if (semMovimento || !origemEl) { pulsar(); return; }

    const origem = origemEl.getBoundingClientRect();
    const alvo = destino.getBoundingClientRect();

    const chip = document.createElement('span');
    chip.className = 'voo-carrinho';
    chip.setAttribute('aria-hidden', 'true');
    chip.style.left = (origem.left + origem.width / 2) + 'px';
    chip.style.top = (origem.top + origem.height / 2) + 'px';
    chip.style.setProperty('--dx', (alvo.left + alvo.width / 2 - origem.left - origem.width / 2) + 'px');
    chip.style.setProperty('--dy', (alvo.top + alvo.height / 2 - origem.top - origem.height / 2) + 'px');
    document.body.appendChild(chip);

    chip.addEventListener('animationend', () => { chip.remove(); pulsar(); }, { once: true });
    setTimeout(() => { if (chip.isConnected) { chip.remove(); pulsar(); } }, 900);
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
    this.sincronizarBotaoIrCarrinho();
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

      const nomeHTML = item.nome
        ? `<span class="cart-item-nome">${Utils.sanitizeHTML(item.nome)}</span>`
        : '';

      div.innerHTML = `
        <div class="cart-item-title">${item.qty > 1 ? item.qty + 'x ' : ''}${item.tipo}${nomeHTML}</div>
        <div class="cart-item-desc">${item.desc}</div>
        ${precoHTML}
        <button class="remove-item" onclick="CartManager.removerItem(${i})" title="Remover" aria-label="Remover item do carrinho">✕</button>
      `;
      container.appendChild(div);
    });

    const totalEl = dom.cartTotal;
    if (temAPesar) {
      totalEl.innerHTML = `<span>${Utils.formatPrice(total)}</span><span class="total-pesar-inline">+ itens a pesar</span>`;
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
      // fn_cardapio() devolve exatamente o formato que o state espera:
      // quatro listas de strings, dias fechados em ISO e a data de
      // atualização. Nada abaixo daqui precisou mudar.
      const { data, error } = await sbCardapio.rpc('fn_cardapio');
      if (error) throw error;
      if (!data) throw new Error('Cardápio vazio');

      state.cardapio = {
        acompanhamentos: data.acompanhamentos || [],
        carnes:          data.carnes          || [],
        saladas:         data.saladas         || [],
        sobremesas:      data.sobremesas      || []
      };
      state.diasFechados = data.fechado || [];
      state.cardapioAtualizado = data.atualizado || '';

      this.renderizar();
      this.mostrarSkeleton(false);
    } catch (e) {
      console.error('Erro ao carregar cardápio:', e);
      // Rede de proteção: o site nunca fica sem cardápio na tela.
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
    document.querySelectorAll('.cardapio-box-list').forEach(el => {
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

    const btnMinus = document.createElement('button');
    btnMinus.className = 'carne-btn';
    btnMinus.textContent = '−';
    btnMinus.disabled = true;
    btnMinus.onclick = (e) => { e.stopPropagation(); PersonalizadaManager.alterarCarne(item, -1); };

    const qty = document.createElement('span');
    qty.className = 'carne-qty';
    qty.dataset.item = item;
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
    Builder.atualizarPreco();
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

// ============ SELEÇÕES DA PERSONALIZADA ============
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
    Builder.atualizarPreco();
  },

  atualizarUICarnes() {
    const sel = state.personalizadaSel.carne;
    const totalPedacos = Object.values(sel).reduce((a, b) => a + b, 0);

    document.querySelectorAll('#carneGrid .carne-card').forEach(card => {
      const item = card.dataset.item;
      const q = sel[item] || 0;
      const qtyEl = card.querySelector('.carne-qty');
      if (qtyEl) qtyEl.textContent = q;
      const btnMinus = card.querySelector('.carne-btn');
      if (btnMinus) btnMinus.disabled = q === 0;
      card.classList.toggle('carne-selecionada', q > 0);
    });

    const counter = document.getElementById('carneCounter');
    if (counter) counter.textContent = `Selecionados: ${totalPedacos} pedaço${totalPedacos !== 1 ? 's' : ''}`;
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
    Builder.atualizarPreco();
  },

  atualizarUIItems(type) {
    if (type === 'acomp') {
      const el = document.getElementById('acompCounter');
      if (el) el.textContent = `Selecionados: ${state.personalizadaSel.acomp.length} / ${CONFIG.limits.acompMax}`;
    } else if (type === 'salada') {
      const el = document.getElementById('saladaCounter');
      if (el) el.textContent = `Selecionadas: ${state.personalizadaSel.salada.length} / ${CONFIG.limits.saladaMax}`;
    }
  },

  temAlgumaSelecao() {
    const totalPedacos = Object.values(state.personalizadaSel.carne).reduce((a, b) => a + b, 0);
    return state.personalizadaSel.acomp.length > 0 || totalPedacos > 0 || state.personalizadaSel.salada.length > 0;
  },

  limparSelecoes() {
    state.personalizadaSel = { acomp: [], carne: {}, salada: [] };
    CardapioManager.renderGridsPedidos();
    const a = document.getElementById('acompCounter');
    const c = document.getElementById('carneCounter');
    const s = document.getElementById('saladaCounter');
    if (a) a.textContent = `Selecionados: 0 / ${CONFIG.limits.acompMax}`;
    if (c) c.textContent = 'Selecionados: 0 pedaços';
    if (s) s.textContent = `Selecionadas: 0 / ${CONFIG.limits.saladaMax}`;
  }
};

// ============ BUILDER (fluxo único de montagem) ============
const Builder = {
  PRECOS: { media: 26, grande: 28 },

  AJUDA: {
    padrao: 'Marmita pronta: arroz, feijão, macarrão, aipim com bacon e 3 pedaços de carne.',
    pers: 'Escolha abaixo os acompanhamentos, carnes e saladas. A marmita personalizada é pesada.'
  },

  ehPers() { return state.pedido.tipo.startsWith('pers'); },
  tamanho() { return state.pedido.tipo.endsWith('grande') ? 'grande' : 'media'; },
  labelTamanho() { return this.tamanho() === 'grande' ? 'Grande' : 'Média'; },

  selecionarTipo(tipo) {
    state.pedido.tipo = tipo;
    document.querySelectorAll('.tipo-btn').forEach(b => {
      b.classList.toggle('selected', b.dataset.tipo === tipo);
    });

    const pers = this.ehPers();
    const bloco = document.getElementById('blocoPers');
    if (bloco) bloco.hidden = !pers;

    const ajuda = document.getElementById('tipoAjuda');
    if (ajuda) ajuda.textContent = pers ? this.AJUDA.pers : this.AJUDA.padrao;

    // Ao sair da personalizada, zera as escolhas para não vazar no próximo pedido
    if (!pers) PersonalizadaManager.limparSelecoes();

    this.atualizarPreco();
  },

  mudarQty(delta) {
    state.pedido.qty = Math.max(1, state.pedido.qty + delta);
    const el = document.getElementById('qtyPedido');
    if (el) el.textContent = state.pedido.qty;
    this.atualizarPreco();
  },

  // Personalizada é SEMPRE por quilo (pesada no balcão)
  precoAtual() {
    if (!this.ehPers()) {
      return { pesar: false, vazio: false, valor: this.PRECOS[this.tamanho()] };
    }
    if (!PersonalizadaManager.temAlgumaSelecao()) {
      return { pesar: false, vazio: true, valor: 0 };
    }
    return { pesar: true, vazio: false, valor: 0 };
  },

  atualizarPreco() {
    const el = document.getElementById('precoPedido');
    const infoEl = document.getElementById('infoPesar');
    if (!el) return;

    const p = this.precoAtual();

    if (p.vazio) {
      el.textContent = 'R$ 0,00';
      el.classList.remove('preco-a-pesar');
      if (infoEl) infoEl.hidden = !this.ehPers();
      return;
    }

    if (p.pesar) {
      el.textContent = 'A pesar';
      el.classList.add('preco-a-pesar');
      if (infoEl) infoEl.hidden = false;
    } else {
      el.classList.remove('preco-a-pesar');
      el.textContent = Utils.formatPrice(p.valor * state.pedido.qty);
      if (infoEl) infoEl.hidden = true;
    }
  },

  nomePessoa() {
    // O "|" é o separador da descrição gravada na planilha — se o cliente
    // digitar um, a impressora e o admin leriam o nome errado.
    return (document.getElementById('nomeMarmita')?.value || '').replace(/\|/g, ' ').trim();
  },

  observacao() {
    return (document.getElementById('obsPedido')?.value || '').trim();
  },

  // Limpa o formulário depois de adicionar. O nome só é limpo se pedido.
  limpar({ limparNome = true } = {}) {
    PersonalizadaManager.limparSelecoes();
    state.pedido.qty = 1;
    const q = document.getElementById('qtyPedido');
    if (q) q.textContent = '1';
    const obs = document.getElementById('obsPedido');
    if (obs) { obs.value = ''; obs._resetContador?.(); }
    if (limparNome) {
      const nome = document.getElementById('nomeMarmita');
      if (nome) { nome.value = ''; nome._resetContador?.(); }
    }
    this.atualizarPreco();
  }
};

// ============ CART MANAGER ============
const CartManager = {
  // Fluxo único: padrão ou personalizada, com nome opcional da pessoa
  adicionar() {
    if (!Schedule.isAberto()) {
      const msg = Schedule.getEstado() === 'fechado'
        ? 'Estamos fechados'
        : 'Horário de pedidos encerrado! Aceitamos pedidos das 08h às 14h.';
      UI.showToast(msg, 'aviso', 5000);
      return;
    }

    const pers = Builder.ehPers();
    const p = Builder.precoAtual();

    if (pers && p.vazio) {
      UI.showToast('Escolha ao menos um item para a marmita personalizada!', 'aviso');
      return;
    }

    const tamanho = Builder.tamanho();
    const label = Builder.labelTamanho();
    const qty = state.pedido.qty;
    const nome = Builder.nomePessoa();
    const obs = Builder.observacao();
    const totalPedacos = Object.values(state.personalizadaSel.carne).reduce((a, b) => a + b, 0);
    const carnesOpcoes = state.cardapio.carnes.length > 0 ? state.cardapio.carnes.slice(0, 3) : ['Carne do dia'];

    const desc = this.montarDescricao({
      carnes: pers ? state.personalizadaSel.carne : {},
      acompanhamentos: pers ? state.personalizadaSel.acomp : [],
      saladas: pers ? state.personalizadaSel.salada : [],
      obs,
      incluiFixos: !pers,
      carnesOpcoes,
      tamanho: label
    });

    // O nome vai no início da descrição que é gravada na planilha e impressa
    const descPlanilha = nome ? `Para: ${nome} | ${desc}` : desc;

    state.cart.push({
      // mantém o mesmo rótulo do balcão para não mudar agrupamento no admin/impressora
      tipo: `Marmita ${label}`,
      nome,
      desc,
      descPlanilha,
      preco: p.pesar ? 0 : p.valor * qty,
      qty,
      aPesar: p.pesar,
      composicao: pers
        ? {
            tipoPedido: 'personalizada', tamanho, pesar: true, nomePessoa: nome || null,
            qtyAcomp: state.personalizadaSel.acomp.length,
            qtyCarnePedacos: totalPedacos,
            qtySalada: state.personalizadaSel.salada.length
          }
        : { tipoPedido: 'padrao', tamanho, pesar: false, nomePessoa: nome || null }
    });

    this.salvarLocal();
    UI.updateCartUI();
    UI.animarParaCarrinho();
    Builder.limpar({ limparNome: true });

    const prefixo = qty > 1 ? `${qty}x ` : '';
    const sufixo = nome ? ` para ${nome}` : '';
    UI.showToast(`✅ ${prefixo}Marmita ${label}${sufixo} adicionada!`, 'sucesso');
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
          nomePessoa: item.nome || '',
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
      const nomeStr = item.nome ? ` — 👤 ${item.nome}` : '';
      msg += `*${i + 1}. ${prefixo}${item.tipo}${nomeStr}*\n${item.desc}\n${precoStr}\n\n`;
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

// ============ AJUDA (como pedir) ============
function abrirAjuda() {
  UI.toggleModal(dom.modalAjuda, dom.modalAjudaOverlay, true);
}

function fecharAjuda() {
  UI.toggleModal(dom.modalAjuda, dom.modalAjudaOverlay, false);
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
window.toggleCart = (show) => UI.toggleCart(show);
window.scrollToSection = scrollToSection;
window.selTipo = (tipo) => Builder.selecionarTipo(tipo);
window.mudarQtyPedido = (delta) => Builder.mudarQty(delta);
window.adicionarPedido = () => CartManager.adicionar();
window.abrirModalNome = () => PedidoManager.abrirModalNome();
window.fecharModalNome = () => PedidoManager.fecharModalNome();
window.confirmarPedido = () => PedidoManager.confirmarPedido();
window.confirmarRemocao = (i) => CartManager.confirmarRemocao(i);
window.abrirAjuda = abrirAjuda;
window.fecharAjuda = fecharAjuda;

// ============ CONTADOR DE CARACTERES ============
function ligarContador(idCampo, idContador) {
  const campo = document.getElementById(idCampo);
  const alvo = document.getElementById(idContador);
  if (!campo || !alvo) return;

  const limite = parseInt(campo.getAttribute('maxlength'), 10);
  if (!limite) return;

  const atualizar = () => {
    const n = campo.value.length;
    alvo.textContent = `${n} / ${limite}`;
    alvo.classList.toggle('perto', n >= limite * 0.8 && n < limite);
    alvo.classList.toggle('cheio', n >= limite);
  };

  campo.addEventListener('input', atualizar);
  campo._resetContador = atualizar;   // Builder.limpar() chama ao esvaziar
  atualizar();
}

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
  dom.modalAjudaOverlay?.addEventListener('click', fecharAjuda);

  // Esc fecha o que estiver aberto
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (dom.modalAjuda?.classList.contains('open')) fecharAjuda();
    else if (dom.modalConfirm?.classList.contains('open')) fecharModalConfirm();
    else if (dom.modalNome?.classList.contains('open')) PedidoManager.fecharModalNome();
    else if (dom.cartPanel?.classList.contains('open')) UI.toggleCart(false);
  });

  // Contador de caracteres nos campos livres. O maxlength sozinho é mudo:
  // o campo simplesmente para de aceitar letra e o cliente não entende.
  ligarContador('obsPedido', 'contadorObs');
  ligarContador('nomeMarmita', 'contadorNome');

  // Allow Enter key in name input
  dom.inputNome?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') PedidoManager.confirmarPedido();
  });
});