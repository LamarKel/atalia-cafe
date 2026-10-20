// Punto de composición del Worker (PLAN.md §7): une los puertos de los módulos con los adaptadores
// de Supabase, Stripe y Resend. Los secretos llegan por env (wrangler secret / .dev.vars).
import { getRule } from '@atalia/shared/rules'
import { resendMailer } from './adapters/resend'
import { deployHook } from './adapters/deploy'
import { promoRepo } from './adapters/supabase/promos'
import { publishPorts } from './adapters/supabase/publish'
import { sendCancellation } from './adapters/resend/cancellation'
import { resendQuoteMailer } from './adapters/resend/quotes'
import { stripeClient, paymentGateway, verifyPaymentEvent } from './adapters/stripe'
import {
  availabilityRepo,
  catalogRepo,
  ordersRepo,
  quotesRepo,
  storeRepo,
  supabaseClient,
} from './adapters/supabase'
import { refundPorts } from './adapters/supabase/refunds'
import { teamPorts } from './adapters/supabase/team'
import { turnstileVerifier } from './adapters/turnstile'
import { required } from './config'
import { createApp, type Bindings } from './http/app'
import type { PublishWiring } from './http/publish-routes'
import { publishIfDirty } from './modules/publish/publish'
import type { CheckoutWiring } from './http/checkout-routes'
import type { QuoteWiring } from './http/quote-routes'
import type { RefundWiring } from './http/refund-routes'
import type { TeamWiring } from './http/team-routes'
import { releaseExpired, type CheckoutDeps } from './modules/payments/application/checkout'

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
    promos: promoRepo(db),
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

const quotes: QuoteWiring = {
  deps(env) {
    const db = supabaseClient(required(env, 'SUPABASE_URL'), required(env, 'SUPABASE_SERVICE_ROLE_KEY'))
    const stores = storeRepo(db)
    return {
      stores,
      catalog: catalogRepo(db),
      quotes: quotesRepo(db),
      captcha: turnstileVerifier(required(env, 'TURNSTILE_SECRET')),
      mailer: resendQuoteMailer({
        apiKey: required(env, 'RESEND_API_KEY'),
        from: required(env, 'EMAIL_FROM'),
        businessLocale: async () => {
          const store = await stores.defaultStore()
          return getRule('notifications.staff_locale', await stores.rules(store.id), { storeId: store.id })
        },
      }),
    }
  },
}

const team: TeamWiring = {
  ports: (env) =>
    teamPorts(supabaseClient(required(env, 'SUPABASE_URL'), required(env, 'SUPABASE_SERVICE_ROLE_KEY'))),
  adminUrl: (env) => required(env, 'ADMIN_URL'),
}

const refunds: RefundWiring = {
  ports: (env) =>
    refundPorts(
      supabaseClient(required(env, 'SUPABASE_URL'), required(env, 'SUPABASE_SERVICE_ROLE_KEY')),
      paymentGateway(stripeClient(required(env, 'STRIPE_SECRET_KEY'))),
      (input) =>
        sendCancellation(
          { apiKey: required(env, 'RESEND_API_KEY'), from: required(env, 'EMAIL_FROM') },
          input,
        ),
    ),
}

const publish: PublishWiring = {
  ports: (env) =>
    env.DEPLOY_HOOK_URL === undefined || env.DEPLOY_HOOK_URL === ''
      ? null
      : publishPorts(
          supabaseClient(required(env, 'SUPABASE_URL'), required(env, 'SUPABASE_SERVICE_ROLE_KEY')),
          deployHook(required(env, 'DEPLOY_HOOK_URL')),
        ),
}

const app = createApp(wiring, quotes, team, refunds, publish)

export default {
  fetch: app.fetch,
  // triggers.crons en wrangler.jsonc (cada minuto)
  scheduled(_controller, env, ctx) {
    const db = supabaseClient(required(env, 'SUPABASE_URL'), required(env, 'SUPABASE_SERVICE_ROLE_KEY'))
    ctx.waitUntil(releaseExpired({ orders: ordersRepo(db) }))
    // Publica el sitio si el panel cambió algo (sin deploy hook en desarrollo, no hace nada)
    const ports = publish.ports(env)
    if (ports !== null) ctx.waitUntil(publishIfDirty(ports))
  },
} satisfies ExportedHandler<Bindings>
