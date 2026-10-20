import { describe, expect, it } from 'vitest'
import { required } from './config'
import type { Bindings } from './http/app'

const env = (over: Partial<Bindings>): Bindings => ({
  ENVIRONMENT: 'production',
  ALLOWED_ORIGINS: '',
  ...over,
})

describe('variables del Worker', () => {
  it('exige que existan', () => {
    expect(() => required(env({}), 'STRIPE_SECRET_KEY')).toThrow('Falta la variable STRIPE_SECRET_KEY')
  })

  it('en producción rechaza las claves de prueba de Stripe y Turnstile', () => {
    expect(() => required(env({ STRIPE_SECRET_KEY: 'sk_test_abc' }), 'STRIPE_SECRET_KEY')).toThrow(
      'clave de prueba',
    )
    expect(() =>
      required(env({ TURNSTILE_SECRET: '1x0000000000000000000000000000000AA' }), 'TURNSTILE_SECRET'),
    ).toThrow('clave de prueba')
    expect(required(env({ STRIPE_SECRET_KEY: 'sk_live_abc' }), 'STRIPE_SECRET_KEY')).toBe('sk_live_abc')
  })

  it('en desarrollo y staging las acepta', () => {
    expect(
      required(env({ ENVIRONMENT: 'staging', STRIPE_SECRET_KEY: 'sk_test_abc' }), 'STRIPE_SECRET_KEY'),
    ).toBe('sk_test_abc')
  })
})
