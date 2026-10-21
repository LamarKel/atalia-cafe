// Formulario de contacto (página Contacto). Sin pantalla propia en el diseño: sigue el lenguaje de la
// cotización (tarjeta blanca, campos redondeados). Se envía al Worker, nunca directo a la BD.
import {
  CONTACT_MESSAGE_MAX,
  CONTACT_TOPICS,
  contactRequestSchema,
  type ContactTopic,
} from '@atalia/shared/contact'
import { Button } from '@atalia/ui'
import { useEffect, useRef, useState } from 'react'
import { FormInput, inputClass } from './FormInput'
import { Turnstile } from './Turnstile'
import { ApiRequestError, api } from '../lib/api'
import type { Locale, MessageKey } from '../i18n'

export interface ContactFormProps {
  locale: Locale
  messages: Record<MessageKey, string>
  turnstileSiteKey: string
  /** Política de privacidad (aviso junto al botón de enviar). */
  privacyHref: string
}

type Field = 'name' | 'email' | 'phone' | 'message' | 'captcha'
type Errors = Partial<Record<Field, MessageKey>>

const ERROR_KEY: Record<Exclude<Field, 'captcha'>, MessageKey> = {
  name: 'contactform.err_name',
  email: 'contactform.err_email',
  phone: 'contactform.err_phone',
  message: 'contactform.err_message',
}

const EMPTY = { name: '', email: '', phone: '', topic: 'general' as ContactTopic, message: '', website: '' }

export default function ContactForm({
  locale,
  messages: m,
  turnstileSiteKey,
  privacyHref,
}: ContactFormProps) {
  const [form, setForm] = useState(EMPTY)
  const [token, setToken] = useState<string | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [banner, setBanner] = useState<MessageKey | null>(null)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const resetCaptcha = useRef<() => void>(() => undefined)
  const successRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (done !== null) successRef.current?.focus()
  }, [done])

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }))

  // La misma validación que el Worker (packages/shared/contact); el token se revisa aparte.
  const validate = (): Errors => {
    const parsed = contactRequestSchema.safeParse({ ...form, locale, turnstileToken: token ?? '' })
    const next: Errors = {}
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const f = issue.path[0]
        if (f === 'name' || f === 'email' || f === 'phone' || f === 'message') next[f] = ERROR_KEY[f]
      }
    }
    if (token === null) next.captcha = 'quote.err_captcha'
    return next
  }

  // Un error marcado se quita apenas el dato queda bien (no aparecen errores nuevos mientras escribe).
  useEffect(() => {
    setErrors((prev) => {
      if (Object.keys(prev).length === 0) return prev
      const failing = validate()
      const next: Errors = {}
      for (const [field, key] of Object.entries(prev) as [Field, MessageKey][]) {
        if (failing[field] !== undefined) next[field] = key
      }
      return Object.keys(next).length === Object.keys(prev).length ? prev : next
    })
    // validate lee form y token: por eso son las dependencias
  }, [form, token])

  const submit = async () => {
    setBanner(null)
    const next = validate()
    setErrors(next)
    const first = (['name', 'email', 'phone', 'message', 'captcha'] as const).find(
      (f) => next[f] !== undefined,
    )
    if (first !== undefined) {
      document.getElementById(`contact-${first}`)?.focus()
      return
    }
    if (token === null) return
    setSending(true)
    try {
      const res = await api.contact({ ...form, locale, turnstileToken: token })
      setDone(res.code)
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : ''
      setBanner(
        code === 'rate_limited'
          ? 'contactform.err_rate'
          : code === 'captcha_failed'
            ? 'quote.err_captcha'
            : 'contactform.err_generic',
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
      <div className="rounded-3xl bg-white p-8 text-center md:p-10">
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
          {m['contactform.success_title']}
        </h2>
        <p className="mt-3 text-muted" role="status">
          {m['contactform.success_text'].replace('{code}', done)}
        </p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={() => {
            setForm(EMPTY)
            setToken(null)
            setDone(null)
          }}
        >
          {m['contactform.another']}
        </Button>
      </div>
    )
  }

  const err = (f: Field) => (errors[f] === undefined ? null : m[errors[f]])
  const count = form.message.trim().length

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      className="grid gap-5 rounded-3xl bg-white p-5 md:grid-cols-2 md:p-8"
      aria-labelledby="contact-form-title"
    >
      <div className="md:col-span-2">
        <h2 id="contact-form-title" className="font-heading text-3xl font-bold">
          {m['contactform.title']}
        </h2>
        <p className="mt-2 text-muted">{m['contactform.subtitle']}</p>
      </div>

      {banner !== null && (
        <p role="alert" className="rounded-xl bg-blush px-4 py-3 text-sm md:col-span-2">
          {m[banner]}
        </p>
      )}

      <div className="md:col-span-2">
        <FormInput
          id="contact-name"
          label={m['contactform.name']}
          autoComplete="name"
          value={form.name}
          onChange={set('name')}
          error={err('name')}
        />
      </div>
      <FormInput
        id="contact-email"
        label={m['contactform.email']}
        type="email"
        autoComplete="email"
        value={form.email}
        onChange={set('email')}
        error={err('email')}
      />
      <FormInput
        id="contact-phone"
        label={m['contactform.phone']}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required={false}
        value={form.phone}
        onChange={set('phone')}
        error={err('phone')}
      />
      <div className="md:col-span-2">
        <label htmlFor="contact-topic" className="font-medium">
          {m['contactform.topic']}
        </label>
        <select
          id="contact-topic"
          value={form.topic}
          onChange={(e) => set('topic')(e.target.value)}
          className={`${inputClass} border-dark/15`}
        >
          {CONTACT_TOPICS.map((t) => (
            <option key={t} value={t}>
              {m[`contactform.topic.${t}`]}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-2">
        <label htmlFor="contact-message" className="font-medium">
          {m['contactform.message']}
        </label>
        <textarea
          id="contact-message"
          rows={6}
          maxLength={CONTACT_MESSAGE_MAX}
          value={form.message}
          onChange={(e) => set('message')(e.target.value)}
          required
          aria-invalid={errors.message !== undefined}
          aria-describedby={`contact-message-count${errors.message === undefined ? '' : ' contact-message-error'}`}
          className={`${inputClass} ${errors.message === undefined ? 'border-dark/15' : 'border-toast-error'}`}
        />
        <div className="mt-1 flex justify-between gap-3 text-sm">
          {errors.message !== undefined ? (
            <p id="contact-message-error" className="text-toast-error">
              {m[errors.message]}
            </p>
          ) : (
            <span />
          )}
          <p id="contact-message-count" className="shrink-0 tabular-nums text-muted">
            {m['contactform.message_count']
              .replace('{n}', String(count))
              .replace('{max}', String(CONTACT_MESSAGE_MAX))}
          </p>
        </div>
      </div>

      {/* Trampa para bots: invisible para personas y lectores de pantalla. */}
      <div aria-hidden="true" className="absolute -left-[9999px] size-px overflow-hidden">
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={(e) => set('website')(e.target.value)}
        />
      </div>

      <div className="md:col-span-2">
        <p id="contact-captcha" tabIndex={-1} className="sr-only">
          {m['quote.captcha']}
        </p>
        <Turnstile
          siteKey={turnstileSiteKey}
          locale={locale}
          onToken={setToken}
          onExpire={() => setToken(null)}
          registerReset={(fn) => {
            resetCaptcha.current = fn
          }}
        />
        {errors.captcha !== undefined && <p className="mt-1 text-sm text-toast-error">{m[errors.captcha]}</p>}
      </div>

      <div className="md:col-span-2">
        <Button
          type="submit"
          size="lg"
          loading={sending}
          loadingLabel={m['contactform.sending']}
          className="w-full sm:w-auto"
        >
          {m['contactform.submit']}
        </Button>
        <p className="mt-3 text-sm text-muted">
          {m['contactform.notice'].split('{privacy}')[0]}
          <a href={privacyHref} className="font-semibold text-secondary underline underline-offset-2">
            {m['legal.consent_privacy']}
          </a>
          {m['contactform.notice'].split('{privacy}')[1]}
        </p>
      </div>
    </form>
  )
}
