-- CarolOS 013 | endurecer as funções, a pedido do linter de segurança.
--
-- Três coisas:
--
-- 1. `search_path` fixo nas funções que o não tinham. Sem ele, quem conseguir
--    criar um esquema no caminho de pesquisa pode fazer sombra a uma função ou
--    operador que a nossa usa e mudar o que ela faz.
--
-- 2. `is_carolos_user()` e `carolos_user_id()` deixam de ser chamáveis por
--    `anon` via /rest/v1/rpc. Não vazavam nada — devolvem null sem sessão — mas
--    uma função SECURITY DEFINER exposta a quem não está autenticado é
--    superfície que não precisa de existir. Ficam disponíveis para
--    `authenticated`, que é quem as policies avaliam.
--
-- Deliberadamente NÃO corrigido: o aviso de que `integration_connection` tem
-- RLS sem policies. É exactamente o desenho — a tabela guarda tokens de OAuth
-- e só o service role, do lado do servidor, lhe deve chegar.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.quote_freeze_sent()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status in ('sent', 'accepted', 'rejected')
     and (new.line_items is distinct from old.line_items
       or new.base_cents is distinct from old.base_cents
       or new.recommended_cents is distinct from old.recommended_cents
       or new.final_cents is distinct from old.final_cents
       or new.rights_snapshot is distinct from old.rights_snapshot
       or new.pricing_policy_version is distinct from old.pricing_policy_version) then
    raise exception 'quote % is already sent; create a new version instead of mutating history', old.id;
  end if;
  return new;
end;
$$;

create or replace function public.carolos_normalize(v text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(
           lower(translate(coalesce(v, ''),
             'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÑñÇç',
             'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc')),
           '[^a-z0-9]+', '', 'g')
$$;

revoke execute on function public.is_carolos_user() from anon, public;
revoke execute on function public.carolos_user_id() from anon, public;
grant execute on function public.is_carolos_user() to authenticated;
grant execute on function public.carolos_user_id() to authenticated;
