-- Pruebas de las migraciones v3 (se corren después de stub + migraciones + seed).
-- Cada bloque imprime PASS o aborta con FAIL (psql -v ON_ERROR_STOP=1).

\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- Ayudante: ejecuta SQL y exige un error cuyo mensaje coincida con el patrón.
-- 'set constraints all immediate' dispara los triggers diferidos dentro del bloque para poder atraparlos.
create or replace function public.t_expect_error(p_sql text, p_pattern text, p_label text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    set constraints all immediate;
  exception when others then
    if sqlerrm ~* p_pattern then
      raise notice 'PASS: % (%)', p_label, sqlerrm;
      return;
    end if;
    raise exception 'FAIL: % → error inesperado: %', p_label, sqlerrm;
  end;
  raise exception 'FAIL: % → se esperaba un error que coincida con "%"', p_label, p_pattern;
end $$;

-- Fecha de prueba: un sábado al menos 7 días adelante (horario 08–22)
create or replace function public.t_sat() returns date language sql as $$
  select current_date + (((6 - extract(dow from current_date)::int) + 7) % 7 + 7)
$$;

-- ─────────────────────────────────────────────────────────────
-- 0. Contención y archivo de la v2 (sin borrar nada)
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('v2_archive.categories') is null or to_regclass('v2_archive.admin_users') is null then
    raise exception 'FAIL: las tablas de la v2 no se archivaron';
  end if;
  if (select count(*) from v2_archive.admin_users) <> 1 then
    raise exception 'FAIL: el archivo perdió datos';
  end if;
  if to_regprocedure('v2_archive.verify_admin_password(text, text)') is null then
    raise exception 'FAIL: la función de la v2 no se archivó';
  end if;
  if exists (select 1 from pg_policies
             where policyname in ('Allow public deletes', 'Public Upload')
               and coalesce(qual, with_check) <> 'false') then
    raise exception 'FAIL: quedó una política abierta de la v2 en Storage';
  end if;
  raise notice 'PASS: la v2 quedó archivada en v2_archive con sus datos, y sus políticas neutralizadas';
end $$;

begin;
set local role anon;
select public.t_expect_error($q$ select * from v2_archive.admin_users $q$,
  'permission denied', 'anon no puede leer el archivo de la v2');
rollback;

-- ─────────────────────────────────────────────────────────────
-- Datos de prueba
-- ─────────────────────────────────────────────────────────────

select public.t_expect_error(
  $q$ insert into public.products (category_id, type, name_en) values ('41d2e519-e5f3-4940-91ef-4afe27ad92c9', 'menu', 'No price') $q$,
  'products_check', 'un producto del menú sin precio no se guarda');

insert into public.products (id, category_id, type, slug, name_en, name_es, price_cents, min_lead_hours, active)
values ('11111111-0000-4000-8000-000000000001', 'c47e0000-0000-4000-8000-000000000001', 'tray', 'test-breakfast-tray',
        'Breakfast tray', 'Bandeja de desayuno', null, 24, true),
       ('11111111-0000-4000-8000-000000000002', 'c47e0000-0000-4000-8000-000000000003', 'picadera_pack', 'test-picadera',
        'Picadera', 'Picadera', null, 1, true),
       ('11111111-0000-4000-8000-000000000003', '41d2e519-e5f3-4940-91ef-4afe27ad92c9', 'menu', null,
        'Latte', 'Latte', 550, 0, true),
       ('11111111-0000-4000-8000-000000000004', '41d2e519-e5f3-4940-91ef-4afe27ad92c9', 'menu', null,
        'Hidden', 'Oculto', 550, 0, false);
insert into public.product_sizes (id, product_id, name_en, serves, units, price_cents)
values ('22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', '10 people', 10, null, 8500),
       ('22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000002', '10 pieces', null, 10, 2000);
insert into public.capacity_rules (store_id, weekday, category, max_units_per_slot, max_units_per_day)
values ('69de0e2e-c905-4d36-93f6-446572005410', 6, 'tray', 2, 3);
insert into public.promo_codes (id, code, discount_type, discount_ppm, max_uses)
values ('33333333-0000-4000-8000-000000000001', 'HOLA10', 'percentage', 100000, 1);

-- Arma un pedido de prueba: 1 bandeja (8500) + 1 picadera de 10 (2000) = 10500; impuesto 6.625 % = 696
create or replace function public.t_order(p_token uuid, p_tray_qty int default 1, p_components jsonb default null,
                                          p_slot text default '11:00', p_subtotal int default null, p_promo uuid default null)
returns jsonb language plpgsql as $$
declare
  v_sub int := coalesce(p_subtotal, 8500 * p_tray_qty + 2000);
  v_tax int := round(v_sub * 66250 / 1000000.0);
begin
  return public.create_checkout_order(
    jsonb_build_object(
      'checkout_token', p_token, 'store_id', '69de0e2e-c905-4d36-93f6-446572005410',
      'promo_code_id', p_promo,
      'customer_name', 'Test Customer', 'customer_phone', '+1 973 555 0100', 'customer_email', 'test@example.com',
      'language', 'es', 'scheduled_for', (public.t_sat() + p_slot::time) at time zone 'America/New_York',
      'subtotal_cents', v_sub, 'discount_cents', 0, 'tax_rate_ppm', 66250, 'tax_cents', v_tax,
      'tip_cents', 0, 'total_cents', v_sub + v_tax, 'rules_snapshot', '{"tax.rate_ppm": 66250}'),
    jsonb_build_array(
      jsonb_build_object('product_id', '11111111-0000-4000-8000-000000000001', 'size_id', '22222222-0000-4000-8000-000000000001',
        'product_type', 'tray', 'product_name_snapshot', 'Bandeja de desayuno', 'serves', 10,
        'unit_price_cents', 8500, 'quantity', p_tray_qty),
      jsonb_build_object('product_id', '11111111-0000-4000-8000-000000000002', 'size_id', '22222222-0000-4000-8000-000000000002',
        'product_type', 'picadera_pack', 'product_name_snapshot', 'Picadera', 'units', 10,
        'unit_price_cents', 2000, 'quantity', 1,
        'components', coalesce(p_components, '[
          {"picadera_option_id": "91c4de00-0000-4000-8000-000000000001", "piece_label_snapshot": "Quipe · Res", "qty": 4},
          {"picadera_option_id": "91c4de00-0000-4000-8000-000000000003", "piece_label_snapshot": "Empanada · Pollo", "qty": 3},
          {"picadera_option_id": "91c4de00-0000-4000-8000-000000000007", "piece_label_snapshot": "Bollito · Queso", "qty": 3}]'::jsonb))),
    jsonb_build_array(
      jsonb_build_object('date', public.t_sat(), 'slot_start', p_slot, 'category', 'tray', 'qty', p_tray_qty),
      jsonb_build_object('date', public.t_sat(), 'slot_start', p_slot, 'category', 'picadera_pack', 'qty', 1)));
end $$;

-- ─────────────────────────────────────────────────────────────
-- 1. Código de pedido aleatorio
-- ─────────────────────────────────────────────────────────────
do $$
declare c text; i int;
begin
  for i in 1..500 loop
    c := public.gen_order_code();
    if c !~ '^AT-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$' then
      raise exception 'FAIL: código inválido %', c;
    end if;
  end loop;
  raise notice 'PASS: 500 códigos con formato AT-XXXXXX sin caracteres ambiguos';
end $$;

-- ─────────────────────────────────────────────────────────────
-- 2. Checkout: crear, idempotencia, validaciones
-- ─────────────────────────────────────────────────────────────
do $$
declare r jsonb; r2 jsonb; o public.orders;
begin
  r := public.t_order('aaaa0000-0000-4000-8000-000000000001');
  set constraints all immediate;
  select * into o from public.orders where id = (r ->> 'order_id')::uuid;
  if o.status <> 'pending_payment' or o.payment_status <> 'unpaid' or o.total_cents <> 10500 + 696 then
    raise exception 'FAIL: pedido creado con datos incorrectos % % %', o.status, o.payment_status, o.total_cents;
  end if;
  if (select count(*) from public.slot_holds where checkout_token = o.checkout_token) <> 2 then
    raise exception 'FAIL: se esperaban 2 retenciones de cupo';
  end if;
  if not exists (select 1 from public.order_status_history where order_id = o.id and status = 'pending_payment') then
    raise exception 'FAIL: falta el historial inicial';
  end if;
  raise notice 'PASS: pedido creado (% · total % centavos · 2 retenciones · historial)', o.code, o.total_cents;

  r2 := public.t_order('aaaa0000-0000-4000-8000-000000000001');
  if (r2 ->> 'existing')::boolean is not true or r2 ->> 'order_id' <> r ->> 'order_id' then
    raise exception 'FAIL: el mismo checkout_token creó otro pedido';
  end if;
  if (select count(*) from public.slot_holds where checkout_token = o.checkout_token) <> 2 then
    raise exception 'FAIL: la repetición reservó cupo de nuevo';
  end if;
  raise notice 'PASS: repetir el checkout_token devuelve el mismo pedido sin volver a reservar';
end $$;

select public.t_expect_error(
  $q$ select public.t_order('aaaa0000-0000-4000-8000-0000000000e1',
        p_components => '[{"picadera_option_id": "91c4de00-0000-4000-8000-000000000001", "piece_label_snapshot": "x", "qty": 8}]') $q$,
  'picadera_count_mismatch', 'RF06: picadera con 8 piezas en un paquete de 10');

select public.t_expect_error(
  $q$ select public.t_order('aaaa0000-0000-4000-8000-0000000000e2', p_subtotal => 9999) $q$,
  'subtotal_mismatch', 'A12: subtotal que no coincide con las líneas');

select public.t_expect_error(
  $q$ update public.orders set tip_cents = 100 where checkout_token = 'aaaa0000-0000-4000-8000-000000000001' $q$,
  'orders_check', 'A3: total que no cuadra con sus partes (CHECK)');

select public.t_expect_error(
  $q$ update public.orders set discount_cents = subtotal_cents + 1,
        total_cents = total_cents - subtotal_cents - 1 where checkout_token = 'aaaa0000-0000-4000-8000-000000000001' $q$,
  'check', 'A10: descuento mayor que el subtotal');

-- ─────────────────────────────────────────────────────────────
-- 3. Capacidad (sábado: máx. 2 bandejas por franja y 3 por día)
-- ─────────────────────────────────────────────────────────────
select public.t_expect_error(
  $q$ select public.t_order('aaaa0000-0000-4000-8000-0000000000e3', p_tray_qty => 2) $q$,
  'slot_full', 'RF11: la franja de las 11:00 ya tiene 1 de 2; pedir 2 más no cabe');

do $$
begin
  perform public.t_order('aaaa0000-0000-4000-8000-000000000002', p_tray_qty => 2, p_slot => '12:00');
  set constraints all immediate;
  raise notice 'PASS: 2 bandejas a las 12:00 sí caben (día: 3 de 3)';
end $$;

select public.t_expect_error(
  $q$ select public.t_order('aaaa0000-0000-4000-8000-0000000000e4', p_slot => '15:00') $q$,
  'day_full', 'RF11: el día ya llegó a 3 bandejas');

select public.t_expect_error(
  $q$ select public.reserve_slot(gen_random_uuid(), '69de0e2e-c905-4d36-93f6-446572005410', public.t_sat(), '07:00', 'menu', 1) $q$,
  'outside_hours', 'RF10: los sábados abre a las 08:00');

insert into public.closed_days (store_id, date, reason_es) values ('69de0e2e-c905-4d36-93f6-446572005410', public.t_sat() + 1, 'Prueba');
select public.t_expect_error(
  $q$ select public.reserve_slot(gen_random_uuid(), '69de0e2e-c905-4d36-93f6-446572005410', public.t_sat() + 1, '11:00', 'menu', 1) $q$,
  'closed_day', 'RF10: día cerrado');

select public.t_expect_error(
  $q$ select public.reserve_slot(gen_random_uuid(), '69de0e2e-c905-4d36-93f6-446572005410', public.t_sat(), '11:00', 'menu', 1, 15) $q$,
  'hold_must_outlast', 'A1: la retención no puede durar menos que la sesión de Stripe');

do $$
declare v_full int; v_ok int;
begin
  select count(*) filter (where reason = 'full'), count(*) filter (where available)
    into v_full, v_ok
  from public.available_slots('69de0e2e-c905-4d36-93f6-446572005410', public.t_sat(), public.t_sat(), '{"tray": 1}', 24);
  if v_full <> 14 or v_ok <> 0 then
    raise exception 'FAIL: available_slots: % llenas, % libres (se esperaba 14 y 0: el día está completo)', v_full, v_ok;
  end if;
  select count(*) filter (where available) into v_ok
  from public.available_slots('69de0e2e-c905-4d36-93f6-446572005410', public.t_sat() - 1, public.t_sat() - 1, '{"tray": 1}', 24);
  if v_ok <> 15 then
    raise exception 'FAIL: el viernes (07–22) debería tener 15 franjas libres, tiene %', v_ok;
  end if;
  raise notice 'PASS: available_slots marca el sábado lleno y el viernes con 15 franjas libres';
end $$;

-- ─────────────────────────────────────────────────────────────
-- 4. Webhook: pago, idempotencia, monto, cupón, vencimiento, reembolsos
-- ─────────────────────────────────────────────────────────────
update public.orders set stripe_session_id = 'cs_test_1' where checkout_token = 'aaaa0000-0000-4000-8000-000000000001';
update public.orders set stripe_session_id = 'cs_test_2' where checkout_token = 'aaaa0000-0000-4000-8000-000000000002';

do $$
declare v text; o public.orders;
begin
  v := public.confirm_paid_order('evt_1', 'checkout.session.completed', 'cs_test_1', 'pi_1', 11196, 'card');
  if v <> 'confirmed' then raise exception 'FAIL: confirm devolvió %', v; end if;
  select * into o from public.orders where stripe_session_id = 'cs_test_1';
  if o.status <> 'confirmed' or o.payment_status <> 'paid' or o.paid_at is null or o.payment_method <> 'card' then
    raise exception 'FAIL: pedido pagado con estado incorrecto';
  end if;
  if exists (select 1 from public.slot_holds where checkout_token = o.checkout_token and converted_at is null) then
    raise exception 'FAIL: las retenciones no quedaron convertidas';
  end if;
  raise notice 'PASS: el webhook confirma el pedido y convierte el cupo';

  v := public.confirm_paid_order('evt_1', 'checkout.session.completed', 'cs_test_1', 'pi_1', 11196, 'card');
  if v <> 'duplicate_event' then raise exception 'FAIL: evento repetido devolvió %', v; end if;
  v := public.confirm_paid_order('evt_1b', 'checkout.session.completed', 'cs_test_1', 'pi_1', 11196, 'card');
  if v <> 'already_paid' then raise exception 'FAIL: segundo evento del mismo pago devolvió %', v; end if;
  raise notice 'PASS: RNF-P01 evento repetido y doble confirmación no cambian nada';

  v := public.confirm_paid_order('evt_2', 'checkout.session.completed', 'cs_test_2', 'pi_2', 1, 'apple_pay');
  if v <> 'confirmed_needs_review' then raise exception 'FAIL: monto distinto devolvió %', v; end if;
  if not (select needs_review from public.orders where stripe_session_id = 'cs_test_2') then
    raise exception 'FAIL: el pedido con monto distinto no quedó en revisión';
  end if;
  raise notice 'PASS: A12 monto cobrado distinto → pedido en revisión';
end $$;

-- Vencimiento: el cupo se libera y un pago tardío pide reembolso
do $$
declare v text; v_n int; o public.orders;
begin
  perform public.t_order('aaaa0000-0000-4000-8000-000000000003', p_tray_qty => 1, p_slot => '09:00', p_subtotal => null);
exception when others then
  -- el sábado ya está lleno para bandejas: usar el viernes
  null;
end $$;

do $$
declare r jsonb; v text; v_n int; o public.orders; v_fri date := public.t_sat() - 1;
begin
  r := public.create_checkout_order(
    jsonb_build_object('checkout_token', 'aaaa0000-0000-4000-8000-000000000004', 'store_id', '69de0e2e-c905-4d36-93f6-446572005410',
      'customer_name', 'Late Payer', 'customer_phone', '9735550101', 'customer_email', 'late@example.com',
      'scheduled_for', (v_fri + time '10:00') at time zone 'America/New_York',
      'subtotal_cents', 550, 'tax_rate_ppm', 66250, 'tax_cents', 36, 'total_cents', 586),
    '[{"product_id": "11111111-0000-4000-8000-000000000003", "product_type": "menu", "product_name_snapshot": "Latte",
       "unit_price_cents": 550, "quantity": 1}]',
    jsonb_build_array(jsonb_build_object('date', v_fri, 'slot_start', '10:00', 'category', 'menu', 'qty', 1)));
  update public.orders set stripe_session_id = 'cs_test_4' where id = (r ->> 'order_id')::uuid;
  update public.slot_holds set expires_at = now() - interval '1 minute' where checkout_token = 'aaaa0000-0000-4000-8000-000000000004';

  v_n := public.release_expired_holds();
  select * into o from public.orders where id = (r ->> 'order_id')::uuid;
  if v_n <> 1 or o.status <> 'cancelled' or o.cancelled_reason <> 'checkout_expired' then
    raise exception 'FAIL: release_expired_holds: % liberadas, estado %', v_n, o.status;
  end if;
  if (select reserved_units from public.capacity_slots where date = v_fri and slot_start = '10:00' and category = 'menu') <> 0 then
    raise exception 'FAIL: el cupo vencido no volvió a 0';
  end if;
  raise notice 'PASS: el cron libera el cupo vencido y cancela el pedido sin pagar';

  v := public.confirm_paid_order('evt_4', 'checkout.session.completed', 'cs_test_4', 'pi_4', 586, 'card');
  if v <> 'refund_required' then raise exception 'FAIL: pago tardío devolvió %', v; end if;
  raise notice 'PASS: A1 pago que llega sin cupo → refund_required y pedido en revisión';
end $$;

-- Reembolsos (A11)
do $$
declare v text; o public.orders;
begin
  v := public.sync_refund('evt_r1', 'charge.refunded', 'pi_1', 5000);
  select * into o from public.orders where stripe_payment_intent_id = 'pi_1';
  if v <> 'partially_refunded' or o.refunded_cents <> 5000 or o.payment_status <> 'partially_refunded' then
    raise exception 'FAIL: reembolso parcial %', v;
  end if;
  v := public.sync_refund('evt_r1', 'charge.refunded', 'pi_1', 5000);
  if v <> 'duplicate_event' then raise exception 'FAIL: reembolso repetido %', v; end if;
  v := public.sync_refund('evt_r2', 'charge.refunded', 'pi_1', 11196);
  select * into o from public.orders where stripe_payment_intent_id = 'pi_1';
  if o.status <> 'refunded' or o.payment_status <> 'refunded' or o.refunded_cents <> 11196 then
    raise exception 'FAIL: reembolso total';
  end if;
  if exists (select 1 from public.slot_holds where checkout_token = o.checkout_token and released_at is null) then
    raise exception 'FAIL: el reembolso total no liberó el cupo';
  end if;
  raise notice 'PASS: A11 reembolso parcial, repetido y total; el total libera el cupo';
end $$;

select public.t_expect_error(
  $q$ select public.sync_refund('evt_r3', 'charge.refunded', 'pi_2', 999999) $q$,
  'check', 'A11: no se puede reembolsar más de lo pagado');

-- Cupón: el contador sube solo al pagar y nunca pasa del máximo
do $$
declare r jsonb; v text;
begin
  r := public.t_order('aaaa0000-0000-4000-8000-000000000005', p_tray_qty => 1, p_slot => '13:00', p_promo => '33333333-0000-4000-8000-000000000001');
exception when others then
  null; -- sábado lleno; el cupón se prueba con un pedido del menú abajo
end $$;

do $$
declare r jsonb; v text; v_fri date := public.t_sat() - 1; i int;
begin
  for i in 1..2 loop
    r := public.create_checkout_order(
      jsonb_build_object('checkout_token', ('aaaa0000-0000-4000-8000-00000000010' || i)::uuid,
        'store_id', '69de0e2e-c905-4d36-93f6-446572005410', 'promo_code_id', '33333333-0000-4000-8000-000000000001',
        'customer_name', 'Promo ' || i, 'customer_phone', '9735550102', 'customer_email', 'promo@example.com',
        'scheduled_for', (v_fri + time '14:00') at time zone 'America/New_York',
        'subtotal_cents', 550, 'tax_rate_ppm', 66250, 'tax_cents', 36, 'total_cents', 586),
      '[{"product_id": "11111111-0000-4000-8000-000000000003", "product_type": "menu", "product_name_snapshot": "Latte",
         "unit_price_cents": 550, "quantity": 1}]',
      jsonb_build_array(jsonb_build_object('date', v_fri, 'slot_start', '14:00', 'category', 'menu', 'qty', 1)));
    update public.orders set stripe_session_id = 'cs_promo_' || i where id = (r ->> 'order_id')::uuid;
  end loop;
  if (select used_count from public.promo_codes where code = 'HOLA10') <> 0 then
    raise exception 'FAIL: el cupón subió antes del pago';
  end if;
  v := public.confirm_paid_order('evt_p1', 'checkout.session.completed', 'cs_promo_1', 'pi_p1', 586, 'card');
  if v <> 'confirmed' then raise exception 'FAIL: primer uso del cupón %', v; end if;
  v := public.confirm_paid_order('evt_p2', 'checkout.session.completed', 'cs_promo_2', 'pi_p2', 586, 'card');
  if v <> 'confirmed_needs_review' then raise exception 'FAIL: cupón agotado devolvió %', v; end if;
  if (select used_count from public.promo_codes where code = 'HOLA10') <> 1 then
    raise exception 'FAIL: el cupón de 1 uso quedó con más usos';
  end if;
  raise notice 'PASS: B14 el cupón cuenta al pagar y uno de 1 uso no se usa 2 veces';
end $$;

-- ─────────────────────────────────────────────────────────────
-- 5. Seguridad: anon
-- ─────────────────────────────────────────────────────────────
begin;
set local role anon;
do $$
begin
  if (select count(*) from public.products where name_en = 'Hidden') <> 0 then
    raise exception 'FAIL: anon ve un producto inactivo';
  end if;
  if (select count(*) from public.products) = 0 then
    raise exception 'FAIL: anon no ve el catálogo activo';
  end if;
  if (select count(*) from public.orders) <> 0 or (select count(*) from public.order_items) <> 0 then
    raise exception 'FAIL: anon ve pedidos';
  end if;
  if (select count(*) from public.business_rules) <> 0 or (select count(*) from public.promo_codes) <> 0
     or (select count(*) from public.admin_profiles) <> 0 or (select count(*) from public.audit_log) <> 0 then
    raise exception 'FAIL: anon ve datos internos';
  end if;
  raise notice 'PASS: anon ve solo el catálogo activo; no ve pedidos, reglas, cupones, equipo ni bitácora';
end $$;
select public.t_expect_error($q$ insert into public.categories (slug, name_en) values ('hack', 'Hack') $q$,
  'row-level security|permission denied', 'anon no puede crear categorías');
select public.t_expect_error($q$ select draft_value from public.site_content $q$,
  'permission denied', 'anon no puede leer borradores de site_content');
select public.t_expect_error($q$ select public.confirm_paid_order('x', 'x', 'x', 'x', 1, 'card') $q$,
  'permission denied', 'anon no puede ejecutar funciones del webhook');
select public.t_expect_error($q$ select public.create_checkout_order('{}', '[]', '[]') $q$,
  'permission denied', 'anon no puede crear pedidos directo en la BD');
select public.t_expect_error($q$ insert into storage.objects (bucket_id, name) values ('product-images', 'x.webp') $q$,
  'row-level security|permission denied', 'anon no puede subir imágenes');
rollback;

-- ─────────────────────────────────────────────────────────────
-- 6. Seguridad: admin con y sin 2FA, staff, owner
-- ─────────────────────────────────────────────────────────────
insert into public.admin_profiles (user_id, role) values ('aaaaaaaa-0000-4000-8000-000000000002', 'staff');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "09b5dce9-55d8-4859-844e-47bae15d71fd", "aal": "aal1"}';
do $$
begin
  if (select count(*) from public.orders) <> 0 then
    raise exception 'FAIL: owner sin 2FA ve pedidos';
  end if;
  raise notice 'PASS: RNF-S08 owner sin 2FA (aal1) no ve nada del admin';
end $$;
select public.t_expect_error($q$ insert into public.categories (slug, name_en) values ('nope', 'Nope') $q$,
  'row-level security', 'owner sin 2FA no puede escribir');
rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "09b5dce9-55d8-4859-844e-47bae15d71fd", "aal": "aal2"}';
do $$
begin
  insert into public.categories (section, slug, name_en) values ('menu', 'owner-test', 'Owner test');
  insert into public.business_rules (key, value) values ('tax.rate_ppm', '70000');
  if (select count(*) from public.orders) = 0 then
    raise exception 'FAIL: owner con 2FA no ve pedidos';
  end if;
  raise notice 'PASS: owner con 2FA edita catálogo y reglas de dinero, y ve pedidos';
end $$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-4000-8000-000000000002", "aal": "aal2"}';
do $$
begin
  update public.orders set status = 'preparing' where stripe_session_id = 'cs_test_2';
  if (select status from public.orders where stripe_session_id = 'cs_test_2') <> 'preparing' then
    raise exception 'FAIL: staff no pudo pasar el pedido a preparing';
  end if;
  raise notice 'PASS: staff cambia el estado operativo (confirmed → preparing)';
end $$;
select public.t_expect_error($q$ update public.orders set total_cents = 1, subtotal_cents = 1, tax_cents = 0 where stripe_session_id = 'cs_test_2' $q$,
  'order_field_not_editable', 'staff no puede tocar montos');
select public.t_expect_error($q$ update public.orders set status = 'confirmed' where stripe_session_id = 'cs_test_1' $q$,
  'invalid_status_transition', 'staff no puede revivir un pedido reembolsado');
select public.t_expect_error($q$ update public.orders set needs_review = false where stripe_session_id = 'cs_test_2' $q$,
  'order_review_requires_admin', 'staff no puede cerrar una revisión');
select public.t_expect_error($q$ insert into public.business_rules (key, value) values ('time.slot_minutes', '30') $q$,
  'row-level security', 'staff no puede cambiar reglas');
select public.t_expect_error($q$ insert into public.categories (slug, name_en) values ('staff-cat', 'Staff') $q$,
  'row-level security', 'staff no puede editar el catálogo');
rollback;

select public.t_expect_error($q$ delete from public.admin_profiles where role = 'owner' $q$,
  'last_owner', 'siempre queda al menos un owner activo');

-- ─────────────────────────────────────────────────────────────
-- 7. Bitácora y reglas
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from public.audit_log where entity = 'orders' and action = 'UPDATE') then
    raise exception 'FAIL: la bitácora no registró cambios de pedidos';
  end if;
  if (public.get_rule('tax.rate_ppm', '69de0e2e-c905-4d36-93f6-446572005410'))::int <> 66250 then
    raise exception 'FAIL: get_rule no devuelve el impuesto de la tienda';
  end if;
  if public.get_rule('tax.rate_ppm') is not null then
    raise exception 'FAIL: la regla de tienda no debe aplicar como global';
  end if;
  raise notice 'PASS: RNF-S11 bitácora activa; get_rule respeta tienda y vigencia';
end $$;

-- ─────────────────────────────────────────────────────────────
-- 8. Cotizaciones de eventos (RF-Q01–Q05)
-- ─────────────────────────────────────────────────────────────
insert into public.quote_requests (id, customer_name, customer_email, customer_phone, language, event_date,
  event_type, guests, products, notes)
values ('cccc0000-0000-4000-8000-000000000001', 'Ana Pérez', 'ana@example.com', '+1 973 555 0100', 'es',
  '2026-12-12', 'wedding', 120, '[{"product_id": null, "name": "Mesa para eventos"}]', 'Boda en la tarde');

do $$
declare q public.quote_requests;
begin
  select * into q from public.quote_requests where id = 'cccc0000-0000-4000-8000-000000000001';
  if q.code !~ '^CT-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$' or q.status <> 'new' then
    raise exception 'FAIL: cotización con código o estado incorrecto: % %', q.code, q.status;
  end if;
  if not exists (select 1 from public.audit_log where entity = 'quote_requests' and action = 'INSERT') then
    raise exception 'FAIL: la bitácora no registró la cotización';
  end if;
  raise notice 'PASS: RF-Q03 el Worker guarda la cotización (código %, estado new, bitácora)', q.code;
end $$;

begin;
set local role anon;
select public.t_expect_error($q$ insert into public.quote_requests (customer_name, customer_email, customer_phone, event_date, event_type, guests) values ('Bot', 'bot@x.com', '5555555555', '2026-12-12', 'other', 10) $q$,
  'row-level security', 'anon no puede crear cotizaciones directo en la BD (RF-Q04)');
do $$
begin
  if (select count(*) from public.quote_requests) <> 0 then
    raise exception 'FAIL: anon ve cotizaciones';
  end if;
  raise notice 'PASS: anon no ve cotizaciones';
end $$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-4000-8000-000000000002", "aal": "aal2"}';
do $$
begin
  if (select count(*) from public.quote_requests) <> 1 then
    raise exception 'FAIL: staff no ve las cotizaciones';
  end if;
  update public.quote_requests set status = 'won';
  if (select status from public.quote_requests where id = 'cccc0000-0000-4000-8000-000000000001') <> 'new' then
    raise exception 'FAIL: staff cambió el estado de una cotización';
  end if;
  raise notice 'PASS: staff ve las cotizaciones pero no cambia su estado';
end $$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "09b5dce9-55d8-4859-844e-47bae15d71fd", "aal": "aal2"}';
do $$
begin
  update public.quote_requests set status = 'contacted', internal_notes = 'Llamé el lunes'
   where id = 'cccc0000-0000-4000-8000-000000000001';
  if (select status from public.quote_requests where id = 'cccc0000-0000-4000-8000-000000000001') <> 'contacted' then
    raise exception 'FAIL: el owner no pudo cambiar el estado';
  end if;
  raise notice 'PASS: RF-Q05 el owner cambia estado y notas internas';
end $$;
select public.t_expect_error($q$ update public.quote_requests set guests = 5 where id = 'cccc0000-0000-4000-8000-000000000001' $q$,
  'quote_field_not_editable', 'nadie del admin cambia lo que escribió el cliente');
select public.t_expect_error($q$ update public.quote_requests set status = 'paid' where id = 'cccc0000-0000-4000-8000-000000000001' $q$,
  'check constraint', 'solo estados válidos');
rollback;

\echo '=== TODAS LAS PRUEBAS PASARON ==='
