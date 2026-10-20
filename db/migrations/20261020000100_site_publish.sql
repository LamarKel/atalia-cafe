-- Publicación automática del sitio (estático): lo que se edita en el panel se ve sin pedirle a nadie que compile.
--
-- 1) site_publish (una sola fila): cuándo hubo cambios (dirty_at), cuándo se pidió el último build
--    (requested_at) y cómo salió (last_status / last_error).
-- 2) Un trigger por sentencia en cada tabla que el sitio muestra marca dirty_at = now().
-- 3) claim_site_publish(): el Worker (cron cada minuto) la llama; devuelve true UNA vez por tanda de cambios,
--    cuando pasó al menos 1 minuto sin cambios nuevos (así 10 ediciones seguidas dan un solo build).
--    request_site_publish() lo pide ya ("Publicar ahora" en el panel). Ambas solo para service_role.
-- Disponibilidad, pedidos y precios del carrito no dependen de esto: los calcula el Worker en vivo.

begin;

create table public.site_publish (
  id           boolean primary key default true check (id),
  dirty_at     timestamptz,
  requested_at timestamptz,
  last_status  text check (last_status is null or last_status in ('ok', 'error')),
  last_error   text,
  updated_at   timestamptz not null default now()
);

insert into public.site_publish (id) values (true);

alter table public.site_publish enable row level security;

-- El panel lee el estado (cualquier persona del equipo con 2FA); nadie lo escribe directo.
create policy staff_read on public.site_publish for select to authenticated using (private.is_admin());

create or replace function public.mark_site_dirty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.site_publish set dirty_at = now(), updated_at = now() where id;
  return null;
end;
$$;

revoke execute on function public.mark_site_dirty() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'business_hours', 'business_rules', 'business_settings', 'categories', 'picadera_options',
    'pickup_locations', 'product_extras', 'product_images', 'product_inclusions',
    'product_nutritional_info', 'product_sizes', 'products', 'site_content', 'stores'
  ]
  loop
    execute format(
      'create trigger site_dirty after insert or update or delete or truncate on public.%I '
      'for each statement execute function public.mark_site_dirty()', t);
  end loop;
end $$;

create or replace function public.claim_site_publish(p_quiet_seconds int default 60)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed boolean;
begin
  update public.site_publish s
     set requested_at = now(), updated_at = now()
   where s.id
     and s.dirty_at is not null
     and s.dirty_at <= now() - make_interval(secs => p_quiet_seconds)
     and (s.requested_at is null or s.dirty_at > s.requested_at)
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$$;

create or replace function public.request_site_publish()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.site_publish set requested_at = now(), updated_at = now() where id;
$$;

create or replace function public.finish_site_publish(p_ok boolean, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.site_publish
     set last_status = case when p_ok then 'ok' else 'error' end,
         last_error = case when p_ok then null else left(p_error, 500) end,
         -- si falló, se vuelve a intentar en la siguiente vuelta del cron
         requested_at = case when p_ok then requested_at else null end,
         updated_at = now()
   where id;
$$;

revoke execute on function public.claim_site_publish(int) from public, anon, authenticated;
revoke execute on function public.request_site_publish() from public, anon, authenticated;
revoke execute on function public.finish_site_publish(boolean, text) from public, anon, authenticated;
grant execute on function public.claim_site_publish(int) to service_role;
grant execute on function public.request_site_publish() to service_role;
grant execute on function public.finish_site_publish(boolean, text) to service_role;

commit;
