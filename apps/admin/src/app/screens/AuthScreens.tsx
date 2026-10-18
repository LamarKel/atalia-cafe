// Pantallas de acceso: iniciar sesión, activar 2FA (QR) y escribir el código. Mismo lenguaje visual que el sitio.
import { Button } from '@atalia/ui'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { useI18n } from '../i18n-context'

function AuthCard({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  const { t, toggle } = useI18n()
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-accent px-4 py-10">
      <div className="w-full max-w-md">
        <p className="mb-6 text-center font-heading text-3xl font-bold text-secondary">{t('app.title')}</p>
        <section className="rounded-3xl bg-white p-6 shadow-sm md:p-8">
          <h1 className="font-heading text-2xl font-bold text-dark">{title}</h1>
          <p className="mt-2 text-muted">{text}</p>
          {children}
        </section>
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={toggle}
            className="min-h-11 px-3 text-sm text-secondary underline underline-offset-2"
          >
            {t('lang.switch')}
          </button>
        </div>
      </div>
    </main>
  )
}

const inputClass =
  'mt-2 block min-h-11 w-full rounded-xl border border-dark/15 bg-white px-4 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary'

export function LoginScreen() {
  const { t } = useI18n()
  const emailId = useId()
  const passwordId = useId()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (err) setError(err.status === 429 ? t('login.rate') : t('login.error'))
  }

  return (
    <AuthCard title={t('login.title')} text={t('login.subtitle')}>
      <form onSubmit={(e) => void submit(e)} className="mt-6 grid gap-4">
        <div>
          <label htmlFor={emailId} className="font-medium">
            {t('login.email')}
          </label>
          <input
            id={emailId}
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={passwordId} className="font-medium">
            {t('login.password')}
          </label>
          <div className="relative">
            <input
              id={passwordId}
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} pr-14`}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? t('login.hide') : t('login.show')}
              aria-pressed={show}
              className="absolute right-1 top-1/2 mt-1 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-dark focus-visible:outline-2 focus-visible:outline-secondary"
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
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                {show && <path d="M4 4l16 16" />}
              </svg>
            </button>
          </div>
        </div>
        {error !== null && (
          <p role="alert" className="rounded-xl bg-blush px-4 py-3 text-sm">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" fullWidth loading={busy} loadingLabel={t('app.loading')}>
          {t('login.submit')}
        </Button>
      </form>
    </AuthCard>
  )
}

function CodeForm({
  onSubmit,
  busy,
  error,
}: {
  onSubmit: (code: string) => void
  busy: boolean
  error: string | null
}) {
  const { t } = useI18n()
  const id = useId()
  const [code, setCode] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(code)
      }}
      className="mt-6 grid gap-4"
    >
      <div>
        <label htmlFor={id} className="font-medium">
          {t('mfa.code')}
        </label>
        <input
          ref={ref}
          id={id}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className={`${inputClass} text-center font-heading text-2xl tracking-[0.5em]`}
        />
      </div>
      {error !== null && (
        <p role="alert" className="rounded-xl bg-blush px-4 py-3 text-sm">
          {error}
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={busy}
        loadingLabel={t('app.loading')}
        disabled={code.length !== 6}
      >
        {t('mfa.verify')}
      </Button>
    </form>
  )
}

export function EnrollMfaScreen({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  const [factor, setFactor] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  const failText = useRef(t('dash.error'))

  useEffect(() => {
    // Una sola activación por pantalla (si no, cada render crearía un factor nuevo).
    if (started.current) return
    started.current = true
    void (async () => {
      // Limpia intentos de activación que quedaron a medias (factores sin verificar).
      const { data: list } = await supabase.auth.mfa.listFactors()
      for (const f of list?.all.filter((x) => x.status === 'unverified') ?? []) {
        await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const { data, error: err } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Atalia ${String(Date.now())}`,
      })
      if (err || data === null) setError(failText.current)
      else setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
    })()
  }, [])

  const verify = async (code: string) => {
    if (factor === null) return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
    setBusy(false)
    if (err) setError(t('mfa.error'))
    else onDone()
  }

  return (
    <AuthCard title={t('mfa.enroll_title')} text={t('mfa.enroll_text')}>
      {factor === null ? (
        <p className="mt-6 text-muted" role="status">
          {error ?? t('app.loading')}
        </p>
      ) : (
        <>
          <img
            src={factor.qr}
            alt={t('mfa.qr_alt')}
            className="mx-auto mt-6 size-48 rounded-xl border border-dark/10 bg-white p-2"
          />
          <p className="mt-4 text-sm text-muted">{t('mfa.secret')}</p>
          <p className="mt-1 select-all break-all rounded-xl bg-sand px-4 py-2 font-mono text-sm">
            {factor.secret}
          </p>
          <CodeForm onSubmit={(c) => void verify(c)} busy={busy} error={error} />
        </>
      )}
    </AuthCard>
  )
}

export function VerifyMfaScreen({ factorId, onDone }: { factorId: string; onDone: () => void }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const verify = async (code: string) => {
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    setBusy(false)
    if (err) setError(t('mfa.error'))
    else onDone()
  }
  return (
    <AuthCard title={t('mfa.verify_title')} text={t('mfa.verify_text')}>
      <CodeForm onSubmit={(c) => void verify(c)} busy={busy} error={error} />
    </AuthCard>
  )
}

export function NotAdminScreen({ onSignOut }: { onSignOut: () => void }) {
  const { t } = useI18n()
  return (
    <AuthCard title={t('auth.not_admin_title')} text={t('auth.not_admin_text')}>
      <div className="mt-6">
        <Button variant="outline" fullWidth onClick={onSignOut}>
          {t('auth.signout')}
        </Button>
      </div>
    </AuthCard>
  )
}
