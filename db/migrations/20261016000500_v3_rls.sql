-- 0005 · Seguridad: RLS, permisos de columnas, Storage y Realtime (RNF-S03)
--   anon           → solo lee el catálogo activo, los textos publicados y la identidad del negocio.
--   authenticated  → nada, salvo que sea admin con 2FA (is_admin / has_admin_role, aal2).
--   service_role   → el Worker; ignora RLS. Es el único que crea pedidos y toca pagos y capacidad.

-- RLS en todas las tablas de public
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Lectura pública (catálogo activo)
-- ─────────────────────────────────────────────────────────────

create policy public_read on public.categories for select to anon, authenticated using (active);
create policy public_read on public.products for select to anon, authenticated using (active);
create policy public_read on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.active));
create policy public_read on public.product_sizes for select to anon, authenticated
  using (active and exists (select 1 from public.products p where p.id = product_id and p.active));
create policy public_read on public.product_extras for select to anon, authenticated
  using (active and exists (select 1 from public.products p where p.id = product_id and p.active));
create policy public_read on public.product_nutritional_info for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.active));
create policy public_read on public.product_inclusions for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.active));
create policy public_read on public.picadera_options for select to anon, authenticated using (active);
create policy public_read on public.stores for select to anon, authenticated using (active);
create policy public_read on public.pickup_locations for select to anon, authenticated using (active);
create policy public_read on public.business_hours for select to anon, authenticated using (true);
create policy public_read on public.closed_days for select to anon, authenticated using (date >= current_date);
create policy public_read on public.business_settings for select to anon, authenticated using (true);
create policy public_read on public.site_content for select to anon, authenticated using (true);

-- site_content: anon nunca ve el borrador (permiso por columna)
revoke select on public.site_content from anon;
grant select (key, locale, value, updated_at) on public.site_content to anon;

-- ─────────────────────────────────────────────────────────────
-- Admin (authenticated + rol + 2FA)
-- ─────────────────────────────────────────────────────────────

-- Catálogo, contenido, horario y capacidad: admin u owner
do $$
declare t text;
begin
  foreach t in array array[
    'categories', 'products', 'product_images', 'product_sizes', 'product_extras', 'product_nutritional_info',
    'product_inclusions', 'picadera_options', 'stores', 'pickup_locations', 'business_hours', 'closed_days',
    'business_settings', 'site_content', 'capacity_rules', 'promo_codes'
  ]
  loop
    execute format(
      'create policy admin_all on public.%I for all to authenticated
         using (public.has_admin_role(''admin'')) with check (public.has_admin_role(''admin''))', t);
  end loop;
end $$;

-- Lectura para todo el equipo (staff incluido)
do $$
declare t text;
begin
  foreach t in array array[
    'capacity_rules', 'capacity_days', 'capacity_slots', 'orders', 'order_items', 'order_item_components',
    'order_status_history', 'pickup_locations', 'stores', 'business_hours', 'closed_days'
  ]
  loop
    execute format(
      'create policy staff_read on public.%I for select to authenticated using (public.is_admin())', t);
  end loop;
end $$;

-- Pedidos: el equipo solo cambia el estado operativo (orders_guard limita columnas y transiciones).
-- Crear, cancelar, cobrar y reembolsar va por el Worker.
create policy staff_update on public.orders for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Reglas: las de dinero solo el owner; el resto, admin u owner (REGLAS.md, "Quién edita")
create policy admin_read on public.business_rules for select to authenticated using (public.is_admin());
create policy rules_write on public.business_rules for all to authenticated
  using (
    case when split_part(key, '.', 1) in ('payments', 'tax', 'refunds', 'deposit', 'tips', 'promos')
         then public.has_admin_role('owner') else public.has_admin_role('admin') end)
  with check (
    case when split_part(key, '.', 1) in ('payments', 'tax', 'refunds', 'deposit', 'tips', 'promos')
         then public.has_admin_role('owner') else public.has_admin_role('admin') end);

-- Equipo: cada uno ve su perfil; el owner administra todos
create policy self_read on public.admin_profiles for select to authenticated using (user_id = auth.uid());
create policy owner_all on public.admin_profiles for all to authenticated
  using (public.has_admin_role('owner')) with check (public.has_admin_role('owner'));

-- Bitácora y eventos de Stripe: solo lectura para admin u owner
create policy admin_read on public.audit_log for select to authenticated using (public.has_admin_role('admin'));
create policy admin_read on public.stripe_events for select to authenticated using (public.has_admin_role('admin'));
create policy admin_read on public.slot_holds for select to authenticated using (public.has_admin_role('admin'));

-- Sin política = sin acceso para anon/authenticated:
--   escritura en orders (salvo staff_update), order_items, order_item_components, order_status_history,
--   capacity_days, capacity_slots, slot_holds, stripe_events, audit_log.

-- ─────────────────────────────────────────────────────────────
-- Storage: lectura pública, escritura solo admin con 2FA
-- ─────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 5242880, array['image/webp', 'image/jpeg', 'image/png', 'image/avif']),
  ('site-media',     'site-media',     true, 5242880, array['image/webp', 'image/jpeg', 'image/png', 'image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'media_public_read') then
    create policy media_public_read on storage.objects for select to anon, authenticated
      using (bucket_id in ('product-images', 'site-media'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'media_admin_insert') then
    create policy media_admin_insert on storage.objects for insert to authenticated
      with check (bucket_id in ('product-images', 'site-media') and public.has_admin_role('admin'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'media_admin_update') then
    create policy media_admin_update on storage.objects for update to authenticated
      using (bucket_id in ('product-images', 'site-media') and public.has_admin_role('admin'))
      with check (bucket_id in ('product-images', 'site-media') and public.has_admin_role('admin'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'media_admin_remove') then
    create policy media_admin_remove on storage.objects for delete to authenticated
      using (bucket_id in ('product-images', 'site-media') and public.has_admin_role('admin'));
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Realtime: agenda de pedidos en vivo en el admin (RF19). Respeta RLS.
-- ─────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    execute 'alter publication supabase_realtime add table public.orders';
  end if;
end $$;
