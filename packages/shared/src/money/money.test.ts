import { describe, expect, it } from 'vitest'
import {
  MoneyError,
  parsePercent,
  applyPpm,
  cents,
  centsSchema,
  computeOrderTotals,
  formatPpm,
  formatUSD,
  parseUSD,
  ppm,
} from './index'

describe('cents / ppm', () => {
  it('acepta enteros dentro del rango', () => {
    expect(cents(0)).toBe(0)
    expect(cents(1250)).toBe(1250)
    expect(ppm(66250)).toBe(66250)
  })

  it.each([-1, 12.5, Number.NaN, Infinity, 100_000_001])('rechaza %s centavos (A9)', (value) => {
    expect(() => cents(value)).toThrow(MoneyError)
  })

  it('rechaza porcentajes fuera de 0–100 %', () => {
    expect(() => ppm(1_000_001)).toThrow(MoneyError)
    expect(() => ppm(-1)).toThrow(MoneyError)
  })

  it('centsSchema valida y marca el tipo', () => {
    expect(centsSchema.parse(500)).toBe(500)
    expect(centsSchema.safeParse(-5).success).toBe(false)
    expect(centsSchema.safeParse(1.5).success).toBe(false)
  })
})

describe('applyPpm (redondeo medio centavo hacia arriba)', () => {
  it('impuesto de NJ 6.625 % sobre $105.00', () => {
    // 10500 × 0.06625 = 695.625 → 696
    expect(applyPpm(cents(10500), ppm(66250))).toBe(696)
  })

  it('redondea .5 hacia arriba y .49 hacia abajo', () => {
    expect(applyPpm(cents(100), ppm(5000))).toBe(1) // 0.5 → 1
    expect(applyPpm(cents(100), ppm(4900))).toBe(0) // 0.49 → 0
  })

  it('no pierde precisión con montos grandes', () => {
    expect(applyPpm(cents(100_000_000), ppm(1_000_000))).toBe(100_000_000)
    expect(applyPpm(cents(99_999_999), ppm(66250))).toBe(6_625_000)
  })

  it('nunca produce el error clásico de los decimales binarios', () => {
    // 0.1 + 0.2 en dólares; en centavos es exacto
    expect(cents(10) + cents(20)).toBe(30)
  })
})

describe('parseUSD (lo que escribe el admin)', () => {
  it.each([
    ['12.50', 1250],
    ['12.5', 1250],
    ['12', 1200],
    ['$12.50', 1250],
    ['$ 7', 700],
    ['1,250.00', 125000],
    ['0.99', 99],
    ['  45.10  ', 4510],
  ])('"%s" → %i', (input, expected) => {
    expect(parseUSD(input)).toBe(expected)
  })

  it.each(['12,50', '1.250', '-5', 'abc', '', '12.', '.50', '1,25.00', '12.505'])('rechaza "%s"', (input) => {
    expect(() => parseUSD(input)).toThrow(MoneyError)
  })
})

describe('formatUSD / formatPpm', () => {
  it('muestra dólares solo al final', () => {
    expect(formatUSD(cents(1250))).toBe('$12.50')
    expect(formatUSD(cents(125000))).toBe('$1,250.00')
    expect(formatUSD(cents(0))).toBe('$0.00')
  })

  it('formato en español de EE. UU.', () => {
    expect(formatUSD(cents(1250), 'es')).toContain('12.50')
  })

  it('porcentaje legible', () => {
    expect(formatPpm(ppm(66250))).toBe('6.625%')
  })
})

describe('computeOrderTotals (orden fijo A3)', () => {
  const tax = ppm(66250)

  it('pedido de la prueba de BD: bandeja $85 + picadera $20', () => {
    const t = computeOrderTotals({
      lines: [
        { unitPriceCents: cents(8500), quantity: 1 },
        { unitPriceCents: cents(2000), quantity: 1 },
      ],
      taxRatePpm: tax,
    })
    expect(t).toEqual({
      subtotalCents: 10500,
      discountCents: 0,
      taxCents: 696,
      shippingCents: 0,
      tipCents: 0,
      totalCents: 11196, // el mismo total que verifica db/tests/v3_test.sql
    })
  })

  it('el impuesto se calcula sobre el subtotal menos el descuento, una sola vez', () => {
    const t = computeOrderTotals({
      lines: [{ unitPriceCents: cents(1000), quantity: 3 }],
      discount: { type: 'percentage', ppm: ppm(100_000) },
      taxRatePpm: tax,
    })
    expect(t.subtotalCents).toBe(3000)
    expect(t.discountCents).toBe(300)
    expect(t.taxCents).toBe(applyPpm(cents(2700), tax))
  })

  it('la propina no paga impuesto (B9)', () => {
    const sinPropina = computeOrderTotals({
      lines: [{ unitPriceCents: cents(2000), quantity: 1 }],
      taxRatePpm: tax,
    })
    const conPropina = computeOrderTotals({
      lines: [{ unitPriceCents: cents(2000), quantity: 1 }],
      taxRatePpm: tax,
      tipCents: cents(300),
    })
    expect(conPropina.taxCents).toBe(sinPropina.taxCents)
    expect(conPropina.totalCents).toBe(sinPropina.totalCents + 300)
  })

  it('el descuento nunca supera el subtotal (A10)', () => {
    const t = computeOrderTotals({
      lines: [{ unitPriceCents: cents(500), quantity: 1 }],
      discount: { type: 'fixed', cents: cents(2000) },
      taxRatePpm: tax,
    })
    expect(t.discountCents).toBe(500)
    expect(t.taxCents).toBe(0)
    expect(t.totalCents).toBe(0)
  })

  it('el total cuadra con sus partes (mismo CHECK que la BD)', () => {
    for (let i = 1; i <= 200; i++) {
      const t = computeOrderTotals({
        lines: [
          { unitPriceCents: cents(i * 37), quantity: (i % 5) + 1 },
          { unitPriceCents: cents(i * 113), quantity: 1 },
        ],
        discount: { type: 'percentage', ppm: ppm((i * 7919) % 300_000) },
        taxRatePpm: tax,
        tipCents: cents(i * 3),
      })
      expect(t.totalCents).toBe(t.subtotalCents - t.discountCents + t.taxCents + t.shippingCents + t.tipCents)
    }
  })

  it('rechaza un pedido sin líneas o con cantidades inválidas', () => {
    expect(() => computeOrderTotals({ lines: [], taxRatePpm: tax })).toThrow(MoneyError)
    expect(() =>
      computeOrderTotals({ lines: [{ unitPriceCents: cents(100), quantity: -1 }], taxRatePpm: tax }),
    ).toThrow(MoneyError)
  })
})

describe('parsePercent', () => {
  it('convierte lo que escribe el admin a ppm sin floats', () => {
    expect(parsePercent('6.625')).toBe(66_250)
    expect(parsePercent('15 %')).toBe(150_000)
    expect(parsePercent('0')).toBe(0)
    expect(parsePercent('100')).toBe(1_000_000)
    expect(parsePercent('33.3333')).toBe(333_333)
  })
  it('rechaza formatos raros y más de 100 %', () => {
    expect(() => parsePercent('6,5')).toThrow()
    expect(() => parsePercent('abc')).toThrow()
    expect(() => parsePercent('6.12345')).toThrow()
    expect(() => parsePercent('150')).toThrow()
  })
})
