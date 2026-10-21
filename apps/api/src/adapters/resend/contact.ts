// Aviso al negocio de un mensaje del formulario de contacto. reply_to es el cliente: se responde directo.
import type { ContactMailer, SavedContactMessage } from '../../modules/contact/ports'
import { escape, send } from './index'
import { contactText } from './messages'

export interface ContactMailConfig {
  apiKey: string
  from: string
  /** Idioma del correo al negocio (regla notifications.staff_locale). */
  businessLocale: () => Promise<'en' | 'es'>
}

export function businessContactEmail(m: SavedContactMessage, locale: 'en' | 'es') {
  const t = contactText[locale]
  const topic = t.topics[m.topic]
  const rows: Array<[string, string]> = [
    [t.name, m.name],
    [t.email, m.email],
    [t.phone, m.phone === '' ? '—' : m.phone],
    [t.topic, topic],
    [t.language, t.languages[m.locale]],
  ]
  const title = t.title.replace('{code}', m.code)
  const td = 'padding:8px 0;border-bottom:1px solid #eee;vertical-align:top'
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;background:#f6f1eb;font-family:Poppins,Arial,sans-serif;color:#2e2e2e">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<h1 style="font-family:'Playfair Display',Georgia,serif;color:#6b4a3a;font-size:26px;margin:0 0 8px">${escape(title)}</h1>
<p style="margin:0 0 20px">${escape(t.intro)}</p>
<div style="background:#fff;border-radius:16px;padding:20px">
<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">
${rows.map(([k, v]) => `<tr><td style="${td};color:#6b6560;width:35%">${escape(k)}</td><td style="${td}">${escape(v)}</td></tr>`).join('\n')}
</table>
<p style="margin:16px 0 4px;color:#6b6560;font-size:14px">${escape(t.message)}</p>
<p style="margin:0;white-space:pre-line;font-size:15px">${escape(m.message)}</p>
</div>
<p style="margin:20px 0 0;font-size:13px;color:#6b6560">${escape(t.footer)}</p>
</div></body></html>`
  const text = [
    title,
    t.intro,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    `${t.message}:`,
    m.message,
    '',
    t.footer,
  ].join('\n')
  return {
    subject: t.subject.replace('{code}', m.code).replace('{topic}', topic).replace('{name}', m.name),
    html,
    text,
  }
}

export function resendContactMailer(config: ContactMailConfig): ContactMailer {
  return {
    async notifyBusiness(m, recipients) {
      await send(
        config.apiKey,
        {
          from: config.from,
          to: recipients,
          reply_to: m.email,
          ...businessContactEmail(m, await config.businessLocale()),
        },
        `contact-business-${m.code}`,
      )
    },
  }
}
