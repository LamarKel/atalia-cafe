import { describe, expect, it } from 'vitest'
import { pickupIcs } from './ics'

describe('pickupIcs', () => {
  it('crea un evento en UTC con la duración de la franja', () => {
    const ics = pickupIcs({
      code: 'AT-K7Q2MX',
      title: 'Recoger pedido AT-K7Q2MX · Atalia Café',
      startsAt: '2026-10-21T15:00:00Z',
      durationMinutes: 60,
      location: 'Passaic, NJ',
      now: new Date('2026-10-18T12:00:00Z'),
    })
    expect(ics).toContain('DTSTART:20261021T150000Z')
    expect(ics).toContain('DTEND:20261021T160000Z')
    expect(ics).toContain('LOCATION:Passaic\\, NJ')
    expect(ics).toContain('UID:AT-K7Q2MX@atalia.cafe')
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR')
  })
})
