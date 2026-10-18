import { describe, expect, it } from 'vitest'
import { buildReport, daysBetween, reportCsv, type PaidOrder } from './reports'

const TZ = 'America/New_York'
const order = (paid_at: string, total: number, over: Partial<PaidOrder> = {}): PaidOrder => ({
  paid_at,
  total_cents: total,
  tax_cents: Math.round(total * 0.06),
  refunded_cents: 0,
  payment_method: 'card',
  pickup: null,
  items: [{ product_name_snapshot: 'Latte', quantity: 2, line_total_cents: total }],
  ...over,
})

describe('reportes', () => {
  it('incluye los días sin ventas', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ])
  })

  it('agrupa por día y hora de la tienda y descuenta reembolsos', () => {
    const r = buildReport(
      [
        order('2026-10-18T13:30:00Z', 1000), // 9:30 en NJ
        order('2026-10-19T03:30:00Z', 2000, { refunded_cents: 500 }), // 23:30 del 18 en NJ
        order('2026-10-19T15:00:00Z', 900, { payment_method: 'apple_pay' }),
      ],
      '2026-10-18',
      '2026-10-19',
      TZ,
    )
    expect(r.orders).toBe(3)
    expect(r.salesCents).toBe(3400)
    expect(r.refundedCents).toBe(500)
    expect(r.avgCents).toBe(1133)
    expect(r.byDay).toEqual([
      { day: '2026-10-18', orders: 2, salesCents: 2500 },
      { day: '2026-10-19', orders: 1, salesCents: 900 },
    ])
    expect(r.byHour[9]?.orders).toBe(1)
    expect(r.byHour[23]?.orders).toBe(1)
    expect(r.top[0]).toEqual({ name: 'Latte', qty: 6, salesCents: 3900 })
    expect(r.methods.map((m) => m.method)).toEqual(['card', 'apple_pay'])
  })

  it('CSV con BOM, encabezados y dólares', () => {
    const r = buildReport([order('2026-10-18T13:30:00Z', 1250)], '2026-10-18', '2026-10-18', TZ)
    expect(reportCsv(r, { day: 'Día', orders: 'Pedidos', sales: 'Ventas' })).toBe(
      '﻿Día,Pedidos,Ventas\r\n2026-10-18,1,12.50',
    )
  })
})
