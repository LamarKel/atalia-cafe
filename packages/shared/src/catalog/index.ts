// Contrato del editor de productos del panel (fase 3). Valida lo que escribe el equipo antes de guardarlo;
// los CHECKs de la BD son la última barrera. Los montos llegan ya en centavos (el formulario usa parseUSD).
import { z } from 'zod'

export const PRODUCT_TYPES = ['menu', 'tray', 'table', 'picadera_pack'] as const
export type ProductTypeName = (typeof PRODUCT_TYPES)[number]

const name = z.string().trim().min(2, 'name_required').max(200)
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
const centsField = z.number().int().min(0).max(100_000_000)

export const sizeDraftSchema = z
  .object({
    id: z.uuid().nullable(),
    nameEn: z.string().trim().min(1, 'name_required').max(50),
    nameEs: optionalText(50),
    serves: z.number().int().min(1).max(5000).nullable(),
    units: z.number().int().min(1).max(500).nullable(),
    /** Precio de esta opción. null = precio base del producto + modificador. */
    priceCents: centsField.nullable(),
    priceModifierCents: centsField,
    active: z.boolean(),
  })
  .refine((s) => s.serves === null || s.units === null, { message: 'serves_or_units', path: ['units'] })

export const extraDraftSchema = z.object({
  id: z.uuid().nullable(),
  nameEn: z.string().trim().min(1, 'name_required').max(100),
  nameEs: optionalText(100),
  priceCents: centsField,
  active: z.boolean(),
})

export const nutritionDraftSchema = z.object({
  id: z.uuid().nullable(),
  labelEn: z.string().trim().min(1, 'name_required').max(100),
  labelEs: optionalText(100),
  value: z.string().trim().min(1, 'value_required').max(200),
})

export const inclusionDraftSchema = z.object({
  id: z.uuid().nullable(),
  labelEn: z.string().trim().min(1, 'name_required').max(200),
  labelEs: optionalText(200),
})

export const productDraftSchema = z
  .object({
    id: z.uuid().nullable(),
    type: z.enum(PRODUCT_TYPES),
    categoryId: z.uuid('category_required'),
    slug: z
      .string()
      .trim()
      .max(80)
      .regex(/^[a-z0-9-]*$/, 'invalid_slug')
      .transform((v) => (v === '' ? null : v))
      .nullable(),
    nameEn: name,
    nameEs: optionalText(200),
    shortDescriptionEn: optionalText(300),
    shortDescriptionEs: optionalText(300),
    descriptionEn: optionalText(2000),
    descriptionEs: optionalText(2000),
    priceCents: centsField.nullable(),
    minLeadHours: z.number().int().min(0).max(720),
    featured: z.boolean(),
    vegetarian: z.boolean(),
    stockEnabled: z.boolean(),
    inStock: z.boolean(),
    active: z.boolean(),
    sizes: z.array(sizeDraftSchema).max(20),
    extras: z.array(extraDraftSchema).max(30),
    nutrition: z.array(nutritionDraftSchema).max(20),
    inclusions: z.array(inclusionDraftSchema).max(30),
  })
  // Mismas reglas que los CHECKs de products: el menú necesita precio; el catering, slug (página propia).
  .refine((p) => p.type !== 'menu' || p.priceCents !== null, {
    message: 'price_required',
    path: ['priceCents'],
  })
  .refine((p) => p.type === 'menu' || p.slug !== null, { message: 'slug_required', path: ['slug'] })
  .refine((p) => p.type !== 'picadera_pack' || p.sizes.every((s) => s.units !== null), {
    message: 'units_required',
    path: ['sizes'],
  })

export type ProductDraftInput = z.input<typeof productDraftSchema>
export type ProductDraft = z.output<typeof productDraftSchema>

/** "Tabla de charcutería" → "tabla-de-charcuteria" (para la URL del catering). */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/**
 * Qué filas hijas (tamaños, extras…) crear, actualizar o borrar al guardar: las que ya no están en el
 * borrador se borran; las demás se guardan con su orden nuevo.
 */
export function childChanges<T extends { id: string | null }>(
  existingIds: readonly string[],
  rows: readonly T[],
): { upserts: Array<T & { sortOrder: number }>; deleteIds: string[] } {
  const kept = new Set(rows.map((r) => r.id).filter((id): id is string => id !== null))
  return {
    upserts: rows.map((r, i) => ({ ...r, sortOrder: i + 1 })),
    deleteIds: existingIds.filter((id) => !kept.has(id)),
  }
}
