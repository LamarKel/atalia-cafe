import { checkoutRequestSchema, type CheckoutRequest } from '@atalia/shared/checkout'
import type { StoredRule } from '@atalia/shared/rules'
import { describe, expect, it, vi } from 'vitest'
import type { CatalogProduct } from '../../orders/domain/pricing'
import type { CheckoutSessionInput, CreatedOrder, NewOrder, SlotRow } from '../ports'
import {
  CheckoutError,
  handlePaymentEvent,
  startCheckout,
  type CheckoutDeps,
  type PaymentEvent,
} from './checkout'

const STORE = '69de0e2e-c905-4d36-93f6-446572005410'
const TRAY = '00000000-0000-4000-8000-000000000001'
const S10 = '00000000-0000-4000-8000-000000000010'
const TOKEN = '11111111-1111-4111-8111-111111111111'

const tray: CatalogProduct = {
  id: TRAY,
  type: 'tray',
  nameEn: 'Breakfast tray',
  nameEs: 'Bandeja de desayuno',
  priceCents: null,
  minLeadHours: 24,
  active: true,
  sizes: [
    {
      id: S10,
      nameEn: '10 people',
      nameEs: '10 personas',
      serves: 10,
      units: null,
      priceCents: 9000,
      priceModifierCents: 0,
      active: true,
    },
  ],
}

const request: CheckoutRequest = {
  checkoutToken: TOKEN,
  locale: 'es',
  pickup: { date: '2026-10-21', time: '11:00' },
  customer: { name: 'Ana Pérez', phone: '+1 973 555 0100', email: 'ana@example.com' },
  items: [{ productId: TRAY, sizeId: S10, quantity: 2 }],
}

const slot = (over: Partial<SlotRow> = {}): SlotRow => ({
  date: '2026-10-21',
  time: '11:00',
  startsAt: '2026-10-21T15:00:00Z',
  available: true,
  reason: null,
  ...over,
})

function setup(opts: { rules?: StoredRule[]; slots?: SlotRow[]; created?: Partial<CreatedOrder> } = {}) {
  const sessions: CheckoutSessionInput[] = []
  const orders: NewOrder[] = []
  const attach = vi.fn<(orderId: string, sessionId: string) => Promise<void>>(() => Promise.resolve())
  const mail = vi.fn(() => Promise.resolve())
  const deps: CheckoutDeps = {
    siteUrl: 'https://atalia.test/',
    now: () => new Date('2026-10-18T12:00:00Z'),
    stores: {
      defaultStore: () => Promise.resolve({ id: STORE, timezone: 'America/New_York' }),
      rules: () => Promise.resolve(opts.rules ?? []),
    },
    catalog: {
      products: () => Promise.resolve(new Map([[TRAY, tray]])),
      pieces: () => Promise.resolve(new Map()),
    },
    availability: { slots: () => Promise.resolve(opts.slots ?? [slot()]) },
    orders: {
      createCheckoutOrder: (o) => {
        orders.push(o)
        return Promise.resolve({
          orderId: 'order-1',
          code: 'AT-K7Q2MX',
          accessToken: 'access-1',
          status: 'pending_payment',
          existing: false,
          stripeSessionId: null,
          ...opts.created,
        })
      },
      attachStripeSession: attach,
      confirmPaid: () => Promise.resolve('confirmed'),
      cancelUnpaid: () => Promise.resolve('cancelled'),
      summaryByAccessToken: () => Promise.resolve(null),
      summaryBySession: () =>
        Promise.resolve({
          code: 'AT-K7Q2MX',
          status: 'confirmed',
          paymentStatus: 'paid',
          scheduledFor: '2026-10-21T15:00:00Z',
          timezone: 'America/New_York',
          locale: 'es',
          customerName: 'Ana Pérez',
          email: 'ana@example.com',
          accessToken: 'access-1',
          items: [],
          subtotalCents: 18000,
          discountCents: 0,
          taxCents: 1193,
          tipCents: 0,
          totalCents: 19193,
        }),
    },
    payments: {
      createCheckoutSession: (input) => {
        sessions.push(input)
        return Promise.resolve({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' })
      },
      getCheckoutSession: (id) =>
        Promise.resolve({ id, url: 'https://checkout.stripe.com/old', status: 'open' }),
    },
    mailer: { orderConfirmed: mail },
  }
  return { deps, sessions, orders, attach, mail }
}

const run = (deps: CheckoutDeps) => startCheckout(deps, checkoutRequestSchema.parse(request))

describe('startCheckout', () => {
  it('crea el pedido con montos del servidor y una sesión de Stripe que cobra exactamente el total', async () => {
    const { deps, sessions, orders, attach } = setup()
    const res = await run(deps)

    expect(res).toEqual({
      url: 'https://checkout.stripe.com/c/pay/cs_test_1',
      code: 'AT-K7Q2MX',
      accessToken: 'access-1',
    })
    const order = orders[0]
    expect(order).toMatchObject({
      scheduledFor: '2026-10-21T15:00:00Z',
      subtotalCents: 18000,
      taxRatePpm: 66250,
      taxCents: 1193,
      totalCents: 19193,
      reservations: [{ date: '2026-10-21', slotStart: '11:00', category: 'tray', qty: 2 }],
    })
    expect(order?.rulesSnapshot['tax.rate_ppm']).toBe(66250)

    const session = sessions[0]
    const charged = session?.lineItems.reduce((sum, l) => sum + l.unitAmountCents * l.quantity, 0)
    expect(charged).toBe(order?.totalCents)
    expect(session).toMatchObject({
      idempotencyKey: TOKEN,
      paymentMethods: ['card'],
      successUrl: 'https://atalia.test/es/checkout/success?order=access-1',
      cancelUrl: 'https://atalia.test/es/checkout?cancelled=1',
    })
    expect(session?.expiresAt).toBe(Date.parse('2026-10-18T12:30:00Z') / 1000)
    expect(attach).toHaveBeenCalledWith('order-1', 'cs_test_1')
  })

  it('ofrece cuotas solo con el interruptor encendido', async () => {
    const rules = [
      { key: 'payments.bnpl_enabled', store_id: null, value: true, effective_from: '2026-01-01T00:00:00Z' },
    ]
    const { deps, sessions } = setup({ rules })
    await run(deps)
    expect(sessions[0]?.paymentMethods).toEqual(['card', 'klarna', 'afterpay_clearpay', 'affirm'])
  })

  it('no cobra si los pagos en línea están apagados', async () => {
    const rules = [
      {
        key: 'payments.online_enabled',
        store_id: STORE,
        value: false,
        effective_from: '2026-01-01T00:00:00Z',
      },
    ]
    await expect(run(setup({ rules }).deps)).rejects.toEqual(new CheckoutError('payments_disabled'))
  })

  it('rechaza una hora que ya no está libre', async () => {
    const { deps, orders } = setup({ slots: [slot({ available: false, reason: 'full' })] })
    await expect(run(deps)).rejects.toEqual(new CheckoutError('slot_unavailable'))
    expect(orders).toHaveLength(0)
  })

  it('un reintento con el mismo token reutiliza la sesión abierta sin crear otra', async () => {
    const { deps, sessions } = setup({ created: { existing: true, stripeSessionId: 'cs_test_old' } })
    const res = await run(deps)
    expect(res.url).toBe('https://checkout.stripe.com/old')
    expect(sessions).toHaveLength(0)
  })
})

describe('handlePaymentEvent', () => {
  const event = (over: Partial<PaymentEvent>): PaymentEvent => ({
    id: 'evt_1',
    type: 'checkout.session.completed',
    sessionId: 'cs_test_1',
    paymentStatus: 'paid',
    paymentIntentId: 'pi_1',
    amountTotalCents: 19193,
    paymentMethod: 'card',
    ...over,
  })

  it('confirma el pago y envía el correo', async () => {
    const { deps, mail } = setup()
    expect(await handlePaymentEvent(deps, event({}))).toBe('confirmed')
    expect(mail).toHaveBeenCalledOnce()
  })

  it('si el correo falla, el pedido igual queda confirmado', async () => {
    const { deps } = setup()
    deps.mailer.orderConfirmed = () => Promise.reject(new Error('resend down'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await handlePaymentEvent(deps, event({}))).toBe('confirmed')
    log.mockRestore()
  })

  it('espera el pago asíncrono cuando la sesión terminó sin pagar', async () => {
    const { deps, mail } = setup()
    expect(await handlePaymentEvent(deps, event({ paymentStatus: 'unpaid' }))).toBe('awaiting_async_payment')
    expect(mail).not.toHaveBeenCalled()
  })

  it('cancela y libera el cupo cuando la sesión vence', async () => {
    const { deps } = setup()
    expect(await handlePaymentEvent(deps, event({ type: 'checkout.session.expired' }))).toBe('cancelled')
  })
})
