// Encabezados de seguridad del sitio y del panel (RNF-S02), compartidos por los dos astro.config.
//
// - CSP de scripts y estilos: la genera Astro (security.csp) con hashes de cada script/estilo en línea,
//   como <meta> en cada página. Así no hace falta 'unsafe-inline'.
// - Lo que un <meta> no puede poner (frame-ancestors, HSTS, etc.) va en dist/_headers, que Cloudflare
//   aplica al servir los archivos estáticos.
// Los orígenes de la API y de Supabase salen de las variables PUBLIC_* de cada ambiente.
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/**
 * Variables PUBLIC_* de la app (las de process.env, como en CI, tienen prioridad sobre los .env).
 * La CSP solo se aplica en el build, así que se leen las de producción.
 * @param {string} configUrl import.meta.url del astro.config
 * @param {(mode: string, dir: string, prefix: string) => Record<string, string>} loadEnv el de vite (la app lo resuelve)
 * @returns {Record<string, string>}
 */
export function publicEnv(configUrl, loadEnv) {
  return loadEnv('production', fileURLToPath(new URL('.', configUrl)), 'PUBLIC_')
}

const origin = (url) => {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/**
 * @param {{ apiUrl?: string | undefined, supabaseUrl?: string | undefined, frames?: string[], scripts?: string[] }} opts
 * @returns {NonNullable<import('astro').AstroUserConfig['security']>['csp']}
 */
export function cspConfig(opts) {
  const api = origin(opts.apiUrl ?? '')
  const supabase = origin(opts.supabaseUrl ?? '')
  const connect = ["'self'", api, supabase, supabase?.replace(/^https:/, 'wss:')].filter(Boolean)
  return {
    algorithm: 'SHA-256',
    directives: [
      "default-src 'self'",
      `connect-src ${connect.join(' ')}`,
      // Las imágenes las sube o pega el admin (Storage de Supabase u otra URL https).
      "img-src 'self' data: blob: https:",
      "font-src 'self' https://fonts.gstatic.com",
      `frame-src ${(opts.frames ?? []).join(' ') || "'none'"}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ],
    scriptDirective: { resources: ["'self'", ...(opts.scripts ?? [])] },
    styleDirective: { resources: ["'self'", 'https://fonts.googleapis.com'] },
  }
}

/** Integración de Astro que escribe dist/_headers al terminar el build. */
export function securityHeaders({ noindex = false } = {}) {
  const common = [
    "Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    'X-Frame-Options: DENY',
    'X-Content-Type-Options: nosniff',
    'Referrer-Policy: strict-origin-when-cross-origin',
    'Strict-Transport-Security: max-age=63072000; includeSubDomains; preload',
    'Cross-Origin-Opener-Policy: same-origin',
    'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    ...(noindex ? ['X-Robots-Tag: noindex, nofollow'] : []),
  ]
  const body = [
    '/*',
    ...common.map((h) => `  ${h}`),
    '',
    // Archivos con hash en el nombre: se pueden guardar en caché para siempre.
    '/_astro/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
  ].join('\n')
  return {
    name: 'atalia:security-headers',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        await writeFile(new URL('_headers', dir), body, 'utf8')
      },
    },
  }
}
