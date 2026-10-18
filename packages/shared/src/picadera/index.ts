// Reglas del armador de picaderas (RF05–RF07). Las usan el navegador (botón activo, "Combínalas por mí")
// y el Worker (validación antes de crear el pedido). La BD vuelve a validar la suma (check_picadera_item).
import { z } from 'zod'

export const picaderaComponentSchema = z.object({
  optionId: z.uuid(),
  qty: z.number().int().min(1).max(100),
})

export type PicaderaComponent = z.infer<typeof picaderaComponentSchema>

export const picaderaSelectionSchema = z
  .object({
    units: z.number().int().min(1).max(200),
    components: z.array(picaderaComponentSchema).min(1),
  })
  .superRefine((value, ctx) => {
    const ids = value.components.map((c) => c.optionId)
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', message: 'duplicate_option', path: ['components'] })
    }
    const total = value.components.reduce((sum, c) => sum + c.qty, 0)
    if (total !== value.units) {
      ctx.addIssue({ code: 'custom', message: 'count_mismatch', path: ['components'] })
    }
  })

export type PicaderaSelection = z.infer<typeof picaderaSelectionSchema>

export function totalPieces(counts: Readonly<Record<string, number>>): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0)
}

/** El paquete está completo solo con la cuenta exacta (RF06). */
export function isComplete(units: number, counts: Readonly<Record<string, number>>): boolean {
  return totalPieces(counts) === units
}

/**
 * "Combínalas por mí" (RF07): reparte las piezas lo más parejo posible entre las opciones disponibles,
 * en el orden del menú. Con 10 piezas y 4 opciones → 3, 3, 2, 2.
 */
export function autoDistribute(units: number, optionIds: readonly string[]): Record<string, number> {
  if (optionIds.length === 0 || units <= 0) return {}
  const base = Math.floor(units / optionIds.length)
  let extra = units % optionIds.length
  const out: Record<string, number> = {}
  for (const id of optionIds) {
    const n = base + (extra > 0 ? 1 : 0)
    if (extra > 0) extra--
    if (n > 0) out[id] = n
  }
  return out
}

/**
 * Ajusta las piezas al cambiar el tamaño del paquete: si ya hay más que el nuevo tamaño,
 * quita de las últimas opciones elegidas hasta que quepan.
 */
export function fitToUnits(units: number, counts: Readonly<Record<string, number>>): Record<string, number> {
  const out = { ...counts }
  let over = totalPieces(out) - units
  for (const id of Object.keys(out).reverse()) {
    if (over <= 0) break
    const current = out[id] ?? 0
    const remove = Math.min(current, over)
    const next = current - remove
    over -= remove
    out[id] = next
  }
  return Object.fromEntries(Object.entries(out).filter(([, n]) => n > 0))
}

/** Pasa el estado del armador al formato que se envía al servidor. */
export function toComponents(counts: Readonly<Record<string, number>>): PicaderaComponent[] {
  return Object.entries(counts)
    .filter(([, qty]) => qty > 0)
    .map(([optionId, qty]) => ({ optionId, qty }))
}
