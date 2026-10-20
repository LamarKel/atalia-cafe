// Adaptador de reembolsos: lee el pedido con sus reglas guardadas, lo cancela devolviendo el cupo y anota
// cada acción en el historial. El reembolso en sí lo hace Stripe (adapters/stripe).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RefundableOrder, RefundPorts } from '../../modules/refunds/refunds'
import type { PaymentGateway } from '../../modules/payments/ports'
import type { CancellationInput } from '../resend/cancellation'
import { teamPorts } from './team'

export function refundPorts(
  db: SupabaseClient,
  payments: PaymentGateway,
  mail: (input: CancellationInput) => Promise<void>,
): RefundPorts {
  const team = teamPorts(db)
  return {
    verify: team.verify,
    profileOf: team.profileOf,
    async order(orderId) {
      const { data, error } = await db
        .from('orders')
        .select(
          `id, code, status, payment_status, stripe_payment_intent_id, checkout_token, scheduled_for,
           subtotal_cents, total_cents, refunded_cents, rules_snapshot, customer_name, customer_email, language,
           store:stores(timezone),
           items:order_items(product_type, line_total_cents)`,
        )
        .eq('id', orderId)
        .maybeSingle<Record<string, unknown>>()
      if (error) throw new Error(`refund_order: ${error.message}`)
      if (data === null) return null
      const o = data
      const order: RefundableOrder = {
        id: o.id as string,
        code: o.code as string,
        status: o.status as string,
        paymentStatus: o.payment_status as string,
        paymentIntentId: o.stripe_payment_intent_id as string | null,
        checkoutToken: o.checkout_token as string,
        scheduledFor: o.scheduled_for as string,
        subtotalCents: o.subtotal_cents as number,
        totalCents: o.total_cents as number,
        refundedCents: o.refunded_cents as number,
        lines: (
          o.items as Array<{
            product_type: RefundableOrder['lines'][number]['productType']
            line_total_cents: number
          }>
        ).map((i) => ({
          productType: i.product_type,
          lineTotalCents: i.line_total_cents,
        })),
        rulesSnapshot: (o.rules_snapshot as Record<string, unknown> | null) ?? {},
        customer: { name: o.customer_name as string, email: o.customer_email as string },
        locale: o.language === 'es' ? 'es' : 'en',
        timezone: (o.store as { timezone: string } | null)?.timezone ?? 'America/New_York',
      }
      return order
    },
    stripeRefund: (input) => payments.refund(input),
    async cancel(order) {
      const { error } = await db.from('orders').update({ status: 'cancelled' }).eq('id', order.id)
      if (error) throw new Error(`cancel: ${error.message}`)
      // Devuelve el cupo, incluso el ya convertido al pagar (la hora vuelve a estar disponible)
      const { error: holdError } = await db.rpc('release_holds', {
        p_token: order.checkoutToken,
        p_include_converted: true,
      })
      if (holdError) throw new Error(`release_holds: ${holdError.message}`)
    },
    notifyCancelled: (order, refundCents, message) =>
      mail({
        code: order.code,
        customerName: order.customer.name,
        customerEmail: order.customer.email,
        locale: order.locale,
        scheduledFor: order.scheduledFor,
        timezone: order.timezone,
        refundCents,
        message,
      }),
    async history(orderId, status, note, actorId) {
      // El historial guarda también el estado del pago en ese momento
      const { data } = await db
        .from('orders')
        .select('payment_status')
        .eq('id', orderId)
        .maybeSingle<{ payment_status: string }>()
      const { error } = await db.from('order_status_history').insert({
        order_id: orderId,
        status,
        payment_status: data?.payment_status ?? 'paid',
        note,
        actor_id: actorId,
      })
      if (error) throw new Error(`history: ${error.message}`)
    },
  }
}
