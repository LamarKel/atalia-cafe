// POST /quotes: "Pide una cotización" (RF-Q01–Q05). Valida con el mismo esquema Zod que el formulario.
import { quoteRequestSchema } from '@atalia/shared/quotes'
import type { Hono } from 'hono'
import { QuoteError, submitQuote, type QuoteDeps } from '../modules/quotes/application/submit-quote'
import type { AppEnv, Bindings } from './app'
import { ApiError } from './errors'

export interface QuoteWiring {
  deps(env: Bindings): QuoteDeps
}

export function quoteRoutes(app: Hono<AppEnv>, wiring: QuoteWiring): void {
  app.post('/quotes', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new ApiError(400, 'bad_request', 'JSON inválido')
    }
    const parsed = quoteRequestSchema.safeParse(body)
    if (!parsed.success) {
      throw new ApiError(
        422,
        'validation_failed',
        'Revisa los datos enviados',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      )
    }
    try {
      const result = await submitQuote(
        wiring.deps(c.env),
        parsed.data,
        c.req.header('cf-connecting-ip') ?? null,
      )
      return c.json(result, 201)
    } catch (err) {
      if (err instanceof QuoteError) {
        if (err.code === 'captcha_failed')
          throw new ApiError(400, 'captcha_failed', 'No pudimos verificar el formulario')
        if (err.code === 'too_many_requests')
          throw new ApiError(429, 'rate_limited', 'Demasiadas solicitudes. Intenta más tarde.')
        throw new ApiError(422, 'validation_failed', 'Fecha del evento no válida', [
          { path: 'eventDate', message: 'invalid_event_date' },
        ])
      }
      throw err
    }
  })
}
