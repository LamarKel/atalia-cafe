import { describe, expect, it } from 'vitest'
import type { MenuCategory, MenuItem } from './catalog'
import {
  activeSection,
  cardPrice,
  centeredScroll,
  groupCategories,
  needsOptions,
  searchMenu,
  unitPrice,
} from './menu'

const item = (over: Partial<MenuItem>): MenuItem => ({
  id: 'i',
  categoryId: 'c',
  name: 'Latte',
  description: 'Espresso y leche vaporizada',
  priceCents: 475,
  featured: false,
  soldOut: false,
  imageUrl: null,
  sizes: [],
  extras: [],
  nutrition: [],
  ...over,
})

const latte = item({
  sizes: [
    { id: 's', name: 'Pequeño', priceCents: 475 },
    { id: 'm', name: 'Mediano', priceCents: 525 },
  ],
  extras: [
    { id: 'oat', name: 'Leche de avena', priceCents: 75 },
    { id: 'shot', name: 'Shot extra', priceCents: 100 },
  ],
})

const cat = (id: string, name: string, group: string, items: MenuItem[]): MenuCategory => ({
  id,
  slug: id,
  name,
  description: null,
  icon: '',
  group,
  items,
})

describe('menú', () => {
  it('suma tamaño y extras al precio de la unidad', () => {
    expect(unitPrice(latte, 'm', ['oat', 'shot'])).toBe(700)
    expect(unitPrice(latte, null, [])).toBe(475)
    expect(unitPrice(item({ priceCents: null }), null, [])).toBeNull()
  })

  it('la tarjeta muestra el tamaño más barato', () => {
    expect(cardPrice(latte)).toBe(475)
    expect(cardPrice(item({ priceCents: 300 }))).toBe(300)
  })

  it('con tamaños o extras abre el modal; si no, se agrega directo', () => {
    expect(needsOptions(latte)).toBe(true)
    expect(needsOptions(item({}))).toBe(false)
  })

  it('busca sin acentos en nombre, descripción y categoría', () => {
    const menu = [
      cat('hot', 'Café Caliente', 'Drinks', [latte, item({ id: 'e', name: 'Espresso', description: null })]),
      cat('bakery', 'Panadería', 'Food', [item({ id: 'c', name: 'Croissant', description: 'Hojaldrado' })]),
    ]
    expect(searchMenu(menu, 'cafe').map((c) => c.items.length)).toEqual([2])
    expect(searchMenu(menu, 'hojaldrado')[0]?.items[0]?.name).toBe('Croissant')
    expect(searchMenu(menu, 'pizza')).toEqual([])
    expect(searchMenu(menu, '  ')).toHaveLength(2)
  })

  it('agrupa las categorías en el orden en que vienen', () => {
    const groups = groupCategories([
      cat('a', 'Tendencias', 'Favorites', []),
      cat('b', 'Café', 'Drinks', []),
      cat('c', 'Té', 'Drinks', []),
      cat('d', 'Postres', 'Food', []),
    ])
    expect(groups.map((g) => [g.group, g.categories.length])).toEqual([
      ['Favorites', 1],
      ['Drinks', 2],
      ['Food', 1],
    ])
  })
})

describe('categoría activa al hacer scroll', () => {
  const sections = [
    { id: 'cafe', top: -900 },
    { id: 'frias', top: -200 },
    { id: 'postres', top: 400 },
    { id: 'bebidas', top: 1300 },
  ]
  it('la última cuyo título ya pasó la barra fija', () => {
    expect(activeSection(sections, 150, false)).toBe('frias')
    expect(
      activeSection(
        sections.map((s) => ({ ...s, top: s.top + 1000 })),
        150,
        false,
      ),
    ).toBe('cafe')
  })
  it('al principio, la primera; al final de la página, la última', () => {
    expect(
      activeSection(
        [
          { id: 'cafe', top: 600 },
          { id: 'te', top: 900 },
        ],
        150,
        false,
      ),
    ).toBe('cafe')
    expect(activeSection(sections, 150, true)).toBe('bebidas')
    expect(activeSection([], 150, false)).toBeNull()
  })
  it('centra la categoría activa en la fila', () => {
    expect(centeredScroll(500, 100, 300)).toBe(400)
    expect(centeredScroll(20, 100, 300)).toBe(0)
  })
})
