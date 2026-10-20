-- Inicio v2 (docs/design/01-inicio-v2.html), Nosotros y Contacto.
--
-- 1) business_settings.uber_eats_url / doordash_url: los botones de delivery solo se muestran si hay enlace.
-- 2) Textos nuevos en site_content (EN/ES), editables en el panel → Negocio → Textos.
--    Un valor vacío ('') oculta ese elemento en el sitio (cifras, reseñas, año): nunca se inventan datos.
--    En los títulos, "\n" es un salto de línea y *palabra* va en cursiva verde.
-- 3) Se actualizan los textos del hero y de "Así de fácil" al diseño nuevo.

begin;

alter table public.business_settings
  add column if not exists uber_eats_url text,
  add column if not exists doordash_url text;

update public.site_content set value = v.value
from (values
  ('home.hero.title', 'en', E'Coffee, flavor\nand *celebrations*\nmade at home.'),
  ('home.hero.title', 'es', E'Café, sabor\ny *celebraciones*\nhechas en casa.'),
  ('home.hero.subtitle', 'en', 'Trays, tables and picaderas for your events, and your everyday coffee. Order online and pick up in store.'),
  ('home.hero.subtitle', 'es', 'Bandejas, mesas y picaderas para tus eventos, y tu café de cada día. Pide en línea y recoge en tienda.'),
  ('home.hero.image_url', 'en', '/images/home/hero.webp'),
  ('home.hero.image_url', 'es', '/images/home/hero.webp'),
  ('home.how.step1.title', 'en', 'Choose'),
  ('home.how.step1.title', 'es', 'Elige'),
  ('home.how.step1.body', 'en', 'Your tray or picadera'),
  ('home.how.step1.body', 'es', 'Tu bandeja o picadera'),
  ('home.how.step2.title', 'en', 'Schedule'),
  ('home.how.step2.title', 'es', 'Agenda'),
  ('home.how.step2.body', 'en', 'Pickup date and time'),
  ('home.how.step2.body', 'es', 'Fecha y hora de recogida'),
  ('home.how.step3.title', 'en', 'Pay securely'),
  ('home.how.step3.title', 'es', 'Paga seguro'),
  ('home.how.step3.body', 'en', 'Card, Apple Pay or pay later'),
  ('home.how.step3.body', 'es', 'Tarjeta, Apple Pay o a plazos')
) as v(key, locale, value)
where public.site_content.key = v.key and public.site_content.locale = v.locale;

insert into public.site_content (key, locale, value) values
-- Hero
('home.stats.events', 'en', ''), ('home.stats.events', 'es', ''),
('home.stats.events_label', 'en', 'events served'), ('home.stats.events_label', 'es', 'eventos atendidos'),
('home.stats.picadera_label', 'en', 'picaderas ready'), ('home.stats.picadera_label', 'es', 'picaderas listas'),
('home.stats.rating', 'en', ''), ('home.stats.rating', 'es', ''),
('home.stats.rating_label', 'en', 'Google rating'), ('home.stats.rating_label', 'es', 'calificación en Google'),
('home.hero.featured_label', 'en', 'Most ordered'), ('home.hero.featured_label', 'es', 'Más pedido'),
('home.marquee', 'en', 'Breakfast trays · Charcuterie · Quipes and empanadas · Event tables · Specialty coffee · Homemade pastries'),
('home.marquee', 'es', 'Bandejas de desayuno · Charcutería · Quipes y empanadas · Mesas para eventos · Café de especialidad · Repostería casera'),
-- Catering
('home.catering.eyebrow', 'en', 'Catering'), ('home.catering.eyebrow', 'es', 'Catering'),
('home.catering.title', 'en', E'For every celebration,\na tray made to measure.'),
('home.catering.title', 'es', E'Para cada celebración,\nuna bandeja a la medida.'),
('home.catering.subtitle', 'en', 'Choose how many guests, pick the date and pay online. We take care of the rest.'),
('home.catering.subtitle', 'es', 'Elige para cuántas personas, escoge la fecha y paga en línea. Nosotros nos encargamos del resto.'),
('home.how.cta', 'en', 'Start your order'), ('home.how.cta', 'es', 'Empezar pedido'),
-- Pide a tu manera
('home.ways.eyebrow', 'en', 'Order your way'), ('home.ways.eyebrow', 'es', 'Pide a tu manera'),
('home.ways.title', 'en', E'Your coffee,\nthe way you like it.'), ('home.ways.title', 'es', E'Tu café, como\ntú lo prefieras.'),
('home.ways.subtitle', 'en', 'Pick it up in store, take it to go, or get it delivered through our delivery apps.'),
('home.ways.subtitle', 'es', 'Recógelo en tienda, llévatelo al momento o pídelo a domicilio por nuestras apps de delivery.'),
('home.ways.item1.title', 'en', 'Pick up in store'), ('home.ways.item1.title', 'es', 'Recoger en tienda'),
('home.ways.item1.body', 'en', 'Order online and skip the line.'), ('home.ways.item1.body', 'es', 'Pide en línea y evita la fila.'),
('home.ways.item2.title', 'en', 'To go'), ('home.ways.item2.title', 'es', 'Para llevar'),
('home.ways.item2.body', 'en', 'Your coffee ready on your way out.'), ('home.ways.item2.body', 'es', 'Tu café listo al salir.'),
('home.ways.item3.title', 'en', 'Delivery'), ('home.ways.item3.title', 'es', 'Delivery'),
('home.ways.item3.body', 'en', 'To your home or office.'), ('home.ways.item3.body', 'es', 'A tu casa u oficina.'),
('home.ways.partners_label', 'en', 'You can also find us on our delivery platforms'),
('home.ways.partners_label', 'es', 'También estamos en nuestras plataformas de delivery'),
('home.ways.image1', 'en', '/images/home/ways-1.webp'), ('home.ways.image1', 'es', '/images/home/ways-1.webp'),
('home.ways.image2', 'en', '/images/home/ways-2.webp'), ('home.ways.image2', 'es', '/images/home/ways-2.webp'),
-- Prueba la diferencia (también en Nosotros)
('home.story.eyebrow', 'en', 'Beyond coffee'), ('home.story.eyebrow', 'es', 'Más allá del café'),
('home.story.title', 'en', 'Taste the difference.'), ('home.story.title', 'es', 'Prueba la diferencia.'),
('home.story.subtitle', 'en', 'Authentic in every bean, every face and every moment.'),
('home.story.subtitle', 'es', 'Auténtico en cada grano, cada rostro y cada momento.'),
('home.story.item1.title', 'en', 'Coffee of the day'), ('home.story.item1.title', 'es', 'Café del día'),
('home.story.item1.body', 'en', 'Freshly brewed, ready to go.'), ('home.story.item1.body', 'es', 'Recién preparado, listo para llevar.'),
('home.story.item2.title', 'en', 'Homemade sweets'), ('home.story.item2.title', 'es', 'Dulces caseros'),
('home.story.item2.body', 'en', 'Pair your coffee with our pastries.'), ('home.story.item2.body', 'es', 'Acompaña tu café con nuestra repostería.'),
('home.story.item3.title', 'en', 'Passion for what we do'), ('home.story.item3.title', 'es', 'Pasión por lo que hacemos'),
('home.story.item3.body', 'en', 'Every product made with love and care.'), ('home.story.item3.body', 'es', 'Cada producto hecho con amor y dedicación.'),
('home.story.image1', 'en', '/images/home/story-1.webp'), ('home.story.image1', 'es', '/images/home/story-1.webp'),
('home.story.image2', 'en', '/images/home/story-2.webp'), ('home.story.image2', 'es', '/images/home/story-2.webp'),
('home.story.image3', 'en', '/images/home/story-3.webp'), ('home.story.image3', 'es', '/images/home/story-3.webp'),
('home.story.since_year', 'en', ''), ('home.story.since_year', 'es', ''),
('home.story.since_label', 'en', 'Serving quality coffee since {year}'),
('home.story.since_label', 'es', 'Sirviendo café de calidad desde {year}'),
-- Reseñas (solo reales: vacías = la sección no se muestra)
('home.reviews.title', 'en', E'What our\ncustomers say.'), ('home.reviews.title', 'es', E'Lo que dicen\nnuestros clientes.'),
('home.reviews.source_label', 'en', 'Real Google reviews'), ('home.reviews.source_label', 'es', 'Reseñas reales de Google'),
('home.reviews.url', 'en', ''), ('home.reviews.url', 'es', ''),
('home.reviews.1.text', 'en', ''), ('home.reviews.1.text', 'es', ''),
('home.reviews.1.name', 'en', ''), ('home.reviews.1.name', 'es', ''),
('home.reviews.2.text', 'en', ''), ('home.reviews.2.text', 'es', ''),
('home.reviews.2.name', 'en', ''), ('home.reviews.2.name', 'es', ''),
('home.reviews.3.text', 'en', ''), ('home.reviews.3.text', 'es', ''),
('home.reviews.3.name', 'en', ''), ('home.reviews.3.name', 'es', ''),
-- Llamada final
('home.cta.title', 'en', E'Planning an event?\nWe bring the flavor.'), ('home.cta.title', 'es', E'¿Tienes un evento?\nNosotros llevamos el sabor.'),
('home.cta.subtitle', 'en', 'Order online or message us on WhatsApp and we will help you put it together.'),
('home.cta.subtitle', 'es', 'Pide en línea o escríbenos por WhatsApp y te ayudamos a armarlo.'),
('home.cta.primary', 'en', 'Order catering'), ('home.cta.primary', 'es', 'Pedir catering'),
('home.cta.whatsapp', 'en', 'Message us on WhatsApp'), ('home.cta.whatsapp', 'es', 'Escríbenos por WhatsApp'),
-- Nosotros
('about.title', 'en', 'About us'), ('about.title', 'es', 'Nosotros'),
('about.lead', 'en', 'A café and catering kitchen in Passaic, NJ, where every tray, picadera and cup is made at home.'),
('about.lead', 'es', 'Un café y cocina de catering en Passaic, NJ, donde cada bandeja, picadera y taza se hace en casa.'),
('about.body', 'en', ''), ('about.body', 'es', ''),
-- Contacto
('contact.title', 'en', 'Contact'), ('contact.title', 'es', 'Contacto'),
('contact.lead', 'en', 'Call us, message us on WhatsApp or visit us. For events, request a quote and we will reply soon.'),
('contact.lead', 'es', 'Llámanos, escríbenos por WhatsApp o visítanos. Para eventos, pide una cotización y te respondemos pronto.')
on conflict (key, locale) do nothing;

commit;
