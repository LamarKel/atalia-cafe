import { describe, expect, it } from 'vitest'
import { contactRequestSchema, type ContactRequest } from './index'

const valid: ContactRequest = {
  locale: 'es',
  name: 'Ana Pérez',
  email: 'ana@example.com',
  topic: 'general',
  message: '¿Tienen leche de almendras?',
  turnstileToken: 'ok',
}

const issues = (input: ContactRequest) => {
  const r = contactRequestSchema.safeParse(input)
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}:${i.message}`)
}

describe('contactRequestSchema', () => {
  it('acepta un mensaje válido sin teléfono', () => {
    const r = contactRequestSchema.parse(valid)
    expect(r.phone).toBe('')
    expect(r.website).toBe('')
  })

  it('acepta un teléfono opcional con formato válido', () => {
    expect(issues({ ...valid, phone: '+1 (973) 555-0100' })).toEqual([])
  })

  it('rechaza un teléfono con letras', () => {
    expect(issues({ ...valid, phone: 'llámame' })).toEqual(['phone:invalid_phone'])
  })

  it('pide al menos 10 caracteres de mensaje (sin contar espacios)', () => {
    expect(issues({ ...valid, message: '   hola   ' })).toEqual(['message:message_short'])
  })

  it('limita el mensaje a 2000 caracteres', () => {
    expect(issues({ ...valid, message: 'a'.repeat(2001) })).toEqual(['message:message_long'])
  })

  it('rechaza un motivo que no existe', () => {
    expect(issues({ ...valid, topic: 'spam' as ContactRequest['topic'] })).toHaveLength(1)
  })

  it('rechaza si un bot llenó el campo oculto', () => {
    expect(issues({ ...valid, website: 'http://spam.example' })).toEqual(['website:bot'])
  })

  it('exige el token del anti-bots', () => {
    expect(issues({ ...valid, turnstileToken: '' })).toEqual(['turnstileToken:captcha_required'])
  })
})
