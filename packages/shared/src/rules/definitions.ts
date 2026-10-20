// Reglas de negocio del sitio (docs/REGLAS.md, sección B). Agregar una regla = agregar una entrada aquí.
// Los valores por defecto marcados "provisional" esperan la respuesta de la clienta (PLAN.md §13).
import { z } from 'zod'
import { MAX_CENTS, PPM_SCALE } from '../money/index'
import { defineRule } from './define'

const ppmValue = z.number().int().min(0).max(PPM_SCALE)
const centsValue = z.number().int().min(0).max(MAX_CENTS)
const localizedText = z.object({ en: z.string().min(1).max(120), es: z.string().min(1).max(120) })
const productType = z.enum(['menu', 'tray', 'table', 'picadera_pack'])

/** Tramos de reembolso: de más horas a menos, y el porcentaje nunca sube al acercarse la recogida (B6). */
const refundTiers = z
  .array(z.object({ hoursBefore: z.number().int().min(0).max(720), refundPpm: ppmValue }))
  .min(1)
  .max(6)
  .refine(
    (tiers) =>
      tiers.every((t, i) => {
        const prev = tiers[i - 1]
        return prev === undefined || (t.hoursBefore < prev.hoursBefore && t.refundPpm <= prev.refundPpm)
      }),
    { message: 'Los tramos van de más horas a menos y el reembolso nunca aumenta al acercarse la recogida' },
  )

export const RULES = {
  // ── Pagos (owner) ───────────────────────────────────────────
  'payments.online_enabled': defineRule({
    key: 'payments.online_enabled',
    group: 'payments',
    label: { en: 'Online payments', es: 'Pagos en línea' },
    help: {
      en: 'Card, Apple Pay and Google Pay with Stripe.',
      es: 'Tarjeta, Apple Pay y Google Pay con Stripe.',
    },
    schema: z.boolean(),
    default: true,
    unit: 'boolean',
    editableBy: 'owner',
    storeScoped: false,
    public: true,
  }),
  'payments.bnpl_enabled': defineRule({
    key: 'payments.bnpl_enabled',
    group: 'payments',
    label: { en: 'Pay in installments', es: 'Pago a cuotas' },
    help: {
      en: 'Klarna, Afterpay and Affirm. Turn on only after Stripe approves the account.',
      es: 'Klarna, Afterpay y Affirm. Actívalo solo cuando Stripe apruebe la cuenta.',
    },
    schema: z.boolean(),
    default: false,
    unit: 'boolean',
    editableBy: 'owner',
    storeScoped: false,
    public: true,
  }),

  // ── Impuestos (owner) ───────────────────────────────────────
  'tax.rate_ppm': defineRule({
    key: 'tax.rate_ppm',
    group: 'tax',
    label: { en: 'Sales tax rate', es: 'Tasa de impuesto' },
    help: {
      en: 'Applied once to the subtotal after discounts. NJ: 6.625%. Confirm with your accountant.',
      es: 'Se aplica una vez al subtotal después de descuentos. NJ: 6.625 %. Confírmalo con tu contador.',
    },
    schema: ppmValue.max(200_000),
    default: 66_250,
    unit: 'percent',
    editableBy: 'owner',
    storeScoped: true,
    public: true,
  }),
  'tax.label': defineRule({
    key: 'tax.label',
    group: 'tax',
    label: { en: 'Tax name', es: 'Nombre del impuesto' },
    help: { en: 'Shown on the order summary.', es: 'Se muestra en el resumen del pedido.' },
    schema: localizedText,
    default: { en: 'NJ Sales Tax', es: 'Impuesto de NJ' },
    unit: 'localized_text',
    editableBy: 'owner',
    storeScoped: true,
    public: true,
  }),

  // ── Propina (owner, B9) ─────────────────────────────────────
  'tips.enabled': defineRule({
    key: 'tips.enabled',
    group: 'tips',
    label: { en: 'Offer tips at checkout', es: 'Ofrecer propina en el checkout' },
    help: {
      en: 'Always optional and never taxed. Never added automatically.',
      es: 'Siempre opcional y sin impuesto. Nunca se agrega sola.',
    },
    schema: z.boolean(),
    default: true,
    unit: 'boolean',
    editableBy: 'owner',
    storeScoped: false,
    public: true,
  }),
  'tips.presets_ppm': defineRule({
    key: 'tips.presets_ppm',
    group: 'tips',
    label: { en: 'Suggested tips', es: 'Propinas sugeridas' },
    help: { en: 'Up to 4 percentages.', es: 'Hasta 4 porcentajes.' },
    schema: z.array(ppmValue.max(500_000)).max(4),
    default: [100_000, 150_000, 200_000],
    unit: 'percent_list',
    editableBy: 'owner',
    storeScoped: false,
    public: true,
  }),
  'tips.allow_custom': defineRule({
    key: 'tips.allow_custom',
    group: 'tips',
    label: { en: 'Allow a custom tip', es: 'Permitir propina libre' },
    help: { en: 'The customer can type any amount.', es: 'El cliente puede escribir cualquier monto.' },
    schema: z.boolean(),
    default: true,
    unit: 'boolean',
    editableBy: 'owner',
    storeScoped: false,
    public: true,
  }),

  // ── Anticipo (owner, B7 · fase 2) ───────────────────────────
  'deposit.enabled': defineRule({
    key: 'deposit.enabled',
    group: 'deposit',
    label: { en: 'Deposit for large orders', es: 'Anticipo en pedidos grandes' },
    help: { en: 'Phase 2. Off means full payment.', es: 'Fase 2. Apagado = pago completo.' },
    schema: z.boolean(),
    default: false,
    unit: 'boolean',
    editableBy: 'owner',
    storeScoped: false,
    public: true,
  }),
  'deposit.percent_ppm': defineRule({
    key: 'deposit.percent_ppm',
    group: 'deposit',
    label: { en: 'Deposit percentage', es: 'Porcentaje del anticipo' },
    help: { en: 'Charged when booking.', es: 'Se cobra al reservar.' },
    schema: ppmValue.min(100_000).max(900_000),
    default: 500_000,
    unit: 'percent',
    editableBy: 'owner',
    storeScoped: false,
    public: true,
  }),
  'deposit.min_order_cents': defineRule({
    key: 'deposit.min_order_cents',
    group: 'deposit',
    label: { en: 'Deposit from order total', es: 'Anticipo a partir de' },
    help: { en: 'Orders below this pay in full.', es: 'Los pedidos por debajo se pagan completos.' },
    schema: centsValue,
    default: 50_000,
    unit: 'usd',
    editableBy: 'owner',
    storeScoped: false,
    public: true,
  }),
  'deposit.applies_to': defineRule({
    key: 'deposit.applies_to',
    group: 'deposit',
    label: { en: 'Deposit applies to', es: 'El anticipo aplica a' },
    help: { en: 'Product types.', es: 'Tipos de producto.' },
    schema: z.array(productType).min(1),
    default: ['table'],
    unit: 'product_types',
    editableBy: 'owner',
    storeScoped: false,
    public: true,
  }),

  // ── Reembolsos (owner, B6) ──────────────────────────────────
  'refunds.catering_tiers': defineRule({
    key: 'refunds.catering_tiers',
    group: 'refunds',
    label: { en: 'Catering cancellation refunds', es: 'Reembolso al cancelar catering' },
    help: {
      en: 'Hours before pickup → refund. Applies to the rules saved with each order.',
      es: 'Horas antes de la recogida → reembolso. Aplica con las reglas guardadas en cada pedido.',
    },
    schema: refundTiers,
    default: [
      { hoursBefore: 48, refundPpm: 1_000_000 },
      { hoursBefore: 24, refundPpm: 500_000 },
      { hoursBefore: 0, refundPpm: 0 },
    ], // provisional
    unit: 'refund_tiers',
    editableBy: 'owner',
    storeScoped: false,
    public: true,
  }),
  'refunds.menu_until_status': defineRule({
    key: 'refunds.menu_until_status',
    group: 'refunds',
    label: { en: 'Menu orders: full refund until', es: 'Menú: reembolso total hasta' },
    help: {
      en: 'Order status after which menu orders are not refunded.',
      es: 'Estado a partir del cual no se reembolsa.',
    },
    schema: z.enum(['confirmed', 'preparing']),
    default: 'confirmed',
    unit: 'order_status',
    editableBy: 'owner',
    storeScoped: false,
    public: true,
  }),

  // ── Promociones (owner, B14) ────────────────────────────────
  'promos.allow_stacking': defineRule({
    key: 'promos.allow_stacking',
    group: 'promos',
    label: { en: 'Combine promo codes', es: 'Combinar cupones' },
    help: { en: 'Off: one code per order.', es: 'Apagado: un cupón por pedido.' },
    schema: z.boolean(),
    default: false,
    unit: 'boolean',
    editableBy: 'owner',
    storeScoped: false,
    public: false,
  }),

  // ── Tiempos (admin, B1–B3) ──────────────────────────────────
  'time.slot_minutes': defineRule({
    key: 'time.slot_minutes',
    group: 'time',
    label: { en: 'Pickup slot length', es: 'Duración de cada franja' },
    help: {
      en: 'Pickup times are offered in steps of this size.',
      es: 'Las horas de recogida se ofrecen en estos intervalos.',
    },
    schema: z.number().int().min(15).max(240).multipleOf(15),
    default: 60,
    unit: 'minutes',
    editableBy: 'admin',
    storeScoped: true,
    public: true,
  }),
  'time.max_days_ahead': defineRule({
    key: 'time.max_days_ahead',
    group: 'time',
    label: { en: 'Book up to', es: 'Reservar con hasta' },
    help: { en: 'Days in advance.', es: 'Días de anticipación.' },
    schema: z.number().int().min(1).max(365),
    default: 60, // provisional
    unit: 'days',
    editableBy: 'admin',
    storeScoped: true,
    public: true,
  }),
  'time.cutoff_local': defineRule({
    key: 'time.cutoff_local',
    group: 'time',
    label: { en: 'Daily order cutoff', es: 'Hora de corte diaria' },
    help: {
      en: 'Orders after this time count from the next opening.',
      es: 'Lo pedido después de esta hora cuenta desde la siguiente apertura.',
    },
    schema: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    default: '18:00', // provisional
    unit: 'time_of_day',
    editableBy: 'admin',
    storeScoped: true,
    public: true,
  }),

  // ── Pedidos (admin, B5, B12) ────────────────────────────────
  'orders.allow_mixed_cart': defineRule({
    key: 'orders.allow_mixed_cart',
    group: 'orders',
    label: { en: 'Mix menu and catering', es: 'Mezclar menú y catering' },
    help: {
      en: 'One pickup time that respects the longest notice in the cart.',
      es: 'Una sola hora de recogida que respeta la anticipación más larga del carrito.',
    },
    schema: z.boolean(),
    default: true, // provisional
    unit: 'boolean',
    editableBy: 'admin',
    storeScoped: false,
    public: true,
  }),
  'orders.max_qty_per_product': defineRule({
    key: 'orders.max_qty_per_product',
    group: 'orders',
    label: { en: 'Max quantity per product', es: 'Cantidad máxima por producto' },
    help: { en: 'Per order.', es: 'Por pedido.' },
    schema: z.number().int().min(1).max(100),
    default: 10, // provisional
    unit: 'count',
    editableBy: 'admin',
    storeScoped: false,
    public: true,
  }),
  'orders.quote_threshold_guests': defineRule({
    key: 'orders.quote_threshold_guests',
    group: 'orders',
    label: { en: 'Request a quote above', es: 'Pedir cotización a partir de' },
    help: {
      en: 'Above this number of guests, offer a quote instead of online checkout.',
      es: 'Por encima de este número de invitados, se ofrece cotización en lugar de pagar en línea.',
    },
    schema: z.number().int().min(10).max(500),
    default: 50, // provisional
    unit: 'guests',
    editableBy: 'admin',
    storeScoped: false,
    public: true,
  }),

  // ── Avisos (admin, B13) ─────────────────────────────────────
  'notifications.reminder_hours_before': defineRule({
    key: 'notifications.reminder_hours_before',
    group: 'notifications',
    label: { en: 'Reminder before pickup', es: 'Recordatorio antes de recoger' },
    help: { en: '0 turns it off.', es: '0 lo desactiva.' },
    schema: z.number().int().min(0).max(72),
    default: 24,
    unit: 'hours',
    editableBy: 'admin',
    storeScoped: false,
    public: false,
  }),
  'notifications.order_recipients': defineRule({
    key: 'notifications.order_recipients',
    group: 'notifications',
    label: { en: 'New order emails go to', es: 'Avisos de pedidos nuevos a' },
    help: { en: 'Up to 5 emails.', es: 'Hasta 5 correos.' },
    schema: z.array(z.email()).max(5),
    default: [],
    unit: 'email_list',
    editableBy: 'admin',
    storeScoped: false,
    public: false,
  }),

  'notifications.staff_locale': defineRule({
    key: 'notifications.staff_locale',
    group: 'notifications',
    label: { en: 'Language of team emails', es: 'Idioma de los correos al equipo' },
    help: {
      en: 'New orders and quote requests sent to the business.',
      es: 'Pedidos nuevos y cotizaciones que recibe el negocio.',
    },
    schema: z.enum(['en', 'es']),
    default: 'es',
    unit: 'locale',
    editableBy: 'admin',
    storeScoped: false,
    public: false,
  }),

  // ── Legal (admin, B17) ──────────────────────────────────────
  'legal.data_retention_months': defineRule({
    key: 'legal.data_retention_months',
    group: 'legal',
    label: { en: 'Keep customer data for', es: 'Guardar datos de clientes' },
    help: {
      en: 'Months. After that, personal data is anonymized.',
      es: 'Meses. Después, los datos personales se anonimizan.',
    },
    schema: z.number().int().min(6).max(120),
    default: 24, // provisional
    unit: 'months',
    editableBy: 'admin',
    storeScoped: false,
    public: false,
  }),
} as const

export type Rules = typeof RULES
export type RuleKey = keyof Rules
export type RuleValue<K extends RuleKey> = z.output<Rules[K]['schema']>
