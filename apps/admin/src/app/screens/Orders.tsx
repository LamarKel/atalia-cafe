// Pedidos (fase 2): tablero en vivo Confirmado → Preparando → Listo, historial, detalle y aviso de pedidos
// nuevos. El equipo solo mueve el estado operativo; la BD valida cada transición (orders_guard) y guarda el
// historial (orders_after_change). Supabase Realtime avisa de cada cambio sin recargar.
import { cents, formatUSD } from '@atalia/shared/money'
import { Button, Dialog, useToast } from '@atalia/ui'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BOARD_COLUMNS,
  canMarkNoShow,
  DONE_STATUSES,
  groupByColumn,
  matchesDay,
  matchesSearch,
  minutesUntil,
  NEXT,
  PREVIOUS,
  type DayFilter,
  type OrderStatus,
} from '../../lib/orders'
import { supabase } from '../../lib/supabase'
import type { AdminKey } from '../../i18n'
import { useI18n } from '../i18n-context'

interface OrderItem {
  id: string
  product_name_snapshot: string
  size_label_snapshot: string | null
  quantity: number
  line_total_cents: number
  notes: string | null
  extras: Array<{ name: string; price_cents: number }>
  components: Array<{ piece_label_snapshot: string; qty: number }>
}

interface Order {
  id: string
  code: string
  status: OrderStatus
  payment_status: string
  payment_method: string | null
  scheduled_for: string
  created_at: string
  customer_name: string
  customer_phone: string
  customer_email: string
  note: string | null
  subtotal_cents: number
  discount_cents: number
  tax_cents: number
  tip_cents: number
  total_cents: number
  needs_review: boolean
  review_reason: string | null
  pickup: { name_es: string | null; name_en: string } | null
  items: OrderItem[]
}

const SELECT = `id, code, status, payment_status, payment_method, scheduled_for, created_at, customer_name,
  customer_phone, customer_email, note, subtotal_cents, discount_cents, tax_cents, tip_cents, total_cents,
  needs_review, review_reason,
  pickup:pickup_locations(name_es, name_en),
  items:order_items(id, product_name_snapshot, size_label_snapshot, quantity, line_total_cents, notes, extras,
    components:order_item_components(piece_label_snapshot, qty))`

const SOUND_KEY = 'atalia.admin.sound'
const statusKey = (s: string) => `status.${s}` as AdminKey
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const PAY_KEYS = ['card', 'apple_pay', 'google_pay', 'klarna', 'afterpay_clearpay', 'affirm'] as const
const payKey = (m: string | null): AdminKey | null =>
  m !== null && (PAY_KEYS as readonly string[]).includes(m) ? (`pay.${m}` as AdminKey) : null

/** Pitido corto para pedidos nuevos (Web Audio, sin archivos). */
function beep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.4)
  } catch {
    // Sin audio disponible: el aviso visual basta.
  }
}

export function Orders() {
  const { t, locale } = useI18n()
  const toast = useToast()
  const [tab, setTab] = useState<'board' | 'history'>('board')
  const [day, setDay] = useState<DayFilter>('today')
  const [query, setQuery] = useState('')
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [history, setHistory] = useState<Order[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [live, setLive] = useState(false)
  const [timezone, setTimezone] = useState('America/New_York')
  const [openId, setOpenId] = useState<string | null>(null)
  const [noShow, setNoShow] = useState<Order | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [sound, setSound] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) !== 'off'
    } catch {
      return true
    }
  })
  const soundRef = useRef(sound)
  soundRef.current = sound
  const [now, setNow] = useState(() => new Date())

  const intl = locale === 'es' ? 'es-US' : 'en-US'
  const usd = (v: number) => formatUSD(cents(v), locale)
  const time = (iso: string) =>
    new Intl.DateTimeFormat(intl, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    }).format(new Date(iso))

  const loadBoard = useCallback(async () => {
    setFailed(false)
    const [store, res] = await Promise.all([
      supabase
        .from('stores')
        .select('timezone')
        .order('sort_order')
        .limit(1)
        .maybeSingle<{ timezone: string }>(),
      supabase
        .from('orders')
        .select(SELECT)
        .in('status', [...BOARD_COLUMNS])
        .order('scheduled_for')
        .returns<Order[]>(),
    ])
    if (store.data) setTimezone(store.data.timezone)
    if (res.error) setFailed(true)
    else setOrders(res.data)
  }, [])

  const loadHistory = useCallback(async () => {
    const res = await supabase
      .from('orders')
      .select(SELECT)
      .in('status', [...DONE_STATUSES])
      .order('scheduled_for', { ascending: false })
      .limit(100)
      .returns<Order[]>()
    if (res.error) setFailed(true)
    else setHistory(res.data)
  }, [])

  useEffect(() => {
    void loadBoard()
  }, [loadBoard])
  useEffect(() => {
    if (tab === 'history' && history === null) void loadHistory()
  }, [tab, history, loadHistory])

  // Reloj para "en 15 min" / "10 min tarde"
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  // En vivo: cada cambio en orders trae la fila completa y la acomoda en el tablero.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    let stopped = false
    void (async () => {
      // El canal tiene que usar el token del usuario (aal2): con la clave anónima la RLS no manda nada.
      const { data } = await supabase.auth.getSession()
      if (stopped) return
      if (data.session !== null) await supabase.realtime.setAuth(data.session.access_token)
      channel = supabase
        .channel('admin-orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
          const id = (payload.new as { id?: string }).id ?? (payload.old as { id?: string }).id
          if (id === undefined) return
          void supabase
            .from('orders')
            .select(SELECT)
            .eq('id', id)
            .maybeSingle<Order>()
            .then(({ data }) => {
              if (data === null) return
              setOrders((prev) => {
                if (prev === null) return prev
                const was = prev.find((o) => o.id === id)
                const onBoard = (BOARD_COLUMNS as readonly string[]).includes(data.status)
                // Pedido nuevo = acaba de quedar pagado y confirmado
                if (was === undefined && data.status === 'confirmed') {
                  toast(t('orders.new_order', { code: data.code, name: data.customer_name }))
                  if (soundRef.current) beep()
                }
                const rest = prev.filter((o) => o.id !== id)
                return onBoard ? [...rest, data] : rest
              })
              if ((DONE_STATUSES as readonly string[]).includes(data.status)) setHistory(null)
            })
        })
        .subscribe((status) => setLive(status === 'SUBSCRIBED'))
    })()
    return () => {
      stopped = true
      if (channel !== null) void supabase.removeChannel(channel)
    }
  }, [t, toast])

  const move = async (order: Order, to: OrderStatus) => {
    setBusyId(order.id)
    const { error } = await supabase.from('orders').update({ status: to }).eq('id', order.id)
    setBusyId(null)
    if (error) {
      toast(t('orders.update_error'), { tone: 'error' })
      return
    }
    toast(t('orders.updated', { code: order.code, status: t(statusKey(to)) }))
    setOrders((prev) =>
      prev === null
        ? prev
        : (BOARD_COLUMNS as readonly string[]).includes(to)
          ? prev.map((o) => (o.id === order.id ? { ...o, status: to } : o))
          : prev.filter((o) => o.id !== order.id),
    )
    if (!(BOARD_COLUMNS as readonly string[]).includes(to)) setHistory(null)
  }

  const visible = useMemo(
    () => (orders ?? []).filter((o) => matchesDay(o, day, timezone, now) && matchesSearch(o, query)),
    [orders, day, timezone, now, query],
  )
  const columns = groupByColumn(visible)
  const opened = [...(orders ?? []), ...(history ?? [])].find((o) => o.id === openId) ?? null
  const pickupName = (o: Order) =>
    o.pickup === null ? null : locale === 'es' && o.pickup.name_es ? o.pickup.name_es : o.pickup.name_en

  const toggleSound = () => {
    const next = !sound
    setSound(next)
    try {
      localStorage.setItem(SOUND_KEY, next ? 'on' : 'off')
    } catch {
      // ignorar
    }
    if (next) beep()
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 tabIndex={-1} className="font-heading text-3xl font-bold text-dark md:text-4xl">
            {t('orders.title')}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted" role="status">
            <span
              aria-hidden="true"
              className={`size-2.5 rounded-full ${live ? 'bg-primary motion-safe:animate-pulse' : 'bg-disabled'}`}
            />
            {live ? t('orders.live') : t('orders.offline')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={sound}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-dark/15 bg-white px-4 text-sm font-medium hover:border-secondary"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M4 9v6h4l5 4V5L8 9H4Z" />
              {sound ? (
                <path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" />
              ) : (
                <path d="m17 9 4 6M21 9l-4 6" />
              )}
            </svg>
            {sound ? t('orders.sound_on') : t('orders.sound_off')}
          </button>
          <div
            role="tablist"
            aria-label={t('orders.title')}
            className="inline-flex rounded-full bg-white p-1"
          >
            {(['board', 'history'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`min-h-11 rounded-full px-4 text-sm font-medium ${tab === k ? 'bg-secondary text-white' : 'text-dark hover:bg-dark/5'}`}
              >
                {t(k === 'board' ? 'orders.board' : 'orders.history')}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <label className="relative block md:w-80">
          <span className="sr-only">{t('orders.search')}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('orders.search')}
            className="block min-h-11 w-full rounded-full border border-dark/15 bg-white px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          />
        </label>
        {tab === 'board' && (
          <div role="radiogroup" aria-label={t('orders.filter_day')} className="flex flex-wrap gap-2">
            {(['today', 'upcoming', 'all'] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={day === d}
                onClick={() => setDay(d)}
                className={`min-h-11 rounded-full border px-4 text-sm font-medium ${
                  day === d
                    ? 'border-secondary bg-secondary text-white'
                    : 'border-dark/15 bg-white text-dark hover:border-secondary'
                }`}
              >
                {t(
                  d === 'today'
                    ? 'orders.day_today'
                    : d === 'upcoming'
                      ? 'orders.day_upcoming'
                      : 'orders.day_all',
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {failed && (
        <div
          role="alert"
          className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-blush px-4 py-3 text-sm"
        >
          {t('orders.error')}
          <button
            type="button"
            onClick={() => void (tab === 'board' ? loadBoard() : loadHistory())}
            className="min-h-11 font-semibold text-secondary underline"
          >
            {t('dash.retry')}
          </button>
        </div>
      )}

      {tab === 'board' &&
        (orders === null ? (
          <p className="mt-10 text-center text-muted" role="status">
            {t('orders.loading')}
          </p>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {BOARD_COLUMNS.map((col) => (
              <section
                key={col}
                aria-labelledby={`col-${col}`}
                className="rounded-3xl bg-white/60 p-3 md:p-4"
              >
                <h2 id={`col-${col}`} className="flex items-center justify-between px-1 font-semibold">
                  {t(statusKey(col))}
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-sm tabular-nums">
                    {columns[col].length}
                  </span>
                </h2>
                {columns[col].length === 0 ? (
                  <p className="mt-3 rounded-2xl border border-dashed border-dark/15 p-6 text-center text-sm text-muted">
                    {t('orders.empty_column')}
                  </p>
                ) : (
                  <ul className="mt-3 grid gap-3">
                    {columns[col].map((o) => {
                      const mins = minutesUntil(o.scheduled_for, now)
                      const next = NEXT[o.status]
                      const prev = PREVIOUS[o.status]
                      const count = o.items.reduce((s, i) => s + i.quantity, 0)
                      return (
                        <li key={o.id} className="rounded-2xl bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => setOpenId(o.id)}
                              className="min-w-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
                            >
                              <p className="font-semibold">
                                {o.code} <span className="font-normal text-muted">· {o.customer_name}</span>
                              </p>
                              <p className="mt-0.5 text-sm text-muted">
                                {time(o.scheduled_for)}
                                {pickupName(o) !== null && ` · ${pickupName(o) ?? ''}`}
                              </p>
                            </button>
                            {Math.abs(mins) <= 180 && (
                              <span
                                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${mins < 0 ? 'bg-blush text-secondary' : 'bg-sage-soft text-dark'}`}
                              >
                                {mins < 0
                                  ? t('orders.late_min', { n: -mins })
                                  : t('orders.in_min', { n: mins })}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-sm">
                            {count === 1 ? t('orders.item_one') : t('orders.items', { n: count })} ·{' '}
                            <span className="font-semibold tabular-nums text-secondary">
                              {usd(o.total_cents)}
                            </span>
                          </p>
                          {o.needs_review && (
                            <p className="mt-2 rounded-xl bg-blush px-3 py-1.5 text-xs font-semibold text-secondary">
                              {t('orders.review')}
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {next !== undefined && (
                              <Button
                                size="md"
                                className="!min-h-11 !px-4 !py-2 text-sm"
                                loading={busyId === o.id}
                                loadingLabel={t('app.loading')}
                                onClick={() => void move(o, next)}
                              >
                                {t('orders.advance_to', { status: t(statusKey(next)) })}
                              </Button>
                            )}
                            {prev !== undefined && (
                              <Button
                                variant="outline"
                                size="md"
                                className="!min-h-11 !px-3 !py-2 text-sm"
                                onClick={() => void move(o, prev)}
                              >
                                {t('orders.undo', { status: t(statusKey(prev)) })}
                              </Button>
                            )}
                            <button
                              type="button"
                              onClick={() => setOpenId(o.id)}
                              className="min-h-11 px-2 text-sm font-medium text-secondary underline underline-offset-2"
                            >
                              {t('orders.details')}
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            ))}
          </div>
        ))}

      {tab === 'history' &&
        (history === null ? (
          <p className="mt-10 text-center text-muted" role="status">
            {t('orders.loading')}
          </p>
        ) : history.filter((o) => matchesSearch(o, query)).length === 0 ? (
          <p className="mt-6 rounded-3xl bg-white p-8 text-center text-muted">{t('orders.empty_history')}</p>
        ) : (
          <ul className="mt-6 divide-y divide-dark/10 rounded-3xl bg-white">
            {history
              .filter((o) => matchesSearch(o, query))
              .map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(o.id)}
                    className="flex min-h-14 w-full flex-wrap items-center justify-between gap-2 px-5 py-3 text-left hover:bg-dark/5"
                  >
                    <span>
                      <span className="font-semibold">{o.code}</span> · {o.customer_name}
                      <span className="block text-sm text-muted">{time(o.scheduled_for)}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="rounded-full bg-sand px-3 py-1 text-xs font-semibold">
                        {t(statusKey(o.status))}
                      </span>
                      <span className="font-semibold tabular-nums text-secondary">{usd(o.total_cents)}</span>
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        ))}

      {opened !== null && (
        <OrderDetail
          order={opened}
          timezone={timezone}
          pickupName={pickupName(opened)}
          onClose={() => setOpenId(null)}
          onMove={(to) => void move(opened, to)}
          onNoShow={() => setNoShow(opened)}
        />
      )}

      <Dialog
        open={noShow !== null}
        onClose={() => setNoShow(null)}
        title={t('orders.no_show')}
        closeLabel={t('orders.close')}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setNoShow(null)}>
              {t('orders.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (noShow !== null) void move(noShow, 'no_show')
                setNoShow(null)
                setOpenId(null)
              }}
            >
              {t('orders.confirm')}
            </Button>
          </div>
        }
      >
        <p className="mt-2">{noShow !== null && t('orders.no_show_confirm', { code: noShow.code })}</p>
      </Dialog>
    </div>
  )
}

function OrderDetail(props: {
  order: Order
  timezone: string
  pickupName: string | null
  onClose: () => void
  onMove: (to: OrderStatus) => void
  onNoShow: () => void
}) {
  const { t, locale } = useI18n()
  const { order: o } = props
  const usd = (v: number) => formatUSD(cents(v), locale)
  const intl = locale === 'es' ? 'es-US' : 'en-US'
  const full = (iso: string) =>
    new Intl.DateTimeFormat(intl, { dateStyle: 'full', timeStyle: 'short', timeZone: props.timezone }).format(
      new Date(iso),
    )
  const short = (iso: string) =>
    new Intl.DateTimeFormat(intl, {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: props.timezone,
    }).format(new Date(iso))
  const [timeline, setTimeline] = useState<Array<{
    status: string
    created_at: string
    note: string | null
  }> | null>(null)

  useEffect(() => {
    void supabase
      .from('order_status_history')
      .select('status, created_at, note')
      .eq('order_id', o.id)
      .order('created_at')
      .then(({ data }) => setTimeline((data as typeof timeline) ?? []))
  }, [o.id, o.status])

  const next = NEXT[o.status]
  const method = payKey(o.payment_method)
  const payLabel = method === null ? '—' : t(method)
  const rows: Array<[string, number]> = [
    [t('orders.subtotal'), o.subtotal_cents],
    ...(o.discount_cents > 0 ? ([[t('orders.discount'), -o.discount_cents]] as Array<[string, number]>) : []),
    [t('orders.tax'), o.tax_cents],
    ...(o.tip_cents > 0 ? ([[t('orders.tip'), o.tip_cents]] as Array<[string, number]>) : []),
  ]

  return (
    <Dialog
      open
      onClose={props.onClose}
      title={t('orders.detail_title', { code: o.code })}
      closeLabel={t('orders.close')}
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {canMarkNoShow(o.status) ? (
            <Button variant="outline" onClick={props.onNoShow}>
              {t('orders.no_show')}
            </Button>
          ) : (
            <span />
          )}
          {next !== undefined && (
            <Button onClick={() => props.onMove(next)}>
              {t('orders.advance_to', { status: t(statusKey(next)) })}
            </Button>
          )}
        </div>
      }
    >
      <p className="mt-1">
        <span className="rounded-full bg-sage-soft px-3 py-1 text-xs font-semibold">
          {t(statusKey(o.status))}
        </span>
      </p>
      {o.needs_review && (
        <p role="alert" className="mt-4 rounded-xl bg-blush px-4 py-3 text-sm">
          {t('orders.review_reason', { reason: o.review_reason ?? '—' })}
        </p>
      )}

      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted">{t('orders.pickup')}</dt>
          <dd className="font-semibold">{capitalize(full(o.scheduled_for))}</dd>
          {props.pickupName !== null && <dd className="text-sm">{props.pickupName}</dd>}
        </div>
        <div>
          <dt className="text-sm text-muted">{t('orders.customer')}</dt>
          <dd className="font-semibold">{o.customer_name}</dd>
          <dd className="flex flex-wrap gap-x-3 text-sm">
            <a
              href={`tel:${o.customer_phone}`}
              className="inline-flex min-h-11 items-center text-secondary underline underline-offset-2"
            >
              {t('orders.call')} {o.customer_phone}
            </a>
            <a
              href={`mailto:${o.customer_email}`}
              className="inline-flex min-h-11 items-center break-all text-secondary underline underline-offset-2"
            >
              {o.customer_email}
            </a>
          </dd>
        </div>
      </dl>

      <h3 className="mt-6 font-semibold">{t('orders.items_title')}</h3>
      <ul className="mt-2 divide-y divide-dark/10 rounded-2xl border border-dark/10">
        {o.items.map((i) => (
          <li key={i.id} className="flex justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium">
                {i.quantity} × {i.product_name_snapshot}
                {i.size_label_snapshot !== null && (
                  <span className="text-muted"> · {i.size_label_snapshot}</span>
                )}
              </p>
              {i.extras.length > 0 && (
                <p className="text-sm text-muted">+ {i.extras.map((e) => e.name).join(', ')}</p>
              )}
              {i.components.length > 0 && (
                <p className="text-sm text-muted">
                  {i.components.map((c) => `${c.piece_label_snapshot} × ${String(c.qty)}`).join(', ')}
                </p>
              )}
              {i.notes !== null && <p className="mt-1 rounded-lg bg-sand px-2 py-1 text-sm">{i.notes}</p>}
            </div>
            <span className="shrink-0 tabular-nums">{usd(i.line_total_cents)}</span>
          </li>
        ))}
      </ul>

      {o.note !== null && (
        <>
          <h3 className="mt-6 font-semibold">{t('orders.note')}</h3>
          <p className="mt-2 rounded-2xl bg-sand px-4 py-3">{o.note}</p>
        </>
      )}

      <h3 className="mt-6 font-semibold">{t('orders.payment')}</h3>
      <dl className="mt-2 grid gap-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between">
            <dt className="text-muted">{label}</dt>
            <dd className="tabular-nums">{value < 0 ? `−${usd(-value)}` : usd(value)}</dd>
          </div>
        ))}
        <div className="flex justify-between border-t border-dark/10 pt-2 text-base font-semibold">
          <dt>{t('orders.total')}</dt>
          <dd className="tabular-nums text-secondary">{usd(o.total_cents)}</dd>
        </div>
        <p className="text-muted">
          {o.payment_status === 'paid' ? t('orders.paid_with', { method: payLabel }) : t('orders.unpaid')}
        </p>
      </dl>

      <h3 className="mt-6 font-semibold">{t('orders.timeline')}</h3>
      <ol className="mt-2 grid gap-2 border-l-2 border-sage-soft pl-4 text-sm">
        {(timeline ?? []).map((h, i) => (
          <li key={i}>
            <span className="font-medium">{t(statusKey(h.status))}</span>{' '}
            <span className="text-muted">· {short(h.created_at)}</span>
            {h.note !== null && <span className="block text-muted">{h.note}</span>}
          </li>
        ))}
      </ol>
    </Dialog>
  )
}
