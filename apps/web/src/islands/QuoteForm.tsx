// "Pide una cotización" (PLAN.md RF-Q01–Q05). Sin pantalla propia en el diseño: sigue el lenguaje de la
// pantalla 05 (tarjetas blancas, campos redondeados). Se envía al Worker, nunca directo a la BD.
import { customerSchema } from '@atalia/shared/checkout'
import { EVENT_TYPES, isValidEventDate, type EventType } from '@atalia/shared/quotes'
import { Button, ButtonLink, ToggleChip } from '@atalia/ui'
import { useEffect, useRef, useState } from 'react'
import { FormInput, inputClass } from './FormInput'
import { Turnstile } from './Turnstile'
import { ApiRequestError, api } from '../lib/api'
import type { Locale, MessageKey } from '../i18n'

export interface QuoteFormProps {
  locale: Locale
  messages: Record<MessageKey, string>
  products: Array<{ id: string; name: string }>
  turnstileSiteKey: string
  cateringHref: string
  /** Política de privacidad (aviso junto al botón de enviar). */
  privacyHref: string
}

type Field = 'name' | 'phone' | 'email' | 'eventDate' | 'eventType' | 'guests' | 'captcha'
type Errors = Partial<Record<Field, MessageKey>>

const ymd = (d: Date) => d.toISOString().slice(0, 10)

export default function QuoteForm({
  locale,
  messages: m,
  products,
  turnstileSiteKey,
  cateringHref,
  privacyHref,
}: QuoteFormProps) {
  const tf = (key: MessageKey, params: Record<string, string | number>) =>
    m[key].replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))

  const [today] = useState(() => ymd(new Date()))
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    eventDate: '',
    eventType: '' as EventType | '',
    guests: '',
    notes: '',
    website: '',
  })
  const [selected, setSelected] = useState<string[]>([])
  const [token, setToken] = useState<string | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [banner, setBanner] = useState<MessageKey | null>(null)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const resetCaptcha = useRef<() => void>(() => undefined)
  const successRef = useRef<HTMLHeadingElement>(null)

  // ?product=… desde el detalle de una mesa
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('product')
    if (id !== null && products.some((p) => p.id === id)) setSelected([id])
  }, [products])

  useEffect(() => {
    if (done !== null) successRef.current?.focus()
  }, [done])

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }))

  const validate = (): Errors => {
    const next: Errors = {}
    const contact = customerSchema.safeParse({ name: form.name, phone: form.phone, email: form.email })
    if (!contact.success) {
      for (const issue of contact.error.issues) {
        const f = issue.path[0] as 'name' | 'phone' | 'email'
        next[f] =
          f === 'name' ? 'checkout.err_name' : f === 'phone' ? 'checkout.err_phone' : 'checkout.err_email'
      }
    }
    if (!isValidEventDate(form.eventDate, today)) next.eventDate = 'quote.err_date'
    if (form.eventType === '') next.eventType = 'quote.err_type'
    const guests = Number(form.guests)
    if (!Number.isInteger(guests) || guests < 1 || guests > 5000) next.guests = 'quote.err_guests'
    if (token === null) next.captcha = 'quote.err_captcha'
    return next
  }

  const submit = async () => {
    setBanner(null)
    const next = validate()
    setErrors(next)
    const first = (['eventDate', 'eventType', 'guests', 'name', 'phone', 'email', 'captcha'] as const).find(
      (f) => next[f] !== undefined,
    )
    if (first !== undefined) {
      document.getElementById(`quote-${first}`)?.focus()
      return
    }
    if (token === null || form.eventType === '') return
    setSending(true)
    try {
      const res = await api.quote({
        locale,
        customer: { name: form.name, phone: form.phone, email: form.email },
        eventDate: form.eventDate,
        eventType: form.eventType,
        guests: Number(form.guests),
        productIds: selected,
        notes: form.notes,
        turnstileToken: token,
        website: form.website,
      })
      setDone(res.code)
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : ''
      setBanner(
        code === 'rate_limited'
          ? 'quote.err_rate'
          : code === 'captcha_failed'
            ? 'quote.err_captcha'
            : 'quote.err_generic',
      )
      // El token de Turnstile sirve una sola vez: hay que pedir otro.
      setToken(null)
      resetCaptcha.current()
    } finally {
      setSending(false)
    }
  }

  if (done !== null) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl bg-white p-8 text-center md:p-10">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary text-white">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="m5 12 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h2 ref={successRef} tabIndex={-1} className="mt-5 font-heading text-3xl font-bold outline-none">
          {m['quote.success_title']}
        </h2>
        <p className="mt-3 text-muted" role="status">
          {tf('quote.success_text', { code: done })}
        </p>
        <ButtonLink href={cateringHref} className="mt-6">
          {m['quote.back_catering']}
        </ButtonLink>
      </div>
    )
  }

  const err = (f: Field) => (errors[f] === undefined ? null : m[errors[f]])
  const maxDate = (() => {
    const d = new Date(`${today}T00:00:00Z`)
    d.setUTCFullYear(d.getUTCFullYear() + 1)
    return ymd(d)
  })()
  const minDate = ymd(new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000))

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      className="mx-auto grid max-w-3xl gap-6"
    >
      {banner !== null && (
        <p role="alert" className="rounded-xl bg-blush px-4 py-3 text-sm">
          {m[banner]}
        </p>
      )}

      <fieldset className="grid gap-5 rounded-3xl bg-white p-5 md:grid-cols-2 md:p-8">
        <legend className="sr-only">{m['quote.section_event']}</legend>
        <h2 aria-hidden="true" className="font-heading text-2xl font-bold md:col-span-2">
          {m['quote.section_event']}
        </h2>
        <FormInput
          id="quote-eventDate"
          label={m['quote.event_date']}
          type="date"
          min={minDate}
          max={maxDate}
          value={form.eventDate}
          onChange={set('eventDate')}
          error={err('eventDate')}
        />
        <div>
          <label htmlFor="quote-eventType" className="font-medium">
            {m['quote.event_type']}
          </label>
          <select
            id="quote-eventType"
            value={form.eventType}
            onChange={(e) => set('eventType')(e.target.value)}
            aria-invalid={errors.eventType !== undefined}
            aria-describedby={errors.eventType === undefined ? undefined : 'quote-eventType-error'}
            className={`${inputClass} ${errors.eventType === undefined ? 'border-dark/15' : 'border-toast-error'}`}
          >
            <option value="">{m['quote.choose']}</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {m[`quote.event.${t}`]}
              </option>
            ))}
          </select>
          {errors.eventType !== undefined && (
            <p id="quote-eventType-error" className="mt-1 text-sm text-toast-error">
              {m[errors.eventType]}
            </p>
          )}
        </div>
        <FormInput
          id="quote-guests"
          label={m['quote.guests']}
          type="number"
          inputMode="numeric"
          min={1}
          max={5000}
          value={form.guests}
          onChange={set('guests')}
          error={err('guests')}
        />
        {products.length > 0 && (
          <div className="md:col-span-2">
            <p id="quote-products" className="font-medium">
              {m['quote.products']}
            </p>
            <div role="group" aria-labelledby="quote-products" className="mt-3 flex flex-wrap gap-2">
              {products.map((p) => (
                <ToggleChip
                  key={p.id}
                  tone="catering"
                  pressed={selected.includes(p.id)}
                  onPressedChange={(on) =>
                    setSelected((s) => (on ? [...s, p.id] : s.filter((x) => x !== p.id)))
                  }
                >
                  {p.name}
                </ToggleChip>
              ))}
            </div>
          </div>
        )}
        <div className="md:col-span-2">
          <label htmlFor="quote-notes" className="font-medium">
            {m['quote.notes']}
          </label>
          <textarea
            id="quote-notes"
            rows={4}
            maxLength={2000}
            placeholder={m['quote.notes_placeholder']}
            value={form.notes}
            onChange={(e) => set('notes')(e.target.value)}
            className={`${inputClass} border-dark/15`}
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-5 rounded-3xl bg-white p-5 md:grid-cols-2 md:p-8">
        <legend className="sr-only">{m['quote.section_contact']}</legend>
        <h2 aria-hidden="true" className="font-heading text-2xl font-bold md:col-span-2">
          {m['quote.section_contact']}
        </h2>
        <div className="md:col-span-2">
          <FormInput
            id="quote-name"
            label={m['checkout.name']}
            autoComplete="name"
            value={form.name}
            onChange={set('name')}
            error={err('name')}
          />
        </div>
        <FormInput
          id="quote-phone"
          label={m['checkout.phone']}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={form.phone}
          onChange={set('phone')}
          error={err('phone')}
        />
        <FormInput
          id="quote-email"
          label={m['checkout.email']}
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={set('email')}
          error={err('email')}
        />
        {/* Trampa para bots: invisible para personas y lectores de pantalla. */}
        <div aria-hidden="true" className="absolute -left-[9999px] size-px overflow-hidden">
          <label htmlFor="quote-website">Website</label>
          <input
            id="quote-website"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(e) => set('website')(e.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <p id="quote-captcha" tabIndex={-1} className="sr-only">
            {m['quote.captcha']}
          </p>
          <Turnstile
            siteKey={turnstileSiteKey}
            locale={locale}
            onToken={(t) => {
              setToken(t)
              setErrors(({ captcha: _captcha, ...rest }) => rest)
            }}
            onExpire={() => setToken(null)}
            registerReset={(fn) => {
              resetCaptcha.current = fn
            }}
          />
          {errors.captcha !== undefined && (
            <p className="mt-1 text-sm text-toast-error">{m[errors.captcha]}</p>
          )}
        </div>
      </fieldset>

      <div>
        <Button
          type="submit"
          size="lg"
          loading={sending}
          loadingLabel={m['quote.sending']}
          className="w-full sm:w-auto"
        >
          {m['quote.submit']}
        </Button>
        <p className="mt-3 text-sm text-muted">
          {m['legal.quote_notice'].split('{privacy}')[0]}
          <a href={privacyHref} className="font-semibold text-secondary underline underline-offset-2">
            {m['legal.consent_privacy']}
          </a>
          {m['legal.quote_notice'].split('{privacy}')[1]}
        </p>
      </div>
    </form>
  )
}
