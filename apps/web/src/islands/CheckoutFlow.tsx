// Checkout en 3 pasos (docs/design/05-checkout-cuando.png): 1 · Cuándo, 2 · Tus datos, 3 · Pago.
// Las horas y el total los calcula el Worker; el pago se hace en la página segura de Stripe.
import {
  customerSchema,
  type AvailabilityResponse,
  type AvailabilitySlot,
  type CheckoutRequest,
} from '@atalia/shared/checkout'
import { cents, formatUSD } from '@atalia/shared/money'
import type { PromoRejection } from '@atalia/shared/promos'
import { Button, ButtonLink, OptionGroup, Stepper } from '@atalia/ui'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { api, ApiRequestError, toApiItems } from '../lib/api'
import {
  addMonths,
  compareMonths,
  dayStates,
  firstAvailableDay,
  monthGrid,
  monthOf,
  monthRange,
  visibleTimes,
  type YearMonth,
} from '../lib/calendar'
import { getCart, onCartChange, type CartItem } from '../lib/cart'
import type { PickupStore } from '../lib/catalog'
import { formatTime } from '../lib/catalog-format'
import { getPickup, setPickup } from '../lib/pickup'
import type { Locale, MessageKey } from '../i18n'

export interface CheckoutFlowProps {
  locale: Locale
  messages: Record<MessageKey, string>
  cartHref: string
  /** Tiendas con sus puntos de recogida (en la tienda, en el carro…). */
  stores: PickupStore[]
  /** Páginas legales que el cliente acepta al pagar. */
  legal: { terms: string; privacy: string; policies: string }
  /** Aviso de alérgenos (site_content legal.allergens). */
  allergenNotice: string | null
}

type Step = 0 | 1 | 2
type Customer = { name: string; phone: string; email: string }
type FieldErrors = Partial<Record<keyof Customer, MessageKey>>

const TOKEN_KEY = 'atalia.checkout.attempt'

/**
 * Un checkout_token por intento (RNF-P01): si se reintenta lo mismo, se reutiliza; si cambia el carrito,
 * la hora o los datos, es otro intento y lleva otro token (la BD devolvería el pedido anterior).
 */
function tokenFor(fingerprint: string): string {
  try {
    const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null') as { f: string; t: string } | null
    if (saved?.f === fingerprint) return saved.t
  } catch {
    // Sin sessionStorage: un token nuevo por clic sigue siendo seguro (el botón se bloquea mientras carga).
  }
  const token = crypto.randomUUID()
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ f: fingerprint, t: token }))
  } catch {
    // ignorar
  }
  return token
}

export default function CheckoutFlow({
  locale,
  messages: m,
  cartHref,
  stores,
  legal,
  allergenNotice,
}: CheckoutFlowProps) {
  const tf = (key: MessageKey, params: Record<string, string | number>) =>
    m[key].replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
  const usd = (value: number) => formatUSD(cents(value), locale)
  const intlLocale = locale === 'es' ? 'es-US' : 'en-US'

  const [cart, setCart] = useState<CartItem[] | null>(null)
  const [step, setStep] = useState<Step>(0)
  const [month, setMonth] = useState<YearMonth>(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  })
  const [firstMonth] = useState(month)
  const [data, setData] = useState<AvailabilityResponse | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [date, setDate] = useState<string | null>(null)
  const [time, setTime] = useState<string | null>(null)
  // Punto de recogida: el que eligió en el menú o el primero de la tienda.
  const store = stores[0] ?? null
  const [locationId, setLocationId] = useState<string | null>(null)
  useEffect(() => {
    const saved = getPickup()?.locationId ?? null
    const valid = store?.locations.some((l) => l.id === saved) === true
    setLocationId(valid ? saved : (store?.locations[0]?.id ?? null))
  }, [store])
  const location = store?.locations.find((l) => l.id === locationId) ?? null
  const [customer, setCustomer] = useState<Customer>({ name: '', phone: '', email: '' })
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [banner, setBanner] = useState<MessageKey | null>(null)
  const [paying, setPaying] = useState(false)
  // Consentimiento: hay que aceptar términos, privacidad y cancelación para pagar (queda guardado en el pedido).
  const [accepted, setAccepted] = useState(false)
  const [consentError, setConsentError] = useState(false)
  // Cupón: lo que escribe, el que quedó aplicado y por qué no se aplicó (lo decide el Worker).
  const [promoOpen, setPromoOpen] = useState(false)
  const [promoInput, setPromoInput] = useState('')
  const [promoError, setPromoError] = useState<PromoRejection | 'network' | null>(null)
  const [promoBusy, setPromoBusy] = useState(false)
  const promoCode = useRef('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const autoPicked = useRef(false)

  useEffect(() => {
    setCart(getCart())
    if (new URLSearchParams(window.location.search).has('cancelled')) setBanner('checkout.cancelled')
    return onCartChange(setCart)
  }, [])

  const items = useMemo(() => (cart === null ? [] : toApiItems(cart)), [cart])

  const load = useCallback(() => {
    if (items.length === 0) return
    setLoadState('loading')
    api
      .availability({ ...monthRange(month), locale, items, promoCode: promoCode.current })
      .then((res) => {
        setData(res)
        setLoadState('ready')
        // La primera vez, abre el calendario en el primer día con horas (puede ser el mes siguiente).
        if (!autoPicked.current) {
          const first = firstAvailableDay(res.slots)
          if (first !== null) {
            autoPicked.current = true
            setDate(first)
          } else if (compareMonths(month, addMonths(firstMonth, 2)) < 0) {
            setMonth((prev) => addMonths(prev, 1))
          }
        }
      })
      .catch(() => setLoadState('error'))
  }, [items, month, locale, firstMonth])

  useEffect(load, [load])

  // Al volver al paso, mueve el foco al título para lectores de pantalla.
  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  const slots = data?.slots ?? []
  const states = useMemo(() => dayStates(slots), [slots])
  const times = date === null ? [] : visibleTimes(slots, date)
  const chosen = slots.find((s) => s.date === date && s.time === time && s.available) ?? null
  const quote = data?.quote ?? null
  const appliedPromo = quote?.promo?.applied === true ? quote.promo.code : null

  const applyPromo = async (code: string) => {
    const clean = code.trim().toUpperCase()
    if (clean === '' || items.length === 0) return
    setPromoBusy(true)
    setPromoError(null)
    try {
      const res = await api.availability({ ...monthRange(month), locale, items, promoCode: clean })
      setData(res)
      const promo = res.quote?.promo ?? null
      if (promo?.applied === true) {
        promoCode.current = clean
        setPromoInput('')
      } else {
        promoCode.current = ''
        setPromoError(promo === null ? 'not_found' : promo.reason)
      }
    } catch {
      setPromoError('network')
    } finally {
      setPromoBusy(false)
    }
  }

  const removePromo = () => {
    promoCode.current = ''
    setPromoError(null)
    load()
  }

  const dateLabel = (iso: string, withTime: string | null) => {
    const d = new Date(`${iso}T12:00:00Z`)
    const day = new Intl.DateTimeFormat(intlLocale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(d)
    return withTime === null ? day : `${day}, ${formatTime(withTime)}`
  }
  const weekdays = useMemo(() => {
    const f = new Intl.DateTimeFormat(intlLocale, { weekday: 'narrow', timeZone: 'UTC' })
    // 2026-10-18 es domingo
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2026, 9, 18 + i))))
  }, [intlLocale])
  const monthName = new Intl.DateTimeFormat(intlLocale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(month.year, month.month - 1, 1)))
  // "octubre de 2026" → "Octubre de 2026" (solo la primera letra, como en el diseño)
  const monthTitle = monthName.charAt(0).toLocaleUpperCase(intlLocale) + monthName.slice(1)

  // Un error marcado se quita apenas el dato queda bien (no aparecen errores nuevos mientras escribe).
  useEffect(() => {
    setErrors((prev) => {
      if (Object.keys(prev).length === 0) return prev
      const parsed = customerSchema.safeParse(customer)
      const failing = new Set(parsed.success ? [] : parsed.error.issues.map((i) => i.path[0]))
      const next: FieldErrors = {}
      for (const [field, key] of Object.entries(prev) as [keyof Customer, MessageKey][]) {
        if (failing.has(field)) next[field] = key
      }
      return Object.keys(next).length === Object.keys(prev).length ? prev : next
    })
  }, [customer])

  const validate = (): boolean => {
    const parsed = customerSchema.safeParse(customer)
    if (parsed.success) {
      setErrors({})
      return true
    }
    const next: FieldErrors = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof Customer
      next[field] =
        field === 'name'
          ? 'checkout.err_name'
          : field === 'phone'
            ? 'checkout.err_phone'
            : 'checkout.err_email'
    }
    setErrors(next)
    document.getElementById(`field-${Object.keys(next)[0] ?? 'name'}`)?.focus()
    return false
  }

  const pay = async () => {
    if (chosen === null || date === null || time === null || cart === null) return
    if (!accepted) {
      setConsentError(true)
      document.getElementById('checkout-consent')?.focus()
      return
    }
    setPaying(true)
    setBanner(null)
    const body: Omit<CheckoutRequest, 'checkoutToken'> = {
      locale,
      pickup: { date, time },
      pickupLocationId: locationId,
      customer,
      note,
      items,
      promoCode: appliedPromo ?? '',
      acceptTerms: true,
    }
    try {
      const res = await api.checkout({ ...body, checkoutToken: tokenFor(JSON.stringify(body)) })
      window.location.assign(res.url)
    } catch (err) {
      setPaying(false)
      const code = err instanceof ApiRequestError ? err.code : ''
      if (code === 'slot_unavailable') {
        setTime(null)
        setStep(0)
        load()
        setBanner('checkout.err_slot')
      } else if (code === 'cart_invalid') setBanner('checkout.err_cart')
      else if (code === 'payments_disabled') setBanner('checkout.err_disabled')
      else if (code === 'promo_rejected') {
        // P. ej. ya lo usó con este correo: se quita el cupón y se le dice por qué, sin perder lo demás.
        promoCode.current = ''
        setPromoOpen(true)
        setPromoError((err instanceof ApiRequestError ? err.reason : null) as PromoRejection | null)
        load()
        setBanner('checkout.err_promo')
      } else setBanner('checkout.err_generic')
    }
  }

  if (cart === null) return <p className="py-10 text-muted">{m['home.loading']}</p>
  if (cart.length === 0) {
    return (
      <div className="rounded-3xl bg-white p-10 text-center">
        <p className="text-lg">{m['checkout.empty']}</p>
        <ButtonLink href={cartHref} className="mt-6">
          {m['cart.browse']}
        </ButtonLink>
      </div>
    )
  }

  const stepTitles: Record<Step, MessageKey> = {
    0: 'checkout.when_title',
    1: 'checkout.details_title',
    2: 'checkout.pay_title',
  }

  const primary = (() => {
    if (step === 0)
      return (
        <Button size="lg" fullWidth disabled={chosen === null} onClick={() => setStep(1)}>
          {m['checkout.continue_details']}
        </Button>
      )
    if (step === 1)
      return (
        // Botón de envío del formulario de datos aunque esté en el resumen (atributo form): Enter también envía.
        <Button size="lg" fullWidth type="submit" form="checkout-details">
          {m['checkout.continue_pay']}
        </Button>
      )
    return (
      <Button
        size="lg"
        fullWidth
        disabled={quote === null || chosen === null}
        loading={paying}
        loadingLabel={m['checkout.paying']}
        onClick={() => void pay()}
      >
        {quote === null
          ? m['checkout.pay_button_tbd']
          : tf('checkout.pay_button', { total: usd(quote.totalCents) })}
      </Button>
    )
  })()

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-10">
      <div className="min-w-0">
        <div className="max-w-3xl">
          <Stepper
            label={m['checkout.steps']}
            steps={[m['checkout.step_when'], m['checkout.step_details'], m['checkout.step_pay']]}
            current={step}
          />
        </div>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="mt-6 font-heading text-3xl font-bold text-dark outline-none md:text-4xl"
        >
          {m[stepTitles[step]]}
        </h1>

        {banner !== null && (
          <p role="alert" className="mt-4 rounded-xl bg-blush px-4 py-3 text-sm">
            {m[banner]}
          </p>
        )}

        {step === 0 && (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Calendar
              m={m}
              title={monthTitle}
              weekdays={weekdays}
              grid={monthGrid(month)}
              states={states}
              selected={date}
              onSelect={(d) => {
                setDate(d)
                setTime(null)
              }}
              canPrev={compareMonths(month, firstMonth) > 0}
              onPrev={() => setMonth((x) => addMonths(x, -1))}
              onNext={() => setMonth((x) => addMonths(x, 1))}
              loading={loadState === 'loading'}
            />
            <Times
              m={m}
              title={date === null ? null : tf('checkout.times_for', { date: dateLabel(date, null) })}
              times={times}
              selected={time}
              onSelect={setTime}
              loadState={loadState}
              onRetry={load}
              hasDate={date !== null && monthOf(date).month === month.month}
            />
            {store !== null && store.locations.length > 1 && (
              <div className="rounded-3xl bg-white p-4 md:col-span-2 md:p-6">
                <OptionGroup
                  label={m['pickup.location']}
                  options={store.locations.map((l) => ({ value: l.id, label: l.name }))}
                  value={locationId}
                  onChange={(id) => {
                    setLocationId(id)
                    setPickup({ storeId: store.id, locationId: id })
                  }}
                />
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <form
            id="checkout-details"
            className="mt-6 grid max-w-xl gap-5 rounded-3xl bg-white p-5 md:p-8"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              if (validate()) setStep(2)
            }}
          >
            <Field
              id="field-name"
              label={m['checkout.name']}
              autoComplete="name"
              value={customer.name}
              error={errors.name === undefined ? null : m[errors.name]}
              onChange={(v) => setCustomer((c) => ({ ...c, name: v }))}
            />
            <Field
              id="field-phone"
              label={m['checkout.phone']}
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={customer.phone}
              error={errors.phone === undefined ? null : m[errors.phone]}
              onChange={(v) => setCustomer((c) => ({ ...c, phone: v }))}
            />
            <Field
              id="field-email"
              label={m['checkout.email']}
              type="email"
              autoComplete="email"
              hint={m['checkout.email_hint']}
              value={customer.email}
              error={errors.email === undefined ? null : m[errors.email]}
              onChange={(v) => setCustomer((c) => ({ ...c, email: v }))}
            />
            <div>
              <label htmlFor="field-note" className="font-medium">
                {m['checkout.note']}
              </label>
              <textarea
                id="field-note"
                value={note}
                maxLength={500}
                rows={3}
                onChange={(e) => setNote(e.target.value)}
                className="mt-2 block w-full rounded-xl border border-dark/15 bg-white px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              />
            </div>
            <div>
              <Button variant="outline" type="button" onClick={() => setStep(0)}>
                {m['checkout.back']}
              </Button>
            </div>
          </form>
        )}

        {step === 2 && (
          <div className="mt-6 grid max-w-xl gap-3">
            <ReviewRow
              label={m['checkout.pickup']}
              value={chosen === null || date === null ? '—' : dateLabel(date, chosen.time)}
              edit={m['checkout.edit']}
              onEdit={() => setStep(0)}
            />
            <ReviewRow
              label={m['checkout.contact']}
              value={`${customer.name} · ${customer.phone} · ${customer.email}`}
              edit={m['checkout.edit']}
              onEdit={() => setStep(1)}
            />
            {quote === null && (
              <p className="rounded-xl bg-sand px-4 py-3 text-sm">{m['checkout.unpriced_block']}</p>
            )}
            {allergenNotice !== null && <p className="text-sm text-muted">{allergenNotice}</p>}
            <div className="rounded-2xl bg-white p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  id="checkout-consent"
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => {
                    setAccepted(e.target.checked)
                    if (e.target.checked) setConsentError(false)
                  }}
                  aria-invalid={consentError}
                  aria-describedby={consentError ? 'checkout-consent-error' : undefined}
                  className="mt-0.5 size-6 shrink-0 cursor-pointer accent-secondary"
                />
                <span className="text-sm leading-relaxed">
                  {consentParts(m['legal.consent']).map((part, i) =>
                    part.link === null ? (
                      <span key={i}>{part.text}</span>
                    ) : (
                      <a
                        key={i}
                        href={legal[part.link]}
                        target="_blank"
                        rel="noopener"
                        className="font-semibold text-secondary underline underline-offset-2"
                      >
                        {m[CONSENT_LINKS[part.link]]}
                      </a>
                    ),
                  )}
                </span>
              </label>
              {consentError && (
                <p id="checkout-consent-error" role="alert" className="mt-2 text-sm text-toast-error">
                  {m['legal.consent_required']}
                </p>
              )}
            </div>
            <div>
              <Button variant="outline" onClick={() => setStep(1)}>
                {m['checkout.back']}
              </Button>
            </div>
          </div>
        )}
      </div>

      <aside>
        <section
          aria-labelledby="order-summary"
          className="rounded-3xl bg-white p-6 shadow-sm lg:sticky lg:top-28"
        >
          <h2 id="order-summary" className="font-heading text-2xl font-bold">
            {m['checkout.summary']}
          </h2>
          <ul className="mt-4 grid gap-3 text-sm">
            {(
              quote?.lines ??
              cart.map((c) => ({
                name: c.name,
                detail: c.sizeLabel,
                quantity: c.quantity,
                lineTotalCents: null,
              }))
            ).map((line, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>
                  {line.detail === null ? line.name : `${line.name} · ${line.detail}`}
                  {line.quantity > 1 && ` × ${String(line.quantity)}`}
                </span>
                <span className="shrink-0">
                  {line.lineTotalCents === null ? m['checkout.price_tbd'] : usd(line.lineTotalCents)}
                </span>
              </li>
            ))}
            {quote !== null && quote.discountCents > 0 && (
              <li className="flex items-center justify-between gap-3 text-primary-ink">
                <span>
                  {tf('checkout.promo_line', { code: appliedPromo ?? '' })}
                  <button
                    type="button"
                    onClick={removePromo}
                    className="ml-2 inline-flex min-h-11 cursor-pointer items-center text-dark underline underline-offset-2"
                  >
                    {m['checkout.promo_remove']}
                  </button>
                </span>
                <span className="shrink-0">−{usd(quote.discountCents)}</span>
              </li>
            )}
            <li className="flex justify-between gap-3 text-muted">
              <span>{quote?.taxLabel ?? m['checkout.taxes']}</span>
              <span>{quote === null ? m['checkout.price_tbd'] : usd(quote.taxCents)}</span>
            </li>
          </ul>
          {quote !== null && appliedPromo === null && (
            <PromoForm
              m={m}
              open={promoOpen}
              onOpen={() => setPromoOpen(true)}
              value={promoInput}
              onChange={(v) => {
                setPromoInput(v)
                setPromoError(null)
              }}
              busy={promoBusy}
              error={promoError === null ? null : (`checkout.promo_err_${promoError}` as MessageKey)}
              onApply={() => void applyPromo(promoInput)}
            />
          )}
          <div className="mt-4 flex items-center justify-between border-t border-dark/10 pt-4">
            <span className="font-semibold">{m['checkout.total']}</span>
            <span className="text-xl font-semibold text-secondary">
              {quote === null ? m['checkout.price_tbd'] : usd(quote.totalCents)}
            </span>
          </div>
          {chosen !== null && date !== null && (
            <p className="mt-4 rounded-xl bg-accent px-4 py-3 text-sm">
              {m['checkout.pickup']} <strong>{dateLabel(date, chosen.time)}</strong>
              {location !== null && ` · ${location.name}`}
            </p>
          )}
          <div className="mt-4">{primary}</div>
          <p className="mt-3 text-center text-xs text-muted">{m['checkout.methods']}</p>
        </section>
      </aside>
    </div>
  )
}

const CONSENT_LINKS = {
  terms: 'legal.consent_terms',
  privacy: 'legal.consent_privacy',
  policies: 'legal.consent_policies',
} as const satisfies Record<string, MessageKey>

/** "Acepto los {terms}, la {privacy} y la {policies}." → texto y enlaces, sin HTML. */
function consentParts(sentence: string): Array<{ text: string; link: keyof typeof CONSENT_LINKS | null }> {
  return sentence
    .split(/(\{terms\}|\{privacy\}|\{policies\})/)
    .filter((s) => s !== '')
    .map((s) => {
      const name = s.replace(/[{}]/g, '')
      return name in CONSENT_LINKS && s.startsWith('{')
        ? { text: '', link: name as keyof typeof CONSENT_LINKS }
        : { text: s, link: null }
    })
}

/** "¿Tienes un código de descuento?": se abre a pedido para no distraer a quien no tiene uno. */
function PromoForm(props: {
  m: Record<MessageKey, string>
  open: boolean
  onOpen: () => void
  value: string
  onChange: (v: string) => void
  busy: boolean
  error: MessageKey | null
  onApply: () => void
}) {
  const { m } = props
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const opened = useRef(false)
  useEffect(() => {
    // Solo al abrirlo con el botón, no en cada render.
    if (props.open && !opened.current) inputRef.current?.focus()
    opened.current = props.open
  }, [props.open])

  if (!props.open) {
    return (
      <button
        type="button"
        onClick={props.onOpen}
        className="mt-3 inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-secondary underline underline-offset-2"
      >
        {m['checkout.promo_toggle']}
      </button>
    )
  }
  return (
    <form
      className="mt-3"
      onSubmit={(e) => {
        e.preventDefault()
        props.onApply()
      }}
    >
      <label htmlFor={`${id}-code`} className="text-sm font-medium">
        {m['checkout.promo_label']}
      </label>
      <div className="mt-1 flex gap-2">
        <input
          ref={inputRef}
          id={`${id}-code`}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          maxLength={30}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={props.error !== null}
          aria-describedby={`${id}-err`}
          className={`min-h-11 min-w-0 flex-1 rounded-xl border bg-white px-3 uppercase ${props.error === null ? 'border-dark/15' : 'border-toast-error'}`}
        />
        <Button type="submit" variant="outline" disabled={props.busy || props.value.trim() === ''}>
          {props.busy ? m['checkout.promo_applying'] : m['checkout.promo_apply']}
        </Button>
      </div>
      <p id={`${id}-err`} role="status" className="mt-1 min-h-5 text-sm text-toast-error">
        {props.error === null ? '' : m[props.error]}
      </p>
    </form>
  )
}

function Calendar(props: {
  m: Record<MessageKey, string>
  title: string
  weekdays: string[]
  grid: Array<Array<string | null>>
  states: Map<string, 'available' | 'full' | 'unavailable'>
  selected: string | null
  onSelect: (date: string) => void
  canPrev: boolean
  onPrev: () => void
  onNext: () => void
  loading: boolean
}) {
  const { m } = props
  const titleId = useId()
  const nav =
    'inline-flex size-11 items-center justify-center rounded-full hover:bg-dark/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:opacity-30'
  return (
    <section aria-labelledby={titleId} className="rounded-3xl bg-white p-4 md:p-6" aria-busy={props.loading}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          className={nav}
          onClick={props.onPrev}
          disabled={!props.canPrev}
          aria-label={m['checkout.prev_month']}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m15 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2 id={titleId} className="font-semibold" aria-live="polite">
          {props.title}
        </h2>
        <button type="button" className={nav} onClick={props.onNext} aria-label={m['checkout.next_month']}>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <table
        className="mt-3 w-full table-fixed border-separate border-spacing-y-1 text-center"
        role="grid"
        aria-label={m['checkout.calendar']}
      >
        <thead>
          <tr>
            {props.weekdays.map((d, i) => (
              <th key={i} scope="col" className="pb-2 text-xs font-medium text-muted">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.grid.map((week, w) => (
            <tr key={w}>
              {week.map((day, i) => {
                if (day === null) return <td key={i} />
                const state = props.states.get(day) ?? 'unavailable'
                const selected = day === props.selected
                const n = Number(day.slice(8))
                return (
                  <td key={day} className="px-0.5">
                    <button
                      type="button"
                      disabled={state !== 'available'}
                      aria-pressed={selected}
                      aria-label={`${String(n)}${state === 'full' ? ` · ${m['checkout.full']}` : ''}`}
                      onClick={() => props.onSelect(day)}
                      className={[
                        'mx-auto flex size-11 items-center justify-center rounded-xl text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary',
                        selected
                          ? 'bg-secondary font-semibold text-white'
                          : state === 'available'
                            ? 'text-dark hover:bg-dark/5'
                            : state === 'full'
                              ? 'border border-dashed border-secondary/40 bg-blush text-muted line-through'
                              : 'text-dark/30',
                      ].join(' ')}
                    >
                      {n}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex gap-5 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-secondary" />
          {m['checkout.legend_selected']}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full border border-dashed border-secondary/40 bg-blush"
          />
          {m['checkout.legend_full']}
        </span>
      </div>
    </section>
  )
}

function Times(props: {
  m: Record<MessageKey, string>
  title: string | null
  times: AvailabilitySlot[]
  selected: string | null
  onSelect: (time: string) => void
  loadState: 'loading' | 'ready' | 'error'
  onRetry: () => void
  hasDate: boolean
}) {
  const { m } = props
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="rounded-3xl bg-white p-4 md:p-6">
      <h2 id={titleId} className="font-semibold">
        {props.title ?? m['checkout.step_when']}
      </h2>
      {props.loadState === 'error' ? (
        <div className="mt-4">
          <p role="alert" className="text-sm">
            {m['checkout.load_error']}
          </p>
          <Button variant="outline" className="mt-3" onClick={props.onRetry}>
            {m['checkout.retry']}
          </Button>
        </div>
      ) : props.loadState === 'loading' ? (
        <p className="mt-4 text-sm text-muted" role="status">
          {m['checkout.loading']}
        </p>
      ) : !props.hasDate ? (
        <p className="mt-4 text-sm text-muted">{m['checkout.pick_date']}</p>
      ) : props.times.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{m['checkout.no_times']}</p>
      ) : (
        <div role="radiogroup" aria-labelledby={titleId} className="mt-4 grid grid-cols-2 gap-3">
          {props.times.map((s) => {
            const checked = s.time === props.selected
            return (
              <button
                key={s.time}
                type="button"
                role="radio"
                aria-checked={checked}
                disabled={!s.available}
                aria-label={
                  s.available ? formatTime(s.time) : `${formatTime(s.time)} · ${m['checkout.full']}`
                }
                onClick={() => props.onSelect(s.time)}
                className={[
                  'min-h-11 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary',
                  checked
                    ? 'border-secondary bg-secondary text-white'
                    : s.available
                      ? 'border-dark/15 bg-white hover:border-secondary'
                      : 'cursor-not-allowed border-dashed border-dark/20 text-dark/40 line-through',
                ].join(' ')}
              >
                {formatTime(s.time)}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

function Field(props: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error: string | null
  type?: 'text' | 'tel' | 'email'
  autoComplete: string
  inputMode?: 'tel'
  hint?: string
}) {
  const describedBy = [props.hint && `${props.id}-hint`, props.error && `${props.id}-error`]
    .filter(Boolean)
    .join(' ')
  return (
    <div>
      <label htmlFor={props.id} className="font-medium">
        {props.label}
      </label>
      <input
        id={props.id}
        type={props.type ?? 'text'}
        autoComplete={props.autoComplete}
        inputMode={props.inputMode}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        aria-invalid={props.error !== null}
        aria-describedby={describedBy || undefined}
        required
        className={`mt-2 block min-h-11 w-full rounded-xl border bg-white px-4 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary ${
          props.error === null ? 'border-dark/15' : 'border-toast-error'
        }`}
      />
      {props.hint !== undefined && (
        <p id={`${props.id}-hint`} className="mt-1 text-xs text-muted">
          {props.hint}
        </p>
      )}
      {props.error !== null && (
        <p id={`${props.id}-error`} className="mt-1 text-sm text-toast-error">
          {props.error}
        </p>
      )}
    </div>
  )
}

function ReviewRow(props: { label: string; value: string; edit: string; onEdit: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl bg-white p-4">
      <div className="min-w-0">
        <p className="text-sm text-muted">{props.label}</p>
        {/* Correos y nombres largos se parten en cualquier punto: nunca ensanchan la página en el teléfono */}
        <p className="font-medium wrap-anywhere">{props.value}</p>
      </div>
      <button
        type="button"
        onClick={props.onEdit}
        className="min-h-11 shrink-0 rounded-full px-3 text-sm font-medium text-secondary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
      >
        {props.edit}
      </button>
    </div>
  )
}
