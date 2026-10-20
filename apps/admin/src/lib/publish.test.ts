import { describe, expect, it } from 'vitest'
import { publishState } from './publish'

const NOW = Date.parse('2026-10-20T12:00:00Z')
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString()

describe('estado de publicación', () => {
  it('cambios después del último build = pendiente', () => {
    expect(publishState({ dirty_at: ago(1), requested_at: ago(10), last_status: 'ok' }, NOW)).toBe('pending')
    expect(publishState({ dirty_at: ago(1), requested_at: null, last_status: null }, NOW)).toBe('pending')
  })
  it('build pedido hace menos de 3 min = publicando; después, al día', () => {
    expect(publishState({ dirty_at: ago(5), requested_at: ago(1), last_status: 'ok' }, NOW)).toBe(
      'publishing',
    )
    expect(publishState({ dirty_at: ago(10), requested_at: ago(5), last_status: 'ok' }, NOW)).toBe(
      'up_to_date',
    )
    expect(publishState({ dirty_at: null, requested_at: null, last_status: null }, NOW)).toBe('up_to_date')
  })
  it('si el último intento falló y no hay otro en curso = error', () => {
    expect(publishState({ dirty_at: ago(5), requested_at: null, last_status: 'error' }, NOW)).toBe('error')
  })
})
