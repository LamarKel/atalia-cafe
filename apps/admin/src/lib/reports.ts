// Cálculos de los reportes, sin React (probados aparte). Montos en centavos; días y horas en la zona de la tienda.

export interface PaidOrder {
  paid_at: string
  total_cents: number
  tax_cents: number
  refunded_cents: number
  payment_method: string | null
  pickup: { name_es: string | null; name_en: string } | null
  items: Array<{ product_name_snapshot: string; quantity: number; line_total_cents: number }>
}

export interface Report {
  orders: number
  salesCents: number
  taxCents: number
  refundedCents: number
  avgCents: number
  byDay: Array<{ day: string; orders: number; salesCents: number }>
  byHour: Array<{ hour: number; orders: number }>
  top: Array<{ name: string; qty: number; salesCents: number }>
  methods: Array<{ method: string; orders: number; salesCents: number }>
}

export const localDay = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso))
export const localHour = (iso: string, tz: string) =>
  Number(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(
      new Date(iso),
    ),
  )

/** Todos los días entre dos fechas (incluidos), para que los días sin ventas también aparezcan. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  const d = new Date(`${from}T12:00:00Z`)
  const end = new Date(`${to}T12:00:00Z`)
  while (d <= end && out.length < 400) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

export function buildReport(orders: readonly PaidOrder[], from: string, to: string, tz: string): Report {
  const net = (o: PaidOrder) => o.total_cents - o.refunded_cents
  const salesCents = orders.reduce((s, o) => s + net(o), 0)
  const byDayMap = new Map(daysBetween(from, to).map((d) => [d, { day: d, orders: 0, salesCents: 0 }]))
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0 }))
  const top = new Map<string, { name: string; qty: number; salesCents: number }>()
  const methods = new Map<string, { method: string; orders: number; salesCents: number }>()
  for (const o of orders) {
    const day = byDayMap.get(localDay(o.paid_at, tz))
    if (day) {
      day.orders++
      day.salesCents += net(o)
    }
    const h = byHour[localHour(o.paid_at, tz)]
    if (h) h.orders++
    const m = methods.get(o.payment_method ?? 'other') ?? {
      method: o.payment_method ?? 'other',
      orders: 0,
      salesCents: 0,
    }
    m.orders++
    m.salesCents += net(o)
    methods.set(m.method, m)
    for (const i of o.items) {
      const p = top.get(i.product_name_snapshot) ?? { name: i.product_name_snapshot, qty: 0, salesCents: 0 }
      p.qty += i.quantity
      p.salesCents += i.line_total_cents
      top.set(p.name, p)
    }
  }
  return {
    orders: orders.length,
    salesCents,
    taxCents: orders.reduce((s, o) => s + o.tax_cents, 0),
    refundedCents: orders.reduce((s, o) => s + o.refunded_cents, 0),
    avgCents: orders.length === 0 ? 0 : Math.round(salesCents / orders.length),
    byDay: [...byDayMap.values()],
    byHour,
    top: [...top.values()].sort((a, b) => b.qty - a.qty || b.salesCents - a.salesCents).slice(0, 10),
    methods: [...methods.values()].sort((a, b) => b.salesCents - a.salesCents),
  }
}

/** CSV con una fila por día (abre bien en Excel y Google Sheets). Montos en dólares con 2 decimales. */
export function reportCsv(report: Report, headers: { day: string; orders: string; sales: string }): string {
  const rows = [
    [headers.day, headers.orders, headers.sales],
    ...report.byDay.map((d) => [d.day, String(d.orders), (d.salesCents / 100).toFixed(2)]),
  ]
  return (
    '﻿' +
    rows
      .map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
      .join('\r\n')
  )
}
