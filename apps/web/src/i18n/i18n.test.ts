import { describe, expect, it } from 'vitest'
import en from './en.json'
import es from './es.json'
import { localizedPath, otherLocale, t } from './index'

describe('i18n', () => {
  it('EN y ES tienen las mismas claves', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort())
  })

  it('ningún texto está vacío', () => {
    for (const [key, value] of [...Object.entries(en), ...Object.entries(es)]) {
      expect(value.trim(), key).not.toBe('')
    }
  })

  it('traduce', () => {
    expect(t('en', 'nav.menu')).toBe('Menu')
    expect(t('es', 'nav.menu')).toBe('Menú')
  })

  it('rutas equivalentes entre idiomas', () => {
    expect(localizedPath('/', 'es')).toBe('/es')
    expect(localizedPath('/catering', 'es')).toBe('/es/catering')
    expect(localizedPath('/es/catering', 'en')).toBe('/catering')
    expect(localizedPath('/es', 'en')).toBe('/')
    expect(localizedPath('/essentials', 'en')).toBe('/essentials')
    expect(otherLocale('en')).toBe('es')
  })
})
