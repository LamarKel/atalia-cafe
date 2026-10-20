// Fotos del catálogo (Storage de Supabase u otra URL https que pegue el admin) optimizadas al compilar:
// WebP al ancho en que se muestran. El sitio se recompila solo al editar en el panel (site_publish), así que
// una foto nueva también sale optimizada. Si una imagen no se puede procesar, se usa la original.
import { getImage } from 'astro:assets'

/** Anchos por uso (px reales, ya pensando en pantallas retina). */
export const IMAGE_WIDTH = {
  thumb: 320,
  card: 800,
  tile: 960,
  detail: 1200,
} as const

const cache = new Map<string, Promise<string>>()

export function optimizedImage(url: string | null, width: number): Promise<string | null> {
  if (url === null) return Promise.resolve(null)
  if (!url.startsWith('https://')) return Promise.resolve(url)
  const key = `${url}|${String(width)}`
  let pending = cache.get(key)
  if (pending === undefined) {
    pending = getImage({ src: url, width, inferSize: true, format: 'webp', quality: 75 })
      .then((img) => img.src)
      .catch((err: unknown) => {
        console.warn('[images] no se pudo optimizar', url, err instanceof Error ? err.message : err)
        return url
      })
    cache.set(key, pending)
  }
  return pending
}

/** Varios anchos de la misma foto (srcset): el teléfono baja la chica y la pantalla grande la grande. */
export const IMAGE_WIDTHS = {
  card: [320, 480, 800],
  tile: [480, 720, 960],
  detail: [480, 800, 1200],
} as const

const setCache = new Map<string, Promise<{ src: string; srcset: string | null }>>()

export function optimizedImageSet(
  url: string | null,
  widths: readonly number[],
): Promise<{ src: string; srcset: string | null } | null> {
  if (url === null) return Promise.resolve(null)
  if (!url.startsWith('https://')) return Promise.resolve({ src: url, srcset: null })
  const key = `${url}|${widths.join(',')}`
  let pending = setCache.get(key)
  if (pending === undefined) {
    pending = getImage({
      src: url,
      width: Math.max(...widths),
      widths: [...widths],
      inferSize: true,
      format: 'webp',
      quality: 75,
    })
      .then((img) => ({ src: img.src, srcset: img.srcSet.attribute || null }))
      .catch((err: unknown) => {
        console.warn('[images] no se pudo optimizar', url, err instanceof Error ? err.message : err)
        return { src: url, srcset: null }
      })
    setCache.set(key, pending)
  }
  return pending
}
