// Estado de la sesión del panel: sin sesión → falta activar 2FA → falta el código → sin permiso → listo.
// La BD exige aal2 (2FA) para ver cualquier cosa del admin; aquí solo se guía al usuario hasta ahí.
import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export type Role = 'owner' | 'admin' | 'staff'

export type AuthState =
  | { kind: 'loading' }
  | { kind: 'signed_out' }
  /** Entró con el enlace de "olvidé mi contraseña": tiene que crear una nueva antes de seguir. */
  | { kind: 'new_password'; session: Session }
  | { kind: 'enroll_mfa'; session: Session }
  | { kind: 'verify_mfa'; session: Session; factorId: string }
  | { kind: 'not_admin'; session: Session }
  | { kind: 'ready'; session: Session; role: Role; email: string }

async function resolve(session: Session | null): Promise<AuthState> {
  if (session === null) return { kind: 'signed_out' }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel !== 'aal2') {
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const verified = factors?.totp.find((f) => f.status === 'verified')
    return verified === undefined
      ? { kind: 'enroll_mfa', session }
      : { kind: 'verify_mfa', session, factorId: verified.id }
  }

  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('role, active')
    .eq('user_id', session.user.id)
    .maybeSingle<{ role: Role; active: boolean }>()
  if (profile === null || !profile.active) return { kind: 'not_admin', session }
  return { kind: 'ready', session, role: profile.role, email: session.user.email ?? '' }
}

export function useAdminAuth(): {
  state: AuthState
  refresh: () => Promise<void>
  finishRecovery: () => Promise<void>
  signOut: () => Promise<void>
} {
  const [state, setState] = useState<AuthState>({ kind: 'loading' })
  // Llegó con el enlace de recuperación o de invitación al equipo: primero crea su contraseña.
  const recovering = useRef(
    typeof window !== 'undefined' && /type=(recovery|invite)/.test(window.location.hash),
  )

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    if (recovering.current && data.session !== null) {
      setState({ kind: 'new_password', session: data.session })
      return
    }
    setState(await resolve(data.session))
  }, [])

  useEffect(() => {
    void refresh()
    const { data } = supabase.auth.onAuthStateChange((event) => {
      // Cambios que alteran lo que el usuario puede ver: entrar, salir, subir a aal2.
      if (event === 'PASSWORD_RECOVERY') recovering.current = true
      if (
        event === 'PASSWORD_RECOVERY' ||
        event === 'SIGNED_IN' ||
        event === 'SIGNED_OUT' ||
        event === 'MFA_CHALLENGE_VERIFIED'
      ) {
        // Fuera del callback: supabase-js no permite llamar a la API dentro de onAuthStateChange.
        setTimeout(() => void refresh(), 0)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [refresh])

  /** Después de guardar la contraseña nueva, sigue el flujo normal (2FA, rol). */
  const finishRecovery = useCallback(async () => {
    recovering.current = false
    window.history.replaceState(null, '', window.location.pathname)
    await refresh()
  }, [refresh])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setState({ kind: 'signed_out' })
  }, [])

  return { state, refresh, finishRecovery, signOut }
}

/** Qué puede hacer cada rol en el panel (la RLS es la que manda; esto solo oculta lo que no puede usar). */
export function can(role: Role, area: 'catalog' | 'business' | 'team' | 'money'): boolean {
  if (role === 'owner') return true
  if (role === 'admin') return area !== 'team' && area !== 'money'
  return false
}
