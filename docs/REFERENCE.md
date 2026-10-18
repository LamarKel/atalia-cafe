# Referencia: `D:\Dev\atalia-cafe-react`

> **Actualización 2026-10-18.** La app **publicada** ([ataliacafe.netlify.app](https://ataliacafe.netlify.app/)) **no es esta**, sino `D:\Dev\cafe` (rama `v2-supabase`, HTML + JS + funciones de Netlify). Es más completa: i18n EN/ES real, búsqueda, info nutricional, puntos de recogida, cupones, Stripe (`netlify/functions/create-checkout.js`), seguimiento del pedido (`/track`) y admin con Supabase Auth, tamaños, extras e imágenes. Ahora es la **referencia funcional principal** (ver `CLAUDE.md`, "Referencias"); este documento queda como apoyo. Sus capturas están en `docs/screenshots/netlify/`. Su auditoría completa está pendiente (PLAN.md, Fase 1).
>
> El **aspecto** ya no se copia de ninguna de las dos apps viejas: lo definen las pantallas aprobadas (`docs/design/`) y el estilo del menú de Delicias Dominicanas.

> Auditoría del proyecto actual (Fase 1, tarea 1 de `PLAN.md`). La referencia es **solo lectura**.
> Fecha de la auditoría: 2026-10-16. Stack auditado: Vite 8 + React 19 + React Router 7 + Tailwind 3.4 + Supabase JS 2.

Cómo usar este documento:
- **§1–§6** describen lo que hay y cómo se ve. Es lo que se replica en la v3.
- **§7** lista lo que el plan da por hecho pero **no existe** o **no funciona** en la referencia. No se puede "copiar tal cual" lo que no existe: hay que construirlo, siguiendo el estilo de la referencia.
- **§8** lista los problemas que **no** se deben portar.

---

## 0. Resumen

| Área | Estado en la referencia |
|---|---|
| Menú (`/menu`) | Funciona contra Supabase. Sidebar de categorías agrupadas, grilla de tarjetas, modal con tamaños y extras, selector de tienda. **No hay búsqueda ni info nutricional.** |
| Carrito (`/cart`) | Funciona en `localStorage`. **El precio ignora el tamaño y los extras** (ver §8). |
| Checkout (`/checkout`) | **Maqueta.** Guarda el pedido solo en el `localStorage` del cliente; nunca llega a Supabase ni al admin. No hay pago real. |
| Inicio (`/`) | Contenido 100 % fijo en el código (textos, precios "RD$" y fotos de Unsplash). |
| Admin (`/admin`) | Conectado a Supabase: dashboard, pedidos, productos (con imágenes), categorías, tiendas, promociones y configuración. **No edita tamaños ni extras.** El historial con CSV existe solo en código muerto. |
| i18n | Hay un `LanguageContext` (por defecto `es`), pero **no hay archivos de traducción ni botón de idioma**. Casi todo el texto está fijo en inglés, con restos en español. |
| Seguridad del admin | **Crítica**: se puede entrar sin contraseña (ver §8.1). |

---

## 1. Rutas y páginas

`src/App.jsx` — proveedores: `LanguageProvider > AuthProvider > StoreProvider > CartProvider`.

| Ruta | Componente | Layout |
|---|---|---|
| `/` | `components/home/HomePage.jsx` | `Layout` (navbar + footer) |
| `/menu` | `components/menu/MenuPage.jsx` (+ `ProductModal.jsx`) | `Layout` |
| `/cart` | `components/cart/CartPage.jsx` | `Layout` |
| `/checkout` | `components/checkout/CheckoutPage.jsx` | `Layout` |
| `/admin` | `components/admin/AdminPage.jsx` | propio (sin `Layout`) |

No hay rutas de tracking de pedido, "Nosotros", contacto, términos ni privacidad (los enlaces del footer apuntan a `#`).

### Código vivo frente a código muerto

Hay **dos generaciones** de componentes. Solo se usa la que importa `App.jsx`:

- **Vivos:** `layout/Layout.jsx` (que define su propio Navbar y Footer en línea), `home/HomePage.jsx`, `menu/MenuPage.jsx`, `menu/ProductModal.jsx`, `cart/CartPage.jsx`, `checkout/CheckoutPage.jsx`, `admin/AdminPage.jsx`, `admin/AdminProducts.jsx`, `admin/AdminCategories.jsx`, `admin/AdminStores.jsx`, `admin/AdminPromoCodes.jsx`, `admin/AdminSettings.jsx`.
- **Muertos (nadie los importa):** `common/Navbar.jsx`, `common/Footer.jsx`, `home/Hero.jsx`, `home/Diferencial.jsx`, `home/MenuPreview.jsx` (importa un `MENU_DATA` que ya no existe), `home/OrderModes.jsx`, `home/Reviews.jsx`, `menu/MenuGrid.jsx`, `menu/MenuSidebar.jsx`, `menu/ProductCard.jsx`, `cart/CartItem.jsx`, `checkout/ConfirmationScreen.jsx`, `checkout/OrderSummary.jsx`, `checkout/PaymentMethod.jsx`, `admin/LoginScreen.jsx`, `admin/AdminDashboard.jsx`, `admin/Dashboard.jsx`, `admin/OrdersList.jsx`, `admin/HistoryTable.jsx`, `contexts/AuthContext.jsx` (el proveedor se monta, pero el admin vivo no lo usa), `services/orderService.js` (salvo `saveOrder`, que usa el checkout).
- **Plantilla de Vite sin usar:** `src/App.css`, `src/index.css`, `src/index.jsx` (duplicado de `main.jsx`), `assets/react.svg`, `assets/vite.svg`.
- `common/Toast.jsx` se llama (`showToast(...)`) desde el menú y el checkout, pero **el componente `<Toast />` nunca se monta**, así que ningún toast aparece.

Algunos componentes muertos documentan funciones que el plan quiere (reseñas, historial con CSV, gráfico por hora, transiciones de estado). Sirven de **referencia funcional**, pero su CSS (`.hero`, `.menu-card`, `.review-card`, etc.) no existe en los estilos actuales.

---

## 2. Estilo global (tokens)

### 2.1 Colores (sitio público)

Definidos en `tailwind.config.js` y repetidos en `src/styles/variables.css`:

| Token Tailwind | Variable CSS | Valor | Uso |
|---|---|---|---|
| `primary` | `--primary-color` | `#6B7F5A` | Verde. Logo, enlaces activos, botones "Add", chips seleccionados, íconos |
| `secondary` | `--secondary-color` | `#6B4A3A` | Café. `.btn-primary`, precios, badge del carrito |
| `accent` | `--accent-color` | `#F6F1EB` | Crema. Fondo del `body` y de las secciones alternas |
| `dark` | `--dark-color` | `#2E2E2E` | Texto, footer, subheader del menú |
| — | `--text-light` | `#666666` | (en la práctica se usa `text-gray-500` de Tailwind) |
| — | `--border-color` | `#E0E0E0` | (en la práctica se usa `border-gray-200`) |

Otros colores que aparecen en el código: blanco (tarjetas, navbar `bg-white/95`), `bg-green-600` (botón de WhatsApp), `text-red-500` (vaciar el carrito), `gray-100/200/300/400/500`.

### 2.2 Tipografía

- **Títulos:** `font-heading` = `'Playfair Display', serif` (pesos 400/600/700/800).
- **Texto:** `font-body` = `'Poppins', sans-serif` (300/400/500/600/700). Se aplica al `body`.
- Se cargan **dos veces**: en `index.html` (Playfair 600/700 + Poppins 300–600) y en `globals.css` con `@import` (más pesos). En la v3 se cargan una sola vez.
- **Íconos:** Font Awesome 6.4.0 por CDN (`fas`, `far`, `fab`). Las categorías guardan el nombre de la clase del ícono en la BD (`categories.icon`, p. ej. `"fas fa-mug-hot"`).

### 2.3 Sombras, radios y espaciado

`variables.css` (declarado, poco usado directamente):

```
--shadow-sm: 0 2px 4px rgba(0,0,0,.10)     --radius-sm: 4px    --space-xs: .5rem   --space-lg: 2rem
--shadow-md: 0 4px 8px rgba(0,0,0,.12)     --radius-md: 8px    --space-sm: 1rem    --space-xl: 3rem
--shadow-lg: 0 8px 24px rgba(0,0,0,.15)    --radius-lg: 16px   --space-md: 1.5rem  --space-xxl: 4rem
                                           --radius-xl: 24px
```

Lo que **de verdad** se ve en pantalla (clases de Tailwind):

| Elemento | Clases |
|---|---|
| Tarjeta de contenido (carrito, checkout, home) | `bg-white rounded-2xl shadow-sm` (hover: `shadow-md`/`shadow-xl`, `-translate-y-1`) |
| Tarjeta de producto del menú | `bg-white rounded-xl shadow-sm border border-gray-200`, hover `-translate-y-1 shadow-md border-primary` |
| Modales | `rounded-2xl`, overlay `bg-black/80 backdrop-blur-sm` (producto) o `bg-black/50` (tienda) |
| Inputs | `p-3 border border-gray-200 rounded-xl focus:border-primary` |
| Chips (tamaños y extras) | `px-4 py-2 rounded-full`; activo `bg-primary text-white`, inactivo `bg-gray-100 text-gray-700` |
| Opción seleccionable (tipo de pedido, método de pago) | `p-4 border-2 rounded-xl`; activa `border-primary bg-primary/5` |
| Secciones | `py-16 md:py-20`, alternando `bg-accent` y `bg-white` |
| Contenedor | `.container-custom` = `max-w-6xl mx-auto px-4 md:px-6`; el menú usa `max-w-[1400px]` |

### 2.4 Botones (`src/styles/globals.css`, `@layer components`)

```css
.btn-primary   { @apply bg-secondary text-white px-6 py-3 rounded-full font-semibold transition-all duration-300
                 hover:bg-transparent hover:border-2 hover:border-secondary hover:text-secondary hover:-translate-y-1; }
.btn-secondary { @apply bg-transparent border-2 border-white text-white px-6 py-3 rounded-full font-semibold transition-all duration-300
                 hover:bg-white hover:text-secondary hover:-translate-y-1; }   /* para fondos oscuros (hero) */
.section-title    { @apply font-heading text-3xl md:text-4xl text-center mb-4 font-bold text-dark; }
.section-subtitle { @apply text-center text-gray-500 mb-10 text-lg; }
```

Nota: el hover de `.btn-primary` agrega un borde de 2px que antes no existía, así que el botón **cambia de tamaño** al pasar el mouse (un salto de layout). En la v3 conviene usar `border-2 border-transparent` en el estado base para que se vea igual sin el salto.

Variantes en línea que se repiten: botón verde `bg-primary text-white rounded-full hover:bg-secondary` ("Add" del menú, CTA "View menu and order") y botón WhatsApp `bg-green-600 rounded-full`.

### 2.5 Animaciones (Tailwind)

- `animate-fade-in`: 0.6 s ease-out, opacidad 0→1 + `translateY(20px)`→0 (texto del hero).
- `animate-slide-up`: 0.4 s ease-out, `translateY(40px)`→0 (declarada, no se usa).
- Imágenes de tarjetas: `group-hover:scale-105 duration-500`.
- No hay soporte de `prefers-reduced-motion`.

### 2.6 Breakpoints

Los de Tailwind por defecto (`sm` 640, `md` 768, `lg` 1024). `md` es el corte principal entre móvil y escritorio (navbar, sidebar del menú, grillas). El admin usa un único corte a 768 px en CSS propio.

---

## 3. Layout público

### 3.1 Navbar (`Layout.jsx`)

- `fixed top-0 h-20 z-50 bg-white/95 backdrop-blur-md shadow-sm`.
- Izquierda: "Atalia Café" en `font-heading text-2xl font-bold text-primary` (texto, sin logo de imagen).
- Escritorio: `Home · Menu · Cart` con `NavLink`; activo `text-primary`, si no `text-dark`. Badge del carrito: círculo `bg-secondary text-white w-5 h-5 text-xs`.
- Móvil: botón hamburguesa de 3 líneas animadas → panel `fixed top-20` que entra desde la izquierda (`-translate-x-full` → `translate-x-0`).
- No hay selector de idioma ni enlace al admin en el navbar vivo.
- Las páginas compensan el header fijo con `pt-28` (carrito/checkout), `mt-20` (hero) o con un subheader `sticky top-[70px] md:top-[80px]` (menú).

### 3.2 Footer (`Layout.jsx`)

- `bg-dark text-white pt-12 pb-6`, grilla `md:grid-cols-3`.
- Columna 1: marca + "Café de calidad desde 2023".
- Columna 2: "Navigation" (Home, Menu, Cart) y "Legal" (Terms, Privacy → `#`).
- Columna 3: "Síguenos" con 3 íconos circulares `w-10 h-10 bg-white/10 hover:bg-primary` (Facebook, Instagram, email `info@atalia.cafe`), con enlaces fijos.
- Pie: "© 2026 Atalia Café. Todos los derechos reservados."
- No muestra el horario ni la dirección, aunque existen en `business_settings` y `stores`.

---

## 4. Páginas públicas

### 4.1 Inicio (`HomePage.jsx`) — todo fijo en el código

1. **Hero:** `min-h-screen`, imagen de Unsplash de fondo con degradado negro; H1 "Your favorite coffee, freshly made every day" (`text-4xl md:text-6xl`); botones `.btn-primary` "View menu" y `.btn-secondary` "Order online" (los dos van a `/menu`).
2. **Our Menu** (`bg-accent`): 3 tarjetas fijas (Caramel Macchiato RD$ 225, Iced Matcha Latte RD$ 195, Croissant de Almendra RD$ 120) con imagen `h-56` + "View full menu".
3. **Taste the difference** (`bg-white`): pastilla "Beyond coffee", 3 ventajas con ícono `text-3xl text-primary` + imagen `rounded-2xl h-96`.
4. **Your coffee, your way** (`bg-accent`): imagen + 3 modos (Pick up in store / Takeaway / Delivery) en tarjetas blancas `rounded-xl` con hover `translate-x-1`; CTA verde con flecha.

### 4.2 Menú (`MenuPage.jsx`) — se replica igual

- **Subheader** sticky `bg-dark text-white`: "Our Menu" + "Discover our favorite drinks and food" y, a la derecha, el **selector de tienda** (`Tienda [🏪 nombre ▾]`).
- **Sidebar escritorio** `w-[260px]`, sticky, scroll propio. Primer grupo "Favorites" → "Trending" (productos con `featured = true`, máx. 8). Luego las categorías activas **agrupadas por `group_name`** (`Drinks`, `Food`, `Favorites`), cada una con su ícono de Font Awesome. Activa: `bg-primary/10 text-primary`.
- **Sidebar móvil:** botón flotante verde `bottom-5 right-5 w-12 h-12` que abre un panel lateral de 280 px.
- **Encabezado de la categoría:** nombre (`font-heading text-2xl md:text-3xl`) + descripción (de la BD, según el idioma).
- **Grilla:** `grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5`. Tarjeta: imagen cuadrada (`pb-[100%]`), estrella si es `featured`, nombre (2 líneas máx.), precio en `text-secondary`, botón "+ Add" verde.
- **Estados:** spinner "Loading products...", vacío "No products in this category yet." con ícono de café.
- **Selector de tienda:** si no hay tienda elegida, al tocar un producto se abre el modal "Choose a store" (lista con nombre, dirección y el horario del lunes). La tienda se guarda en `localStorage` (`atalia_store`) y por defecto se toma la primera activa.
- **Modal de producto** (`ProductModal.jsx`): `max-w-md rounded-2xl`, imagen `h-48` con botón ✕, nombre, precio total en vivo, descripción, chips de **Size** (`product_sizes`, con `+precio` si `price_modifier > 0`; se preselecciona el primero), chips de **Extras** (`product_extras`, selección múltiple), contador de **Quantity** (±) y un pie fijo con "🛒 Add - $total" (verde) + "♡ Favorite" (no hace nada).

### 4.3 Carrito (`CartPage.jsx`)

- Vacío: 🛒 + "Your cart is empty" + "View menu".
- Con productos: grilla `lg:grid-cols-3`. A la izquierda, la lista (imagen 80×80 `rounded-xl`, nombre, tamaño, precio, contador ± en una píldora y un ícono de papelera); a la derecha, el resumen sticky (Subtotal, ITBIS 18 %, Shipping "Calculated at checkout", Total) + "Proceed to checkout" + "Order via WhatsApp" (el botón no hace nada).
- Se persiste en `localStorage` con la clave `atalia_cart`.

### 4.4 Checkout (`CheckoutPage.jsx`) — maqueta, no se porta la lógica

- Tres tarjetas: tipo de pedido (Pickup "Ready in 10–15 min" / Delivery), datos (nombre, teléfono, dirección y referencia si es delivery, "Note for the barista") y método de pago (efectivo / tarjeta, sin formulario real).
- "Confirm order" genera el código `ATL-XXXX` (aleatorio, sin garantía de ser único), lo guarda con `saveOrder` en `localStorage` (`atalia_orders`), vacía el carrito y muestra la confirmación (check verde, código, nota de pago, "Go to home" / "View menu").
- En la v3 solo se reutiliza su **aspecto** (tarjetas, inputs, opciones seleccionables, resumen sticky). El flujo nuevo es el de 3 pasos con Stripe (PLAN §9).

---

## 5. Admin (`/admin`)

### 5.1 Tema visual (oscuro, independiente de la marca pública)

Variables en `globals.css`:

```
--admin-bg: #0f0e0d            --admin-primary: #c8a97e  (dorado)     --admin-success: #4c9f70
--admin-surface: #1e1d1b       --admin-primary-dark: #a88960          --admin-warning: #e0a855
--admin-surface-hover: #2a2927 --admin-text: #f4f0ea                  --admin-danger:  #e05555
--admin-border: rgba(255,255,255,.1)  --admin-text-muted: #a9a9a9    --admin-info:    #4a90d9
verde "live"/ready: #8fa87a
```

- Fuentes declaradas: `'Syne'` (logo, títulos) y `'DM Mono'` (códigos de pedido), pero **ninguna se carga**, así que en la práctica se ve la fuente de respaldo. En la v3 hay que decidir si se cargan (y así se ve "como fue diseñado") o si se usa la que se ve hoy. Se recomienda cargarlas.
- Layout: sidebar fijo de 280 px (`.admin-sidebar`) + `.admin-main` con `.topbar` sticky (título + píldora "● LIVE" que parpadea, aunque no hay Realtime) + `.content` con `padding: 28px`.
- Componentes CSS: `.stat-card` (radio 16, valor de 36 px en dorado), `.card`/`.card-header`/`.card-title`, `.order-card` con `.status-badge.{pending|preparing|ready|delivered|cancelled}`, `.products-grid` (`minmax(320px,1fr)`), `.product-card` (imagen de 180 px), `.modal-overlay` (negro .8 + blur 4) / `.modal-content` (radio 20, máx. 600 px), `.form-group`/`.form-row` (2 columnas), `.btn-save`/`.btn-add` (fondo dorado, texto `#1a1a1a`), `.btn-edit`, `.btn-delete`, `.badge-active`/`.badge-inactive`, `.empty-state`.
- Móvil (≤768 px): el sidebar se oculta con `translateX(-100%)` y espera una clase `.open`, pero **no hay un botón que la active**, así que en el móvil no se puede navegar entre secciones.
- Clases que se usan pero **no tienen CSS**: `.admin-login`, `.login-card`, `.login-field`, `.login-btn`, `.login-error`, `.admin-loading`, `.spinner`, `.modal-header`, `.modal-body`, `.modal-close`, `.section-header`, `.alert`, `.top-products`, `.recent-orders`, `.order-row`, `.filters`, etc. El login, en particular, se ve sin estilo.
- Mucho estilo va en línea (`style={{...}}`) en Stores, PromoCodes, Settings y el gestor de imágenes. En la v3 hay que pasarlo a tokens o clases.

### 5.2 Secciones (sidebar: Dashboard · Orders · Products · Categories · Stores · Promotions · Settings · Logout)

| Sección | Qué hace | Datos |
|---|---|---|
| **Dashboard** | 4 stat cards (Orders today, Sales today = suma de los `delivered`, Pending, Completed) + "Top products of the day" (top 5 por `order_items.quantity`) + "Recent orders" (5) | `orders`, `order_items` |
| **Orders** | Lista de todos los pedidos (código, cliente, teléfono, pickup/delivery, estado, ítems, nota, total) con acciones según el estado: pending → *Start preparing* / *Cancel*; preparing → *Mark ready* / *Cancel*; ready (pickup) → *Deliver*. El `<select>` de filtro **no está conectado**. El badge del sidebar cuenta los `pending`. | `orders` + `stores(name)` + `order_items(*)` |
| **Products** | Grilla de tarjetas (imagen, ⭐ Trending, nombre, precio, descripción de 80 caracteres, categoría, 🌱, Active/Inactive, Edit/Delete). Modal: categoría, nombre ES/EN, descripción ES/EN, precio, orden, ☐ Featured ☐ Vegetarian ☐ Active. **Gestor de imágenes** (solo después de guardar por primera vez): subir (≤5 MB, `image/*`) al bucket `product-images`, marcar como principal, borrar. | `products`, `categories`, `product_images`, Storage |
| **Categories** | Agrupadas por `group_name` en tarjetas; cada fila muestra ícono, nombre EN (ES), slug, estado y orden. Modal: nombre EN (genera el slug), ES, slug, grupo (Drinks/Food/Favorites), ícono (lista de 14 clases de FA), orden, descripción EN/ES, activa. No deja borrar una categoría que tiene productos. | `categories` |
| **Stores** | Tarjetas con dirección, teléfono y horario de 7 días. Modal: nombre, dirección, ciudad, estado, CP, teléfono, lat/lng, horario por día como **texto libre** ("7:00 AM - 9:00 PM") y activa. | `stores` |
| **Promotions** | Tarjetas por código (verde si está activo, gris si no), descuento, mínimo, usos/máximo con barra, vencimiento. Modal: código (se pasa a mayúsculas), descripción, tipo (`percentage`/`fixed`), valor, pedido mínimo, máximo de usos, fecha de vencimiento, activa. **El checkout no aplica los códigos.** | `promo_codes` |
| **Settings** | Pestañas: **General** (nombre, tagline, email, teléfono, WhatsApp + activar, dirección, ciudad, estado, CP, iframe de Google Maps, lat/lng, moneda + símbolo, idioma por defecto, activar delivery) · **Payments** (tasa + etiqueta del impuesto, efectivo/tarjeta/Apple Pay/Google Pay, Stripe public key) · **Delivery** (costo, envío gratis desde, radio en millas, URLs de Uber Eats/DoorDash/PedidosYa) · **Hours** (texto por día) · **Social** (Instagram, Facebook, X, TikTok, WhatsApp) · **SEO** (meta title/description, logo, favicon, OG image). Botón "Save Settings". **Casi nada de esto se lee en el sitio público**: el sitio usa valores fijos en el código. | `business_settings` (1 fila) |

**Lo que existe solo en código muerto** (`AdminDashboard.jsx` + `Dashboard.jsx` + `OrdersList.jsx` + `HistoryTable.jsx`, que leen `localStorage`):
- *Active orders* con filtros por estado (pestañas) y tiempo transcurrido ("About N min ago"), teléfono y dirección.
- *History*: tabla (Code, Customer, Type, Payment, Total, Status, Time) + **Export CSV** (`atalia-orders-YYYY-MM-DD.csv`, campos entre comillas y escapados).
- *Hourly sales — today*: gráfico de barras de 6 am a 10 pm.
- Transiciones de estado permitidas (`orderService.js`): `pending → preparing|cancelled`, `preparing → ready|cancelled`, `ready → delivered`.

Esto es lo que el plan llama "pedidos activos" e "historial con exportación a CSV". En la v3 se reconstruye sobre Supabase con el aspecto del admin vivo.

---

## 6. Datos: Supabase

### 6.1 Cliente

`src/lib/supabaseClient.js`: `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, { auth: { persistSession, autoRefreshToken } })`. Variables en `.env.local` (no se copian aquí). Todas las consultas, incluidas las del admin, se hacen desde el navegador con la **anon key**.

### 6.2 Tablas que usa el código (11 de las 14 de la v2)

Columnas deducidas de las consultas; hay que confirmarlas contra el esquema real antes de escribir las migraciones.

| Tabla | Columnas que se usan |
|---|---|
| `categories` | `id, slug, name_en, name_es, description_en, description_es, icon, group_name, sort_order, active, updated_at` |
| `products` | `id, category_id, name_en, name_es, description_en, description_es, price, featured, active, vegetarian, stock_enabled, in_stock, stock_quantity, sort_order, updated_at` |
| `product_images` | `id, product_id, image_url, is_primary, sort_order` |
| `product_sizes` | `id, product_id, name_en, name_es, price_modifier` (+ probablemente `sort_order`) |
| `product_extras` | `id, product_id, name_en, name_es, price` |
| `stores` | `id, name, address, city, state, zip_code, phone, lat, lng, mon_hours … sun_hours, active, updated_at` |
| `promo_codes` | `id, code, description, discount_type, discount_value, min_order, max_uses, used_count, active, expires_at, created_at, updated_at` |
| `business_settings` | ver la pestaña Settings (§5.2); además `tax_rate, tax_label, currency, currency_symbol, default_language, delivery_fee, free_delivery_min, …` |
| `orders` | `id, code, customer_name, customer_phone, order_type, status, note, total, store_id, created_at, updated_at` |
| `order_items` | `order_id, product_name_snapshot, quantity, line_total, created_at` |
| `admin_users` | `id, username, email, role, active` |

Storage: bucket público `product-images`, ruta `products/{productId}/{timestamp}.{ext}`, `upsert: true`.

Las 3 tablas restantes (`product_nutritional_info`, `pickup_locations` y `order_status_history`) existen en la BD, pero este código no las usa. El esquema real, las políticas RLS y lo que necesita la v3 están en [DATABASE.md](DATABASE.md).

### 6.3 Consultas del sitio público (`services/menuData.js`)

- `getCategoriesFromDB()`: `categories` activas, ordenadas por `sort_order`. Caché en memoria de 60 s.
- `getProductsByCategory(slug)`: busca la categoría por slug y luego `products` activos con `category, images, sizes, extras`.
- `getTrendingProducts()`: `products` activos con `featured`, máx. 8.
- `getPrimaryImage(product)`: la imagen con `is_primary`, o si no la primera.
- `formatPrice(price, 'RD$')`: `"RD$ 1,234"`. En la v3 se formatea con `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`.

### 6.4 Claves de `localStorage` / `sessionStorage`

`atalia_cart`, `atalia_store`, `atalia_language`, `atalia_orders` (pedidos de la maqueta) y `atalia_admin_session` (en sessionStorage, dura 2 h).

---

## 7. Lo que el plan supone y no existe en la referencia

Estas piezas hay que **construirlas** en la v3 (con el estilo de la referencia), no copiarlas:

1. **Búsqueda en el menú** (RF-M01): no existe.
2. **Información nutricional** en el modal (RF-M01): no hay columnas ni interfaz.
3. **Edición de tamaños y extras desde el admin** (RF-A02): el modal de producto no los incluye; hoy solo se cargan a mano en la BD.
4. **i18n EN/ES**: no hay `en.json`/`es.json` ni botón de idioma. Los textos están fijos en el código, la mayoría en inglés y con restos en español ("Tienda", "Resumen del pedido", "Síguenos", "Subir imagen", "Activa/Expirada", "unidades"). El idioma por defecto es `es`; el plan pide `en`. Los nombres de producto y categoría ya son bilingües en la BD (`*_en`/`*_es`), pero el menú muestra `name_es || name_en` sin importar el idioma.
5. **Pedidos activos + historial con CSV conectados a Supabase**: solo existen en código muerto sobre `localStorage` (§5.2).
6. **Pedidos reales desde la web**: el checkout no escribe en `orders`.
7. **Aplicación de los códigos promocionales** en el checkout.
8. **Uso de `business_settings` en el sitio** (horario, dirección, redes, impuesto, moneda, SEO): se editan en el admin, pero el sitio no los lee.
9. **Reseñas** en el inicio: solo en el componente muerto `Reviews.jsx`, con datos inventados y fotos que no existen. No se deben publicar reseñas inventadas.
10. **Nosotros, contacto, términos y privacidad**: no hay páginas.
11. **Toasts**: el componente existe, pero no se monta.
12. **Capturas de pantalla** (`docs/screenshots/`): pendientes (ver el final del documento).

---

## 8. Lo que NO se porta (problemas encontrados)

### 8.1 Seguridad (crítico)

- **Login del admin sin contraseña.** En `adminService.adminLogin`, si `signInWithPassword` falla, se busca el `username` en `admin_users` y se devuelve `success: true` **sin comprobar la contraseña**. Cualquiera que escriba `admin` (u otro usuario activo) con una contraseña cualquiera entra al panel.
- **El admin opera con la anon key** desde el navegador. Para que el CRUD funcione, las políticas RLS de la v2 tienen que permitir escrituras a `anon` en productos, categorías, tiendas, promociones, configuración y pedidos (o RLS está apagado). Si el proyecto v2 sigue en línea, **cualquiera con la anon key (que es pública) puede modificar o borrar el catálogo**. Hay que revisarlo en el proyecto Supabase aunque la v3 aún no exista.
- `AuthContext.jsx` (montado, aunque sin uso) trae fijos el usuario `admin` y el SHA-256 de su contraseña, en texto plano dentro del bundle. Hay que tratar esa contraseña como comprometida y no reutilizarla.
- La sesión del admin es un objeto en `sessionStorage` que cualquiera puede escribir a mano (`{"expiresAt": 9999999999999}`) para saltarse el login en la interfaz.
- `supabaseClient.js` imprime en la consola cada evento de auth con el email.

En la v3 todo esto se reemplaza por Supabase Auth + TOTP + RLS por rol (RNF-S03, S08).

### 8.2 Lógica

- **El precio del carrito ignora el tamaño y los extras**: `addItem` usa `product.price` como precio unitario, aunque el modal muestre el total con los modificadores. Además, el carrito guarda el objeto `size` completo, y la página lo muestra como texto (`Size: [object Object]`).
- El checkout le dice al cliente "Card payment has been recorded" sin haber cobrado nada.
- El código de pedido `ATL-` + 4 caracteres aleatorios puede repetirse.
- Impuesto **ITBIS 18 %** y envío de **RD$ 150** fijos en `CartContext`: son de República Dominicana. El negocio está en EE.UU., así que el impuesto, la moneda (USD) y el formato tienen que salir de la configuración.
- `getDashboardStats` calcula "hoy" con la zona horaria del navegador del admin.
- `updateProduct` convierte `price: 0` y `sort_order: 0` en `undefined` (no se pueden guardar ceros). `updateCategory` envía `sort_order: undefined`.
- `updateOrderStatus` no valida las transiciones (la versión de `localStorage` sí lo hacía).
- `getProducts` del admin no trae `images`, así que las tarjetas del admin muestran siempre el ícono de reemplazo.

### 8.3 Accesibilidad (para cumplir WCAG 2.1 AA en la v3)

- Las tarjetas del menú son `<div onClick>`: no se puede llegar a ellas con el teclado.
- Los botones de cerrar y de ± no tienen `aria-label`; los íconos de FA no tienen `aria-hidden`.
- Los modales no atrapan el foco, no cierran con Esc y no tienen `role="dialog"`.
- Los labels del checkout no están asociados a sus inputs (no tienen `htmlFor`/`id`).
- Las áreas táctiles son menores de 44 px: ± de 24–36 px, ✕ de 32 px y el botón "Add" de `py-1.5 text-xs`.
- Contraste por revisar: `text-gray-400` sobre blanco (labels, placeholders) y blanco sobre `primary #6B7F5A` (≈4.4:1, justo por debajo de 4.5:1 para texto pequeño). El botón principal (blanco sobre `#6B4A3A`) sí cumple (≈8:1).
- `<html lang="es">` fijo, aunque el contenido está en inglés.
- No hay soporte de `prefers-reduced-motion`.

---

## 9. Pendiente de esta tarea

- **Capturas en `docs/screenshots/`**: no se hicieron en esta sesión porque no había un navegador automatizado disponible. Para tomarlas: `npm run dev` en la referencia (puerto 3000) y capturar, en móvil (390 px) y en escritorio (1280 px), `/`, `/menu`, el modal de producto, el modal de tienda, `/cart` con productos, `/checkout`, y en `/admin` cada sección y cada modal. Se puede hacer con Playwright cuando se instale en la Fase 1.
- Confirmar el esquema real de Supabase de la v2 (las 14 tablas, las políticas RLS y los buckets) antes de escribir `db/migrations`.
