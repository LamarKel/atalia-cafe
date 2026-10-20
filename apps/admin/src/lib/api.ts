// Llamadas del panel al Worker con el token de la sesión (Authorization: Bearer). El Worker vuelve a validar
// el token, el rol y el 2FA: nunca confía en lo que dice el panel.
import { supabase } from './supabase'

const API = import.meta.env.PUBLIC_API_URL.replace(/\/$/, '')

export async function workerApi<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
      ...init?.headers,
    },
  })
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } }
  if (!res.ok) throw new Error(body.error?.message ?? String(res.status))
  return body
}
