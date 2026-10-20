// Publicación automática del sitio estático: cuando el panel cambia algo que el sitio muestra, se vuelve a
// compilar (deploy hook de Cloudflare). La BD marca los cambios; este caso de uso decide cuándo publicar.
import type { Caller, TeamRole } from '../team/team'

/** Segundos sin cambios antes de publicar: así varias ediciones seguidas dan un solo build. */
export const QUIET_SECONDS = 60

export interface PublishPorts {
  /** true una sola vez por tanda de cambios, cuando ya pasó QUIET_SECONDS sin cambios nuevos. */
  claim(quietSeconds: number): Promise<boolean>
  /** Marca que se pidió un build ahora ("Publicar ahora"). */
  request(): Promise<void>
  finish(ok: boolean, error: string | null): Promise<void>
  /** Llama al deploy hook (lanza si falla). */
  trigger(): Promise<void>
  verify(accessToken: string): Promise<Caller | null>
  profileOf(userId: string): Promise<{ role: TeamRole; active: boolean } | null>
}

export type PublishErrorCode = 'unauthorized' | 'mfa_required' | 'forbidden' | 'failed'

export class PublishError extends Error {
  override readonly name = 'PublishError'
  constructor(readonly code: PublishErrorCode) {
    super(code)
  }
}

async function run(ports: PublishPorts): Promise<'published' | 'failed'> {
  try {
    await ports.trigger()
    await ports.finish(true, null)
    return 'published'
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[publish] el deploy hook falló', message)
    await ports.finish(false, message)
    return 'failed'
  }
}

/** Cron: publica si hubo cambios y ya se calmaron. */
export async function publishIfDirty(ports: PublishPorts): Promise<'published' | 'failed' | 'idle'> {
  if (!(await ports.claim(QUIET_SECONDS))) return 'idle'
  return run(ports)
}

/** "Publicar ahora" desde el panel: dueña o admin con 2FA (quien puede editar el contenido). */
export async function publishNow(ports: PublishPorts, accessToken: string | null): Promise<'published'> {
  if (accessToken === null) throw new PublishError('unauthorized')
  const caller = await ports.verify(accessToken)
  if (caller === null) throw new PublishError('unauthorized')
  if (caller.aal !== 'aal2') throw new PublishError('mfa_required')
  const profile = await ports.profileOf(caller.userId)
  if (profile === null || !profile.active || (profile.role !== 'owner' && profile.role !== 'admin'))
    throw new PublishError('forbidden')
  await ports.request()
  if ((await run(ports)) === 'failed') throw new PublishError('failed')
  return 'published'
}
