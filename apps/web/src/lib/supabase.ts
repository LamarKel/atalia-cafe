// Cliente de Supabase de solo lectura para el sitio público. Usa la clave "publishable":
// es pública por diseño y la RLS solo deja leer el catálogo activo (RNF-S03, RNF-S04).
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.PUBLIC_SUPABASE_URL
const key = import.meta.env.PUBLIC_SUPABASE_KEY

if (!url || !key) {
  throw new Error('Faltan PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_KEY (copia apps/web/.env.example a .env)')
}

export const supabase = createClient(url, key, { auth: { persistSession: false } })
