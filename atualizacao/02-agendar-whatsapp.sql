-- Execute após configurar os segredos no Vault e publicar a Edge Function.
create extension if not exists pg_cron;
create extension if not exists pg_net;
-- No Vault crie:
-- rdm_project_url = URL HTTPS do seu projeto Supabase
-- rdm_worker_secret = mesmo valor de WHATSAPP_WORKER_SECRET da função
do $$ begin
 if not exists(select 1 from vault.decrypted_secrets where name='rdm_project_url')
 or not exists(select 1 from vault.decrypted_secrets where name='rdm_worker_secret') then
  raise exception 'Configure os dois segredos no Vault antes de agendar.';
 end if;
end $$;
select cron.schedule('rdm-confirmacao-whatsapp','* * * * *',$cron$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='rdm_project_url' limit 1)||'/functions/v1/confirmacao-whatsapp',
  headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name='rdm_worker_secret' limit 1)),
  body := '{}'::jsonb,
  timeout_milliseconds := 120000
 );
$cron$);
