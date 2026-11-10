# WhatsApp nesta versão

A opção de receber confirmação automática foi retirada da interface. Novos pedidos usam whatsappOptIn=false e não solicitam telefone. O botão opcional abre o WhatsApp com o pedido preenchido; o cliente precisa tocar em enviar no WhatsApp. Após registro no site, a mensagem identifica que é o mesmo pedido para evitar duplicação. Os componentes de envio automático abaixo são legados e não precisam ser ativados para este fluxo. Nenhum SQL novo é necessário para esta alteração. Pedidos antigos que já tenham consentimento não são alterados.

# Instalação desta versão

Como você ainda não executou as atualizações anteriores, use somente os arquivos desta versão. Faça backup antes de instalar.

## 1. Banco de dados

Execute 01-pedidos-web.sql no SQL Editor do seu projeto Supabase. O arquivo cria o acompanhamento dos pedidos, a autorização da equipe e a fila opcional do WhatsApp em uma transação.

O instalador exige a função existente public.fn_criar_pedido(jsonb). Se aparecer um erro sobre essa assinatura, interrompa a instalação e confira a definição original da função. O SQL e as permissões precisam ser validados no projeto real.

Ao terminar, execute o INSERT comentado no final do arquivo substituindo EMAIL_DA_EQUIPE pelo email de cada funcionário autorizado. O usuário precisa já existir no Supabase Auth. Confira se uma linha foi inserida.

A equipe acessa admin.html e a aba Confirmar pedidos. Os pedidos ficam registrados no fluxo original usado pela impressão. A confirmação também grava uma notificação, quando o cliente solicitou WhatsApp. Confirmações repetidas usam a mesma entrada da fila.

## 2. WhatsApp automático

Configure a WhatsApp Business Cloud API da Meta para o número comercial. O uso pode ter cobrança pelo provedor.

Crie e aprove um modelo de mensagem de utilidade, no idioma pt_BR, com uma variável no corpo, na ordem do nome do cliente. Texto sugerido:

Olá, {{1}}! Seu pedido no Restaurante do Mário foi confirmado. Obrigado por pedir com a gente!

Publique a função supabase/functions/confirmacao-whatsapp/index.ts no Supabase com o nome confirmacao-whatsapp. A configuração em supabase/config.toml desativa a verificação JWT da plataforma somente para essa função. A própria função exige o segredo x-worker-secret.

Configure os seguintes segredos somente no servidor:

- WHATSAPP_ACCESS_TOKEN — token da integração Meta com permissão para enviar mensagens.
- WHATSAPP_PHONE_NUMBER_ID — identificador do número remetente.
- WHATSAPP_API_VERSION — versão vigente da Graph API habilitada na sua integração, no formato vNN.N.
- WHATSAPP_TEMPLATE — nome exato do modelo aprovado.
- WHATSAPP_TEMPLATE_LANGUAGE — pt_BR.
- WHATSAPP_WORKER_SECRET — segredo aleatório forte exclusivo, com pelo menos 32 bytes.

O ambiente da função também precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY, fornecidos pelo Supabase. Nunca coloque esses segredos nos arquivos públicos do site.

No Vault do Supabase, crie rdm_project_url com a URL HTTPS do projeto, sem barra final, e rdm_worker_secret com o mesmo valor de WHATSAPP_WORKER_SECRET. Habilite o Vault caso ainda não esteja disponível.

Execute 02-agendar-whatsapp.sql. Ele agenda a função a cada minuto, em lotes de até três mensagens. Assim, uma confirmação normalmente entra no próximo ciclo, e filas maiores podem levar mais tempo. Se houver maior volume, ajuste a frequência/lote após medir os limites da sua conta.

O painel mostra aguardando envio, processando, encaminhado ao WhatsApp, falha ou envio incerto. Encaminhado significa aceito pela API. A implementação não consulta recibos de entrega ao telefone.

A resposta incerta exige verificação no provedor antes de um reenvio. Falhas e respostas incertas não são reenviadas automaticamente, para evitar notificações duplicadas. Processamentos interrompidos são marcados como incertos após cinco minutos, no próximo ciclo do worker. Confira a fila rdm_whatsapp no Supabase e os registros da função quando houver erro.

Conclua a configuração do WhatsApp antes de liberar a opção aos clientes. Sem credenciais e modelo aprovado, mensagens solicitadas ficarão pendentes.

Documentação oficial consultada:
https://www.postman.com/meta/whatsapp-business-platform/request/o65u5m5/send-message-template-text
https://supabase.com/docs/guides/functions/schedule-functions

## 3. Publicação

Publique todos os arquivos web atualizados, inclusive pedidos-web.js, admin-pedidos-web.js e os estilos. Use HTTPS.

A pasta supabase é código de servidor e a pasta atualizacao contém instaladores. Execute esses componentes nos destinos indicados antes de publicar a interface. O programa local da maquininha continua utilizando as funções originais da fila. Confira uma impressão real antes de liberar aos clientes.

Para a imagem de compartilhamento, configure o domínio público com:
python atualizacao/configurar-dominio.py https://SEU-DOMINIO

## Experiência do cliente

Na tela do nome, o cliente escolhe se deseja uma confirmação pelo WhatsApp. O número é solicitado apenas quando essa opção está marcada. A autorização e o número ficam vinculados ao pedido.

Após tocar em enviar, aparece uma única tela de progresso com seta animada. Quando o banco registra o pedido, o carrinho correspondente é limpo e a tela mostra Pedido enviado, aguardando confirmação da cozinha. A confirmação da equipe atualiza essa mesma tela. Meus pedidos permanece acessível pelo botão, pelo menu e pelo carrinho.

O status é consultado a cada 15 segundos com a página visível e ao voltar à aba. O histórico fica salvo nesse navegador. O link privado permite recuperar o acompanhamento em outro aparelho.

O reenvio usa o mesmo identificador. Em falhas de conexão, o carrinho é preservado e o cliente pode consultar o pedido antes de tentar novamente. A animação de envio não indica confirmação pela equipe.

## Validação

Passaram testes de lógica com serviços simulados para consentimento opcional, telefone inválido, clique duplicado, limpeza do carrinho após sucesso, tela única de progresso, atualização para confirmado, preservação em falha de rede e exclusão do telefone do payload quando a opção não está marcada.

O worker passou testes simulados para autenticação, configuração ausente, resposta aceita, recusa da API e falha de conexão. Nenhuma mensagem real foi enviada.

Ainda é necessário executar o SQL no Supabase, validar os acessos da equipe e de visitantes, testar a renderização em celular e computador, conferir a impressão física e enviar uma mensagem de teste com as credenciais reais.

Teste o mesmo pedido duas vezes em caso de interrupção para conferir que só existe uma comanda e uma entrada na fila do WhatsApp. Verifique que um visitante e um usuário sem autorização não conseguem confirmar pedidos nem reservar mensagens.

Para reverter, restaure a versão anterior dos arquivos web e mantenha os dados de acompanhamento para consulta.
