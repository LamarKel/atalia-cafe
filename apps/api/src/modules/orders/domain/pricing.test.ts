import { cartLineSchema, type CartLineInput } from '@atalia/shared/checkout'
import { ppm } from '@atalia/shared/money'
import { describe, expect, it } from 'vitest'
import { PricingError, cartNeeds, priceCart, type CatalogPiece, type CatalogProduct } from './pricing'

const TRAY = '00000000-0000-4000-8000-000000000001'
const PICADERA = '00000000-0000-4000-8000-000000000002'
const S10 = '00000000-0000-4000-8000-000000000010'
const S20 = '00000000-0000-4000-8000-000000000020'
const P10 = '00000000-0000-4000-8000-000000000030'
const LATTE = '00000000-0000-4000-8000-000000000003'
const OAT = '00000000-0000-4000-8000-000000000051'
const SHOT = '00000000-0000-4000-8000-000000000052'
const OLD = '00000000-0000-4000-8000-000000000053'
const Q1 = '00000000-0000-4000-8000-000000000041'
const Q2 = '00000000-0000-4000-8000-000000000042'

const size = (id: string, over: Partial<CatalogProduct['sizes'][number]>) => ({
  id,
  nameEn: 'Size',
  nameEs: 'Tamaño',
  serves: null,
  units: null,
  priceCents: null,
  priceModifierCents: 0,
  active: true,
  ...over,
})

const catalog = new Map<string, CatalogProduct>([
  [
    TRAY,
    {
      id: TRAY,
      type: 'tray',
      nameEn: 'Breakfast tray',
      nameEs: 'Bandeja de desayuno',
      priceCents: null,
      minLeadHours: 24,
      active: true,
      sizes: [size(S10, { serves: 10, priceCents: 9000 }), size(S20, { serves: 20, priceCents: null })],
      extras: [],
    },
  ],
  [
    PICADERA,
    {
      id: PICADERA,
      type: 'picadera_pack',
      nameEn: 'Picadera',
      nameEs: 'Picadera',
      priceCents: 1500,
      minLeadHours: 1,
      active: true,
      sizes: [size(P10, { units: 10, priceModifierCents: 500 })],
      extras: [],
    },
  ],
  [
    LATTE,
    {
      id: LATTE,
      type: 'menu',
      nameEn: 'Latte',
      nameEs: 'Latte',
      priceCents: 450,
      minLeadHours: 0,
      active: true,
      sizes: [],
      extras: [
        { id: OAT, nameEn: 'Oat milk', nameEs: 'Leche de avena', priceCents: 75, active: true },
        { id: SHOT, nameEn: 'Extra shot', nameEs: 'Shot extra', priceCents: 100, active: true },
        { id: OLD, nameEn: 'Old syrup', nameEs: 'Sirope viejo', priceCents: 50, active: false },
      ],
    },
  ],
])

const pieces = new Map<string, CatalogPiece>([
  [Q1, { id: Q1, labelEn: 'Beef quipe', labelEs: 'Quipe de res', active: true }],
  [Q2, { id: Q2, labelEn: 'Chicken quipe', labelEs: 'Quipe de pollo', active: false }],
])

const rules = { taxRatePpm: ppm(66_250), maxQtyPerProduct: 10 }
const price = (items: CartLineInput[], locale: 'en' | 'es' = 'es') =>
  priceCart(
    items.map((i) => cartLineSchema.parse(i)),
    catalog,
    pieces,
    rules,
    locale,
  )
const code = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    return e instanceof PricingError ? e.code : 'other'
  }
  return 'none'
}

describe('priceCart', () => {
  it('usa el precio de la BD, no el del navegador, y calcula el impuesto de NJ', () => {
    const cart = price([
      { productId: TRAY, sizeId: S10, quantity: 2 },
      { productId: PICADERA, sizeId: P10, quantity: 1, components: [{ optionId: Q1, qty: 10 }] },
    ])
    expect(cart.lines.map((l) => l.unitPriceCents)).toEqual([9000, 2000])
    expect(cart.totals).toMatchObject({ subtotalCents: 20000, taxCents: 1325, totalCents: 21325 })
    expect(cart.needs).toEqual({ tray: 2, picadera_pack: 1 })
    expect(cart.leadHours).toBe(24)
    expect(cart.lines[0]?.nameSnapshot).toBe('Bandeja de desayuno')
    expect(cart.lines[1]?.components).toEqual([{ optionId: Q1, labelSnapshot: 'Quipe de res', qty: 10 }])
  })

  it('rechaza productos y opciones que no existen o están inactivos', () => {
    expect(code(() => price([{ productId: Q1, sizeId: null, quantity: 1 }]))).toBe('product_unavailable')
    expect(code(() => price([{ productId: TRAY, sizeId: P10, quantity: 1 }]))).toBe('size_unavailable')
    expect(code(() => price([{ productId: TRAY, sizeId: null, quantity: 1 }]))).toBe('size_required')
  })

  it('no deja pagar lo que todavía no tiene precio', () => {
    expect(code(() => price([{ productId: TRAY, sizeId: S20, quantity: 1 }]))).toBe('price_missing')
  })

  it('aplica el máximo por producto sumando todas sus líneas', () => {
    expect(
      code(() =>
        price([
          { productId: TRAY, sizeId: S10, quantity: 6 },
          { productId: TRAY, sizeId: S10, quantity: 5, notes: 'otra' },
        ]),
      ),
    ).toBe('quantity_exceeded')
  })

  it('exige la cuenta exacta de piezas y piezas activas', () => {
    const pack = (components: CartLineInput['components']) => () =>
      price([{ productId: PICADERA, sizeId: P10, quantity: 1, components }])
    expect(code(pack([{ optionId: Q1, qty: 9 }]))).toBe('picadera_invalid')
    expect(code(pack([]))).toBe('picadera_invalid')
    expect(
      code(
        pack([
          { optionId: Q1, qty: 5 },
          { optionId: Q2, qty: 5 },
        ]),
      ),
    ).toBe('piece_unavailable')
    expect(
      code(() =>
        price([{ productId: TRAY, sizeId: S10, quantity: 1, components: [{ optionId: Q1, qty: 1 }] }]),
      ),
    ).toBe('picadera_invalid')
  })
})

describe('cartNeeds', () => {
  it('suma cupo por tipo y toma la anticipación más larga, aunque falte el precio', () => {
    const items = [
      { productId: TRAY, sizeId: S20, quantity: 1 },
      { productId: PICADERA, sizeId: P10, quantity: 2 },
    ].map((i) => cartLineSchema.parse(i))
    expect(cartNeeds(items, catalog)).toEqual({ needs: { tray: 1, picadera_pack: 2 }, leadHours: 24 })
  })
})

describe('extras del menú', () => {
  it('suma los extras al precio de la unidad con el precio de la BD', () => {
    const cart = price([{ productId: LATTE, sizeId: null, quantity: 2, extraIds: [OAT, SHOT] }])
    expect(cart.lines[0]?.unitPriceCents).toBe(625)
    expect(cart.lines[0]?.extras).toEqual([
      { id: OAT, nameSnapshot: 'Leche de avena', priceCents: 75 },
      { id: SHOT, nameSnapshot: 'Shot extra', priceCents: 100 },
    ])
    expect(cart.totals.subtotalCents).toBe(1250)
  })

  it('rechaza extras inactivos, de otro producto o repetidos', () => {
    expect(code(() => price([{ productId: LATTE, sizeId: null, quantity: 1, extraIds: [OLD] }]))).toBe(
      'extra_unavailable',
    )
    expect(code(() => price([{ productId: TRAY, sizeId: S10, quantity: 1, extraIds: [OAT] }]))).toBe(
      'extra_unavailable',
    )
    expect(code(() => price([{ productId: LATTE, sizeId: null, quantity: 1, extraIds: [OAT, OAT] }]))).toBe(
      'extra_unavailable',
    )
  })
})
