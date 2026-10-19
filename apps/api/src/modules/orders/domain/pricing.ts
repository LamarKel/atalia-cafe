// Precio del carrito calculado en el servidor (A8): el navegador nunca decide cuánto cuesta algo.
// Lógica pura: recibe el catálogo ya leído y las reglas vigentes; no conoce Supabase ni Stripe.
import type { CartLine } from '@atalia/shared/checkout'
import {
  addCents,
  cents,
  computeOrderTotals,
  multiplyCents,
  type Cents,
  type Discount,
  type OrderTotals,
  type Ppm,
} from '@atalia/shared/money'
import { picaderaSelectionSchema } from '@atalia/shared/picadera'

export type ProductType = 'menu' | 'tray' | 'table' | 'picadera_pack'
export type Locale = 'en' | 'es'

export interface CatalogSize {
  id: string
  nameEn: string
  nameEs: string | null
  serves: number | null
  units: number | null
  priceCents: number | null
  priceModifierCents: number
  active: boolean
}

export interface CatalogProduct {
  id: string
  type: ProductType
  nameEn: string
  nameEs: string | null
  priceCents: number | null
  minLeadHours: number
  active: boolean
  sizes: CatalogSize[]
  extras: CatalogExtra[]
}

export interface CatalogExtra {
  id: string
  nameEn: string
  nameEs: string | null
  priceCents: number
  active: boolean
}

export interface CatalogPiece {
  id: string
  labelEn: string
  labelEs: string | null
  active: boolean
}

export interface PricingRules {
  taxRatePpm: Ppm
  maxQtyPerProduct: number
}

export type PricingErrorCode =
  | 'product_unavailable'
  | 'size_required'
  | 'size_unavailable'
  | 'price_missing'
  | 'quantity_exceeded'
  | 'picadera_invalid'
  | 'piece_unavailable'
  | 'extra_unavailable'

export class PricingError extends Error {
  override readonly name = 'PricingError'
  constructor(
    readonly code: PricingErrorCode,
    readonly lineIndex: number,
  ) {
    super(code)
  }
}

export interface PricedLine {
  productId: string
  sizeId: string | null
  productType: ProductType
  nameSnapshot: string
  sizeLabelSnapshot: string | null
  serves: number | null
  units: number | null
  notes: string
  unitPriceCents: Cents
  quantity: number
  components: Array<{ optionId: string; labelSnapshot: string; qty: number }>
  /** Extras elegidos con su precio de ese momento; ya están sumados en unitPriceCents. */
  extras: Array<{ id: string; nameSnapshot: string; priceCents: Cents }>
}

export interface PricedCart {
  lines: PricedLine[]
  totals: OrderTotals
  /** Unidades por categoría de cupo (capacity_*.category = tipo de producto). */
  needs: Partial<Record<ProductType, number>>
  /** La anticipación más larga del carrito (RF: una sola hora que respeta a todos). */
  leadHours: number
}

const pick = (locale: Locale, en: string, es: string | null) => (locale === 'es' && es ? es : en)

/** Precio de una opción: el absoluto si existe; si no, base + modificador (docs/DATABASE.md §3.1). */
export function optionPrice(product: CatalogProduct, size: CatalogSize | null): Cents | null {
  if (size?.priceCents != null) return cents(size.priceCents)
  if (product.priceCents === null) return null
  return cents(product.priceCents + (size?.priceModifierCents ?? 0))
}

export function priceCart(
  items: readonly CartLine[],
  catalog: ReadonlyMap<string, CatalogProduct>,
  pieces: ReadonlyMap<string, CatalogPiece>,
  rules: PricingRules,
  locale: Locale,
  discount?: Discount,
): PricedCart {
  const qtyByProduct = new Map<string, number>()
  const lines = items.map((item, index): PricedLine => {
    const product = catalog.get(item.productId)
    if (product === undefined || !product.active) throw new PricingError('product_unavailable', index)

    const activeSizes = product.sizes.filter((s) => s.active)
    let size: CatalogSize | null = null
    if (item.sizeId !== null) {
      size = activeSizes.find((s) => s.id === item.sizeId) ?? null
      if (size === null) throw new PricingError('size_unavailable', index)
    } else if (activeSizes.length > 0) {
      throw new PricingError('size_required', index)
    }

    const total = (qtyByProduct.get(product.id) ?? 0) + item.quantity
    if (total > rules.maxQtyPerProduct) throw new PricingError('quantity_exceeded', index)
    qtyByProduct.set(product.id, total)

    const basePrice = optionPrice(product, size)
    if (basePrice === null) throw new PricingError('price_missing', index)

    if (new Set(item.extraIds).size !== item.extraIds.length)
      throw new PricingError('extra_unavailable', index)
    const extras = item.extraIds.map((id) => {
      const extra = product.extras.find((e) => e.id === id && e.active)
      if (extra === undefined) throw new PricingError('extra_unavailable', index)
      return {
        id: extra.id,
        nameSnapshot: pick(locale, extra.nameEn, extra.nameEs),
        priceCents: cents(extra.priceCents),
      }
    })
    const unitPrice = addCents(basePrice, ...extras.map((e) => e.priceCents))

    let components: PricedLine['components'] = []
    if (product.type === 'picadera_pack') {
      const parsed = picaderaSelectionSchema.safeParse({
        units: size?.units ?? 0,
        components: item.components,
      })
      if (!parsed.success) throw new PricingError('picadera_invalid', index)
      components = parsed.data.components.map((c) => {
        const piece = pieces.get(c.optionId)
        if (piece === undefined || !piece.active) throw new PricingError('piece_unavailable', index)
        return { optionId: c.optionId, labelSnapshot: pick(locale, piece.labelEn, piece.labelEs), qty: c.qty }
      })
    } else if (item.components.length > 0) {
      throw new PricingError('picadera_invalid', index)
    }

    return {
      productId: product.id,
      sizeId: size?.id ?? null,
      productType: product.type,
      nameSnapshot: pick(locale, product.nameEn, product.nameEs),
      sizeLabelSnapshot: size === null ? null : pick(locale, size.nameEn, size.nameEs),
      serves: size?.serves ?? null,
      units: size?.units ?? null,
      notes: item.notes,
      unitPriceCents: unitPrice,
      quantity: item.quantity,
      components,
      extras,
    }
  })

  const { needs, leadHours } = cartNeeds(items, catalog)

  const totals = computeOrderTotals({
    lines: lines.map((l) => ({ unitPriceCents: l.unitPriceCents, quantity: l.quantity })),
    taxRatePpm: rules.taxRatePpm,
    ...(discount === undefined ? {} : { discount }),
  })

  return { lines, totals, needs, leadHours }
}

/**
 * Lo que el carrito necesita del calendario (cupo por categoría y anticipación), sin exigir precios:
 * sirve para mostrar horas disponibles aunque un producto todavía no tenga precio.
 */
export function cartNeeds(
  items: readonly CartLine[],
  catalog: ReadonlyMap<string, CatalogProduct>,
): Pick<PricedCart, 'needs' | 'leadHours'> {
  const needs: PricedCart['needs'] = {}
  let leadHours = 0
  items.forEach((item, index) => {
    const product = catalog.get(item.productId)
    if (product === undefined || !product.active) throw new PricingError('product_unavailable', index)
    needs[product.type] = (needs[product.type] ?? 0) + item.quantity
    leadHours = Math.max(leadHours, product.minLeadHours)
  })
  return { needs, leadHours }
}

/** Detalle visible de una línea: tamaño y extras ("Grande · 20 oz · Leche de avena"). */
export function lineDetail(line: PricedLine): string | null {
  const parts = [line.sizeLabelSnapshot, ...line.extras.map((e) => e.nameSnapshot)].filter(
    (p): p is string => p !== null && p !== '',
  )
  return parts.length === 0 ? null : parts.join(' · ')
}

/** ¿Hay catering en el carrito? (bandejas, mesas, picaderas: todo lo que no es menú del café) */
export const hasCatering = (lines: readonly PricedLine[]): boolean =>
  lines.some((l) => l.productType !== 'menu')

/** Total de una línea, para mostrar o comparar. */
export const lineTotal = (line: PricedLine): Cents => multiplyCents(line.unitPriceCents, line.quantity)
