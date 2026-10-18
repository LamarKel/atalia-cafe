import { describe, expect, it } from 'vitest'
import {
  canMarkNoShow,
  groupByColumn,
  matchesDay,
  matchesSearch,
  minutesUntil,
  NEXT,
  PREVIOUS,
} from './orders'

const TZ = 'America/New_York'
const NOW = new Date('2026-10-18T16:00:00Z') // 12:00 en NJ

describe('tablero de pedidos', () => {
  it('sigue el orden de la cocina y permite deshacer un paso', () => {
    expect(NEXT.confirmed).toBe('preparing')
    expect(NEXT.ready).toBe('picked_up')
    expect(NEXT.picked_up).toBeUndefined()
    expect(PREVIOUS.ready).toBe('preparing')
    expect(PREVIOUS.confirmed).toBeUndefined()
    expect(canMarkNoShow('ready')).toBe(true)
    expect(canMarkNoShow('picked_up')).toBe(false)
  })

  it('agrupa por columna y pone primero lo más urgente', () => {
    const g = groupByColumn([
      { id: '1', code: 'A', status: 'preparing', scheduled_for: '2026-10-18T18:00:00Z' },
      { id: '2', code: 'B', status: 'preparing', scheduled_for: '2026-10-18T17:00:00Z' },
      { id: '3', code: 'C', status: 'picked_up', scheduled_for: '2026-10-18T15:00:00Z' },
      { id: '4', code: 'D', status: 'confirmed', scheduled_for: '2026-10-19T15:00:00Z' },
    ])
    expect(g.preparing.map((o) => o.code)).toEqual(['B', 'A'])
    expect(g.confirmed.map((o) => o.code)).toEqual(['D'])
    expect(g.ready).toEqual([])
  })

  it('"hoy" usa el día de la tienda, no el UTC', () => {
    // 23:30 del 18 en NJ = 03:30 UTC del 19
    expect(matchesDay({ scheduled_for: '2026-10-19T03:30:00Z' }, 'today', TZ, NOW)).toBe(true)
    expect(matchesDay({ scheduled_for: '2026-10-19T15:00:00Z' }, 'today', TZ, NOW)).toBe(false)
    expect(matchesDay({ scheduled_for: '2026-10-19T15:00:00Z' }, 'upcoming', TZ, NOW)).toBe(true)
    expect(matchesDay({ scheduled_for: '2026-10-17T15:00:00Z' }, 'all', TZ, NOW)).toBe(true)
  })

  it('minutos que faltan o de atraso', () => {
    expect(minutesUntil('2026-10-18T16:30:00Z', NOW)).toBe(30)
    expect(minutesUntil('2026-10-18T15:45:00Z', NOW)).toBe(-15)
  })

  it('busca por código o nombre sin acentos', () => {
    const o = { code: 'AT-K7Q2MX', customer_name: 'José Peña' }
    expect(matchesSearch(o, 'k7q')).toBe(true)
    expect(matchesSearch(o, 'jose pena')).toBe(true)
    expect(matchesSearch(o, 'maria')).toBe(false)
    expect(matchesSearch(o, '')).toBe(true)
  })
})
