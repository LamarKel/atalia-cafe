// Inicio del panel: lo del día de un vistazo (pedidos, ventas, en preparación, cotizaciones nuevas) y las
// próximas recogidas. Lo lee la RLS con la sesión del usuario.
import { cents, formatUSD } from '@atalia/shared/money'
import { ButtonLink } from '@atalia/ui'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useI18n } from '../i18n-context'

interface Upcoming {
  code: string
  customer_name: string
  scheduled_for: string
  status: string
  total_cents: number
}

interface Stats {
  ordersToday: number
  salesTodayCents: number
  inProgress: number
  newQuotes: number
  upcoming: Upcoming[]
  timezone: string
}

/** Inicio del día en la zona de la tienda, como ISO (para filtrar created_at). */
function startOfDay(timezone: string, now = new Date()): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now) // 2026-10-18
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' })
    .formatToParts(now)
    .find((p) => p.type === 'timeZoneName')
    ?.value.replace('GMT', '')
  return new Date(`${day}T00:00:00${offset === '' || offset === undefined ? 'Z' : offset}`).toISOString()
}

async function load(): Promise<Stats> {
  const { data: store } = await supabase
    .from('stores')
    .select('timezone')
    .order('sort_order')
    .limit(1)
    .maybeSingle<{ timezone: string }>()
  const timezone = store?.timezone ?? 'America/New_York'
  const since = startOfDay(timezone)
  const [today, progress, quotes, upcoming] = await Promise.all([
    supabase.from('orders').select('total_cents, payment_status').gte('created_at', since),
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .in('status', ['confirmed', 'preparing', 'ready']),
    supabase.from('quote_requests').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    supabase
      .from('orders')
      .select('code, customer_name, scheduled_for, status, total_cents')
      .in('status', ['confirmed', 'preparing', 'ready'])
      .gte('scheduled_for', new Date(Date.now() - 2 * 3600_000).toISOString())
      .order('scheduled_for')
      .limit(6),
  ])
  const error = today.error ?? progress.error ?? quotes.error ?? upcoming.error
  if (error) throw new Error(error.message)
  const paid = (today.data as Array<{ total_cents: number; payment_status: string }>).filter(
    (o) => o.payment_status === 'paid',
  )
  return {
    ordersToday: paid.length,
    salesTodayCents: paid.reduce((sum, o) => sum + o.total_cents, 0),
    inProgress: progress.count ?? 0,
    newQuotes: quotes.count ?? 0,
    upcoming: upcoming.data as Upcoming[],
    timezone,
  }
}

export function Dashboard({ email }: { email: string }) {
  const { t, locale } = useI18n()
  const [stats, setStats] = useState<Stats | null>(null)
  const [failed, setFailed] = useState(false)

  const refresh = useCallback(() => {
    setFailed(false)
    load().then(setStats, () => setFailed(true))
  }, [])
  useEffect(refresh, [refresh])

  const intl = locale === 'es' ? 'es-US' : 'en-US'
  const usd = (v: number) => formatUSD(cents(v), locale)
  const when = (iso: string, tz: string) =>
    new Intl.DateTimeFormat(intl, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz,
    }).format(new Date(iso))

  const cards: Array<{ label: string; value: string; tone: string }> =
    stats === null
      ? []
      : [
          { label: t('dash.orders_today'), value: String(stats.ordersToday), tone: 'bg-sage-soft' },
          { label: t('dash.sales_today'), value: usd(stats.salesTodayCents), tone: 'bg-sand' },
          { label: t('dash.in_progress'), value: String(stats.inProgress), tone: 'bg-blush' },
          { label: t('dash.new_quotes'), value: String(stats.newQuotes), tone: 'bg-white' },
        ]

  return (
    <div className="mx-auto max-w-6xl">
      <p className="text-muted">{t('dash.today')}</p>
      <h1 tabIndex={-1} className="font-heading text-3xl font-bold text-dark md:text-4xl">
        {t('dash.greeting')}, {email.split('@')[0]}
      </h1>

      {failed && (
        <div
          role="alert"
          className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-blush px-4 py-3 text-sm"
        >
          {t('dash.error')}
          <button type="button" onClick={refresh} className="min-h-11 font-semibold text-secondary underline">
            {t('dash.retry')}
          </button>
        </div>
      )}

      <ul className="mt-6 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4" aria-busy={stats === null}>
        {(stats === null ? Array.from({ length: 4 }, () => null) : cards).map((c, i) => (
          <li
            key={i}
            className={`rounded-3xl p-5 ${c?.tone ?? 'bg-white'} ${c === null ? 'motion-safe:animate-pulse' : ''}`}
          >
            <p className="text-sm text-muted">{c?.label ?? ' '}</p>
            <p className="mt-2 font-heading text-3xl font-bold tabular-nums text-dark">{c?.value ?? ' '}</p>
          </li>
        ))}
      </ul>

      <section aria-labelledby="upcoming-title" className="mt-8 rounded-3xl bg-white p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="upcoming-title" className="font-heading text-2xl font-bold">
            {t('dash.upcoming')}
          </h2>
          <ButtonLink href="#/orders" variant="outline" className="!min-h-11 !py-2 text-sm">
            {t('dash.view_orders')}
          </ButtonLink>
        </div>
        {stats !== null && stats.upcoming.length === 0 && (
          <p className="mt-4 text-muted">{t('dash.no_upcoming')}</p>
        )}
        {stats !== null && stats.upcoming.length > 0 && (
          <ul className="mt-4 divide-y divide-dark/10">
            {stats.upcoming.map((o) => (
              <li key={o.code} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {o.code} · {o.customer_name}
                  </p>
                  <p className="text-sm text-muted">{when(o.scheduled_for, stats.timezone)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-sage-soft px-3 py-1 text-xs font-semibold">
                    {t(`status.${o.status}` as Parameters<typeof t>[0])}
                  </span>
                  <span className="font-semibold tabular-nums text-secondary">{usd(o.total_cents)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
