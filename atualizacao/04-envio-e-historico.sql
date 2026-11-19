-- Execute uma vez no SQL Editor. Requer as migrações 01 e 03 já instaladas.
-- A limpeza é permanente: pedidos com mais de 30 dias serão excluídos na próxima execução horária.
-- Não altera cadastros do cardápio, usuários, crediário ou o sistema fiscal externo.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create index if not exists rdm_pedidos_criado_idx on public.pedidos(criado_em);
create or replace function public.rdm_painel_operacao() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin
perform rdm_exigir_equipe();
return jsonb_build_object('operacao',rdm_operacao_publica(),'impressora',(select to_jsonb(i) from rdm_impressora i where id),'pedidos',coalesce((select jsonb_agg(jsonb_build_object('id',p.pedido_ref,'banco_id',p.id,'recebido_em',p.criado_em,'confirmado_em',r.confirmado_em,'cancelado_em',p.cancelado_em,'cancelamento_motivo',p.cancelamento_motivo,'impresso_em',p.impresso_em,'origem',p.origem,'reimpressao',(select estado from rdm_reimpressoes q where q.pedido_id=p.id order by criado_em desc limit 1),'pedido',jsonb_build_object('nomeCliente',p.nome_cliente,'itens',coalesce((select jsonb_agg(jsonb_build_object('tipo',i.tipo,'desc',i.descricao,'qty',i.qty) order by i.posicao) from pedido_itens i where i.pedido_id=p.id),'[]'::jsonb))) order by p.criado_em)
from pedidos p left join rdm_acompanhamento r on r.id=p.pedido_ref where (p.criado_em at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date),'[]'::jsonb)); end $$;

create or replace function public.rdm_historico_dia() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.rdm_exigir_equipe();
 return coalesce((select jsonb_agg(jsonb_build_object(
 'id',p.id,'nome',p.nome_cliente,'origem',p.origem,'criado_em',p.criado_em,
 'impresso_em',p.impresso_em,'cancelado_em',p.cancelado_em,
 'reimpressao',(select q.estado from public.rdm_reimpressoes q where q.pedido_id=p.id order by q.criado_em desc limit 1),
 'marmitas',coalesce((select jsonb_agg(jsonb_build_object('tipo',i.tipo,'itens',i.descricao,'qty',i.qty) order by i.posicao) from public.pedido_itens i where i.pedido_id=p.id),'[]'::jsonb)
 ) order by p.criado_em desc,p.id) from public.pedidos p
 where p.criado_em >= (date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')
 and p.criado_em < ((date_trunc('day',now() at time zone 'America/Sao_Paulo')+interval '1 day') at time zone 'America/Sao_Paulo')),'[]'::jsonb);
end $$;
create or replace function public.rdm_reimprimir_dia(p_id uuid,p_chave uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.rdm_exigir_equipe();
 perform 1 from public.pedidos where id=p_id and cancelado_em is null
 and (criado_em at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date for update;
 if not found then raise exception 'Pedido indisponível no histórico de hoje'; end if;
 -- Idempotência: a mesma solicitação não imprime outra cópia mesmo após perda de conexão.
 if exists(select 1 from public.rdm_reimpressoes where id=p_chave and pedido_id=p_id) then return; end if;
 if exists(select 1 from public.rdm_reimpressoes where id=p_chave) then raise exception 'Identificador já utilizado'; end if;
 perform public.rdm_reimprimir(p_id,p_chave);
end $$;
revoke all on function public.rdm_historico_dia(),public.rdm_reimprimir_dia(uuid,uuid) from public,anon,authenticated;
grant execute on function public.rdm_historico_dia(),public.rdm_reimprimir_dia(uuid,uuid) to authenticated;

create or replace function public.rdm_limpar_pedidos_30_dias() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare limite timestamptz:=now()-interval '30 days'; ids uuid[]; refs text[]; removidos integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('rdm_limpar_pedidos_30_dias',0));
 -- Trava os pedidos selecionados para não concorrer com cancelamentos/reimpressões.
 select array_agg(x.id),array_agg(x.pedido_ref) into ids,refs from
 (select id,pedido_ref from public.pedidos where criado_em<limite for update) x;
 delete from public.rdm_whatsapp where pedido_id in
 (select id from public.rdm_acompanhamento where recebido_em<limite or id=any(refs));
 delete from public.rdm_acompanhamento where recebido_em<limite or id=any(refs);
 delete from public.rdm_reimpressoes where pedido_id=any(ids);
 delete from public.pedido_itens where pedido_id=any(ids);
 delete from public.pedidos where id=any(ids);
 get diagnostics removidos = row_count;
 return jsonb_build_object('pedidos_removidos',removidos,'limite',limite);
end $$;
revoke all on function public.rdm_limpar_pedidos_30_dias() from public,anon,authenticated,service_role;
-- Job com nome fixo: reexecutar a migração atualiza o agendamento, sem duplicá-lo.
select cron.schedule('rdm-limpar-pedidos-30-dias','17 * * * *','select public.rdm_limpar_pedidos_30_dias();');
commit;
-- Conferir depois: select status,return_message,start_time from cron.job_run_details
-- where jobid=(select jobid from cron.job where jobname='rdm-limpar-pedidos-30-dias') order by start_time desc limit 5;
