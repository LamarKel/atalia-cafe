// Puertos del checkout (hexagonal ligera, PLAN.md §6): la aplicación habla con estas interfaces y
// index.ts las une con los adaptadores de Supabase, Stripe y Resend.
import type { OrderSummary } from '@atalia/shared/checkout'
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
  cancelUnpaid(event: {
    eventId: string
    eventType: string
    sessionId: string
    reason: string
  }): Promise<string>
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
}

export interface PaymentGateway {
  createCheckoutSession(input: CheckoutSessionInput): Promise<{ id: string; url: string }>
  /** Sesión ya creada (reintento con el mismo checkout_token). */
  getCheckoutSession(id: string): Promise<{ id: string; url: string | null; status: string }>
}

/** Resumen + datos para escribirle al cliente (solo dentro del Worker, nunca al navegador). */
export type PaidOrderContact = OrderSummary & { email: string; accessToken: string }

export interface Mailer {
  orderConfirmed(summary: PaidOrderContact): Promise<void>
}
