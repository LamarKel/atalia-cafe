// GET /admin/team y POST /admin/team/invite. El token de la dueña llega en Authorization: Bearer.
import type { Hono } from 'hono'
import { inviteMember, inviteSchema, requireOwner, TeamError, type TeamPorts } from '../modules/team/team'
import type { AppEnv, Bindings } from './app'
import { ApiError } from './errors'

export interface TeamWiring {
  ports(env: Bindings): TeamPorts
  /** Adónde lleva el correo de invitación (el panel, que pide crear la contraseña). */
  adminUrl(env: Bindings): string
}

const bearer = (header: string | undefined) =>
  header?.startsWith('Bearer ') === true ? header.slice(7) : null

function teamError(err: unknown): never {
  if (err instanceof TeamError) {
    if (err.code === 'unauthorized') throw new ApiError(401, 'unauthorized', 'Inicia sesión otra vez')
    if (err.code === 'mfa_required')
      throw new ApiError(403, 'forbidden', 'Hace falta la verificación en 2 pasos')
    if (err.code === 'already_member')
      throw new ApiError(409, 'conflict', 'Ese correo ya es parte del equipo')
    throw new ApiError(403, 'forbidden', 'Solo la dueña puede administrar el equipo')
  }
  throw err
}

export function teamRoutes(app: Hono<AppEnv>, wiring: TeamWiring): void {
  app.get('/admin/team', async (c) => {
    const ports = wiring.ports(c.env)
    await requireOwner(ports, bearer(c.req.header('authorization'))).catch(teamError)
    c.header('Cache-Control', 'no-store')
    return c.json({ members: await ports.list() })
  })

  app.post('/admin/team/invite', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new ApiError(400, 'bad_request', 'JSON inválido')
    }
    const parsed = inviteSchema.safeParse(body)
    if (!parsed.success) throw new ApiError(422, 'validation_failed', 'Revisa el correo y el rol')
    const result = await inviteMember(
      wiring.ports(c.env),
      bearer(c.req.header('authorization')),
      parsed.data,
      wiring.adminUrl(c.env),
    ).catch(teamError)
    return c.json(result, 201)
  })
}
