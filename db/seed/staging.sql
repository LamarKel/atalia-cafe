-- Datos iniciales de STAGING (se puede volver a correr: upserts).
-- Producción usa sus propios datos reales cargados desde el admin.
-- Lo marcado como PROVISIONAL viene del diseño o de la v2 y falta confirmarlo con la clienta (PLAN.md §13).

-- ─────────────────────────────────────────────────────────────
-- Negocio y tienda
-- ─────────────────────────────────────────────────────────────

insert into public.business_settings (id, business_name, currency)
values (true, 'Atalia Café', 'USD')
on conflict (id) do update set business_name = excluded.business_name;

-- Misma tienda de la v2, ahora en Passaic, NJ. Dirección exacta: PROVISIONAL (falta confirmar).
insert into public.stores (id, name, city, state, lat, lng, timezone, active)
values ('69de0e2e-c905-4d36-93f6-446572005410', 'Atalia Café', 'Passaic', 'NJ',
        40.8635565, -74.1185816, 'America/New_York', true)
on conflict (id) do update
  set name = excluded.name, city = excluded.city, state = excluded.state,
      lat = excluded.lat, lng = excluded.lng, timezone = excluded.timezone;

-- "Recogida en tienda o en el carro" (pantalla 06)
insert into public.pickup_locations (id, store_id, name_en, name_es, icon, sort_order)
values
  ('5b0f2a51-7c3e-4e0f-9a51-0c1d6a3e0001', '69de0e2e-c905-4d36-93f6-446572005410', 'In store', 'En tienda', 'store', 1),
  ('5b0f2a51-7c3e-4e0f-9a51-0c1d6a3e0002', '69de0e2e-c905-4d36-93f6-446572005410', 'Curbside', 'En el carro', 'car', 2)
on conflict (id) do update set name_en = excluded.name_en, name_es = excluded.name_es;

-- Horario: PROVISIONAL (es el de la v2). 0 = domingo.
insert into public.business_hours (store_id, weekday, opens_at, closes_at)
values
  ('69de0e2e-c905-4d36-93f6-446572005410', 0, '08:00', '20:00'),
  ('69de0e2e-c905-4d36-93f6-446572005410', 1, '07:00', '21:00'),
  ('69de0e2e-c905-4d36-93f6-446572005410', 2, '07:00', '21:00'),
  ('69de0e2e-c905-4d36-93f6-446572005410', 3, '07:00', '21:00'),
  ('69de0e2e-c905-4d36-93f6-446572005410', 4, '07:00', '21:00'),
  ('69de0e2e-c905-4d36-93f6-446572005410', 5, '07:00', '22:00'),
  ('69de0e2e-c905-4d36-93f6-446572005410', 6, '08:00', '22:00')
on conflict (store_id, weekday) do update set opens_at = excluded.opens_at, closes_at = excluded.closes_at;

-- Impuesto de NJ (REGLAS.md B10): 6.625 % = 66250 ppm. PROVISIONAL hasta que lo confirme su contador.
insert into public.business_rules (key, store_id, value, effective_from)
values
  ('tax.rate_ppm', '69de0e2e-c905-4d36-93f6-446572005410', '66250', '2026-01-01T00:00:00Z'),
  ('tax.label', '69de0e2e-c905-4d36-93f6-446572005410', '{"en": "NJ Sales Tax", "es": "Impuesto de NJ"}', '2026-01-01T00:00:00Z')
on conflict (key, store_id, effective_from) do update set value = excluded.value;

-- ─────────────────────────────────────────────────────────────
-- Categorías
-- ─────────────────────────────────────────────────────────────

-- Menú: las 15 de la v2, con los mismos IDs
insert into public.categories (id, section, slug, name_en, name_es, icon, group_name, sort_order)
values
  ('3353baa5-aede-4081-8a4c-796aa2182d68', 'menu', 'trending',      'Trending',          'Tendencias',           'fas fa-fire',             'Favorites', 1),
  ('9cf070ae-499c-4d16-8578-0ed627391d70', 'menu', 'protein',       'Protein',           'Proteínas',            'fas fa-dumbbell',         'Drinks',    2),
  ('41d2e519-e5f3-4940-91ef-4afe27ad92c9', 'menu', 'hot-coffee',    'Hot Coffee',        'Café Caliente',        'fas fa-mug-hot',          'Drinks',    3),
  ('7c4a8fa9-a12b-4ca1-ae19-2de5625fc65a', 'menu', 'cold-coffee',   'Cold Coffee',       'Café Frío',            'fas fa-glass-water',      'Drinks',    4),
  ('0ee48e03-bc27-4968-9522-7c0e254af210', 'menu', 'matcha',        'Matcha',            'Matcha',               'fas fa-leaf',             'Drinks',    5),
  ('48dfc55e-aff6-429a-bf6a-2d54a72b3e44', 'menu', 'hot-tea',       'Hot Tea',           'Té Caliente',          'fas fa-mug-saucer',       'Drinks',    6),
  ('a961d28d-9e1a-46e6-b01c-fe93353e3ee2', 'menu', 'cold-tea',      'Cold Tea',          'Té Frío',              'fas fa-glass-martini-alt','Drinks',    7),
  ('b7249f6b-705d-4228-a810-a5357b0bb2a0', 'menu', 'refreshers',    'Refreshers',        'Refrescantes',         'fas fa-glass-whiskey',    'Drinks',    8),
  ('4a584897-cdb0-456a-8bba-af3dc7d9561e', 'menu', 'frappuccino',   'Frappuccino®',      'Frappuccino®',         'fas fa-blender',          'Drinks',    9),
  ('aa86104e-d008-41f8-be10-5fe834089aa8', 'menu', 'hot-chocolate', 'Chocolate & More',  'Chocolate y Más',      'fas fa-mug-hot',          'Drinks',   10),
  ('1def5429-f3c3-40c2-8d65-71bc8e895ac1', 'menu', 'bottled',       'Bottled Drinks',    'Bebidas Embotelladas', 'fas fa-wine-bottle',      'Drinks',   11),
  ('b636bec6-4b77-4b65-b486-8e76114be9b0', 'menu', 'bakery',        'Bakery',            'Panadería',            'fas fa-bread-slice',      'Food',     12),
  ('f485dbb5-e8ef-4839-ac0b-5a6ffcc5c26a', 'menu', 'sandwiches',    'Sandwiches',        'Sándwiches',           'fas fa-hamburger',        'Food',     13),
  ('114269aa-c13f-4dcd-8a91-d4fcea799e65', 'menu', 'desserts',      'Desserts',          'Postres',              'fas fa-ice-cream',        'Food',     14),
  ('2ed05e69-2aec-4127-b8fb-b83d52727754', 'menu', 'snacks',        'Snacks',            'Snacks',               'fas fa-cookie-bite',      'Food',     15)
on conflict (id) do update
  set section = excluded.section, slug = excluded.slug, name_en = excluded.name_en, name_es = excluded.name_es,
      icon = excluded.icon, group_name = excluded.group_name, sort_order = excluded.sort_order;

-- Catering (pantallas 01 y 02)
insert into public.categories (id, section, slug, name_en, name_es, description_en, description_es,
                               icon, group_name, cta_label_en, cta_label_es, sort_order)
values
  ('c47e0000-0000-4000-8000-000000000001', 'catering', 'trays', 'Trays', 'Bandejas',
   'Breakfast, charcuterie and cheese boards.', 'Desayuno, charcutería y tablas de queso.',
   'fas fa-utensils', 'Catering', 'View trays', 'Ver bandejas', 1),
  ('c47e0000-0000-4000-8000-000000000002', 'catering', 'tables', 'Event tables', 'Mesas para eventos',
   'Complete tables for parties and gatherings.', 'Mesas completas para fiestas y reuniones.',
   'fas fa-champagne-glasses', 'Catering', 'View tables', 'Ver mesas', 2),
  ('c47e0000-0000-4000-8000-000000000003', 'catering', 'picaderas', 'Picaderas', 'Picaderas',
   'Build your own mix of 5 to 20 pieces.', 'Arma tu combinación de 5 a 20 piezas.',
   'fas fa-cookie', 'Catering', 'Build a picadera', 'Armar picadera', 3)
on conflict (id) do update
  set name_en = excluded.name_en, name_es = excluded.name_es,
      description_en = excluded.description_en, description_es = excluded.description_es,
      cta_label_en = excluded.cta_label_en, cta_label_es = excluded.cta_label_es, sort_order = excluded.sort_order;

-- ─────────────────────────────────────────────────────────────
-- Piezas de picadera: PROVISIONAL (las del diseño, pantalla 04)
-- ─────────────────────────────────────────────────────────────

insert into public.picadera_options (id, piece_type_en, piece_type_es, filling_en, filling_es, sort_order)
values
  ('91c4de00-0000-4000-8000-000000000001', 'Quipe',           'Quipe',           'Beef',         'Res',           1),
  ('91c4de00-0000-4000-8000-000000000002', 'Quipe',           'Quipe',           'Chicken',      'Pollo',         2),
  ('91c4de00-0000-4000-8000-000000000003', 'Empanada',        'Empanada',        'Chicken',      'Pollo',         3),
  ('91c4de00-0000-4000-8000-000000000004', 'Empanada',        'Empanada',        'Cheese',       'Queso',         4),
  ('91c4de00-0000-4000-8000-000000000005', 'Empanada',        'Empanada',        'Ham & cheese', 'Jamón y queso', 5),
  ('91c4de00-0000-4000-8000-000000000006', 'Pastelito',       'Pastelito',       'Chicken',      'Pollo',         6),
  ('91c4de00-0000-4000-8000-000000000007', 'Cassava fritter', 'Bollito de yuca', 'Cheese',       'Queso',         7),
  ('91c4de00-0000-4000-8000-000000000008', 'Croquette',       'Croqueta',        'Chicken',      'Pollo',         8)
on conflict (id) do update
  set piece_type_en = excluded.piece_type_en, piece_type_es = excluded.piece_type_es,
      filling_en = excluded.filling_en, filling_es = excluded.filling_es, sort_order = excluded.sort_order;

-- ─────────────────────────────────────────────────────────────
-- Textos del sitio (del diseño aprobado; la clienta los edita en el admin)
-- ─────────────────────────────────────────────────────────────

insert into public.site_content (key, locale, value)
values
  ('home.hero.badge', 'es', 'Catering y eventos'),
  ('home.hero.badge', 'en', 'Catering & events'),
  ('home.hero.title', 'es', 'Bandejas, mesas y picaderas para cada celebración'),
  ('home.hero.title', 'en', 'Trays, tables and picaderas for every celebration'),
  ('home.hero.subtitle', 'es', 'Elige para cuántas personas, escoge la fecha y paga en línea. Nosotros nos encargamos del resto.'),
  ('home.hero.subtitle', 'en', 'Choose how many guests, pick the date and pay online. We take care of the rest.'),
  ('home.hero.cta_primary', 'es', 'Ver catering'),
  ('home.hero.cta_primary', 'en', 'View catering'),
  ('home.hero.cta_secondary', 'es', 'Ver menú'),
  ('home.hero.cta_secondary', 'en', 'View menu'),
  ('home.categories.title', 'es', '¿Qué vas a celebrar?'),
  ('home.categories.title', 'en', 'What are you celebrating?'),
  ('home.categories.subtitle', 'es', 'Precios claros según la cantidad de personas.'),
  ('home.categories.subtitle', 'en', 'Clear prices based on the number of guests.'),
  ('home.how.title', 'es', 'Así de fácil'),
  ('home.how.title', 'en', 'It''s that easy'),
  ('home.how.step1.title', 'es', 'Elige tu bandeja o picadera'),
  ('home.how.step1.title', 'en', 'Choose your tray or picadera'),
  ('home.how.step1.body', 'es', 'Precios según el número de invitados.'),
  ('home.how.step1.body', 'en', 'Prices based on the number of guests.'),
  ('home.how.step2.title', 'es', 'Escoge fecha y hora de recogida'),
  ('home.how.step2.title', 'en', 'Pick a pickup date and time'),
  ('home.how.step2.body', 'es', 'Solo verás los horarios disponibles.'),
  ('home.how.step2.body', 'en', 'You''ll only see available times.'),
  ('home.how.step3.title', 'es', 'Paga seguro en línea'),
  ('home.how.step3.title', 'en', 'Pay securely online'),
  ('home.how.step3.body', 'es', 'Tarjeta, Apple Pay o Google Pay.'),
  ('home.how.step3.body', 'en', 'Card, Apple Pay or Google Pay.'),
  ('catering.title', 'es', 'Catering'),
  ('catering.title', 'en', 'Catering'),
  ('catering.subtitle', 'es', 'Bandejas, mesas y picaderas hechas al momento.'),
  ('catering.subtitle', 'en', 'Trays, tables and picaderas made to order.'),
  ('catering.lead_time_note', 'es', 'Las bandejas y mesas se piden con 24–48 h de anticipación. Las picaderas, con 1 h.'),
  ('catering.lead_time_note', 'en', 'Trays and tables need 24–48 h notice. Picaderas, 1 h.'),
  ('picadera.title', 'es', 'Arma tu picadera'),
  ('picadera.title', 'en', 'Build your picadera'),
  ('picadera.subtitle', 'es', 'Combina quipes, empanadas, pastelitos y más a tu gusto.'),
  ('picadera.subtitle', 'en', 'Mix quipes, empanadas, pastelitos and more your way.'),
  ('confirmation.title', 'es', '¡Tu pedido está confirmado!'),
  ('confirmation.title', 'en', 'Your order is confirmed!'),
  ('confirmation.subtitle', 'es', 'Recibimos tu pago. Te enviamos el recibo a tu correo.'),
  ('confirmation.subtitle', 'en', 'We received your payment. Your receipt is on its way to your email.')
on conflict (key, locale) do update set value = excluded.value;

-- ─────────────────────────────────────────────────────────────
-- Owner del admin: el usuario de Supabase Auth del desarrollador (si existe)
-- ─────────────────────────────────────────────────────────────

insert into public.admin_profiles (user_id, role, display_name)
select u.id, 'owner', 'Owner'
from auth.users u
where u.id = '09b5dce9-55d8-4859-844e-47bae15d71fd'
on conflict (user_id) do update set role = 'owner', active = true;

-- ─────────────────────────────────────────────────────────────
-- Productos de catering: PROVISIONAL (los 5 del diseño, pantalla 02). SIN PRECIOS: los da la clienta.
-- Sin precio, el sitio muestra "Precio por confirmar".
-- ─────────────────────────────────────────────────────────────

insert into public.products (id, category_id, type, slug, name_en, name_es, min_lead_hours, sort_order)
values
  ('a7a10000-0000-4000-8000-000000000001', 'c47e0000-0000-4000-8000-000000000001', 'tray', 'breakfast-tray',
   'Breakfast tray', 'Bandeja de desayuno', 24, 1),
  ('a7a10000-0000-4000-8000-000000000002', 'c47e0000-0000-4000-8000-000000000001', 'tray', 'charcuterie-board',
   'Charcuterie board', 'Tabla de charcutería', 24, 2),
  ('a7a10000-0000-4000-8000-000000000003', 'c47e0000-0000-4000-8000-000000000001', 'tray', 'cheese-board',
   'Cheese board', 'Tabla de quesos', 24, 3),
  ('a7a10000-0000-4000-8000-000000000004', 'c47e0000-0000-4000-8000-000000000002', 'table', 'event-table',
   'Event table', 'Mesa para eventos', 48, 4),
  ('a7a10000-0000-4000-8000-000000000005', 'c47e0000-0000-4000-8000-000000000003', 'picadera_pack', 'picadera',
   'Build your picadera', 'Arma tu picadera', 1, 5)
on conflict (id) do update
  set name_en = excluded.name_en, name_es = excluded.name_es, min_lead_hours = excluded.min_lead_hours,
      sort_order = excluded.sort_order;

insert into public.product_sizes (id, product_id, name_en, name_es, serves, units, sort_order)
select ('b5b5' || lpad(to_hex(row_number() over ()), 4, '0') || '-0000-4000-8000-000000000000')::uuid,
       p.product_id::uuid, p.name_en, p.name_es, p.serves, p.units, p.sort_order
from (values
  ('a7a10000-0000-4000-8000-000000000001', '5 people',  '5 personas',  5,  null::int, 1),
  ('a7a10000-0000-4000-8000-000000000001', '10 people', '10 personas', 10, null, 2),
  ('a7a10000-0000-4000-8000-000000000001', '15 people', '15 personas', 15, null, 3),
  ('a7a10000-0000-4000-8000-000000000001', '20 people', '20 personas', 20, null, 4),
  ('a7a10000-0000-4000-8000-000000000002', '5 people',  '5 personas',  5,  null, 1),
  ('a7a10000-0000-4000-8000-000000000002', '10 people', '10 personas', 10, null, 2),
  ('a7a10000-0000-4000-8000-000000000002', '15 people', '15 personas', 15, null, 3),
  ('a7a10000-0000-4000-8000-000000000002', '20 people', '20 personas', 20, null, 4),
  ('a7a10000-0000-4000-8000-000000000003', '5 people',  '5 personas',  5,  null, 1),
  ('a7a10000-0000-4000-8000-000000000003', '10 people', '10 personas', 10, null, 2),
  ('a7a10000-0000-4000-8000-000000000003', '15 people', '15 personas', 15, null, 3),
  ('a7a10000-0000-4000-8000-000000000004', '20 people', '20 personas', 20, null, 1),
  ('a7a10000-0000-4000-8000-000000000004', '30 people', '30 personas', 30, null, 2),
  ('a7a10000-0000-4000-8000-000000000004', '50 people', '50 personas', 50, null, 3),
  ('a7a10000-0000-4000-8000-000000000005', '5 pieces',  '5 piezas',    null, 5,  1),
  ('a7a10000-0000-4000-8000-000000000005', '10 pieces', '10 piezas',   null, 10, 2),
  ('a7a10000-0000-4000-8000-000000000005', '15 pieces', '15 piezas',   null, 15, 3),
  ('a7a10000-0000-4000-8000-000000000005', '20 pieces', '20 piezas',   null, 20, 4)
) as p(product_id, name_en, name_es, serves, units, sort_order)
on conflict (id) do update
  set name_en = excluded.name_en, name_es = excluded.name_es, serves = excluded.serves, units = excluded.units;

-- Imagen del hero (archivo en apps/web/public; luego se sube a Storage desde el admin)
insert into public.site_content (key, locale, value)
values ('home.hero.image_url', 'en', '/images/hero.png'), ('home.hero.image_url', 'es', '/images/hero.png'),
       ('footer.tagline', 'en', 'Catering and café in Passaic, NJ'),
       ('footer.tagline', 'es', 'Catering y café en Passaic, NJ')
on conflict (key, locale) do update set value = excluded.value;
