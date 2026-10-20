// Contrato del checkout entre el sitio y el Worker (PLAN.md §6). El navegador solo manda QUÉ quiere
// (productos, opción, cantidad, piezas, hora y datos de contacto); los precios los calcula el Worker (A8).
import { z } from '../zod'
import { picaderaComponentSchema } from '../picadera'
import { promoCodeInputSchema, type PromoRejection } from '../promos'

export const LOCALES = ['en', 'es'] as const

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date')
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'invalid_time')

export const cartLineSchema = z.object({
  productId: z.uuid(),
  sizeId: z.uuid().nullable(),
  quantity: z.number().int().min(1).max(100),
  notes: z.string().trim().max(500).default(''),
  components: z.array(picaderaComponentSchema).max(50).default([]),
  /** Extras del menú (leche de avena, shot extra…); el precio lo pone el servidor. */
  extraIds: z.array(z.uuid()).max(10).default([]),
})

export type CartLineInput = z.input<typeof cartLineSchema>
export type CartLine = z.output<typeof cartLineSchema>

const cartSchema = z.array(cartLineSchema).min(1).max(30)

/** POST /availability: horas de recogida para lo que hay en el carrito. */
export const availabilityRequestSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    locale: z.enum(LOCALES).default('en'),
    items: cartSchema,
    /** Cupón que escribió el cliente; el descuento lo calcula el Worker. */
    promoCode: promoCodeInputSchema,
  })
  .refine((v) => v.from <= v.to, { message: 'invalid_range', path: ['to'] })

export type AvailabilityRequest = z.input<typeof availabilityRequestSchema>

export const slotReasonSchema = z.enum(['closed', 'lead_time', 'full']).nullable()

export interface AvailabilitySlot {
  /** "2026-10-21" en la zona horaria de la tienda. */
  date: string
  /** "11:00" en la zona horaria de la tienda. */
  time: string
  startsAt: string
  available: boolean
  reason: z.infer<typeof slotReasonSchema>
}

/** Precio calculado por el Worker para mostrar en el resumen; null si algo del carrito aún no tiene precio. */
export interface CartQuote {
  lines: Array<{ name: string; detail: string | null; quantity: number; lineTotalCents: number }>
  subtotalCents: number
  discountCents: number
  /** Resultado del cupón que se mandó (null si no se mandó ninguno). */
  promo: { code: string; applied: true } | { code: string; applied: false; reason: PromoRejection } | null
  taxLabel: string
  taxCents: number
  totalCents: number
}

export interface AvailabilityResponse {
  timezone: string
  leadHours: number
  slots: AvailabilitySlot[]
  quote: CartQuote | null
}

export const customerSchema = z.object({
  name: z.string().trim().min(2, 'name_required').max(80),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, 'invalid_phone'),
  email: z.email('invalid_email').max(254),
})

export type Customer = z.infer<typeof customerSchema>

/** POST /checkout. checkoutToken: un UUID por intento; repetirlo devuelve el mismo pedido (RNF-P01). */
export const checkoutRequestSchema = z.object({
  checkoutToken: z.uuid(),
  locale: z.enum(LOCALES),
  pickup: z.object({ date: isoDate, time: timeOfDay }),
  /** Dónde lo recoge: en la tienda, en el carro… (pickup_locations). */
  pickupLocationId: z.uuid().nullable().default(null),
  customer: customerSchema,
  note: z.string().trim().max(500).default(''),
  items: cartSchema,
  promoCode: promoCodeInputSchema,
})

export type CheckoutRequest = z.input<typeof checkoutRequestSchema>
export type CheckoutRequestParsed = z.output<typeof checkoutRequestSchema>

export interface CheckoutResponse {
  /** Página de pago de Stripe. */
  url: string
  code: string
  accessToken: string
}

/** GET /orders/:accessToken: lo que ve el cliente en la confirmación (pantalla 06). */
export interface OrderSummary {
  code: string
  status: string
  paymentStatus: string
  scheduledFor: string
  timezone: string
  locale: (typeof LOCALES)[number]
  customerName: string
  items: Array<{ name: string; detail: string | null; quantity: number; lineTotalCents: number }>
  subtotalCents: number
  discountCents: number
  taxCents: number
  tipCents: number
  totalCents: number
}
