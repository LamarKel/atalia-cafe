import { describe, expect, it } from 'vitest'
import {
  checkPromo,
  promoCodeInputSchema,
  promoDraftSchema,
  promoState,
  type PromoDraftInput,
  type PromoRule,
} from './index'

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

const rule = (over: Partial<PromoRule> = {}): PromoRule => ({
  id: 'p1',
  code: 'QATEST10',
  discountType: 'percentage',
  discountPpm: 100_000,
  discountCents: null,
  minOrderCents: 2000,
  maxUses: null,
  maxUsesPerCustomer: 1,
  usedCount: 0,
  appliesToCatering: true,
  startsAt: null,
  expiresAt: null,
  active: true,
  ...over,
})
const NOW = new Date('2026-10-18T12:00:00Z')
const ctx = { subtotalCents: 5000, hasCatering: false, usesByCustomer: 0, now: NOW }

describe('checkPromo (checkout)', () => {
  it('normaliza el código que escribe el cliente', () => {
    expect(promoCodeInputSchema.parse('  qatest10 ')).toBe('QATEST10')
    expect(promoCodeInputSchema.parse(undefined)).toBe('')
  })

  it('aplica el porcentaje o el monto fijo', () => {
    expect(checkPromo(rule(), ctx)).toMatchObject({
      ok: true,
      discount: { type: 'percentage', ppm: 100_000 },
    })
    expect(
      checkPromo(rule({ discountType: 'fixed', discountPpm: null, discountCents: 500 }), ctx),
    ).toMatchObject({ ok: true, discount: { type: 'fixed', cents: 500 } })
  })

  it('rechaza con el motivo para mostrarle al cliente', () => {
    expect(checkPromo(null, ctx)).toEqual({ ok: false, reason: 'not_found' })
    expect(checkPromo(rule({ active: false }), ctx)).toEqual({ ok: false, reason: 'inactive' })
    expect(checkPromo(rule({ expiresAt: '2026-10-01T00:00:00Z' }), ctx)).toEqual({
      ok: false,
      reason: 'expired',
    })
    expect(checkPromo(rule({ maxUses: 3, usedCount: 3 }), ctx)).toEqual({ ok: false, reason: 'used_up' })
    expect(checkPromo(rule(), { ...ctx, subtotalCents: 1999 })).toEqual({ ok: false, reason: 'min_order' })
    expect(checkPromo(rule({ appliesToCatering: false }), { ...ctx, hasCatering: true })).toEqual({
      ok: false,
      reason: 'not_for_catering',
    })
    expect(checkPromo(rule(), { ...ctx, usesByCustomer: 1 })).toEqual({
      ok: false,
      reason: 'per_customer_limit',
    })
  })

  it('sin correo todavía no se puede contar el límite por cliente', () => {
    expect(checkPromo(rule(), { ...ctx, usesByCustomer: null }).ok).toBe(true)
  })
})
