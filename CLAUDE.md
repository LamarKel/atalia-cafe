# Atalia Café v3 — reglas para Claude Code

Lee PLAN.md antes de cualquier tarea.

## Referencias (decisión de la clienta, 2026-10-18)
- **Diseño visual (cómo se ve) — manda esto:**
  1. Las 6 pantallas aprobadas en docs/design/.
  2. El estilo del menú de https://deliciasdominicanas.net/menu/ (inspiración de UX y layout; nunca copiar su marca, textos ni fotos). Capturas en docs/design/inspiracion/.
- **Funciones (qué hace cada pantalla):** las dos apps viejas, SOLO LECTURA, nunca modificarlas:
  1. D:\Dev\cafe, rama v2-supabase: la que está publicada en ataliacafe.netlify.app. Referencia principal.
  2. D:\Dev\atalia-cafe-react: apoyo. Resumen en docs/REFERENCE.md.
- El MENÚ conserva TODAS las funciones de la app vieja (categorías, búsqueda, modal con tamaños, extras e info nutricional, selector de tienda, carrito), pero con el diseño nuevo, no idéntico al viejo.
- El ADMIN conserva las secciones y funciones de la app vieja (D:\Dev\cafe/admin.html) y se amplía con lo de catering.
- Antes de crear una pantalla que ya existe en una app vieja, revisa qué hace allí para no perder ninguna función.
- Todo contenido visible (textos, precios, imágenes, horarios) debe venir de la BD y poder editarse desde el admin. Nada hardcodeado.

## Marca (no cambiar)
- Colores: primary #6B7F5A, secondary #6B4A3A, accent #F6F1EB, text #2E2E2E
- Fuentes: Playfair Display (títulos), Poppins (texto)
- Botones primarios: fondo #6B4A3A con texto blanco, radius completo
- Usa UI UX Pro Max solo para checklist de UX/accesibilidad, nunca para cambiar estilo, paleta o tipografía.

## Código
- TypeScript strict en todo. Sin `any`.
- Validación con Zod desde packages/shared, la misma en front y API.
- Lógica de negocio en modules/*/domain y application; sin imports de Supabase/Stripe ahí.
- Supabase, Stripe y Resend solo en adapters/.
- Precios y disponibilidad se calculan SIEMPRE en el servidor.
- Dinero: todo monto es un entero en centavos (tipo `Cents`, columnas `*_cents`); todo porcentaje, un entero en ppm (`*_ppm`). Nunca floats ni `numeric` para dinero. Dólares solo al mostrar (formatUSD) o al leer lo que escribe el admin (parseUSD). Cálculos solo con packages/shared/money (reglas A3 y A8–A12 de docs/REGLAS.md).
- Ninguna regla de negocio (montos, porcentajes, horas, límites, interruptores) va fija en el código: se declara en packages/shared/rules con defineRule() y se lee con getRule(). Una regla nueva = una entrada en el registro, sin migración.
- Reembolsos y cancelaciones se calculan con orders.rules_snapshot, nunca con las reglas vigentes.
- Nunca exponer service_role ni secrets al frontend.
- Toda escritura de pedidos pasa por el Worker.

## Base de datos
- Toda modificación es una migración nueva en db/migrations/ (nunca editar una ya aplicada). Diseño en docs/DATABASE.md.
- Sin DROP/DELETE/TRUNCATE en migraciones: el conector de Supabase las rechaza. Para retirar algo, archivarlo (`set schema v2_archive`) o neutralizarlo (`alter policy ... using (false)`).
- Aplicar con el conector de Supabase (execute_sql), cada migración en `begin; … commit;`, y registrarla en supabase_migrations.schema_migrations.
- Toda función nueva: `set search_path = ''` y, si es SECURITY DEFINER, `revoke execute ... from public, anon, authenticated` (Supabase da EXECUTE a anon por defecto).
- Toda tabla nueva: RLS activo y sus políticas en la misma migración.
- Antes de entregar una migración, correr las pruebas: `node db/tests/run-pglite.mjs <node_modules>` (y agregar pruebas nuevas en db/tests/v3_test.sql).

## Pagos
- checkout_token UUID por intento; UNIQUE en BD; Idempotency-Key en Stripe.
- SOLO pagos virtuales con Stripe (menú y catering): en línea y a cuotas, cada uno con su interruptor en business_rules (payments.*). NO hay efectivo; no agregar ese método.
- El pedido se marca pagado SOLO en el webhook, con firma verificada y stripe_events para idempotencia.

## UI
- Mobile-first, WCAG 2.1 AA, touch targets >= 44px, labels reales.
- Islas de React solo donde haya interactividad; el resto en .astro.
- Animaciones con Motion, solo transform/opacity, y respetar prefers-reduced-motion.
- i18n: EN por defecto, ES disponible. Ningún texto hardcodeado fuera de i18n.

## Flujo
- Una rama por tarea (feat/…, fix/…), commits pequeños, PR con descripción.
- Tests para toda lógica de dominio. No marcar una tarea como hecha con tests fallando.
