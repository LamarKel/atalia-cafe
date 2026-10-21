// Contrato del formulario de contacto (página Contacto), el mismo en el formulario y en el Worker.
import { z } from '../zod'
import { LOCALES } from '../checkout'

/** Motivo del mensaje. Los textos visibles están en i18n (contact.topic.*). */
export const CONTACT_TOPICS = ['general', 'order', 'catering', 'feedback', 'other'] as const

export type ContactTopic = (typeof CONTACT_TOPICS)[number]

export const CONTACT_MESSAGE_MAX = 2000

export const contactRequestSchema = z.object({
  locale: z.enum(LOCALES),
  name: z.string().trim().min(2, 'name_required').max(80),
  email: z.email('invalid_email').max(254),
  /** Opcional: si lo deja, el negocio puede llamarle. */
  phone: z
    .string()
    .trim()
    .regex(/^(\+?[0-9 ()-]{7,20})?$/, 'invalid_phone')
    .default(''),
  topic: z.enum(CONTACT_TOPICS),
  message: z.string().trim().min(10, 'message_short').max(CONTACT_MESSAGE_MAX, 'message_long'),
  /** Token del widget de Cloudflare Turnstile. */
  turnstileToken: z.string().min(1, 'captcha_required').max(2048),
  /** Trampa para bots: campo oculto que una persona nunca llena. */
  website: z.string().max(0, 'bot').default(''),
})

export type ContactRequest = z.input<typeof contactRequestSchema>
export type ContactRequestParsed = z.output<typeof contactRequestSchema>

export interface ContactResponse {
  code: string
}
