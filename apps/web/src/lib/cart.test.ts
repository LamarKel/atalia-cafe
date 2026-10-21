import { describe, expect, it } from 'vitest'
import { cartCount, cartSubtotal, insertLine, type CartItem } from './cart'

const line = (over: Partial<CartItem>): CartItem => ({
  lineId: 'l1',
  productId: 'p1',
  slug: 'breakfast-tray',
  type: 'tray',
  name: 'Breakfast tray',
  sizeId: 's1',
  sizeLabel: '10',
  serves: 10,
  units: null,
  unitPriceCents: 9000,
  quantity: 1,
  notes: '',
  minLeadHours: 24,
  components: [],
  extras: [],
  ...over,
})

describe('carrito', () => {
  it('cuenta unidades, no líneas', () => {
    expect(cartCount([line({ quantity: 2 }), line({ lineId: 'l2', quantity: 3 })])).toBe(5)
  })
  it('suma precio × cantidad en centavos', () => {
    expect(cartSubtotal([line({ quantity: 2 }), line({ lineId: 'l2', unitPriceCents: 1250 })])).toEqual({
      cents: 19250,
      hasUnpriced: false,
    })
  })
  it('avisa si hay líneas sin precio', () => {
    expect(cartSubtotal([line({ unitPriceCents: null })])).toEqual({ cents: 0, hasUnpriced: true })
  })
  it('carrito vacío', () => {
    expect(cartSubtotal([])).toEqual({ cents: 0, hasUnpriced: false })
  })
})

describe('deshacer al quitar una línea', () => {
  const a = line({ lineId: 'a' })
  const b = line({ lineId: 'b' })
  const c = line({ lineId: 'c' })
  it('la devuelve al mismo lugar', () => {
    expect(insertLine([a, c], b, 1).map((i) => i.lineId)).toEqual(['a', 'b', 'c'])
  })
  it('si el carrito cambió, la pone al final sin salirse', () => {
    expect(insertLine([a], c, 5).map((i) => i.lineId)).toEqual(['a', 'c'])
  })
  it('no la duplica si ya está (doble clic en Deshacer)', () => {
    expect(insertLine([a, b], b, 1).map((i) => i.lineId)).toEqual(['a', 'b'])
  })
})
