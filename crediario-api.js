/* =====================================================================
   crediario-api.js — adaptador Supabase

   Reimplementa api(acao, dados) mantendo os mesmos nomes de ação e o
   mesmo formato de DB. O resto do crediario.html não muda.

   No crediario.html, DEPOIS do CDN do Supabase:
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="crediario-api.js"></script>

   Instruções das 3 mudanças na página estão no rodapé deste arquivo.
   ===================================================================== */

(function () {
  'use strict';

  // ===================================================================
  // CONFIGURAÇÃO
  // A anon key é pública por design — quem protege é o RLS, que exige
  // login. A service_role NUNCA vai neste arquivo.
  // ===================================================================

  var SUPABASE_URL      = 'https://kjbwnesvygisuwvoveli.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_XmVYyFWVyaG3zilJg6Otpg_YNYTWAGG';

  // window.supabase é a BIBLIOTECA; sb é o CLIENTE.
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


  // ===================================================================
  // ERROS — as mensagens do banco já vêm em português
  // ===================================================================

  function traduz(error) {
    var msg = (error && error.message) || '';
    if (error.code === '23505' && msg.indexOf('uq_clientes_nome') > -1)
      return 'Já existe um cliente com esse nome.';
    if (error.code === '23505' && msg.indexOf('idempotency') > -1)
      return 'Este registro já foi salvo.';
    if (error.code === '23503')
      return 'Este cliente tem histórico e não pode ser excluído. Use "desativar".';
    if (error.code === '23514')
      return 'Valor inválido. Confira os campos.';
    if (error.code === 'PGRST301' || msg.indexOf('JWT') > -1)
      return 'Sessão expirada. Faça login novamente.';
    if (msg.indexOf('Failed to fetch') > -1 || msg.indexOf('NetworkError') > -1)
      return 'Sem conexão com o servidor.';
    return msg || 'Erro inesperado no servidor.';
  }

  function ok(res) {
    if (res.error) throw new Error(traduz(res.error));
    return res.data;
  }

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }


  // ===================================================================
  // api(acao, dados) — mesma assinatura da versão Apps Script
  // ===================================================================

  async function api(acao, dados) {
    var d = dados || {};

    switch (acao) {

      case 'carregar':
        return ok(await sb.rpc('fn_carregar'));

      case 'salvarCliente':
        return ok(await sb.rpc('fn_salvar_cliente', { p: d }));

      case 'desativarCliente':
        return ok(await sb.rpc('fn_ativar_cliente', { p_id: d.id, p_ativo: false }));

      case 'reativarCliente':
        return ok(await sb.rpc('fn_ativar_cliente', { p_id: d.id, p_ativo: true }));

      case 'salvarLancamento':
        // Chave de idempotência: o reenvio da fila de PENDENTES manda a
        // MESMA chave, então não duplica se o primeiro envio tiver
        // chegado e só a resposta ter se perdido.
        if (!d.id && !d.idempotency_key) d.idempotency_key = uuid();
        return ok(await sb.rpc('fn_salvar_lancamento', { p: d }));

      case 'excluirLancamento':
        return ok(await sb.rpc('fn_excluir_lancamento', { p_id: d.id }));

      case 'salvarPagamento':
        if (!d.id && !d.idempotency_key) d.idempotency_key = uuid();
        return ok(await sb.rpc('fn_salvar_pagamento', { p: d }));

      case 'excluirPagamento':
        return ok(await sb.rpc('fn_excluir_pagamento', { p_id: d.id }));

      case 'gerarFechamento':
        return ok(await sb.rpc('fn_gerar_fechamento', {
          p_cliente: d.cliente_id,
          p_inicio:  d.periodo_inicio,
          p_fim:     d.periodo_fim
        }));

      case 'marcarPago':
        return ok(await sb.rpc('fn_marcar_pago', {
          p_id:                  d.id,
          p_forma:               d.forma || 'Dinheiro',
          p_data:                d.data || null,
          p_registrar_pagamento: d.registrar_pagamento !== false
        }));

      case 'cancelarFechamento':
        return ok(await sb.rpc('fn_cancelar_fechamento', { p_id: d.id }));

      default:
        throw new Error('Ação desconhecida: ' + acao);
    }
  }


  // ===================================================================
  // AUTENTICAÇÃO
  // ===================================================================

  async function login(email, senha) {
    var r = await sb.auth.signInWithPassword({ email: email, password: senha });
    if (r.error) {
      var m = r.error.message || '';

      if (m.indexOf('Email not confirmed') > -1)
        throw new Error('Usuário não confirmado. No Supabase: Authentication → Users, apague este usuário e recrie marcando "Auto Confirm User".');

      if (m.indexOf('Invalid API key') > -1 || m.indexOf('No API key') > -1)
        throw new Error('Anon key inválida ou não preenchida no crediario-api.js.');

      if (m.indexOf('Failed to fetch') > -1 || m.indexOf('NetworkError') > -1)
        throw new Error('Não conectou ao Supabase. Confira a URL no crediario-api.js.');

      if (m.indexOf('Invalid login credentials') > -1)
        throw new Error('Email ou senha incorretos.');

      if (m.indexOf('rate limit') > -1 || m.indexOf('Too many') > -1)
        throw new Error('Muitas tentativas seguidas. Espere alguns minutos.');

      // Qualquer outra coisa: mostra o motivo real em vez de esconder
      throw new Error('Falha no login: ' + m);
    }
    return r.data.user;
  }

  async function logout() { await sb.auth.signOut(); }

  async function sessaoAtiva() {
    var r = await sb.auth.getSession();
    return !!(r.data && r.data.session);
  }

  window.api         = api;        // substitui a função antiga
  window.novaChave   = uuid;       // chave anti-duplicação para a fila de pendentes
  window.loginCred   = login;
  window.logoutCred  = logout;
  window.sessaoAtiva = sessaoAtiva;
  window.sbCred      = sb;
})();