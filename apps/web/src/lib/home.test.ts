import { describe, expect, it } from 'vitest'
import { marqueeItems, openStatus, parseStat, richTitle } from './home'

const hours = [
  { weekday: 1, opens_at: '07:00:00', closes_at: '21:00:00' },
  { weekday: 6, opens_at: '08:00:00', closes_at: '22:00:00' },
]

describe('inicio', () => {
  it('títulos con salto de línea y una palabra en cursiva', () => {
    expect(richTitle('Café, sabor\ny *celebraciones*\nhechas en casa.')).toEqual([
      [{ text: 'Café, sabor', em: false }],
      [
        { text: 'y ', em: false },
        { text: 'celebraciones', em: true },
      ],
      [{ text: 'hechas en casa.', em: false }],
    ])
  })

  it('separa la franja por "·"', () => {
    expect(marqueeItems('Bandejas · Charcutería ·  · Café')).toEqual(['Bandejas', 'Charcutería', 'Café'])
    expect(marqueeItems(undefined)).toEqual([])
  })

  it('"Abierto hoy" según la hora de la tienda (Nueva York), no la del visitante', () => {
    // Lunes 19 oct 2026, 10:00 en Nueva York = 14:00 UTC
    expect(openStatus(hours, new Date('2026-10-19T14:00:00Z'), 'America/New_York')).toEqual({
      kind: 'open',
      from: '7:00 AM',
      to: '9:00 PM',
    })
    // Lunes 6:00 AM en Nueva York: abre más tarde
    expect(openStatus(hours, new Date('2026-10-19T10:00:00Z'), 'America/New_York').kind).toBe('later')
    // Lunes 10:00 PM en Nueva York: ya cerró
    expect(openStatus(hours, new Date('2026-10-20T02:00:00Z'), 'America/New_York').kind).toBe('closed_today')
    // Martes sin horario
    expect(openStatus(hours, new Date('2026-10-20T14:00:00Z'), 'America/New_York').kind).toBe('closed_today')
  })

  it('cifras que cuentan hacia arriba', () => {
    expect(parseStat('120+')).toEqual({ value: 120, decimals: 0, prefix: '', suffix: '+' })
    expect(parseStat('★ 4.9')).toEqual({ value: 4.9, decimals: 1, prefix: '★ ', suffix: '' })
    expect(parseStat('1 h')).toEqual({ value: 1, decimals: 0, prefix: '', suffix: ' h' })
    expect(parseStat('mucho')).toBeNull()
  })
})

describe('imágenes del contenido', () => {
  it('acepta archivos del sitio y https; nada más', async () => {
    const { contentImage } = await import('./home')
    expect(contentImage('/images/home/hero.webp')).toBe('/images/home/hero.webp')
    expect(contentImage('https://x.supabase.co/a.webp')).toBe('https://x.supabase.co/a.webp')
    expect(contentImage('//evil.example/a.png')).toBeNull()
    expect(contentImage('javascript:alert(1)')).toBeNull()
    expect(contentImage(undefined)).toBeNull()
  })
})
