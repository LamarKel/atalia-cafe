import { describe, expect, it } from 'vitest'
import { cartCount, cartSubtotal, type CartItem } from './cart'

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
