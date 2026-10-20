import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { secureHeaders } from 'hono/secure-headers'
import { checkoutRoutes, type CheckoutWiring } from './checkout-routes'
import { ApiError, errorBody } from './errors'

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
}

export type AppEnv = { Bindings: Bindings }

export const API_VERSION = '0.1.0'

export function createApp(wiring?: CheckoutWiring): Hono<AppEnv> {
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
      allowHeaders: ['Content-Type', 'Idempotency-Key'],
      maxAge: 600,
    })(c, next)
  })

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
