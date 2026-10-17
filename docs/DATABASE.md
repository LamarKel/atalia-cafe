# Base de datos: estado actual y lo que necesita la v3

> Auditoría del proyecto Supabase `atalia-cafe` (`cvmdrixxsnwcgzrndhcy`, `us-east-1`, Postgres 17), hecha el 2026-10-16 **solo con lecturas**.
> Lo que necesita la v3 sale de `PLAN.md` §3 y §8 y de las 6 pantallas aprobadas en [`docs/design/`](design/).

---

## 1. Estado actual

### 1.1 Las 14 tablas de la v2

| Tabla | Filas | Notas |
|---|---|---|
| `categories` | 15 | `slug` único, `group_name` (Drinks/Food/Favorites), `icon` de Font Awesome |
| `products` | 1 | `price` obligatorio, stock opcional (`stock_enabled`, `stock_quantity`), `vegetarian`, `featured` |
| `product_images` | 1 | índice único parcial: una sola `is_primary` por producto |
| `product_sizes` | 0 | `price_modifier >= 0` relativo a `products.price`, `active`, `sort_order` |
| `product_extras` | 0 | `price` absoluto |
| `product_nutritional_info` | 0 | `label_en/es` + `value` (texto). **Existe en la BD, pero la app de referencia no la usa** |
| `stores` | 1 | dirección, lat/lng, horario **en texto** por día (`"7:00 AM - 9:00 PM"`) |
| `pickup_locations` | 0 | puntos de recogida por tienda (`name_en/es`, `icon`). Sirve para "en tienda" / "en el carro" de la confirmación |
| `promo_codes` | 0 | `percentage`/`fixed`, `min_order`, `max_uses`, `used_count`, `expires_at` |
| `business_settings` | 1 | una sola fila (índice `business_settings_single_row`). Ya viene con valores de EE.UU.: `USD`, `Sales Tax 8.5 %`, idioma `en` |
| `orders` | 3 | pedidos de prueba (mayo y junio de 2026). Ya tiene `scheduled_for`, `payment_status`, `stripe_payment_id`, `customer_email`, `language`, `pickup_location_id`, `promo_code_id`, montos guardados como copia (`tax_rate_snapshot`, etc.) |
| `order_items` | 2 | `product_name_snapshot`, `size` y `extras` como **texto**, `unit_price`, `line_total` |
| `order_status_history` | 3 | historial de estados con `admin_user_id` |
| `admin_users` | 1 | usuarios propios del admin, separados de Supabase Auth |

Además: `auth.users` tiene 1 usuario, el bucket público `product-images` tiene 5 archivos y hay 9 triggers de `updated_at` + `trg_decrement_stock`.

Funciones: `update_updated_at`, `decrement_stock` (trigger), `get_hourly_sales(date)`, `validate_promo_code(text, numeric)` (SECURITY DEFINER), `verify_admin_password(text, text)` (SECURITY DEFINER).

Índices útiles que ya existen: `orders(status)`, `orders(created_at)`, `orders(store_id)`, `orders(code)` (duplicado con su UNIQUE), `order_items(order_id)`, `order_status_history(order_id)`.

### 1.2 Seguridad: el proyecto está abierto (urgente)

RLS está activado en las 14 tablas, pero varias políticas lo anulan. En Postgres, las políticas permisivas se combinan con OR, así que basta con una `USING (true)` para que todas las demás dejen de importar.

- **`"Enable all for all users"` y `"enable_all_for_authenticated"`** son `FOR ALL TO public USING (true) WITH CHECK (true)` en `products`, `categories`, `stores`, `promo_codes`, `business_settings`, `orders`, `order_items` y `product_images`. Cualquiera con la anon key (que va en el frontend, es decir, es pública) puede **leer, crear, modificar y borrar** el catálogo, la configuración, los códigos promocionales y los pedidos. Un detalle engañoso: la que se llama `enable_all_for_authenticated` está asignada al rol `public`, no a `authenticated`.
- **`orders` y `order_items`**: `public_read_own_order` es `USING (true)` para `anon`, así que se pueden leer **todos** los pedidos con el nombre, teléfono, email y dirección de cada cliente.
- **`admin_users`**: `"Enable read for all"` deja leer la tabla a cualquiera, incluida la columna `password_hash`. Esa columna **guarda la contraseña en texto plano** (no es un hash).
- **`verify_admin_password`**: compara contra una contraseña escrita dentro de la función e ignora la columna. Además, `anon` la puede ejecutar.
- **Storage `product-images`**: `anon` puede subir, reemplazar y **borrar** archivos (`Allow public uploads/updates/deletes`, `Public Upload/Update/Delete`).
- Advisors de Supabase: las 5 funciones tienen el `search_path` sin fijar; `anon` puede ejecutar las 2 SECURITY DEFINER; la protección contra contraseñas filtradas de Auth está apagada.

**Hay que tratar la contraseña del admin como comprometida**: está en el bundle del frontend de la referencia, dentro de `verify_admin_password` y en texto plano en una tabla que cualquiera puede leer. Si el usuario de `auth.users` usa la misma contraseña, también hay que cambiarla.

El bloque SQL de contención está en el §4. No se aplicó todavía: va a romper el admin de la referencia, porque ese admin escribe con la anon key.

---

## 2. Qué pide cada pantalla del diseño

| Pantalla | Datos que necesita | ¿Existe hoy? |
|---|---|---|
| **01 Inicio** | Hero (etiqueta "Catering y eventos", título, subtítulo, imagen, 2 CTA); 3 tarjetas de categoría (imagen, título, descripción, texto del enlace); "Así de fácil" (3 pasos); footer (eslogan, horario, dirección, "Cómo llegar", teléfono, WhatsApp, enlace a políticas); toggle ES·EN | Parcial: `business_settings` tiene el eslogan, el teléfono, el WhatsApp, la dirección y lat/lng. **Faltan** `site_content`, la imagen y descripción de cada categoría, y un horario que se pueda mostrar y calcular |
| **02 Catálogo** | Categorías Bandejas/Mesas/Picaderas con conteo; filtro de invitados 5/10/15/20+; búsqueda; tarjeta con insignia de tipo, nombre, "Para 5·10·15·20 personas", "Desde $" (la opción más barata) y "24 h antes"; nota de anticipación | **Faltan** el tipo de producto, la anticipación, las porciones por opción (`serves`) y la separación entre menú y catering |
| **03 Detalle** | Breadcrumb (categoría), insignia "Pedir con 24 h de anticipación", nombre, descripción corta, galería (4 fotos), chips de personas con precio, "≈ $ por persona", "Qué incluye" (lista), notas para la cocina, cantidad | `product_images` sirve para la galería. **Faltan** `slug`, el precio absoluto por opción, `serves`, la lista de lo que incluye y las notas por ítem del pedido |
| **04 Arma tu picadera** | Paquetes 5/10/15/20 con precio; piezas = tipo + relleno (Quipe·Res, Empanada·Pollo…) con miniatura; "Pago por adelantado · lista en mínimo 1 hora"; desglose de las piezas en el pedido | **Faltan** `picadera_options` y `order_item_components` |
| **05 Checkout · Cuándo** | Calendario con días agotados o cerrados; franjas por hora (9:00–18:00) con algunas agotadas; anticipación mínima según el carrito; resumen con impuestos; "Pago seguro con Stripe" | `orders.scheduled_for` ya existe. **Faltan** el horario estructurado, la duración de cada franja, la zona horaria, la capacidad, los días cerrados y las reservas temporales |
| **06 Confirmación** | "Pedido #AT-1042" (número corto y secuencial); fecha y hora; dirección de la tienda; "Recogida en tienda o en el carro"; ítems con precio; "Pagado"; Cómo llegar (lat/lng), Agregar al calendario, WhatsApp; política de cancelación | `orders.code`, `stores` (dirección, lat/lng), `pickup_locations` y `whatsapp_number` ya existen. **Faltan** la secuencia del código, el estado `paid` confirmado por el webhook, los campos de Stripe con idempotencia y el texto de las políticas |

---

## 3. Cambios para la v3

**Implementado y aplicado en staging (`cvmdrixxsnwcgzrndhcy`) el 2026-10-16**, como un esquema v3 **limpio** en `db/migrations/`. La v2 no se borró: `0002` la movió al esquema `v2_archive`, que no está expuesto en la API, como respaldo. Los mismos archivos sirven para el proyecto de producción. Las 15 categorías del menú se recargaron con sus IDs desde `db/seed/staging.sql`.

| Archivo | Contenido |
|---|---|
| `0001_containment` | Neutraliza las políticas abiertas de la v2 con `USING (false)` (idempotente) |
| `0002_reset_v2` | Archiva las tablas y funciones de la v2 en `v2_archive` (idempotente) |
| `0003_v3_schema` | Tablas, CHECKs, índices, código de pedido aleatorio |
| `0004_v3_functions` | Roles del admin (2FA), auditoría, protección de pedidos, picaderas, capacidad, checkout idempotente, webhook de Stripe, reembolsos, reportes |
| `0005_v3_rls` | RLS de todas las tablas, permisos por columna, Storage y Realtime |
| `0006_hardening` | Índices de claves foráneas, `(select auth.uid())` en RLS y `search_path` de las funciones archivadas (advisors) |
| `db/seed/staging.sql` | Tienda de Passaic, horario, impuesto de NJ, categorías, piezas de picadera, textos del diseño, owner |

**Pruebas:** `node db/tests/run-pglite.mjs <node_modules con @electric-sql/pglite>` corre todo en un Postgres 17 en memoria (40 pruebas: dinero, capacidad, pagos, reembolsos, cupones y seguridad por rol). Con Docker, `bash db/tests/run.sh` además prueba 20 peticiones simultáneas con el mismo `checkout_token`.

**Aplicar en un proyecto nuevo:** `db/apply/2026-10-16_v3_completo.sql` junta todo en una transacción para el SQL Editor de Supabase. Las migraciones evitan a propósito `DROP`/`DELETE`/`TRUNCATE`, porque el conector de Supabase de Claude las rechaza sin una confirmación que esta sesión no puede mostrar. Para retirar algo, se archiva o se neutraliza.

**Advisors pendientes, aceptados a propósito:**
- `admin_role`, `has_admin_role` e `is_admin` son SECURITY DEFINER ejecutables por `authenticated`, porque las políticas RLS las necesitan. Solo devuelven el rol del propio usuario.
- `multiple_permissive_policies`: separar `public_read`, `staff_read` y `admin_all` es más claro, y el costo es mínimo con este volumen de datos.
- `unused_index`: la BD es nueva; esos índices se usarán con el tráfico real.
- La protección contra contraseñas filtradas se activa en el panel (Auth), no por SQL.

Lo que sigue en esta sección es el diseño que se implementó.

### 3.0 Dinero: centavos enteros (decidido)

Todo monto se guarda como **centavos enteros** (`integer`, con el sufijo `_cents` y `check (… >= 0)`), y todo porcentaje como **partes por millón** (`integer`, con el sufijo `_ppm`). No queda ninguna columna de dinero en `numeric` ni en dólares. Ver `REGLAS.md` A3.

| Tabla | Hoy | v3 |
|---|---|---|
| `products` | `price` | `price_cents` |
| `product_sizes` | `price_modifier` | `price_modifier_cents` + `price_cents` (nuevo, absoluto; §3.1) |
| `product_extras` | `price` | `price_cents` |
| `promo_codes` | `discount_value`, `min_order` | `discount_cents` (si es `fixed`) o `discount_ppm` (si es `percentage`; 10 % = `100000`), con un CHECK de que solo uno tenga valor; `min_order_cents` |
| `orders` | `subtotal`, `discount_amount`, `tax_rate_snapshot`, `tax_amount`, `shipping_fee`, `total` | `subtotal_cents`, `discount_cents`, `tax_rate_ppm`, `tax_cents`, `shipping_cents`, `tip_cents` (nuevo), `total_cents`, `refunded_cents` (nuevo) |
| `order_items` | `unit_price`, `line_total` | `unit_price_cents`, `line_total_cents` |
| `order_items.extras` (jsonb) | — | cada extra con `price_cents` |
| `business_rules` | — | los valores de dinero y porcentajes también van en centavos y en ppm (el impuesto de NJ, 6.625 %, es `66250`) |

Restricciones adicionales en `orders` (A10–A11):
- `check (total_cents = subtotal_cents - discount_cents + tax_cents + shipping_cents + tip_cents)`
- `check (discount_cents <= subtotal_cents)`
- `check (refunded_cents <= total_cents)`

Migración de lo existente: `price_cents = round(price * 100)::int`, y lo mismo para cada columna. Como la BD solo tiene datos de prueba, también se puede empezar limpia.

### 3.1 Cambios a tablas existentes

**`categories`**
- `+ section text not null default 'menu' check (section in ('menu','catering'))`: separa el menú del catering (RF01).
- `+ image_url text`, `+ cta_label_en text`, `+ cta_label_es text`: para las tarjetas del inicio.
- `group_name` se queda para el sidebar del menú.

**`products`**
- `+ type text not null default 'menu' check (type in ('menu','tray','table','picadera_pack'))`. La insignia "Bandeja / Mesa / Picadera" sale de aquí.
- `+ slug text unique` (obligatorio si `type <> 'menu'`): para `/catering/[slug]`.
- `+ min_lead_hours int not null default 0 check (min_lead_hours >= 0)`: el "24 h antes".
- `+ short_description_en text`, `+ short_description_es text`: el subtítulo del detalle.
- `+ search tsvector` generada a partir de los nombres y descripciones (EN y ES), con un índice GIN. Es para la búsqueda del menú y del catálogo.
- `price` deja de ser obligatorio para el catering (el precio sale de la opción) o se interpreta como el precio "desde". **Decisión pendiente**; ver §5.
- Índice `(category_id, active)` (PLAN §8).

**`product_sizes`** (opciones por personas y paquetes)
- `+ serves int check (serves > 0)`: bandejas y mesas ("10 personas").
- `+ units int check (units > 0)`: paquetes de picadera ("10 piezas").
- `+ price_cents integer check (price_cents >= 0)`: **precio absoluto** de la opción. El "≈ $ por persona" se calcula como `price_cents / serves` (solo para mostrar). En el menú se sigue usando `price_modifier_cents`. Regla: si `price_cents` no es nulo, ese es el precio; si es nulo, se usa `products.price_cents + price_modifier_cents`.
- `check (num_nonnulls(serves, units) <= 1)`.

**`orders`**
- `+ checkout_token uuid unique`: un token por intento de compra (RNF-P01).
- `+ stripe_session_id text unique`, `+ stripe_payment_intent_id text unique`. Se elimina `stripe_payment_id`.
- `+ refunded_cents integer not null default 0` (RF17), `+ tip_cents integer not null default 0` (B9), `+ paid_at timestamptz` (ver §3.0).
- `+ rules_snapshot jsonb not null`: copia de las reglas que aplicaron a ese pedido al venderse (tramos de cancelación, impuesto, propina). Los reembolsos y cancelaciones se calculan con esta copia, no con las reglas vigentes.
- `code`: **aleatorio, no secuencial**. Formato `AT-` + 6 caracteres tomados de un alfabeto sin caracteres ambiguos (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`, sin 0/O, 1/I/L), por ejemplo `AT-7K3QX9`. Son unos 887 millones de combinaciones. Se genera con un generador criptográfico (`gen_random_bytes` de pgcrypto en el `DEFAULT` de la columna, o `crypto.getRandomValues` en el Worker), y si choca con el `UNIQUE` se reintenta. Así no revela cuántos pedidos hay ni permite adivinar los vecinos. Aun así, la página del pedido se abre con un token secreto, no con el código (`REGLAS.md` A2). El CHECK actual (6–20 caracteres) ya lo admite.
- `status`: se reemplaza el CHECK por el flujo de RF20: `pending_payment, confirmed, preparing, ready, picked_up, cancelled, refunded, no_show`. Los 3 pedidos de prueba se migran o se borran.
- `no_show`: el admin lo marca cuando un pedido pagado no se recoge; el reembolso, si corresponde, sigue la política de cancelación.
- `payment_status`: `unpaid, paid, partially_refunded, refunded, failed`.
- `customer_email`: `not null`, para enviar la confirmación o el recibo con cualquier método de pago.
- `payment_method`: **no admite efectivo** (el sitio solo acepta pagos virtuales). Valores: `card, apple_pay, google_pay, klarna, afterpay_clearpay, affirm`. Lo llena el webhook con el método que el cliente usó de verdad en Stripe Checkout; mientras no se pague, queda en `null`.
- Índices `(scheduled_for)` y `(payment_status)`. Se elimina `orders_code_idx`, que duplica el índice del UNIQUE.

**`order_items`**
- `+ size_id uuid references product_sizes`, `+ serves int`, `+ units int` (copias del momento de la compra).
- `+ notes text check (length(notes) <= 500)`: las "Notas para la cocina" del detalle.
- `extras` pasa de texto a `jsonb` (`[{id, name_en, name_es, price_cents}]`).

**`stores`**
- `+ timezone text not null default 'America/New_York'`: indispensable para las franjas, la anticipación y el "hoy" del dashboard. La tienda está en Passaic, NJ (hora del Este), así que este es el valor correcto.
- Datos de la tienda para el seed: Passaic, NJ, `lat 40.8635565`, `lng -74.1185816` (de su ficha de Google Maps). La dirección exacta falta confirmarla con la clienta.
- Las columnas `*_hours` en texto se reemplazan por `business_hours` (§3.2). La interfaz arma el texto a partir de esa tabla.

**`business_settings`**
- **Las reglas de negocio no van como columnas aquí**, sino en `business_rules` (§3.2): los interruptores de pago (`payments.online_enabled`, `payments.bnpl_enabled`), la duración de la franja (`time.slot_minutes`), los días máximos de anticipación (`time.max_days_ahead`), los tramos de cancelación y todo lo de `REGLAS.md`. `business_settings` queda solo para la identidad del negocio (nombre, contacto, redes y SEO).
- Se migran a `business_rules` y luego se eliminan de aquí: `delivery_*`, `tax_rate`, `tax_label`, `default_language`, `email_notifications`, `email_recipient`, `sms_*` y los `*_hours`. Se eliminan sin migrar: `cash_enabled` (no hay efectivo) y `card_enabled`, `apple_pay_enabled` y `google_pay_enabled` (Stripe Checkout muestra solo las billeteras que admite cada dispositivo).
- La retención del cupo (35 min) **no** es configurable: es una garantía técnica (`REGLAS.md` A1) y queda como constante en el código.
- Se elimina `stripe_public_key`: la clave pública va en la configuración del frontend y la secreta solo en el Worker.
- Se eliminan los `*_hours` duplicados (pasan a `business_hours` por tienda).

### 3.2 Tablas nuevas

| Tabla | Columnas | Para qué |
|---|---|---|
| `product_inclusions` | `id, product_id → products, label_en, label_es, sort_order` | La lista "Qué incluye" (RF03). Una tabla aparte, no un texto, para que el admin la edite fila por fila |
| `picadera_options` | `id, piece_type_en, piece_type_es, filling_en, filling_es, image_url, active, sort_order` | Las piezas del armador (RF08). Nombres bilingües (el PLAN las tenía sin idioma) |
| `order_item_components` | `order_item_id → order_items, picadera_option_id → picadera_options, piece_label_snapshot, qty > 0`, PK `(order_item_id, picadera_option_id)` | El desglose de la picadera. La suma exacta (`sum(qty) = units`) la valida el Worker (RF06) |
| `business_hours` | `store_id, weekday 0–6, opens_at time, closes_at time`, PK `(store_id, weekday)`; si un día no tiene fila, ese día está cerrado | El horario estructurado: genera las franjas del checkout (RF10) y el texto del footer |
| `closed_days` | `store_id, date, reason_en, reason_es`, PK `(store_id, date)` | Feriados y días cerrados (RF21) |
| `capacity_rules` | `store_id, weekday, category ('tray','table','picadera_pack'), max_units_per_slot, max_units_per_day` | La plantilla de capacidad que edita el admin ("máx. N bandejas el sábado") |
| `capacity_slots` | `id, store_id, date, slot_start time, category, max_units, reserved_units`, `unique (store_id, date, slot_start, category)`, `check (reserved_units <= max_units)` | Se crean desde `capacity_rules` la primera vez que alguien reserva (RNF-C03) |
| `slot_holds` | `id, checkout_token, slot_id → capacity_slots, qty, expires_at, released_at` | Retención de 15 min mientras el cliente paga; el cron libera las que vencen |
| `stripe_events` | `event_id text primary key, type, processed_at` | Idempotencia del webhook (RNF-P01.4) |
| `audit_log` | `id, actor uuid → auth.users, action, entity, entity_id, diff jsonb, created_at` | Bitácora del admin (RNF-S11); se llena con triggers |
| `site_content` | `key, locale ('en','es'), value, draft_value, updated_by, updated_at`, PK `(key, locale)` | Todos los textos del sitio (hero, pasos, notas, eslogan, "Nosotros", políticas). `draft_value` permite la vista previa antes de publicar (RF-A04) |
| `business_rules` | `key text, store_id uuid null → stores, value jsonb not null, effective_from timestamptz not null default now(), updated_by → auth.users, updated_at`, PK `(key, store_id, effective_from)` | Todas las reglas configurables (`REGLAS.md`, "Cómo se configuran las reglas"). Las claves y los tipos viven en el registro Zod de `packages/shared/rules`, no en la BD: si una clave no tiene fila, se usa el valor por defecto del registro. `store_id null` = regla global; con tienda = excepción para esa tienda. La regla vigente es la de `effective_from` más reciente que ya pasó. El Worker valida `value` con el schema antes de guardar, y un trigger escribe cada cambio en `audit_log` |
| `admin_profiles` | `user_id → auth.users primary key, role ('owner','admin','staff'), active` | Reemplaza a `admin_users`: el login se hace con Supabase Auth + TOTP |

Tablas que se eliminan: `admin_users` (por la contraseña en texto plano y porque Supabase Auth la reemplaza). `order_status_history.admin_user_id` pasa a apuntar a `auth.users`.

### 3.3 Funciones

- **`reserve_slot(p_token uuid, p_store uuid, p_date date, p_slot time, p_category text, p_qty int)`**: crea el slot desde `capacity_rules` si no existe y hace `UPDATE … SET reserved_units = reserved_units + p_qty WHERE reserved_units + p_qty <= max_units RETURNING`, insertando el `slot_hold` en la misma transacción. Solo la ejecuta `service_role`.
- **`release_expired_holds()`**: la llama el cron cada minuto.
- **`available_slots(p_store uuid, p_from date, p_to date, p_categories text[], p_lead_hours int)`**: arma el calendario y las horas del checkout (los días y franjas agotados salen de aquí). La lee el Worker y la cachea.
- **`is_admin()`**: `exists (select 1 from admin_profiles where user_id = auth.uid() and active) and (auth.jwt() ->> 'aal') = 'aal2'`. Es la base de todas las políticas del admin y obliga a usar 2FA (RNF-S08).
- `validate_promo_code`: pasa al Worker o queda solo para `service_role`. El descuento se recalcula en el servidor.
- `verify_admin_password`: **se elimina**.
- A todas las funciones se les fija `set search_path = ''`. `get_hourly_sales` agrupa por la hora local de la tienda (`created_at at time zone stores.timezone`).

### 3.4 Políticas RLS para la v3

- **`anon`**: solo `SELECT` en el catálogo activo (`categories`, `products`, `product_sizes`, `product_extras`, `product_images`, `product_inclusions`, `product_nutritional_info`, `picadera_options`, `stores`, `pickup_locations`, `business_hours`, `closed_days`), en `site_content` (solo `value`, nunca `draft_value`) y en las columnas públicas de `business_settings`. **Ningún acceso** a `orders`, `order_items`, `promo_codes`, `capacity_*`, `slot_holds`, `stripe_events`, `audit_log` ni `admin_profiles`.
- **Escrituras de clientes**: ninguna. Los pedidos los crea el Worker con `service_role` (PLAN §6). La página de confirmación consulta el pedido por el Worker con `checkout_token` o `stripe_session_id`, nunca con un `SELECT` público.
- **Admin**: una política `FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin())` por tabla.
- **Storage**: `product-images` sigue siendo de lectura pública; subir, actualizar y borrar requiere `is_admin()`.
- Antes de crear las nuevas, se eliminan **todas** las políticas actuales (están duplicadas y se contradicen).

---

## 4. Contención inmediata (pendiente de aprobación)

Cierra lo que está abierto en la BD actual sin cambiar el esquema. **Efecto secundario**: el admin de `atalia-cafe-react` deja de poder guardar (porque usa la anon key) y su checkout ya no podría crear pedidos (aunque hoy no lo hace). El menú público sigue funcionando.

```sql
-- 1. Quitar las políticas que abren todo al rol public
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies
           where schemaname = 'public'
             and policyname in ('Enable all for all users', 'enable_all_for_authenticated', 'Enable read for all',
                                'public_read_own_order', 'public_read_order_items',
                                'public_create_orders', 'public_create_order_items')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 2. Funciones SECURITY DEFINER fuera del alcance de anon/authenticated
revoke execute on function public.verify_admin_password(text, text) from anon, authenticated, public;
revoke execute on function public.validate_promo_code(text, numeric) from anon, authenticated, public;

-- 3. Storage: solo lectura pública
drop policy if exists "Allow public uploads" on storage.objects;
drop policy if exists "Allow public updates" on storage.objects;
drop policy if exists "Allow public deletes" on storage.objects;
drop policy if exists "Public Upload"        on storage.objects;
drop policy if exists "Public Update"        on storage.objects;
drop policy if exists "Public Delete"        on storage.objects;
```

Después de aplicarla, hay que:
1. Cambiar la contraseña del usuario de `auth.users` desde el panel de Supabase.
2. Activar la protección contra contraseñas filtradas (Auth → Providers → Email).
3. Las políticas `admin_all_*` (`TO authenticated USING (true)`) siguen dejando que **cualquier usuario autenticado** escriba. Hoy solo hay un usuario, pero si se activa el registro público por email, cualquiera podría crearse una cuenta y escribir. Hay que confirmar que el registro está desactivado (Auth → Settings → "Allow new users to sign up") hasta que exista `is_admin()`.

---

## 5. Decisiones pendientes

1. **¿Mismo proyecto o uno nuevo?** El proyecto `atalia-cafe` ya está en `us-east-1` y casi no tiene datos (15 categorías, 1 producto, 3 pedidos de prueba). Propuesta: usarlo como **staging** después de la contención y crear el de **producción** (Pro) limpio en la Fase 6. Antes hay que confirmar que la referencia no está publicada y en uso por clientes reales.
2. **Precio de los productos de catering**: precio absoluto en `product_sizes.price_cents` (lo propuesto) o seguir con `products.price_cents + price_modifier_cents`. Se propone el absoluto, porque los precios por personas no son sumas lineales.
3. ~~Pedidos del menú (no catering)~~ **Resuelto**: solo pagos virtuales con Stripe, en línea o a cuotas, para todo el sitio (RF13–RF15). Sin efectivo. Todos los pedidos empiezan en `pending_payment`.
4. **¿Cuenta cada pieza de picadera para la capacidad?** Es decir, si la capacidad se mide en paquetes o en piezas. Se propone medir en paquetes.
5. ~~Zona horaria~~ **Resuelto**: Passaic, NJ → `America/New_York`. El impuesto por defecto pasa de 8.50 a **6.625 %** (la tasa estatal de NJ, que se aplica a la comida preparada y al catering), pendiente de que lo confirme su contador (`REGLAS.md` B10).
6. **Reseñas** (PLAN §9 "Confianza"): si van, falta una tabla `testimonials` (texto bilingüe, autor, calificación, `active`). No hay que publicar reseñas inventadas.
