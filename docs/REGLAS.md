# Reglas de negocio: recomendaciones

> Reglas que faltaban en el plan, con lo que hacen otros sistemas de pedidos y catering, y la recomendación para Atalia Café.
> Investigación del 2026-10-16. Los valores marcados con ❓ dependen de la clienta: sus preguntas están en `PLAN.md` §13.
> Toda regla configurable se edita desde el admin y la valida el Worker (nunca solo el frontend).

---

## Cómo se configuran las reglas

**Toda regla de negocio (sección B) se edita en el admin**, en la sección **Reglas**. Nada queda fijo en el código. Así la clienta la cambia cuando decide otra cosa o cuando cambia la ley, y si te lo pide a ti, es un cambio de configuración, no de código.

### Registro único de reglas (`packages/shared/rules`)

Cada regla se declara **una sola vez**, en un registro tipado con Zod:

```ts
defineRule({
  key: 'orders.quote_threshold_guests',
  group: 'orders',                   // pestaña del admin
  label: { en: 'Quote above (guests)', es: 'Cotizar a partir de (invitados)' },
  help:  { en: '…', es: 'Por encima de este número, se pide cotización en lugar de pagar en línea.' },
  schema: z.number().int().min(10).max(500), // límites que la clienta no puede romper
  default: 50,
  unit: 'guests',
  editableBy: 'owner',
})
```

A partir de esa declaración sale todo lo demás:
- **El formulario del admin se arma solo**: campo, etiqueta EN/ES, ayuda, unidad, límites y validación. Agregar una regla nueva = agregar una entrada al registro. No hace falta migración de BD ni pantalla nueva.
- **El Worker la lee** con `getRule('orders.quote_threshold_guests')`, tipada, con el valor por defecto si nadie la cambió.
- **El frontend** recibe solo las reglas públicas que necesita (por ejemplo, las propinas sugeridas), por `/catalog`.

### Protecciones

- **Límites en cada regla**: el `schema` impide valores que rompan el sistema, por ejemplo un impuesto del 300 % o una retención de cupo menor que la sesión de Stripe.
- **Validaciones cruzadas**: por ejemplo, los tramos de cancelación tienen que ir de mayor a menor porcentaje a medida que se acerca la hora de recogida.
- **Quién edita**: las reglas de dinero (impuesto, reembolsos, anticipo, pagos) solo las cambia el rol `owner`, con 2FA. Las operativas (horario, capacidad, días cerrados) también las puede cambiar el `admin`.
- **Historial**: cada cambio queda en `audit_log` (quién, cuándo, valor anterior y nuevo), y hay un botón **"Restaurar valor por defecto"**.
- **Sin efecto retroactivo**: un cambio aplica solo a los pedidos nuevos. Cada pedido guarda una copia de las reglas con las que se vendió (`orders.rules_snapshot`), así que si mañana cambia la política de cancelación, un pedido de ayer se reembolsa con la política que el cliente aceptó al pagar.
- **Vigencia programada** (opcional por regla): una regla puede tener una fecha desde la que aplica (`effective_from`). Sirve, por ejemplo, para un cambio de impuesto que entra en vigor el 1 de enero.

### Qué se configura y dónde

| Pestaña del admin | Reglas |
|---|---|
| **Pagos** | En línea / cuotas (activado o no); propina (activada, porcentajes sugeridos, monto libre); anticipo (activado, %, a partir de qué monto, a qué tipos, cuándo se paga el saldo) |
| **Impuestos** | Tasa y nombre por tienda, con fecha de vigencia |
| **Tiempos** | Hora de corte, días máximos de anticipación, duración de la franja, carrito mixto permitido. La **anticipación mínima** se edita en cada producto |
| **Capacidad** | Máximos por franja y por día, por tipo y día de la semana; días cerrados |
| **Cancelaciones** | Tramos por tipo de producto (horas antes → % de reembolso); si el cliente puede pedir cambios |
| **Pedidos** | Cantidad máxima por producto; a partir de cuántas personas se pide cotización |
| **Promociones** | Si se combinan, si aplican al catering, usos por cliente |
| **Avisos** | Canales y destinatarios, horas antes del recordatorio |
| **Legal y textos** | Aviso de alérgenos, políticas (EN/ES, en `site_content`); meses de retención de datos |
| **Equipo** | Usuarios y roles; qué puede hacer cada rol |

Las reglas técnicas de la sección A **no** se configuran: son garantías del sistema (seguridad, idempotencia y dinero) y cambiarlas sí requiere código.

---

## A. Reglas técnicas (no dependen de la clienta)

Estas ya se pueden programar tal cual.

| # | Regla | Por qué |
|---|---|---|
| A1 | **Retención del cupo de 35 min**, y la sesión de Stripe vence a los 30 min | Stripe exige que la sesión dure entre 30 min y 24 h [1]. Con la retención de 15 min del plan original, un cliente que paga en el minuto 20 ya perdió su cupo, y eso es una sobreventa. Si de todos modos llega un pago sin cupo, se **reembolsa automáticamente** y se avisa al cliente y al negocio. Es el mismo patrón que recomienda Stripe para inventario limitado [2] |
| A2 | **Código de pedido aleatorio, y el código no da acceso** | El código es **aleatorio**, no secuencial: `AT-` + 6 caracteres sin ambiguos (por ejemplo `AT-7K3QX9`), generado con un generador criptográfico. Así no revela el volumen de ventas ni deja adivinar otros pedidos. Aun así, la página de confirmación y seguimiento se abre con un token secreto (en el enlace del email y en la redirección de Stripe), nunca solo con el código |
| A3 | **Montos en centavos enteros (decidido)** | En la BD y en el código TypeScript, todo monto es un entero en centavos ($12.50 = `1250`) con el tipo `Cents`, y todo porcentaje es un entero en partes por millón (6.625 % = `66250`). Los dólares existen solo al mostrar (`formatUSD`) y al leer lo que escribe la clienta (`parseUSD("12.50")` → `1250`, sin pasar por decimales). Igual que Stripe, así que no hay conversión al cobrar. **Orden fijo del cálculo**, en una sola función de `packages/shared/money`: 1) subtotal = Σ (precio × cantidad); 2) − descuento; 3) impuesto = redondeo(base × tasa_ppm / 1 000 000), una sola vez sobre el pedido; 4) + propina (sin impuesto); 5) = total. Redondeo: al entero más cercano, medio centavo hacia arriba |
| A8 | **El navegador nunca decide un monto** | El Worker ignora cualquier precio, descuento o total que llegue del cliente y recalcula todo desde la BD (RNF-S05). Del navegador solo se aceptan IDs, cantidades, opciones, código promocional y propina |
| A9 | **Sin valores negativos ni absurdos** | Zod: cantidades enteras ≥ 1 y ≤ el máximo por producto (B12); propina ≥ 0 y con tope. La BD repite los mismos límites con `CHECK` |
| A10 | **El descuento nunca supera el pedido** | El descuento se limita al subtotal, los cupones no se combinan (B14) y el total no puede bajar del mínimo de Stripe ($0.50). Un `CHECK` en la BD impide que `discount_cents` supere `subtotal_cents` |
| A11 | **Los reembolsos nunca superan lo pagado** | `CHECK (refunded_cents <= total_cents)`. Cada reembolso se hace en una transacción con bloqueo de la fila y con una clave de idempotencia en Stripe, así que un doble clic no reembolsa dos veces |
| A12 | **Lo cobrado coincide con el pedido** | El webhook compara el `amount_total` de Stripe con el `total_cents` del pedido. Si no coinciden, el pedido queda en revisión, no se prepara y se avisa a la dueña. Tests que comprueban que el front y el Worker calculan el mismo total para los mismos casos |
| A4 | **Si el negocio no puede cumplir, se reembolsa todo** | ezCater suspende dos semanas del marketplace a los caterers que rechazan o cancelan demasiado [3]. Aquí la regla es que el admin no "rechaza": cancela con un motivo, y el reembolso total es automático. La capacidad (RF11) existe justamente para que esto casi no pase |
| A5 | **Precio que cambia con el carrito abierto** | El servidor recalcula siempre (RNF-S05). Si el total cambia o un producto ya no está disponible, el checkout lo muestra y pide confirmar antes de crear la sesión de Stripe |
| A6 | **Contracargos** | El webhook escucha `charge.dispute.created`: marca el pedido, avisa a la dueña y deja a mano la evidencia (email de confirmación, hora de recogida y quién lo entregó) |
| A7 | **Pago a cuotas según el monto** | Stripe solo muestra cada proveedor dentro de sus límites: Affirm desde 50 USD, Klarna desde 10 USD y Afterpay desde 1 USD, con máximos que cambian según la cuenta [4]. Un café de $6 nunca verá cuotas. La insignia "Paga en cuotas" se muestra solo cuando el total alcanza el mínimo más bajo de los proveedores activos |

---

## B. Reglas de negocio (con valor propuesto)

| # | Regla | Qué hacen otros | Recomendación para Atalia |
|---|---|---|---|
| B1 | **Anticipación mínima** | ezCater pide fijar al menos 24 h, porque la mayoría de los clientes pide con más de 24 h [3]. Toast la define para todo el catering (hoy en días enteros) [5]. Square la permite por producto [6] | **Por producto**, en horas: menú 0 h (solo tiempo de preparación), picaderas 1 h, bandejas 24 h ❓, mesas 48 h ❓. Si el resultado cae fuera del horario, pasa a la siguiente apertura |
| B2 | **Hora de corte** | Toast separa el corte de la anticipación [7] | Corte diario configurable: lo pedido después de las 6 pm ❓ cuenta desde la apertura del día siguiente. Evita que un pedido de las 11 pm "cumpla" 24 h para las 11 pm del otro día, si la cocina prepara de mañana |
| B3 | **Anticipación máxima** | Square permite entre 7 y 365 días [6] | 60 días ❓ (`max_days_ahead`) |
| B4 | **Capacidad por franja** | Los sistemas de recogida limitan los pedidos por franja para no saturar la cocina [8] | Ya está en el plan (RF11). Se mide en **paquetes**, no en piezas sueltas ❓ |
| B5 | **Carrito mixto (menú + catering)** | — | **Se permite**, pero con una sola hora de recogida que respeta la anticipación más larga del carrito ❓. Cada parte ocupa la capacidad de su categoría |
| B6 | **Cancelación y reembolso** | En recogidas pequeñas es común un corte de 24 a 48 h con una penalidad del 25 al 50 % [9]. En eventos, los cortes son de 7 a 60 días [10] | Menú: se cancela con reembolso total mientras no esté en preparación. Bandejas y picaderas: 100 % con 48 h o más, 50 % entre 24 y 48 h, 0 % con menos de 24 h ❓. Mesas: ver B7 ❓. El reembolso se calcula solo según la hora de cancelación, y el admin puede mejorarlo |
| B7 | **Anticipo en mesas y eventos grandes** | Lo habitual es un anticipo del 25 al 50 % no reembolsable al reservar [10] | Fase 1: pago completo. Fase 2, opcional: anticipo del 50 % ❓ para las mesas o los pedidos de más de $500, y el saldo por enlace de pago 48 h antes. Que el anticipo sea "no reembolsable" depende de la ley del estado [10] |
| B8 | **Modificaciones después de pagar** | — | El cliente no edita el pedido en línea. Lo pide por WhatsApp, y el admin cancela y rehace dentro del plazo de B6 ❓ |
| B9 | **Propina** | En **Nueva Jersey**, la propina voluntaria no paga impuesto; un cargo de servicio obligatorio (como el 18–22 % automático en catering) es parte del precio y sí paga impuesto [16]. California y Nueva York tienen la misma distinción [11][12] | Propina **opcional** en el checkout (0, 10, 15, 20 % o un monto libre) ❓, nunca agregada automáticamente, y sin impuesto. No se usa ningún "cargo de servicio" obligatorio, para evitar el problema fiscal |
| B10 | **Impuesto** | En NJ, el catering y la comida preparada pagan el impuesto de venta completo (6.625 %) [17]. Algunas ciudades de NJ son Zonas de Empresa Urbana (UEZ) con tasa reducida, pero la comida preparada suele quedar fuera de esa reducción, y no se pudo confirmar que Passaic sea UEZ [18] | **6.625 %** como valor por defecto en Passaic, NJ, editable por tienda. Que lo confirme su contador ❓. Más adelante se puede evaluar Stripe Tax |
| B11 | **Solo pago por adelantado** | El prepago es la mejor protección contra los no-shows [13]. GloriaFood permite exigir el prepago en los pedidos anticipados [14] | **Decidido**: solo pagos virtuales con Stripe, sin efectivo (RF13). Si un pedido pagado no se recoge, el admin lo marca `no_show` y aplica la política de cancelación (B6). El recordatorio (B13) reduce los olvidos [15] |
| B12 | **Límites y cotización** | — | Cantidad máxima por producto: 10 ❓. Por encima de 50 personas ❓, el sitio ofrece "Pide una cotización" (fase 2) en lugar del checkout |
| B13 | **Avisos** | Los recordatorios por SMS o email reducen los no-shows [15] | Al cliente: confirmación, recordatorio el día anterior y "listo para recoger". Al negocio: aviso de cada pedido nuevo (email + sonido en el admin) ❓ por qué canal |
| B14 | **Códigos promocionales** | — | No se combinan entre sí; un uso por cliente si se marca así; ¿aplican al catering? ❓. El contador sube **solo cuando se paga**, de forma atómica, para que un código de 100 usos no se use 101 veces |
| B15 | **Alérgenos** | — | Aviso de alérgenos con una casilla obligatoria antes de pagar, más un campo "alergias" en las notas. Texto e ingredientes ❓ |
| B16 | **Roles del admin** | — | `owner`: todo. `admin`: catálogo, contenido y pedidos. `staff`: cambia estados y marca entregas; no reembolsa ni cambia precios ❓ quién tiene cada rol |
| B17 | **Datos personales** | — | Se guarda lo mínimo (nombre, teléfono, email). Los datos de clientes se anonimizan a los 24 meses, salvo lo que exija la contabilidad ❓ con su contador. Se borran si el cliente lo pide |

---

## Fuentes

1. [Stripe: Checkout Session `expires_at`](https://docs.stripe.com/api/checkout/sessions/expire?lang=node)
2. [Stripe: Manage limited inventory with Checkout](https://stripe.com/docs/payments/checkout/managing-limited-inventory)
3. [ezCater: Reduce rejections and cancellations](https://catering.ezcater.com/en/help/reduce-rejections-and-cancellations)
4. [Stripe: Buy now, pay later](https://docs.stripe.com/payments/buy-now-pay-later) y [Stripe: Klarna](https://edge-docs.stripe.com/payments/klarna)
5. [Toast: Catering Online Ordering Minimum Lead Time](https://support.toasttab.com/en/article/Catering-Online-Ordering-Minimum-Lead-Time)
6. [Square: scheduled pickup y tiempos de preparación](https://squareup.com/help/au/en/article/6866)
7. [Toast: Manage your takeout and delivery schedule](https://support.toasttab.com/en/article/Managing-Your-Takeout-and-Delivery-Schedule)
8. [Deonde: Self pickup ordering system](https://deonde.co/self-pickup-ordering-system.shtml)
9. [HomeGrown: Last-minute order cancellations for food vendors](https://findhomegrown.com/blog/last-minute-order-cancellations-food-vendor)
10. [SchedulingKit: Catering payments](https://schedulingkit.com/payments/catering), [Invoice Quickly: How to invoice as a caterer](https://invoicequickly.com/blog/how-to-invoice-caterer), [PandaDoc: Catering quote template](https://www.pandadoc.com/catering-quote-template)
11. [Klasing Associates: California, tips, fees and service charges](https://klasing-associates.com/california-restaurants-cdtfa-exposure-misclassifying-tips-fees-service-charges/)
12. [NY Department of Taxation: Gratuities](https://www.tax.ny.gov/pubs_and_bulls/tg_bulletins/st/gratuities.htm)
13. [TableCheck: Restaurant no-shows](https://www.tablecheck.com//en/blog/restaurant-no-shows-how-to-prevent/)
14. [GloriaFood: Restaurant reservations system](https://www.gloriafood.com/restaurant-ideas/restaurant-reservations-system)
15. [Square: Ways to reduce restaurant no-shows](https://squareup.com/gb/en/the-bottom-line/reaching-customers/reduce-restaurant-no-shows)

16. [Wiss: NJ sales tax, hospitality guide](https://wiss.com/nj-sales-tax-world-cup-2026-hospitality/)
17. [NJ Division of Taxation: publicación S&U-1 para restaurantes](https://nj.gov/treasury/taxation/pdf/pubs/sales/su1.pdf)
18. [Stripe: New Jersey sales tax rate](https://stripe.com/en-at/resources/more/new-jersey-sales-tax-rate) y [Hands Off Sales Tax: NJ sales tax on food](https://handsoffsalestax.com/nj-sales-tax-on-food/)

Las fuentes 8 a 10 y 13 a 15 son blogs de proveedores o plantillas: sirven como referencia de la práctica común, no como norma. Las reglas de impuestos y de anticipos no reembolsables hay que confirmarlas con un contador del estado donde opera el negocio.
