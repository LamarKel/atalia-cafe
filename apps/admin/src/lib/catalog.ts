// Datos del catálogo para el panel (fase 3). Escribe directo en Supabase con la sesión del usuario: la RLS
// (admin_all → has_admin_role('admin') con 2FA) decide si puede. Los precios ya llegan en centavos.
import {
  childChanges,
  type ProductDraft,
  type ProductDraftInput,
  type ProductTypeName,
} from '@atalia/shared/catalog'
import { supabase } from './supabase'

export type Section = 'menu' | 'catering'

export interface AdminCategory {
  id: string
  section: Section
  slug: string
  nameEn: string
  nameEs: string | null
  descriptionEn: string | null
  descriptionEs: string | null
  icon: string
  groupName: string
  imageUrl: string | null
  ctaLabelEn: string | null
  ctaLabelEs: string | null
  sortOrder: number
  active: boolean
  productCount: number
}

export interface AdminImage {
  id: string
  url: string
  isPrimary: boolean
  sortOrder: number
}

export interface ProductRow {
  id: string
  type: ProductTypeName
  categoryId: string
  nameEn: string
  nameEs: string | null
  priceCents: number | null
  fromPriceCents: number | null
  active: boolean
  featured: boolean
  soldOut: boolean
  imageUrl: string | null
  sortOrder: number
}

export interface ProductFull {
  draft: ProductDraftInput
  images: AdminImage[]
}

class CatalogError extends Error {
  override readonly name = 'CatalogError'
}
const fail = (context: string, message: string): never => {
  throw new CatalogError(`${context}: ${message}`)
}

type CategoryDbRow = {
  id: string
  section: Section
  slug: string
  name_en: string
  name_es: string | null
  description_en: string | null
  description_es: string | null
  icon: string
  group_name: string
  image_url: string | null
  cta_label_en: string | null
  cta_label_es: string | null
  sort_order: number
  active: boolean
  products: Array<{ count: number }>
}

export async function listCategories(section: Section): Promise<AdminCategory[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*, products(count)')
    .eq('section', section)
    .order('sort_order')
    .returns<CategoryDbRow[]>()
  if (error) fail('categories', error.message)
  return (data ?? []).map((c) => ({
    id: c.id,
    section: c.section,
    slug: c.slug,
    nameEn: c.name_en,
    nameEs: c.name_es,
    descriptionEn: c.description_en,
    descriptionEs: c.description_es,
    icon: c.icon,
    groupName: c.group_name,
    imageUrl: c.image_url,
    ctaLabelEn: c.cta_label_en,
    ctaLabelEs: c.cta_label_es,
    sortOrder: c.sort_order,
    active: c.active,
    productCount: c.products[0]?.count ?? 0,
  }))
}

export async function saveCategory(c: Omit<AdminCategory, 'productCount'>): Promise<void> {
  const row = {
    section: c.section,
    slug: c.slug,
    name_en: c.nameEn,
    name_es: c.nameEs,
    description_en: c.descriptionEn,
    description_es: c.descriptionEs,
    icon: c.icon,
    group_name: c.groupName,
    image_url: c.imageUrl,
    cta_label_en: c.ctaLabelEn,
    cta_label_es: c.ctaLabelEs,
    sort_order: c.sortOrder,
    active: c.active,
  }
  const { error } =
    c.id === ''
      ? await supabase.from('categories').insert(row)
      : await supabase.from('categories').update(row).eq('id', c.id)
  if (error) fail('save_category', error.message)
}

/** Cambia el orden de dos filas (botones subir/bajar: funciona con teclado, sin arrastrar). */
export async function swapOrder(
  table: 'categories' | 'products' | 'picadera_options',
  a: { id: string; sortOrder: number },
  b: { id: string; sortOrder: number },
) {
  const [r1, r2] = await Promise.all([
    supabase.from(table).update({ sort_order: b.sortOrder }).eq('id', a.id),
    supabase.from(table).update({ sort_order: a.sortOrder }).eq('id', b.id),
  ])
  const error = r1.error ?? r2.error
  if (error) fail('reorder', error.message)
}

type ProductDbRow = {
  id: string
  type: ProductTypeName
  category_id: string
  name_en: string
  name_es: string | null
  price_cents: number | null
  active: boolean
  featured: boolean
  stock_enabled: boolean
  in_stock: boolean
  sort_order: number
  sizes: Array<{ price_cents: number | null; price_modifier_cents: number; active: boolean }>
  images: Array<{ image_url: string; is_primary: boolean; sort_order: number }>
}

export async function listProducts(section: Section): Promise<ProductRow[]> {
  const types = section === 'menu' ? ['menu'] : ['tray', 'table', 'picadera_pack']
  const { data, error } = await supabase
    .from('products')
    .select(
      `id, type, category_id, name_en, name_es, price_cents, active, featured, stock_enabled, in_stock, sort_order,
       sizes:product_sizes(price_cents, price_modifier_cents, active),
       images:product_images(image_url, is_primary, sort_order)`,
    )
    .in('type', types)
    .order('sort_order')
    .returns<ProductDbRow[]>()
  if (error) fail('products', error.message)
  return (data ?? []).map((p) => {
    const prices = p.sizes
      .filter((s) => s.active)
      .map((s) => s.price_cents ?? (p.price_cents === null ? null : p.price_cents + s.price_modifier_cents))
      .filter((v): v is number => v !== null)
    const image = [...p.images].sort(
      (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order,
    )[0]
    return {
      id: p.id,
      type: p.type,
      categoryId: p.category_id,
      nameEn: p.name_en,
      nameEs: p.name_es,
      priceCents: p.price_cents,
      fromPriceCents: prices.length > 0 ? Math.min(...prices) : p.price_cents,
      active: p.active,
      featured: p.featured,
      soldOut: p.stock_enabled && !p.in_stock,
      imageUrl: image?.image_url ?? null,
      sortOrder: p.sort_order,
    }
  })
}

export async function setProductFlags(
  id: string,
  flags: { active?: boolean; featured?: boolean; soldOut?: boolean },
) {
  const row: Record<string, boolean> = {}
  if (flags.active !== undefined) row.active = flags.active
  if (flags.featured !== undefined) row.featured = flags.featured
  // "Agotado" = control de inventario encendido y sin existencias (lo que lee el sitio y el Worker)
  if (flags.soldOut !== undefined) {
    row.stock_enabled = flags.soldOut
    row.in_stock = !flags.soldOut
  }
  const { error } = await supabase.from('products').update(row).eq('id', id)
  if (error) fail('product_flags', error.message)
}

export function emptyDraft(type: ProductTypeName, categoryId: string): ProductDraftInput {
  return {
    id: null,
    type,
    categoryId,
    slug: '',
    nameEn: '',
    nameEs: '',
    shortDescriptionEn: '',
    shortDescriptionEs: '',
    descriptionEn: '',
    descriptionEs: '',
    priceCents: null,
    minLeadHours: type === 'menu' ? 0 : type === 'picadera_pack' ? 1 : 24,
    featured: false,
    vegetarian: false,
    stockEnabled: false,
    inStock: true,
    active: true,
    sizes: [],
    extras: [],
    nutrition: [],
    inclusions: [],
  }
}

type FullDbRow = {
  id: string
  type: ProductTypeName
  category_id: string
  slug: string | null
  name_en: string
  name_es: string | null
  short_description_en: string | null
  short_description_es: string | null
  description_en: string | null
  description_es: string | null
  price_cents: number | null
  min_lead_hours: number
  featured: boolean
  vegetarian: boolean
  stock_enabled: boolean
  in_stock: boolean
  active: boolean
  sizes: Array<{
    id: string
    name_en: string
    name_es: string | null
    serves: number | null
    units: number | null
    price_cents: number | null
    price_modifier_cents: number
    active: boolean
    sort_order: number
  }>
  extras: Array<{
    id: string
    name_en: string
    name_es: string | null
    price_cents: number
    active: boolean
    sort_order: number
  }>
  nutrition: Array<{
    id: string
    label_en: string
    label_es: string | null
    value: string
    sort_order: number
  }>
  inclusions: Array<{ id: string; label_en: string; label_es: string | null; sort_order: number }>
  images: Array<{ id: string; image_url: string; is_primary: boolean; sort_order: number }>
}

const bySort = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order

export async function getProduct(id: string): Promise<ProductFull> {
  const { data, error } = await supabase
    .from('products')
    .select(
      `*, sizes:product_sizes(*), extras:product_extras(*), nutrition:product_nutritional_info(*),
       inclusions:product_inclusions(*), images:product_images(*)`,
    )
    .eq('id', id)
    .single<FullDbRow>()
  if (error) fail('product', error.message)
  const p = data as FullDbRow
  return {
    draft: {
      id: p.id,
      type: p.type,
      categoryId: p.category_id,
      slug: p.slug ?? '',
      nameEn: p.name_en,
      nameEs: p.name_es ?? '',
      shortDescriptionEn: p.short_description_en ?? '',
      shortDescriptionEs: p.short_description_es ?? '',
      descriptionEn: p.description_en ?? '',
      descriptionEs: p.description_es ?? '',
      priceCents: p.price_cents,
      minLeadHours: p.min_lead_hours,
      featured: p.featured,
      vegetarian: p.vegetarian,
      stockEnabled: p.stock_enabled,
      inStock: p.in_stock,
      active: p.active,
      sizes: [...p.sizes].sort(bySort).map((s) => ({
        id: s.id,
        nameEn: s.name_en,
        nameEs: s.name_es ?? '',
        serves: s.serves,
        units: s.units,
        priceCents: s.price_cents,
        priceModifierCents: s.price_modifier_cents,
        active: s.active,
      })),
      extras: [...p.extras].sort(bySort).map((e) => ({
        id: e.id,
        nameEn: e.name_en,
        nameEs: e.name_es ?? '',
        priceCents: e.price_cents,
        active: e.active,
      })),
      nutrition: [...p.nutrition]
        .sort(bySort)
        .map((n) => ({ id: n.id, labelEn: n.label_en, labelEs: n.label_es ?? '', value: n.value })),
      inclusions: [...p.inclusions]
        .sort(bySort)
        .map((n) => ({ id: n.id, labelEn: n.label_en, labelEs: n.label_es ?? '' })),
    },
    images: [...p.images]
      .sort(bySort)
      .map((i) => ({ id: i.id, url: i.image_url, isPrimary: i.is_primary, sortOrder: i.sort_order })),
  }
}

async function syncChildren<T extends { id: string | null }>(
  table: string,
  productId: string,
  rows: readonly T[],
  toRow: (r: T & { sortOrder: number }) => Record<string, unknown>,
): Promise<void> {
  const { data, error } = await supabase.from(table).select('id').eq('product_id', productId)
  if (error) fail(table, error.message)
  const { upserts, deleteIds } = childChanges(
    ((data ?? []) as Array<{ id: string }>).map((r) => r.id),
    rows,
  )
  if (deleteIds.length > 0) {
    const del = await supabase.from(table).delete().in('id', deleteIds)
    if (del.error) fail(`${table}_delete`, del.error.message)
  }
  const existing = upserts.filter((r) => r.id !== null)
  const created = upserts.filter((r) => r.id === null)
  for (const r of existing) {
    const up = await supabase
      .from(table)
      .update(toRow(r))
      .eq('id', r.id as string)
    if (up.error) fail(`${table}_update`, up.error.message)
  }
  if (created.length > 0) {
    const ins = await supabase
      .from(table)
      .insert(created.map((r) => ({ ...toRow(r), product_id: productId })))
    if (ins.error) fail(`${table}_insert`, ins.error.message)
  }
}

/** Guarda el producto y sus filas hijas. Devuelve el id (nuevo o existente). */
export async function saveProduct(d: ProductDraft): Promise<string> {
  const row = {
    type: d.type,
    category_id: d.categoryId,
    slug: d.slug,
    name_en: d.nameEn,
    name_es: d.nameEs,
    short_description_en: d.shortDescriptionEn,
    short_description_es: d.shortDescriptionEs,
    description_en: d.descriptionEn,
    description_es: d.descriptionEs,
    price_cents: d.priceCents,
    min_lead_hours: d.minLeadHours,
    featured: d.featured,
    vegetarian: d.vegetarian,
    stock_enabled: d.stockEnabled,
    in_stock: d.inStock,
    active: d.active,
  }
  let id = d.id
  if (id === null) {
    const { data, error } = await supabase.from('products').insert(row).select('id').single<{ id: string }>()
    if (error) fail('product_insert', error.message)
    id = (data as { id: string }).id
  } else {
    const { error } = await supabase.from('products').update(row).eq('id', id)
    if (error) fail('product_update', error.message)
  }
  await syncChildren('product_sizes', id, d.sizes, (s) => ({
    name_en: s.nameEn,
    name_es: s.nameEs,
    serves: s.serves,
    units: s.units,
    price_cents: s.priceCents,
    price_modifier_cents: s.priceModifierCents,
    active: s.active,
    sort_order: s.sortOrder,
  }))
  await syncChildren('product_extras', id, d.extras, (e) => ({
    name_en: e.nameEn,
    name_es: e.nameEs,
    price_cents: e.priceCents,
    active: e.active,
    sort_order: e.sortOrder,
  }))
  await syncChildren('product_nutritional_info', id, d.nutrition, (n) => ({
    label_en: n.labelEn,
    label_es: n.labelEs,
    value: n.value,
    sort_order: n.sortOrder,
  }))
  await syncChildren('product_inclusions', id, d.inclusions, (n) => ({
    label_en: n.labelEn,
    label_es: n.labelEs,
    sort_order: n.sortOrder,
  }))
  return id
}

// ── Fotos ──────────────────────────────────────────────────────────────────

const BUCKET = 'product-images'

/** Achica y convierte a WebP en el navegador: se suben ~150 KB en vez de fotos de 5 MB del teléfono. */
export async function toWebp(file: File, maxWidth = 1200, maxHeight = 900, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new CatalogError('canvas')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b === null ? reject(new CatalogError('webp')) : resolve(b)), 'image/webp', quality),
  )
}

/** Sube una foto (ya en WebP) y devuelve su URL pública. */
export async function uploadImage(folder: string, blob: Blob): Promise<string> {
  const path = `${folder}/${crypto.randomUUID()}.webp`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000' })
  if (error) fail('upload', error.message)
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

export async function addProductImage(
  productId: string,
  url: string,
  alt: { en: string; es: string | null },
  isPrimary: boolean,
  sortOrder: number,
) {
  if (isPrimary)
    await supabase.from('product_images').update({ is_primary: false }).eq('product_id', productId)
  const { error } = await supabase.from('product_images').insert({
    product_id: productId,
    image_url: url,
    alt_en: alt.en,
    alt_es: alt.es,
    is_primary: isPrimary,
    sort_order: sortOrder,
  })
  if (error) fail('add_image', error.message)
}

export async function setPrimaryImage(productId: string, imageId: string) {
  // Primero se quita la principal (índice único parcial: solo una por producto)
  const off = await supabase.from('product_images').update({ is_primary: false }).eq('product_id', productId)
  if (off.error) fail('primary_off', off.error.message)
  const on = await supabase.from('product_images').update({ is_primary: true }).eq('id', imageId)
  if (on.error) fail('primary_on', on.error.message)
}

export async function removeProductImage(imageId: string, url: string) {
  const { error } = await supabase.from('product_images').delete().eq('id', imageId)
  if (error) fail('remove_image', error.message)
  // El archivo se borra solo si es nuestro (las de datos de prueba quedan)
  const marker = `/object/public/${BUCKET}/`
  const i = url.indexOf(marker)
  if (i >= 0) await supabase.storage.from(BUCKET).remove([url.slice(i + marker.length)])
}

// ── Piezas de picadera ────────────────────────────────────────────────────

export interface PicaderaPiece {
  id: string
  pieceTypeEn: string
  pieceTypeEs: string | null
  fillingEn: string
  fillingEs: string | null
  imageUrl: string | null
  sortOrder: number
  active: boolean
}

export async function listPieces(): Promise<PicaderaPiece[]> {
  const { data, error } = await supabase.from('picadera_options').select('*').order('sort_order')
  if (error) fail('pieces', error.message)
  return ((data ?? []) as Array<Record<string, unknown>>).map((o) => ({
    id: o.id as string,
    pieceTypeEn: o.piece_type_en as string,
    pieceTypeEs: o.piece_type_es as string | null,
    fillingEn: o.filling_en as string,
    fillingEs: o.filling_es as string | null,
    imageUrl: o.image_url as string | null,
    sortOrder: o.sort_order as number,
    active: o.active as boolean,
  }))
}

export async function savePiece(p: PicaderaPiece): Promise<void> {
  const row = {
    piece_type_en: p.pieceTypeEn,
    piece_type_es: p.pieceTypeEs,
    filling_en: p.fillingEn,
    filling_es: p.fillingEs,
    image_url: p.imageUrl,
    sort_order: p.sortOrder,
    active: p.active,
  }
  const { error } =
    p.id === ''
      ? await supabase.from('picadera_options').insert(row)
      : await supabase.from('picadera_options').update(row).eq('id', p.id)
  if (error) fail('save_piece', error.message)
}
