# Atalia Café v3 — Plan del proyecto

> Documento maestro para desarrollar con Claude Code en VS Code.
> Repo: `LamarKel/atalia-cafe` · Referencia del código anterior: `LamarKel/cafe` (rama `v2-supabase`).

---

## 1. Contexto

Web de **catering y pedidos online** para Atalia Café, un negocio en EE.UU. El sitio abre en **inglés por defecto**, con toggle a español.

**Prioridad de la clienta:** catering (bandejas, mesas y picaderas) con precios por cantidad de personas, pedido y **pago en línea**. El menú normal se mantiene, pero no es prioridad.

**Diseño (decisión de la clienta, 2026-10-18):** lo que se ve lo definen **las 6 pantallas aprobadas** (`docs/design/`): Inicio, Catálogo, Detalle de bandeja, Arma tu picadera, Checkout y Confirmación.

Lo que no tiene pantalla propia (el menú del café, el carrito y el admin) sigue el mismo lenguaje visual. El menú, en particular, se basa en la pantalla 02 (Catálogo): filtros, búsqueda y tarjetas. La marca de Atalia (colores, fuentes y botones) se mantiene en todo.

### Apps de referencia funcional (OBLIGATORIO revisarlas antes de programar una pantalla)

Hay **dos** versiones de la app vieja. Las dos son de **solo lectura** y sirven para saber **qué hace** cada pantalla, no para copiar su aspecto:

| App | Qué es |
|---|---|
| 📁 **`D:\Dev\cafe`** (rama `v2-supabase`) | **La que está publicada** en [ataliacafe.netlify.app](https://ataliacafe.netlify.app/). HTML + JS, con funciones de Netlify. Es la más completa: **referencia principal** |
| 📁 **`D:\Dev\atalia-cafe-react`** | Versión en React, no publicada. Apoyo. Auditada en `docs/REFERENCE.md` |

- **El menú:** conserva **todas sus funciones** (categorías, búsqueda, modal de producto con tamaños, extras e info nutricional, selector de tienda, carrito), con el **diseño nuevo**.
- **El admin:** conserva **las secciones y funciones** de `D:\Dev\cafe/admin.html` (dashboard, productos con tamaños, extras e imágenes, categorías, pedidos, historial con CSV, configuración, tiendas y puntos de recogida, cupones) y **se amplía** con lo de catering.
- **La lógica existente** (carrito, checkout, tracking, consultas a Supabase, i18n) es la referencia funcional al reescribir.

Regla: **no se pierde ninguna función que ya exista; el aspecto sigue el diseño nuevo.** Ante una duda sobre qué hace algo, se revisan las apps viejas antes de inventar.

---

## 2. Alcance

### Fase 1 del producto (entrega)
- Sección de **Catering**: bandejas (desayuno, charcutería, quesos), mesas para eventos y picaderas.
- **Armador de picaderas**: paquetes de 5/10/15/20 piezas, combinando tipos y rellenos.
- **Checkout**: fecha y hora de recogida, datos del cliente y pago con Stripe.
- Emails de confirmación al cliente y al negocio.
- **Panel admin** extendido: catálogo de catering, agenda de pedidos y estados.
- El menú actual se conserva.

### Fase 2
- Pago a plazos (Klarna / Afterpay / Affirm vía Stripe), cuando la clienta tenga la cuenta aprobada.
- Delivery con zonas y costo de envío (pendiente de confirmar con la clienta).
- ~~Cotización personalizada para eventos grandes.~~ Pasa a la fase 1, con envío por correo (RF-Q01–Q05).

### Fuera de alcance
App móvil nativa, programa de lealtad, integración con un POS, 3D, **pagos en efectivo** y cuadre de caja o contabilidad (el sitio solo acepta pagos virtuales).

---

## 3. Requerimientos funcionales

### Catálogo
- **RF01** Sección "Catering" separada del menú, con categorías: Bandejas, Mesas, Picaderas.
- **RF02** Cada producto de catering tiene opciones por número de personas, cada una con su precio.
- **RF03** Fotos, descripción y "qué incluye" por producto.
- **RF04** Filtros por categoría y número de invitados; búsqueda.

### Picaderas
- **RF05** Elegir el tamaño del paquete (5/10/15/20).
- **RF06** Repartir las piezas entre tipos y rellenos; la suma debe ser exacta (validado en el cliente **y** en el servidor).
- **RF07** Botón "Combínalas por mí", que reparte las piezas automáticamente.
- **RF08** El admin define los tamaños, precios, tipos y rellenos disponibles.

### Pedido
- **RF09** Elegir fecha y hora de recogida respetando la anticipación mínima por categoría (picaderas: 1 h; bandejas y mesas: 24–48 h, a confirmar).
- **RF10** Bloquear horarios fuera del horario del negocio y los días o franjas sin cupo.
- **RF11** Capacidad por día o franja (ej. un máximo de N bandejas el sábado).
- **RF12** Notas del pedido (alergias, tipo de evento).
- **RF13** **Solo pagos virtuales.** Todos los pedidos (menú y catering) pasan por el mismo checkout y se pagan en línea con Stripe antes de confirmarse. El sitio **no acepta efectivo**.

### Cotización de eventos
- **RF-Q01** Formulario "Pide una cotización" para eventos grandes o a medida: nombre, email, teléfono, fecha del evento, número de invitados, tipo de evento, productos de interés (opcional) y notas.
- **RF-Q02** Aparece en el catálogo, en el detalle de una mesa y cuando el número de invitados supera la regla `orders.quote_threshold_guests` (REGLAS.md B12).
- **RF-Q03** Al enviarse, la solicitud se guarda en la BD (`quote_requests`) y se envían **dos correos** con Resend: uno al negocio, con todos los datos, a los destinatarios de la regla `notifications.order_recipients`; y uno de confirmación al cliente.
- **RF-Q04** Protección: Turnstile, rate limit, validación con Zod y sanitización (RNF-S07, RNF-S09). Se envía por el Worker; nunca directo a la BD.
- **RF-Q05** En el admin: lista de cotizaciones con su estado (`new` → `contacted` → `won` / `lost`) y notas internas.

### Pagos
- **RF14** Métodos de pago para cualquier pedido, cada grupo activable o desactivable desde el admin:
  - **En línea**: tarjeta, Apple Pay y Google Pay vía Stripe Checkout.
  - **A cuotas**: Klarna, Afterpay y Affirm vía Stripe Checkout. Queda apagado hasta que Stripe apruebe la cuenta de la clienta, y Stripe solo ofrece cada opción dentro de sus montos mínimos y máximos.
- **RF15** El checkout muestra solo los métodos activos, y el servidor valida que el método elegido esté activo.
- **RF16** Email de confirmación al cliente y aviso al negocio por cada pedido pagado.
- **RF17** Reembolso total o parcial desde el admin.

### Menú (existente, se conserva)
- **RF-M01** El menú conserva **las mismas funciones** que la app publicada (`D:\Dev\cafe`): categorías, búsqueda, modal de producto (tamaños, extras, info nutricional), selector de tienda y carrito, con el **diseño nuevo** (lenguaje visual de las pantallas aprobadas, en especial la 02 · Catálogo).
- **RF-M02** Todo el contenido del menú se edita desde el admin; nada queda escrito a mano en el código.

### Admin — editable al 100%
- **RF-A01** Se mantiene el diseño y las secciones del admin actual (ver la referencia) y se le agregan las de catering.
- **RF-A02** La clienta puede editar **todo** sin tocar el código:
  - Menú: categorías, productos, fotos, precios, tamaños, extras, info nutricional, orden y visibilidad.
  - Catering: bandejas, mesas, opciones por personas y precios, qué incluye, fotos, anticipación.
  - Picaderas: tamaños de paquete, precios, tipos y rellenos.
  - Contenido del sitio: textos del hero, banners, "Nosotros", horario, dirección, teléfono, redes, políticas (EN y ES).
  - Negocio: tiendas, puntos de recogida, impuesto, capacidad diaria, días cerrados.
  - Promociones: códigos promocionales.
  - Pedidos: estados, notas, reembolsos, exportación.
  - **Reglas de negocio**: pagos, propina, anticipo, impuesto, tiempos, capacidad, cancelaciones, límites, promociones, avisos, textos legales y roles (ver `docs/REGLAS.md`, "Cómo se configuran las reglas").
- **RF-A05** Las reglas se declaran una sola vez en un registro tipado (`packages/shared/rules`) del que salen el formulario del admin, la validación y la lectura en el Worker. Agregar una regla nueva no requiere migración ni pantalla nueva. Cada cambio queda auditado, se puede restaurar el valor por defecto, puede tener fecha de vigencia y aplica solo a los pedidos nuevos (cada pedido guarda una copia de sus reglas).
- **RF-A03** Subida de imágenes a Supabase Storage, con recorte y optimización automática.
- **RF-A04** Vista previa antes de publicar los cambios de contenido.
- **RF18** CRUD de productos, opciones por personas y piezas de picadera.
- **RF19** Agenda de pedidos por fecha de entrega.
- **RF20** Estados del pedido: `pending_payment` → `confirmed` → `preparing` → `ready` → `picked_up` (más `cancelled`, `refunded` y `no_show`). El estado del pago va en un campo aparte: `unpaid`, `paid`, `partially_refunded`, `refunded` o `failed`.
  - Todo pedido se crea en `pending_payment` y pasa a `confirmed` + `paid` cuando llega el webhook de Stripe.
  - Si un pedido pagado no se recoge, el admin lo marca `no_show`. El reembolso, si corresponde, sigue la política de cancelación (`docs/REGLAS.md`, B6).
- **RF21** Configurar la anticipación mínima, el horario y la capacidad por día.
- **RF22** Exportar pedidos a CSV.

---

## 4. Requerimientos no funcionales

### Generales
- **RNF01** Mantener la marca: `#6B7F5A` (verde), `#6B4A3A` (café), `#F6F1EB` (crema), `#2E2E2E` (texto); Playfair Display + Poppins.
- **RNF02** Mobile-first: la mayoría del tráfico llega desde Instagram y WhatsApp.
- **RNF03** Bilingüe: EN por defecto, ES con toggle.
- **RNF04** Rendimiento: LCP < 2.5 s en 4G, CLS < 0.1; imágenes WebP con lazy load.
- **RNF05** Accesibilidad **WCAG 2.1 AA** (riesgo legal ADA en EE.UU.): contraste ≥ 4.5:1, navegación con teclado, `alt` en las imágenes, labels reales, áreas táctiles ≥ 44 px, `prefers-reduced-motion`.

### Seguridad
- **RNF-S01** HTTPS + HSTS, TLS ≥ 1.2.
- **RNF-S02** Headers: CSP, X-Frame-Options, Referrer-Policy y Permissions-Policy.
- **RNF-S03** RLS en todas las tablas; `anon` solo lee el catálogo activo.
- **RNF-S04** La `service_role` key solo vive en el Worker (como secret), nunca en el frontend.
- **RNF-S05** El precio y la disponibilidad **siempre se recalculan en el servidor**.
- **RNF-S06** El webhook de Stripe se verifica con la firma.
- **RNF-S07** Rate limiting en `/checkout` y en el login del admin, más Turnstile en los formularios públicos.
- **RNF-S08** Admin con **2FA obligatorio** (TOTP) y sesiones cortas.
- **RNF-S09** Validación con Zod y sanitización de toda entrada (XSS).
- **RNF-S10** Datos personales mínimos; nunca se guardan datos de tarjeta.
- **RNF-S11** Bitácora de auditoría de las acciones del admin.
- **RNF-S12** Política de privacidad, términos y política de cancelación visibles antes de pagar.

### Disponibilidad
- **RNF-D01** Uptime objetivo de 99.9%.
- **RNF-D02** El frontend estático en el CDN carga aunque falle la BD, con un mensaje de error amable.
- **RNF-D03** Backups diarios de Supabase, más un `pg_dump` semanal a Cloudflare R2.
- **RNF-D04** Monitoreo de uptime cada minuto, con alertas.
- **RNF-D05** El pedido se confirma **solo por el webhook**, nunca por la redirección.
- **RNF-D06** Entornos separados: staging (Stripe en modo test) y producción.
- **RNF-D07** Deploy desde GitHub con rollback.

### Concurrencia y carga
- **RNF-C01** El catálogo se cachea en el edge (TTL de 1–5 min, purgado al editar).
- **RNF-C02** Pooling de conexiones (Supavisor, modo transaction).
- **RNF-C03** Reserva de cupo **atómica** en SQL; retención de 35 min mientras se paga, que siempre dura más que la sesión de Stripe (30 min). Si llega un pago sin cupo, se reembolsa automáticamente (ver `docs/REGLAS.md`, A1).
- **RNF-C05** Las reglas técnicas A1–A12 y las de negocio B1–B17 están en `docs/REGLAS.md`.
- **RNF-C04** Metas bajo carga: p95 de la API < 500 ms, 0 sobreventas, < 1% de errores.

### Anti doble cobro
- **RNF-P01** Como máximo **un cobro por intento de compra**:
  1. Frontend: botón bloqueado al primer clic; `checkout_token` (UUID) por intento.
  2. BD: `UNIQUE(checkout_token)` en `orders`.
  3. Stripe: `Idempotency-Key = checkout_token`; la sesión expira a los 30 min (el mínimo que permite Stripe), antes que la retención del cupo (35 min).
  4. Webhook: tabla `stripe_events(event_id PK)`; `UPDATE ... WHERE payment_status = 'pending_payment'`.
  5. Red de seguridad: detector diario de duplicados, reconciliación Stripe ↔ BD, Stripe Radar activo.

---

## 5. Stack

| Capa | Tecnología |
|---|---|
| Frontend | **Astro + TypeScript** |
| Estilos | **Tailwind**, con los colores y fuentes de la marca como tokens |
| Interactividad | **Islas de React** (carrito, armador de picaderas, checkout, admin) |
| Componentes base | **shadcn/ui y 21st.dev**, adaptados a la marca |
| Animaciones | **Motion** (microinteracciones; respeta `prefers-reduced-motion`) |
| Guía UX | **UI UX Pro Max** (skill de Claude Code), solo como checklist; no cambia la marca |
| Validación | **Zod**, compartido entre el frontend y la API |
| API | **Cloudflare Workers + TypeScript** (Hono como router) |
| Hosting | **Cloudflare Pages** (WAF, DDoS, rate limiting, Turnstile) |
| BD / Auth / Realtime / Storage | **Supabase Pro**, región `us-east-1` |
| Pagos | **Stripe Checkout** + webhooks + Radar |
| Emails | **Resend**, con SPF, DKIM y DMARC |
| Monitoreo | **Sentry** (errores) + Better Stack o UptimeRobot (uptime) |
| Pruebas | **Vitest** (unitarias), **Playwright** (e2e), **k6** (carga) |
| Calidad | ESLint, Prettier, TypeScript `strict` |
| CI/CD | **GitHub Actions** → staging → producción |
| Paquetes | **pnpm** workspaces |

---

## 6. Arquitectura

**JAMstack** (despliegue) + **monolito modular** (organización) + **hexagonal ligera** (protección de la lógica).

```
Cliente ──► Cloudflare (CDN + WAF + DDoS + Turnstile)
              ├─ Pages: sitio Astro (estático + islas de React)
              └─ Worker (API)
                   /catalog   → catálogo (cacheado en el edge)
                   /checkout  → valida, recalcula, reserva cupo, crea el pedido y la sesión de Stripe
                   /webhook   → verifica la firma, idempotencia, marca el pedido como pagado, envía los emails
                   │
                   ├─► Supabase Pro (Postgres + RLS)
                   ├─► Stripe
                   └─► Resend
Admin (2FA) ──► Supabase Auth + Realtime
Cron (Worker) ──► libera cupos vencidos, reconciliación, detector de duplicados, backup a R2
```

### Reglas de acceso
- **Lecturas públicas** (catálogo): por el Worker, con caché.
- **Escrituras de clientes** (pedidos, pagos): **solo por el Worker**.
- **Admin**: directo con Supabase usando RLS + 2FA en la fase 1.

---

## 7. Estructura del repo

```
atalia-cafe/
├── apps/
│   ├── web/                     # Astro: sitio público
│   │   ├── src/
│   │   │   ├── pages/           # index, catering/, catering/[slug], picadera, checkout/, order/[id]
│   │   │   ├── components/      # .astro (estáticos) + islands/ (React)
│   │   │   ├── layouts/
│   │   │   ├── i18n/            # en.json, es.json
│   │   │   └── styles/
│   │   └── astro.config.mjs
│   ├── admin/                   # Panel admin (Astro + React)
│   └── api/                     # Cloudflare Worker
│       └── src/
│           ├── modules/
│           │   ├── catalog/     # domain/ · application/ · ports.ts
│           │   ├── orders/      # Order, PicaderaCombo, cupos, validaciones
│           │   └── payments/    # startCheckout, handlePaymentEvent
│           ├── adapters/        # supabase/ · stripe/ · resend/
│           ├── http/            # rutas Hono, middleware (Zod, rate limit, Turnstile)
│           ├── cron/            # tareas programadas
│           └── index.ts         # composición: une los puertos con los adaptadores
├── packages/
│   ├── shared/                  # tipos, esquemas Zod, reglas de precio
│   └── ui/                      # componentes base con la marca + tokens Tailwind
├── db/
│   ├── migrations/              # SQL versionado
│   ├── policies/                # RLS
│   └── seed/                    # datos de staging
├── tests/
│   ├── e2e/                     # Playwright
│   └── load/                    # k6
├── .github/workflows/           # CI/CD
├── CLAUDE.md                    # reglas para Claude Code
└── PLAN.md                      # este documento
```

---

## 8. Base de datos (cambios sobre el esquema v2)

Se parte de las 14 tablas de v2 y se agrega lo siguiente:

- `products`: + `type` (`menu` | `tray` | `table` | `picadera_pack`), + `min_lead_hours`, + `slug`.
- `product_sizes`: se reutiliza para las opciones por personas (`serves`) y los paquetes (`units`).
- **Nueva** `picadera_options`: `id, piece_type, filling, active, sort_order`.
- **Nueva** `order_item_components`: el desglose de cada combinación (`order_item_id, picadera_option_id, qty`).
- `orders`: + `checkout_token UUID UNIQUE`, + `scheduled_for`, + `payment_status`, + `stripe_session_id UNIQUE`, + `stripe_payment_intent_id`.
- **Nueva** `capacity_slots`: `date, slot_start, category, max_units, reserved_units` + un CHECK de `reserved_units <= max_units`.
- **Nueva** `slot_holds`: reservas temporales con `expires_at`.
- **Nueva** `stripe_events`: `event_id PK, type, processed_at`.
- **Nueva** `audit_log`: `actor, action, entity, entity_id, diff, created_at`.
- **Nueva** `site_content`: `key, locale (en|es), value, updated_by, updated_at`, para que los textos del sitio se editen desde el admin.
- **Nueva** `closed_days`: los días festivos o cerrados que define el admin.
- **Índices**: `orders(scheduled_for)`, `orders(payment_status)`, `products(category_id, active)`.
- **Función** `reserve_slot(...)`: atómica (`UPDATE ... WHERE reserved_units + qty <= max_units RETURNING`).

---

## 9. UX/UI

- **Navegación:** Inicio · Catering · Menú · Nosotros · Contacto, con el carrito y el idioma (EN · ES). En el móvil, una barra inferior fija: Catering · Menú · Carrito.
- **Pantallas** según el lienzo aprobado:
  1. **Inicio:** hero con CTA a catering, 3 categorías, "How it works" y el footer con horario y ubicación.
  2. **Catálogo:** filtros (categoría e invitados), búsqueda y tarjetas con "desde $" y la anticipación.
  3. **Detalle:** galería, selector de personas en chips con el precio en vivo, qué incluye, notas y cantidad.
  4. **Armador de picaderas:** paquete, contadores ± por pieza, barra de progreso y "Combínalas por mí"; el botón solo se activa con la cuenta exacta.
  5. **Checkout** en 3 pasos (Cuándo · Datos · Pago): el calendario solo muestra los días y horas válidos.
  6. **Confirmación:** número de pedido, fecha, dirección y botones de direcciones, calendario y WhatsApp.
- **Confianza:** reseñas, política de cancelación antes de pagar, íconos de pago seguro.
- **Microinteracciones con Motion:** el carrito rebota al agregar, la barra del armador se llena con un spring, revelados al hacer scroll, transiciones entre los pasos del checkout, skeleton loaders y toasts.

---

## 10. Fases de desarrollo

Cada fase se cierra con un PR revisado, el CI en verde y el deploy a staging.

### Fase 0 — Preparación (fuera del código)
- [ ] Restaurar o crear el proyecto Supabase (Pro, `us-east-1`); un proyecto o branch para staging.
- [ ] Cuenta de Cloudflare + dominio.
- [ ] Cuenta de Stripe **a nombre del negocio** (la abre la clienta).
- [ ] Cuenta de Resend + DNS (SPF, DKIM, DMARC).
- [ ] Sentry + monitor de uptime.
- [ ] Pedirle a la clienta: fotos, precios por personas, qué incluye cada bandeja, anticipación, horario, dirección, si quiere delivery y la política de cancelación.

### Fase 1 — Base
- [x] **Auditar `D:\Dev\atalia-cafe-react`** y generar `docs/REFERENCE.md`.
- [x] Capturas de la app publicada en `docs/screenshots/netlify/` (escritorio y móvil). Tomadas después de la migración v3, así que muestran el layout pero no los datos de entonces.
- [ ] **Auditar `D:\Dev\cafe`** (la app publicada, referencia principal) y agregarla a `docs/REFERENCE.md`.
- [x] Monorepo con pnpm, TypeScript `strict`, ESLint, Prettier.
- [x] `packages/ui`: tokens en Tailwind, fuentes y componentes base (Button, Card, Chip/OptionGroup/Tag, Stepper/QuantityStepper, Toast) en React, con pruebas de accesibilidad.
- [x] `apps/web` con Astro: layout, header/footer, i18n EN/ES.
- [x] `apps/api` con Hono, health check y manejo de errores.
- [x] `packages/shared`: dinero en centavos y registro de reglas configurables, con pruebas.
- [x] `db/migrations`: esquema v3 + RLS (aplicado en staging; ver `docs/DATABASE.md`).
- [ ] CI: lint, typecheck y tests en cada PR ✅; deploy a staging en `main` (pendiente: necesita la cuenta de Cloudflare, Fase 0).
- [x] `CLAUDE.md` con las reglas del proyecto.

### Fase 2 — Menú y catálogo
- [ ] **Migrar el menú actual** con todas sus funciones (`D:\Dev\cafe/menu.html`) y el diseño nuevo (lenguaje visual de las pantallas aprobadas, en especial la 02 · Catálogo); validar que no se pierde ninguna función.
- [ ] Endpoint `/catalog` con caché en el edge.
- [ ] Páginas: Inicio, Catálogo, Detalle.
- [ ] Isla del armador de picaderas, con la validación compartida (Zod) en `packages/shared`.
- [ ] Carrito (isla de React, persistido en `localStorage` con try/catch).
- [ ] Tests unitarios de las reglas de precio y de las combinaciones.

### Fase 3 — Pedidos y pagos
- [ ] Selector de fecha y hora conectado a `capacity_slots`.
- [ ] `/checkout`: recalcula el precio, `reserve_slot`, crea el pedido con `checkout_token` y la sesión de Stripe con Idempotency-Key.
- [ ] `/webhook`: firma + `stripe_events` + update condicional + emails con Resend.
- [ ] Página de confirmación y tracking.
- [ ] Cron: liberar las reservas vencidas.
- [ ] Tests: 20 peticiones simultáneas con el mismo token → 1 pedido y 1 sesión.

### Fase 4 — Admin
- [ ] **Migrar el admin actual** (`D:\Dev\cafe/admin.html`) con las mismas secciones y funciones.
- [ ] Agregar las secciones nuevas: Catering, Picaderas, Contenido del sitio, Capacidad y días cerrados, y **Reglas** (formulario generado desde el registro de reglas, RF-A05).
- [ ] Subida de imágenes a Storage, con optimización.
- [ ] Checklist: cada texto, precio e imagen visible en el sitio debe poder editarse desde el admin.
- [ ] Login con 2FA obligatorio.
- [ ] CRUD de catálogo, opciones por personas y piezas de picadera.
- [ ] Agenda de pedidos por fecha (con Realtime), cambios de estado y reembolsos.
- [ ] Configuración de horario, anticipación y capacidad.
- [ ] Auditoría de cada acción.

### Fase 5 — Endurecimiento
- [ ] Headers de seguridad, reglas de WAF y rate limiting, Turnstile.
- [ ] Revisión de las políticas RLS y de los advisors de Supabase.
- [ ] Supabase Auth (se dejó para el final a propósito, mientras dure el desarrollo): desactivar "Allow new users to sign up", activar la protección contra contraseñas filtradas, cambiar la contraseña del usuario owner y exigir 2FA (TOTP).
- [ ] Auditoría de accesibilidad (axe + teclado) con la checklist de UI UX Pro Max.
- [ ] Lighthouse móvil ≥ 90 en rendimiento y accesibilidad.
- [ ] Playwright: flujo completo de compra en staging.
- [ ] k6: smoke, load, spike y una prueba de concurrencia por cupo.
- [ ] Backups a R2, reconciliación, detector de duplicados, Sentry y alertas.

### Fase 6 — Lanzamiento
- [ ] Stripe en vivo (Radar activo).
- [ ] Dominio y DNS en Cloudflare.
- [ ] Prueba con un pago real pequeño y su reembolso.
- [ ] Capacitación de la clienta en el admin.
- [ ] Plan de mantenimiento mensual (costos de Supabase Pro, etc.).

---

## 11. Cómo trabajar con Claude Code en VS Code

1. Clona `atalia-cafe`, copia este `PLAN.md` a la raíz y crea `CLAUDE.md` (sección 12).
1b. **Dale acceso a la referencia.** Abre VS Code con las dos carpetas en un workspace (Archivo → Agregar carpeta al área de trabajo: `atalia-cafe` + `D:\Dev\atalia-cafe-react`), o arranca Claude Code con:
   ```
   claude --add-dir "D:\Dev\atalia-cafe-react"
   ```
   La primera tarea siempre es: *"Lee PLAN.md, CLAUDE.md y audita D:\Dev\atalia-cafe-react; genera docs/REFERENCE.md."* La referencia es **solo lectura**: nunca se modifica.
2. Instala la skill **UI UX Pro Max** (revisa su código antes; corre scripts de Python):
   ```
   /plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
   /plugin install ui-ux-pro-max@ui-ux-pro-max-skill
   ```
   **Cómo usarla:** Claude Code la usa sola cuando la tarea es de UI, pero también se le puede pedir explícitamente:
   > "Usa la skill ui-ux-pro-max para revisar la accesibilidad y la UX de la pantalla del armador de picaderas. No cambies colores, fuentes ni estilo; respeta la marca de CLAUDE.md y la referencia."
3. Opcional: el MCP de **Supabase** (migraciones y advisors) y el de **21st.dev Magic** (componentes).
4. Trabaja **una fase a la vez** y **una tarea por sesión**. Ejemplo de prompt:
   > "Lee PLAN.md y CLAUDE.md. Haz la Fase 1, tarea 'packages/ui: tokens de marca'. Crea una rama `feat/ui-tokens`, implementa, agrega tests y abre un PR."
5. Pide siempre un **plan antes del código** en las tareas grandes (modo plan).
6. Revisa cada PR tú mismo antes de hacer merge, sobre todo el checkout, el webhook y la RLS.

---

## 12. CLAUDE.md

Ver `CLAUDE.md` en la raíz del repo.

---

## 13. Preguntas para la clienta

Solo ella puede responderlas. Entre paréntesis va la regla de `docs/REGLAS.md` que depende de cada respuesta y, cuando existe, el valor que se usará mientras tanto.

### El negocio
- [x] ~~¿En qué ciudad y estado está la tienda?~~ **Passaic, NJ** (hora del Este; coordenadas 40.8635565, -74.1185816, según su ficha de Google Maps).
- [ ] ¿Cuál es la dirección exacta de la tienda? (Un directorio en línea dice 220 Passaic St; falta confirmarlo.)
- [ ] ¿Su contador confirma el 6.625 % de impuesto de NJ? ¿El negocio tiene certificado de Zona de Empresa Urbana (UEZ)? (B10)
- [ ] ¿Hay una sola tienda, o más de un punto de recogida?
- [ ] ¿Se entrega en el carro (curbside) además de dentro de la tienda?
- [ ] ¿Cuál es el horario de cada día, y qué días festivos cierran?
- [ ] ¿Solo recogida, o también delivery?

### Productos y precios
- [ ] ¿Qué bandejas y mesas hay, y cuánto cuesta cada una según el número de personas?
- [ ] ¿Qué incluye cada bandeja y cada mesa?
- [ ] ¿Cuáles son las piezas y los rellenos de las picaderas, y cuánto cuesta cada paquete (5, 10, 15 y 20)?
- [ ] ¿Hay un mínimo o un máximo de piezas de un mismo tipo dentro de un paquete?
- [ ] ¿Tienen fotos propias de cada producto, el logo y los textos de "Nosotros"?
- [ ] El verde de la marca (#6B7F5A) con texto blanco da 4.37:1 y no llega al mínimo de accesibilidad (4.5:1, riesgo ADA). ¿Aprueban usar un verde apenas más oscuro (#5F7250, 5.24:1) solo en botones y chips con texto? El verde de la marca se mantiene en todo lo demás. (`--color-primary-ink` en `packages/ui/src/tokens.css`)
- [ ] ¿Tienen reseñas reales (por ejemplo, de Google) que se puedan mostrar con permiso del cliente?

### Tiempos y capacidad
- [ ] ¿Con cuánta anticipación hay que pedir las bandejas y las mesas: 24 o 48 h? ¿Las picaderas se confirman en 1 h? (B1)
- [ ] ¿Hasta qué hora se aceptan pedidos para el día siguiente? (B2; mientras tanto, 6 pm)
- [ ] ¿Con cuántos días de anticipación, como máximo, se puede reservar? (B3; mientras tanto, 60)
- [ ] ¿Cuántas bandejas, mesas y picaderas pueden preparar por día y por hora? ¿Los sábados es distinto? (B4)
- [ ] ¿Un mismo pedido puede tener cosas del menú y del catering? (B5)
- [ ] ¿A partir de cuántas personas prefieren hacer una cotización en lugar de vender en línea? (B12; mientras tanto, 50)

### Pagos
- [ ] ¿Quieren cobrar un anticipo en las mesas o los eventos grandes? ¿De qué porcentaje, y cuándo se paga el resto? (B7)
- [ ] ¿Quieren ofrecer propina en el checkout? (B9)
- [ ] ¿Los códigos promocionales aplican también al catering? (B14)
- [ ] ¿Ya abrieron la cuenta de Stripe a nombre del negocio? ¿Quieren solicitar el pago a cuotas (Klarna, Afterpay, Affirm)?

### Cancelaciones y cambios
- [ ] ¿Hasta cuántas horas antes se puede cancelar con reembolso completo? ¿Hay reembolso parcial después? (B6; mientras tanto, 100 % con 48 h, 50 % con 24 h)
- [ ] ¿Un cliente puede cambiar un pedido ya pagado? ¿Hasta cuándo? (B8)

### Alérgenos y avisos
- [ ] ¿Qué alérgenos usan (maní, nueces, gluten, lácteos, huevo, mariscos)? ¿La cocina comparte equipo entre productos? (B15)
- [ ] ¿A qué email y a qué WhatsApp quieren recibir los avisos de pedidos nuevos? (B13)

### Equipo
- [ ] ¿Quién más va a usar el admin, y quién puede hacer reembolsos? (B16)
- [ ] ¿Cuánto tiempo necesitan guardar los datos de los clientes para su contabilidad? (B17)
