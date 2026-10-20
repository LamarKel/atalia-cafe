// Verificación de Cloudflare Turnstile en el servidor (RF-Q04). El token del navegador sirve una sola vez.
import type { CaptchaVerifier } from '../../modules/quotes/ports'

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export function turnstileVerifier(secret: string): CaptchaVerifier {
  return {
    async verify(token, remoteIp) {
      const body = new FormData()
      body.append('secret', secret)
      body.append('response', token)
      if (remoteIp !== null) body.append('remoteip', remoteIp)
      const res = await fetch(VERIFY_URL, { method: 'POST', body })
      if (!res.ok) return false
      const data = (await res.json()) as { success?: boolean }
      return data.success === true
    },
  }
}
