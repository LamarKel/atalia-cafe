// Textos fijos del panel (ES por defecto: la usa el equipo del café; EN disponible).
import en from './en.json'
import es from './es.json'

export type AdminLocale = 'es' | 'en'
export type AdminKey = keyof typeof es

// en.json debe tener exactamente las mismas claves (el tipo lo exige).
const messages: Record<AdminLocale, Record<AdminKey, string>> = { es, en }

export function translate(
  locale: AdminLocale,
  key: AdminKey,
  params?: Record<string, string | number>,
): string {
  const text = messages[locale][key]
  if (params === undefined) return text
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  )
}

const KEY = 'atalia.admin.locale'

export function savedLocale(): AdminLocale {
  try {
    return localStorage.getItem(KEY) === 'en' ? 'en' : 'es'
  } catch {
    return 'es'
  }
}

export function saveLocale(locale: AdminLocale): void {
  try {
    localStorage.setItem(KEY, locale)
  } catch {
    // Sin almacenamiento: el idioma dura esta visita.
  }
}
