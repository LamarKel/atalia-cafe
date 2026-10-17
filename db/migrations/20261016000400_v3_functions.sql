-- 0004 · Funciones y triggers de la v3
-- Todas con search_path fijo. Las SECURITY DEFINER solo las ejecuta service_role (el Worker),
-- salvo las de rol de admin, que usan las políticas RLS.

-- ─────────────────────────────────────────────────────────────
-- Roles del admin (RNF-S08: 2FA obligatorio → aal2)
-- ─────────────────────────────────────────────────────────────

create or replace function public.admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.admin_profiles p
  where p.user_id = auth.uid()
    and p.active
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;

-- owner ⊃ admin ⊃ staff
create or replace function public.has_admin_role(required text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case public.admin_role()
    when 'owner' then true
    when 'admin' then required in ('admin', 'staff')
    when 'staff' then required = 'staff'
    else false
  end
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.admin_role() is not null
$$;

-- Siempre tiene que quedar al menos un owner activo
create or replace function public.admin_profiles_keep_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'owner' and old.active
     and (tg_op = 'DELETE' or new.role <> 'owner' or not new.active)
     and not exists (
       select 1 from public.admin_profiles p
       where p.role = 'owner' and p.active and p.user_id <> old.user_id)
  then
    raise exception 'last_owner' using errcode = 'P0001', hint = 'Debe quedar al menos un owner activo.';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger admin_profiles_keep_owner
before update or delete on public.admin_profiles
for each row execute function public.admin_profiles_keep_owner();

-- ─────────────────────────────────────────────────────────────
-- Auditoría (RNF-S11)
-- ─────────────────────────────────────────────────────────────

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_diff jsonb;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_array(v_old -> n.key, n.value))
      into v_diff
    from jsonb_each(v_new) n
    where n.key not in ('updated_at', 'search')
      and (v_old -> n.key) is distinct from n.value;
    if v_diff is null then
      return null; -- nada cambió
    end if;
  else
    v_diff := v_row - 'search';
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id, diff)
  values (
    auth.uid(), tg_op, tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'key', v_row ->> 'user_id', v_row ->> 'store_id'),
    v_diff);
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'admin_profiles', 'business_settings', 'stores', 'pickup_locations', 'business_hours', 'closed_days',
    'business_rules', 'site_content', 'categories', 'products', 'product_images', 'product_sizes',
    'product_extras', 'product_nutritional_info', 'product_inclusions', 'picadera_options', 'promo_codes',
    'capacity_rules', 'orders'
  ]
  loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()',
      t || '_audit', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Reglas configurables
-- ─────────────────────────────────────────────────────────────

-- Valor vigente de una regla: la de la tienda gana a la global; dentro de cada una, la vigencia más reciente.
-- Devuelve null si nadie la configuró (el código usa el valor por defecto del registro).
create or replace function public.get_rule(p_key text, p_store uuid default null, p_at timestamptz default now())
returns jsonb
language sql
stable
set search_path = ''
as $$
  select r.value
  from public.business_rules r
  where r.key = p_key
    and (r.store_id is null or r.store_id = p_store)
    and r.effective_from <= p_at
  order by (r.store_id is not null) desc, r.effective_from desc
  limit 1
$$;

-- ─────────────────────────────────────────────────────────────
-- Pedidos: protección, historial y picaderas
-- ─────────────────────────────────────────────────────────────

-- Desde el admin (rol authenticated) solo se puede cambiar el estado operativo y la revisión.
-- Dinero, pago, cliente y cancelaciones van por el Worker (service_role).
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
     and not public.has_admin_role('admin') then
    raise exception 'order_review_requires_admin' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger orders_guard
before update on public.orders
for each row execute function public.orders_guard();

-- Devuelve el cupo de un intento de compra. p_include_converted = true también libera el de pedidos pagados
-- (cancelación o reembolso). Devuelve cuántas retenciones liberó.
create or replace function public.release_holds(p_token uuid, p_include_converted boolean default false)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  with h as (
    update public.slot_holds sh
       set released_at = now()
     where sh.checkout_token = p_token
       and sh.released_at is null
       and (p_include_converted or sh.converted_at is null)
    returning sh.slot_id, sh.day_id, sh.qty
  ),
  s as (
    update public.capacity_slots cs
       set reserved_units = cs.reserved_units - x.q
      from (select slot_id, sum(qty)::int as q from h group by slot_id) x
     where cs.id = x.slot_id
    returning 1
  ),
  d as (
    update public.capacity_days cd
       set reserved_units = cd.reserved_units - x.q
      from (select day_id, sum(qty)::int as q from h group by day_id) x
     where cd.id = x.day_id
    returning 1
  )
  select count(*) into v_count from h;
  return v_count;
end;
$$;

create or replace function public.orders_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.status is distinct from old.status
     or new.payment_status is distinct from old.payment_status then
    insert into public.order_status_history (order_id, status, payment_status, actor_id)
    values (new.id, new.status, new.payment_status, auth.uid());
  end if;

  if tg_op = 'UPDATE'
     and new.status in ('cancelled', 'refunded')
     and old.status not in ('cancelled', 'refunded') then
    perform public.release_holds(new.checkout_token, true);
  end if;

  return null;
end;
$$;

create trigger orders_after_change
after insert or update on public.orders
for each row execute function public.orders_after_change();

-- RF06: en una picadera, la suma de piezas tiene que ser exactamente el tamaño del paquete.
-- Se valida al final de la transacción (deferred), cuando el ítem y sus piezas ya están insertados.
create or replace function public.check_picadera_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_id uuid;
  v_type text;
  v_units int;
  v_sum int;
begin
  v_item_id := (case tg_table_name
    when 'order_items' then to_jsonb(coalesce(new, old)) ->> 'id'
    else to_jsonb(coalesce(new, old)) ->> 'order_item_id'
  end)::uuid;

  select oi.product_type, oi.units into v_type, v_units
  from public.order_items oi where oi.id = v_item_id;

  if not found then
    return null; -- el ítem se borró (cascada)
  end if;

  select coalesce(sum(c.qty), 0) into v_sum
  from public.order_item_components c where c.order_item_id = v_item_id;

  if v_type = 'picadera_pack' and v_sum <> v_units then
    raise exception 'picadera_count_mismatch: % piezas para un paquete de %', v_sum, v_units using errcode = '23514';
  elsif v_type <> 'picadera_pack' and v_sum > 0 then
    raise exception 'components_only_for_picadera' using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger order_items_check_picadera
after insert or update on public.order_items
deferrable initially deferred
for each row execute function public.check_picadera_item();

create constraint trigger order_item_components_check_picadera
after insert or update or delete on public.order_item_components
deferrable initially deferred
for each row execute function public.check_picadera_item();

-- ─────────────────────────────────────────────────────────────
-- Capacidad
-- ─────────────────────────────────────────────────────────────

-- Reserva atómica (RNF-C03). Lanza un error si el día está cerrado, la hora está fuera del horario
-- o no hay cupo; en ese caso toda la transacción (el pedido incluido) se revierte.
create or replace function public.reserve_slot(
  p_token uuid,
  p_store uuid,
  p_date date,
  p_slot time,
  p_category text,
  p_qty int,
  p_hold_minutes int default 35
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dow smallint := extract(dow from p_date);
  v_hours public.business_hours;
  v_rule public.capacity_rules;
  v_day uuid;
  v_slot uuid;
  v_hold uuid;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'invalid_qty' using errcode = '22023';
  end if;
  if p_hold_minutes is null or p_hold_minutes < 31 then
    raise exception 'hold_must_outlast_stripe_session' using errcode = '22023'; -- REGLAS.md A1
  end if;
  if exists (select 1 from public.closed_days c where c.store_id = p_store and c.date = p_date) then
    raise exception 'closed_day' using errcode = 'P0001';
  end if;

  select * into v_hours from public.business_hours bh where bh.store_id = p_store and bh.weekday = v_dow;
  if not found or p_slot < v_hours.opens_at or p_slot >= v_hours.closes_at then
    raise exception 'outside_hours' using errcode = 'P0001';
  end if;

  select * into v_rule from public.capacity_rules cr
  where cr.store_id = p_store and cr.weekday = v_dow and cr.category = p_category;

  insert into public.capacity_days (store_id, date, category, max_units)
  values (p_store, p_date, p_category, v_rule.max_units_per_day)
  on conflict (store_id, date, category) do nothing;

  insert into public.capacity_slots (store_id, date, slot_start, category, max_units)
  values (p_store, p_date, p_slot, p_category, v_rule.max_units_per_slot)
  on conflict (store_id, date, slot_start, category) do nothing;

  update public.capacity_days cd
     set reserved_units = cd.reserved_units + p_qty
   where cd.store_id = p_store and cd.date = p_date and cd.category = p_category
     and (cd.max_units is null or cd.reserved_units + p_qty <= cd.max_units)
  returning cd.id into v_day;
  if v_day is null then
    raise exception 'day_full' using errcode = 'P0001';
  end if;

  update public.capacity_slots cs
     set reserved_units = cs.reserved_units + p_qty
   where cs.store_id = p_store and cs.date = p_date and cs.slot_start = p_slot and cs.category = p_category
     and (cs.max_units is null or cs.reserved_units + p_qty <= cs.max_units)
  returning cs.id into v_slot;
  if v_slot is null then
    raise exception 'slot_full' using errcode = 'P0001';
  end if;

  insert into public.slot_holds (checkout_token, slot_id, day_id, qty, expires_at)
  values (p_token, v_slot, v_day, p_qty, now() + make_interval(mins => p_hold_minutes))
  returning id into v_hold;

  return v_hold;
end;
$$;

-- Cron cada minuto: libera las retenciones vencidas y cancela los pedidos que nunca se pagaron.
create or replace function public.release_expired_holds()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid;
  v_count int := 0;
begin
  for v_token in
    select distinct sh.checkout_token
    from public.slot_holds sh
    where sh.converted_at is null and sh.released_at is null and sh.expires_at < now()
  loop
    v_count := v_count + public.release_holds(v_token, false);
    update public.orders o
       set status = 'cancelled', cancelled_at = now(), cancelled_by = 'system', cancelled_reason = 'checkout_expired'
     where o.checkout_token = v_token and o.status = 'pending_payment' and o.payment_status = 'unpaid';
  end loop;
  return v_count;
end;
$$;

-- Si el admin cambia la capacidad, se actualizan los días futuros ya abiertos (sin bajar de lo ya reservado).
create or replace function public.capacity_rules_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.capacity_rules := coalesce(new, old);
  v_day_max int := case when tg_op = 'DELETE' then null else new.max_units_per_day end;
  v_slot_max int := case when tg_op = 'DELETE' then null else new.max_units_per_slot end;
begin
  update public.capacity_days cd
     set max_units = case when v_day_max is null then null else greatest(v_day_max, cd.reserved_units) end
   where cd.store_id = r.store_id and cd.category = r.category
     and cd.date >= current_date and extract(dow from cd.date) = r.weekday;

  update public.capacity_slots cs
     set max_units = case when v_slot_max is null then null else greatest(v_slot_max, cs.reserved_units) end
   where cs.store_id = r.store_id and cs.category = r.category
     and cs.date >= current_date and extract(dow from cs.date) = r.weekday;

  return null;
end;
$$;

create trigger capacity_rules_sync
after insert or update or delete on public.capacity_rules
for each row execute function public.capacity_rules_sync();

-- Calendario del checkout: franjas de cada día con su disponibilidad para lo que hay en el carrito.
-- p_needs: {"tray": 2, "picadera_pack": 1}. p_lead_hours: la anticipación más larga del carrito.
create or replace function public.available_slots(
  p_store uuid,
  p_from date,
  p_to date,
  p_needs jsonb,
  p_lead_hours int
)
returns table (slot_date date, slot_start time, starts_at timestamptz, available boolean, reason text)
language sql
stable
security definer
set search_path = ''
as $$
  with params as (
    select s.timezone as tz,
           coalesce((public.get_rule('time.slot_minutes', p_store))::int, 60) as slot_min,
           coalesce((public.get_rule('time.max_days_ahead', p_store))::int, 60) as max_days
    from public.stores s
    where s.id = p_store
  ),
  days as (
    select d::date as dt
    from params p, generate_series(p_from, least(p_to, current_date + p.max_days), interval '1 day') d
  ),
  slots as (
    select days.dt, (bh.opens_at + make_interval(mins => n * p.slot_min))::time as st, p.tz
    from days
    join public.business_hours bh on bh.store_id = p_store and bh.weekday = extract(dow from days.dt)
    cross join params p
    cross join lateral generate_series(
      0, (floor(extract(epoch from (bh.closes_at - bh.opens_at)) / 60 / p.slot_min))::int - 1) n
  ),
  needs as (
    select e.key as category, e.value::int as qty
    from jsonb_each_text(coalesce(p_needs, '{}'::jsonb)) e
  ),
  eval as (
    select
      sl.dt,
      sl.st,
      (sl.dt + sl.st) at time zone sl.tz as starts_at,
      exists (select 1 from public.closed_days c where c.store_id = p_store and c.date = sl.dt) as is_closed,
      ((sl.dt + sl.st) at time zone sl.tz) < now() + make_interval(hours => p_lead_hours) as too_soon,
      exists (
        select 1
        from needs nd
        left join public.capacity_rules cr
          on cr.store_id = p_store and cr.weekday = extract(dow from sl.dt) and cr.category = nd.category
        left join public.capacity_days cd
          on cd.store_id = p_store and cd.date = sl.dt and cd.category = nd.category
        left join public.capacity_slots cs
          on cs.store_id = p_store and cs.date = sl.dt and cs.slot_start = sl.st and cs.category = nd.category
        where (
            case when cd.id is not null then cd.max_units else cr.max_units_per_day end is not null
            and coalesce(cd.reserved_units, 0) + nd.qty >
                case when cd.id is not null then cd.max_units else cr.max_units_per_day end)
           or (
            case when cs.id is not null then cs.max_units else cr.max_units_per_slot end is not null
            and coalesce(cs.reserved_units, 0) + nd.qty >
                case when cs.id is not null then cs.max_units else cr.max_units_per_slot end)
      ) as is_full
    from slots sl
  )
  select
    e.dt, e.st, e.starts_at,
    not (e.is_closed or e.too_soon or e.is_full),
    case when e.is_closed then 'closed' when e.too_soon then 'lead_time' when e.is_full then 'full' end
  from eval e
  order by e.dt, e.st
$$;

-- ─────────────────────────────────────────────────────────────
-- Checkout (lo llama el Worker con service_role)
-- ─────────────────────────────────────────────────────────────

-- Crea el pedido, sus ítems y piezas, y reserva el cupo, todo en una transacción. Idempotente por
-- checkout_token: 20 llamadas con el mismo token crean 1 pedido (RNF-P01). Los montos los calcula el
-- Worker; la BD comprueba que cuadren (CHECKs + suma de líneas = subtotal).
--
-- p_order: {checkout_token, store_id, pickup_location_id?, promo_code_id?, customer_name, customer_phone,
--           customer_email, language, note?, scheduled_for, subtotal_cents, discount_cents, tax_rate_ppm,
--           tax_cents, tip_cents, total_cents, rules_snapshot}
-- p_items: [{product_id, size_id?, product_type, product_name_snapshot, size_label_snapshot?, serves?, units?,
--            extras?, notes?, unit_price_cents, quantity, components?: [{picadera_option_id, piece_label_snapshot, qty}]}]
-- p_reservations: [{date, slot_start, category, qty}]
create or replace function public.create_checkout_order(p_order jsonb, p_items jsonb, p_reservations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid := (p_order ->> 'checkout_token')::uuid;
  v_order public.orders;
  v_item jsonb;
  v_item_id uuid;
  v_res jsonb;
  v_sum int;
begin
  if v_token is null then
    raise exception 'checkout_token_required' using errcode = '22023';
  end if;

  select * into v_order from public.orders o where o.checkout_token = v_token;
  if found then
    return jsonb_build_object('order_id', v_order.id, 'code', v_order.code, 'access_token', v_order.access_token,
                              'status', v_order.status, 'existing', true);
  end if;

  insert into public.orders (
    checkout_token, store_id, pickup_location_id, promo_code_id, customer_name, customer_phone, customer_email,
    language, note, scheduled_for, subtotal_cents, discount_cents, tax_rate_ppm, tax_cents, tip_cents,
    total_cents, rules_snapshot)
  values (
    v_token,
    (p_order ->> 'store_id')::uuid,
    (p_order ->> 'pickup_location_id')::uuid,
    (p_order ->> 'promo_code_id')::uuid,
    p_order ->> 'customer_name',
    p_order ->> 'customer_phone',
    p_order ->> 'customer_email',
    coalesce(p_order ->> 'language', 'en'),
    p_order ->> 'note',
    (p_order ->> 'scheduled_for')::timestamptz,
    (p_order ->> 'subtotal_cents')::int,
    coalesce((p_order ->> 'discount_cents')::int, 0),
    (p_order ->> 'tax_rate_ppm')::int,
    (p_order ->> 'tax_cents')::int,
    coalesce((p_order ->> 'tip_cents')::int, 0),
    (p_order ->> 'total_cents')::int,
    coalesce(p_order -> 'rules_snapshot', '{}'::jsonb))
  on conflict (checkout_token) do nothing
  returning * into v_order;

  if v_order.id is null then
    -- Otra petición con el mismo token ganó la carrera
    select * into v_order from public.orders o where o.checkout_token = v_token;
    return jsonb_build_object('order_id', v_order.id, 'code', v_order.code, 'access_token', v_order.access_token,
                              'status', v_order.status, 'existing', true);
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items_required' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items (
      order_id, product_id, size_id, product_type, product_name_snapshot, size_label_snapshot, serves, units,
      extras, notes, unit_price_cents, quantity, line_total_cents)
    values (
      v_order.id,
      (v_item ->> 'product_id')::uuid,
      (v_item ->> 'size_id')::uuid,
      v_item ->> 'product_type',
      v_item ->> 'product_name_snapshot',
      v_item ->> 'size_label_snapshot',
      (v_item ->> 'serves')::int,
      (v_item ->> 'units')::int,
      coalesce(v_item -> 'extras', '[]'::jsonb),
      v_item ->> 'notes',
      (v_item ->> 'unit_price_cents')::int,
      (v_item ->> 'quantity')::int,
      (v_item ->> 'unit_price_cents')::int * (v_item ->> 'quantity')::int)
    returning id into v_item_id;

    insert into public.order_item_components (order_item_id, picadera_option_id, piece_label_snapshot, qty)
    select v_item_id, (c ->> 'picadera_option_id')::uuid, c ->> 'piece_label_snapshot', (c ->> 'qty')::int
    from jsonb_array_elements(coalesce(v_item -> 'components', '[]'::jsonb)) c;
  end loop;

  select sum(oi.line_total_cents) into v_sum from public.order_items oi where oi.order_id = v_order.id;
  if v_sum <> v_order.subtotal_cents then
    raise exception 'subtotal_mismatch: lines % <> subtotal %', v_sum, v_order.subtotal_cents using errcode = '23514';
  end if;

  for v_res in select * from jsonb_array_elements(coalesce(p_reservations, '[]'::jsonb))
  loop
    perform public.reserve_slot(
      v_token,
      v_order.store_id,
      (v_res ->> 'date')::date,
      (v_res ->> 'slot_start')::time,
      v_res ->> 'category',
      (v_res ->> 'qty')::int);
  end loop;

  return jsonb_build_object('order_id', v_order.id, 'code', v_order.code, 'access_token', v_order.access_token,
                            'status', v_order.status, 'existing', false);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Webhook de Stripe (lo llama el Worker después de verificar la firma)
-- ─────────────────────────────────────────────────────────────

-- checkout.session.completed / async_payment_succeeded.
-- Devuelve: confirmed | confirmed_needs_review | refund_required | already_paid | duplicate_event | order_not_found
create or replace function public.confirm_paid_order(
  p_event_id text,
  p_event_type text,
  p_session_id text,
  p_payment_intent_id text,
  p_amount_total_cents int,
  p_payment_method text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_lost int;
  v_review text[] := '{}';
  v_promo_ok boolean := true;
begin
  insert into public.stripe_events (event_id, type) values (p_event_id, p_event_type)
  on conflict (event_id) do nothing;
  if not found then
    return 'duplicate_event';
  end if;

  select * into v_order from public.orders o where o.stripe_session_id = p_session_id for update;
  if not found then
    return 'order_not_found';
  end if;
  if v_order.payment_status <> 'unpaid' then
    return 'already_paid';
  end if;

  -- A12: lo cobrado tiene que coincidir con el pedido
  if p_amount_total_cents is distinct from v_order.total_cents then
    v_review := array_append(v_review, format('amount_mismatch: stripe %s, pedido %s', p_amount_total_cents, v_order.total_cents));
  end if;

  -- A1: el pago llegó cuando el cupo ya se había liberado o el pedido ya se había cancelado
  select count(*) into v_lost
  from public.slot_holds sh
  where sh.checkout_token = v_order.checkout_token and sh.released_at is not null and sh.converted_at is null;
  if v_lost > 0 or v_order.status <> 'pending_payment' then
    v_review := array_append(v_review, 'paid_without_capacity');
  end if;

  -- B14: el contador del cupón sube solo al pagar, de forma atómica
  if v_order.promo_code_id is not null then
    update public.promo_codes pc
       set used_count = pc.used_count + 1
     where pc.id = v_order.promo_code_id
       and (pc.max_uses is null or pc.used_count < pc.max_uses);
    v_promo_ok := found;
    if not v_promo_ok then
      v_review := array_append(v_review, 'promo_limit_exceeded');
    end if;
  end if;

  update public.orders o
     set status = case when o.status = 'pending_payment' and v_lost = 0 then 'confirmed' else o.status end,
         payment_status = 'paid',
         paid_at = now(),
         payment_method = p_payment_method,
         stripe_payment_intent_id = p_payment_intent_id,
         needs_review = o.needs_review or cardinality(v_review) > 0,
         review_reason = nullif(concat_ws('; ', o.review_reason, nullif(array_to_string(v_review, '; '), '')), '')
   where o.id = v_order.id;

  if v_lost = 0 and v_order.status = 'pending_payment' then
    update public.slot_holds sh
       set converted_at = now()
     where sh.checkout_token = v_order.checkout_token and sh.released_at is null and sh.converted_at is null;

    update public.products p
       set stock_quantity = greatest(p.stock_quantity - x.q, 0),
           in_stock = p.stock_quantity - x.q > 0
      from (select oi.product_id, sum(oi.quantity)::int as q
              from public.order_items oi
             where oi.order_id = v_order.id and oi.product_id is not null
             group by oi.product_id) x
     where p.id = x.product_id and p.stock_enabled and p.stock_quantity is not null;

    return case when cardinality(v_review) = 0 then 'confirmed' else 'confirmed_needs_review' end;
  end if;

  return 'refund_required';
end;
$$;

-- checkout.session.expired / async_payment_failed: cancela el pedido sin pagar y libera el cupo.
create or replace function public.cancel_unpaid_checkout(
  p_event_id text,
  p_event_type text,
  p_session_id text,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stripe_events (event_id, type) values (p_event_id, p_event_type)
  on conflict (event_id) do nothing;
  if not found then
    return 'duplicate_event';
  end if;

  update public.orders o
     set status = 'cancelled',
         payment_status = case when p_event_type like '%failed%' then 'failed' else o.payment_status end,
         cancelled_at = now(),
         cancelled_by = 'system',
         cancelled_reason = left(p_reason, 500)
   where o.stripe_session_id = p_session_id
     and o.status = 'pending_payment'
     and o.payment_status = 'unpaid';

  return case when found then 'cancelled' else 'no_change' end;
end;
$$;

-- charge.refunded: guarda el total reembolsado que informa Stripe (valor absoluto, no incremento),
-- así un evento repetido o fuera de orden no reembolsa dos veces. A11: nunca más de lo pagado (CHECK).
create or replace function public.sync_refund(
  p_event_id text,
  p_event_type text,
  p_payment_intent_id text,
  p_amount_refunded_cents int
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_refunded int;
begin
  insert into public.stripe_events (event_id, type) values (p_event_id, p_event_type)
  on conflict (event_id) do nothing;
  if not found then
    return 'duplicate_event';
  end if;

  select * into v_order from public.orders o where o.stripe_payment_intent_id = p_payment_intent_id for update;
  if not found then
    return 'order_not_found';
  end if;

  v_refunded := greatest(v_order.refunded_cents, p_amount_refunded_cents);

  update public.orders o
     set refunded_cents = v_refunded,
         payment_status = case when v_refunded >= o.total_cents then 'refunded'
                               when v_refunded > 0 then 'partially_refunded'
                               else o.payment_status end,
         status = case when v_refunded >= o.total_cents and o.status not in ('picked_up', 'no_show') then 'refunded'
                       else o.status end
   where o.id = v_order.id;

  return case when v_refunded >= v_order.total_cents then 'refunded' else 'partially_refunded' end;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Reportes del admin
-- ─────────────────────────────────────────────────────────────

-- Ventas pagadas por hora local de la tienda (dashboard). Respeta RLS (security invoker).
create or replace function public.hourly_sales(p_store uuid, p_date date)
returns table (hour int, orders bigint, total_cents bigint)
language sql
stable
set search_path = ''
as $$
  select extract(hour from o.paid_at at time zone s.timezone)::int as hour,
         count(*) as orders,
         sum(o.total_cents - o.refunded_cents)::bigint as total_cents
  from public.orders o
  join public.stores s on s.id = o.store_id
  where o.store_id = p_store
    and o.payment_status in ('paid', 'partially_refunded')
    and (o.paid_at at time zone s.timezone)::date = p_date
  group by 1
  order by 1
$$;

-- ─────────────────────────────────────────────────────────────
-- Permisos de ejecución
-- ─────────────────────────────────────────────────────────────

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function public.admin_role() to authenticated;
grant execute on function public.has_admin_role(text) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.hourly_sales(uuid, date) to authenticated;
