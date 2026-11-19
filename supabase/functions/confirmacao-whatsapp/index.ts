// Este código roda no Supabase. Segredos são configurados no servidor.
const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error('Configuração ausente: ' + name);
  return value;
};

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const workerSecret = Deno.env.get('WHATSAPP_WORKER_SECRET');
  if (!workerSecret || request.headers.get('x-worker-secret') !== workerSecret) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    // Valida configuração antes de reservar um envio.
    const url = env('SUPABASE_URL');
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
    const accessToken = env('WHATSAPP_ACCESS_TOKEN');
    const phoneId = env('WHATSAPP_PHONE_NUMBER_ID');
    const version = env('WHATSAPP_API_VERSION');
    const template = env('WHATSAPP_TEMPLATE');
    if (!/^v[0-9]+\.[0-9]+$/.test(version) || !/^[0-9]+$/.test(phoneId)) {
      throw new Error('Configuração inválida');
    }
    async function rpc(name: string, args: object = {}) {
      const result = await fetch(url + '/rest/v1/rpc/' + name, {
        method: 'POST',
        headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(15000),
      });
      if (!result.ok) throw new Error('Falha no banco');
      const body = await result.text();
      return body ? JSON.parse(body) : null;
    }
    let processed = 0;
    for (let index = 0; index < 3; index++) {
      const job = await rpc('rdm_whatsapp_reservar');
      if (!job) break;
      let status = 'incerto';
      let message = 'Resposta do provedor desconhecida. Verifique antes de reenviar.';
      try {
        const response = await fetch('https://graph.facebook.com/' + version + '/' + phoneId + '/messages', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: job.numero,
            type: 'template',
            template: {
              name: template,
              language: { code: Deno.env.get('WHATSAPP_TEMPLATE_LANGUAGE') || 'pt_BR' },
              components: [{ type: 'body', parameters: [{ type: 'text', text: job.nome }] }],
            },
          }),
          signal: AbortSignal.timeout(15000),
        });
        const data = await response.json();
        if (response.ok && data.messages?.[0]?.id) {
          status = 'encaminhado';
          message = data.messages[0].id;
        } else if (response.status >= 400 && response.status < 500) {
          status = 'falhou';
          message = 'Provedor recusou a mensagem. Código HTTP ' + response.status;
        }
      } catch {
        // Uma falha de rede pode ocorrer depois da aceitação pelo provedor.
        // Evita reenvio automático que poderia duplicar a notificação.
      }
      await rpc('rdm_whatsapp_resultado', { p_id: job.id, p_estado: status, p_mensagem: message });
      processed++;
    }
    return Response.json({ processed });
  } catch {
    return Response.json({ error: 'Verifique as configurações e a fila de envio.' }, { status: 500 });
  }
});
