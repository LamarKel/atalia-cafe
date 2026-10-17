-- 0002 · Archivo del esquema v2
-- Las tablas y funciones de la v2 (solo datos de prueba) se mueven al esquema v2_archive, que no está
-- expuesto en la API y al que anon/authenticated no tienen acceso. Quedan como respaldo, sin borrar nada.
-- Las 15 categorías del menú se vuelven a cargar en public desde db/seed/staging.sql con los mismos IDs.
-- Idempotente: en un proyecto nuevo (producción) no encuentra nada que mover.

create schema if not exists v2_archive;
revoke all on schema v2_archive from public, anon, authenticated;

do $$
declare
  t text;
  f text;
begin
  foreach t in array array[
    'order_status_history', 'order_items', 'orders', 'promo_codes', 'product_nutritional_info',
    'product_extras', 'product_sizes', 'product_images', 'products', 'pickup_locations', 'stores',
    'categories', 'business_settings', 'admin_users'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I set schema v2_archive', t);
    end if;
  end loop;

  foreach f in array array[
    'verify_admin_password(text, text)', 'validate_promo_code(text, numeric)', 'decrement_stock()',
    'get_hourly_sales(date)', 'update_updated_at()'
  ]
  loop
    if to_regprocedure('public.' || f) is not null then
      execute format('alter function public.%s set schema v2_archive', f);
    end if;
  end loop;
end $$;
