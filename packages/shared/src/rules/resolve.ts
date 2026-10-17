// Lectura de reglas: mismo criterio que public.get_rule() en la BD.
// La regla de la tienda gana a la global; dentro de cada una, la vigencia más reciente que ya empezó.
// Sin fila (o con un valor que ya no cumple el schema) → valor por defecto del registro.
import { RULES, type RuleKey, type RuleValue } from './definitions'

/** Una fila de public.business_rules. */
export interface StoredRule {
  key: string
  store_id: string | null
  value: unknown
  effective_from: string
}

export interface ResolveOptions {
  storeId?: string | null
  at?: Date
  /** Se llama cuando una fila guardada no cumple el schema (se usa el valor por defecto). */
  onInvalid?: (key: string, value: unknown) => void
}

function pickRow(
  rows: readonly StoredRule[],
  key: string,
  storeId: string | null,
  at: Date,
): StoredRule | undefined {
  const atMs = at.getTime()
  return rows
    .filter((r) => r.key === key && (r.store_id === null || r.store_id === storeId))
    .filter((r) => Date.parse(r.effective_from) <= atMs)
    .sort((a, b) => {
      const scope = Number(b.store_id !== null) - Number(a.store_id !== null)
      return scope !== 0 ? scope : Date.parse(b.effective_from) - Date.parse(a.effective_from)
    })[0]
}

export function getRule<K extends RuleKey>(
  key: K,
  rows: readonly StoredRule[],
  options: ResolveOptions = {},
): RuleValue<K> {
  const def = RULES[key]
  const row = pickRow(rows, key, options.storeId ?? null, options.at ?? new Date())
  if (row === undefined) {
    return def.default as RuleValue<K>
  }
  const parsed = def.schema.safeParse(row.value)
  if (!parsed.success) {
    options.onInvalid?.(key, row.value)
    return def.default as RuleValue<K>
  }
  return parsed.data as RuleValue<K>
}

export type RulesSnapshot = { [K in RuleKey]: RuleValue<K> }

/** Todas las reglas vigentes, para guardar en orders.rules_snapshot al crear el pedido. */
export function snapshotRules(rows: readonly StoredRule[], options: ResolveOptions = {}): RulesSnapshot {
  const entries = (Object.keys(RULES) as RuleKey[]).map((key) => [key, getRule(key, rows, options)] as const)
  return Object.fromEntries(entries) as RulesSnapshot
}

/** Solo las reglas marcadas como públicas, para enviar al navegador. */
export function publicRules(
  rows: readonly StoredRule[],
  options: ResolveOptions = {},
): Partial<RulesSnapshot> {
  const all = snapshotRules(rows, options)
  return Object.fromEntries(
    (Object.keys(RULES) as RuleKey[]).filter((k) => RULES[k].public).map((k) => [k, all[k]]),
  ) as Partial<RulesSnapshot>
}

/** Valida un valor antes de guardarlo desde el admin. */
export function validateRuleValue<K extends RuleKey>(
  key: K,
  value: unknown,
): { ok: true; value: RuleValue<K> } | { ok: false; error: string } {
  const parsed = RULES[key].schema.safeParse(value)
  return parsed.success
    ? { ok: true, value: parsed.data as RuleValue<K> }
    : { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') }
}

export function isRuleKey(key: string): key is RuleKey {
  return Object.hasOwn(RULES, key)
}
