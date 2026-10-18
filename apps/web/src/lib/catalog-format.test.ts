import { describe, expect, it } from 'vitest'
import {
  directionsUrl,
  formatTime,
  fromPrice,
  groupHours,
  matchesGuests,
  sizeAmounts,
  sizePrice,
  type SizeRow,
} from './catalog-format'

const size = (over: Partial<SizeRow>): SizeRow => ({
  serves: null,
  units: null,
  price_cents: null,
  price_modifier_cents: 0,
  active: true,
  ...over,
})

describe('precios', () => {
  it('el precio absoluto de la opción gana; si no, base + modificador', () => {
    expect(sizePrice(500, size({ price_cents: 8500 }))).toBe(8500)
    expect(sizePrice(500, size({ price_modifier_cents: 75 }))).toBe(575)
    expect(sizePrice(null, size({}))).toBeNull()
  })

  it('"Desde": la opción activa más barata', () => {
    const sizes = [
      size({ price_cents: 9000 }),
      size({ price_cents: 6500 }),
      size({ price_cents: 100, active: false }),
    ]
    expect(fromPrice(null, sizes)).toBe(6500)
  })

  it('sin precios cargados → null ("Precio por confirmar")', () => {
    expect(fromPrice(null, [size({ serves: 10 })])).toBeNull()
    expect(fromPrice(450, [])).toBe(450)
  })
})

describe('personas y piezas', () => {
  it('lista las personas ordenadas y sin repetir', () => {
    expect(
      sizeAmounts([size({ serves: 15 }), size({ serves: 5 }), size({ serves: 10 }), size({ serves: 5 })]),
    ).toEqual({
      kind: 'serves',
      values: [5, 10, 15],
    })
  })

  it('para picaderas usa las piezas', () => {
    expect(sizeAmounts([size({ units: 10 }), size({ units: 5 })])).toEqual({ kind: 'units', values: [5, 10] })
  })

  it('filtro de invitados: exactos y 20+', () => {
    const tray = [size({ serves: 5 }), size({ serves: 10 })]
    const table = [size({ serves: 30 })]
    const picadera = [size({ units: 10 })]
    expect(matchesGuests(tray, '10')).toBe(true)
    expect(matchesGuests(tray, '15')).toBe(false)
    expect(matchesGuests(table, '20+')).toBe(true)
    expect(matchesGuests(picadera, '10')).toBe(false)
    expect(matchesGuests(picadera, null)).toBe(true)
  })
})

describe('horario', () => {
  it('formato de 12 horas', () => {
    expect(formatTime('07:00:00')).toBe('7:00 AM')
    expect(formatTime('21:30:00')).toBe('9:30 PM')
    expect(formatTime('12:00:00')).toBe('12:00 PM')
    expect(formatTime('00:15:00')).toBe('12:15 AM')
  })

  it('agrupa días seguidos con el mismo horario, empezando el lunes', () => {
    const rows = [
      { weekday: 0, opens_at: '08:00:00', closes_at: '20:00:00' },
      { weekday: 1, opens_at: '07:00:00', closes_at: '21:00:00' },
      { weekday: 2, opens_at: '07:00:00', closes_at: '21:00:00' },
      { weekday: 3, opens_at: '07:00:00', closes_at: '21:00:00' },
      { weekday: 4, opens_at: '07:00:00', closes_at: '21:00:00' },
      { weekday: 5, opens_at: '07:00:00', closes_at: '22:00:00' },
      { weekday: 6, opens_at: '08:00:00', closes_at: '22:00:00' },
    ]
    expect(groupHours(rows)).toEqual([
      { days: [1, 2, 3, 4], text: '7:00 AM – 9:00 PM' },
      { days: [5], text: '7:00 AM – 10:00 PM' },
      { days: [6], text: '8:00 AM – 10:00 PM' },
      { days: [0], text: '8:00 AM – 8:00 PM' },
    ])
  })

  it('un día sin horario queda como cerrado', () => {
    const groups = groupHours([{ weekday: 1, opens_at: '07:00:00', closes_at: '21:00:00' }])
    expect(groups[0]).toEqual({ days: [1], text: '7:00 AM – 9:00 PM' })
    expect(groups[1]).toEqual({ days: [2, 3, 4, 5, 6, 0], text: null })
  })
})

describe('cómo llegar', () => {
  it('arma el enlace de Google Maps', () => {
    expect(directionsUrl(40.8635565, -74.1185816)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=40.8635565,-74.1185816',
    )
    expect(directionsUrl(null, 1)).toBeNull()
  })
})
