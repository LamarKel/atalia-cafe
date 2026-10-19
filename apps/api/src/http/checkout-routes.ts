// Rutas del checkout. Validan la entrada con los mismos esquemas Zod que usa el sitio (packages/shared)
// y traducen los errores de dominio a respuestas JSON sin detalles internos.
import { availabilityRequestSchema, checkoutRequestSchema } from '@atalia/shared/checkout'
import type { Hono } from 'hono'
import { z } from 'zod'
import { PricingError } from '../modules/orders/domain/pricing'
import {
  CheckoutError,
  getAvailability,
  getOrderSummary,
  handlePaymentEvent,
  startCheckout,
  type CheckoutDeps,
  type PaymentEvent,
} from '../modules/payments/application/checkout'
import type { AppEnv, Bindings } from './app'
import { ApiError } from './errors'

export interface CheckoutWiring {
  deps(env: Bindings): CheckoutDeps
  /** Verifica la firma de Stripe; lanza si no es válida. null = evento que no nos interesa. */
  verifyEvent(env: Bindings, rawBody: string, signature: string): Promise<PaymentEvent | null>
}

async function parseJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw new ApiError(400, 'bad_request', 'JSON inválido')
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError(
      422,
      'validation_failed',
      'Revisa los datos enviados',
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    )
  }
  return parsed.data
}

function domainError(err: unknown): never {
  if (err instanceof PricingError) {
    throw new ApiError(422, 'cart_invalid', 'Hay un problema con el carrito', {
      reason: err.code,
      line: err.lineIndex,
    })
  }
  if (err instanceof CheckoutError) {
    switch (err.code) {
      case 'payments_disabled':
        throw new ApiError(
          503,
          'payments_disabled',
          'Los pagos en línea no están disponibles en este momento',
        )
      case 'slot_unavailable':
        throw new ApiError(409, 'slot_unavailable', 'Esa hora ya no está disponible')
      case 'checkout_closed':
        throw new ApiError(409, 'checkout_closed', 'Este intento de pago ya terminó. Vuelve a intentarlo.')
      case 'pickup_unavailable':
        throw new ApiError(422, 'validation_failed', 'Ese punto de recogida no está disponible')
      case 'range_too_long':
        throw new ApiError(422, 'validation_failed', 'Rango de fechas demasiado largo')
      case 'promo_rejected':
        throw new ApiError(422, 'promo_rejected', 'Ese cupón no se puede usar con este pedido', {
          reason: err.reason,
        })
    }
  }
  throw err
}

const accessTokenSchema = z.uuid()

export function checkoutRoutes(app: Hono<AppEnv>, wiring: CheckoutWiring): void {
  app.post('/availability', async (c) => {
    const input = await parseJson(c.req.raw, availabilityRequestSchema)
    const result = await getAvailability(wiring.deps(c.env), input).catch(domainError)
    c.header('Cache-Control', 'no-store')
    return c.json(result)
  })

  app.post('/checkout', async (c) => {
    const input = await parseJson(c.req.raw, checkoutRequestSchema)
    const result = await startCheckout(wiring.deps(c.env), input).catch(domainError)
    return c.json(result, 201)
  })

  app.get('/orders/:accessToken', async (c) => {
    const token = accessTokenSchema.safeParse(c.req.param('accessToken'))
    if (!token.success) throw new ApiError(404, 'not_found', 'Pedido no encontrado')
    const summary = await getOrderSummary(wiring.deps(c.env), token.data)
    if (summary === null) throw new ApiError(404, 'not_found', 'Pedido no encontrado')
    c.header('Cache-Control', 'no-store')
    return c.json(summary)
  })

  // Webhook de Stripe: cuerpo crudo para verificar la firma. Solo aquí se marca un pedido como pagado.
  app.post('/webhooks/stripe', async (c) => {
    const signature = c.req.header('stripe-signature')
    if (signature === undefined) throw new ApiError(400, 'bad_request', 'Falta la firma')
    const raw = await c.req.text()
    let event: PaymentEvent | null
    try {
      event = await wiring.verifyEvent(c.env, raw, signature)
    } catch (err) {
      console.warn('[webhook] evento rechazado', err instanceof Error ? err.message : err)
      throw new ApiError(400, 'bad_request', 'Firma inválida')
    }
    if (event === null) return c.json({ received: true, result: 'ignored' })
    const result = await handlePaymentEvent(wiring.deps(c.env), event)
    return c.json({ received: true, result })
  })
}
