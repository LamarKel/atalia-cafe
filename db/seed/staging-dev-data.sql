-- ⚠️ DATOS DE DESARROLLO (2026-10-18): precios, fotos y textos FALSOS para probar el sitio de punta a punta.
-- No son de la clienta. Antes de publicar se reemplazan desde el admin con los reales (PLAN.md §13).
-- Fotos: Wikimedia Commons (licencias libres), convertidas a WebP y guardadas en Storage (product-images/dev/).
begin;

-- Precios de prueba por opción (centavos)
update public.product_sizes s set price_cents = v.cents
from (values
  ('b5b50001-0000-4000-8000-000000000000'::uuid, 4500), ('b5b50002-0000-4000-8000-000000000000'::uuid, 8500),
  ('b5b50003-0000-4000-8000-000000000000'::uuid, 12000), ('b5b50004-0000-4000-8000-000000000000'::uuid, 15500),
  ('b5b50005-0000-4000-8000-000000000000'::uuid, 5500), ('b5b50006-0000-4000-8000-000000000000'::uuid, 10000),
  ('b5b50007-0000-4000-8000-000000000000'::uuid, 14500), ('b5b50008-0000-4000-8000-000000000000'::uuid, 18500),
  ('b5b50009-0000-4000-8000-000000000000'::uuid, 5000), ('b5b5000a-0000-4000-8000-000000000000'::uuid, 9000),
  ('b5b5000b-0000-4000-8000-000000000000'::uuid, 13000),
  ('b5b5000c-0000-4000-8000-000000000000'::uuid, 35000), ('b5b5000d-0000-4000-8000-000000000000'::uuid, 50000),
  ('b5b5000e-0000-4000-8000-000000000000'::uuid, 80000),
  ('b5b5000f-0000-4000-8000-000000000000'::uuid, 1250), ('b5b50010-0000-4000-8000-000000000000'::uuid, 2300),
  ('b5b50011-0000-4000-8000-000000000000'::uuid, 3300), ('b5b50012-0000-4000-8000-000000000000'::uuid, 4200)
) as v(id, cents)
where s.id = v.id;

-- Descripciones cortas de prueba
update public.products p set short_description_en = v.en, short_description_es = v.es
from (values
  ('a7a10000-0000-4000-8000-000000000001'::uuid, 'Eggs, sausages, toast and fresh fruit for a morning event.', 'Huevos, salchichas, tostadas y fruta fresca para un evento de mañana.'),
  ('a7a10000-0000-4000-8000-000000000002'::uuid, 'Cured meats, cheeses, crackers and pickles.', 'Embutidos, quesos, galletas y encurtidos.'),
  ('a7a10000-0000-4000-8000-000000000003'::uuid, 'A selection of cheeses with fruit and nuts.', 'Selección de quesos con fruta y frutos secos.'),
  ('a7a10000-0000-4000-8000-000000000004'::uuid, 'A full table set up for your party or gathering.', 'Una mesa completa montada para tu fiesta o reunión.'),
  ('a7a10000-0000-4000-8000-000000000005'::uuid, 'Mix quipes, empanadas, pastelitos and more.', 'Combina quipes, empanadas, pastelitos y más.')
) as v(id, en, es)
where p.id = v.id;

-- Fotos de los productos (la primera de cada uno es la principal)
insert into public.product_images (id, product_id, image_url, alt_en, alt_es, sort_order, is_primary)
values
  ('e1a90000-0000-4000-8000-000000000001', 'a7a10000-0000-4000-8000-000000000001', 'https://cvmdrixxsnwcgzrndhcy.supabase.co/storage/v1/object/public/product-images/dev/breakfast1.webp', 'Breakfast plate with eggs, sausages and toast', 'Plato de desayuno con huevos, salchichas y tostadas', 1, true),
  ('e1a90000-0000-4000-8000-000000000002', 'a7a10000-0000-4000-8000-000000000001', 'https://cvmdrixxsnwcgzrndhcy.supabase.co/storage/v1/object/public/product-images/dev/breakfast2.webp', 'Sausages, bacon and fried eggs', 'Salchichas, tocineta y huevos fritos', 2, false),
  ('e1a90000-0000-4000-8000-000000000003', 'a7a10000-0000-4000-8000-000000000002', 'https://cvmdrixxsnwcgzrndhcy.supabase.co/storage/v1/object/public/product-images/dev/charc1.webp', 'Charcuterie board on slate', 'Tabla de embutidos sobre pizarra', 1, true),
  ('e1a90000-0000-4000-8000-000000000004', 'a7a10000-0000-4000-8000-000000000002', 'https://cvmdrixxsnwcgzrndhcy.supabase.co/storage/v1/object/public/product-images/dev/charc2.webp', 'Board with dip, vegetables and crackers', 'Tabla con dip, vegetales y galletas', 2, false),
  ('e1a90000-0000-4000-8000-000000000005', 'a7a10000-0000-4000-8000-000000000002', 'https://cvmdrixxsnwcgzrndhcy.supabase.co/storage/v1/object/public/product-images/dev/charc3.webp', 'Long charcuterie board for sharing', 'Tabla larga de embutidos para compartir', 3, false),
  ('e1a90000-0000-4000-8000-000000000006', 'a7a10000-0000-4000-8000-000000000003', 'https://cvmdrixxsnwcgzrndhcy.supabase.co/storage/v1/object/public/product-images/dev/cheese2.webp', 'Assorted cheeses with rosemary', 'Quesos variados con romero', 1, true),
  ('e1a90000-0000-4000-8000-000000000007', 'a7a10000-0000-4000-8000-000000000003', 'https://cvmdrixxsnwcgzrndhcy.supabase.co/storage/v1/object/public/product-images/dev/cheese1.webp', 'Cheese platter served outdoors', 'Tabla de quesos servida al aire libre', 2, false),
  ('e1a90000-0000-4000-8000-000000000008', 'a7a10000-0000-4000-8000-000000000004', 'https://cvmdrixxsnwcgzrndhcy.supabase.co/storage/v1/object/public/product-images/dev/table2.webp', 'Catering table with trays of bites', 'Mesa de catering con bandejas de bocadillos', 1, true),
  ('e1a90000-0000-4000-8000-000000000009', 'a7a10000-0000-4000-8000-000000000004', 'https://cvmdrixxsnwcgzrndhcy.supabase.co/storage/v1/object/public/product-images/dev/table1.webp', 'Individual catering box', 'Caja individual de catering', 2, false),
  ('e1a90000-0000-4000-8000-00000000000a', 'a7a10000-0000-4000-8000-000000000005', 'https://cvmdrixxsnwcgzrndhcy.supabase.co/storage/v1/object/public/product-images/dev/picadera1.webp', 'Golden fried empanadas', 'Empanadas fritas doradas', 1, true),
  ('e1a90000-0000-4000-8000-00000000000b', 'a7a10000-0000-4000-8000-000000000005', 'https://cvmdrixxsnwcgzrndhcy.supabase.co/storage/v1/object/public/product-images/dev/picadera2.webp', 'Fried snacks in a display case', 'Frituras en la vitrina', 2, false)
on conflict (id) do update
  set image_url = excluded.image_url, alt_en = excluded.alt_en, alt_es = excluded.alt_es,
      sort_order = excluded.sort_order, is_primary = excluded.is_primary;

-- "Qué incluye" de prueba
insert into public.product_inclusions (id, product_id, label_en, label_es, sort_order)
values
  ('e1c10000-0000-4000-8000-000000000001', 'a7a10000-0000-4000-8000-000000000001', 'Scrambled eggs', 'Huevos revueltos', 1),
  ('e1c10000-0000-4000-8000-000000000002', 'a7a10000-0000-4000-8000-000000000001', 'Sausages and bacon', 'Salchichas y tocineta', 2),
  ('e1c10000-0000-4000-8000-000000000003', 'a7a10000-0000-4000-8000-000000000001', 'Toast and butter', 'Tostadas con mantequilla', 3),
  ('e1c10000-0000-4000-8000-000000000004', 'a7a10000-0000-4000-8000-000000000001', 'Fresh fruit', 'Fruta fresca', 4),
  ('e1c10000-0000-4000-8000-000000000005', 'a7a10000-0000-4000-8000-000000000002', 'Salami and ham', 'Salami y jamón', 1),
  ('e1c10000-0000-4000-8000-000000000006', 'a7a10000-0000-4000-8000-000000000002', 'Two cheeses', 'Dos quesos', 2),
  ('e1c10000-0000-4000-8000-000000000007', 'a7a10000-0000-4000-8000-000000000002', 'Crackers', 'Galletas', 3),
  ('e1c10000-0000-4000-8000-000000000008', 'a7a10000-0000-4000-8000-000000000002', 'Pickles and olives', 'Encurtidos y aceitunas', 4),
  ('e1c10000-0000-4000-8000-000000000009', 'a7a10000-0000-4000-8000-000000000003', 'Four cheeses', 'Cuatro quesos', 1),
  ('e1c10000-0000-4000-8000-00000000000a', 'a7a10000-0000-4000-8000-000000000003', 'Grapes', 'Uvas', 2),
  ('e1c10000-0000-4000-8000-00000000000b', 'a7a10000-0000-4000-8000-000000000003', 'Nuts', 'Frutos secos', 3),
  ('e1c10000-0000-4000-8000-00000000000c', 'a7a10000-0000-4000-8000-000000000003', 'Crackers', 'Galletas', 4),
  ('e1c10000-0000-4000-8000-00000000000d', 'a7a10000-0000-4000-8000-000000000004', 'Table setup', 'Montaje de la mesa', 1),
  ('e1c10000-0000-4000-8000-00000000000e', 'a7a10000-0000-4000-8000-000000000004', 'Three trays of your choice', 'Tres bandejas a elegir', 2),
  ('e1c10000-0000-4000-8000-00000000000f', 'a7a10000-0000-4000-8000-000000000004', 'Picadera assortment', 'Surtido de picadera', 3),
  ('e1c10000-0000-4000-8000-000000000010', 'a7a10000-0000-4000-8000-000000000004', 'Disposable plates and napkins', 'Platos y servilletas desechables', 4)
on conflict (id) do update set label_en = excluded.label_en, label_es = excluded.label_es, sort_order = excluded.sort_order;

-- Fotos de las piezas de picadera
update public.picadera_options o set image_url = v.url
from (values
  ('91c4de00-0000-4000-8000-000000000001'::uuid, 'https://cvmdrixxsnwcgzrndhcy.supabase.co/storage/v1/object/public/product-images/dev/quipe_res.webp'),
  ('91c4de00-0000-4000-8000-000000000002'::uuid, 'https://cvmdrixxsnwcgzrndhcy.supabase.co/storage/v1/object/public/product-images/dev/quipe_pollo.webp'),
  ('91c4de00-0000-4000-8000-000000000003'::uuid, 'https://cvmdrixxsnwcgzrndhcy.supabase.co/storage/v1/object/public/product-images/dev/emp_pollo.webp'),
  ('91c4de00-0000-4000-8000-000000000004'::uuid, 'https://cvmdrixxsnwcgzrndhcy.supabase.co/storage/v1/object/public/product-images/dev/emp_queso.webp'),
  ('91c4de00-0000-4000-8000-000000000005'::uuid, 'https://cvmdrixxsnwcgzrndhcy.supabase.co/storage/v1/object/public/product-images/dev/emp_jyq.webp'),
  ('91c4de00-0000-4000-8000-000000000006'::uuid, 'https://cvmdrixxsnwcgzrndhcy.supabase.co/storage/v1/object/public/product-images/dev/pastelito.webp'),
  ('91c4de00-0000-4000-8000-000000000007'::uuid, 'https://cvmdrixxsnwcgzrndhcy.supabase.co/storage/v1/object/public/product-images/dev/yuca.webp'),
  ('91c4de00-0000-4000-8000-000000000008'::uuid, 'https://cvmdrixxsnwcgzrndhcy.supabase.co/storage/v1/object/public/product-images/dev/croqueta.webp')
) as v(id, url)
where o.id = v.id;

-- Fotos de las categorías (tarjetas "¿Qué vas a celebrar?" del inicio)
update public.categories c set image_url = v.url
from (values
  ('c47e0000-0000-4000-8000-000000000001'::uuid, 'https://cvmdrixxsnwcgzrndhcy.supabase.co/storage/v1/object/public/product-images/dev/cat_trays.webp'),
  ('c47e0000-0000-4000-8000-000000000002'::uuid, 'https://cvmdrixxsnwcgzrndhcy.supabase.co/storage/v1/object/public/product-images/dev/table2.webp'),
  ('c47e0000-0000-4000-8000-000000000003'::uuid, 'https://cvmdrixxsnwcgzrndhcy.supabase.co/storage/v1/object/public/product-images/dev/picadera1.webp')
) as v(id, url)
where c.id = v.id;

-- Avisos de pedidos y cotizaciones al correo del desarrollador mientras se prueba (la clienta pone el suyo en el admin)
insert into public.business_rules (key, store_id, value, effective_from)
values ('notifications.order_recipients', null, '["el.nini.kl@gmail.com"]'::jsonb, '2026-01-01T00:00:00Z')
on conflict (key, store_id, effective_from) do update set value = excluded.value;

commit;
