import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { OWNER_ONLY_PREFIXES, RuleDefinitionError, defineRule } from './define'
import { RULES, type RuleKey } from './definitions'
import { getRule, isRuleKey, publicRules, snapshotRules, validateRuleValue, type StoredRule } from './resolve'

const STORE = '69de0e2e-c905-4d36-93f6-446572005410'
const OTHER_STORE = '00000000-0000-4000-8000-000000000999'

describe('registro de reglas', () => {
  it('cada valor por defecto cumple su schema', () => {
    for (const key of Object.keys(RULES) as RuleKey[]) {
      expect(RULES[key].schema.safeParse(RULES[key].default).success, key).toBe(true)
    }
  })

  it('las claves coinciden con su entrada y con el CHECK de la BD', () => {
    for (const [key, def] of Object.entries(RULES)) {
      expect(def.key).toBe(key)
      expect(key).toMatch(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/)
    }
  })

  it('las reglas de dinero son del owner, igual que la RLS', () => {
    for (const def of Object.values(RULES)) {
      const prefix = def.key.split('.')[0] ?? ''
      expect(def.editableBy, def.key).toBe(OWNER_ONLY_PREFIXES.has(prefix) ? 'owner' : 'admin')
    }
  })

  it('defineRule rechaza definiciones inconsistentes', () => {
    const base = {
      group: 'time',
      label: { en: 'x', es: 'x' },
      help: { en: 'x', es: 'x' },
      unit: 'count',
      storeScoped: false,
      public: false,
    } as const
    expect(() =>
      defineRule({ ...base, key: 'time.bad', schema: z.number().min(10), default: 1, editableBy: 'admin' }),
    ).toThrow(RuleDefinitionError)
    expect(() =>
      defineRule({ ...base, key: 'Time.x', schema: z.number(), default: 1, editableBy: 'admin' }),
    ).toThrow(RuleDefinitionError)
    expect(() =>
      defineRule({ ...base, key: 'tax.x', schema: z.number(), default: 1, editableBy: 'admin' }),
    ).toThrow(RuleDefinitionError)
    expect(() =>
      defineRule({
        ...base,
        group: 'tax',
        key: 'tax.x',
        schema: z.number(),
        default: 1,
        editableBy: 'admin',
      }),
    ).toThrow(/owner/)
  })

  it('los tramos de reembolso no pueden subir al acercarse la recogida', () => {
    const schema = RULES['refunds.catering_tiers'].schema
    expect(
      schema.safeParse([
        { hoursBefore: 48, refundPpm: 500_000 },
        { hoursBefore: 24, refundPpm: 1_000_000 },
      ]).success,
    ).toBe(false)
    expect(
      schema.safeParse([
        { hoursBefore: 24, refundPpm: 1_000_000 },
        { hoursBefore: 48, refundPpm: 500_000 },
      ]).success,
    ).toBe(false)
  })
})

describe('getRule (mismo criterio que public.get_rule)', () => {
  const rows: StoredRule[] = [
    { key: 'tax.rate_ppm', store_id: null, value: 70_000, effective_from: '2026-01-01T00:00:00Z' },
    { key: 'tax.rate_ppm', store_id: STORE, value: 66_250, effective_from: '2026-01-01T00:00:00Z' },
    { key: 'tax.rate_ppm', store_id: STORE, value: 68_000, effective_from: '2027-01-01T00:00:00Z' },
    { key: 'time.slot_minutes', store_id: null, value: 30, effective_from: '2026-01-01T00:00:00Z' },
  ]
  const now = new Date('2026-10-16T12:00:00Z')

  it('sin fila → valor por defecto', () => {
    expect(getRule('orders.max_qty_per_product', rows, { at: now })).toBe(10)
  })

  it('la regla de la tienda gana a la global', () => {
    expect(getRule('tax.rate_ppm', rows, { storeId: STORE, at: now })).toBe(66_250)
    expect(getRule('tax.rate_ppm', rows, { storeId: OTHER_STORE, at: now })).toBe(70_000)
    expect(getRule('tax.rate_ppm', rows, { at: now })).toBe(70_000)
  })

  it('respeta la fecha de vigencia', () => {
    expect(getRule('tax.rate_ppm', rows, { storeId: STORE, at: new Date('2027-01-02T00:00:00Z') })).toBe(
      68_000,
    )
  })

  it('una regla global aplica a todas las tiendas', () => {
    expect(getRule('time.slot_minutes', rows, { storeId: STORE, at: now })).toBe(30)
  })

  it('un valor guardado inválido usa el defecto y avisa', () => {
    const onInvalid = vi.fn()
    const bad: StoredRule[] = [
      { key: 'time.slot_minutes', store_id: null, value: 7, effective_from: '2026-01-01T00:00:00Z' },
    ]
    expect(getRule('time.slot_minutes', bad, { at: now, onInvalid })).toBe(60)
    expect(onInvalid).toHaveBeenCalledWith('time.slot_minutes', 7)
  })
})

describe('snapshot, reglas públicas y validación', () => {
  it('el snapshot trae todas las reglas', () => {
    const snap = snapshotRules([])
    expect(Object.keys(snap).sort()).toEqual(Object.keys(RULES).sort())
    expect(snap['tax.rate_ppm']).toBe(66_250)
  })

  it('las reglas privadas no llegan al navegador', () => {
    const pub = publicRules([])
    expect(pub).toHaveProperty(['tips.presets_ppm'])
    expect(pub).not.toHaveProperty(['notifications.order_recipients'])
    expect(pub).not.toHaveProperty(['promos.allow_stacking'])
  })

  it('valida lo que guarda el admin', () => {
    expect(validateRuleValue('time.slot_minutes', 45)).toEqual({ ok: true, value: 45 })
    expect(validateRuleValue('time.slot_minutes', 50).ok).toBe(false)
    expect(validateRuleValue('tax.rate_ppm', 3_000_000).ok).toBe(false)
    expect(validateRuleValue('time.cutoff_local', '25:00').ok).toBe(false)
    expect(validateRuleValue('notifications.order_recipients', ['owner@atalia.cafe']).ok).toBe(true)
  })

  it('isRuleKey', () => {
    expect(isRuleKey('tax.rate_ppm')).toBe(true)
    expect(isRuleKey('tax.nope')).toBe(false)
    expect(isRuleKey('toString')).toBe(false)
  })
})
