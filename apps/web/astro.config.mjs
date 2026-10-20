// @ts-check
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'
import { loadEnv } from 'vite'
import { cspConfig, publicEnv, securityHeaders } from '../../config/security-headers.mjs'

const env = publicEnv(import.meta.url, loadEnv)

// Sitio público (PLAN.md §5): estático + islas de React. EN por defecto en "/", ES en "/es" (RNF03).
export default defineConfig({
  site: 'https://atalia.cafe',
  integrations: [react(), securityHeaders()],
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es'],
    routing: { prefixDefaultLocale: false },
  },
  // Sin bloques de código en Markdown: Shiki pondría estilos en línea que la CSP bloquea.
  markdown: { syntaxHighlight: false },
  security: {
    // RNF-S02: CSP con hashes de los scripts y estilos en línea (sin 'unsafe-inline').
    csp: cspConfig({
      apiUrl: env.PUBLIC_API_URL,
      supabaseUrl: env.PUBLIC_SUPABASE_URL,
      // Turnstile (cotización) y el mapa de Google de la página de inicio
      scripts: ['https://challenges.cloudflare.com'],
      frames: ['https://challenges.cloudflare.com', 'https://maps.google.com', 'https://www.google.com'],
    }),
  },
  vite: {
    plugins: [tailwindcss()],
  },
})
