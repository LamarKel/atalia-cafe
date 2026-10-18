// Equipo del panel: listar e invitar. Solo la dueña, con sesión válida y 2FA (aal2). Lo demás (cambiar rol,
// quitar acceso) lo hace el panel directo con la RLS (owner_all), y el trigger de la BD impide quedarse sin dueña.
import { z } from 'zod'

export const ROLES = ['owner', 'admin', 'staff'] as const
export type TeamRole = (typeof ROLES)[number]

export const inviteSchema = z.object({
  // Primero se limpia (espacios, mayúsculas) y después se valida el formato.
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  role: z.enum(ROLES),
  displayName: z
    .string()
    .trim()
    .max(80)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null),
})
export type InviteInput = z.output<typeof inviteSchema>

export interface Caller {
  userId: string
  /** Nivel de autenticación de la sesión: aal2 = entró con 2FA. */
  aal: string | null
}

export interface TeamMember {
  userId: string
  email: string
  role: TeamRole
  displayName: string | null
  active: boolean
  lastSignInAt: string | null
  mfa: boolean
}

export interface TeamPorts {
  /** Valida el token del usuario con Supabase Auth; null si no es válido. */
  verify(accessToken: string): Promise<Caller | null>
  profileOf(userId: string): Promise<{ role: TeamRole; active: boolean } | null>
  list(): Promise<TeamMember[]>
  invite(input: InviteInput, redirectTo: string): Promise<{ userId: string }>
}

export type TeamErrorCode = 'unauthorized' | 'forbidden' | 'mfa_required' | 'already_member'

export class TeamError extends Error {
  override readonly name = 'TeamError'
  constructor(readonly code: TeamErrorCode) {
    super(code)
  }
}

/** Exige: token válido, perfil de dueña activo y sesión con 2FA. */
export async function requireOwner(ports: TeamPorts, accessToken: string | null): Promise<Caller> {
  if (accessToken === null) throw new TeamError('unauthorized')
  const caller = await ports.verify(accessToken)
  if (caller === null) throw new TeamError('unauthorized')
  if (caller.aal !== 'aal2') throw new TeamError('mfa_required')
  const profile = await ports.profileOf(caller.userId)
  if (profile === null || !profile.active || profile.role !== 'owner') throw new TeamError('forbidden')
  return caller
}

export async function inviteMember(
  ports: TeamPorts,
  accessToken: string | null,
  input: InviteInput,
  redirectTo: string,
) {
  await requireOwner(ports, accessToken)
  const members = await ports.list()
  if (members.some((m) => m.email === input.email)) throw new TeamError('already_member')
  return ports.invite(input, redirectTo)
}

/** Lee el claim "aal" de un JWT ya verificado por Supabase (solo decodifica, no verifica). */
export function aalFromJwt(token: string): string | null {
  const part = token.split('.')[1]
  if (part === undefined) return null
  try {
    const json = atob(
      part
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(part.length / 4) * 4, '='),
    )
    const claims = JSON.parse(json) as { aal?: unknown }
    return typeof claims.aal === 'string' ? claims.aal : null
  } catch {
    return null
  }
}
