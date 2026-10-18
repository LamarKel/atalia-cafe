// "Pide una cotización": verifica que sea una persona, limita abusos, guarda y avisa por correo.
// Los correos no pueden perder la solicitud: si fallan, la cotización queda guardada y se ve en el admin.
import { isValidEventDate, type QuoteRequestParsed, type QuoteResponse } from '@atalia/shared/quotes'
import { getRule } from '@atalia/shared/rules'
import type { CatalogRepo, StoreRepo } from '../../payments/ports'
import type { CaptchaVerifier, QuoteMailer, QuotesRepo, SavedQuote } from '../ports'

export type QuoteErrorCode = 'captcha_failed' | 'too_many_requests' | 'invalid_event_date'

export class QuoteError extends Error {
  override readonly name = 'QuoteError'
  constructor(readonly code: QuoteErrorCode) {
    super(code)
  }
}

export interface QuoteDeps {
  stores: StoreRepo
  catalog: CatalogRepo
  quotes: QuotesRepo
  captcha: CaptchaVerifier
  mailer: QuoteMailer
  now?: () => Date
}

/** Máximo de solicitudes por correo en una hora (RF-Q04). El límite por IP va en el WAF (Fase 5). */
const MAX_PER_HOUR = 3

/** "2026-10-18" en la zona horaria de la tienda. */
function todayIn(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now)
}

export async function submitQuote(
  deps: QuoteDeps,
  req: QuoteRequestParsed,
  remoteIp: string | null,
): Promise<QuoteResponse> {
  const now = deps.now?.() ?? new Date()
  if (!(await deps.captcha.verify(req.turnstileToken, remoteIp))) throw new QuoteError('captcha_failed')

  const store = await deps.stores.defaultStore()
  if (!isValidEventDate(req.eventDate, todayIn(store.timezone, now)))
    throw new QuoteError('invalid_event_date')

  const since = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
  if ((await deps.quotes.countRecentByEmail(req.customer.email, since)) >= MAX_PER_HOUR) {
    throw new QuoteError('too_many_requests')
  }

  // Solo productos que existen; el nombre se guarda en el idioma del cliente.
  const catalog = await deps.catalog.products([...new Set(req.productIds)])
  const products = [...catalog.values()].map((p) => ({
    productId: p.id,
    name: req.locale === 'es' && p.nameEs ? p.nameEs : p.nameEn,
  }))

  const quote = {
    storeId: store.id,
    customer: req.customer,
    locale: req.locale,
    eventDate: req.eventDate,
    eventType: req.eventType,
    guests: req.guests,
    products,
    notes: req.notes,
  }
  const { code } = await deps.quotes.create(quote)
  const saved: SavedQuote = { ...quote, code }

  const recipients = getRule('notifications.order_recipients', await deps.stores.rules(store.id), {
    storeId: store.id,
    at: now,
  })
  const results = await Promise.allSettled([
    recipients.length > 0 ? deps.mailer.notifyBusiness(saved, recipients) : Promise.resolve(),
    deps.mailer.confirmToCustomer(saved),
  ])
  for (const r of results) {
    if (r.status === 'rejected') console.error('[quotes] no se pudo enviar un correo', code, r.reason)
  }
  if (recipients.length === 0) {
    console.warn('[quotes] notifications.order_recipients está vacía: el negocio no recibió el correo', code)
  }

  return { code }
}
