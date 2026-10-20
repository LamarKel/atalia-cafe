// Puertos de las cotizaciones (RF-Q01–Q05). Los adaptadores viven en adapters/.
import type { EventType } from '@atalia/shared/quotes'

export interface NewQuote {
  storeId: string
  customer: { name: string; phone: string; email: string }
  locale: 'en' | 'es'
  eventDate: string
  eventType: EventType
  guests: number
  products: Array<{ productId: string; name: string }>
  notes: string
}

export interface SavedQuote extends NewQuote {
  code: string
}

export interface QuotesRepo {
  create(quote: NewQuote): Promise<{ code: string }>
  /** Cuántas solicitudes mandó este correo desde `sinceIso` (límite contra abuso). */
  countRecentByEmail(email: string, sinceIso: string): Promise<number>
}

export interface CaptchaVerifier {
  verify(token: string, remoteIp: string | null): Promise<boolean>
}

export interface QuoteMailer {
  /** Al negocio, con todos los datos para responder. */
  notifyBusiness(quote: SavedQuote, recipients: string[]): Promise<void>
  /** Al cliente: "recibimos tu solicitud". */
  confirmToCustomer(quote: SavedQuote): Promise<void>
}
