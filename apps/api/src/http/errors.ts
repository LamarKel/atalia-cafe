// Errores de la API en un solo formato: { error: { code, message } }.
// Nunca se envían detalles internos (stack, SQL, claves) al cliente.
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export type ErrorCode =
  | 'bad_request'
  | 'validation_failed'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'cart_invalid'
  | 'slot_unavailable'
  | 'checkout_closed'
  | 'payments_disabled'
  | 'captcha_failed'
  | 'internal_error'

export class ApiError extends Error {
  override readonly name = 'ApiError'

  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown }
}

export function errorBody(code: ErrorCode, message: string, details?: unknown): ErrorBody {
  return details === undefined ? { error: { code, message } } : { error: { code, message, details } }
}
