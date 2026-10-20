import { describe, expect, it } from 'vitest'
import { isValidEventDate, quoteRequestSchema } from './index'

const base = {
  locale: 'es',
  customer: { name: 'Ana Pérez', phone: '+1 973 555 0100', email: 'ana@example.com' },
  eventDate: '2026-12-12',
  eventType: 'wedding',
  guests: 120,
  turnstileToken: 'tok',
} as const

describe('cotización', () => {
  it('acepta una solicitud completa', () => {
    expect(quoteRequestSchema.parse(base)).toMatchObject({
      guests: 120,
      productIds: [],
      notes: '',
      website: '',
    })
  })
  it('rechaza bots que llenan el campo trampa y tipos de evento inventados', () => {
    expect(quoteRequestSchema.safeParse({ ...base, website: 'http://spam' }).success).toBe(false)
    expect(quoteRequestSchema.safeParse({ ...base, eventType: 'rave' }).success).toBe(false)
    expect(quoteRequestSchema.safeParse({ ...base, turnstileToken: '' }).success).toBe(false)
    expect(quoteRequestSchema.safeParse({ ...base, guests: 0 }).success).toBe(false)
  })
  it('la fecha del evento va de mañana a un año', () => {
    expect(isValidEventDate('2026-10-18', '2026-10-18')).toBe(false)
    expect(isValidEventDate('2026-10-19', '2026-10-18')).toBe(true)
    expect(isValidEventDate('2027-10-18', '2026-10-18')).toBe(true)
    expect(isValidEventDate('2027-10-19', '2026-10-18')).toBe(false)
  })
})
