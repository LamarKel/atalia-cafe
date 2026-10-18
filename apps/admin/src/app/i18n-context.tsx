// Idioma del panel disponible en todas las pantallas sin pasarlo de mano en mano.
import { createContext, useContext, useState, type ReactNode } from 'react'
import { saveLocale, savedLocale, translate, type AdminKey, type AdminLocale } from '../i18n'

interface I18n {
  locale: AdminLocale
  t: (key: AdminKey, params?: Record<string, string | number>) => string
  toggle: () => void
}

const Ctx = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<AdminLocale>(() => savedLocale())
  const value: I18n = {
    locale,
    t: (key, params) => translate(locale, key, params),
    toggle: () => {
      const next = locale === 'es' ? 'en' : 'es'
      saveLocale(next)
      document.documentElement.lang = next
      setLocale(next)
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n(): I18n {
  const value = useContext(Ctx)
  if (value === null) throw new Error('useI18n fuera de I18nProvider')
  return value
}
