// Puertos del formulario de contacto. Los adaptadores viven en adapters/.
import type { ContactTopic } from '@atalia/shared/contact'

export interface NewContactMessage {
  storeId: string
  name: string
  email: string
  /** Vacío si no lo dejó. */
  phone: string
  locale: 'en' | 'es'
  topic: ContactTopic
  message: string
}

export interface SavedContactMessage extends NewContactMessage {
  code: string
}

export interface ContactRepo {
  create(message: NewContactMessage): Promise<{ code: string }>
  /** Cuántos mensajes mandó este correo desde `sinceIso` (límite contra abuso). */
  countRecentByEmail(email: string, sinceIso: string): Promise<number>
}

export interface ContactMailer {
  /** Al negocio, con reply_to del cliente para responder directo. */
  notifyBusiness(message: SavedContactMessage, recipients: string[]): Promise<void>
}
