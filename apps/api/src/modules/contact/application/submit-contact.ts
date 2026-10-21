// Formulario de contacto: verifica que sea una persona, limita abusos, guarda y avisa por correo.
// El correo no puede perder el mensaje: si falla, el mensaje queda guardado y se ve en el panel → Mensajes.
import type { ContactRequestParsed, ContactResponse } from '@atalia/shared/contact'
import { getRule } from '@atalia/shared/rules'
import type { StoreRepo } from '../../payments/ports'
import type { CaptchaVerifier } from '../../quotes/ports'
import type { ContactMailer, ContactRepo, SavedContactMessage } from '../ports'

export type ContactErrorCode = 'captcha_failed' | 'too_many_requests'

export class ContactError extends Error {
  override readonly name = 'ContactError'
  constructor(readonly code: ContactErrorCode) {
    super(code)
  }
}

export interface ContactDeps {
  stores: StoreRepo
  messages: ContactRepo
  captcha: CaptchaVerifier
  mailer: ContactMailer
  now?: () => Date
}

/** Máximo de mensajes por correo en una hora. El límite por IP va en el Worker (RL_STRICT). */
const MAX_PER_HOUR = 3

export async function submitContact(
  deps: ContactDeps,
  req: ContactRequestParsed,
  remoteIp: string | null,
): Promise<ContactResponse> {
  const now = deps.now?.() ?? new Date()
  if (!(await deps.captcha.verify(req.turnstileToken, remoteIp))) throw new ContactError('captcha_failed')

  const since = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
  if ((await deps.messages.countRecentByEmail(req.email, since)) >= MAX_PER_HOUR) {
    throw new ContactError('too_many_requests')
  }

  const store = await deps.stores.defaultStore()
  const message = {
    storeId: store.id,
    name: req.name,
    email: req.email,
    phone: req.phone,
    locale: req.locale,
    topic: req.topic,
    message: req.message,
  }
  const { code } = await deps.messages.create(message)
  const saved: SavedContactMessage = { ...message, code }

  const recipients = getRule('notifications.contact_recipients', await deps.stores.rules(store.id), {
    storeId: store.id,
    at: now,
  })
  if (recipients.length === 0) {
    console.warn(
      '[contact] notifications.contact_recipients está vacía: el mensaje solo quedó en el panel',
      code,
    )
  } else {
    try {
      await deps.mailer.notifyBusiness(saved, recipients)
    } catch (err) {
      console.error('[contact] no se pudo enviar el aviso', code, err)
    }
  }

  return { code }
}
