// Cupones de descuento: el mismo esquema en el panel (al crearlos) y en el Worker (al aplicarlos en el checkout).
// Montos en centavos y porcentajes en ppm, como el resto del dinero (REGLAS A3).
import { z } from 'zod'

export const promoDraftSchema = z
  .object({
    id: z.uuid().nullable(),
    code: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9-]{3,30}$/, 'invalid_code')),
    description: z
      .string()
      .trim()
      .max(200)
      .transform((v) => (v === '' ? null : v))
      .nullable(),
    discountType: z.enum(['percentage', 'fixed']),
    discountPpm: z.number().int().min(1).max(1_000_000).nullable(),
    discountCents: z.number().int().min(1).max(100_000_000).nullable(),
    minOrderCents: z.number().int().min(0).max(100_000_000),
    maxUses: z.number().int().min(1).nullable(),
    maxUsesPerCustomer: z.number().int().min(1).nullable(),
    appliesToCatering: z.boolean(),
    startsAt: z.iso.datetime({ offset: true }).nullable(),
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
    active: z.boolean(),
  })
  // Igual que los CHECKs de promo_codes: el valor que corresponde al tipo, y vence después de empezar.
  .refine((p) => (p.discountType === 'percentage' ? p.discountPpm !== null : p.discountCents !== null), {
    message: 'invalid_value',
    path: ['discount'],
  })
  .refine(
    (p) => p.startsAt === null || p.expiresAt === null || Date.parse(p.expiresAt) > Date.parse(p.startsAt),
    {
      message: 'invalid_dates',
      path: ['expiresAt'],
    },
  )

export type PromoDraftInput = z.input<typeof promoDraftSchema>
export type PromoDraft = z.output<typeof promoDraftSchema>

export type PromoState = 'active' | 'inactive' | 'scheduled' | 'expired' | 'used_up'

/** En qué estado está un cupón ahora (para mostrarlo y para decidir si se puede usar). */
export function promoState(
  p: {
    active: boolean
    startsAt: string | null
    expiresAt: string | null
    maxUses: number | null
    usedCount: number
  },
  now = new Date(),
): PromoState {
  if (!p.active) return 'inactive'
  if (p.expiresAt !== null && Date.parse(p.expiresAt) <= now.getTime()) return 'expired'
  if (p.startsAt !== null && Date.parse(p.startsAt) > now.getTime()) return 'scheduled'
  if (p.maxUses !== null && p.usedCount >= p.maxUses) return 'used_up'
  return 'active'
}
