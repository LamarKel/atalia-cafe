// Adaptador de Stripe: Checkout alojado por Stripe (tarjeta, Apple Pay y Google Pay; cuotas si el interruptor
// payments.bnpl_enabled está encendido). Idempotency-Key = checkout_token (CLAUDE.md, Pagos).
import Stripe from 'stripe'
import type { PaymentEvent } from '../../modules/payments/application/checkout'
import type { PaymentGateway } from '../../modules/payments/ports'

export function stripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2 })
}

export function paymentGateway(stripe: Stripe): PaymentGateway {
  return {
    async createCheckoutSession(input) {
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          client_reference_id: input.orderId,
          customer_email: input.customerEmail,
          locale: input.locale,
          // Filtro sobre los métodos que Stripe calcula; Apple Pay y Google Pay van dentro de "card".
          allowed_payment_method_types:
            input.paymentMethods as Stripe.Checkout.SessionCreateParams.AllowedPaymentMethodType[],
          line_items: input.lineItems.map((l) => ({
            quantity: l.quantity,
            price_data: { currency: 'usd', unit_amount: l.unitAmountCents, product_data: { name: l.name } },
          })),
          metadata: { order_id: input.orderId, order_code: input.orderCode },
          payment_intent_data: { metadata: { order_id: input.orderId, order_code: input.orderCode } },
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          expires_at: input.expiresAt,
        },
        { idempotencyKey: input.idempotencyKey },
      )
      if (session.url === null) throw new Error('stripe_session_without_url')
      return { id: session.id, url: session.url }
    },

    async getCheckoutSession(id) {
      const session = await stripe.checkout.sessions.retrieve(id)
      return { id: session.id, url: session.url, status: session.status ?? 'unknown' }
    },
  }
}

const cryptoProvider = Stripe.createSubtleCryptoProvider()

/** Valores que acepta orders.payment_method (CHECK en la BD); lo demás se guarda como null. */
const KNOWN_METHODS = new Set(['card', 'apple_pay', 'google_pay', 'klarna', 'afterpay_clearpay', 'affirm'])

/** Apple Pay y Google Pay llegan como "card" con card.wallet.type. */
export function methodName(pm: Pick<Stripe.PaymentMethod, 'type' | 'card'> | null): string | null {
  if (pm === null) return null
  const wallet = pm.card?.wallet?.type
  const name = pm.type === 'card' && (wallet === 'apple_pay' || wallet === 'google_pay') ? wallet : pm.type
  return KNOWN_METHODS.has(name) ? name : null
}

/**
 * Verifica la firma del webhook (Stripe-Signature) con el cuerpo crudo y lo convierte en un PaymentEvent.
 * Devuelve null si el evento no es de una sesión de Checkout. Lanza si la firma no es válida.
 */
export async function verifyPaymentEvent(
  stripe: Stripe,
  rawBody: string,
  signature: string,
  webhookSecret: string,
): Promise<PaymentEvent | null> {
  const event = await stripe.webhooks.constructEventAsync(
    rawBody,
    signature,
    webhookSecret,
    undefined,
    cryptoProvider,
  )
  if (!event.type.startsWith('checkout.session.')) return null
  const session = event.data.object as Stripe.Checkout.Session
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? null)

  // El método con que realmente pagó (card, klarna, affirm…): está en el PaymentIntent, no en la sesión.
  let paymentMethod: string | null = null
  if (paymentIntentId !== null && session.payment_status === 'paid') {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['payment_method'] })
    paymentMethod = typeof intent.payment_method === 'object' ? methodName(intent.payment_method) : null
  }

  return {
    id: event.id,
    type: event.type,
    sessionId: session.id,
    paymentStatus: session.payment_status,
    paymentIntentId,
    amountTotalCents: session.amount_total,
    paymentMethod,
  }
}
