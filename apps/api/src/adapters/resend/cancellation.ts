// Correo al cliente cuando el negocio cancela su pedido: disculpa, cuánto se le devuelve y cuándo lo verá,
// y el mensaje que escribió el equipo (si hay).
import { cents, formatUSD } from '@atalia/shared/money'
import { escape, pickupLabel, send } from './index'
import { cancelText } from './messages'

export interface CancellationInput {
  code: string
  customerName: string
  customerEmail: string
  locale: 'en' | 'es'
  scheduledFor: string
  timezone: string
  refundCents: number
  message: string
}

export function cancellationEmail(input: CancellationInput): { subject: string; html: string; text: string } {
  const t = cancelText[input.locale]
  const when = pickupLabel({
    scheduledFor: input.scheduledFor,
    timezone: input.timezone,
    locale: input.locale,
  })
  const refund = formatUSD(cents(input.refundCents), input.locale)
  const lines = [
    t.greeting.replace('{name}', input.customerName),
    t.body.replace('{code}', input.code).replace('{when}', when),
    input.refundCents > 0 ? t.refund.replace('{amount}', refund) : t.noRefund,
  ]
  const subject = t.subject.replace('{code}', input.code)
  const html = `<!doctype html><html lang="${input.locale}"><body style="margin:0;background:#f6f1eb;font-family:Poppins,Arial,sans-serif;color:#2e2e2e">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<h1 style="font-family:'Playfair Display',Georgia,serif;color:#6b4a3a;font-size:26px;margin:0 0 16px">${escape(t.title)}</h1>
<div style="background:#fff;border-radius:16px;padding:20px">
${lines.map((l) => `<p style="margin:0 0 12px">${escape(l)}</p>`).join('\n')}
${input.message === '' ? '' : `<p style="margin:16px 0 0;padding:12px 16px;background:#f3ead9;border-radius:12px;white-space:pre-line"><strong>${escape(t.messageLabel)}</strong><br>${escape(input.message)}</p>`}
</div>
<p style="margin:20px 0 0">${escape(t.sorry)}</p>
<p style="margin:12px 0 0;font-size:13px;color:#6b6560">${escape(t.footer)}</p>
</div></body></html>`
  const text = [
    t.title,
    '',
    ...lines,
    ...(input.message === '' ? [] : ['', `${t.messageLabel} ${input.message}`]),
    '',
    t.sorry,
    t.footer,
  ].join('\n')
  return { subject, html, text }
}

export async function sendCancellation(
  config: { apiKey: string; from: string },
  input: CancellationInput,
): Promise<void> {
  // Idempotency-Key: si se reintenta la misma cancelación, no llegan dos correos
  await send(
    config.apiKey,
    { from: config.from, to: [input.customerEmail], ...cancellationEmail(input) },
    `order-cancelled-${input.code}`,
  )
}
