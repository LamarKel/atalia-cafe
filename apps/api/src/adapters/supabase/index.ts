// Adaptador de Supabase (service_role, solo en el Worker). Las escrituras de pedidos pasan por las funciones
// de la BD (create_checkout_order, confirm_paid_order, cancel_unpaid_checkout), que son transaccionales.
import type { OrderSummary } from '@atalia/shared/checkout'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { CatalogPiece, CatalogProduct, ProductType } from '../../modules/orders/domain/pricing'
import { CheckoutError } from '../../modules/payments/application/checkout'
import type {
  AvailabilityRepo,
  CatalogRepo,
  ConfirmResult,
  CreatedOrder,
  OrdersRepo,
  SlotRow,
  StoreRepo,
} from '../../modules/payments/ports'
import type { QuotesRepo } from '../../modules/quotes/ports'

export function supabaseClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (...args) => fetch(...args) },
  })
}

class DbError extends Error {
  override readonly name = 'DbError'
}

function fail(context: string, error: { message: string } | null): never {
  throw new DbError(`${context}: ${error?.message ?? 'sin datos'}`)
}

export function storeRepo(db: SupabaseClient): StoreRepo {
  return {
    async defaultStore() {
      const { data, error } = await db
        .from('stores')
        .select('id, timezone')
        .eq('active', true)
        .order('sort_order')
        .limit(1)
        .maybeSingle<{ id: string; timezone: string }>()
      if (error || !data) fail('stores', error)
      return data
    },
    async rules(storeId) {
      const { data, error } = await db
        .from('business_rules')
        .select('key, store_id, value, effective_from')
        .or(`store_id.is.null,store_id.eq.${storeId}`)
      if (error) fail('business_rules', error)
      return data as Array<{ key: string; store_id: string | null; value: unknown; effective_from: string }>
    },
    async pickupLocationIds(storeId) {
      const { data, error } = await db
        .from('pickup_locations')
        .select('id')
        .eq('store_id', storeId)
        .eq('active', true)
      if (error) fail('pickup_locations', error)
      return (data as Array<{ id: string }>).map((r) => r.id)
    },
  }
}

interface ProductRow {
  id: string
  type: ProductType
  name_en: string
  name_es: string | null
  price_cents: number | null
  min_lead_hours: number
  active: boolean
  stock_enabled: boolean
  in_stock: boolean
  sizes: Array<{
    id: string
    name_en: string
    name_es: string | null
    serves: number | null
    units: number | null
    price_cents: number | null
    price_modifier_cents: number
    active: boolean
  }>
  extras: Array<{ id: string; name_en: string; name_es: string | null; price_cents: number; active: boolean }>
}

export function catalogRepo(db: SupabaseClient): CatalogRepo {
  return {
    async products(ids) {
      if (ids.length === 0) return new Map()
      const { data, error } = await db
        .from('products')
        .select(
          `id, type, name_en, name_es, price_cents, min_lead_hours, active, stock_enabled, in_stock,
           sizes:product_sizes(id, name_en, name_es, serves, units, price_cents, price_modifier_cents, active),
           extras:product_extras(id, name_en, name_es, price_cents, active)`,
        )
        .in('id', [...ids])
        .returns<ProductRow[]>()
      if (error) fail('products', error)
      return new Map(
        data.map((p): [string, CatalogProduct] => [
          p.id,
          {
            id: p.id,
            type: p.type,
            nameEn: p.name_en,
            nameEs: p.name_es,
            priceCents: p.price_cents,
            minLeadHours: p.min_lead_hours,
            active: p.active && (!p.stock_enabled || p.in_stock),
            sizes: p.sizes.map((s) => ({
              id: s.id,
              nameEn: s.name_en,
              nameEs: s.name_es,
              serves: s.serves,
              units: s.units,
              priceCents: s.price_cents,
              priceModifierCents: s.price_modifier_cents,
              active: s.active,
            })),
            extras: p.extras.map((e) => ({
              id: e.id,
              nameEn: e.name_en,
              nameEs: e.name_es,
              priceCents: e.price_cents,
              active: e.active,
            })),
          },
        ]),
      )
    },
    async pieces(ids) {
      if (ids.length === 0) return new Map()
      const { data, error } = await db
        .from('picadera_options')
        .select('id, piece_type_en, piece_type_es, filling_en, filling_es, active')
        .in('id', [...ids])
      if (error) fail('picadera_options', error)
      const rows = data as Array<{
        id: string
        piece_type_en: string
        piece_type_es: string | null
        filling_en: string
        filling_es: string | null
        active: boolean
      }>
      return new Map(
        rows.map((o): [string, CatalogPiece] => [
          o.id,
          {
            id: o.id,
            labelEn: `${o.piece_type_en} · ${o.filling_en}`,
            labelEs:
              o.piece_type_es === null && o.filling_es === null
                ? null
                : `${o.piece_type_es ?? o.piece_type_en} · ${o.filling_es ?? o.filling_en}`,
            active: o.active,
          },
        ]),
      )
    },
  }
}

export function availabilityRepo(db: SupabaseClient): AvailabilityRepo {
  return {
    async slots(storeId, from, to, needs, leadHours) {
      const { data, error } = await db.rpc('available_slots', {
        p_store: storeId,
        p_from: from,
        p_to: to,
        p_needs: needs,
        p_lead_hours: leadHours,
      })
      if (error) fail('available_slots', error)
      const rows = data as Array<{
        slot_date: string
        slot_start: string
        starts_at: string
        available: boolean
        reason: SlotRow['reason']
      }>
      return rows.map((r) => ({
        date: r.slot_date,
        time: r.slot_start.slice(0, 5),
        startsAt: r.starts_at,
        available: r.available,
        reason: r.reason,
      }))
    },
  }
}

/** Errores de cupo que lanza reserve_slot dentro de create_checkout_order (carrera entre dos clientes). */
const CAPACITY_ERRORS = ['slot_full', 'day_full', 'closed_day', 'outside_hours']

interface SummaryRow {
  code: string
  access_token: string
  status: string
  payment_status: string
  scheduled_for: string
  language: 'en' | 'es'
  customer_name: string
  customer_email: string
  subtotal_cents: number
  discount_cents: number
  tax_cents: number
  tip_cents: number
  total_cents: number
  store: { timezone: string } | null
  items: Array<{
    product_name_snapshot: string
    size_label_snapshot: string | null
    quantity: number
    line_total_cents: number
  }>
}

const SUMMARY_SELECT = `code, access_token, status, payment_status, scheduled_for, language, customer_name, customer_email,
  subtotal_cents, discount_cents, tax_cents, tip_cents, total_cents,
  store:stores(timezone),
  items:order_items(product_name_snapshot, size_label_snapshot, quantity, line_total_cents)`

function toSummary(row: SummaryRow): OrderSummary {
  return {
    code: row.code,
    status: row.status,
    paymentStatus: row.payment_status,
    scheduledFor: row.scheduled_for,
    timezone: row.store?.timezone ?? 'America/New_York',
    locale: row.language,
    customerName: row.customer_name,
    items: row.items.map((i) => ({
      name: i.product_name_snapshot,
      detail: i.size_label_snapshot,
      quantity: i.quantity,
      lineTotalCents: i.line_total_cents,
    })),
    subtotalCents: row.subtotal_cents,
    discountCents: row.discount_cents,
    taxCents: row.tax_cents,
    tipCents: row.tip_cents,
    totalCents: row.total_cents,
  }
}

export function ordersRepo(db: SupabaseClient): OrdersRepo {
  return {
    async createCheckoutOrder(order) {
      const { data, error } = await db.rpc('create_checkout_order', {
        p_order: {
          checkout_token: order.checkoutToken,
          store_id: order.storeId,
          pickup_location_id: order.pickupLocationId,
          customer_name: order.customer.name,
          customer_phone: order.customer.phone,
          customer_email: order.customer.email,
          language: order.locale,
          note: order.note === '' ? null : order.note,
          scheduled_for: order.scheduledFor,
          subtotal_cents: order.subtotalCents,
          discount_cents: order.discountCents,
          tax_rate_ppm: order.taxRatePpm,
          tax_cents: order.taxCents,
          tip_cents: order.tipCents,
          total_cents: order.totalCents,
          rules_snapshot: order.rulesSnapshot,
        },
        p_items: order.lines.map((l) => ({
          product_id: l.productId,
          size_id: l.sizeId,
          product_type: l.productType,
          product_name_snapshot: l.nameSnapshot,
          size_label_snapshot: l.sizeLabelSnapshot,
          serves: l.serves,
          units: l.units,
          notes: l.notes === '' ? null : l.notes,
          unit_price_cents: l.unitPriceCents,
          quantity: l.quantity,
          // Copia de los extras con su precio de ese momento (order_items.extras)
          extras: l.extras.map((e) => ({ extra_id: e.id, name: e.nameSnapshot, price_cents: e.priceCents })),
          components: l.components.map((c) => ({
            picadera_option_id: c.optionId,
            piece_label_snapshot: c.labelSnapshot,
            qty: c.qty,
          })),
        })),
        p_reservations: order.reservations.map((r) => ({
          date: r.date,
          slot_start: r.slotStart,
          category: r.category,
          qty: r.qty,
        })),
      })
      if (error) {
        if (CAPACITY_ERRORS.some((code) => error.message.includes(code)))
          throw new CheckoutError('slot_unavailable')
        fail('create_checkout_order', error)
      }
      const res = data as {
        order_id: string
        code: string
        access_token: string
        status: string
        existing: boolean
      }
      let stripeSessionId: string | null = null
      if (res.existing) {
        const { data: row } = await db
          .from('orders')
          .select('stripe_session_id')
          .eq('id', res.order_id)
          .maybeSingle<{ stripe_session_id: string | null }>()
        stripeSessionId = row?.stripe_session_id ?? null
      }
      const created: CreatedOrder = {
        orderId: res.order_id,
        code: res.code,
        accessToken: res.access_token,
        status: res.status,
        existing: res.existing,
        stripeSessionId,
      }
      return created
    },

    async attachStripeSession(orderId, sessionId) {
      const { error } = await db
        .from('orders')
        .update({ stripe_session_id: sessionId })
        .eq('id', orderId)
        .is('stripe_session_id', null)
      if (error) fail('attach_stripe_session', error)
    },

    async confirmPaid(e) {
      const { data, error } = await db.rpc('confirm_paid_order', {
        p_event_id: e.eventId,
        p_event_type: e.eventType,
        p_session_id: e.sessionId,
        p_payment_intent_id: e.paymentIntentId,
        p_amount_total_cents: e.amountTotalCents,
        p_payment_method: e.paymentMethod,
      })
      if (error) fail('confirm_paid_order', error)
      return data as ConfirmResult
    },

    async syncRefund(e) {
      const { data, error } = await db.rpc('sync_refund', {
        p_event_id: e.eventId,
        p_event_type: e.eventType,
        p_payment_intent_id: e.paymentIntentId,
        p_amount_refunded_cents: e.amountRefundedCents,
      })
      if (error) fail('sync_refund', error)
      return data as string
    },

    async cancelUnpaid(e) {
      const { data, error } = await db.rpc('cancel_unpaid_checkout', {
        p_event_id: e.eventId,
        p_event_type: e.eventType,
        p_session_id: e.sessionId,
        p_reason: e.reason,
      })
      if (error) fail('cancel_unpaid_checkout', error)
      return data as string
    },

    async summaryByAccessToken(accessToken) {
      const { data, error } = await db
        .from('orders')
        .select(SUMMARY_SELECT)
        .eq('access_token', accessToken)
        .maybeSingle<SummaryRow>()
      if (error) fail('order_summary', error)
      return data === null ? null : toSummary(data)
    },

    async summaryBySession(sessionId) {
      const { data, error } = await db
        .from('orders')
        .select(SUMMARY_SELECT)
        .eq('stripe_session_id', sessionId)
        .maybeSingle<SummaryRow>()
      if (error) fail('order_summary', error)
      return data === null
        ? null
        : { ...toSummary(data), email: data.customer_email, accessToken: data.access_token }
    },
  }
}

export function quotesRepo(db: SupabaseClient): QuotesRepo {
  return {
    async create(q) {
      const { data, error } = await db
        .from('quote_requests')
        .insert({
          store_id: q.storeId,
          customer_name: q.customer.name,
          // En minúsculas: así el límite por correo no se salta cambiando mayúsculas.
          customer_email: q.customer.email.trim().toLowerCase(),
          customer_phone: q.customer.phone,
          language: q.locale,
          event_date: q.eventDate,
          event_type: q.eventType,
          guests: q.guests,
          products: q.products.map((p) => ({ product_id: p.productId, name: p.name })),
          notes: q.notes === '' ? null : q.notes,
        })
        .select('code')
        .single<{ code: string }>()
      if (error) fail('quote_requests', error)
      return data
    },
    async countRecentByEmail(email, sinceIso) {
      const { count, error } = await db
        .from('quote_requests')
        .select('id', { count: 'exact', head: true })
        .eq('customer_email', email.trim().toLowerCase())
        .gte('created_at', sinceIso)
      if (error) fail('quote_requests_count', error)
      return count ?? 0
    },
  }
}
