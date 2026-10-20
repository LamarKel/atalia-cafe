import { describe, expect, it } from 'vitest'
import { refundRequestSchema, suggestRefund, tierPpm, type RefundPolicyInput } from './index'

const tiers = [
  { hoursBefore: 48, refundPpm: 1_000_000 },
  { hoursBefore: 24, refundPpm: 500_000 },
  { hoursBefore: 0, refundPpm: 0 },
]
const NOW = new Date('2026-10-18T12:00:00Z')
const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString()

// Bandeja $100 + latte $10 = $110, impuesto 6.625 % = $7.29 → total $117.29
const order = (over: Partial<RefundPolicyInput> = {}): RefundPolicyInput => ({
  status: 'confirmed',
  scheduledFor: at(30),
  subtotalCents: 11_000,
  totalCents: 11_729,
  refundedCents: 0,
  lines: [
    { productType: 'tray', lineTotalCents: 10_000 },
    { productType: 'menu', lineTotalCents: 1_000 },
  ],
  cateringTiers: tiers,
  menuUntilStatus: 'confirmed',
  ...over,
})

describe('reembolsos', () => {
  it('elige el tramo por horas antes de la recogida', () => {
    expect(tierPpm(tiers, 72)).toBe(1_000_000)
    expect(tierPpm(tiers, 30)).toBe(500_000)
    expect(tierPpm(tiers, 5)).toBe(0)
    expect(tierPpm(tiers, -2)).toBe(0)
  })

  it('cliente cancela a 30 h: 50 % de la bandeja + 100 % del menú, con impuesto proporcional', () => {
    const r = suggestRefund(order(), 'customer', NOW)
    // (10000 × 0.5 + 1000) / 11000 × 11729 = 6397.6 → 6398
    expect(r.suggestedCents).toBe(6398)
    expect(r.cateringPpm).toBe(500_000)
    expect(r.menuRefundable).toBe(true)
  })

  it('el menú en preparación ya no se reembolsa (regla por defecto)', () => {
    const r = suggestRefund(order({ status: 'preparing', scheduledFor: at(72) }), 'customer', NOW)
    // solo la bandeja al 100 %: 10000 / 11000 × 11729 = 10662.7 → 10663
    expect(r.suggestedCents).toBe(10_663)
    expect(r.menuRefundable).toBe(false)
  })

  it('si el negocio cancela se devuelve todo; si no vino, nada por política', () => {
    expect(suggestRefund(order(), 'business', NOW).suggestedCents).toBe(11_729)
    expect(suggestRefund(order(), 'no_show', NOW).suggestedCents).toBe(0)
  })

  it('nunca sugiere más de lo que queda por devolver', () => {
    const r = suggestRefund(order({ refundedCents: 11_000, scheduledFor: at(72) }), 'customer', NOW)
    expect(r.remainingCents).toBe(729)
    expect(r.suggestedCents).toBe(729)
    expect(suggestRefund(order({ refundedCents: 11_729 }), 'business', NOW).suggestedCents).toBe(0)
  })

  it('valida la solicitud del panel', () => {
    const ok = {
      amountCents: 500,
      reason: 'customer',
      cancel: true,
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
    }
    expect(refundRequestSchema.parse(ok).note).toBe('')
    expect(refundRequestSchema.safeParse({ ...ok, amountCents: -1 }).success).toBe(false)
    expect(refundRequestSchema.safeParse({ ...ok, reason: 'whatever' }).success).toBe(false)
  })
})
