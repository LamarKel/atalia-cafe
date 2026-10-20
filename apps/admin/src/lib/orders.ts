// Reglas del tablero de pedidos, sin React. Las transiciones son las mismas que permite orders_guard en la BD
// (el equipo solo mueve el estado operativo; cobrar, cancelar y reembolsar va por el Worker).

export type OrderStatus =
  'pending_payment' | 'confirmed' | 'preparing' | 'ready' | 'picked_up' | 'cancelled' | 'refunded' | 'no_show'

export const BOARD_COLUMNS = ['confirmed', 'preparing', 'ready'] as const
export type BoardColumn = (typeof BOARD_COLUMNS)[number]

export const DONE_STATUSES: readonly OrderStatus[] = ['picked_up', 'cancelled', 'refunded', 'no_show']

/** El siguiente paso de la cocina: Confirmado → Preparando → Listo → Recogido. */
export const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  confirmed: 'preparing',
  preparing: 'ready',
  ready: 'picked_up',
}

/** Deshacer un paso (por si se tocó sin querer). */
export const PREVIOUS: Partial<Record<OrderStatus, OrderStatus>> = {
  preparing: 'confirmed',
  ready: 'preparing',
}

export function canMarkNoShow(status: OrderStatus): boolean {
  return status === 'confirmed' || status === 'preparing' || status === 'ready'
}

export interface BoardOrder {
  id: string
  code: string
  status: OrderStatus
  scheduled_for: string
}

/** "2026-10-18" de una fecha ISO en la zona horaria de la tienda. */
export function localDay(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(iso))
}

export type DayFilter = 'today' | 'upcoming' | 'all'

export function matchesDay(
  order: Pick<BoardOrder, 'scheduled_for'>,
  filter: DayFilter,
  timezone: string,
  now = new Date(),
): boolean {
  if (filter === 'all') return true
  const day = localDay(order.scheduled_for, timezone)
  const today = localDay(now.toISOString(), timezone)
  return filter === 'today' ? day === today : day > today
}

/** Agrupa por columna y ordena por hora de recogida (lo más urgente arriba). */
export function groupByColumn<T extends BoardOrder>(orders: readonly T[]): Record<BoardColumn, T[]> {
  const out: Record<BoardColumn, T[]> = { confirmed: [], preparing: [], ready: [] }
  for (const o of orders) {
    if ((BOARD_COLUMNS as readonly string[]).includes(o.status)) out[o.status as BoardColumn].push(o)
  }
  for (const col of BOARD_COLUMNS) out[col].sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))
  return out
}

/** Minutos que faltan para la recogida (negativo = atrasado). */
export function minutesUntil(iso: string, now = new Date()): number {
  return Math.round((Date.parse(iso) - now.getTime()) / 60_000)
}

/** Búsqueda por código o nombre del cliente, sin acentos. */
export function matchesSearch(order: { code: string; customer_name: string }, query: string): boolean {
  const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = n(query.trim())
  return q === '' || n(order.code).includes(q) || n(order.customer_name).includes(q)
}
