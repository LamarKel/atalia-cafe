// Funciones puras para mostrar el catálogo (sin acceso a la BD, con pruebas en catalog-format.test.ts).
import { cents, type Cents } from '@atalia/shared/money'

export type ProductType = 'menu' | 'tray' | 'table' | 'picadera_pack'

export interface SizeRow {
  serves: number | null
  units: number | null
  price_cents: number | null
  price_modifier_cents: number
  active: boolean
}

/** Precio de una opción: el absoluto si existe; si no, base + modificador (docs/DATABASE.md §3.1). */
export function sizePrice(basePriceCents: number | null, size: SizeRow): Cents | null {
  if (size.price_cents !== null) return cents(size.price_cents)
  if (basePriceCents === null) return null
  return cents(basePriceCents + size.price_modifier_cents)
}

/** "Desde $": la opción activa más barata, o null si todavía no hay precios. */
export function fromPrice(basePriceCents: number | null, sizes: readonly SizeRow[]): Cents | null {
  const prices = sizes
    .filter((s) => s.active)
    .map((s) => sizePrice(basePriceCents, s))
    .filter((p): p is Cents => p !== null)
  if (prices.length === 0) {
    return basePriceCents === null ? null : cents(basePriceCents)
  }
  return cents(Math.min(...prices))
}

/** Personas (bandejas y mesas) o piezas (picaderas) que ofrece un producto, ordenadas. */
export function sizeAmounts(
  sizes: readonly SizeRow[],
): { kind: 'serves' | 'units'; values: number[] } | null {
  const active = sizes.filter((s) => s.active)
  const serves = active.map((s) => s.serves).filter((n): n is number => n !== null)
  if (serves.length > 0) return { kind: 'serves', values: [...new Set(serves)].sort((a, b) => a - b) }
  const units = active.map((s) => s.units).filter((n): n is number => n !== null)
  if (units.length > 0) return { kind: 'units', values: [...new Set(units)].sort((a, b) => a - b) }
  return null
}

/** Filtro de invitados del catálogo (pantalla 02): 5, 10, 15 exactos; "20+" = 20 o más. */
export type GuestFilter = '5' | '10' | '15' | '20+'

export function matchesGuests(sizes: readonly SizeRow[], filter: GuestFilter | null): boolean {
  if (filter === null) return true
  const serves = sizes.filter((s) => s.active && s.serves !== null).map((s) => s.serves as number)
  if (filter === '20+') return serves.some((n) => n >= 20)
  return serves.includes(Number(filter))
}

export interface HoursRow {
  weekday: number // 0 = domingo
  opens_at: string // "07:00:00"
  closes_at: string
}

/** "07:00:00" → "7:00 AM" (formato de EE. UU., igual en EN y ES). */
export function formatTime(value: string): string {
  const [h = '0', m = '00'] = value.split(':')
  const hour = Number(h)
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${m} ${suffix}`
}

/**
 * Agrupa días consecutivos con el mismo horario, empezando el lunes:
 * [{days: [1,2,3,4], text: "7:00 AM – 9:00 PM"}, …]. Los días sin fila quedan como cerrados.
 */
export function groupHours(rows: readonly HoursRow[]): Array<{ days: number[]; text: string | null }> {
  const order = [1, 2, 3, 4, 5, 6, 0]
  const byDay = new Map(
    rows.map((r) => [r.weekday, `${formatTime(r.opens_at)} – ${formatTime(r.closes_at)}`]),
  )
  const groups: Array<{ days: number[]; text: string | null }> = []
  for (const day of order) {
    const text = byDay.get(day) ?? null
    const last = groups.at(-1)
    if (last !== undefined && last.text === text) {
      last.days.push(day)
    } else {
      groups.push({ days: [day], text })
    }
  }
  return groups
}

/** Enlace de "Cómo llegar" a Google Maps a partir de las coordenadas de la tienda. */
export function directionsUrl(lat: number | null, lng: number | null): string | null {
  if (lat === null || lng === null) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}

/** "≈ $ por persona" (solo para mostrar): precio de la opción entre las personas, redondeado al centavo. */
export function perPersonCents(priceCents: number | null, serves: number | null): number | null {
  if (priceCents === null || serves === null || serves <= 0) return null
  return Math.round(priceCents / serves)
}

/** Solo enlaces https (un valor raro en la BD nunca se convierte en un javascript: en el sitio). */
export function safeUrl(url: string | null | undefined): string | null {
  if (url === null || url === undefined || url.trim() === '') return null
  try {
    const u = new URL(url.trim())
    return u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}
