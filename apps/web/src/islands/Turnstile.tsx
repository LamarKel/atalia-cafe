// Widget de Cloudflare Turnstile (anti-bots) de los formularios públicos: cotización y contacto.
// El token sirve una sola vez; tras un envío fallido el formulario llama al reset que registra.
import { useEffect, useId, useRef } from 'react'
import type { Locale } from '../i18n'

interface TurnstileApi {
  render(
    el: HTMLElement,
    opts: {
      sitekey: string
      language: string
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
    },
  ): string
  reset(id: string): void
  remove(id: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

function loadTurnstile(): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    if (window.turnstile !== undefined) {
      resolve(window.turnstile)
      return
    }
    let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
    if (script === null) {
      script = document.createElement('script')
      script.src = SCRIPT_SRC
      script.async = true
      document.head.appendChild(script)
    }
    script.addEventListener('load', () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')),
    )
    script.addEventListener('error', () => reject(new Error('turnstile')))
  })
}

export function Turnstile(props: {
  siteKey: string
  locale: Locale
  onToken: (token: string) => void
  onExpire: () => void
  registerReset: (fn: () => void) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  const { siteKey, locale, onToken, onExpire, registerReset } = props
  useEffect(() => {
    let widget: string | null = null
    let api: TurnstileApi | null = null
    let cancelled = false
    loadTurnstile()
      .then((t) => {
        if (cancelled || ref.current === null) return
        api = t
        widget = t.render(ref.current, {
          sitekey: siteKey,
          language: locale,
          callback: onToken,
          'expired-callback': onExpire,
          'error-callback': onExpire,
        })
        registerReset(() => {
          if (widget !== null) t.reset(widget)
        })
      })
      .catch(() => onExpire())
    return () => {
      cancelled = true
      if (api !== null && widget !== null) api.remove(widget)
    }
    // El widget se monta una vez; los callbacks no cambian de comportamiento.
  }, [siteKey, locale])
  return <div ref={ref} id={id} className="min-h-16" />
}
