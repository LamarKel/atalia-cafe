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
