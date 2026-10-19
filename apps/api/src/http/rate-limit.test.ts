import { describe, expect, it, vi } from 'vitest'
import { createApp, type Bindings } from './app'

const base: Bindings = { ENVIRONMENT: 'development', ALLOWED_ORIGINS: '' }
const limiter = (success: boolean) => ({ limit: vi.fn(() => Promise.resolve({ success })) })

describe('límites (RNF-S06)', () => {
  it('pasado el límite responde 429 con Retry-After, por IP y por grupo', async () => {
    const RL_STRICT = limiter(false)
    const res = await createApp().request(
      '/quotes',
      { method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.7' }, body: '{}' },
      { ...base, RL_STRICT },
    )
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('60')
    expect(await res.json()).toMatchObject({ error: { code: 'rate_limited' } })
    expect(RL_STRICT.limit).toHaveBeenCalledWith({ key: 'quotes:203.0.113.7' })
  })

  it('dentro del límite sigue normal; /health no tiene límite', async () => {
    const RL_NORMAL = limiter(true)
    const res = await createApp().request('/orders/x', {}, { ...base, RL_NORMAL })
    expect(res.status).toBe(404)
    expect(RL_NORMAL.limit).toHaveBeenCalledOnce()
    const health = await createApp().request('/health', {}, { ...base, RL_NORMAL: limiter(false) })
    expect(health.status).toBe(200)
  })

  it('si el límite falla, deja pasar (no tumba las ventas)', async () => {
    const RL_STRICT = { limit: vi.fn(() => Promise.reject(new Error('down'))) }
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const res = await createApp().request('/checkout', { method: 'POST', body: '{}' }, { ...base, RL_STRICT })
    expect(res.status).not.toBe(429)
    log.mockRestore()
  })

  it('rechaza cuerpos de más de 64 KB', async () => {
    const res = await createApp().request(
      '/quotes',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(70 * 1024) },
      base,
    )
    expect(res.status).toBe(413)
  })
})
