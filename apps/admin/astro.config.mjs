// @ts-check
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'
import { loadEnv } from 'vite'
import { cspConfig, publicEnv, securityHeaders } from '../../config/security-headers.mjs'

const env = publicEnv(import.meta.url, loadEnv)

// Panel de administración (PLAN.md §6): una app de React dentro de Astro. Habla con Supabase usando la
// sesión del usuario (RLS + 2FA); lo que mueve dinero (reembolsos, cancelaciones) va por el Worker.
export default defineConfig({
  integrations: [react(), securityHeaders({ noindex: true })],
  // Sin bloques de código en Markdown: Shiki pondría estilos en línea que la CSP bloquea.
  markdown: { syntaxHighlight: false },
  security: {
    // RNF-S02: CSP con hashes; el panel solo habla con Supabase (también Realtime por wss) y el Worker.
    csp: cspConfig({ apiUrl: env.PUBLIC_API_URL, supabaseUrl: env.PUBLIC_SUPABASE_URL }),
  },
  vite: {
    plugins: [tailwindcss()],
  },
})
