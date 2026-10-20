// Variables del Worker. En producción se niega a usar claves de prueba: un cobro de verdad nunca debe
// pasar por la cuenta de pruebas de Stripe ni la cotización por el captcha de prueba (que siempre aprueba).
import type { Bindings } from './http/app'

const TEST_VALUES: Partial<Record<keyof Bindings, RegExp>> = {
  STRIPE_SECRET_KEY: /^sk_test_/,
  // Claves de prueba públicas de Cloudflare Turnstile: 1x… (siempre pasa), 2x… (siempre falla), 3x…
  TURNSTILE_SECRET: /^[123]x0{20,}/,
}

export function required(env: Bindings, key: keyof Bindings): string {
  const value = env[key]
  if (typeof value !== 'string' || value === '') throw new Error(`Falta la variable ${key}`)
  if (env.ENVIRONMENT === 'production' && TEST_VALUES[key]?.test(value) === true) {
    throw new Error(`${key} es una clave de prueba; en producción hace falta la real`)
  }
  return value
}
