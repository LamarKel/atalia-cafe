// Datos del negocio para el panel (fase 4): horario, días cerrados, cupos, tienda, puntos de recogida,
// datos de contacto, textos del sitio y reglas. La RLS decide quién escribe qué (las reglas de dinero, solo la dueña).
import {
  getRule,
  isRuleKey,
  RULES,
  validateRuleValue,
  type RuleKey,
  type StoredRule,
} from '@atalia/shared/rules'
import { supabase } from './supabase'

class BusinessError extends Error {
  override readonly name = 'BusinessError'
}
const check = (context: string, error: { message: string } | null) => {
  if (error) throw new BusinessError(`${context}: ${error.message}`)
}

export interface Store {
  id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  zipCode: string | null
  phone: string | null
  lat: number | null
  lng: number | null
  timezone: string
}

export async function getStore(): Promise<Store> {
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .order('sort_order')
    .limit(1)
    .single<Record<string, unknown>>()
  check('store', error)
  const s = data as Record<string, unknown>
  return {
    id: s.id as string,
    name: s.name as string,
    address: s.address as string | null,
    city: s.city as string | null,
    state: s.state as string | null,
    zipCode: s.zip_code as string | null,
    phone: s.phone as string | null,
    lat: s.lat as number | null,
    lng: s.lng as number | null,
    timezone: s.timezone as string,
  }
}

export async function saveStore(s: Store): Promise<void> {
  const { error } = await supabase
    .from('stores')
    .update({
      name: s.name,
      address: s.address,
      city: s.city,
      state: s.state,
      zip_code: s.zipCode,
      phone: s.phone,
      lat: s.lat,
      lng: s.lng,
      timezone: s.timezone,
    })
    .eq('id', s.id)
  check('save_store', error)
}

// ── Horario ──────────────────────────────────────────────────────────────

export interface DayHours {
  weekday: number
  open: boolean
  opensAt: string
  closesAt: string
}

export async function getHours(storeId: string): Promise<DayHours[]> {
  const { data, error } = await supabase
    .from('business_hours')
    .select('weekday, opens_at, closes_at')
    .eq('store_id', storeId)
  check('hours', error)
  const rows = (data ?? []) as Array<{ weekday: number; opens_at: string; closes_at: string }>
  return Array.from({ length: 7 }, (_, weekday) => {
    const r = rows.find((x) => x.weekday === weekday)
    return {
      weekday,
      open: r !== undefined,
      opensAt: r?.opens_at.slice(0, 5) ?? '08:00',
      closesAt: r?.closes_at.slice(0, 5) ?? '18:00',
    }
  })
}

/** Guarda la semana: los días abiertos se escriben; los cerrados se quitan (sin fila = cerrado). */
export async function saveHours(storeId: string, days: DayHours[]): Promise<void> {
  const open = days.filter((d) => d.open)
  const closed = days.filter((d) => !d.open).map((d) => d.weekday)
  if (open.length > 0) {
    const { error } = await supabase.from('business_hours').upsert(
      open.map((d) => ({
        store_id: storeId,
        weekday: d.weekday,
        opens_at: d.opensAt,
        closes_at: d.closesAt,
      })),
      { onConflict: 'store_id,weekday' },
    )
    check('save_hours', error)
  }
  if (closed.length > 0) {
    const { error } = await supabase
      .from('business_hours')
      .delete()
      .eq('store_id', storeId)
      .in('weekday', closed)
    check('close_days', error)
  }
}

// ── Días cerrados ────────────────────────────────────────────────────────

export interface ClosedDay {
  date: string
  reasonEn: string | null
  reasonEs: string | null
}

export async function getClosedDays(storeId: string): Promise<ClosedDay[]> {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('closed_days')
    .select('date, reason_en, reason_es')
    .eq('store_id', storeId)
    .gte('date', today)
    .order('date')
  check('closed_days', error)
  return ((data ?? []) as Array<{ date: string; reason_en: string | null; reason_es: string | null }>).map(
    (d) => ({ date: d.date, reasonEn: d.reason_en, reasonEs: d.reason_es }),
  )
}

export async function addClosedDay(storeId: string, d: ClosedDay): Promise<void> {
  const { error } = await supabase
    .from('closed_days')
    .upsert(
      { store_id: storeId, date: d.date, reason_en: d.reasonEn, reason_es: d.reasonEs },
      { onConflict: 'store_id,date' },
    )
  check('add_closed_day', error)
}

export async function removeClosedDay(storeId: string, date: string): Promise<void> {
  const { error } = await supabase.from('closed_days').delete().eq('store_id', storeId).eq('date', date)
  check('remove_closed_day', error)
}

// ── Cupos por día de la semana ───────────────────────────────────────────

export const CAPACITY_CATEGORIES = ['menu', 'tray', 'table', 'picadera_pack'] as const
export type CapacityCategory = (typeof CAPACITY_CATEGORIES)[number]

export interface CapacityRule {
  weekday: number
  category: CapacityCategory
  perSlot: number | null
  perDay: number | null
}

export async function getCapacity(storeId: string): Promise<CapacityRule[]> {
  const { data, error } = await supabase
    .from('capacity_rules')
    .select('weekday, category, max_units_per_slot, max_units_per_day')
    .eq('store_id', storeId)
  check('capacity', error)
  return (
    (data ?? []) as Array<{
      weekday: number
      category: CapacityCategory
      max_units_per_slot: number | null
      max_units_per_day: number | null
    }>
  ).map((r) => ({
    weekday: r.weekday,
    category: r.category,
    perSlot: r.max_units_per_slot,
    perDay: r.max_units_per_day,
  }))
}

/** Un cupo vacío (sin límite por hora ni por día) se borra; el resto se escribe. */
export async function saveCapacity(storeId: string, rules: CapacityRule[]): Promise<void> {
  const set = rules.filter((r) => r.perSlot !== null || r.perDay !== null)
  const empty = rules.filter((r) => r.perSlot === null && r.perDay === null)
  if (set.length > 0) {
    const { error } = await supabase.from('capacity_rules').upsert(
      set.map((r) => ({
        store_id: storeId,
        weekday: r.weekday,
        category: r.category,
        max_units_per_slot: r.perSlot,
        max_units_per_day: r.perDay,
      })),
      { onConflict: 'store_id,weekday,category' },
    )
    check('save_capacity', error)
  }
  // Solo se borran los cupos que existían (no las 28 combinaciones vacías una por una)
  const { data, error: readError } = await supabase
    .from('capacity_rules')
    .select('id, weekday, category')
    .eq('store_id', storeId)
  check('capacity', readError)
  const toDelete = ((data ?? []) as Array<{ id: string; weekday: number; category: string }>)
    .filter((row) => empty.some((r) => r.weekday === row.weekday && r.category === row.category))
    .map((row) => row.id)
  if (toDelete.length > 0) {
    const { error } = await supabase.from('capacity_rules').delete().in('id', toDelete)
    check('clear_capacity', error)
  }
}

// ── Puntos de recogida ───────────────────────────────────────────────────

export interface PickupPoint {
  id: string
  nameEn: string
  nameEs: string | null
  descriptionEn: string | null
  descriptionEs: string | null
  icon: string
  sortOrder: number
  active: boolean
}

export async function getPickups(storeId: string): Promise<PickupPoint[]> {
  const { data, error } = await supabase
    .from('pickup_locations')
    .select('*')
    .eq('store_id', storeId)
    .order('sort_order')
  check('pickups', error)
  return ((data ?? []) as Array<Record<string, unknown>>).map((p) => ({
    id: p.id as string,
    nameEn: p.name_en as string,
    nameEs: p.name_es as string | null,
    descriptionEn: p.description_en as string | null,
    descriptionEs: p.description_es as string | null,
    icon: p.icon as string,
    sortOrder: p.sort_order as number,
    active: p.active as boolean,
  }))
}

export async function savePickup(storeId: string, p: PickupPoint): Promise<void> {
  const row = {
    store_id: storeId,
    name_en: p.nameEn,
    name_es: p.nameEs,
    description_en: p.descriptionEn,
    description_es: p.descriptionEs,
    icon: p.icon,
    sort_order: p.sortOrder,
    active: p.active,
  }
  const { error } =
    p.id === ''
      ? await supabase.from('pickup_locations').insert(row)
      : await supabase.from('pickup_locations').update(row).eq('id', p.id)
  check('save_pickup', error)
}

// ── Datos del negocio ────────────────────────────────────────────────────

export interface Settings {
  businessName: string
  email: string | null
  phone: string | null
  whatsapp: string | null
  instagram: string | null
  facebook: string | null
  tiktok: string | null
}

export async function getSettings(): Promise<Settings> {
  const { data, error } = await supabase
    .from('business_settings')
    .select('*')
    .maybeSingle<Record<string, unknown>>()
  check('settings', error)
  const s = data ?? {}
  return {
    businessName: (s.business_name as string | undefined) ?? 'Atalia Café',
    email: (s.email as string | null | undefined) ?? null,
    phone: (s.phone as string | null | undefined) ?? null,
    whatsapp: (s.whatsapp_number as string | null | undefined) ?? null,
    instagram: (s.instagram_url as string | null | undefined) ?? null,
    facebook: (s.facebook_url as string | null | undefined) ?? null,
    tiktok: (s.tiktok_url as string | null | undefined) ?? null,
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  const { error } = await supabase.from('business_settings').upsert({
    id: true,
    business_name: s.businessName,
    email: s.email,
    phone: s.phone,
    // Solo números, como lo exige la BD (formato internacional sin "+", ej. 19735550100)
    whatsapp_number: s.whatsapp === null ? null : s.whatsapp.replace(/\D/g, '') || null,
    instagram_url: s.instagram,
    facebook_url: s.facebook,
    tiktok_url: s.tiktok,
  })
  check('save_settings', error)
}

// ── Textos del sitio ─────────────────────────────────────────────────────

export interface SiteText {
  key: string
  en: string
  es: string
}

export async function getSiteTexts(): Promise<SiteText[]> {
  const { data, error } = await supabase.from('site_content').select('key, locale, value').order('key')
  check('site_content', error)
  const map = new Map<string, SiteText>()
  for (const r of (data ?? []) as Array<{ key: string; locale: 'en' | 'es'; value: string }>) {
    const row = map.get(r.key) ?? { key: r.key, en: '', es: '' }
    row[r.locale] = r.value
    map.set(r.key, row)
  }
  return [...map.values()]
}

export async function saveSiteText(t: SiteText): Promise<void> {
  const { error } = await supabase.from('site_content').upsert(
    [
      { key: t.key, locale: 'en', value: t.en },
      { key: t.key, locale: 'es', value: t.es },
    ],
    { onConflict: 'key,locale' },
  )
  check('save_text', error)
}

// ── Reglas de negocio ────────────────────────────────────────────────────

export async function getRuleRows(): Promise<StoredRule[]> {
  const { data, error } = await supabase.from('business_rules').select('key, store_id, value, effective_from')
  check('rules', error)
  return (data ?? []) as StoredRule[]
}

export function currentValue(key: RuleKey, rows: readonly StoredRule[], storeId: string): unknown {
  return getRule(key, rows, { storeId })
}

/**
 * Guarda un valor nuevo como una fila nueva con vigencia desde ahora (queda el historial; los pedidos ya
 * hechos conservan sus reglas en rules_snapshot). Las reglas por tienda se guardan para la tienda.
 */
export async function saveRule(key: string, value: unknown, storeId: string): Promise<void> {
  if (!isRuleKey(key)) throw new BusinessError(`regla desconocida: ${key}`)
  const valid = validateRuleValue(key, value)
  if (!valid.ok) throw new BusinessError(valid.error)
  const { error } = await supabase.from('business_rules').insert({
    key,
    store_id: RULES[key].storeScoped ? storeId : null,
    value: valid.value,
    effective_from: new Date().toISOString(),
  })
  check('save_rule', error)
}
