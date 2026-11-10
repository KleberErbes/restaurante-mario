begin;
alter table public.pedidos add column if not exists cancelamento_motivo text;
alter table public.pedidos add column if not exists cancelado_por uuid references auth.users(id);
create table if not exists public.rdm_operacao (id boolean primary key default true check(id), pausado boolean not null default false, mensagem text not null default 'Pedidos temporariamente pausados.');
insert into public.rdm_operacao(id) values(true) on conflict do nothing;
create table if not exists public.rdm_impressora (id boolean primary key default true check(id), atualizado_em timestamptz, estado text, detalhe text);
create table if not exists public.rdm_reimpressoes (id uuid primary key, pedido_id uuid not null references public.pedidos(id), criado_em timestamptz not null default now(), solicitado_por uuid references auth.users(id), estado text not null default 'pendente', atualizado_em timestamptz not null default now());
alter table public.rdm_operacao enable row level security;
alter table public.rdm_impressora enable row level security;
alter table public.rdm_reimpressoes enable row level security;
revoke all on public.rdm_operacao,public.rdm_impressora,public.rdm_reimpressoes from anon,authenticated;
create or replace function public.rdm_exigir_equipe() returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin
if not exists(select 1 from rdm_equipe where usuario=auth.uid()) then raise exception 'Sem permissão'; end if;
end $$;
create or replace function public.rdm_operacao_publica() returns jsonb language sql security definer set search_path=public,pg_temp as $$ select jsonb_build_object('pausado',pausado,'mensagem',mensagem) from rdm_operacao where id $$;
create or replace function public.rdm_pausar(p_pausado boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin
perform rdm_exigir_equipe(); update rdm_operacao set pausado=p_pausado where id; end $$;
create or replace function public.rdm_bloquear_pausa() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ begin
if new.origem='site' and (select pausado from rdm_operacao where id for share) then raise exception 'Pedidos temporariamente pausados. Tente novamente mais tarde.'; end if;
return new; end $$;
drop trigger if exists rdm_pausa on public.pedidos;
create trigger rdm_pausa before insert on public.pedidos for each row execute function public.rdm_bloquear_pausa();
create or replace function public.rdm_cancelar(p_id uuid,p_motivo text) returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin
perform rdm_exigir_equipe();
if length(trim(coalesce(p_motivo,''))) not between 3 and 300 then raise exception 'Informe um motivo entre 3 e 300 caracteres'; end if;
update pedidos set cancelado_em=now(),cancelamento_motivo=trim(p_motivo),cancelado_por=auth.uid() where id=p_id and cancelado_em is null;
update rdm_reimpressoes set estado='cancelado',atualizado_em=now() where pedido_id=p_id and estado='pendente';
end $$;
create or replace function public.rdm_confirmar(p_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r rdm_acompanhamento; p pedidos;
begin perform rdm_exigir_equipe();
select * into p from pedidos where pedido_ref=p_id for update;
if not found or p.cancelado_em is not null then raise exception 'Pedido inexistente ou cancelado'; end if;
update rdm_acompanhamento set confirmado_em=coalesce(confirmado_em,now()),confirmado_por=coalesce(confirmado_por,auth.uid()) where id=p_id returning * into r;
if not found then raise exception 'Pedido não encontrado'; end if;
return jsonb_build_object('id',r.id,'confirmado_em',r.confirmado_em); end $$;
create or replace function public.rdm_consultar(p_id text,p_token text) returns jsonb language sql security definer set search_path=public,pg_temp as $$
select jsonb_build_object('id',r.id,'recebido_em',r.recebido_em,'confirmado_em',r.confirmado_em,'pedido',r.pedido,'cancelado_em',p.cancelado_em,'cancelamento_motivo',p.cancelamento_motivo)
from rdm_acompanhamento r join pedidos p on p.pedido_ref=r.id where r.id=p_id and r.segredo_hash=md5(p_token) $$;
create or replace function public.rdm_painel_operacao() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin
perform rdm_exigir_equipe();
return jsonb_build_object('operacao',rdm_operacao_publica(),'impressora',(select to_jsonb(i) from rdm_impressora i where id),'pedidos',coalesce((select jsonb_agg(jsonb_build_object('id',p.pedido_ref,'banco_id',p.id,'recebido_em',p.criado_em,'confirmado_em',r.confirmado_em,'cancelado_em',p.cancelado_em,'cancelamento_motivo',p.cancelamento_motivo,'impresso_em',p.impresso_em,'origem',p.origem,'reimpressao',(select estado from rdm_reimpressoes q where q.pedido_id=p.id order by criado_em desc limit 1),'pedido',jsonb_build_object('nomeCliente',p.nome_cliente,'itens',coalesce((select jsonb_agg(jsonb_build_object('tipo',i.tipo,'desc',i.descricao,'qty',i.qty) order by i.posicao) from pedido_itens i where i.pedido_id=p.id),'[]'::jsonb))) order by p.criado_em)
from pedidos p left join rdm_acompanhamento r on r.id=p.pedido_ref where p.criado_em>=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' or (r.confirmado_em is null and r.id is not null and p.cancelado_em is null and p.criado_em>now()-interval '7 days')),'[]'::jsonb)); end $$;
create or replace function public.rdm_reimprimir(p_id uuid,p_chave uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin
perform rdm_exigir_equipe(); perform 1 from pedidos where id=p_id and cancelado_em is null and impresso_em is not null for update;
if not found then raise exception 'Só é possível reimprimir pedidos já impressos e não cancelados'; end if;
if exists(select 1 from rdm_reimpressoes where pedido_id=p_id and estado in ('pendente','processando')) then raise exception 'Já existe reimpressão pendente. Confira a impressora.'; end if;
insert into rdm_reimpressoes(id,pedido_id,solicitado_por) values(p_chave,p_id,auth.uid()) on conflict(id) do nothing; end $$;
create or replace function public.rdm_reimpressao_reservar() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare q rdm_reimpressoes; p pedidos; begin
update rdm_reimpressoes set estado='incerto' where estado='processando' and atualizado_em<now()-interval '5 minutes';
select * into q from rdm_reimpressoes where estado='pendente' order by criado_em for update skip locked limit 1;
if not found then return null; end if;
select * into p from pedidos where id=q.pedido_id for update;
if p.cancelado_em is not null then update rdm_reimpressoes set estado='cancelado' where id=q.id; return null; end if;
update rdm_reimpressoes set estado='processando',atualizado_em=now() where id=q.id;
return jsonb_build_object('trabalho',q.id,'id',p.id,'nome','REIMPRESSÃO - '||p.nome_cliente,'marmitas',(select jsonb_agg(jsonb_build_object('tipo',tipo,'itens',descricao,'qty',qty,'tipoPedido',tipo_pedido) order by posicao) from pedido_itens where pedido_id=p.id)); end $$;
create or replace function public.rdm_reimpressao_resultado(p_id uuid,p_estado text) returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin
if p_estado not in ('encaminhado','incerto') then raise exception 'Estado inválido'; end if;
update rdm_reimpressoes set estado=p_estado,atualizado_em=now() where id=p_id and estado='processando'; end $$;
create or replace function public.rdm_impressora_sinal(p_estado text,p_detalhe text) returns void language sql security definer set search_path=public,pg_temp as $$
insert into rdm_impressora(id,atualizado_em,estado,detalhe) values(true,now(),left(p_estado,40),left(p_detalhe,300)) on conflict(id) do update set atualizado_em=now(),estado=excluded.estado,detalhe=excluded.detalhe $$;
create or replace view public.rdm_diario_ativo with (security_invoker=true) as
select (p.criado_em at time zone 'America/Sao_Paulo')::date as data,
coalesce(sum((select coalesce(sum(i.qty),0) from pedido_itens i where i.pedido_id=p.id and (lower(i.tipo) like '%média%' or lower(i.tipo) like '%media%'))),0) as media,
coalesce(sum((select coalesce(sum(i.qty),0) from pedido_itens i where i.pedido_id=p.id and lower(i.tipo) like '%grande%')),0) as grande,
sum(p.total_marmitas) as total,sum(p.valor_total) as valor,
coalesce(sum((select coalesce(sum(i.qty),0) from pedido_itens i where i.pedido_id=p.id and i.pesar)),0) as pesar
from public.pedidos p where p.cancelado_em is null group by 1;
revoke all on public.rdm_diario_ativo from public,anon,authenticated;
grant select on public.rdm_diario_ativo to authenticated;
CREATE OR REPLACE FUNCTION public.fn_resumo()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dias text[] := array['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  v_prox date;
  v_nome_prox text;
begin
  v_prox := v_hoje + 1;
  if extract(dow from v_prox) = 0 then v_prox := v_prox + 1; end if;
  v_nome_prox := v_dias[extract(dow from v_prox)::int + 1];

  return jsonb_build_object(
    'hoje', coalesce((
      select jsonb_build_object(
        'data', to_char(h.data,'YYYY-MM-DD'),
        'diaSemana', v_dias[extract(dow from h.data)::int + 1],
        'media', h.media, 'grande', h.grande, 'total', h.total,
        'valor', h.valor, 'pesar', h.pesar)
      from rdm_diario_ativo h where h.data = v_hoje),
      jsonb_build_object('data', to_char(v_hoje,'YYYY-MM-DD'),
        'diaSemana', v_dias[extract(dow from v_hoje)::int + 1],
        'media',0,'grande',0,'total',0,'valor',0,'pesar',0)),

    'anteriores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'data', to_char(h.data,'YYYY-MM-DD'),
        'diaSemana', v_dias[extract(dow from h.data)::int + 1],
        'media', h.media, 'grande', h.grande, 'total', h.total,
        'valor', h.valor, 'pesar', h.pesar) order by h.data)
      from (select * from rdm_diario_ativo
            where data < v_hoje order by data desc limit 14) h), '[]'::jsonb),

    -- Previsão: média dos 4 últimos mesmos dias da semana
    'previsao', (
      select jsonb_build_object(
        'data', to_char(v_prox,'YYYY-MM-DD'),
        'diaSemana', v_nome_prox,
        'baseAmostras', count(*),
        'mediaPrevista',  coalesce(round(avg(m.media)),0),
        'grandePrevista', coalesce(round(avg(m.grande)),0),
        'totalPrevisto',  coalesce(round(avg(m.total)),0),
        'valorPrevisto',  coalesce(round(avg(m.valor)),0),
        'confianca', case when count(*) >= 3 then 'boa'
                          when count(*) = 2 then 'média'
                          when count(*) = 1 then 'baixa'
                          else 'sem dados' end)
      from (select * from rdm_diario_ativo
            where extract(dow from data) = extract(dow from v_prox)
              and total > 0 and data < v_hoje
            order by data desc limit 4) m),

    'geradoEm', to_char(now() at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')
  );
end $function$
;
revoke all on function public.rdm_operacao_publica() from public,anon,authenticated;
revoke all on function public.rdm_pausar(boolean) from public,anon,authenticated;
revoke all on function public.rdm_cancelar(uuid,text) from public,anon,authenticated;
revoke all on function public.rdm_painel_operacao() from public,anon,authenticated;
revoke all on function public.rdm_reimprimir(uuid,uuid) from public,anon,authenticated;
revoke all on function public.rdm_reimpressao_reservar() from public,anon,authenticated;
revoke all on function public.rdm_reimpressao_resultado(uuid,text) from public,anon,authenticated;
revoke all on function public.rdm_impressora_sinal(text,text) from public,anon,authenticated;
revoke all on function public.rdm_exigir_equipe() from public,anon,authenticated;
revoke all on function public.rdm_bloquear_pausa() from public,anon,authenticated;
grant execute on function public.rdm_operacao_publica() to anon,authenticated;
grant execute on function public.rdm_pausar(boolean) to authenticated;
grant execute on function public.rdm_cancelar(uuid,text) to authenticated;
grant execute on function public.rdm_painel_operacao() to authenticated;
grant execute on function public.rdm_reimprimir(uuid,uuid) to authenticated;
grant execute on function public.rdm_reimpressao_reservar() to service_role;
grant execute on function public.rdm_reimpressao_resultado(uuid,text) to service_role;
grant execute on function public.rdm_impressora_sinal(text,text) to service_role;
commit;
