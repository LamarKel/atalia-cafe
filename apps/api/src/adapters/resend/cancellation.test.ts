import { describe, expect, it } from 'vitest'
import { cancellationEmail } from './cancellation'

const base = {
  code: 'AT-K7Q2MX',
  customerName: 'Ana <b>',
  customerEmail: 'ana@example.com',
  locale: 'es' as const,
  scheduledFor: '2026-10-21T15:00:00Z',
  timezone: 'America/New_York',
  refundCents: 10_663,
  message: 'Se nos dañó el horno.',
}

describe('correo de cancelación', () => {
  it('en el idioma del cliente, con el reembolso, la hora local y el mensaje (escapado)', () => {
    const m = cancellationEmail(base)
    expect(m.subject).toBe('Tu pedido AT-K7Q2MX de Atalia Café fue cancelado')
    expect(m.text).toContain('$106.63')
    expect(m.text).toContain('11:00')
    expect(m.text).toContain('Se nos dañó el horno.')
    expect(m.html).toContain('Ana &lt;b&gt;')
    expect(m.html).not.toContain('<b>,')
  })

  it('sin reembolso ni mensaje no menciona montos', () => {
    const m = cancellationEmail({ ...base, locale: 'en', refundCents: 0, message: '' })
    expect(m.subject).toBe('Your Atalia Café order AT-K7Q2MX was cancelled')
    expect(m.text).not.toContain('$')
    expect(m.text).not.toContain('Message from')
  })
})
