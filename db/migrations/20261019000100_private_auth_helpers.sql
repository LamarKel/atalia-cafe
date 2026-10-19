-- Fase 5 · Seguridad: las funciones de rol del panel salen del esquema expuesto por la API de datos.
--
-- admin_role(), has_admin_role() e is_admin() son SECURITY DEFINER y las usan las políticas RLS, así que
-- authenticated necesita EXECUTE. En public, PostgREST además las publica como /rest/v1/rpc/… (advisor 0029).
-- En el esquema private (que PostgREST no expone) las políticas siguen funcionando igual: Postgres guarda la
-- referencia por OID, no por nombre. Solo hay que reescribir los cuerpos que las llaman por nombre.

begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

alter function public.admin_role() set schema private;
alter function public.has_admin_role(text) set schema private;
alter function public.is_admin() set schema private;

create or replace function private.has_admin_role(required text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case private.admin_role()
    when 'owner' then true
    when 'admin' then required in ('admin', 'staff')
    when 'staff' then required = 'staff'
    else false
  end
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.admin_role() is not null
$$;

-- Solo las políticas (que se evalúan como el usuario) las ejecutan; nunca anon directamente.
revoke execute on function private.admin_role() from public, anon;
revoke execute on function private.has_admin_role(text) from public, anon;
revoke execute on function private.is_admin() from public, anon;
grant execute on function private.admin_role() to authenticated;
grant execute on function private.has_admin_role(text) to authenticated;
grant execute on function private.is_admin() to authenticated;

create or replace function public.orders_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  editable constant text[] := array['status', 'needs_review', 'review_reason', 'updated_at'];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if (to_jsonb(new) - editable) is distinct from (to_jsonb(old) - editable) then
    raise exception 'order_field_not_editable' using errcode = '42501';
  end if;

  if new.status is distinct from old.status and (old.status, new.status) not in (
    ('confirmed', 'preparing'), ('preparing', 'ready'), ('ready', 'picked_up'),
    ('preparing', 'confirmed'), ('ready', 'preparing'),
    ('confirmed', 'no_show'), ('preparing', 'no_show'), ('ready', 'no_show')
  ) then
    raise exception 'invalid_status_transition: % -> %', old.status, new.status using errcode = 'P0001';
  end if;

  if (new.needs_review is distinct from old.needs_review or new.review_reason is distinct from old.review_reason)
     and not private.has_admin_role('admin') then
    raise exception 'order_review_requires_admin' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Advisor 0001: FK sin índice
create index if not exists quote_requests_store_idx on public.quote_requests (store_id);

commit;
