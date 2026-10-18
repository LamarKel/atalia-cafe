// Contrato de "Pide una cotización" (PLAN.md RF-Q01–Q05), el mismo en el formulario y en el Worker.
import { z } from 'zod'
import { customerSchema, LOCALES } from '../checkout'

/** Tipos de evento del formulario. Los textos visibles están en i18n (quote.event.*). */
export const EVENT_TYPES = [
  'birthday',
  'wedding',
  'baby_shower',
  'baptism',
  'graduation',
  'corporate',
  'other',
] as const

export type EventType = (typeof EVENT_TYPES)[number]

export const quoteRequestSchema = z.object({
  locale: z.enum(LOCALES),
  customer: customerSchema,
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date'),
  eventType: z.enum(EVENT_TYPES),
  guests: z.number().int().min(1, 'invalid_guests').max(5000, 'invalid_guests'),
  productIds: z.array(z.uuid()).max(10).default([]),
  notes: z.string().trim().max(2000).default(''),
  /** Token del widget de Cloudflare Turnstile (RF-Q04). */
  turnstileToken: z.string().min(1, 'captcha_required').max(2048),
  /** Trampa para bots: campo oculto que una persona nunca llena. */
  website: z.string().max(0, 'bot').default(''),
})

export type QuoteRequest = z.input<typeof quoteRequestSchema>
export type QuoteRequestParsed = z.output<typeof quoteRequestSchema>

export interface QuoteResponse {
  code: string
}

/** Fecha del evento válida: desde mañana y como máximo a un año (en la zona de la tienda). */
export function isValidEventDate(eventDate: string, today: string): boolean {
  if (eventDate <= today) return false
  const limit = new Date(`${today}T00:00:00Z`)
  limit.setUTCFullYear(limit.getUTCFullYear() + 1)
  return eventDate <= limit.toISOString().slice(0, 10)
}
