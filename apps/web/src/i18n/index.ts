// Textos fijos de la interfaz (botones, menús, etiquetas de accesibilidad).
// El contenido editable (hero, pasos, políticas, horario…) viene de la BD (site_content), no de aquí.
import en from './en.json'
import es from './es.json'

export const LOCALES = ['en', 'es'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

export type MessageKey = keyof typeof en

// es.json debe tener exactamente las mismas claves (lo verifica i18n.test.ts y el tipo de abajo).
const messages: Record<Locale, Record<MessageKey, string>> = { en, es }

export function t(locale: Locale, key: MessageKey, params?: Record<string, string | number>): string {
  const text = messages[locale][key]
  if (params === undefined) return text
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  )
}

/** Todos los textos de un idioma, para pasarlos a una isla de React. */
export function messagesFor(locale: Locale): Record<MessageKey, string> {
  return messages[locale]
}

export function isLocale(value: string | undefined): value is Locale {
  return value === 'en' || value === 'es'
}

/** Ruta equivalente en el otro idioma: "/catering" ↔ "/es/catering". */
export function localizedPath(path: string, locale: Locale): string {
  const clean = path.replace(/^\/es(?=\/|$)/, '') || '/'
  if (locale === DEFAULT_LOCALE) return clean
  return clean === '/' ? '/es' : `/es${clean}`
}

export function otherLocale(locale: Locale): Locale {
  return locale === 'en' ? 'es' : 'en'
}
