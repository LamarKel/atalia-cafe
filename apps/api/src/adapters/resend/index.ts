// Adaptador de Resend: correo de pedido confirmado al cliente y aviso al negocio
// (notifications.order_recipients). El remitente viene de la configuración (EMAIL_FROM), no del código.
import type { OrderSummary } from '@atalia/shared/checkout'
import { cents, formatUSD } from '@atalia/shared/money'
import type { Mailer } from '../../modules/payments/ports'
import { emailText } from './messages'

export interface ResendConfig {
  apiKey: string
  from: string
  siteUrl: string
  /** Correos del negocio que reciben copia de cada pedido. */
  staffRecipients: () => Promise<string[]>
}

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )

export function pickupLabel(summary: Pick<OrderSummary, 'scheduledFor' | 'timezone' | 'locale'>): string {
  return new Intl.DateTimeFormat(summary.locale === 'es' ? 'es-US' : 'en-US', {
    timeZone: summary.timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(summary.scheduledFor))
}

export function confirmationEmail(
  summary: OrderSummary,
  orderUrl: string,
): { subject: string; html: string; text: string } {
  const t = emailText[summary.locale]
  const usd = (n: number) => formatUSD(cents(n), summary.locale)
  const when = pickupLabel(summary)
  const rows = summary.items.map((i) => {
    const name = i.detail === null ? i.name : `${i.name} · ${i.detail}`
    return { name: i.quantity > 1 ? `${name} × ${i.quantity}` : name, total: usd(i.lineTotalCents) }
  })
  const totals = [
    { name: t.subtotal, total: usd(summary.subtotalCents) },
    ...(summary.discountCents > 0 ? [{ name: t.discount, total: `−${usd(summary.discountCents)}` }] : []),
    { name: t.tax, total: usd(summary.taxCents) },
  ]

  const subject = t.subject.replace('{code}', summary.code)
  const td = 'padding:6px 0;border-bottom:1px solid #eee'
  const html = `<!doctype html><html lang="${summary.locale}"><body style="margin:0;background:#f6f1eb;font-family:Poppins,Arial,sans-serif;color:#2e2e2e">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<h1 style="font-family:'Playfair Display',Georgia,serif;color:#6b4a3a;font-size:28px;margin:0 0 8px">${escape(t.title)}</h1>
<p style="margin:0 0 20px">${escape(t.greeting.replace('{name}', summary.customerName))}</p>
<div style="background:#fff;border-radius:16px;padding:20px">
<p style="margin:0 0 4px;font-weight:600">${escape(t.order)} ${escape(summary.code)}</p>
<p style="margin:0 0 16px">${escape(t.pickup)}: <strong>${escape(when)}</strong></p>
<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">
${[...rows, ...totals].map((r) => `<tr><td style="${td}">${escape(r.name)}</td><td style="${td};text-align:right">${escape(r.total)}</td></tr>`).join('\n')}
<tr><td style="padding:10px 0;font-weight:600">${escape(t.paid)}</td><td style="padding:10px 0;text-align:right;font-weight:600;color:#6b4a3a">${escape(usd(summary.totalCents))}</td></tr>
</table></div>
<p style="margin:24px 0"><a href="${escape(orderUrl)}" style="display:inline-block;background:#6b4a3a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600">${escape(t.view)}</a></p>
</div></body></html>`

  const text = [
    t.title,
    t.greeting.replace('{name}', summary.customerName),
    '',
    `${t.order} ${summary.code}`,
    `${t.pickup}: ${when}`,
    '',
    ...[...rows, ...totals].map((r) => `${r.name}: ${r.total}`),
    `${t.paid}: ${usd(summary.totalCents)}`,
    '',
    `${t.view}: ${orderUrl}`,
  ].join('\n')

  return { subject, html, text }
}

async function send(apiKey: string, body: Record<string, unknown>, idempotencyKey: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`resend ${res.status.toString()}: ${(await res.text()).slice(0, 200)}`)
}

export function resendMailer(config: ResendConfig): Mailer {
  return {
    async orderConfirmed(summary) {
      const localePath = summary.locale === 'es' ? '/es' : ''
      const accessUrl = `${config.siteUrl.replace(/\/$/, '')}${localePath}/checkout/success?order=${summary.accessToken}`
      const mail = confirmationEmail(summary, accessUrl)
      // Idempotency-Key: si Stripe reenvía el evento, Resend no manda el correo dos veces.
      await send(
        config.apiKey,
        { from: config.from, to: [summary.email], ...mail },
        `order-confirmed-${summary.code}`,
      )
      const staff = await config.staffRecipients()
      if (staff.length > 0) {
        await send(
          config.apiKey,
          {
            from: config.from,
            to: staff,
            subject: `[${summary.code}] ${mail.subject}`,
            html: mail.html,
            text: mail.text,
          },
          `order-staff-${summary.code}`,
        )
      }
    },
  }
}
