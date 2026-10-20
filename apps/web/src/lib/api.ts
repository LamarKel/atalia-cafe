// Cliente del Worker (API) para el navegador. Solo la URL pública; ningún secreto vive aquí.
import type {
  AvailabilityRequest,
  AvailabilityResponse,
  CheckoutRequest,
  CheckoutResponse,
  OrderSummary,
} from '@atalia/shared/checkout'
import type { QuoteRequest, QuoteResponse } from '@atalia/shared/quotes'
import type { CartItem } from './cart'

const BASE = import.meta.env.PUBLIC_API_URL.replace(/\/$/, '')

export class ApiRequestError extends Error {
  override readonly name = 'ApiRequestError'
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code)
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new ApiRequestError(0, 'network_error')
  }
  if (!res.ok) {
    let code = 'internal_error'
    try {
      const body = (await res.json()) as { error?: { code?: string } }
      code = body.error?.code ?? code
    } catch {
      // Cuerpo vacío o que no es JSON.
    }
    throw new ApiRequestError(res.status, code)
  }
  return (await res.json()) as T
}

/** Lo que el Worker necesita de cada línea del carrito (sin precios: los calcula el servidor). */
export function toApiItems(items: readonly CartItem[]): CheckoutRequest['items'] {
  return items.map((i) => ({
    productId: i.productId,
    sizeId: i.sizeId,
    quantity: i.quantity,
    notes: i.notes,
    components: i.components.map((c) => ({ optionId: c.optionId, qty: c.qty })),
    extraIds: i.extras.map((e) => e.id),
  }))
}

export const api = {
  availability: (body: AvailabilityRequest) =>
    call<AvailabilityResponse>('/availability', { method: 'POST', body: JSON.stringify(body) }),
  checkout: (body: CheckoutRequest) =>
    call<CheckoutResponse>('/checkout', { method: 'POST', body: JSON.stringify(body) }),
  quote: (body: QuoteRequest) =>
    call<QuoteResponse>('/quotes', { method: 'POST', body: JSON.stringify(body) }),
  order: (accessToken: string) => call<OrderSummary>(`/orders/${encodeURIComponent(accessToken)}`),
}
