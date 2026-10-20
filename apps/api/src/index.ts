// Punto de composición del Worker (PLAN.md §7): une los puertos de los módulos con los adaptadores
// de Supabase, Stripe y Resend. Los secretos llegan por env (wrangler secret / .dev.vars).
import { getRule } from '@atalia/shared/rules'
import { resendMailer } from './adapters/resend'
import { stripeClient, paymentGateway, verifyPaymentEvent } from './adapters/stripe'
import { availabilityRepo, catalogRepo, ordersRepo, storeRepo, supabaseClient } from './adapters/supabase'
import { createApp, type Bindings } from './http/app'
import type { CheckoutWiring } from './http/checkout-routes'
import type { CheckoutDeps } from './modules/payments/application/checkout'

function required(env: Bindings, key: keyof Bindings): string {
  const value = env[key]
  if (typeof value !== 'string' || value === '') throw new Error(`Falta la variable ${key}`)
  return value
}

function deps(env: Bindings): CheckoutDeps {
  const db = supabaseClient(required(env, 'SUPABASE_URL'), required(env, 'SUPABASE_SERVICE_ROLE_KEY'))
  const stores = storeRepo(db)
  const siteUrl = required(env, 'SITE_URL')
  return {
    siteUrl,
    stores,
    catalog: catalogRepo(db),
    availability: availabilityRepo(db),
    orders: ordersRepo(db),
    payments: paymentGateway(stripeClient(required(env, 'STRIPE_SECRET_KEY'))),
    mailer: resendMailer({
      apiKey: required(env, 'RESEND_API_KEY'),
      from: required(env, 'EMAIL_FROM'),
      siteUrl,
      staffRecipients: async () => {
        const store = await stores.defaultStore()
        return getRule('notifications.order_recipients', await stores.rules(store.id), { storeId: store.id })
      },
    }),
  }
}

const wiring: CheckoutWiring = {
  deps,
  verifyEvent: (env, raw, signature) =>
    verifyPaymentEvent(
      stripeClient(required(env, 'STRIPE_SECRET_KEY')),
      raw,
      signature,
      required(env, 'STRIPE_WEBHOOK_SECRET'),
    ),
}

export default createApp(wiring)
