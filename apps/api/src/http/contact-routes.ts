// POST /contact: formulario de contacto. Valida con el mismo esquema Zod que el formulario.
import { contactRequestSchema } from '@atalia/shared/contact'
import type { Hono } from 'hono'
import { ContactError, submitContact, type ContactDeps } from '../modules/contact/application/submit-contact'
import type { AppEnv, Bindings } from './app'
import { ApiError } from './errors'

export interface ContactWiring {
  deps(env: Bindings): ContactDeps
}

export function contactRoutes(app: Hono<AppEnv>, wiring: ContactWiring): void {
  app.post('/contact', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new ApiError(400, 'bad_request', 'JSON inválido')
    }
    const parsed = contactRequestSchema.safeParse(body)
    if (!parsed.success) {
      throw new ApiError(
        422,
        'validation_failed',
        'Revisa los datos enviados',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      )
    }
    try {
      const result = await submitContact(
        wiring.deps(c.env),
        parsed.data,
        c.req.header('cf-connecting-ip') ?? null,
      )
      return c.json(result, 201)
    } catch (err) {
      if (err instanceof ContactError) {
        if (err.code === 'captcha_failed')
          throw new ApiError(400, 'captcha_failed', 'No pudimos verificar el formulario')
        throw new ApiError(429, 'rate_limited', 'Demasiados mensajes. Intenta más tarde.')
      }
      throw err
    }
  })
}
