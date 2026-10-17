// @ts-check
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'

// Sitio público (PLAN.md §5): estático + islas de React. EN por defecto en "/", ES en "/es" (RNF03).
export default defineConfig({
  site: 'https://atalia.cafe',
  integrations: [react()],
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es'],
    routing: { prefixDefaultLocale: false },
  },
  vite: {
    plugins: [tailwindcss()],
  },
})
