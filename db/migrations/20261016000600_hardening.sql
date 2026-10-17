-- 0006 · Ajustes según los advisors de Supabase (2026-10-16)

-- Índices para las claves foráneas sin índice (unindexed_foreign_keys)
create index if not exists business_rules_store_idx on public.business_rules (store_id);
create index if not exists business_rules_updated_by_idx on public.business_rules (updated_by);
create index if not exists order_item_components_option_idx on public.order_item_components (picadera_option_id);
create index if not exists order_items_product_idx on public.order_items (product_id);
create index if not exists order_items_size_idx on public.order_items (size_id);
create index if not exists order_status_history_actor_idx on public.order_status_history (actor_id);
create index if not exists orders_pickup_location_idx on public.orders (pickup_location_id);
create index if not exists orders_promo_code_idx on public.orders (promo_code_id);
create index if not exists site_content_updated_by_idx on public.site_content (updated_by);
create index if not exists slot_holds_day_idx on public.slot_holds (day_id);
create index if not exists slot_holds_slot_idx on public.slot_holds (slot_id);

-- auth.uid() evaluado una sola vez por consulta, no por fila (auth_rls_initplan)
alter policy self_read on public.admin_profiles using (user_id = (select auth.uid()));

-- Funciones archivadas de la v2 con search_path fijo (function_search_path_mutable)
do $$
declare f text;
begin
  foreach f in array array[
    'verify_admin_password(text, text)', 'validate_promo_code(text, numeric)', 'decrement_stock()',
    'get_hourly_sales(date)', 'update_updated_at()'
  ]
  loop
    if to_regprocedure('v2_archive.' || f) is not null then
      execute format('alter function v2_archive.%s set search_path = %L', f, '');
    end if;
  end loop;
end $$;
