import { describe, expect, it } from 'vitest'
import { childChanges, productDraftSchema, slugify, type ProductDraftInput } from './index'

const CAT = '3353baa5-aede-4081-8a4c-796aa2182d68'
const base: ProductDraftInput = {
  id: null,
  type: 'menu',
  categoryId: CAT,
  slug: '',
  nameEn: 'Latte',
  nameEs: '',
  shortDescriptionEn: '',
  shortDescriptionEs: '',
  descriptionEn: '',
  descriptionEs: '',
  priceCents: 475,
  minLeadHours: 0,
  featured: false,
  vegetarian: false,
  stockEnabled: false,
  inStock: true,
  active: true,
  sizes: [],
  extras: [],
  nutrition: [],
  inclusions: [],
}

const code = (input: ProductDraftInput) => {
  const r = productDraftSchema.safeParse(input)
  return r.success ? 'ok' : r.error.issues.map((i) => i.message).join(',')
}

describe('editor de productos', () => {
  it('textos vacíos se guardan como null', () => {
    const p = productDraftSchema.parse(base)
    expect(p.nameEs).toBeNull()
    expect(p.slug).toBeNull()
  })

  it('el menú necesita precio y el catering necesita slug', () => {
    expect(code({ ...base, priceCents: null })).toBe('price_required')
    expect(code({ ...base, type: 'tray', priceCents: null })).toBe('slug_required')
    expect(code({ ...base, type: 'tray', priceCents: null, slug: 'breakfast-tray' })).toBe('ok')
    expect(code({ ...base, slug: 'Con Espacios' })).toBe('invalid_slug')
  })

  it('una opción es por personas o por piezas, no ambas; la picadera exige piezas', () => {
    const size = {
      id: null,
      nameEn: '10',
      nameEs: '',
      serves: 10,
      units: 10,
      priceCents: 9000,
      priceModifierCents: 0,
      active: true,
    }
    expect(code({ ...base, sizes: [size] })).toBe('serves_or_units')
    expect(
      code({ ...base, type: 'picadera_pack', slug: 'picadera', sizes: [{ ...size, units: null }] }),
    ).toBe('units_required')
  })

  it('slug sin acentos ni espacios', () => {
    expect(slugify('  Tabla de Charcutería ')).toBe('tabla-de-charcuteria')
    expect(slugify('Café & Té!!')).toBe('cafe-te')
  })

  it('calcula qué filas hijas borrar y el orden nuevo', () => {
    const r = childChanges(['a', 'b', 'c'], [{ id: 'c' }, { id: null }, { id: 'a' }])
    expect(r.deleteIds).toEqual(['b'])
    expect(r.upserts.map((x) => [x.id, x.sortOrder])).toEqual([
      ['c', 1],
      [null, 2],
      ['a', 3],
    ])
  })
})
