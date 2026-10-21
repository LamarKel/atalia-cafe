import { contactRequestSchema, type ContactRequest } from '@atalia/shared/contact'
import type { StoredRule } from '@atalia/shared/rules'
import { describe, expect, it, vi } from 'vitest'
import type { NewContactMessage, SavedContactMessage } from '../ports'
import { ContactError, submitContact, type ContactDeps } from './submit-contact'

const STORE = '69de0e2e-c905-4d36-93f6-446572005410'

const request: ContactRequest = {
  locale: 'es',
  name: 'Ana Pérez',
  email: 'ana@example.com',
  topic: 'catering',
  message: '¿Hacen bandejas sin gluten?',
  turnstileToken: 'ok',
}

const recipientsRule: StoredRule = {
  key: 'notifications.contact_recipients',
  store_id: null,
  value: ['info@atalia.test'],
  effective_from: '2026-01-01T00:00:00Z',
}

function setup(opts: { captcha?: boolean; recent?: number; rules?: StoredRule[]; mailFails?: boolean } = {}) {
  const created: NewContactMessage[] = []
  const notify = vi.fn<(m: SavedContactMessage, to: string[]) => Promise<void>>(() =>
    opts.mailFails === true ? Promise.reject(new Error('resend down')) : Promise.resolve(),
  )
  const verify = vi.fn(() => Promise.resolve(opts.captcha ?? true))
  const deps: ContactDeps = {
    now: () => new Date('2026-10-21T16:00:00Z'),
    stores: {
      defaultStore: () => Promise.resolve({ id: STORE, timezone: 'America/New_York' }),
      pickupLocationIds: () => Promise.resolve([]),
      termsVersion: () => Promise.resolve(null),
      rules: () => Promise.resolve(opts.rules ?? [recipientsRule]),
    },
    messages: {
      create: (m) => {
        created.push(m)
        return Promise.resolve({ code: 'MS-K7Q2MX' })
      },
      countRecentByEmail: () => Promise.resolve(opts.recent ?? 0),
    },
    captcha: { verify },
    mailer: { notifyBusiness: notify },
  }
  return { deps, created, notify, verify }
}

const parsed = contactRequestSchema.parse(request)

describe('submitContact', () => {
  it('guarda el mensaje y avisa a los destinatarios de la regla', async () => {
    const { deps, created, notify } = setup()
    await expect(submitContact(deps, parsed, '203.0.113.5')).resolves.toEqual({ code: 'MS-K7Q2MX' })
    expect(created).toEqual([
      {
        storeId: STORE,
        name: 'Ana Pérez',
        email: 'ana@example.com',
        phone: '',
        locale: 'es',
        topic: 'catering',
        message: '¿Hacen bandejas sin gluten?',
      },
    ])
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ code: 'MS-K7Q2MX' }), ['info@atalia.test'])
  })

  it('pasa la IP al verificador del anti-bots', async () => {
    const { deps, verify } = setup()
    await submitContact(deps, parsed, '203.0.113.5')
    expect(verify).toHaveBeenCalledWith('ok', '203.0.113.5')
  })

  it('rechaza si el anti-bots no pasa, sin guardar nada', async () => {
    const { deps, created } = setup({ captcha: false })
    await expect(submitContact(deps, parsed, null)).rejects.toEqual(new ContactError('captcha_failed'))
    expect(created).toHaveLength(0)
  })

  it('limita a 3 mensajes por correo en una hora', async () => {
    const { deps, created } = setup({ recent: 3 })
    await expect(submitContact(deps, parsed, null)).rejects.toEqual(new ContactError('too_many_requests'))
    expect(created).toHaveLength(0)
  })

  it('sin destinatarios, el mensaje igual se guarda y no se manda correo', async () => {
    const { deps, created, notify } = setup({ rules: [] })
    await expect(submitContact(deps, parsed, null)).resolves.toEqual({ code: 'MS-K7Q2MX' })
    expect(created).toHaveLength(1)
    expect(notify).not.toHaveBeenCalled()
  })

  it('si el correo falla, el mensaje no se pierde', async () => {
    const { deps, created } = setup({ mailFails: true })
    await expect(submitContact(deps, parsed, null)).resolves.toEqual({ code: 'MS-K7Q2MX' })
    expect(created).toHaveLength(1)
  })
})
