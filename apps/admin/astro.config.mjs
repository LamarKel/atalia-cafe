// @ts-check
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'

// Panel de administración (PLAN.md §6): una app de React dentro de Astro. Habla con Supabase usando la
// sesión del usuario (RLS + 2FA); lo que mueve dinero (reembolsos, cancelaciones) va por el Worker.
export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
})
