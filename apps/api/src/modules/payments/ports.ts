// Puertos del checkout (hexagonal ligera, PLAN.md §6): la aplicación habla con estas interfaces y
// index.ts las une con los adaptadores de Supabase, Stripe y Resend.
import type { OrderSummary } from '@atalia/shared/checkout'
import type { PromoRule } from '@atalia/shared/promos'
import type { StoredRule } from '@atalia/shared/rules'
import type { CatalogPiece, CatalogProduct, PricedLine, ProductType } from '../orders/domain/pricing'

export interface Store {
  id: string
  timezone: string
}

export interface SlotRow {
  date: string
  time: string
  startsAt: string
  available: boolean
  reason: 'closed' | 'lead_time' | 'full' | null
}

export interface NewOrder {
  checkoutToken: string
  storeId: string
  pickupLocationId: string | null
  promoCodeId: string | null
  customer: { name: string; phone: string; email: string }
  locale: 'en' | 'es'
  note: string
  scheduledFor: string
  subtotalCents: number
  discountCents: number
  taxRatePpm: number
  taxCents: number
  tipCents: number
  totalCents: number
  rulesSnapshot: Record<string, unknown>
  lines: PricedLine[]
  reservations: Array<{ date: string; slotStart: string; category: ProductType; qty: number }>
}

export interface CreatedOrder {
  orderId: string
  code: string
  accessToken: string
  status: string
  existing: boolean
  stripeSessionId: string | null
}

export type ConfirmResult =
  | 'confirmed'
  | 'confirmed_needs_review'
  | 'refund_required'
  | 'already_paid'
  | 'duplicate_event'
  | 'order_not_found'

export interface StoreRepo {
  defaultStore(): Promise<Store>
  rules(storeId: string): Promise<StoredRule[]>
  /** Ids de los puntos de recogida activos de la tienda. */
  pickupLocationIds(storeId: string): Promise<string[]>
}

export interface PromoRepo {
  /** Cupón por código (ya en mayúsculas); null si no existe. */
  byCode(code: string): Promise<PromoRule | null>
  /** Pedidos pagados (o en curso de pago) de este correo con el cupón, para max_uses_per_customer. */
  usesByEmail(promoId: string, email: string): Promise<number>
}

export interface CatalogRepo {
  products(ids: readonly string[]): Promise<Map<string, CatalogProduct>>
  pieces(ids: readonly string[]): Promise<Map<string, CatalogPiece>>
}

export interface AvailabilityRepo {
  slots(
    storeId: string,
    from: string,
    to: string,
    needs: Partial<Record<ProductType, number>>,
    leadHours: number,
  ): Promise<SlotRow[]>
}

export interface OrdersRepo {
  createCheckoutOrder(order: NewOrder): Promise<CreatedOrder>
  attachStripeSession(orderId: string, sessionId: string): Promise<void>
  confirmPaid(event: {
    eventId: string
    eventType: string
    sessionId: string
    paymentIntentId: string | null
    amountTotalCents: number | null
    paymentMethod: string | null
  }): Promise<ConfirmResult>
  /** charge.refunded → sync_refund (idempotente con stripe_events). */
  syncRefund(event: {
    eventId: string
    eventType: string
    paymentIntentId: string
    amountRefundedCents: number
  }): Promise<string>
  cancelUnpaid(event: {
    eventId: string
    eventType: string
    sessionId: string
    reason: string
  }): Promise<string>
  /** Libera los cupos vencidos y cancela sus pedidos sin pagar (release_expired_holds). */
  releaseExpiredHolds(): Promise<number>
  summaryByAccessToken(accessToken: string): Promise<OrderSummary | null>
  summaryBySession(sessionId: string): Promise<PaidOrderContact | null>
}

export interface CheckoutSessionInput {
  idempotencyKey: string
  orderId: string
  orderCode: string
  customerEmail: string
  locale: 'en' | 'es'
  /** Líneas ya con impuesto separado: Stripe cobra exactamente total_cents. */
  lineItems: Array<{ name: string; unitAmountCents: number; quantity: number }>
  successUrl: string
  cancelUrl: string
  expiresAt: number
  paymentMethods: string[]
  /** Descuento del cupón en centavos (0 = sin cupón); Stripe lo resta del total de las líneas. */
  discountCents: number
  /** Nombre del descuento que ve el cliente en Stripe (el código del cupón). */
  discountLabel: string
}

export interface PaymentGateway {
  refund(input: {
    paymentIntentId: string
    amountCents: number
    idempotencyKey: string
    metadata: Record<string, string>
  }): Promise<{ id: string }>
  createCheckoutSession(input: CheckoutSessionInput): Promise<{ id: string; url: string }>
  /** Sesión ya creada (reintento con el mismo checkout_token). */
  getCheckoutSession(id: string): Promise<{ id: string; url: string | null; status: string }>
}

/** Resumen + datos para escribirle al cliente (solo dentro del Worker, nunca al navegador). */
export type PaidOrderContact = OrderSummary & { email: string; accessToken: string }

export interface Mailer {
  orderConfirmed(summary: PaidOrderContact): Promise<void>
}
