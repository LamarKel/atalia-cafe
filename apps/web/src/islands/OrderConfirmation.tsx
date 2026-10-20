// Confirmación (docs/design/06-confirmacion.png). El pedido se marca pagado SOLO en el webhook: si el cliente
// llega antes que el webhook, esta página espera unos segundos y vuelve a consultar.
import type { OrderSummary } from '@atalia/shared/checkout'
import { cents, formatUSD } from '@atalia/shared/money'
import { ButtonLink } from '@atalia/ui'
import { useEffect, useState } from 'react'
import { api, ApiRequestError } from '../lib/api'
import { clearCart } from '../lib/cart'
import { formatTime } from '../lib/catalog-format'
import { pickupIcs } from '../lib/ics'
import type { Locale, MessageKey } from '../i18n'

export interface OrderConfirmationProps {
  locale: Locale
  messages: Record<MessageKey, string>
  address: string | null
  directionsHref: string | null
  whatsappHref: string | null
  policyHref: string
  homeHref: string
  /** Duración de la franja de recogida para el evento del calendario (regla time.slot_minutes). */
  slotMinutes: number
}

const POLL_MS = 2000
const POLL_LIMIT = 15

type View =
  | { kind: 'loading' }
  | { kind: 'pending'; slow: boolean }
  | { kind: 'missing' }
  | { kind: 'order'; order: OrderSummary }

export default function OrderConfirmation(props: OrderConfirmationProps) {
  const { locale, messages: m } = props
  const tf = (key: MessageKey, params: Record<string, string | number>) =>
    m[key].replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
  const usd = (value: number) => formatUSD(cents(value), locale)
  const [view, setView] = useState<View>({ kind: 'loading' })

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('order')
    if (token === null) {
      setView({ kind: 'missing' })
      return
    }
    let tries = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    const check = async () => {
      try {
        const order = await api.order(token)
        if (stopped) return
        if (order.paymentStatus === 'paid' || order.status === 'cancelled') {
          if (order.paymentStatus === 'paid') clearCart()
          setView({ kind: 'order', order })
          return
        }
        tries++
        setView({ kind: 'pending', slow: tries >= POLL_LIMIT })
        if (tries < POLL_LIMIT) timer = setTimeout(() => void check(), POLL_MS)
      } catch (err) {
        if (stopped) return
        if (err instanceof ApiRequestError && err.status === 404) setView({ kind: 'missing' })
        else {
          tries++
          setView({ kind: 'pending', slow: tries >= POLL_LIMIT })
          if (tries < POLL_LIMIT) timer = setTimeout(() => void check(), POLL_MS)
        }
      }
    }
    void check()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [])

  if (view.kind === 'loading') return <p className="py-20 text-center text-muted">{m['home.loading']}</p>

  if (view.kind === 'missing')
    return (
      <div className="py-20 text-center">
        <p className="text-lg">{m['order.not_found']}</p>
        <ButtonLink href={props.homeHref} className="mt-6">
          {m['order.home']}
        </ButtonLink>
      </div>
    )

  if (view.kind === 'pending')
    return (
      <div className="mx-auto max-w-xl py-20 text-center" role="status">
        <span
          aria-hidden="true"
          className="mx-auto block size-12 rounded-full border-4 border-primary border-t-transparent motion-safe:animate-spin"
        />
        <h1 className="mt-6 font-heading text-3xl font-bold">{m['order.pending_title']}</h1>
        <p className="mt-3 text-muted">{view.slow ? m['order.slow'] : m['order.pending_text']}</p>
      </div>
    )

  const { order } = view
  if (order.status === 'cancelled')
    return (
      <div className="py-20 text-center">
        <h1 className="font-heading text-3xl font-bold">{m['order.cancelled_title']}</h1>
        <p className="mt-3">{tf('order.code', { code: order.code })}</p>
        <ButtonLink href={props.homeHref} className="mt-6">
          {m['order.home']}
        </ButtonLink>
      </div>
    )

  const intlLocale = locale === 'es' ? 'es-US' : 'en-US'
  const when = new Date(order.scheduledFor)
  const dayName = new Intl.DateTimeFormat(intlLocale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: order.timezone,
  }).format(when)
  // "domingo, 18 de octubre" → "Domingo, 18 de octubre" (solo la primera letra)
  const day = dayName.charAt(0).toLocaleUpperCase(intlLocale) + dayName.slice(1)
  const hhmm = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: order.timezone,
  }).format(when)

  const downloadIcs = () => {
    const ics = pickupIcs({
      code: order.code,
      title: tf('order.calendar_event', { code: order.code }),
      startsAt: order.scheduledFor,
      durationMinutes: props.slotMinutes,
      location: props.address,
    })
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${order.code}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto max-w-3xl text-center">
      <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-primary text-white">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="m5 12 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <h1 className="mt-6 font-heading text-4xl font-bold text-dark md:text-5xl">{m['order.title']}</h1>
      <p className="mt-3 text-muted">{m['order.subtitle']}</p>
      <p className="mt-4 inline-flex rounded-full border border-dark/15 bg-white px-4 py-1.5 text-sm font-semibold">
        {tf('order.code', { code: order.code })}
      </p>

      <div className="mt-8 grid gap-6 rounded-3xl bg-white p-6 text-left shadow-sm md:grid-cols-2 md:p-8">
        <div className="grid content-start gap-5">
          <div className="flex gap-3">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="mt-0.5 size-5 shrink-0 text-secondary"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
            </svg>
            <div>
              <p className="font-semibold">
                {day} · {formatTime(hhmm)}
              </p>
              <p className="text-sm text-muted">{m['order.pickup_time']}</p>
            </div>
          </div>
          {props.address !== null && (
            <div className="flex gap-3">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="mt-0.5 size-5 shrink-0 text-secondary"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11Z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              <div>
                <p className="font-semibold">{props.address}</p>
                <p className="text-sm text-muted">{m['order.pickup_place']}</p>
              </div>
            </div>
          )}
        </div>
        <div>
          <ul className="grid gap-2 text-sm">
            {order.items.map((item, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>
                  {item.detail === null ? item.name : `${item.name} · ${item.detail}`}
                  {item.quantity > 1 && ` × ${String(item.quantity)}`}
                </span>
                <span className="shrink-0">{usd(item.lineTotalCents)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 text-muted">
              <span>{m['checkout.taxes']}</span>
              <span>{usd(order.taxCents)}</span>
            </li>
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-dark/10 pt-3">
            <span className="font-semibold">{m['order.paid']}</span>
            <span className="text-xl font-semibold text-secondary">{usd(order.totalCents)}</span>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
        {props.directionsHref !== null && (
          <ButtonLink href={props.directionsHref} target="_blank" rel="noopener">
            {m['order.directions']}
          </ButtonLink>
        )}
        <button
          type="button"
          onClick={downloadIcs}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-secondary px-6 py-3 font-semibold text-secondary hover:bg-secondary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
        >
          {m['order.calendar']}
        </button>
        {props.whatsappHref !== null && (
          <ButtonLink href={props.whatsappHref} variant="light" target="_blank" rel="noopener">
            {m['order.whatsapp']}
          </ButtonLink>
        )}
      </div>
      <p className="mt-6 text-sm text-muted">
        {m['order.change']}{' '}
        <a href={props.policyHref} className="text-secondary underline underline-offset-2">
          {m['order.policy']}
        </a>
        .{' · '}
        <a href={props.homeHref} className="text-secondary underline underline-offset-2">
          {m['order.home']}
        </a>
      </p>
    </div>
  )
}
