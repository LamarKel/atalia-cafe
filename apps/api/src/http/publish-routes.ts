// "Publicar ahora" desde el panel (dueña o admin con 2FA): recompila el sitio sin esperar al cron.
import type { Hono } from 'hono'
import { PublishError, publishNow, type PublishPorts } from '../modules/publish/publish'
import type { AppEnv, Bindings } from './app'
import { ApiError } from './errors'

export interface PublishWiring {
  /** null si no hay deploy hook configurado en este ambiente. */
  ports(env: Bindings): PublishPorts | null
}

const bearer = (header: string | undefined) =>
  header?.startsWith('Bearer ') === true ? header.slice(7) : null

export function publishRoutes(app: Hono<AppEnv>, wiring: PublishWiring): void {
  app.post('/admin/publish', async (c) => {
    const ports = wiring.ports(c.env)
    if (ports === null) throw new ApiError(503, 'internal_error', 'La publicación no está configurada aquí')
    await publishNow(ports, bearer(c.req.header('authorization'))).catch((err: unknown) => {
      if (err instanceof PublishError) {
        switch (err.code) {
          case 'unauthorized':
            throw new ApiError(401, 'unauthorized', 'Inicia sesión otra vez')
          case 'mfa_required':
            throw new ApiError(403, 'forbidden', 'Hace falta la verificación en 2 pasos')
          case 'forbidden':
            throw new ApiError(403, 'forbidden', 'Solo la dueña o un admin pueden publicar')
          case 'failed':
            throw new ApiError(502, 'internal_error', 'No se pudo publicar. Intenta de nuevo en un minuto.')
        }
      }
      throw err
    })
    return c.json({ published: true })
  })
}
