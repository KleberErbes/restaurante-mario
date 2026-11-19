-- Execute APÓS 04-envio-e-historico.sql, antes de atualizar a comanda local.
-- Rotinas exclusivas do programa no PC. Nenhum acesso anônimo é liberado.
begin;
create or replace function public.rdm_local_historico() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin

 return coalesce((select jsonb_agg(jsonb_build_object(
 'id',p.id,'nome',p.nome_cliente,'origem',p.origem,'criado_em',p.criado_em,
 'impresso_em',p.impresso_em,'cancelado_em',p.cancelado_em,
 'reimpressao',(select q.estado from public.rdm_reimpressoes q where q.pedido_id=p.id order by q.criado_em desc limit 1),
 'marmitas',coalesce((select jsonb_agg(jsonb_build_object('tipo',i.tipo,'itens',i.descricao,'qty',i.qty) order by i.posicao) from public.pedido_itens i where i.pedido_id=p.id),'[]'::jsonb)
 ) order by p.criado_em desc,p.id) from public.pedidos p
 where p.criado_em >= (date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')
 and p.criado_em < ((date_trunc('day',now() at time zone 'America/Sao_Paulo')+interval '1 day') at time zone 'America/Sao_Paulo')),'[]'::jsonb);
end $$;

create or replace function public.rdm_local_criar(p jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p is null or jsonb_typeof(p) is distinct from 'object' then raise exception 'Pedido inválido'; end if;
 if jsonb_typeof(p->'itens') is distinct from 'array' then raise exception 'Itens inválidos'; end if;
 if jsonb_array_length(p->'itens') not between 1 and 100 or octet_length(p::text)>100000
 or length(coalesce(p->>'pedidoId','')) not between 1 and 100 then raise exception 'Pedido inválido'; end if;
 -- A origem e o primeiro envio são definidos no servidor, não pelo navegador.
 return to_jsonb(public.fn_criar_pedido(p||jsonb_build_object('origem','balcao','impresso',false)));
end $$;
create or replace function public.rdm_local_reimprimir(p_id uuid,p_chave uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_chave is null then raise exception 'Identificador obrigatório'; end if;
 perform 1 from public.pedidos where id=p_id and cancelado_em is null and impresso_em is not null
 and (criado_em at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date for update;
 if not found then raise exception 'Pedido indisponível para reimpressão hoje'; end if;
 if exists(select 1 from public.rdm_reimpressoes where id=p_chave and pedido_id=p_id) then return jsonb_build_object('ok',true); end if;
 if exists(select 1 from public.rdm_reimpressoes where id=p_chave) then raise exception 'Identificador já utilizado'; end if;
 if exists(select 1 from public.rdm_reimpressoes where pedido_id=p_id and estado in ('pendente','processando')) then raise exception 'Reimpressão já pendente'; end if;
 insert into public.rdm_reimpressoes(id,pedido_id,solicitado_por) values(p_chave,p_id,null);
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.rdm_local_criar(jsonb),public.rdm_local_historico(),public.rdm_local_reimprimir(uuid,uuid) from public,anon,authenticated;
grant execute on function public.rdm_local_criar(jsonb),public.rdm_local_historico(),public.rdm_local_reimprimir(uuid,uuid) to service_role;
commit;
