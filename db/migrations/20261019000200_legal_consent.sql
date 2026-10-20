-- Textos legales y consentimiento en el checkout.
--
-- 1) orders.terms_accepted_at / terms_version: prueba de que el cliente aceptó los términos, la privacidad y
--    la política de cancelación vigentes (versión = fecha de legal.updated) al pagar.
-- 2) create_checkout_order guarda esos dos campos (el resto de la función no cambia).
-- 3) Textos iniciales en site_content (EN/ES). Se editan en el panel → Negocio → Textos. Marcas que se
--    reemplazan al mostrar: {business_name} {email} {phone} {address} {site}; en la política de
--    cancelación, {refund_table} y {menu_rule} salen de las reglas del sistema (refunds.*).
--    Formato: "## " título, "- " lista, una línea en blanco separa párrafos. Nada de HTML.

begin;

alter table public.orders
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

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
    total_cents, rules_snapshot, terms_accepted_at, terms_version)
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
    coalesce(p_order -> 'rules_snapshot', '{}'::jsonb),
    (p_order ->> 'terms_accepted_at')::timestamptz,
    p_order ->> 'terms_version')
  on conflict (checkout_token) do nothing
  returning * into v_order;

  if v_order.id is null then
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

revoke execute on function public.create_checkout_order(jsonb, jsonb, jsonb) from public, anon, authenticated;

insert into public.site_content (key, locale, value) values
('legal.updated', 'en', '2026-10-19'),
('legal.updated', 'es', '2026-10-19'),

-- ───────────── Términos y condiciones ─────────────
('legal.terms.title', 'en', 'Terms and conditions'),
('legal.terms.title', 'es', 'Términos y condiciones'),
('legal.terms.body', 'en', $t$These terms apply when you use this website or place an order with {business_name} ("we", "us"), {address}. By placing an order you confirm that you have read and accept these terms, our Privacy policy and our Cancellation and refund policy.

## Orders
- An order is confirmed only after your payment is approved. You will see a confirmation page and receive an email with your order code.
- Pickup times shown on the site depend on our capacity and the notice each product needs. We may contact you if we cannot fulfill an order; in that case we cancel it and refund you in full.
- Large events may require a quote. A quote is an estimate, not an order, until we agree on it and you pay.

## Prices, taxes and payment
- Prices are in US dollars. New Jersey sales tax is added where it applies and is shown before you pay.
- Payments are processed by Stripe. We do not see or store your full card number. If you choose a pay-later option (such as Klarna, Afterpay or Affirm), that provider's own terms also apply.
- If a price on the site is clearly wrong, we will tell you before preparing the order and you may cancel it with a full refund.

## Discount codes
- One code per order. Codes have no cash value, cannot be exchanged for money and may have a minimum order, dates, limits per customer or exclusions shown when you apply them.
- If an order with a discount is refunded, we refund what you actually paid.

## Pickup
- Please arrive at the time you chose and bring your order code. If you cannot make it, contact us as soon as possible.
- Orders not picked up on the scheduled day are handled as described in our Cancellation and refund policy.

## Food, allergens and photos
- Our food is prepared in a kitchen that handles common allergens. Read the allergen notice and tell us about any allergy before you order. We cannot guarantee that any item is free of allergens.
- Photos are for illustration; presentation may vary slightly.

## Use of the website
- Do not misuse the site: no automated ordering, attempts to bypass security or prices, or false information.
- The site content, logo and photos belong to {business_name} or are used with permission.

## Liability
- We are responsible for preparing your order with reasonable care. Nothing in these terms limits any right you have under New Jersey or federal law, including your rights as a consumer.
- To the extent New Jersey law allows, we are not responsible for delays or failures caused by events outside our reasonable control (for example, severe weather or utility outages). If that happens, we will offer a new time or a full refund.

## Governing law
These terms are governed by the laws of the State of New Jersey.

## Changes
We may update these terms. The date at the top shows the latest version. The version you accepted when ordering applies to that order.

## Contact
{business_name} · {address} · {phone} · {email}$t$),
('legal.terms.body', 'es', $t$Estos términos aplican cuando usas este sitio o haces un pedido a {business_name} ("nosotros"), {address}. Al hacer un pedido confirmas que leíste y aceptas estos términos, nuestra Política de privacidad y nuestra Política de cancelación y reembolsos.

## Pedidos
- Un pedido queda confirmado solo cuando se aprueba tu pago. Verás una página de confirmación y recibirás un correo con tu código de pedido.
- Las horas de recogida que muestra el sitio dependen de nuestra capacidad y de la anticipación que necesita cada producto. Si no podemos cumplir un pedido, te contactamos, lo cancelamos y te devolvemos todo.
- Los eventos grandes pueden necesitar una cotización. Una cotización es un estimado, no un pedido, hasta que nos pongamos de acuerdo y pagues.

## Precios, impuestos y pago
- Los precios están en dólares estadounidenses. Se suma el impuesto de ventas de Nueva Jersey cuando aplica y lo ves antes de pagar.
- Los pagos los procesa Stripe. Nosotros no vemos ni guardamos el número completo de tu tarjeta. Si eliges pagar a plazos (Klarna, Afterpay o Affirm), también aplican los términos de ese proveedor.
- Si un precio del sitio está claramente equivocado, te avisamos antes de preparar el pedido y puedes cancelarlo con reembolso completo.

## Códigos de descuento
- Un código por pedido. Los códigos no tienen valor en efectivo, no se cambian por dinero y pueden tener un mínimo de compra, fechas, límites por cliente o exclusiones que se muestran al aplicarlos.
- Si se reembolsa un pedido con descuento, devolvemos lo que realmente pagaste.

## Recogida
- Llega a la hora que elegiste y ten a mano tu código de pedido. Si no puedes venir, avísanos lo antes posible.
- Los pedidos que no se recogen el día programado se manejan como dice nuestra Política de cancelación y reembolsos.

## Alimentos, alérgenos y fotos
- Preparamos los alimentos en una cocina que maneja alérgenos comunes. Lee el aviso de alérgenos y cuéntanos de cualquier alergia antes de pedir. No podemos garantizar que un producto esté libre de alérgenos.
- Las fotos son ilustrativas; la presentación puede variar un poco.

## Uso del sitio
- No hagas mal uso del sitio: nada de pedidos automáticos, intentos de saltarse la seguridad o los precios, ni información falsa.
- El contenido del sitio, el logo y las fotos son de {business_name} o se usan con permiso.

## Responsabilidad
- Nos hacemos responsables de preparar tu pedido con el cuidado razonable. Nada en estos términos limita los derechos que tienes según las leyes de Nueva Jersey o federales, incluidos tus derechos como consumidor.
- En la medida que lo permita la ley de Nueva Jersey, no somos responsables de retrasos o fallas por causas fuera de nuestro control razonable (por ejemplo, mal tiempo o cortes de luz). Si pasa, te ofrecemos otra hora o el reembolso completo.

## Ley aplicable
Estos términos se rigen por las leyes del Estado de Nueva Jersey.

## Cambios
Podemos actualizar estos términos. La fecha de arriba indica la última versión. A cada pedido le aplica la versión que aceptaste al hacerlo.

## Contacto
{business_name} · {address} · {phone} · {email}$t$),

-- ───────────── Privacidad ─────────────
('legal.privacy.title', 'en', 'Privacy policy'),
('legal.privacy.title', 'es', 'Política de privacidad'),
('legal.privacy.body', 'en', $t$This policy explains what personal information {business_name} collects through this website, why, and the choices you have.

## What we collect
- Order details: your name, phone, email, what you ordered, notes, pickup date, time and place.
- Quote requests: your name, phone, email, event date, type of event, number of guests and your message.
- Payment: Stripe processes your payment. We receive the payment result and the last details Stripe shares (such as the card brand), never your full card number.
- Technical data: your IP address and browser data, used only for security (to stop abuse and automated attacks) and to keep the site working.
- On your device: we save your cart and some preferences in your browser (local storage) so they are still there when you come back. We do not use advertising or tracking cookies.

## How we use it
- To prepare, confirm and hand over your order, and to contact you about it (for example, if there is a change or a cancellation).
- To answer quote requests.
- To process payments and refunds, prevent fraud and keep accounting and tax records.
- We do not send marketing emails unless you ask us to.

## Who we share it with
We share only what each service needs to work for us:
- Stripe (payments) and, if you choose them, Klarna, Afterpay or Affirm.
- Supabase (our database and hosting) and Cloudflare (website hosting, security and anti-bot check).
- Resend (to send order and quote emails).
- Google Maps (the map on our home page loads from Google).
We do not sell your personal information and we do not share it for targeted advertising.

## How long we keep it
We keep order and payment records for as long as tax and accounting laws require. Quote requests we keep for up to 2 years. Security logs are kept for a short time.

## Your rights
You can ask us to show you, correct or delete your personal information, or for a copy of it. If you live in New Jersey or another state with a privacy law, you have these rights under that law, and you can appeal if we deny a request. Write to {email}. We may need to verify your identity, and some records must be kept by law.

## Security
We use encrypted connections, access controls with two-step verification for our staff, and payment processing that never exposes your card to us.

## Children
This site is not intended for children under 13 and we do not knowingly collect their information.

## Changes
If we change this policy, we will update the date at the top.

## Contact
{business_name} · {address} · {phone} · {email}$t$),
('legal.privacy.body', 'es', $t$Esta política explica qué información personal recoge {business_name} en este sitio, para qué, y qué opciones tienes.

## Qué recogemos
- Datos del pedido: tu nombre, teléfono, correo, lo que pediste, notas, y la fecha, hora y lugar de recogida.
- Solicitudes de cotización: tu nombre, teléfono, correo, fecha y tipo de evento, número de invitados y tu mensaje.
- Pago: Stripe procesa tu pago. Recibimos el resultado y algunos datos que Stripe comparte (como la marca de la tarjeta), nunca el número completo de tu tarjeta.
- Datos técnicos: tu dirección IP y datos del navegador, solo para seguridad (frenar abusos y ataques automáticos) y para que el sitio funcione.
- En tu dispositivo: guardamos tu carrito y algunas preferencias en tu navegador (almacenamiento local) para que sigan ahí cuando vuelvas. No usamos cookies de publicidad ni de rastreo.

## Para qué lo usamos
- Para preparar, confirmar y entregar tu pedido, y para contactarte sobre él (por ejemplo, si hay un cambio o una cancelación).
- Para responder cotizaciones.
- Para procesar pagos y reembolsos, prevenir fraudes y llevar los registros contables y de impuestos.
- No enviamos correos de publicidad, salvo que nos lo pidas.

## Con quién lo compartimos
Solo compartimos lo que cada servicio necesita para funcionar:
- Stripe (pagos) y, si los eliges, Klarna, Afterpay o Affirm.
- Supabase (nuestra base de datos) y Cloudflare (alojamiento del sitio, seguridad y verificación contra bots).
- Resend (para enviar los correos de pedidos y cotizaciones).
- Google Maps (el mapa de la página de inicio se carga desde Google).
No vendemos tu información personal ni la compartimos para publicidad dirigida.

## Cuánto tiempo la guardamos
Guardamos los registros de pedidos y pagos el tiempo que exigen las leyes de impuestos y contabilidad. Las cotizaciones, hasta 2 años. Los registros de seguridad, por poco tiempo.

## Tus derechos
Puedes pedirnos ver, corregir o borrar tu información personal, o una copia de ella. Si vives en Nueva Jersey o en otro estado con ley de privacidad, tienes estos derechos según esa ley y puedes apelar si negamos una solicitud. Escríbenos a {email}. Puede que tengamos que verificar tu identidad, y algunos registros hay que guardarlos por ley.

## Seguridad
Usamos conexiones cifradas, acceso del personal con verificación en dos pasos y un procesador de pagos que nunca nos muestra tu tarjeta.

## Menores
Este sitio no está dirigido a menores de 13 años y no recogemos a sabiendas su información.

## Cambios
Si cambiamos esta política, actualizamos la fecha de arriba.

## Contacto
{business_name} · {address} · {phone} · {email}$t$),

-- ───────────── Cancelaciones y reembolsos ─────────────
('legal.policies.title', 'en', 'Cancellation and refund policy'),
('legal.policies.title', 'es', 'Política de cancelación y reembolsos'),
('legal.policies.body', 'en', $t$We prepare each order for you, so how much we can refund depends on how early you cancel.

## Catering (trays, tables and picaderas)
If you cancel, the refund depends on how many hours before pickup you tell us:

{refund_table}

## Café menu
{menu_rule}

## If we cancel
If we have to cancel your order for any reason on our side, we refund 100% of what you paid and let you know by email.

## If you do not pick up
Orders not picked up on the scheduled day cannot be refunded, because the food was already prepared.

## How to cancel or report a problem
Contact us at {phone} or {email} with your order code. If something is wrong with your order, tell us the same day so we can make it right.

## How refunds are paid
Refunds go back to the original payment method. Depending on your bank, they take 5 to 10 business days to appear. Discounts from codes are not refunded as cash.$t$),
('legal.policies.body', 'es', $t$Preparamos cada pedido para ti, así que lo que podemos reembolsar depende de con cuánta anticipación canceles.

## Catering (bandejas, mesas y picaderas)
Si cancelas, el reembolso depende de cuántas horas antes de la recogida nos avises:

{refund_table}

## Menú del café
{menu_rule}

## Si cancelamos nosotros
Si tenemos que cancelar tu pedido por cualquier motivo de nuestra parte, te devolvemos el 100 % de lo que pagaste y te avisamos por correo.

## Si no recoges el pedido
Los pedidos que no se recogen el día programado no se reembolsan, porque la comida ya se preparó.

## Cómo cancelar o reportar un problema
Escríbenos o llámanos al {phone} o a {email} con tu código de pedido. Si algo salió mal con tu pedido, avísanos el mismo día para resolverlo.

## Cómo se devuelve el dinero
El reembolso vuelve al mismo método de pago. Según tu banco, tarda de 5 a 10 días hábiles en verse. Los descuentos de códigos no se devuelven en efectivo.$t$),

-- ───────────── Accesibilidad ─────────────
('legal.accessibility.title', 'en', 'Accessibility'),
('legal.accessibility.title', 'es', 'Accesibilidad'),
('legal.accessibility.body', 'en', $t${business_name} wants everyone to be able to use this website.

## Our goal
We design and test this site to meet the Web Content Accessibility Guidelines (WCAG) 2.1, level AA: it works with a keyboard and screen readers, has enough color contrast, real labels on every field, large touch targets, and respects your reduced-motion setting.

## If something does not work for you
Tell us at {phone} or {email} what page and what problem you found. We will help you place your order by phone or email while we fix it, and we will reply as soon as possible.$t$),
('legal.accessibility.body', 'es', $t${business_name} quiere que todas las personas puedan usar este sitio.

## Nuestra meta
Diseñamos y probamos este sitio para cumplir las Pautas de Accesibilidad para el Contenido Web (WCAG) 2.1, nivel AA: funciona con teclado y lectores de pantalla, tiene suficiente contraste de color, etiquetas reales en cada campo, botones grandes y respeta tu ajuste de reducir movimiento.

## Si algo no te funciona
Cuéntanos al {phone} o a {email} en qué página y qué problema encontraste. Te ayudamos a hacer tu pedido por teléfono o por correo mientras lo arreglamos, y te respondemos lo antes posible.$t$),

-- ───────────── Aviso de alérgenos (menú, productos y checkout) ─────────────
('legal.allergens', 'en', 'Allergen notice: our food is prepared in a kitchen that handles wheat, milk, eggs, soy, peanuts, tree nuts, fish, shellfish and sesame. We cannot guarantee that any item is allergen-free. If you have a food allergy, contact us before ordering.'),
('legal.allergens', 'es', 'Aviso de alérgenos: preparamos los alimentos en una cocina que maneja trigo, leche, huevo, soya, maní, nueces, pescado, mariscos y ajonjolí. No podemos garantizar que un producto esté libre de alérgenos. Si tienes una alergia, contáctanos antes de pedir.')
on conflict (key, locale) do nothing;

commit;
