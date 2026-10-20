// Zod configurado una sola vez para todo el proyecto.
// jitless: Zod no intenta compilar validadores con new Function, así la CSP no necesita 'unsafe-eval'.
import { z } from 'zod'

z.config({ jitless: true })

export { z }
