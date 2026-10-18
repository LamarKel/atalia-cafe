import { describe, expect, it } from 'vitest'
import type { SavedQuote } from '../../modules/quotes/ports'
import { businessQuoteEmail, customerQuoteEmail } from './quotes'

const quote: SavedQuote = {
  code: 'CT-K7Q2MX',
  storeId: 's',
  customer: { name: 'Ana <script>', phone: '+1 973 555 0100', email: 'ana@example.com' },
  locale: 'en',
  eventDate: '2026-12-12',
  eventType: 'wedding',
  guests: 120,
  products: [{ productId: 'p', name: 'Mesa para eventos' }],
  notes: 'Boda\nen la tarde',
}

describe('correos de cotización', () => {
  it('al negocio: todos los datos, en su idioma, y escapa HTML', () => {
    const mail = businessQuoteEmail(quote, 'es')
    expect(mail.subject).toBe('Nueva cotización CT-K7Q2MX · 120 invitados')
    expect(mail.html).toContain('Boda')
    expect(mail.html).toContain('sábado, 12 de diciembre de 2026')
    expect(mail.html).toContain('ana@example.com')
    expect(mail.html).toContain('Ana &lt;script&gt;')
    expect(mail.html).not.toContain('<script>')
  })
  it('al cliente: en el idioma que eligió, sin repetir sus datos de contacto', () => {
    const mail = customerQuoteEmail(quote)
    expect(mail.subject).toBe('We received your quote request CT-K7Q2MX · Atalia Café')
    expect(mail.text).toContain('Wedding')
    expect(mail.text).not.toContain('+1 973 555 0100')
  })
})
