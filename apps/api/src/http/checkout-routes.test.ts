import { describe, expect, it, vi } from 'vitest'
import type { CheckoutDeps, PaymentEvent } from '../modules/payments/application/checkout'
import { createApp, type Bindings } from './app'
import type { CheckoutWiring } from './checkout-routes'

const env: Bindings = { ENVIRONMENT: 'development', ALLOWED_ORIGINS: 'http://localhost:4321' }

function app(over: Partial<CheckoutWiring> = {}) {
  const wiring: CheckoutWiring = {
    deps: () => {
      throw new Error('no debería tocar la BD')
    },
    verifyEvent: () => Promise.reject(new Error('bad signature')),
    ...over,
  }
  return createApp(wiring)
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  ({
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  }) satisfies RequestInit

describe('rutas del checkout', () => {
  it('valida el cuerpo antes de tocar la BD', async () => {
    const res = await app().request('/checkout', post('/checkout', { items: [] }), env)
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('validation_failed')
  })

  it('JSON roto → 400', async () => {
    const res = await app().request('/availability', post('/availability', '{nope'), env)
    expect(res.status).toBe(400)
  })

  it('el webhook exige firma y rechaza una firma inválida', async () => {
    expect((await app().request('/webhooks/stripe', post('', '{}'), env)).status).toBe(400)
    const bad = await app().request(
      '/webhooks/stripe',
      post('', '{}', { 'stripe-signature': 't=1,v1=x' }),
      env,
    )
    expect(bad.status).toBe(400)
  })

  it('el webhook procesa un evento con firma válida', async () => {
    const event: PaymentEvent = {
      id: 'evt_1',
      type: 'checkout.session.expired',
      sessionId: 'cs_1',
      paymentStatus: 'unpaid',
      paymentIntentId: null,
      amountTotalCents: null,
      paymentMethod: null,
    }
    const cancelUnpaid = vi.fn(() => Promise.resolve('cancelled'))
    const res = await app({
      verifyEvent: () => Promise.resolve(event),
      deps: () => ({ orders: { cancelUnpaid } }) as unknown as CheckoutDeps,
    }).request('/webhooks/stripe', post('', '{}', { 'stripe-signature': 't=1,v1=ok' }), env)
    expect(await res.json()).toEqual({ received: true, result: 'cancelled' })
    expect(cancelUnpaid).toHaveBeenCalledOnce()
  })

  it('un token de pedido que no es UUID da 404 sin consultar la BD', async () => {
    expect((await app().request('/orders/abc', {}, env)).status).toBe(404)
  })
})
