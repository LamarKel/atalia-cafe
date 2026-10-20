import { describe, expect, it, vi } from 'vitest'
import { PublishError, QUIET_SECONDS, publishIfDirty, publishNow, type PublishPorts } from './publish'

function ports(over: Partial<PublishPorts> = {}): PublishPorts {
  return {
    claim: vi.fn(() => Promise.resolve(true)),
    request: vi.fn(() => Promise.resolve()),
    finish: vi.fn(() => Promise.resolve()),
    trigger: vi.fn(() => Promise.resolve()),
    verify: vi.fn(() => Promise.resolve({ userId: 'u1', aal: 'aal2' })),
    profileOf: vi.fn(() => Promise.resolve({ role: 'admin' as const, active: true })),
    ...over,
  }
}

describe('publicación del sitio', () => {
  it('el cron publica cuando hay cambios ya calmados', async () => {
    const p = ports()
    expect(await publishIfDirty(p)).toBe('published')
    expect(p.claim).toHaveBeenCalledWith(QUIET_SECONDS)
    expect(p.trigger).toHaveBeenCalledOnce()
    expect(p.finish).toHaveBeenCalledWith(true, null)
  })

  it('sin cambios no llama al deploy hook', async () => {
    const p = ports({ claim: vi.fn(() => Promise.resolve(false)) })
    expect(await publishIfDirty(p)).toBe('idle')
    expect(p.trigger).not.toHaveBeenCalled()
  })

  it('si el hook falla, lo anota (y la BD reintenta en la siguiente vuelta)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const p = ports({ trigger: vi.fn(() => Promise.reject(new Error('503'))) })
    expect(await publishIfDirty(p)).toBe('failed')
    expect(p.finish).toHaveBeenCalledWith(false, '503')
    log.mockRestore()
  })

  it('"Publicar ahora": solo dueña o admin con 2FA', async () => {
    await expect(publishNow(ports(), null)).rejects.toEqual(new PublishError('unauthorized'))
    await expect(
      publishNow(ports({ verify: vi.fn(() => Promise.resolve({ userId: 'u1', aal: 'aal1' })) }), 't'),
    ).rejects.toEqual(new PublishError('mfa_required'))
    await expect(
      publishNow(
        ports({ profileOf: vi.fn(() => Promise.resolve({ role: 'staff' as const, active: true })) }),
        't',
      ),
    ).rejects.toEqual(new PublishError('forbidden'))
    const p = ports()
    expect(await publishNow(p, 't')).toBe('published')
    expect(p.request).toHaveBeenCalledOnce()
    expect(p.trigger).toHaveBeenCalledOnce()
  })
})
