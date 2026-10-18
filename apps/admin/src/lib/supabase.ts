// Cliente de Supabase del panel. Usa la clave pública y la sesión del usuario: la RLS decide qué ve y qué
// cambia cada rol, y sin 2FA (aal2) no ve nada (has_admin_role en la BD).
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_KEY,
  {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'atalia-admin-auth' },
  },
)
