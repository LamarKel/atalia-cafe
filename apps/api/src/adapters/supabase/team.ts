// Adaptador del equipo: Supabase Auth Admin (service_role) para validar tokens, listar usuarios e invitar.
import type { SupabaseClient } from '@supabase/supabase-js'
import { aalFromJwt, type TeamMember, type TeamPorts, type TeamRole } from '../../modules/team/team'

export function teamPorts(db: SupabaseClient): TeamPorts {
  return {
    async verify(accessToken) {
      // getUser valida la firma y la vigencia del token contra Supabase Auth.
      const { data, error } = await db.auth.getUser(accessToken)
      if (error || data.user === null) return null
      return { userId: data.user.id, aal: aalFromJwt(accessToken) }
    },
    async profileOf(userId) {
      const { data } = await db
        .from('admin_profiles')
        .select('role, active')
        .eq('user_id', userId)
        .maybeSingle<{ role: TeamRole; active: boolean }>()
      return data
    },
    async list() {
      const [{ data: profiles, error }, users] = await Promise.all([
        db.from('admin_profiles').select('user_id, role, display_name, active'),
        db.auth.admin.listUsers({ perPage: 200 }),
      ])
      if (error) throw new Error(`team: ${error.message}`)
      const byId = new Map(users.data.users.map((u) => [u.id, u]))
      // La lista de usuarios no trae los factores: se consultan aparte (pocos miembros).
      const ids = ((profiles ?? []) as Array<{ user_id: string }>).map((p) => p.user_id)
      const mfaById = new Map(
        await Promise.all(
          ids.map(async (id) => {
            const { data } = await db.auth.admin.mfa.listFactors({ userId: id })
            return [id, (data?.factors ?? []).some((f) => f.status === 'verified')] as const
          }),
        ),
      )
      return (
        (profiles ?? []) as Array<{
          user_id: string
          role: TeamRole
          display_name: string | null
          active: boolean
        }>
      ).map((p): TeamMember => {
        const u = byId.get(p.user_id)
        return {
          userId: p.user_id,
          email: u?.email ?? '',
          role: p.role,
          displayName: p.display_name,
          active: p.active,
          lastSignInAt: u?.last_sign_in_at ?? null,
          mfa: mfaById.get(p.user_id) === true,
        }
      })
    },
    async invite(input, redirectTo) {
      const { data, error } = await db.auth.admin.inviteUserByEmail(input.email, { redirectTo })
      if (error || data.user === null) throw new Error(`invite: ${error?.message ?? 'sin usuario'}`)
      const { error: profileError } = await db
        .from('admin_profiles')
        .insert({ user_id: data.user.id, role: input.role, display_name: input.displayName, active: true })
      if (profileError) throw new Error(`invite_profile: ${profileError.message}`)
      return { userId: data.user.id }
    },
  }
}
