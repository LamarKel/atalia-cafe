// Lógica del calendario de recogida (pantalla 05), sin React: cuadrícula del mes y estado de cada día.
import type { AvailabilitySlot } from '@atalia/shared/checkout'

export type DayState = 'available' | 'full' | 'unavailable'

export interface YearMonth {
  year: number
  month: number
}

const pad = (n: number) => String(n).padStart(2, '0')
export const isoDay = (y: number, m: number, d: number) => `${String(y)}-${pad(m)}-${pad(d)}`

export function daysInMonth({ year, month }: YearMonth): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Semanas del mes empezando en domingo; null = celda vacía antes del día 1 o después del último. */
export function monthGrid(ym: YearMonth): Array<Array<string | null>> {
  const first = new Date(Date.UTC(ym.year, ym.month - 1, 1)).getUTCDay()
  const total = daysInMonth(ym)
  const cells: Array<string | null> = [
    ...Array<null>(first).fill(null),
    ...Array.from({ length: total }, (_, i) => isoDay(ym.year, ym.month, i + 1)),
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7))
}

export function addMonths(ym: YearMonth, delta: number): YearMonth {
  const index = ym.year * 12 + (ym.month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

export function monthRange(ym: YearMonth): { from: string; to: string } {
  return { from: isoDay(ym.year, ym.month, 1), to: isoDay(ym.year, ym.month, daysInMonth(ym)) }
}

export function compareMonths(a: YearMonth, b: YearMonth): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month)
}

/** "2026-10-21" → { year: 2026, month: 10 } */
export function monthOf(iso: string): YearMonth {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) }
}

/**
 * Un día está disponible si le queda al menos una hora libre; "agotado" si estaba abierto y a tiempo
 * pero todas sus horas se llenaron (el diseño lo marca tachado); si no, no se puede elegir.
 */
export function dayStates(slots: readonly AvailabilitySlot[]): Map<string, DayState> {
  const out = new Map<string, DayState>()
  for (const s of slots) {
    const prev = out.get(s.date)
    if (s.available) out.set(s.date, 'available')
    else if (s.reason === 'full' && prev !== 'available') out.set(s.date, 'full')
    else if (prev === undefined) out.set(s.date, 'unavailable')
  }
  return out
}

/** Horas que se muestran para un día: las libres y las agotadas (tachadas); las pasadas o cerradas no. */
export function visibleTimes(slots: readonly AvailabilitySlot[], date: string): AvailabilitySlot[] {
  return slots.filter((s) => s.date === date && (s.available || s.reason === 'full'))
}

/** Primer día con horas libres, para abrir el calendario ya en una fecha útil. */
export function firstAvailableDay(slots: readonly AvailabilitySlot[]): string | null {
  return slots.find((s) => s.available)?.date ?? null
}
