// Datos del sitio público, leídos de Supabase al construir las páginas (RLS: solo lo activo).
// Más adelante se leerán por el Worker con caché en el edge (/catalog, RNF-C01); la forma de los datos no cambia.
import type { StoredRule } from '@atalia/shared/rules'
import type { Locale } from '../i18n'
import { fromPrice, safeUrl, sizeAmounts, sizePrice, type ProductType, type SizeRow } from './catalog-format'
import { IMAGE_WIDTH, IMAGE_WIDTHS, optimizedImage, optimizedImageSet } from './images'
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
  // Un texto vacío cuenta como "no hay": así el panel oculta un elemento (cifras, reseñas) sin borrarlo.
  const filled = data.filter((r) => typeof r.value === 'string' && r.value.trim() !== '')
  const out: Record<string, string> = {}
  for (const row of filled.filter((r) => r.locale === 'en')) out[row.key] = row.value
  if (locale === 'es') for (const row of filled.filter((r) => r.locale === 'es')) out[row.key] = row.value
  return out
}

export interface CateringCategory {
  id: string
  slug: string
  name: string
  description: string | null
  ctaLabel: string | null
  imageUrl: string | null
  /** srcset WebP (null si la foto no se pudo optimizar o no es remota) */
  imageSrcset: string | null
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
  return Promise.all(
    data.map(async (c) => {
      const img = await optimizedImageSet(c.image_url, IMAGE_WIDTHS.tile)
      return {
        id: c.id,
        slug: c.slug,
        name: pick(locale, c.name_en, c.name_es),
        description: c.description_en === null ? null : pick(locale, c.description_en, c.description_es),
        ctaLabel: c.cta_label_en === null ? null : pick(locale, c.cta_label_en, c.cta_label_es),
        imageUrl: img?.src ?? null,
        imageSrcset: img?.srcset ?? null,
      }
    }),
  )
}

export interface CateringProduct {
  id: string
  slug: string
  type: ProductType
  categorySlug: string
  name: string
  shortDescription: string | null
  imageUrl: string | null
  imageSrcset: string | null
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
  const rows = data.filter((p) => p.slug !== null && p.category !== null)
  return Promise.all(
    rows.map(async (p) => {
      const image = p.images.find((i) => i.is_primary) ?? p.images[0]
      const img = await optimizedImageSet(image?.image_url ?? null, IMAGE_WIDTHS.card)
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
        imageUrl: img?.src ?? null,
        imageSrcset: img?.srcset ?? null,
        imageAlt: image === undefined ? null : pick(locale, image.alt_en ?? '', image.alt_es) || null,
        minLeadHours: p.min_lead_hours,
        fromPriceCents: fromPrice(p.price_cents, p.sizes),
        amounts: sizeAmounts(p.sizes),
        sizes: p.sizes,
      }
    }),
  )
}

export interface StoreInfo {
  businessName: string
  address: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  /** Plataformas de delivery (solo las que tienen enlace https). */
  delivery: Array<{ name: 'Uber Eats' | 'DoorDash'; url: string }>
  /** Zona horaria de la tienda, para "Abierto hoy" calculado en el navegador. */
  timezone: string
  /** Ícono de la pestaña cargado en el panel (https); si no hay, el del sitio. */
  faviconUrl: string | null
  /** Redes sociales cargadas en el panel (solo las que tienen URL). */
  socials: Array<{ network: 'instagram' | 'facebook' | 'tiktok' | 'x'; url: string }>
  lat: number | null
  lng: number | null
  hours: Array<{ weekday: number; opens_at: string; closes_at: string }>
}

export async function getStoreInfo(): Promise<StoreInfo> {
  const [settings, store] = await Promise.all([
    supabase
      .from('business_settings')
      .select(
        'business_name, phone, whatsapp_number, email, instagram_url, facebook_url, tiktok_url, twitter_url, uber_eats_url, doordash_url, favicon_url',
      )
      .maybeSingle(),
    supabase
      .from('stores')
      .select(
        'id, address, city, state, zip_code, phone, lat, lng, timezone, hours:business_hours(weekday, opens_at, closes_at)',
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
    email: settings.data?.email ?? null,
    delivery: (
      [
        ['Uber Eats', settings.data?.uber_eats_url],
        ['DoorDash', settings.data?.doordash_url],
      ] as const
    ).flatMap(([name, url]) => {
      const safe = safeUrl(url)
      return safe === null ? [] : [{ name, url: safe }]
    }),
    timezone: s?.timezone ?? 'America/New_York',
    faviconUrl: safeUrl(settings.data?.favicon_url),
    socials: (
      [
        ['instagram', settings.data?.instagram_url],
        ['facebook', settings.data?.facebook_url],
        ['tiktok', settings.data?.tiktok_url],
        ['x', settings.data?.twitter_url],
      ] as const
    ).flatMap(([network, url]) => {
      const safe = safeUrl(url)
      return safe === null ? [] : [{ network, url: safe }]
    }),
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
  images: Array<{ url: string; alt: string; srcset: string | null }>
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
  const rows = data.filter((p) => p.slug !== null && p.category !== null)
  return Promise.all(
    rows.map(async (p) => {
      const category = p.category as NonNullable<DetailRow['category']>
      const sizes = [...p.sizes].filter((s) => s.active).sort(bySort)
      const images = await Promise.all(
        [...p.images]
          .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)
          .map(async (i) => {
            const img = await optimizedImageSet(i.image_url, IMAGE_WIDTHS.detail)
            return {
              url: img?.src ?? i.image_url,
              srcset: img?.srcset ?? null,
              alt: pick(locale, i.alt_en ?? '', i.alt_es),
            }
          }),
      )
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
        imageSrcset: null,
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
    }),
  )
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
    pieces: await Promise.all(
      options.data.map(async (o) => ({
        id: o.id,
        pieceType: pick(locale, o.piece_type_en, o.piece_type_es),
        filling: pick(locale, o.filling_en, o.filling_es),
        imageUrl: await optimizedImage(o.image_url, IMAGE_WIDTH.thumb),
      })),
    ),
  }
}

/**
 * Reglas públicas (business_rules) para leer con getRule() de packages/shared. Si la RLS no deja leer
 * alguna, getRule usa el valor por defecto del registro.
 */
export async function getPublicRuleRows(): Promise<StoredRule[]> {
  const { data, error } = await supabase.from('business_rules').select('key, store_id, value, effective_from')
  if (error) {
    console.error('[catalog] business_rules', error.message)
    return []
  }
  return data as StoredRule[]
}

export interface MenuItem {
  id: string
  categoryId: string
  name: string
  description: string | null
  priceCents: number | null
  featured: boolean
  soldOut: boolean
  imageUrl: string | null
  imageSrcset: string | null
  sizes: Array<{ id: string; name: string; priceCents: number | null }>
  extras: Array<{ id: string; name: string; priceCents: number }>
  nutrition: Array<{ label: string; value: string }>
}

export interface MenuCategory {
  id: string
  slug: string
  name: string
  description: string | null
  icon: string
  group: string
  items: MenuItem[]
}

export interface PickupStore {
  id: string
  name: string
  address: string | null
  locations: Array<{ id: string; name: string; description: string | null; icon: string }>
}

interface MenuRow extends Localized {
  id: string
  category_id: string
  description_en: string | null
  description_es: string | null
  short_description_en: string | null
  short_description_es: string | null
  price_cents: number | null
  featured: boolean
  stock_enabled: boolean
  in_stock: boolean
  sizes: Array<SizeRow & { id: string; name_en: string; name_es: string | null; sort_order: number }>
  extras: Array<{
    id: string
    name_en: string
    name_es: string | null
    price_cents: number
    active: boolean
    sort_order: number
  }>
  nutrition: Array<{ label_en: string; label_es: string | null; value: string; sort_order: number }>
  images: Array<{ image_url: string; is_primary: boolean; sort_order: number }>
}

/** Menú del café (pantalla con el lenguaje de la 02): categorías con sus productos, tamaños, extras y nutrición. */
export async function getMenu(locale: Locale): Promise<MenuCategory[]> {
  const [cats, prods] = await Promise.all([
    supabase
      .from('categories')
      .select('id, slug, name_en, name_es, description_en, description_es, icon, group_name')
      .eq('section', 'menu')
      .eq('active', true)
      .order('sort_order'),
    supabase
      .from('products')
      .select(
        `id, category_id, name_en, name_es, description_en, description_es, short_description_en, short_description_es,
         price_cents, featured, stock_enabled, in_stock,
         sizes:product_sizes(id, name_en, name_es, serves, units, price_cents, price_modifier_cents, active, sort_order),
         extras:product_extras(id, name_en, name_es, price_cents, active, sort_order),
         nutrition:product_nutritional_info(label_en, label_es, value, sort_order),
         images:product_images(image_url, is_primary, sort_order)`,
      )
      .eq('type', 'menu')
      .eq('active', true)
      .order('sort_order')
      .returns<MenuRow[]>(),
  ])
  if (cats.error || prods.error) {
    console.error('[catalog] menu', cats.error?.message ?? prods.error?.message)
    return []
  }
  const bySort = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order
  const items = prods.data.map((p): MenuItem & { rawImage: string | null } => {
    const image = [...p.images].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || bySort(a, b))[0]
    const description = p.description_en ?? p.short_description_en
    return {
      id: p.id,
      categoryId: p.category_id,
      name: pick(locale, p.name_en, p.name_es),
      description:
        description === null ? null : pick(locale, description, p.description_es ?? p.short_description_es),
      priceCents: p.price_cents,
      featured: p.featured,
      soldOut: p.stock_enabled && !p.in_stock,
      imageUrl: null,
      imageSrcset: null,
      sizes: [...p.sizes]
        .filter((s) => s.active)
        .sort(bySort)
        .map((s) => ({
          id: s.id,
          name: pick(locale, s.name_en, s.name_es),
          priceCents: sizePrice(p.price_cents, s),
        })),
      extras: [...p.extras]
        .filter((e) => e.active)
        .sort(bySort)
        .map((e) => ({ id: e.id, name: pick(locale, e.name_en, e.name_es), priceCents: e.price_cents })),
      nutrition: [...p.nutrition]
        .sort(bySort)
        .map((n) => ({ label: pick(locale, n.label_en, n.label_es), value: n.value })),
      rawImage: image?.image_url ?? null,
    }
  })
  // Fotos optimizadas al ancho de la tarjeta del menú
  const optimized = await Promise.all(
    items.map(async ({ rawImage, ...item }) => {
      const img = await optimizedImageSet(rawImage, IMAGE_WIDTHS.card)
      return { ...item, imageUrl: img?.src ?? null, imageSrcset: img?.srcset ?? null }
    }),
  )
  return cats.data.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: pick(locale, c.name_en, c.name_es),
    description: c.description_en === null ? null : pick(locale, c.description_en, c.description_es),
    icon: c.icon,
    group: c.group_name,
    items: optimized.filter((i) => i.categoryId === c.id),
  }))
}

/** Tiendas activas con sus puntos de recogida (selector "¿Dónde lo recoges?"). */
export async function getPickupStores(locale: Locale): Promise<PickupStore[]> {
  const { data, error } = await supabase
    .from('stores')
    .select(
      `id, name, address, city, state,
       locations:pickup_locations(id, name_en, name_es, description_en, description_es, icon, sort_order, active)`,
    )
    .eq('active', true)
    .order('sort_order')
  if (error) {
    console.error('[catalog] pickup stores', error.message)
    return []
  }
  type Row = {
    id: string
    name: string
    address: string | null
    city: string | null
    state: string | null
    locations: Array<{
      id: string
      name_en: string
      name_es: string | null
      description_en: string | null
      description_es: string | null
      icon: string
      sort_order: number
      active: boolean
    }>
  }
  return (data as Row[]).map((s) => ({
    id: s.id,
    name: s.name,
    address: [s.address, [s.city, s.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || null,
    locations: s.locations
      .filter((l) => l.active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((l) => ({
        id: l.id,
        name: pick(locale, l.name_en, l.name_es),
        description: l.description_en === null ? null : pick(locale, l.description_en, l.description_es),
        icon: l.icon,
      })),
  }))
}
