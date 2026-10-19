import { refundRequestSchema } from '@atalia/shared/refunds'
import { describe, expect, it, vi } from 'vitest'
import { RefundError, refundOrder, refundQuote, type RefundableOrder, type RefundPorts } from './refunds'

const NOW = new Date('2026-10-18T12:00:00Z')
const order = (over: Partial<RefundableOrder> = {}): RefundableOrder => ({
  id: 'o1',
  code: 'AT-K7Q2MX',
  status: 'confirmed',
  paymentStatus: 'paid',
  paymentIntentId: 'pi_1',
  checkoutToken: 't1',
  scheduledFor: new Date(NOW.getTime() + 30 * 3_600_000).toISOString(),
  subtotalCents: 10_000,
  totalCents: 10_663,
  refundedCents: 0,
  lines: [{ productType: 'tray', lineTotalCents: 10_000 }],
  customer: { name: 'Ana Pérez', email: 'ana@example.com' },
  locale: 'es',
  timezone: 'America/New_York',
  rulesSnapshot: {
    'refunds.catering_tiers': [
      { hoursBefore: 48, refundPpm: 1_000_000 },
      { hoursBefore: 24, refundPpm: 500_000 },
      { hoursBefore: 0, refundPpm: 0 },
    ],
    'refunds.menu_until_status': 'confirmed',
  },
  ...over,
})

function ports(over: Partial<RefundPorts> = {}, o = order()) {
  const p = {
    verify: vi.fn(() => Promise.resolve({ userId: 'u1', aal: 'aal2' })),
    profileOf: vi.fn(() => Promise.resolve({ role: 'admin' as const, active: true })),
    order: vi.fn(() => Promise.resolve(o)),
    stripeRefund: vi.fn(() => Promise.resolve({ id: 're_1' })),
    cancel: vi.fn(() => Promise.resolve()),
    history: vi.fn(() => Promise.resolve()),
    notifyCancelled: vi.fn(() => Promise.resolve()),
    ...over,
  }
  return p
}
const req = (over: object = {}) =>
  refundRequestSchema.parse({
    amountCents: 5332,
    reason: 'customer',
    cancel: true,
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
    ...over,
  })

describe('reembolsos desde el panel', () => {
  it('el equipo (staff) no reembolsa; hace falta 2FA', async () => {
    await expect(
      refundOrder(
        ports({ profileOf: vi.fn(() => Promise.resolve({ role: 'staff' as const, active: true })) }),
        't',
        'o1',
        req(),
        NOW,
      ),
    ).rejects.toEqual(new RefundError('forbidden'))
    await expect(
      refundOrder(
        ports({ verify: vi.fn(() => Promise.resolve({ userId: 'u1', aal: 'aal1' })) }),
        't',
        'o1',
        req(),
        NOW,
      ),
    ).rejects.toEqual(new RefundError('mfa_required'))
    await expect(refundOrder(ports(), null, 'o1', req(), NOW)).rejects.toEqual(
      new RefundError('unauthorized'),
    )
  })

  it('sugiere la política del pedido (50 % a 30 h, con impuesto)', async () => {
    const q = await refundQuote(ports(), 't', 'o1', 'customer', NOW)
    expect(q.suggestedCents).toBe(5332)
    expect(q.remainingCents).toBe(10_663)
  })

  it('reembolsa en Stripe con clave de idempotencia, cancela, devuelve el cupo y lo anota', async () => {
    const p = ports()
    expect(await refundOrder(p, 't', 'o1', req(), NOW)).toEqual({ refunded: 5332, cancelled: true })
    expect(p.stripeRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentIntentId: 'pi_1',
        amountCents: 5332,
        idempotencyKey: 'refund-11111111-1111-4111-8111-111111111111',
      }),
    )
    expect(p.cancel).toHaveBeenCalledOnce()
    expect(p.history).toHaveBeenCalledWith('o1', 'cancelled', 'Reembolso $53.32 · motivo: customer', 'u1')
  })

  it('anota cuando se devolvió distinto de la política', async () => {
    const p = ports()
    await refundOrder(p, 't', 'o1', req({ amountCents: 10_663, note: 'Cliente frecuente' }), NOW)
    expect(p.history).toHaveBeenCalledWith(
      'o1',
      'cancelled',
      'Reembolso $106.63 · motivo: customer · política sugería $53.32 · Cliente frecuente',
      'u1',
    )
  })

  it('no devuelve más de lo que queda ni reembolsa un pedido sin pagar', async () => {
    await expect(refundOrder(ports(), 't', 'o1', req({ amountCents: 10_664 }), NOW)).rejects.toEqual(
      new RefundError('too_much'),
    )
    await expect(
      refundOrder(ports({}, order({ paymentStatus: 'unpaid' })), 't', 'o1', req(), NOW),
    ).rejects.toEqual(new RefundError('not_paid'))
  })

  it('un pedido ya recogido se puede reembolsar pero no cancelar', async () => {
    const p = ports({}, order({ status: 'picked_up' }))
    expect(await refundOrder(p, 't', 'o1', req({ amountCents: 1000 }), NOW)).toEqual({
      refunded: 1000,
      cancelled: false,
    })
    expect(p.cancel).not.toHaveBeenCalled()
    await expect(
      refundOrder(ports({}, order({ status: 'picked_up' })), 't', 'o1', req({ amountCents: 0 }), NOW),
    ).rejects.toEqual(new RefundError('nothing_to_do'))
  })

  it('si anotar en el historial falla, el reembolso igual se reporta como hecho', async () => {
    const p = ports({ history: vi.fn(() => Promise.reject(new Error('db'))) })
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await refundOrder(p, 't', 'o1', req(), NOW)).toEqual({ refunded: 5332, cancelled: true })
    expect(p.stripeRefund).toHaveBeenCalledOnce()
    log.mockRestore()
  })

  it('si cancelamos nosotros, se avisa al cliente con el reembolso y el mensaje', async () => {
    const p = ports()
    await refundOrder(
      p,
      't',
      'o1',
      req({ reason: 'business', amountCents: 10_663, customerMessage: 'Se nos dañó el horno' }),
      NOW,
    )
    expect(p.notifyCancelled).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AT-K7Q2MX' }),
      10_663,
      'Se nos dañó el horno',
    )
  })

  it('si cancela el cliente no se manda el correo de "cancelamos nosotros"', async () => {
    const p = ports()
    await refundOrder(p, 't', 'o1', req(), NOW)
    expect(p.notifyCancelled).not.toHaveBeenCalled()
  })

  it('si el correo falla, la cancelación y el reembolso igual quedan hechos', async () => {
    const p = ports({ notifyCancelled: vi.fn(() => Promise.reject(new Error('resend'))) })
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await refundOrder(p, 't', 'o1', req({ reason: 'business' }), NOW)).toEqual({
      refunded: 5332,
      cancelled: true,
    })
    log.mockRestore()
  })
})
