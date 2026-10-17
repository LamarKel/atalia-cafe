-- ═══════════════════════════════════════════════════════════════════════
-- Atalia Café v3 · Base de datos completa
-- Para un proyecto nuevo (p. ej. producción): pegar ENTERO en SQL Editor → Run.
-- Una sola transacción. No borra nada: la v2, si existe, se archiva en v2_archive.
-- YA APLICADO en staging (cvmdrixxsnwcgzrndhcy) el 2026-10-16.
-- Generado desde db/migrations/*.sql + db/seed/staging.sql (probado: db/tests).
-- En producción, quitar la sección del seed de staging si se cargan datos reales.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ▼▼▼ db/migrations/20261016000100_containment.sql
-- 0001 · Contención de seguridad
-- Neutraliza lo que la v2 dejó abierto al rol public/anon (ver docs/DATABASE.md §1.2), sin borrar nada:
-- cada política queda con USING (false) / WITH CHECK (false), o sea, no deja pasar a nadie.
-- Idempotente: en un proyecto nuevo no encuentra nada que cambiar.

do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname, cmd
    from pg_policies
    where schemaname = 'public'
       or (schemaname = 'storage' and tablename = 'objects' and policyname in (
             'Allow public uploads', 'Allow public updates', 'Allow public deletes',
             'Public Upload', 'Public Update', 'Public Delete', 'Public Access',
             'Authenticated Delete', 'admin upload 16wiy3a_0', 'public read 16wiy3a_0'))
  loop
    if r.cmd in ('SELECT', 'DELETE') then
      execute format('alter policy %I on %I.%I using (false)', r.policyname, r.schemaname, r.tablename);
    elsif r.cmd = 'INSERT' then
      execute format('alter policy %I on %I.%I with check (false)', r.policyname, r.schemaname, r.tablename);
    else
      execute format('alter policy %I on %I.%I using (false) with check (false)', r.policyname, r.schemaname, r.tablename);
    end if;
  end loop;
end $$;

-- Funciones SECURITY DEFINER de la v2 fuera del alcance de anon/authenticated (si existen)
do $$
begin
  if to_regprocedure('public.verify_admin_password(text, text)') is not null then
    revoke execute on function public.verify_admin_password(text, text) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.validate_promo_code(text, numeric)') is not null then
    revoke execute on function public.validate_promo_code(text, numeric) from public, anon, authenticated;
  end if;
end $$;

-- ▼▼▼ db/migrations/20261016000200_reset_v2.sql
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

-- ▼▼▼ db/migrations/20261016000300_v3_schema.sql
-- 0003 · Esquema v3
-- Convenciones (docs/DATABASE.md, docs/REGLAS.md):
--   * Dinero en centavos enteros (*_cents); porcentajes en partes por millón (*_ppm). Nunca numeric/float.
--   * Textos visibles en EN y ES (*_en, *_es).
--   * Estados como text + CHECK (más fácil de evolucionar que un enum).
--   * Todas las tablas con RLS (políticas en 0005).

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ─────────────────────────────────────────────────────────────
-- Utilidades
-- ─────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Código de pedido aleatorio: AT- + 6 caracteres sin ambiguos (sin 0/O, 1/I/L). REGLAS.md A2.
-- Muestreo por rechazo para que cada carácter sea equiprobable.
create or replace function public.gen_order_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; -- 31 caracteres
  candidate text;
  b int;
begin
  loop
    candidate := 'AT-';
    while length(candidate) < 9 loop
      b := get_byte(extensions.gen_random_bytes(1), 0);
      if b < 248 then -- 248 = 31 * 8, descarta el sesgo del módulo
        candidate := candidate || substr(alphabet, (b % 31) + 1, 1);
      end if;
    end loop;
    exit when not exists (select 1 from public.orders o where o.code = candidate);
  end loop;
  return candidate;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Admin (Supabase Auth + rol). Reemplaza a admin_users.
-- ─────────────────────────────────────────────────────────────

create table public.admin_profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  role         text not null default 'staff' check (role in ('owner', 'admin', 'staff')),
  display_name text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Negocio
-- ─────────────────────────────────────────────────────────────

-- Identidad del negocio (una sola fila). Las reglas van en business_rules; los textos en site_content.
create table public.business_settings (
  id              boolean primary key default true check (id),
  business_name   text not null default 'Atalia Café' check (length(business_name) between 2 and 100),
  email           text check (email is null or email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  phone           text,
  whatsapp_number text check (whatsapp_number is null or whatsapp_number ~ '^[0-9]{8,15}$'),
  instagram_url   text,
  facebook_url    text,
  tiktok_url      text,
  twitter_url     text,
  website_url     text,
  logo_url        text,
  favicon_url     text,
  og_image_url    text,
  currency        text not null default 'USD' check (currency = 'USD'),
  updated_at      timestamptz not null default now()
);

create table public.stores (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(name) between 2 and 100),
  address    text,
  city       text,
  state      text,
  zip_code   text,
  phone      text,
  lat        double precision check (lat is null or lat between -90 and 90),
  lng        double precision check (lng is null or lng between -180 and 180),
  timezone   text not null default 'America/New_York',
  sort_order int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pickup_locations (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores (id) on delete cascade,
  name_en        text not null check (length(name_en) between 2 and 100),
  name_es        text,
  description_en text,
  description_es text,
  icon           text not null default 'store',
  sort_order     int not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index pickup_locations_store_idx on public.pickup_locations (store_id);

-- Horario estructurado. weekday: 0 = domingo … 6 = sábado (igual que extract(dow)). Sin fila = cerrado ese día.
create table public.business_hours (
  store_id  uuid not null references public.stores (id) on delete cascade,
  weekday   smallint not null check (weekday between 0 and 6),
  opens_at  time not null,
  closes_at time not null,
  primary key (store_id, weekday),
  check (closes_at > opens_at)
);

create table public.closed_days (
  store_id   uuid not null references public.stores (id) on delete cascade,
  date       date not null,
  reason_en  text,
  reason_es  text,
  created_at timestamptz not null default now(),
  primary key (store_id, date)
);

-- Reglas de negocio configurables (REGLAS.md "Cómo se configuran las reglas").
-- Las claves y sus tipos viven en packages/shared/rules. Sin fila = valor por defecto del registro.
create table public.business_rules (
  id             uuid primary key default gen_random_uuid(),
  key            text not null check (key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),
  store_id       uuid references public.stores (id) on delete cascade,
  value          jsonb not null,
  effective_from timestamptz not null default now(),
  updated_by     uuid references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now(),
  unique nulls not distinct (key, store_id, effective_from)
);
create index business_rules_key_idx on public.business_rules (key, store_id, effective_from desc);

-- Textos del sitio editables (EN/ES), con borrador para la vista previa (RF-A04).
create table public.site_content (
  key         text not null check (key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$'),
  locale      text not null check (locale in ('en', 'es')),
  value       text not null default '',
  draft_value text,
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (key, locale)
);

-- ─────────────────────────────────────────────────────────────
-- Catálogo
-- ─────────────────────────────────────────────────────────────

create table public.categories (
  id             uuid primary key default gen_random_uuid(),
  section        text not null default 'menu' check (section in ('menu', 'catering')),
  slug           text not null unique check (slug ~ '^[a-z0-9-]+$' and length(slug) <= 50),
  name_en        text not null check (length(name_en) between 2 and 100),
  name_es        text,
  description_en text,
  description_es text,
  icon           text not null default 'fas fa-tag',
  group_name     text not null default 'Drinks',
  image_url      text,
  cta_label_en   text,
  cta_label_es   text,
  sort_order     int not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.products (
  id                   uuid primary key default gen_random_uuid(),
  category_id          uuid not null references public.categories (id) on delete restrict,
  type                 text not null default 'menu' check (type in ('menu', 'tray', 'table', 'picadera_pack')),
  slug                 text unique check (slug is null or (slug ~ '^[a-z0-9-]+$' and length(slug) <= 80)),
  name_en              text not null check (length(name_en) between 2 and 200),
  name_es              text,
  short_description_en text,
  short_description_es text,
  description_en       text,
  description_es       text,
  price_cents          int check (price_cents is null or price_cents >= 0),
  min_lead_hours       int not null default 0 check (min_lead_hours between 0 and 720),
  featured             boolean not null default false,
  vegetarian           boolean not null default false,
  stock_enabled        boolean not null default false,
  in_stock             boolean not null default true,
  stock_quantity       int check (stock_quantity is null or stock_quantity >= 0),
  sort_order           int not null default 0,
  active               boolean not null default true,
  search               tsvector generated always as (
    to_tsvector('simple',
      coalesce(name_en, '') || ' ' || coalesce(name_es, '') || ' ' ||
      coalesce(short_description_en, '') || ' ' || coalesce(short_description_es, ''))
  ) stored,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- El menú tiene precio base; el catering toma el precio de sus opciones (product_sizes).
  check (type <> 'menu' or price_cents is not null),
  -- El catering tiene página propia (/catering/[slug]).
  check (type = 'menu' or slug is not null)
);
create index products_category_active_idx on public.products (category_id, active);
create index products_type_active_idx on public.products (type, active);
create index products_search_idx on public.products using gin (search);

create table public.product_images (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  image_url  text not null,
  alt_en     text,
  alt_es     text,
  sort_order int not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id);
create unique index product_images_one_primary on public.product_images (product_id) where is_primary;

-- Tamaños del menú, opciones por personas (serves) y paquetes de picadera (units).
-- Precio: price_cents si no es nulo; si es nulo, products.price_cents + price_modifier_cents.
create table public.product_sizes (
  id                   uuid primary key default gen_random_uuid(),
  product_id           uuid not null references public.products (id) on delete cascade,
  name_en              text not null check (length(name_en) between 1 and 50),
  name_es              text,
  serves               int check (serves is null or serves > 0),
  units                int check (units is null or units > 0),
  price_cents          int check (price_cents is null or price_cents >= 0),
  price_modifier_cents int not null default 0 check (price_modifier_cents >= 0),
  sort_order           int not null default 0,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  check (num_nonnulls(serves, units) <= 1)
);
create index product_sizes_product_idx on public.product_sizes (product_id);

create table public.product_extras (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  name_en     text not null check (length(name_en) between 1 and 100),
  name_es     text,
  price_cents int not null default 0 check (price_cents >= 0),
  sort_order  int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index product_extras_product_idx on public.product_extras (product_id);

create table public.product_nutritional_info (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  label_en   text not null check (length(label_en) between 1 and 100),
  label_es   text,
  value      text not null check (length(value) between 1 and 200),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index product_nutritional_info_product_idx on public.product_nutritional_info (product_id);

-- "Qué incluye" (RF03)
create table public.product_inclusions (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  label_en   text not null check (length(label_en) between 1 and 200),
  label_es   text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index product_inclusions_product_idx on public.product_inclusions (product_id);

-- Piezas del armador de picaderas (RF08)
create table public.picadera_options (
  id            uuid primary key default gen_random_uuid(),
  piece_type_en text not null check (length(piece_type_en) between 1 and 60),
  piece_type_es text,
  filling_en    text not null check (length(filling_en) between 1 and 60),
  filling_es    text,
  image_url     text,
  sort_order    int not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.promo_codes (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique check (code = upper(code) and length(code) between 3 and 30),
  description           text,
  discount_type         text not null check (discount_type in ('percentage', 'fixed')),
  discount_cents        int check (discount_cents is null or discount_cents > 0),
  discount_ppm          int check (discount_ppm is null or discount_ppm between 1 and 1000000),
  min_order_cents       int not null default 0 check (min_order_cents >= 0),
  max_uses              int check (max_uses is null or max_uses > 0),
  max_uses_per_customer int check (max_uses_per_customer is null or max_uses_per_customer > 0),
  used_count            int not null default 0 check (used_count >= 0),
  applies_to_catering   boolean not null default true,
  starts_at             timestamptz,
  expires_at            timestamptz,
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (
    (discount_type = 'fixed' and discount_cents is not null and discount_ppm is null) or
    (discount_type = 'percentage' and discount_ppm is not null and discount_cents is null)
  ),
  check (max_uses is null or used_count <= max_uses),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);

-- ─────────────────────────────────────────────────────────────
-- Pedidos
-- ─────────────────────────────────────────────────────────────

create table public.orders (
  id                       uuid primary key default gen_random_uuid(),
  code                     text not null unique default public.gen_order_code(),
  checkout_token           uuid not null unique,                         -- un intento de compra (RNF-P01)
  access_token             uuid not null unique default gen_random_uuid(), -- abre la página del pedido (A2)
  store_id                 uuid not null references public.stores (id) on delete restrict,
  pickup_location_id       uuid references public.pickup_locations (id) on delete set null,
  promo_code_id            uuid references public.promo_codes (id) on delete set null,
  order_type               text not null default 'pickup' check (order_type in ('pickup', 'delivery')),
  customer_name            text not null check (length(customer_name) between 2 and 200),
  customer_phone           text not null check (customer_phone ~ '^[0-9 ()+-]{7,20}$'),
  customer_email           text not null check (customer_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  language                 text not null default 'en' check (language in ('en', 'es')),
  note                     text check (note is null or length(note) <= 500),
  scheduled_for            timestamptz not null,
  -- Dinero (REGLAS.md A3, A10, A11)
  subtotal_cents           int not null check (subtotal_cents >= 0),
  discount_cents           int not null default 0 check (discount_cents >= 0),
  tax_rate_ppm             int not null check (tax_rate_ppm between 0 and 1000000),
  tax_cents                int not null check (tax_cents >= 0),
  shipping_cents           int not null default 0 check (shipping_cents >= 0),
  tip_cents                int not null default 0 check (tip_cents >= 0),
  total_cents              int not null check (total_cents >= 0),
  refunded_cents           int not null default 0 check (refunded_cents >= 0),
  -- Estados (RF20)
  status                   text not null default 'pending_payment' check (status in
                             ('pending_payment', 'confirmed', 'preparing', 'ready', 'picked_up', 'cancelled', 'refunded', 'no_show')),
  payment_status           text not null default 'unpaid' check (payment_status in
                             ('unpaid', 'paid', 'partially_refunded', 'refunded', 'failed')),
  payment_method           text check (payment_method is null or payment_method in
                             ('card', 'apple_pay', 'google_pay', 'klarna', 'afterpay_clearpay', 'affirm')),
  stripe_session_id        text unique,
  stripe_payment_intent_id text unique,
  paid_at                  timestamptz,
  cancelled_at             timestamptz,
  cancelled_by             text check (cancelled_by is null or cancelled_by in ('admin', 'customer', 'system')),
  cancelled_reason         text check (cancelled_reason is null or length(cancelled_reason) <= 500),
  needs_review             boolean not null default false, -- A12: lo cobrado no coincide, pago sin cupo, etc.
  review_reason            text,
  rules_snapshot           jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (total_cents = subtotal_cents - discount_cents + tax_cents + shipping_cents + tip_cents),
  check (discount_cents <= subtotal_cents),
  check (refunded_cents <= total_cents),
  check (payment_status <> 'paid' or paid_at is not null)
);
create index orders_scheduled_for_idx on public.orders (scheduled_for);
create index orders_payment_status_idx on public.orders (payment_status);
create index orders_status_idx on public.orders (status);
create index orders_created_at_idx on public.orders (created_at);
create index orders_store_idx on public.orders (store_id);
create index orders_needs_review_idx on public.orders (needs_review) where needs_review;

create table public.order_items (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.orders (id) on delete cascade,
  product_id            uuid references public.products (id) on delete set null,
  size_id               uuid references public.product_sizes (id) on delete set null,
  product_type          text not null check (product_type in ('menu', 'tray', 'table', 'picadera_pack')),
  product_name_snapshot text not null,
  size_label_snapshot   text,
  serves                int check (serves is null or serves > 0),
  units                 int check (units is null or units > 0),
  extras                jsonb not null default '[]'::jsonb check (jsonb_typeof(extras) = 'array'),
  notes                 text check (notes is null or length(notes) <= 500),
  unit_price_cents      int not null check (unit_price_cents >= 0),
  quantity              int not null check (quantity between 1 and 100),
  line_total_cents      int not null check (line_total_cents >= 0),
  created_at            timestamptz not null default now(),
  check (line_total_cents = unit_price_cents * quantity),
  check (product_type <> 'picadera_pack' or units is not null)
);
create index order_items_order_idx on public.order_items (order_id);

-- Desglose de cada picadera (RF06)
create table public.order_item_components (
  order_item_id        uuid not null references public.order_items (id) on delete cascade,
  picadera_option_id   uuid not null references public.picadera_options (id) on delete restrict,
  piece_label_snapshot text not null,
  qty                  int not null check (qty > 0),
  primary key (order_item_id, picadera_option_id)
);

create table public.order_status_history (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders (id) on delete cascade,
  status         text not null,
  payment_status text not null,
  actor_id       uuid references auth.users (id) on delete set null,
  note           text check (note is null or length(note) <= 500),
  created_at     timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id);

-- ─────────────────────────────────────────────────────────────
-- Capacidad (RF10, RF11, RNF-C03)
-- ─────────────────────────────────────────────────────────────

-- Plantilla editable: máximos por día de la semana y tipo. Sin fila = sin límite para ese tipo y día.
create table public.capacity_rules (
  id                 uuid primary key default gen_random_uuid(),
  store_id           uuid not null references public.stores (id) on delete cascade,
  weekday            smallint not null check (weekday between 0 and 6),
  category           text not null check (category in ('menu', 'tray', 'table', 'picadera_pack')),
  max_units_per_slot int check (max_units_per_slot is null or max_units_per_slot >= 0),
  max_units_per_day  int check (max_units_per_day is null or max_units_per_day >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (store_id, weekday, category)
);

-- Contadores reales; se crean desde capacity_rules la primera vez que alguien reserva. max_units nulo = sin límite.
create table public.capacity_days (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores (id) on delete cascade,
  date           date not null,
  category       text not null check (category in ('menu', 'tray', 'table', 'picadera_pack')),
  max_units      int check (max_units is null or max_units >= 0),
  reserved_units int not null default 0 check (reserved_units >= 0),
  unique (store_id, date, category),
  check (max_units is null or reserved_units <= max_units)
);

create table public.capacity_slots (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores (id) on delete cascade,
  date           date not null,
  slot_start     time not null,
  category       text not null check (category in ('menu', 'tray', 'table', 'picadera_pack')),
  max_units      int check (max_units is null or max_units >= 0),
  reserved_units int not null default 0 check (reserved_units >= 0),
  unique (store_id, date, slot_start, category),
  check (max_units is null or reserved_units <= max_units)
);

create table public.slot_holds (
  id             uuid primary key default gen_random_uuid(),
  checkout_token uuid not null,
  slot_id        uuid not null references public.capacity_slots (id) on delete cascade,
  day_id         uuid not null references public.capacity_days (id) on delete cascade,
  qty            int not null check (qty > 0),
  expires_at     timestamptz not null,
  converted_at   timestamptz, -- el pago se confirmó: el cupo queda tomado
  released_at    timestamptz, -- venció, o el pedido se canceló o reembolsó: el cupo se devolvió
  created_at     timestamptz not null default now()
);
create index slot_holds_token_idx on public.slot_holds (checkout_token);
create index slot_holds_open_idx on public.slot_holds (expires_at) where converted_at is null and released_at is null;

-- ─────────────────────────────────────────────────────────────
-- Pagos y auditoría
-- ─────────────────────────────────────────────────────────────

-- Idempotencia del webhook (RNF-P01.4). Sin datos personales.
create table public.stripe_events (
  event_id     text primary key,
  type         text not null,
  processed_at timestamptz not null default now()
);

-- Bitácora del admin (RNF-S11)
create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid,
  action     text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  entity     text not null,
  entity_id  text,
  diff       jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_created_at_idx on public.audit_log (created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Triggers de updated_at
-- ─────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'admin_profiles', 'business_settings', 'stores', 'pickup_locations', 'business_rules', 'site_content',
    'categories', 'products', 'picadera_options', 'promo_codes', 'orders', 'capacity_rules'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_updated_at', t);
  end loop;
end $$;

-- RLS inmediato (las políticas llegan en 0005): sin políticas, anon/authenticated no ven nada mientras tanto.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ▼▼▼ db/migrations/20261016000400_v3_functions.sql
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

-- ▼▼▼ db/migrations/20261016000500_v3_rls.sql
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

-- ▼▼▼ db/migrations/20261016000600_hardening.sql
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

-- ▼▼▼ db/seed/staging.sql
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

-- ▼▼▼ Historial de migraciones (para la CLI de Supabase)
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20261016000100', 'containment'),
  ('20261016000200', 'reset_v2'),
  ('20261016000300', 'v3_schema'),
  ('20261016000400', 'v3_functions'),
  ('20261016000500', 'v3_rls'),
  ('20261016000600', 'hardening')
on conflict (version) do nothing;

commit;
