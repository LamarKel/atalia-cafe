import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import { checkoutRoutes, type CheckoutWiring } from './checkout-routes'
import { contactRoutes, type ContactWiring } from './contact-routes'
import { quoteRoutes, type QuoteWiring } from './quote-routes'
import { publishRoutes, type PublishWiring } from './publish-routes'
import { refundRoutes, type RefundWiring } from './refund-routes'
import { teamRoutes, type TeamWiring } from './team-routes'
import { ApiError, errorBody } from './errors'
import { rateLimit } from './rate-limit'

export interface Bindings {
  ENVIRONMENT: 'development' | 'staging' | 'production'
  /** Orígenes permitidos separados por coma (el sitio Astro). */
  ALLOWED_ORIGINS: string
  /** URL pública del sitio (vuelta desde Stripe y enlaces de los correos). */
  SITE_URL?: string
  /** Remitente de los correos, p. ej. "Atalia Café <pedidos@dominio>". */
  EMAIL_FROM?: string
  // Secretos (wrangler secret put / .dev.vars): nunca en wrangler.jsonc ni en el frontend.
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  RESEND_API_KEY?: string
  TURNSTILE_SECRET?: string
  /** URL del panel (correo de invitación al equipo). */
  ADMIN_URL?: string
  /** Límites por IP (ratelimits en wrangler.jsonc): estricto para pagar/cotizar/admin, normal para leer. */
  /** Deploy hook del sitio (secreto). Sin él no hay publicación automática (desarrollo). */
  DEPLOY_HOOK_URL?: string
  RL_STRICT?: RateLimit
  RL_NORMAL?: RateLimit
}

export type AppEnv = { Bindings: Bindings }

export const API_VERSION = '0.1.0'

export function createApp(
  wiring?: CheckoutWiring,
  quotes?: QuoteWiring,
  team?: TeamWiring,
  refunds?: RefundWiring,
  publish?: PublishWiring,
  contact?: ContactWiring,
): Hono<AppEnv> {
  const app = new Hono<AppEnv>()

  // RNF-S02: encabezados de seguridad. La API solo devuelve JSON.
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      xFrameOptions: 'DENY',
      referrerPolicy: 'no-referrer',
      strictTransportSecurity: 'max-age=63072000; includeSubDomains; preload',
    }),
  )

  app.use('*', async (c, next) => {
    const allowed = c.env.ALLOWED_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean)
    return cors({
      origin: (origin) => (allowed.includes(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Idempotency-Key', 'Authorization'],
      maxAge: 600,
    })(c, next)
  })

  // Cuerpos chicos: el carrito más grande cabe de sobra en 64 KB; el webhook de Stripe puede ser más grande.
  app.use('*', async (c, next) =>
    bodyLimit({
      maxSize: c.req.path === '/webhooks/stripe' ? 512 * 1024 : 64 * 1024,
      onError: (ctx) => ctx.json(errorBody('bad_request', 'Solicitud demasiado grande'), 413),
    })(c, next),
  )

  // Límites por IP. El webhook no lleva límite: lo llama Stripe y ya va firmado.
  app.use('/checkout', rateLimit('RL_STRICT', 'checkout'))
  app.use('/quotes', rateLimit('RL_STRICT', 'quotes'))
  app.use('/contact', rateLimit('RL_STRICT', 'contact'))
  app.use('/admin/*', rateLimit('RL_STRICT', 'admin'))
  app.use('/availability', rateLimit('RL_NORMAL', 'availability'))
  app.use('/orders/*', rateLimit('RL_NORMAL', 'orders'))

  // Vivo: no toca la BD, para que el monitor de uptime no dependa de Supabase (RNF-D04).
  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      version: API_VERSION,
      environment: c.env.ENVIRONMENT,
      time: new Date().toISOString(),
    }),
  )

  if (wiring !== undefined) checkoutRoutes(app, wiring)
  if (quotes !== undefined) quoteRoutes(app, quotes)
  if (team !== undefined) teamRoutes(app, team)
  if (refunds !== undefined) refundRoutes(app, refunds)
  if (publish !== undefined) publishRoutes(app, publish)
  if (contact !== undefined) contactRoutes(app, contact)

  app.notFound((c) => c.json(errorBody('not_found', 'Ruta no encontrada'), 404))

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json(errorBody(err.code, err.message, err.details), err.status)
    }
    if (err instanceof HTTPException) {
      return c.json(errorBody('bad_request', err.message), err.status)
    }
    // Error inesperado: se registra completo (Sentry más adelante) y el cliente recibe un mensaje genérico.
    console.error('[api] error inesperado', err)
    return c.json(errorBody('internal_error', 'Ocurrió un error. Intenta de nuevo.'), 500)
  })

  return app
}
