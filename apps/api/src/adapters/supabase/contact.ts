// Mensajes del formulario de contacto (con service_role: anon no puede escribir en contact_messages).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContactRepo } from '../../modules/contact/ports'

export function contactRepo(db: SupabaseClient): ContactRepo {
  return {
    async create(m) {
      const { data, error } = await db
        .from('contact_messages')
        .insert({
          store_id: m.storeId,
          name: m.name,
          // En minúsculas: así el límite por correo no se salta cambiando mayúsculas.
          email: m.email.trim().toLowerCase(),
          phone: m.phone === '' ? null : m.phone,
          language: m.locale,
          topic: m.topic,
          message: m.message,
        })
        .select('code')
        .single<{ code: string }>()
      if (error) throw new Error(`contact_messages: ${error.message}`)
      return data
    },
    async countRecentByEmail(email, sinceIso) {
      const { count, error } = await db
        .from('contact_messages')
        .select('id', { count: 'exact', head: true })
        .eq('email', email.trim().toLowerCase())
        .gte('created_at', sinceIso)
      if (error) throw new Error(`contact_messages_count: ${error.message}`)
      return count ?? 0
    },
  }
}
