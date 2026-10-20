// Cupones para el checkout (con service_role: promo_codes no es legible para anon).
import type { PromoRule } from '@atalia/shared/promos'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PromoRepo } from '../../modules/payments/ports'

interface PromoRow {
  id: string
  code: string
  discount_type: 'percentage' | 'fixed'
  discount_ppm: number | null
  discount_cents: number | null
  min_order_cents: number
  max_uses: number | null
  max_uses_per_customer: number | null
  used_count: number
  applies_to_catering: boolean
  starts_at: string | null
  expires_at: string | null
  active: boolean
}

export function promoRepo(db: SupabaseClient): PromoRepo {
  return {
    async byCode(code) {
      const { data, error } = await db
        .from('promo_codes')
        .select(
          'id, code, discount_type, discount_ppm, discount_cents, min_order_cents, max_uses, max_uses_per_customer, used_count, applies_to_catering, starts_at, expires_at, active',
        )
        .eq('code', code)
        .maybeSingle<PromoRow>()
      if (error) throw new Error(`promo_codes: ${error.message}`)
      if (data === null) return null
      const rule: PromoRule = {
        id: data.id,
        code: data.code,
        discountType: data.discount_type,
        discountPpm: data.discount_ppm,
        discountCents: data.discount_cents,
        minOrderCents: data.min_order_cents,
        maxUses: data.max_uses,
        maxUsesPerCustomer: data.max_uses_per_customer,
        usedCount: data.used_count,
        appliesToCatering: data.applies_to_catering,
        startsAt: data.starts_at,
        expiresAt: data.expires_at,
        active: data.active,
      }
      return rule
    },

    async usesByEmail(promoId, email) {
      // Cuenta los pedidos ya pagados (aunque después se reembolsen): un intento sin pagar no gasta el cupón.
      const { count, error } = await db
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('promo_code_id', promoId)
        // ilike sin comodines: mismo correo sin importar mayúsculas (_ y % se escapan)
        .ilike(
          'customer_email',
          email.replace(/[\\%_]/g, (c) => `\\${c}`),
        )
        .neq('payment_status', 'unpaid')
      if (error) throw new Error(`orders: ${error.message}`)
      return count ?? 0
    },
  }
}
