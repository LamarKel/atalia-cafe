import { quoteRequestSchema, type QuoteRequest } from '@atalia/shared/quotes'
import type { StoredRule } from '@atalia/shared/rules'
import { describe, expect, it, vi } from 'vitest'
import type { CatalogProduct } from '../../orders/domain/pricing'
import type { NewQuote, SavedQuote } from '../ports'
import { QuoteError, submitQuote, type QuoteDeps } from './submit-quote'

const TABLE = '00000000-0000-4000-8000-000000000004'
const STORE = '69de0e2e-c905-4d36-93f6-446572005410'
const PICKUP = '5b0f2a51-7c3e-4e0f-9a51-0c1d6a3e0002'

const table: CatalogProduct = {
  id: TABLE,
  type: 'table',
  nameEn: 'Event table',
  nameEs: 'Mesa para eventos',
  priceCents: null,
  minLeadHours: 48,
  active: true,
  sizes: [],
  extras: [],
}

const request: QuoteRequest = {
  locale: 'es',
  customer: { name: 'Ana Pérez', phone: '+1 973 555 0100', email: 'ana@example.com' },
  eventDate: '2026-12-12',
  eventType: 'wedding',
  guests: 120,
  productIds: [TABLE, '00000000-0000-4000-8000-0000000000ff'],
  notes: 'Boda en la tarde',
  turnstileToken: 'ok',
}

const recipientsRule: StoredRule = {
  key: 'notifications.order_recipients',
  store_id: null,
  value: ['pedidos@atalia.test'],
  effective_from: '2026-01-01T00:00:00Z',
}

function setup(opts: { captcha?: boolean; recent?: number; rules?: StoredRule[] } = {}) {
  const created: NewQuote[] = []
  const business = vi.fn<(q: SavedQuote, to: string[]) => Promise<void>>(() => Promise.resolve())
  const customer = vi.fn<(q: SavedQuote) => Promise<void>>(() => Promise.resolve())
  const deps: QuoteDeps = {
    now: () => new Date('2026-10-18T16:00:00Z'),
    stores: {
      defaultStore: () => Promise.resolve({ id: STORE, timezone: 'America/New_York' }),
      pickupLocationIds: () => Promise.resolve([PICKUP]),
      rules: () => Promise.resolve(opts.rules ?? [recipientsRule]),
    },
    catalog: {
      products: (ids) => Promise.resolve(new Map(ids.includes(TABLE) ? [[TABLE, table]] : [])),
      pieces: () => Promise.resolve(new Map()),
    },
    quotes: {
      create: (q) => {
        created.push(q)
        return Promise.resolve({ code: 'CT-K7Q2MX' })
      },
      countRecentByEmail: () => Promise.resolve(opts.recent ?? 0),
    },
    captcha: { verify: () => Promise.resolve(opts.captcha ?? true) },
    mailer: { notifyBusiness: business, confirmToCustomer: customer },
  }
  return { deps, created, business, customer }
}

const run = (deps: QuoteDeps, over: Partial<QuoteRequest> = {}) =>
  submitQuote(deps, quoteRequestSchema.parse({ ...request, ...over }), '203.0.113.7')

describe('submitQuote', () => {
  it('guarda la solicitud y manda un correo al negocio y otro al cliente', async () => {
    const { deps, created, business, customer } = setup()
    expect(await run(deps)).toEqual({ code: 'CT-K7Q2MX' })
    expect(created[0]).toMatchObject({
      storeId: STORE,
      guests: 120,
      eventType: 'wedding',
      products: [{ productId: TABLE, name: 'Mesa para eventos' }],
    })
    expect(business).toHaveBeenCalledWith(expect.objectContaining({ code: 'CT-K7Q2MX' }), [
      'pedidos@atalia.test',
    ])
    expect(customer).toHaveBeenCalledOnce()
  })

  it('rechaza si Turnstile dice que no es una persona, sin guardar nada', async () => {
    const { deps, created } = setup({ captcha: false })
    await expect(run(deps)).rejects.toEqual(new QuoteError('captcha_failed'))
    expect(created).toHaveLength(0)
  })

  it('limita a 3 solicitudes por correo por hora', async () => {
    await expect(run(setup({ recent: 3 }).deps)).rejects.toEqual(new QuoteError('too_many_requests'))
  })

  it('la fecha del evento tiene que ser futura (en la hora de la tienda)', async () => {
    await expect(run(setup().deps, { eventDate: '2026-10-18' })).rejects.toEqual(
      new QuoteError('invalid_event_date'),
    )
  })

  it('si el correo falla, la cotización igual queda guardada', async () => {
    const { deps, created } = setup()
    deps.mailer.confirmToCustomer = () => Promise.reject(new Error('resend down'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await run(deps)).toEqual({ code: 'CT-K7Q2MX' })
    expect(created).toHaveLength(1)
    log.mockRestore()
  })

  it('sin destinatarios configurados solo avisa al cliente', async () => {
    const { deps, business, customer } = setup({ rules: [] })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await run(deps)
    expect(business).not.toHaveBeenCalled()
    expect(customer).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
