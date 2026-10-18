import { describe, expect, it } from 'vitest'
import en from './en.json'
import es from './es.json'
import { translate } from './index'

describe('textos del panel', () => {
  it('ES y EN tienen las mismas claves y ninguna vacía', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort())
    for (const v of [...Object.values(en), ...Object.values(es)]) expect(v.trim()).not.toBe('')
  })
  it('reemplaza parámetros', () => {
    expect(translate('es', 'soon.text', { n: 2 })).toBe('Esta sección llega en la fase 2 del panel.')
  })
})
