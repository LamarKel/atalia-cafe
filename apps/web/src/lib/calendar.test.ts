import type { AvailabilitySlot } from '@atalia/shared/checkout'
import { describe, expect, it } from 'vitest'
import { addMonths, dayStates, firstAvailableDay, monthGrid, monthRange, visibleTimes } from './calendar'

const slot = (
  date: string,
  time: string,
  available: boolean,
  reason: AvailabilitySlot['reason'] = null,
): AvailabilitySlot => ({ date, time, startsAt: `${date}T${time}:00Z`, available, reason })

describe('calendario', () => {
  it('octubre de 2026 empieza en jueves, como en el diseño', () => {
    const grid = monthGrid({ year: 2026, month: 10 })
    expect(grid[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03'])
    expect(grid.at(-1)?.filter(Boolean).at(-1)).toBe('2026-10-31')
    expect(grid.every((w) => w.length === 7)).toBe(true)
  })

  it('cambia de mes y de año', () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
    expect(monthRange({ year: 2028, month: 2 })).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })

  it('marca días libres, agotados y no disponibles', () => {
    const slots = [
      slot('2026-10-20', '09:00', false, 'lead_time'),
      slot('2026-10-21', '09:00', false, 'full'),
      slot('2026-10-21', '10:00', true),
      slot('2026-10-24', '09:00', false, 'full'),
      slot('2026-10-24', '10:00', false, 'full'),
      slot('2026-10-25', '09:00', false, 'closed'),
    ]
    const states = dayStates(slots)
    expect(states.get('2026-10-20')).toBe('unavailable')
    expect(states.get('2026-10-21')).toBe('available')
    expect(states.get('2026-10-24')).toBe('full')
    expect(states.get('2026-10-25')).toBe('unavailable')
    expect(firstAvailableDay(slots)).toBe('2026-10-21')
    expect(visibleTimes(slots, '2026-10-21').map((s) => s.time)).toEqual(['09:00', '10:00'])
    expect(visibleTimes(slots, '2026-10-20')).toEqual([])
  })
})
