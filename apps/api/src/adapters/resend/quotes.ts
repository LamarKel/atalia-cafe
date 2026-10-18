// Correos de cotización (RF-Q03): uno al negocio con todos los datos y uno de confirmación al cliente.
import type { QuoteMailer, SavedQuote } from '../../modules/quotes/ports'
import { escape, send } from './index'
import { quoteText } from './messages'

export interface QuoteMailConfig {
  apiKey: string
  from: string
  /** Idioma del correo al negocio (regla notifications.staff_locale). */
  businessLocale: () => Promise<'en' | 'es'>
}

const longDate = (iso: string, locale: 'en' | 'es') =>
  new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T12:00:00Z`))

function rows(quote: SavedQuote, locale: 'en' | 'es'): Array<[string, string]> {
  const t = quoteText[locale]
  return [
    [t.name, quote.customer.name],
    [t.email, quote.customer.email],
    [t.phone, quote.customer.phone],
    [t.date, longDate(quote.eventDate, locale)],
    [t.type, t.events[quote.eventType]],
    [t.guests, String(quote.guests)],
    [t.products, quote.products.length === 0 ? '—' : quote.products.map((p) => p.name).join(', ')],
    [t.notes, quote.notes === '' ? '—' : quote.notes],
  ]
}

function layout(
  locale: 'en' | 'es',
  title: string,
  intro: string,
  table: Array<[string, string]>,
  footer: string,
) {
  const td = 'padding:8px 0;border-bottom:1px solid #eee;vertical-align:top'
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;background:#f6f1eb;font-family:Poppins,Arial,sans-serif;color:#2e2e2e">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<h1 style="font-family:'Playfair Display',Georgia,serif;color:#6b4a3a;font-size:26px;margin:0 0 8px">${escape(title)}</h1>
<p style="margin:0 0 20px">${escape(intro)}</p>
<div style="background:#fff;border-radius:16px;padding:20px">
<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">
${table.map(([k, v]) => `<tr><td style="${td};color:#6b6560;width:40%">${escape(k)}</td><td style="${td};white-space:pre-line">${escape(v)}</td></tr>`).join('\n')}
</table></div>
<p style="margin:20px 0 0;font-size:13px;color:#6b6560">${escape(footer)}</p>
</div></body></html>`
  const text = [title, intro, '', ...table.map(([k, v]) => `${k}: ${v}`), '', footer].join('\n')
  return { html, text }
}

export function businessQuoteEmail(quote: SavedQuote, locale: 'en' | 'es') {
  const t = quoteText[locale]
  const subject = t.businessSubject.replace('{code}', quote.code).replace('{guests}', String(quote.guests))
  return {
    subject,
    ...layout(
      locale,
      t.businessTitle.replace('{code}', quote.code),
      t.businessIntro,
      rows(quote, locale),
      t.businessFooter,
    ),
  }
}

export function customerQuoteEmail(quote: SavedQuote) {
  const t = quoteText[quote.locale]
  return {
    subject: t.customerSubject.replace('{code}', quote.code),
    ...layout(
      quote.locale,
      t.customerTitle,
      t.customerIntro.replace('{name}', quote.customer.name).replace('{code}', quote.code),
      rows(quote, quote.locale).slice(3),
      t.customerFooter,
    ),
  }
}

export function resendQuoteMailer(config: QuoteMailConfig): QuoteMailer {
  return {
    async notifyBusiness(quote, recipients) {
      const mail = businessQuoteEmail(quote, await config.businessLocale())
      // reply_to: el negocio responde directo al cliente desde su correo.
      await send(
        config.apiKey,
        { from: config.from, to: recipients, reply_to: quote.customer.email, ...mail },
        `quote-business-${quote.code}`,
      )
    },
    async confirmToCustomer(quote) {
      await send(
        config.apiKey,
        { from: config.from, to: [quote.customer.email], ...customerQuoteEmail(quote) },
        `quote-customer-${quote.code}`,
      )
    },
  }
}
