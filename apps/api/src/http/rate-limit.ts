// Límite de peticiones por IP con el binding de Cloudflare (ratelimits en wrangler.jsonc) (RNF-S06).
// Si el binding no existe (pruebas) o falla, deja pasar: un límite caído no puede tumbar las ventas.
import type { MiddlewareHandler } from 'hono'
import type { AppEnv, Bindings } from './app'
import { errorBody } from './errors'

export type RateLimitBinding = 'RL_STRICT' | 'RL_NORMAL'

export function rateLimit(binding: RateLimitBinding, bucket: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const limiter: RateLimit | undefined = (c.env as Bindings)[binding]
    if (limiter !== undefined) {
      const ip = c.req.header('cf-connecting-ip') ?? 'local'
      let allowed = true
      try {
        allowed = (await limiter.limit({ key: `${bucket}:${ip}` })).success
      } catch (err) {
        console.error('[rate-limit] no se pudo consultar el límite', err)
      }
      if (!allowed) {
        return c.json(
          errorBody('rate_limited', 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.'),
          429,
          { 'Retry-After': '60' },
        )
      }
    }
    await next()
  }
}
