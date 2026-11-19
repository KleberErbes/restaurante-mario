/* Reimpressão dos pedidos do dia pela fila do programa do restaurante. */
(() => {
  const emEnvio = new Set();
  const chaves = new Map();
  const prefixo = 'rdm_admin_reimpressao:';
  function chavePara(id) {
    if (chaves.has(id)) return chaves.get(id);
    let chave;
    try { chave = sessionStorage.getItem(prefixo + id); } catch {}
    if (!chave) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const h = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      chave = `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
    }
    chaves.set(id, chave);
    try { sessionStorage.setItem(prefixo + id, chave); } catch {}
    return chave;
  }
  function adicionar(card, pedido) {
    const acoes = document.createElement('div');
    acoes.className = 'pedido-acoes';
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'btn-reimprimir';
    botao.textContent = 'Reimprimir pedido';
    botao.setAttribute('aria-label', `Reimprimir pedido de ${pedido.nome || 'cliente'} às ${pedido.hora || ''}`);
    const mensagem = document.createElement('p');
    mensagem.className = 'pedido-impressao-status';
    mensagem.setAttribute('role', 'status');
    const naFila = ['pendente', 'processando'].includes(pedido.reimpressao);
    botao.disabled = !pedido.id || !!pedido.cancelado_em || !pedido.impresso_em || naFila || emEnvio.has(pedido.id);
    if (pedido.cancelado_em) mensagem.textContent = 'Pedido cancelado.';
    else if (naFila) {
      botao.textContent = 'Reimpressão na fila';
      mensagem.textContent = 'Aguardando o programa de impressão do restaurante.';
    } else if (!pedido.impresso_em) mensagem.textContent = 'A primeira impressão ainda está na fila automática.';
    else if (pedido.reimpressao === 'incerto') mensagem.textContent = 'Confira se a cópia saiu antes de solicitar outra reimpressão.';
    else if (pedido.reimpressao === 'falhou') mensagem.textContent = 'A última reimpressão falhou. Confira a impressora e tente novamente.';
    botao.onclick = async () => {
      if (botao.disabled || emEnvio.has(pedido.id)) return;
      if (!confirm('Solicitar uma nova cópia deste pedido? Confira o papel e a fila do Windows para evitar cópias duplicadas.')) return;
      emEnvio.add(pedido.id);
      botao.disabled = true;
      botao.textContent = 'Solicitando…';
      try {
        const { error } = await sb.rpc('rdm_reimprimir_dia', { p_id: pedido.id, p_chave: chavePara(pedido.id) });
        if (error) throw error;
        chaves.delete(pedido.id);
        try { sessionStorage.removeItem(prefixo + pedido.id); } catch {}
        pedido.reimpressao = 'pendente';
        botao.textContent = 'Reimpressão na fila';
        mensagem.textContent = 'Reimpressão solicitada. O programa do restaurante precisa estar ligado para imprimir.';
      } catch (error) {
        botao.textContent = 'Tentar reimpressão novamente';
        botao.disabled = false;
        mensagem.textContent = 'Não foi possível confirmar a solicitação. ' + (error.message || 'Confira a conexão e tente novamente.');
      } finally {
        emEnvio.delete(pedido.id);
      }
    };
    acoes.append(botao, mensagem);
    card.append(acoes);
  }
  window.RDMReimpressao = { adicionar };
})();
