// Reembolsos y cancelaciones desde el panel (REGLAS B6, A4, A11). Solo dueña o admin con 2FA; el equipo no
// reembolsa (B16). El dinero lo devuelve Stripe; el pedido se marca reembolsado cuando llega el webhook
// (sync_refund), igual que el pago se marca pagado solo en el webhook.
import type { refundRequestSchema } from '@atalia/shared/refunds'
import { suggestRefund, type RefundReason, type RefundSuggestion } from '@atalia/shared/refunds'
import { getRule } from '@atalia/shared/rules'
import type { z } from 'zod'
import type { Caller, TeamRole } from '../team/team'

export interface RefundableOrder {
  id: string
  code: string
  status: string
  paymentStatus: string
  paymentIntentId: string | null
  checkoutToken: string
  scheduledFor: string
  subtotalCents: number
  totalCents: number
  refundedCents: number
  lines: Array<{ productType: 'menu' | 'tray' | 'table' | 'picadera_pack'; lineTotalCents: number }>
  rulesSnapshot: Record<string, unknown>
}

export interface RefundPorts {
  verify(accessToken: string): Promise<Caller | null>
  profileOf(userId: string): Promise<{ role: TeamRole; active: boolean } | null>
  order(orderId: string): Promise<RefundableOrder | null>
  stripeRefund(input: {
    paymentIntentId: string
    amountCents: number
    idempotencyKey: string
    metadata: Record<string, string>
  }): Promise<{ id: string }>
  /** Cancela el pedido y devuelve su cupo (release_holds con los cupos ya convertidos). */
  cancel(order: RefundableOrder): Promise<void>
  history(orderId: string, status: string, note: string, actorId: string): Promise<void>
}

export type RefundErrorCode =
  'unauthorized' | 'forbidden' | 'mfa_required' | 'not_found' | 'not_paid' | 'too_much' | 'nothing_to_do'

export class RefundError extends Error {
  override readonly name = 'RefundError'
  constructor(readonly code: RefundErrorCode) {
    super(code)
  }
}

/** Dueña o admin activos, con 2FA. */
export async function requireManager(ports: RefundPorts, accessToken: string | null): Promise<Caller> {
  if (accessToken === null) throw new RefundError('unauthorized')
  const caller = await ports.verify(accessToken)
  if (caller === null) throw new RefundError('unauthorized')
  if (caller.aal !== 'aal2') throw new RefundError('mfa_required')
  const profile = await ports.profileOf(caller.userId)
  if (profile === null || !profile.active || (profile.role !== 'owner' && profile.role !== 'admin'))
    throw new RefundError('forbidden')
  return caller
}

const PAID = ['paid', 'partially_refunded']

function policyFor(order: RefundableOrder, reason: RefundReason, now: Date): RefundSuggestion {
  // Reglas del pedido (las que aceptó el cliente); si faltan, los valores por defecto del registro.
  const snap = order.rulesSnapshot
  const tiers = Array.isArray(snap['refunds.catering_tiers'])
    ? (snap['refunds.catering_tiers'] as Array<{ hoursBefore: number; refundPpm: number }>)
    : getRule('refunds.catering_tiers', [])
  const saved = snap['refunds.menu_until_status']
  const menuUntil =
    saved === 'confirmed' || saved === 'preparing' ? saved : getRule('refunds.menu_until_status', [])
  return suggestRefund(
    {
      status: order.status,
      scheduledFor: order.scheduledFor,
      subtotalCents: order.subtotalCents,
      totalCents: order.totalCents,
      refundedCents: order.refundedCents,
      lines: order.lines,
      cateringTiers: tiers,
      menuUntilStatus: menuUntil,
    },
    reason,
    now,
  )
}

export async function refundQuote(
  ports: RefundPorts,
  accessToken: string | null,
  orderId: string,
  reason: RefundReason,
  now = new Date(),
) {
  await requireManager(ports, accessToken)
  const order = await ports.order(orderId)
  if (order === null) throw new RefundError('not_found')
  return {
    code: order.code,
    status: order.status,
    paymentStatus: order.paymentStatus,
    // Para mostrar solo las partes que el pedido tiene (menú, catering)
    hasMenu: order.lines.some((l) => l.productType === 'menu'),
    hasCatering: order.lines.some((l) => l.productType !== 'menu'),
    ...policyFor(order, reason, now),
  }
}

const usd = (c: number) => `$${(c / 100).toFixed(2)}`

export async function refundOrder(
  ports: RefundPorts,
  accessToken: string | null,
  orderId: string,
  request: z.output<typeof refundRequestSchema>,
  now = new Date(),
): Promise<{ refunded: number; cancelled: boolean }> {
  const caller = await requireManager(ports, accessToken)
  const order = await ports.order(orderId)
  if (order === null) throw new RefundError('not_found')

  const remaining = order.totalCents - order.refundedCents
  if (request.amountCents > 0) {
    if (!PAID.includes(order.paymentStatus) || order.paymentIntentId === null)
      throw new RefundError('not_paid')
    if (request.amountCents > remaining) throw new RefundError('too_much')
  }
  const canCancel = request.cancel && !['picked_up', 'cancelled', 'refunded'].includes(order.status)
  if (request.amountCents === 0 && !canCancel) throw new RefundError('nothing_to_do')

  if (request.amountCents > 0 && order.paymentIntentId !== null) {
    await ports.stripeRefund({
      paymentIntentId: order.paymentIntentId,
      amountCents: request.amountCents,
      // Misma clave = mismo reembolso aunque se reintente o se haga doble clic (A11)
      idempotencyKey: `refund-${request.idempotencyKey}`,
      metadata: {
        order_id: order.id,
        order_code: order.code,
        reason: request.reason,
        actor_id: caller.userId,
      },
    })
  }
  if (canCancel) await ports.cancel(order)

  const policy = policyFor(order, request.reason, now)
  const note = [
    request.amountCents > 0 ? `Reembolso ${usd(request.amountCents)}` : 'Sin reembolso',
    `motivo: ${request.reason}`,
    request.amountCents !== policy.suggestedCents ? `política sugería ${usd(policy.suggestedCents)}` : null,
    request.note === '' ? null : request.note,
  ]
    .filter(Boolean)
    .join(' · ')
  // El dinero ya se devolvió: si anotar falla, se registra el error pero no se reporta como fallo del reembolso.
  try {
    await ports.history(order.id, canCancel ? 'cancelled' : order.status, note, caller.userId)
  } catch (err) {
    console.error('[refunds] no se pudo anotar en el historial', order.code, err)
  }

  return { refunded: request.amountCents, cancelled: canCancel }
}
