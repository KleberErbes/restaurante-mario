-- Execute no SQL Editor do Supabase ANTES de publicar os novos arquivos.
-- Mantém fn_criar_pedido e a fila de impressão existentes.
begin;
do $$ begin
 if to_regprocedure('public.fn_criar_pedido(jsonb)') is null then
  raise exception 'A função existente fn_criar_pedido(jsonb) não foi encontrada. Não publicar: conferir a assinatura original.';
 end if;
end $$;
create table if not exists public.rdm_equipe (usuario uuid primary key references auth.users(id));
create table if not exists public.rdm_acompanhamento (
 id text primary key,
 segredo_hash text not null,
 pedido jsonb not null,
 recebido_em timestamptz not null default now(),
 confirmado_em timestamptz,
 confirmado_por uuid references auth.users(id)
);
alter table public.rdm_equipe enable row level security;
alter table public.rdm_acompanhamento enable row level security;
revoke all on public.rdm_equipe, public.rdm_acompanhamento from anon, authenticated;
create table if not exists public.rdm_whatsapp (
 pedido_id text primary key references public.rdm_acompanhamento(id),
 numero text not null,
 nome text not null,
 consentido_em timestamptz not null,
 estado text not null default 'pendente' check (estado in ('pendente','processando','encaminhado','falhou','incerto')),
 iniciado_em timestamptz,
 mensagem_id text,
 erro text,
 atualizado_em timestamptz not null default now()
);
alter table public.rdm_whatsapp enable row level security;
revoke all on public.rdm_whatsapp from anon, authenticated;
create or replace function public.rdm_enviar(p jsonb, p_token text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare registro public.rdm_acompanhamento; resultado jsonb; chave text := p->>'pedidoId';
begin
 if chave is null or length(chave)>100 or p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Identificador inválido'; end if;
 if jsonb_typeof(p->'itens') is distinct from 'array' then raise exception 'Itens inválidos'; end if;
 if jsonb_array_length(p->'itens') not between 1 and 100 or length(coalesce(p->>'nomeCliente','')) not between 1 and 60 or octet_length(p::text)>100000 then raise exception 'Pedido inválido'; end if;
 if p ? 'whatsappOptIn' and jsonb_typeof(p->'whatsappOptIn') <> 'boolean' then raise exception 'Opção de WhatsApp inválida'; end if;
 if p->>'whatsappOptIn'='true' and coalesce(p->>'whatsappNumero','') !~ '^55[1-9][0-9][0-9]{8,9}$' then raise exception 'WhatsApp inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended(chave,0));
 select * into registro from public.rdm_acompanhamento where id=chave;
 if found then
  if registro.segredo_hash<>md5(p_token) or registro.pedido<>p then raise exception 'Identificador já utilizado'; end if;
 else
  -- A mesma transação grava o pedido original e o acompanhamento.
  resultado := to_jsonb(public.fn_criar_pedido(p));
  if resultado->>'ok'='false' or resultado->>'sucesso'='false' or resultado->>'error' is not null or resultado->>'erro' is not null then raise exception 'Pedido não registrado'; end if;
  insert into public.rdm_acompanhamento(id,segredo_hash,pedido) values(chave,md5(p_token),p) returning * into registro;
 end if;
 return jsonb_build_object('id',registro.id,'recebido_em',registro.recebido_em,'confirmado_em',registro.confirmado_em);
end $$;
create or replace function public.rdm_consultar(p_id text,p_token text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.rdm_acompanhamento;
begin
 select * into r from public.rdm_acompanhamento where id=p_id and segredo_hash=md5(p_token);
 if not found then return null; end if;
 return jsonb_build_object('id',r.id,'recebido_em',r.recebido_em,'confirmado_em',r.confirmado_em,'pedido',r.pedido);
end $$;
create or replace function public.rdm_fila() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
 if not exists(select 1 from public.rdm_equipe where usuario=auth.uid()) then raise exception 'Sem permissão para confirmar pedidos'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'pedido',pedido,'recebido_em',recebido_em,'confirmado_em',confirmado_em,'whatsapp_estado',(select estado from public.rdm_whatsapp w where w.pedido_id=id)) order by recebido_em desc) from public.rdm_acompanhamento where recebido_em >= date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' or (confirmado_em is null and recebido_em>now()-interval '7 days')),'[]'::jsonb);
end $$;
create or replace function public.rdm_confirmar(p_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.rdm_acompanhamento;
begin
 if not exists(select 1 from public.rdm_equipe where usuario=auth.uid()) then raise exception 'Sem permissão para confirmar pedidos'; end if;
 update public.rdm_acompanhamento set confirmado_em=coalesce(confirmado_em,now()),confirmado_por=coalesce(confirmado_por,auth.uid()) where id=p_id returning * into r;
 if not found then raise exception 'Pedido não encontrado'; end if;
 if r.pedido->>'whatsappOptIn'='true' then
  insert into public.rdm_whatsapp(pedido_id,numero,nome,consentido_em)
  values(r.id,r.pedido->>'whatsappNumero',r.pedido->>'nomeCliente',r.recebido_em)
  on conflict(pedido_id) do nothing;
 end if;
 return jsonb_build_object('id',r.id,'confirmado_em',r.confirmado_em);
end $$;
revoke all on function public.rdm_enviar(jsonb,text),public.rdm_consultar(text,text),public.rdm_fila(),public.rdm_confirmar(text) from public;
grant execute on function public.rdm_enviar(jsonb,text),public.rdm_consultar(text,text) to anon,authenticated;
grant execute on function public.rdm_fila(),public.rdm_confirmar(text) to authenticated;
-- Funções reservadas ao servidor. Um trabalho é reservado uma única vez.
create or replace function public.rdm_whatsapp_reservar() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare trabalho public.rdm_whatsapp;
begin
 update public.rdm_whatsapp set estado='incerto',erro='Processamento interrompido. Verifique no provedor antes de qualquer reenvio.',atualizado_em=now()
 where estado='processando' and iniciado_em<now()-interval '5 minutes';
 select * into trabalho from public.rdm_whatsapp where estado='pendente' order by consentido_em for update skip locked limit 1;
 if not found then return null; end if;
 update public.rdm_whatsapp set estado='processando',iniciado_em=now(),atualizado_em=now() where pedido_id=trabalho.pedido_id;
 return jsonb_build_object('id',trabalho.pedido_id,'numero',trabalho.numero,'nome',trabalho.nome);
end $$;
create or replace function public.rdm_whatsapp_resultado(p_id text,p_estado text,p_mensagem text default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_estado not in ('encaminhado','falhou','incerto') then raise exception 'Estado inválido'; end if;
 update public.rdm_whatsapp set estado=p_estado,
 mensagem_id=case when p_estado='encaminhado' then p_mensagem else null end,
 erro=case when p_estado<>'encaminhado' then left(p_mensagem,200) else null end,atualizado_em=now()
 where pedido_id=p_id and estado='processando';
end $$;
revoke all on function public.rdm_whatsapp_reservar(),public.rdm_whatsapp_resultado(text,text,text) from public,anon,authenticated;
grant execute on function public.rdm_whatsapp_reservar(),public.rdm_whatsapp_resultado(text,text,text) to service_role;
commit;
-- Autorize SOMENTE os usuários da equipe (troque o email abaixo e execute separado):
-- insert into public.rdm_equipe(usuario) select id from auth.users where email='EMAIL_DA_EQUIPE' on conflict do nothing;
