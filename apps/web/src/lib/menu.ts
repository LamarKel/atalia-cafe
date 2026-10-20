// Lógica del menú sin React: precio mostrado, búsqueda y si un producto se agrega directo o abre el modal.
// Los precios son solo para mostrar; el Worker vuelve a calcular todo al pagar (A8).
import { addCents, cents, type Cents } from '@atalia/shared/money'
import type { MenuCategory, MenuItem } from './catalog'

/** Quita acentos y mayúsculas para buscar "cafe" y encontrar "Café". */
export const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Como en la app anterior: con tamaños o extras se abre el modal; si no, "Agregar" lo pone directo. */
export function needsOptions(item: Pick<MenuItem, 'sizes' | 'extras'>): boolean {
  return item.sizes.length > 0 || item.extras.length > 0
}

/** Precio de una unidad con el tamaño y los extras elegidos; null si todavía no tiene precio. */
export function unitPrice(
  item: Pick<MenuItem, 'priceCents' | 'sizes' | 'extras'>,
  sizeId: string | null,
  extraIds: readonly string[],
): Cents | null {
  const size = sizeId === null ? undefined : item.sizes.find((s) => s.id === sizeId)
  const base = size?.priceCents ?? item.priceCents
  if (base === null) return null
  const extras = item.extras.filter((e) => extraIds.includes(e.id)).map((e) => cents(e.priceCents))
  return addCents(cents(base), ...extras)
}

/** Precio que se ve en la tarjeta: el del tamaño más barato si tiene tamaños. */
export function cardPrice(item: Pick<MenuItem, 'priceCents' | 'sizes'>): Cents | null {
  const prices = item.sizes.map((s) => s.priceCents).filter((p): p is number => p !== null)
  if (prices.length > 0) return cents(Math.min(...prices))
  return item.priceCents === null ? null : cents(item.priceCents)
}

/** Búsqueda por nombre y descripción; deja solo las categorías con resultados. */
export function searchMenu(categories: readonly MenuCategory[], query: string): MenuCategory[] {
  const q = normalize(query.trim())
  if (q === '') return [...categories]
  return categories
    .map((c) => ({
      ...c,
      items: c.items.filter((i) => normalize(`${i.name} ${i.description ?? ''} ${c.name}`).includes(q)),
    }))
    .filter((c) => c.items.length > 0)
}

/** Categorías agrupadas como en la barra lateral de la app anterior (Bebidas, Comida…), en su orden. */
export function groupCategories(
  categories: readonly MenuCategory[],
): Array<{ group: string; categories: MenuCategory[] }> {
  const groups: Array<{ group: string; categories: MenuCategory[] }> = []
  for (const c of categories) {
    const last = groups.find((g) => g.group === c.group)
    if (last) last.categories.push(c)
    else groups.push({ group: c.group, categories: [c] })
  }
  return groups
}

/**
 * Categoría activa según el scroll: la última cuyo título ya pasó la línea de las barras fijas
 * (offset, en px desde arriba). Al llegar al final de la página, la última (las cortas nunca llegan arriba).
 */
export function activeSection(
  sections: ReadonlyArray<{ id: string; top: number }>,
  offset: number,
  atBottom: boolean,
): string | null {
  if (sections.length === 0) return null
  if (atBottom) return sections.at(-1)?.id ?? null
  let current = sections[0]?.id ?? null
  for (const s of sections) {
    if (s.top <= offset) current = s.id
    else break
  }
  return current
}

/** Posición de scroll que deja un elemento centrado en su contenedor (fila de categorías o barra lateral). */
export function centeredScroll(itemStart: number, itemSize: number, containerSize: number): number {
  return Math.max(0, itemStart - (containerSize - itemSize) / 2)
}
