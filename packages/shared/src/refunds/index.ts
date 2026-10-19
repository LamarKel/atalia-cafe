// Cuánto se reembolsa al cancelar (REGLAS B6, A4, A11). Se calcula con las reglas guardadas en el pedido
// (orders.rules_snapshot), nunca con las vigentes: el cliente recibe la política que aceptó al pagar.
// Todo en centavos y ppm, sin floats.
import { z } from '../zod'

export const REFUND_REASONS = ['customer', 'business', 'no_show', 'other'] as const
export type RefundReason = (typeof REFUND_REASONS)[number]

/** Lo que manda el panel: cuánto devolver, por qué, y si además se cancela el pedido. */
export const refundRequestSchema = z.object({
  amountCents: z.number().int().min(0).max(100_000_000),
  reason: z.enum(REFUND_REASONS),
  note: z.string().trim().max(500).default(''),
  /** Va en el correo al cliente cuando el negocio cancela (no se guarda como nota interna). */
  customerMessage: z.string().trim().max(500).default(''),
  cancel: z.boolean(),
  /** Un UUID por intento: un doble clic no reembolsa dos veces (A11). */
  idempotencyKey: z.uuid(),
})
export type RefundRequest = z.input<typeof refundRequestSchema>

const STATUS_ORDER = ['confirmed', 'preparing', 'ready', 'picked_up'] as const

export interface RefundLine {
  productType: 'menu' | 'tray' | 'table' | 'picadera_pack'
  lineTotalCents: number
}

export interface RefundPolicyInput {
  status: string
  scheduledFor: string
  subtotalCents: number
  totalCents: number
  refundedCents: number
  lines: readonly RefundLine[]
  /** Del rules_snapshot del pedido. */
  cateringTiers: ReadonlyArray<{ hoursBefore: number; refundPpm: number }>
  menuUntilStatus: 'confirmed' | 'preparing'
}

export interface RefundSuggestion {
  /** Lo sugerido por la política (con impuesto proporcional), ya descontado lo reembolsado antes. */
  suggestedCents: number
  /** Lo máximo que todavía se puede devolver. */
  remainingCents: number
  hoursBefore: number
  /** % aplicado a la parte de catering y si el menú entra completo. */
  cateringPpm: number
  menuRefundable: boolean
}

/** El tramo que aplica: el primero cuyo mínimo de horas se cumple (vienen de más horas a menos). */
export function tierPpm(tiers: RefundPolicyInput['cateringTiers'], hoursBefore: number): number {
  const sorted = [...tiers].sort((a, b) => b.hoursBefore - a.hoursBefore)
  return sorted.find((t) => hoursBefore >= t.hoursBefore)?.refundPpm ?? 0
}

export function suggestRefund(
  input: RefundPolicyInput,
  reason: RefundReason,
  now = new Date(),
): RefundSuggestion {
  const remainingCents = Math.max(0, input.totalCents - input.refundedCents)
  const hoursBefore = Math.floor((Date.parse(input.scheduledFor) - now.getTime()) / 3_600_000)
  const statusIndex = STATUS_ORDER.indexOf(input.status as (typeof STATUS_ORDER)[number])
  const menuRefundable = statusIndex !== -1 && statusIndex <= STATUS_ORDER.indexOf(input.menuUntilStatus)
  const cateringPpm = tierPpm(input.cateringTiers, hoursBefore)

  // Si el negocio no puede cumplir, se devuelve todo (A4). Si no vino, no hay reembolso por política (B11).
  if (reason === 'business')
    return { suggestedCents: remainingCents, remainingCents, hoursBefore, cateringPpm, menuRefundable }
  if (reason === 'no_show')
    return { suggestedCents: 0, remainingCents, hoursBefore, cateringPpm, menuRefundable }

  // Parte reembolsable de cada línea, en "centavos × ppm" para no redondear antes de tiempo
  const weighted = input.lines.reduce(
    (sum, l) =>
      sum + l.lineTotalCents * (l.productType === 'menu' ? (menuRefundable ? 1_000_000 : 0) : cateringPpm),
    0,
  )
  // El impuesto se devuelve en la misma proporción: total × (reembolsable / subtotal), redondeado al centavo
  const policyCents =
    input.subtotalCents === 0
      ? 0
      : Math.round((input.totalCents * weighted) / (input.subtotalCents * 1_000_000))
  return {
    suggestedCents: Math.min(remainingCents, Math.max(0, policyCents - input.refundedCents)),
    remainingCents,
    hoursBefore,
    cateringPpm,
    menuRefundable,
  }
}
