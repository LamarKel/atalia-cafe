// Reportes: ventas pagadas del período (netas de reembolsos), por día y por hora, lo más vendido, métodos de
// pago y CSV. Gráficas de una sola serie (sin leyenda: el título la nombra), con tooltip al pasar o enfocar y
// tabla equivalente.
import { cents, formatUSD } from '@atalia/shared/money'
import { Button } from '@atalia/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildReport, localDay, reportCsv, type PaidOrder, type Report } from '../../lib/reports'
import { supabase } from '../../lib/supabase'
import type { AdminKey } from '../../i18n'
import { inputClass } from '../components/Fields'
import { useI18n } from '../i18n-context'

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

type Preset = 'today' | '7d' | '30d' | 'month'

function rangeFor(preset: Preset, tz: string): { from: string; to: string } {
  const today = localDay(new Date().toISOString(), tz)
  const minus = (n: number) => {
    const d = new Date(`${today}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() - n)
    return d.toISOString().slice(0, 10)
  }
  if (preset === 'today') return { from: today, to: today }
  if (preset === '7d') return { from: minus(6), to: today }
  if (preset === '30d') return { from: minus(29), to: today }
  return { from: `${today.slice(0, 8)}01`, to: today }
}

export function Reports() {
  const { t, locale } = useI18n()
  const [tz, setTz] = useState('America/New_York')
  const [preset, setPreset] = useState<Preset | null>('7d')
  const [range, setRange] = useState(() => rangeFor('7d', 'America/New_York'))
  const [orders, setOrders] = useState<PaidOrder[] | null>(null)
  const [failed, setFailed] = useState(false)
  const usd = (v: number) => formatUSD(cents(v), locale)

  useEffect(() => {
    void supabase
      .from('stores')
      .select('timezone')
      .order('sort_order')
      .limit(1)
      .maybeSingle<{ timezone: string }>()
      .then(({ data }) => {
        if (data) {
          setTz(data.timezone)
          setRange(rangeFor('7d', data.timezone))
        }
      })
  }, [])

  const load = useCallback(async () => {
    setFailed(false)
    setOrders(null)
    // Margen de un día a cada lado por la zona horaria; el filtro exacto lo hace buildReport.
    const from = new Date(`${range.from}T00:00:00Z`)
    from.setUTCDate(from.getUTCDate() - 1)
    const to = new Date(`${range.to}T23:59:59Z`)
    to.setUTCDate(to.getUTCDate() + 1)
    const { data, error } = await supabase
      .from('orders')
      .select(
        'paid_at, total_cents, tax_cents, refunded_cents, payment_method, pickup:pickup_locations(name_es, name_en), items:order_items(product_name_snapshot, quantity, line_total_cents)',
      )
      .in('payment_status', ['paid', 'partially_refunded', 'refunded'])
      .gte('paid_at', from.toISOString())
      .lte('paid_at', to.toISOString())
      .limit(5000)
      .returns<PaidOrder[]>()
    if (error) setFailed(true)
    else
      setOrders(
        data.filter((o) => localDay(o.paid_at, tz) >= range.from && localDay(o.paid_at, tz) <= range.to),
      )
  }, [range, tz])
  useEffect(() => void load(), [load])

  const report: Report | null = useMemo(
    () => (orders === null ? null : buildReport(orders, range.from, range.to, tz)),
    [orders, range, tz],
  )

  const download = () => {
    if (report === null) return
    const csv = reportCsv(report, { day: t('r.day'), orders: t('r.orders'), sales: t('r.sales') })
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `atalia-ventas-${range.from}-${range.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const intl = locale === 'es' ? 'es-US' : 'en-US'
  const dayLabel = (d: string, short = false) =>
    new Intl.DateTimeFormat(
      intl,
      short
        ? { day: 'numeric', month: 'short', timeZone: 'UTC' }
        : { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' },
    ).format(new Date(`${d}T12:00:00Z`))
  const hourLabel = (h: number) =>
    new Intl.DateTimeFormat(intl, { hour: 'numeric', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2026, 0, 1, h)),
    )

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 tabIndex={-1} className="font-heading text-3xl font-bold md:text-4xl">
          {t('r.title')}
        </h1>
        <Button variant="outline" onClick={download} disabled={report === null || report.orders === 0}>
          {t('r.export')}
        </Button>
      </div>

      {/* Filtros en una fila arriba de todo */}
      <div className="mt-5 flex flex-wrap items-end gap-3 rounded-3xl bg-white p-4">
        <div role="radiogroup" aria-label={t('r.range')} className="flex flex-wrap gap-2">
          {(['today', '7d', '30d', 'month'] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={preset === p}
              onClick={() => {
                setPreset(p)
                setRange(rangeFor(p, tz))
              }}
              className={`min-h-11 rounded-full border px-4 text-sm font-medium ${preset === p ? 'border-secondary bg-secondary text-white' : 'border-dark/15 bg-white'}`}
            >
              {t(`r.${p}` as AdminKey)}
            </button>
          ))}
        </div>
        <label className="text-sm font-medium">
          {t('r.from')}
          <input
            type="date"
            value={range.from}
            max={range.to}
            onChange={(e) => {
              setPreset(null)
              setRange({ ...range, from: e.target.value })
            }}
            className={`${inputClass} mt-1 border-dark/15`}
          />
        </label>
        <label className="text-sm font-medium">
          {t('r.to')}
          <input
            type="date"
            value={range.to}
            min={range.from}
            onChange={(e) => {
              setPreset(null)
              setRange({ ...range, to: e.target.value })
            }}
            className={`${inputClass} mt-1 border-dark/15`}
          />
        </label>
      </div>

      {failed && (
        <p role="alert" className="mt-6 rounded-2xl bg-blush px-4 py-3 text-sm">
          {t('dash.error')}
        </p>
      )}

      {report === null ? (
        !failed && (
          <p role="status" className="mt-10 text-center text-muted">
            {t('cat.loading')}
          </p>
        )
      ) : (
        <>
          <ul className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              [t('r.sales'), usd(report.salesCents)],
              [t('r.orders'), String(report.orders)],
              [t('r.avg'), usd(report.avgCents)],
              [t('r.tax'), usd(report.taxCents)],
            ].map(([label, value]) => (
              <li key={label} className="rounded-3xl bg-white p-5">
                <p className="text-sm text-muted">{label}</p>
                <p className="mt-2 font-heading text-3xl font-bold tabular-nums">{value}</p>
              </li>
            ))}
          </ul>
          {report.refundedCents > 0 && (
            <p className="mt-2 text-sm text-muted">
              {t('r.refunded')}: <span className="tabular-nums">{usd(report.refundedCents)}</span>
            </p>
          )}

          {report.orders === 0 ? (
            <p className="mt-6 rounded-3xl bg-white p-8 text-center text-muted">{t('r.no_data')}</p>
          ) : (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <BarChart
                title={t('r.by_day')}
                summary={t('r.chart_day')}
                data={report.byDay.map((d) => ({
                  key: d.day,
                  label: dayLabel(d.day, true),
                  long: dayLabel(d.day),
                  value: d.salesCents,
                  display: usd(d.salesCents),
                }))}
                columns={[t('r.day'), t('r.sales')]}
              />
              <BarChart
                title={t('r.by_hour')}
                summary={t('r.chart_hour')}
                data={report.byHour
                  .filter((h) => h.hour >= 6 && h.hour <= 22)
                  .map((h) => ({
                    key: String(h.hour),
                    label: hourLabel(h.hour),
                    long: hourLabel(h.hour),
                    value: h.orders,
                    display: String(h.orders),
                  }))}
                columns={[t('r.hour'), t('r.orders')]}
              />
              <section className="rounded-3xl bg-white p-5 md:p-6">
                <h2 className="font-heading text-xl font-bold">{t('r.top')}</h2>
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted">
                      <th scope="col" className="py-2 font-medium">
                        {t('r.product')}
                      </th>
                      <th scope="col" className="py-2 text-right font-medium">
                        {t('r.qty')}
                      </th>
                      <th scope="col" className="py-2 text-right font-medium">
                        {t('r.sales')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark/10">
                    {report.top.map((p) => (
                      <tr key={p.name}>
                        <td className="py-2">{p.name}</td>
                        <td className="py-2 text-right tabular-nums">{p.qty}</td>
                        <td className="py-2 text-right tabular-nums">{usd(p.salesCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <section className="rounded-3xl bg-white p-5 md:p-6">
                <h2 className="font-heading text-xl font-bold">{t('r.methods')}</h2>
                <table className="mt-3 w-full text-sm">
                  <tbody className="divide-y divide-dark/10">
                    {report.methods.map((m) => (
                      <tr key={m.method}>
                        <th scope="row" className="py-2 text-left font-normal">
                          {[
                            'card',
                            'apple_pay',
                            'google_pay',
                            'klarna',
                            'afterpay_clearpay',
                            'affirm',
                          ].includes(m.method)
                            ? capitalize(t(`pay.${m.method}` as AdminKey))
                            : '—'}
                        </th>
                        <td className="py-2 text-right tabular-nums">{m.orders}</td>
                        <td className="py-2 text-right tabular-nums">{usd(m.salesCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  )
}

interface Bar {
  key: string
  label: string
  long: string
  value: number
  display: string
}

/** Barras verticales de una serie: punta redondeada de 4 px, 2 px entre barras, tooltip al pasar o enfocar. */
function BarChart(props: { title: string; summary: string; data: Bar[]; columns: [string, string] }) {
  const { t } = useI18n()
  const [active, setActive] = useState<string | null>(null)
  const [table, setTable] = useState(false)
  const max = Math.max(1, ...props.data.map((d) => d.value))
  const best = props.data.reduce<Bar | null>((a, b) => (a === null || b.value > a.value ? b : a), null)
  // Pocas etiquetas en el eje para que no choquen
  const every = Math.max(1, Math.ceil(props.data.length / 8))
  return (
    <section className="rounded-3xl bg-white p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-heading text-xl font-bold">{props.title}</h2>
        <button
          type="button"
          onClick={() => setTable((v) => !v)}
          aria-expanded={table}
          className="min-h-11 px-2 text-sm font-medium text-secondary underline underline-offset-2"
        >
          {table ? t('r.hide_table') : t('r.show_table')}
        </button>
      </div>
      {table ? (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th scope="col" className="py-2 font-medium">
                {props.columns[0]}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {props.columns[1]}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark/10">
            {props.data.map((d) => (
              <tr key={d.key}>
                <td className="py-2">{d.long}</td>
                <td className="py-2 text-right tabular-nums">{d.display}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <figure className="mt-4">
          <figcaption className="sr-only">{props.summary}</figcaption>
          {/* Etiqueta directa solo del valor más alto (no un número en cada barra) */}
          {best !== null && best.value > 0 && (
            <p className="mb-2 text-sm text-muted">
              ↑ {best.long}: <span className="font-semibold tabular-nums text-dark">{best.display}</span>
            </p>
          )}
          <div
            className="relative flex h-48 items-end gap-0.5 border-b border-dark/15"
            onMouseLeave={() => setActive(null)}
          >
            {props.data.map((d) => {
              const pct = (d.value / max) * 100
              const on = active === d.key
              return (
                <div
                  key={d.key}
                  tabIndex={0}
                  role="img"
                  aria-label={`${d.long}: ${d.display}`}
                  onMouseEnter={() => setActive(d.key)}
                  onFocus={() => setActive(d.key)}
                  onBlur={() => setActive(null)}
                  // El área para pasar el mouse es toda la columna, más grande que la barra
                  className="group relative flex h-full flex-1 items-end focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
                >
                  <div
                    className={`w-full rounded-t ${on ? 'bg-dark' : 'bg-secondary'}`}
                    style={{ height: `${String(Math.max(pct, d.value > 0 ? 2 : 0))}%` }}
                  />
                  {on && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-dark px-2.5 py-1.5 text-xs text-white shadow">
                      {d.long}: <span className="font-semibold tabular-nums">{d.display}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div aria-hidden="true" className="mt-1 flex gap-0.5 text-[11px] text-muted">
            {props.data.map((d, i) => (
              <span key={d.key} className="flex-1 overflow-visible whitespace-nowrap text-center">
                {i % every === 0 ? d.label : ''}
              </span>
            ))}
          </div>
        </figure>
      )}
    </section>
  )
}
