import { describe, expect, it } from 'vitest'
import { promoDraftSchema, promoState, type PromoDraftInput } from './index'

const base: PromoDraftInput = {
  id: null,
  code: 'bienvenida10',
  description: '',
  discountType: 'percentage',
  discountPpm: 100_000,
  discountCents: null,
  minOrderCents: 0,
  maxUses: null,
  maxUsesPerCustomer: 1,
  appliesToCatering: true,
  startsAt: null,
  expiresAt: null,
  active: true,
}
const msg = (p: PromoDraftInput) => {
  const r = promoDraftSchema.safeParse(p)
  return r.success ? 'ok' : r.error.issues.map((i) => i.message).join(',')
}

describe('cupones', () => {
  it('el código queda en mayúsculas y la descripción vacía como null', () => {
    const p = promoDraftSchema.parse(base)
    expect(p.code).toBe('BIENVENIDA10')
    expect(p.description).toBeNull()
  })
  it('valida código, valor según el tipo y fechas', () => {
    expect(msg({ ...base, code: 'a b' })).toBe('invalid_code')
    expect(msg({ ...base, discountPpm: null })).toBe('invalid_value')
    expect(msg({ ...base, discountType: 'fixed', discountPpm: null, discountCents: 500 })).toBe('ok')
    expect(
      msg({ ...base, startsAt: '2026-11-02T00:00:00-05:00', expiresAt: '2026-11-01T00:00:00-05:00' }),
    ).toBe('invalid_dates')
  })
  it('estado del cupón en el tiempo', () => {
    const now = new Date('2026-10-18T12:00:00Z')
    const p = { active: true, startsAt: null, expiresAt: null, maxUses: null, usedCount: 0 }
    expect(promoState(p, now)).toBe('active')
    expect(promoState({ ...p, active: false }, now)).toBe('inactive')
    expect(promoState({ ...p, expiresAt: '2026-10-18T11:00:00Z' }, now)).toBe('expired')
    expect(promoState({ ...p, startsAt: '2026-10-19T00:00:00Z' }, now)).toBe('scheduled')
    expect(promoState({ ...p, maxUses: 5, usedCount: 5 }, now)).toBe('used_up')
  })
})
