// Registro de reglas de negocio configurables (docs/REGLAS.md, "Cómo se configuran las reglas").
// Cada regla se declara una vez; de aquí salen el formulario del admin, la validación y la lectura en el Worker.
import type { z } from 'zod'

export type Locale = 'en' | 'es'
export type Localized = Readonly<Record<Locale, string>>

export type RuleGroup =
  | 'payments'
  | 'tax'
  | 'tips'
  | 'deposit'
  | 'time'
  | 'refunds'
  | 'orders'
  | 'promos'
  | 'notifications'
  | 'legal'

/** Cómo se muestra el campo en el admin. */
export type RuleUnit =
  | 'boolean'
  | 'usd'
  | 'percent'
  | 'percent_list'
  | 'hours'
  | 'minutes'
  | 'days'
  | 'months'
  | 'guests'
  | 'count'
  | 'time_of_day'
  | 'localized_text'
  | 'email_list'
  | 'refund_tiers'
  | 'product_types'
  | 'order_status'

export type RuleEditor = 'owner' | 'admin'

/**
 * Prefijos que en la BD solo puede escribir el owner (política rules_write en 0005_v3_rls.sql).
 * defineRule() exige que coincidan, así el código y la RLS no se contradicen.
 */
export const OWNER_ONLY_PREFIXES: ReadonlySet<string> = new Set([
  'payments',
  'tax',
  'refunds',
  'deposit',
  'tips',
  'promos',
])

export interface RuleDefinition<S extends z.ZodType = z.ZodType> {
  readonly key: string
  readonly group: RuleGroup
  readonly label: Localized
  readonly help: Localized
  readonly schema: S
  readonly default: z.output<S>
  readonly unit: RuleUnit
  readonly editableBy: RuleEditor
  /** Puede tener un valor distinto por tienda. */
  readonly storeScoped: boolean
  /** Se envía al navegador (por ejemplo, las propinas sugeridas). Si es false, solo la ve el servidor. */
  readonly public: boolean
}

export class RuleDefinitionError extends Error {
  override readonly name = 'RuleDefinitionError'
}

const KEY_FORMAT = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/ // mismo CHECK que business_rules.key

export function defineRule<S extends z.ZodType>(def: RuleDefinition<S>): RuleDefinition<S> {
  if (!KEY_FORMAT.test(def.key)) {
    throw new RuleDefinitionError(`Clave de regla inválida: ${def.key}`)
  }
  const prefix = def.key.split('.')[0] ?? ''
  if (prefix !== def.group) {
    throw new RuleDefinitionError(`La regla ${def.key} debe estar en el grupo "${prefix}", no "${def.group}"`)
  }
  const ownerOnly = OWNER_ONLY_PREFIXES.has(prefix)
  if (ownerOnly !== (def.editableBy === 'owner')) {
    throw new RuleDefinitionError(
      `La regla ${def.key} debe ser editable por ${ownerOnly ? 'owner' : 'admin'} para coincidir con la RLS`,
    )
  }
  const parsed = def.schema.safeParse(def.default)
  if (!parsed.success) {
    throw new RuleDefinitionError(
      `El valor por defecto de ${def.key} no cumple su schema: ${parsed.error.message}`,
    )
  }
  return def
}
