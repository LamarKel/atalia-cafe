// Punto de composición del Worker (PLAN.md §7): aquí se unirán los puertos de los módulos con los adaptadores
// de Supabase, Stripe y Resend. Por ahora solo expone la app HTTP base.
import { createApp } from './http/app'

const app = createApp()

export default app
