// Dinero en centavos enteros y porcentajes en partes por millón (docs/REGLAS.md A3, A8–A12).
// Los dólares existen solo al mostrar (formatUSD) y al leer lo que escribe el admin (parseUSD).
import { z } from 'zod'

declare const centsBrand: unique symbol
declare const ppmBrand: unique symbol

/** Monto en centavos enteros, nunca negativo. $12.50 = 1250. */
export type Cents = number & { readonly [centsBrand]: 'Cents' }
/** Porcentaje en partes por millón. 6.625 % = 66250; 100 % = 1_000_000. */
export type Ppm = number & { readonly [ppmBrand]: 'Ppm' }

/** Tope de seguridad por monto: $1,000,000. */
export const MAX_CENTS = 100_000_000
export const PPM_SCALE = 1_000_000
/** Cobro mínimo de Stripe en USD. */
export const STRIPE_MIN_CHARGE_CENTS = cents(50)

export class MoneyError extends Error {
  override readonly name = 'MoneyError'
}

export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_CENTS) {
    throw new MoneyError(`Monto inválido en centavos: ${value}`)
  }
  return value as Cents
}

export function ppm(value: number): Ppm {
  if (!Number.isSafeInteger(value) || value < 0 || value > PPM_SCALE) {
    throw new MoneyError(`Porcentaje inválido en ppm: ${value}`)
  }
  return value as Ppm
}

export const centsSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_CENTS)
  .transform((n) => cents(n))

export const ppmSchema = z
  .number()
  .int()
  .min(0)
  .max(PPM_SCALE)
  .transform((n) => ppm(n))

export function addCents(...amounts: readonly Cents[]): Cents {
  return cents(amounts.reduce<number>((sum, a) => sum + a, 0))
}

export function subtractCents(a: Cents, b: Cents): Cents {
  return cents(a - b)
}

export function multiplyCents(amount: Cents, quantity: number): Cents {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new MoneyError(`Cantidad inválida: ${quantity}`)
  }
  return cents(amount * quantity)
}

/**
 * Aplica un porcentaje a un monto, redondeando al centavo más cercano (medio centavo hacia arriba).
 * Todo en enteros: amount × rate ≤ 1e8 × 1e6 = 1e14, dentro de Number.MAX_SAFE_INTEGER.
 */
export function applyPpm(amount: Cents, rate: Ppm): Cents {
  return cents(Math.floor((amount * rate + PPM_SCALE / 2) / PPM_SCALE))
}

const USD_INPUT = /^\$?\s*((?:\d{1,3}(?:,\d{3})+)|\d+)(?:\.(\d{1,2}))?$/

/**
 * Lee lo que escribe el admin ("12.50", "$1,250", "12.5") sin pasar por decimales binarios.
 * Rechaza lo ambiguo: coma decimal ("12,50"), tres decimales ("1.250"), negativos o texto.
 */
export function parseUSD(input: string): Cents {
  const match = USD_INPUT.exec(input.trim())
  if (!match) {
    throw new MoneyError(`Formato de monto no válido: "${input}". Usa por ejemplo 12.50`)
  }
  const dollars = Number((match[1] ?? '0').replaceAll(',', ''))
  const fraction = (match[2] ?? '').padEnd(2, '0')
  return cents(dollars * 100 + Number(fraction))
}

const formatters: Record<'en' | 'es', Intl.NumberFormat> = {
  en: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
  es: new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD' }),
}

/** Solo para mostrar: 1250 → "$12.50". */
export function formatUSD(amount: Cents, locale: 'en' | 'es' = 'en'): string {
  return formatters[locale].format(amount / 100)
}

/** Porcentaje legible: 66250 → "6.625%". */
export function formatPpm(rate: Ppm): string {
  return `${(rate / 10_000).toString()}%`
}

const PERCENT_INPUT = /^(\d{1,3})(?:\.(\d{1,4}))?\s*%?$/

/**
 * Lo que escribe el admin ("6.625", "15 %") → ppm entero (66250, 150000), sin pasar por floats.
 * Hasta 4 decimales (la unidad mínima de ppm en porcentaje) y máximo 100 %.
 */
export function parsePercent(input: string): Ppm {
  const match = PERCENT_INPUT.exec(input.trim())
  if (!match) {
    throw new MoneyError(`Porcentaje no válido: "${input}". Usa por ejemplo 6.625`)
  }
  const whole = Number(match[1] ?? '0')
  const fraction = Number((match[2] ?? '').padEnd(4, '0'))
  return ppm(whole * 10_000 + fraction)
}

export interface OrderLine {
  unitPriceCents: Cents
  quantity: number
}

export type Discount = { type: 'fixed'; cents: Cents } | { type: 'percentage'; ppm: Ppm }

export interface OrderTotalsInput {
  lines: readonly OrderLine[]
  discount?: Discount
  taxRatePpm: Ppm
  tipCents?: Cents
  shippingCents?: Cents
}

export interface OrderTotals {
  subtotalCents: Cents
  discountCents: Cents
  taxCents: Cents
  shippingCents: Cents
  tipCents: Cents
  totalCents: Cents
}

/**
 * Orden fijo del cálculo (REGLAS.md A3), el mismo en el front, el Worker y los CHECKs de la BD:
 * 1) subtotal = Σ precio × cantidad; 2) − descuento (nunca más que el subtotal, A10);
 * 3) impuesto sobre (subtotal − descuento), una sola vez; 4) + envío; 5) + propina (sin impuesto, B9).
 */
export function computeOrderTotals(input: OrderTotalsInput): OrderTotals {
  if (input.lines.length === 0) {
    throw new MoneyError('El pedido no tiene líneas')
  }
  const subtotalCents = addCents(...input.lines.map((l) => multiplyCents(l.unitPriceCents, l.quantity)))

  let discountCents = cents(0)
  if (input.discount?.type === 'fixed') {
    discountCents = input.discount.cents
  } else if (input.discount?.type === 'percentage') {
    discountCents = applyPpm(subtotalCents, input.discount.ppm)
  }
  if (discountCents > subtotalCents) {
    discountCents = subtotalCents
  }

  const taxableCents = subtractCents(subtotalCents, discountCents)
  const taxCents = applyPpm(taxableCents, input.taxRatePpm)
  const shippingCents = input.shippingCents ?? cents(0)
  const tipCents = input.tipCents ?? cents(0)

  return {
    subtotalCents,
    discountCents,
    taxCents,
    shippingCents,
    tipCents,
    totalCents: addCents(taxableCents, taxCents, shippingCents, tipCents),
  }
}
