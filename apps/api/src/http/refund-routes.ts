// Reembolsos y cancelaciones desde el panel. El token de dueña o admin llega en Authorization: Bearer.
import { REFUND_REASONS, refundRequestSchema, type RefundReason } from '@atalia/shared/refunds'
import type { Hono } from 'hono'
import { z } from 'zod'
import { RefundError, refundOrder, refundQuote, type RefundPorts } from '../modules/refunds/refunds'
import type { AppEnv, Bindings } from './app'
import { ApiError } from './errors'

export interface RefundWiring {
  ports(env: Bindings): RefundPorts
}

const bearer = (header: string | undefined) =>
  header?.startsWith('Bearer ') === true ? header.slice(7) : null
const orderId = z.uuid()

function refundError(err: unknown): never {
  if (err instanceof RefundError) {
    switch (err.code) {
      case 'unauthorized':
        throw new ApiError(401, 'unauthorized', 'Inicia sesión otra vez')
      case 'mfa_required':
        throw new ApiError(403, 'forbidden', 'Hace falta la verificación en 2 pasos')
      case 'forbidden':
        throw new ApiError(403, 'forbidden', 'Solo la dueña o un admin pueden reembolsar')
      case 'not_found':
        throw new ApiError(404, 'not_found', 'Pedido no encontrado')
      case 'not_paid':
        throw new ApiError(409, 'conflict', 'Ese pedido no tiene un pago para reembolsar')
      case 'too_much':
        throw new ApiError(422, 'validation_failed', 'El monto es mayor a lo que queda por devolver')
      case 'nothing_to_do':
        throw new ApiError(422, 'validation_failed', 'No hay nada que reembolsar ni cancelar')
    }
  }
  throw err
}

export function refundRoutes(app: Hono<AppEnv>, wiring: RefundWiring): void {
  app.get('/admin/orders/:id/refund-quote', async (c) => {
    const id = orderId.safeParse(c.req.param('id'))
    if (!id.success) throw new ApiError(404, 'not_found', 'Pedido no encontrado')
    const reason = c.req.query('reason')
    const r: RefundReason = (REFUND_REASONS as readonly string[]).includes(reason ?? '')
      ? (reason as RefundReason)
      : 'customer'
    const quote = await refundQuote(
      wiring.ports(c.env),
      bearer(c.req.header('authorization')),
      id.data,
      r,
    ).catch(refundError)
    c.header('Cache-Control', 'no-store')
    return c.json(quote)
  })

  app.post('/admin/orders/:id/refund', async (c) => {
    const id = orderId.safeParse(c.req.param('id'))
    if (!id.success) throw new ApiError(404, 'not_found', 'Pedido no encontrado')
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new ApiError(400, 'bad_request', 'JSON inválido')
    }
    const parsed = refundRequestSchema.safeParse(body)
    if (!parsed.success) throw new ApiError(422, 'validation_failed', 'Revisa el monto y el motivo')
    const result = await refundOrder(
      wiring.ports(c.env),
      bearer(c.req.header('authorization')),
      id.data,
      parsed.data,
    ).catch(refundError)
    return c.json(result)
  })
}
