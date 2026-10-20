import { describe, expect, it, vi } from 'vitest'
import { aalFromJwt, inviteMember, inviteSchema, requireOwner, TeamError, type TeamPorts } from './team'

const jwt = (claims: object) => `x.${btoa(JSON.stringify(claims)).replace(/=+$/, '')}.y`

function ports(over: Partial<TeamPorts> = {}): TeamPorts {
  return {
    verify: () => Promise.resolve({ userId: 'u1', aal: 'aal2' }),
    profileOf: () => Promise.resolve({ role: 'owner', active: true }),
    list: () =>
      Promise.resolve([
        {
          userId: 'u2',
          email: 'ana@atalia.test',
          role: 'staff',
          displayName: null,
          active: true,
          lastSignInAt: null,
          mfa: false,
        },
      ]),
    invite: vi.fn(() => Promise.resolve({ userId: 'u3' })),
    ...over,
  }
}

describe('equipo', () => {
  it('solo la dueña activa, con 2FA, puede administrar el equipo', async () => {
    await expect(requireOwner(ports(), null)).rejects.toEqual(new TeamError('unauthorized'))
    await expect(requireOwner(ports({ verify: () => Promise.resolve(null) }), 't')).rejects.toEqual(
      new TeamError('unauthorized'),
    )
    await expect(
      requireOwner(ports({ verify: () => Promise.resolve({ userId: 'u1', aal: 'aal1' }) }), 't'),
    ).rejects.toEqual(new TeamError('mfa_required'))
    await expect(
      requireOwner(ports({ profileOf: () => Promise.resolve({ role: 'admin', active: true }) }), 't'),
    ).rejects.toEqual(new TeamError('forbidden'))
    await expect(
      requireOwner(ports({ profileOf: () => Promise.resolve({ role: 'owner', active: false }) }), 't'),
    ).rejects.toEqual(new TeamError('forbidden'))
    await expect(requireOwner(ports(), 't')).resolves.toEqual({ userId: 'u1', aal: 'aal2' })
  })

  it('invita con el correo en minúsculas y no repite miembros', async () => {
    const p = ports()
    const input = inviteSchema.parse({ email: ' Luis@Atalia.TEST ', role: 'admin', displayName: '' })
    expect(input).toEqual({ email: 'luis@atalia.test', role: 'admin', displayName: null })
    await inviteMember(p, 't', input, 'https://admin')
    expect(p.invite).toHaveBeenCalledWith(input, 'https://admin')
    await expect(
      inviteMember(p, 't', inviteSchema.parse({ email: 'ana@atalia.test', role: 'staff' }), 'x'),
    ).rejects.toEqual(new TeamError('already_member'))
  })

  it('lee el aal del token', () => {
    expect(aalFromJwt(jwt({ aal: 'aal2', sub: 'u' }))).toBe('aal2')
    expect(aalFromJwt(jwt({ sub: 'u' }))).toBeNull()
    expect(aalFromJwt('roto')).toBeNull()
  })
})
