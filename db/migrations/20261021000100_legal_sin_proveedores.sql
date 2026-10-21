-- Textos legales sin nombres de proveedores (pedido de la clienta, 2026-10-21).
--
-- Privacidad y Términos nombraban a Stripe, Supabase, Cloudflare, Resend y Google. Ahora dicen la categoría
-- (procesador de pagos, alojamiento y seguridad, correo, mapa), que es lo que piden las leyes de privacidad
-- (NJ Data Privacy Act: categorías de terceros). Se cambia solo esa línea de cada texto, así no se pisa
-- nada que la clienta haya editado en el panel. Como el texto cambió, sube legal.updated: es la versión
-- que queda guardada en cada pedido nuevo.

begin;

update public.site_content
set value = replace(replace(replace(replace(replace(value,
  '- Payment: Stripe processes your payment. We receive the payment result and the last details Stripe shares (such as the card brand), never your full card number.',
  '- Payment: a certified payment processor handles your payment. We receive the payment result and a few details it shares (such as the card brand), never your full card number.'),
  '- Stripe (payments) and, if you choose them, Klarna, Afterpay or Affirm.',
  '- Our payment processor and, if you choose to pay later, that payment provider.'),
  '- Supabase (our database and hosting) and Cloudflare (website hosting, security and anti-bot check).',
  '- Our hosting, database and security providers (to run the website and protect it from bots).'),
  '- Resend (to send order and quote emails).',
  '- Our email provider (to send order and quote emails).'),
  '- Google Maps (the map on our home page loads from Google).',
  '- Our map provider (the map on our home page loads from an outside service).')
where key = 'legal.privacy.body' and locale = 'en';

update public.site_content
set value = replace(replace(replace(replace(replace(value,
  '- Pago: Stripe procesa tu pago. Recibimos el resultado y algunos datos que Stripe comparte (como la marca de la tarjeta), nunca el número completo de tu tarjeta.',
  '- Pago: un procesador de pagos certificado procesa tu pago. Recibimos el resultado y algunos datos que nos comparte (como la marca de la tarjeta), nunca el número completo de tu tarjeta.'),
  '- Stripe (pagos) y, si los eliges, Klarna, Afterpay o Affirm.',
  '- Nuestro procesador de pagos y, si eliges pagar a plazos, ese proveedor de pagos.'),
  '- Supabase (nuestra base de datos) y Cloudflare (alojamiento del sitio, seguridad y verificación contra bots).',
  '- Nuestros proveedores de alojamiento, base de datos y seguridad (para que el sitio funcione y protegerlo de bots).'),
  '- Resend (para enviar los correos de pedidos y cotizaciones).',
  '- Nuestro proveedor de correo (para enviar los correos de pedidos y cotizaciones).'),
  '- Google Maps (el mapa de la página de inicio se carga desde Google).',
  '- Nuestro proveedor de mapas (el mapa de la página de inicio se carga desde un servicio externo).')
where key = 'legal.privacy.body' and locale = 'es';

update public.site_content
set value = replace(value,
  '- Payments are processed by Stripe. We do not see or store your full card number. If you choose a pay-later option (such as Klarna, Afterpay or Affirm), that provider''s own terms also apply.',
  '- Payments are processed by a certified payment processor. We do not see or store your full card number. If you choose to pay later, that provider''s own terms also apply.')
where key = 'legal.terms.body' and locale = 'en';

update public.site_content
set value = replace(value,
  '- Los pagos los procesa Stripe. Nosotros no vemos ni guardamos el número completo de tu tarjeta. Si eliges pagar a plazos (Klarna, Afterpay o Affirm), también aplican los términos de ese proveedor.',
  '- Los pagos los procesa un procesador de pagos certificado. Nosotros no vemos ni guardamos el número completo de tu tarjeta. Si eliges pagar a plazos, también aplican los términos de ese proveedor.')
where key = 'legal.terms.body' and locale = 'es';

update public.site_content set value = '2026-10-21' where key = 'legal.updated';

commit;
