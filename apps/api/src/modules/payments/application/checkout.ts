// Casos de uso del checkout: horas disponibles, iniciar el pago y procesar los eventos de Stripe.
// Solo dependen de los puertos; las reglas se leen del registro (getRule), nunca fijas en el código.
import type {
  AvailabilityResponse,
  CartLine,
  CartQuote,
  CheckoutRequestParsed,
  CheckoutResponse,
  OrderSummary,
} from '@atalia/shared/checkout'
import { ppm, type Discount } from '@atalia/shared/money'
import { checkPromo, type PromoRejection } from '@atalia/shared/promos'
import { getRule, snapshotRules } from '@atalia/shared/rules'
import {
  PricingError,
  cartNeeds,
  hasCatering,
  lineDetail,
  lineTotal,
  priceCart,
  type CatalogPiece,
  type CatalogProduct,
  type Locale,
  type PricedCart,
  type PricingRules,
} from '../../orders/domain/pricing'
import type {
  AvailabilityRepo,
  CatalogRepo,
  Mailer,
  OrdersRepo,
  PaymentGateway,
  PromoRepo,
  StoreRepo,
} from '../ports'

export type CheckoutErrorCode =
  | 'payments_disabled'
  | 'slot_unavailable'
  | 'checkout_closed'
  | 'range_too_long'
  | 'pickup_unavailable'
  | 'promo_rejected'

export class CheckoutError extends Error {
  override readonly name = 'CheckoutError'
  constructor(
    readonly code: CheckoutErrorCode,
    /** Con promo_rejected: por qué no se aplicó el cupón. */
    readonly reason?: PromoRejection,
  ) {
    super(code)
  }
}

export interface CheckoutDeps {
  stores: StoreRepo
  catalog: CatalogRepo
  availability: AvailabilityRepo
  orders: OrdersRepo
  promos: PromoRepo
  payments: PaymentGateway
  mailer: Mailer
  /** URL pública del sitio, para volver de Stripe. */
  siteUrl: string
  now?: () => Date
}

/** Stripe exige que una sesión dure al menos 30 minutos; la retención del cupo dura 35 (reserve_slot). */
const SESSION_MINUTES = 30
const MAX_RANGE_DAYS = 62
/** Stripe no cobra menos de 50 centavos en USD: un cupón no puede dejar el total por debajo. */
const STRIPE_MIN_CHARGE_CENTS = 50

const productIds = (items: readonly CartLine[]) => [...new Set(items.map((i) => i.productId))]
const pieceIds = (items: readonly CartLine[]) => [
  ...new Set(items.flatMap((i) => i.components.map((c) => c.optionId))),
]

type PromoResult =
  | { cart: PricedCart; promoId: string | null; rejected: null }
  | { cart: PricedCart; promoId: null; rejected: PromoRejection }

/**
 * Precio del carrito con el cupón (si hay). Primero sin descuento, para saber el subtotal y si hay catering;
 * después con el descuento. email = null en el resumen previo al pago (aún no se sabe quién es).
 */
async function priceWithPromo(
  deps: CheckoutDeps,
  args: {
    items: readonly CartLine[]
    catalog: ReadonlyMap<string, CatalogProduct>
    pieces: ReadonlyMap<string, CatalogPiece>
    rules: PricingRules
    locale: Locale
    promoCode: string
    email: string | null
    now: Date
  },
): Promise<PromoResult> {
  const base = priceCart(args.items, args.catalog, args.pieces, args.rules, args.locale)
  if (args.promoCode === '') return { cart: base, promoId: null, rejected: null }

  const promo = await deps.promos.byCode(args.promoCode)
  const uses =
    promo !== null && promo.maxUsesPerCustomer !== null && args.email !== null
      ? await deps.promos.usesByEmail(promo.id, args.email)
      : null
  const check = checkPromo(promo, {
    subtotalCents: base.totals.subtotalCents,
    hasCatering: hasCatering(base.lines),
    usesByCustomer: uses,
    now: args.now,
  })
  if (!check.ok) return { cart: base, promoId: null, rejected: check.reason }

  const discount: Discount = check.discount
  const cart = priceCart(args.items, args.catalog, args.pieces, args.rules, args.locale, discount)
  if (cart.totals.totalCents < STRIPE_MIN_CHARGE_CENTS)
    return { cart: base, promoId: null, rejected: 'too_large' }
  return { cart, promoId: check.promo.id, rejected: null }
}

export async function getAvailability(
  deps: CheckoutDeps,
  input: { from: string; to: string; items: CartLine[]; locale: 'en' | 'es'; promoCode: string },
): Promise<AvailabilityResponse> {
  const days = (Date.parse(input.to) - Date.parse(input.from)) / 86_400_000
  if (days > MAX_RANGE_DAYS) throw new CheckoutError('range_too_long')
  const now = deps.now?.() ?? new Date()
  const store = await deps.stores.defaultStore()
  const [rows, catalog, pieces] = await Promise.all([
    deps.stores.rules(store.id),
    deps.catalog.products(productIds(input.items)),
    deps.catalog.pieces(pieceIds(input.items)),
  ])
  const { needs, leadHours } = cartNeeds(input.items, catalog)
  const slots = await deps.availability.slots(store.id, input.from, input.to, needs, leadHours)

  let quote: CartQuote | null = null
  try {
    const { cart, rejected } = await priceWithPromo(deps, {
      items: input.items,
      catalog,
      pieces,
      rules: {
        taxRatePpm: ppm(getRule('tax.rate_ppm', rows, { storeId: store.id, at: now })),
        maxQtyPerProduct: getRule('orders.max_qty_per_product', rows, { storeId: store.id, at: now }),
      },
      locale: input.locale,
      promoCode: input.promoCode,
      email: null,
      now,
    })
    quote = {
      lines: cart.lines.map((l) => ({
        name: l.nameSnapshot,
        detail: lineDetail(l),
        quantity: l.quantity,
        lineTotalCents: lineTotal(l),
      })),
      subtotalCents: cart.totals.subtotalCents,
      discountCents: cart.totals.discountCents,
      promo:
        input.promoCode === ''
          ? null
          : rejected === null
            ? { code: input.promoCode, applied: true }
            : { code: input.promoCode, applied: false, reason: rejected },
      taxLabel: getRule('tax.label', rows, { storeId: store.id, at: now })[input.locale],
      taxCents: cart.totals.taxCents,
      totalCents: cart.totals.totalCents,
    }
  } catch (err) {
    // Sin precio todavía: se muestran las horas igual y el resumen dice "precio por confirmar".
    if (!(err instanceof PricingError && err.code === 'price_missing')) throw err
  }

  return { timezone: store.timezone, leadHours, slots, quote }
}

export async function startCheckout(
  deps: CheckoutDeps,
  req: CheckoutRequestParsed,
): Promise<CheckoutResponse> {
  const now = deps.now?.() ?? new Date()
  const store = await deps.stores.defaultStore()
  const rows = await deps.stores.rules(store.id)
  const rule = <K extends Parameters<typeof getRule>[0]>(key: K) =>
    getRule(key, rows, { storeId: store.id, at: now })

  if (!rule('payments.online_enabled')) throw new CheckoutError('payments_disabled')

  const [catalog, pieces] = await Promise.all([
    deps.catalog.products(productIds(req.items)),
    deps.catalog.pieces(pieceIds(req.items)),
  ])
  // El cupón se vuelve a validar aquí, ya con el correo (límite por cliente): el resumen previo no basta.
  const { cart, promoId, rejected } = await priceWithPromo(deps, {
    items: req.items,
    catalog,
    pieces,
    rules: { taxRatePpm: ppm(rule('tax.rate_ppm')), maxQtyPerProduct: rule('orders.max_qty_per_product') },
    locale: req.locale,
    promoCode: req.promoCode,
    email: req.customer.email.toLowerCase(),
    now,
  })
  if (rejected !== null) throw new CheckoutError('promo_rejected', rejected)

  // La hora elegida tiene que seguir libre ahora, con lo que realmente hay en el carrito.
  const slots = await deps.availability.slots(
    store.id,
    req.pickup.date,
    req.pickup.date,
    cart.needs,
    cart.leadHours,
  )
  const slot = slots.find((s) => s.time === req.pickup.time)
  if (slot === undefined || !slot.available) throw new CheckoutError('slot_unavailable')

  if (
    req.pickupLocationId !== null &&
    !(await deps.stores.pickupLocationIds(store.id)).includes(req.pickupLocationId)
  ) {
    throw new CheckoutError('pickup_unavailable')
  }

  const order = await deps.orders.createCheckoutOrder({
    checkoutToken: req.checkoutToken,
    storeId: store.id,
    pickupLocationId: req.pickupLocationId,
    promoCodeId: promoId,
    customer: req.customer,
    locale: req.locale,
    note: req.note,
    scheduledFor: slot.startsAt,
    subtotalCents: cart.totals.subtotalCents,
    discountCents: cart.totals.discountCents,
    taxRatePpm: rule('tax.rate_ppm'),
    taxCents: cart.totals.taxCents,
    tipCents: cart.totals.tipCents,
    totalCents: cart.totals.totalCents,
    rulesSnapshot: snapshotRules(rows, { storeId: store.id, at: now }),
    lines: cart.lines,
    reservations: Object.entries(cart.needs).map(([category, qty]) => ({
      date: req.pickup.date,
      slotStart: req.pickup.time,
      category: category as keyof typeof cart.needs,
      qty,
    })),
  })

  // Reintento con el mismo checkout_token: se reutiliza la sesión de Stripe si sigue abierta.
  if (order.existing) {
    if (order.stripeSessionId !== null) {
      const session = await deps.payments.getCheckoutSession(order.stripeSessionId)
      if (session.status === 'open' && session.url !== null) {
        return { url: session.url, code: order.code, accessToken: order.accessToken }
      }
    }
    if (order.status !== 'pending_payment' || order.stripeSessionId !== null) {
      throw new CheckoutError('checkout_closed')
    }
  }

  const localePath = req.locale === 'es' ? '/es' : ''
  const site = deps.siteUrl.replace(/\/$/, '')
  const taxLabel = rule('tax.label')[req.locale]
  const session = await deps.payments.createCheckoutSession({
    idempotencyKey: req.checkoutToken,
    orderId: order.orderId,
    orderCode: order.code,
    customerEmail: req.customer.email,
    locale: req.locale,
    lineItems: [
      ...cart.lines.map((l) => {
        const detail = lineDetail(l)
        return {
          name: detail === null ? l.nameSnapshot : `${l.nameSnapshot} · ${detail}`,
          unitAmountCents: l.unitPriceCents,
          quantity: l.quantity,
        }
      }),
      ...(cart.totals.taxCents > 0
        ? [{ name: taxLabel, unitAmountCents: cart.totals.taxCents, quantity: 1 }]
        : []),
    ],
    successUrl: `${site}${localePath}/checkout/success?order=${order.accessToken}`,
    cancelUrl: `${site}${localePath}/checkout?cancelled=1`,
    expiresAt: Math.floor(now.getTime() / 1000) + SESSION_MINUTES * 60,
    paymentMethods: rule('payments.bnpl_enabled')
      ? ['card', 'klarna', 'afterpay_clearpay', 'affirm']
      : ['card'],
    discountCents: cart.totals.discountCents,
    discountLabel: req.promoCode,
  })
  await deps.orders.attachStripeSession(order.orderId, session.id)

  return { url: session.url, code: order.code, accessToken: order.accessToken }
}

/** Evento de Stripe ya verificado (la firma la comprueba el adaptador). */
export interface PaymentEvent {
  id: string
  type: string
  sessionId: string
  /** checkout.session.payment_status: paid | unpaid | no_payment_required */
  paymentStatus: string | null
  paymentIntentId: string | null
  amountTotalCents: number | null
  paymentMethod: string | null
}

export async function handlePaymentEvent(deps: CheckoutDeps, event: PaymentEvent): Promise<string> {
  switch (event.type) {
    case 'checkout.session.completed':
      // Con métodos asíncronos (p. ej. algunos BNPL) el pago llega después en async_payment_succeeded.
      if (event.paymentStatus !== 'paid') return 'awaiting_async_payment'
      return confirm(deps, event)
    case 'checkout.session.async_payment_succeeded':
      return confirm(deps, event)
    case 'charge.refunded':
      // amountTotalCents trae lo reembolsado acumulado del cargo
      if (event.paymentIntentId === null || event.amountTotalCents === null) return 'ignored'
      return deps.orders.syncRefund({
        eventId: event.id,
        eventType: event.type,
        paymentIntentId: event.paymentIntentId,
        amountRefundedCents: event.amountTotalCents,
      })
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed':
      return deps.orders.cancelUnpaid({
        eventId: event.id,
        eventType: event.type,
        sessionId: event.sessionId,
        reason: event.type === 'checkout.session.expired' ? 'checkout_expired' : 'payment_failed',
      })
    default:
      return 'ignored'
  }
}

async function confirm(deps: CheckoutDeps, event: PaymentEvent): Promise<string> {
  const result = await deps.orders.confirmPaid({
    eventId: event.id,
    eventType: event.type,
    sessionId: event.sessionId,
    paymentIntentId: event.paymentIntentId,
    amountTotalCents: event.amountTotalCents,
    paymentMethod: event.paymentMethod,
  })
  if (result === 'confirmed' || result === 'confirmed_needs_review') {
    // El correo no puede tumbar el webhook: si falla, el pedido sigue pagado y se registra el error.
    try {
      const summary = await deps.orders.summaryBySession(event.sessionId)
      if (summary !== null) await deps.mailer.orderConfirmed(summary)
    } catch (err) {
      console.error('[checkout] no se pudo enviar el correo de confirmación', err)
    }
  }
  return result
}

/**
 * Cron (cada 5 min): respaldo por si Stripe nunca manda checkout.session.expired. Libera los cupos
 * retenidos vencidos y cancela esos pedidos sin pagar, para que la hora vuelva a estar disponible.
 */
export async function releaseExpired(deps: Pick<CheckoutDeps, 'orders'>): Promise<number> {
  const released = await deps.orders.releaseExpiredHolds()
  if (released > 0) console.log(`[cron] cupos vencidos liberados: ${String(released)}`)
  return released
}

export function getOrderSummary(deps: CheckoutDeps, accessToken: string): Promise<OrderSummary | null> {
  return deps.orders.summaryByAccessToken(accessToken)
}
