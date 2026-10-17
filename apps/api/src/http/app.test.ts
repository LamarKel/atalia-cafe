import { describe, expect, it, vi } from 'vitest'
import { createApp, type Bindings } from './app'
import { ApiError } from './errors'

const env: Bindings = { ENVIRONMENT: 'development', ALLOWED_ORIGINS: 'http://localhost:4321' }

describe('API base', () => {
  it('GET /health responde ok sin tocar la BD', async () => {
    const res = await createApp().request('/health', {}, env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ status: 'ok', environment: 'development' })
  })

  it('incluye encabezados de seguridad (RNF-S02)', async () => {
    const res = await createApp().request('/health', {}, env)
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(res.headers.get('strict-transport-security')).toContain('max-age=')
  })

  it('CORS solo para los orígenes permitidos', async () => {
    const ok = await createApp().request('/health', { headers: { Origin: 'http://localhost:4321' } }, env)
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:4321')
    const bad = await createApp().request('/health', { headers: { Origin: 'https://evil.example' } }, env)
    expect(bad.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('404 en JSON', async () => {
    const res = await createApp().request('/nope', {}, env)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Ruta no encontrada' } })
  })

  it('ApiError conserva su código y estado', async () => {
    const app = createApp()
    app.get('/conflict', () => {
      throw new ApiError(409, 'conflict', 'Ya existe')
    })
    const res = await app.request('/conflict', {}, env)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: { code: 'conflict', message: 'Ya existe' } })
  })

  it('un error inesperado no filtra detalles internos', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const app = createApp()
    app.get('/boom', () => {
      throw new Error('relation "orders" does not exist — service_role key xyz')
    })
    const res = await app.request('/boom', {}, env)
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('service_role')
    expect(text).not.toContain('orders')
    expect(JSON.parse(text)).toEqual({
      error: { code: 'internal_error', message: 'Ocurrió un error. Intenta de nuevo.' },
    })
    spy.mockRestore()
  })
})
