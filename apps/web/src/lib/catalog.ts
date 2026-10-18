// Datos del sitio público, leídos de Supabase al construir las páginas (RLS: solo lo activo).
// Más adelante se leerán por el Worker con caché en el edge (/catalog, RNF-C01); la forma de los datos no cambia.
import type { Locale } from '../i18n'
import { fromPrice, sizeAmounts, sizePrice, type ProductType, type SizeRow } from './catalog-format'
import { supabase } from './supabase'

type Localized = { name_en: string; name_es: string | null }
const pick = (locale: Locale, en: string, es: string | null | undefined) => (locale === 'es' && es ? es : en)

/** Textos editables del sitio (site_content) en el idioma pedido. Si falta en ES, usa EN. */
export async function getSiteContent(locale: Locale): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('site_content').select('key, locale, value')
  if (error) {
    console.error('[catalog] site_content', error.message)
    return {}
  }
  const out: Record<string, string> = {}
  for (const row of data.filter((r) => r.locale === 'en')) out[row.key] = row.value
  if (locale === 'es') for (const row of data.filter((r) => r.locale === 'es')) out[row.key] = row.value
  return out
}

export interface CateringCategory {
  id: string
  slug: string
  name: string
  description: string | null
  ctaLabel: string | null
  imageUrl: string | null
}

export async function getCateringCategories(locale: Locale): Promise<CateringCategory[]> {
  const { data, error } = await supabase
    .from('categories')
    .select(
      'id, slug, name_en, name_es, description_en, description_es, cta_label_en, cta_label_es, image_url',
    )
    .eq('section', 'catering')
    .order('sort_order')
  if (error) {
    console.error('[catalog] categories', error.message)
    return []
  }
  return data.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: pick(locale, c.name_en, c.name_es),
    description: c.description_en === null ? null : pick(locale, c.description_en, c.description_es),
    ctaLabel: c.cta_label_en === null ? null : pick(locale, c.cta_label_en, c.cta_label_es),
    imageUrl: c.image_url,
  }))
}

export interface CateringProduct {
  id: string
  slug: string
  type: ProductType
  categorySlug: string
  name: string
  shortDescription: string | null
  imageUrl: string | null
  imageAlt: string | null
  minLeadHours: number
  fromPriceCents: number | null
  amounts: { kind: 'serves' | 'units'; values: number[] } | null
  sizes: SizeRow[]
}

interface ProductRow extends Localized {
  id: string
  slug: string | null
  type: ProductType
  short_description_en: string | null
  short_description_es: string | null
  price_cents: number | null
  min_lead_hours: number
  category: { slug: string } | null
  sizes: SizeRow[]
  images: Array<{ image_url: string; is_primary: boolean; alt_en: string | null; alt_es: string | null }>
}

export async function getCateringProducts(locale: Locale): Promise<CateringProduct[]> {
  const { data, error } = await supabase
    .from('products')
    .select(
      `id, slug, type, name_en, name_es, short_description_en, short_description_es, price_cents, min_lead_hours,
       category:categories(slug),
       sizes:product_sizes(serves, units, price_cents, price_modifier_cents, active),
       images:product_images(image_url, is_primary, alt_en, alt_es)`,
    )
    .neq('type', 'menu')
    .order('sort_order')
    .returns<ProductRow[]>()
  if (error) {
    console.error('[catalog] products', error.message)
    return []
  }
  return data
    .filter((p) => p.slug !== null && p.category !== null)
    .map((p) => {
      const image = p.images.find((i) => i.is_primary) ?? p.images[0]
      return {
        id: p.id,
        slug: p.slug as string,
        type: p.type,
        categorySlug: (p.category as { slug: string }).slug,
        name: pick(locale, p.name_en, p.name_es),
        shortDescription:
          p.short_description_en === null
            ? null
            : pick(locale, p.short_description_en, p.short_description_es),
        imageUrl: image?.image_url ?? null,
        imageAlt: image === undefined ? null : pick(locale, image.alt_en ?? '', image.alt_es) || null,
        minLeadHours: p.min_lead_hours,
        fromPriceCents: fromPrice(p.price_cents, p.sizes),
        amounts: sizeAmounts(p.sizes),
        sizes: p.sizes,
      }
    })
}

export interface StoreInfo {
  businessName: string
  address: string | null
  phone: string | null
  whatsapp: string | null
  lat: number | null
  lng: number | null
  hours: Array<{ weekday: number; opens_at: string; closes_at: string }>
}

export async function getStoreInfo(): Promise<StoreInfo> {
  const [settings, store] = await Promise.all([
    supabase.from('business_settings').select('business_name, phone, whatsapp_number').maybeSingle(),
    supabase
      .from('stores')
      .select(
        'id, address, city, state, zip_code, phone, lat, lng, hours:business_hours(weekday, opens_at, closes_at)',
      )
      .order('sort_order')
      .limit(1)
      .maybeSingle(),
  ])
  if (settings.error) console.error('[catalog] business_settings', settings.error.message)
  if (store.error) console.error('[catalog] stores', store.error.message)
  const s = store.data
  const address = s
    ? [s.address, [s.city, s.state].filter(Boolean).join(', '), s.zip_code].filter(Boolean).join(' · ')
    : ''
  return {
    businessName: settings.data?.business_name ?? 'Atalia Café',
    address: address || null,
    phone: s?.phone ?? settings.data?.phone ?? null,
    whatsapp: settings.data?.whatsapp_number ?? null,
    lat: s?.lat ?? null,
    lng: s?.lng ?? null,
    hours: s?.hours ?? [],
  }
}

export interface DetailSize extends SizeRow {
  id: string
  label: string
  priceCents: number | null
}

export interface ProductDetail extends CateringProduct {
  categoryName: string
  description: string | null
  images: Array<{ url: string; alt: string }>
  inclusions: string[]
  options: DetailSize[]
}

interface DetailRow extends ProductRow {
  description_en: string | null
  description_es: string | null
  category: { slug: string; name_en: string; name_es: string | null } | null
  sizes: Array<SizeRow & { id: string; name_en: string; name_es: string | null; sort_order: number }>
  images: Array<{
    image_url: string
    is_primary: boolean
    alt_en: string | null
    alt_es: string | null
    sort_order: number
  }>
  inclusions: Array<{ label_en: string; label_es: string | null; sort_order: number }>
}

/** Todo lo de un producto de catering para su página de detalle (pantalla 03). */
export async function getProductDetails(locale: Locale): Promise<ProductDetail[]> {
  const { data, error } = await supabase
    .from('products')
    .select(
      `id, slug, type, name_en, name_es, short_description_en, short_description_es, description_en, description_es,
       price_cents, min_lead_hours,
       category:categories(slug, name_en, name_es),
       sizes:product_sizes(id, name_en, name_es, serves, units, price_cents, price_modifier_cents, active, sort_order),
       images:product_images(image_url, is_primary, alt_en, alt_es, sort_order),
       inclusions:product_inclusions(label_en, label_es, sort_order)`,
    )
    .in('type', ['tray', 'table'])
    .order('sort_order')
    .returns<DetailRow[]>()
  if (error) {
    console.error('[catalog] product details', error.message)
    return []
  }
  const bySort = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order
  return data
    .filter((p) => p.slug !== null && p.category !== null)
    .map((p) => {
      const category = p.category as NonNullable<DetailRow['category']>
      const sizes = [...p.sizes].filter((s) => s.active).sort(bySort)
      const images = [...p.images]
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)
        .map((i) => ({ url: i.image_url, alt: pick(locale, i.alt_en ?? '', i.alt_es) }))
      return {
        id: p.id,
        slug: p.slug as string,
        type: p.type,
        categorySlug: category.slug,
        categoryName: pick(locale, category.name_en, category.name_es),
        name: pick(locale, p.name_en, p.name_es),
        shortDescription:
          p.short_description_en === null
            ? null
            : pick(locale, p.short_description_en, p.short_description_es),
        description: p.description_en === null ? null : pick(locale, p.description_en, p.description_es),
        imageUrl: images[0]?.url ?? null,
        imageAlt: images[0]?.alt ?? null,
        images,
        minLeadHours: p.min_lead_hours,
        fromPriceCents: fromPrice(p.price_cents, sizes),
        amounts: sizeAmounts(sizes),
        sizes,
        inclusions: [...p.inclusions].sort(bySort).map((i) => pick(locale, i.label_en, i.label_es)),
        options: sizes.map((s) => ({
          ...s,
          label: pick(locale, s.name_en, s.name_es),
          priceCents: sizePrice(p.price_cents, s),
        })),
      }
    })
}

export interface PicaderaPiece {
  id: string
  pieceType: string
  filling: string
  imageUrl: string | null
}

export interface PicaderaBuilderData {
  product: { id: string; slug: string; name: string; minLeadHours: number }
  sizes: DetailSize[]
  pieces: PicaderaPiece[]
}

interface PicaderaProductRow extends Localized {
  id: string
  slug: string | null
  price_cents: number | null
  min_lead_hours: number
  sizes: Array<SizeRow & { id: string; name_en: string; name_es: string | null; sort_order: number }>
}

/** Paquetes (5/10/15/20 piezas) y piezas del armador de picaderas (pantalla 04). */
export async function getPicaderaBuilder(locale: Locale): Promise<PicaderaBuilderData | null> {
  const [product, options] = await Promise.all([
    supabase
      .from('products')
      .select(
        `id, slug, name_en, name_es, price_cents, min_lead_hours,
         sizes:product_sizes(id, name_en, name_es, serves, units, price_cents, price_modifier_cents, active, sort_order)`,
      )
      .eq('type', 'picadera_pack')
      .order('sort_order')
      .limit(1)
      .returns<PicaderaProductRow[]>(),
    supabase
      .from('picadera_options')
      .select('id, piece_type_en, piece_type_es, filling_en, filling_es, image_url, sort_order')
      .order('sort_order'),
  ])
  if (product.error || options.error) {
    console.error('[catalog] picadera', product.error?.message ?? options.error?.message)
    return null
  }
  const p = product.data[0]
  if (p === undefined || p.slug === null) return null
  const sizes = [...p.sizes]
    .filter((s) => s.active && s.units !== null)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => ({
      ...s,
      label: pick(locale, s.name_en, s.name_es),
      priceCents: sizePrice(p.price_cents, s),
    }))
  return {
    product: {
      id: p.id,
      slug: p.slug,
      name: pick(locale, p.name_en, p.name_es),
      minLeadHours: p.min_lead_hours,
    },
    sizes,
    pieces: options.data.map((o) => ({
      id: o.id,
      pieceType: pick(locale, o.piece_type_en, o.piece_type_es),
      filling: pick(locale, o.filling_en, o.filling_es),
      imageUrl: o.image_url,
    })),
  }
}
