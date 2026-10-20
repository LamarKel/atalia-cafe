import type Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { methodName } from './index'

const pm = (type: string, wallet?: string) =>
  ({
    type,
    card: wallet === undefined ? null : { wallet: { type: wallet } },
  }) as unknown as Stripe.PaymentMethod

describe('methodName', () => {
  it('distingue Apple Pay y Google Pay dentro de card', () => {
    expect(methodName(pm('card'))).toBe('card')
    expect(methodName(pm('card', 'apple_pay'))).toBe('apple_pay')
    expect(methodName(pm('card', 'google_pay'))).toBe('google_pay')
    expect(methodName(pm('klarna'))).toBe('klarna')
    expect(methodName(pm('card', 'link'))).toBe('card')
  })
  it('lo desconocido queda en null para no romper el CHECK de la BD', () => {
    expect(methodName(pm('cashapp'))).toBeNull()
    expect(methodName(null)).toBeNull()
  })
})
