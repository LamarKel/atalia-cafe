import { describe, expect, it } from 'vitest'
import {
  autoDistribute,
  fitToUnits,
  isComplete,
  picaderaSelectionSchema,
  toComponents,
  totalPieces,
} from './index'

const A = '91c4de00-0000-4000-8000-000000000001'
const B = '91c4de00-0000-4000-8000-000000000002'
const C = '91c4de00-0000-4000-8000-000000000003'
const D = '91c4de00-0000-4000-8000-000000000004'

describe('picadera (RF05–RF07)', () => {
  it('solo está completa con la cuenta exacta', () => {
    expect(isComplete(10, { [A]: 4, [B]: 3 })).toBe(false)
    expect(isComplete(10, { [A]: 4, [B]: 3, [C]: 3 })).toBe(true)
    expect(isComplete(10, { [A]: 11 })).toBe(false)
    expect(totalPieces({})).toBe(0)
  })

  it('"Combínalas por mí" reparte parejo y suma exacto', () => {
    expect(autoDistribute(10, [A, B, C, D])).toEqual({ [A]: 3, [B]: 3, [C]: 2, [D]: 2 })
    expect(autoDistribute(5, [A, B, C, D, A.replace('1', '9'), B.replace('2', '8')])).toEqual({
      [A]: 1,
      [B]: 1,
      [C]: 1,
      [D]: 1,
      [A.replace('1', '9')]: 1,
    })
    for (const units of [5, 10, 15, 20]) {
      expect(totalPieces(autoDistribute(units, [A, B, C]))).toBe(units)
    }
    expect(autoDistribute(10, [])).toEqual({})
  })

  it('al bajar el tamaño, quita de las últimas elegidas', () => {
    expect(fitToUnits(5, { [A]: 4, [B]: 3, [C]: 3 })).toEqual({ [A]: 4, [B]: 1 })
    expect(fitToUnits(20, { [A]: 4 })).toEqual({ [A]: 4 })
  })

  it('el servidor valida con el mismo schema', () => {
    const ok = picaderaSelectionSchema.safeParse({ units: 10, components: toComponents({ [A]: 6, [B]: 4 }) })
    expect(ok.success).toBe(true)

    const short = picaderaSelectionSchema.safeParse({ units: 10, components: [{ optionId: A, qty: 8 }] })
    expect(short.success).toBe(false)
    expect(short.error?.issues[0]?.message).toBe('count_mismatch')

    const dup = picaderaSelectionSchema.safeParse({
      units: 10,
      components: [
        { optionId: A, qty: 5 },
        { optionId: A, qty: 5 },
      ],
    })
    expect(dup.error?.issues.map((i) => i.message)).toContain('duplicate_option')

    expect(
      picaderaSelectionSchema.safeParse({ units: 10, components: [{ optionId: 'x', qty: 10 }] }).success,
    ).toBe(false)
  })

  it('toComponents descarta las piezas en cero', () => {
    expect(toComponents({ [A]: 2, [B]: 0 })).toEqual([{ optionId: A, qty: 2 }])
  })
})
