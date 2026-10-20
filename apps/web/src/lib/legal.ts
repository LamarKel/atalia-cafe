// Páginas legales: el texto vive en site_content (editable en el panel) con un formato mínimo, sin HTML:
// "## " título, "- " lista, línea en blanco = párrafo nuevo. Se convierte en bloques que Astro escapa,
// así un texto editado nunca puede meter HTML ni scripts en el sitio.
import { formatPpm, ppm } from '@atalia/shared/money'
import type { RefundPolicyInput } from '@atalia/shared/refunds'
import { t, type Locale } from '../i18n'

type RefundTier = RefundPolicyInput['cateringTiers'][number]

export type LegalBlock =
  | { kind: 'h2'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'refund_table' }

export const LEGAL_PAGES = ['terms', 'privacy', 'policies', 'accessibility'] as const
export type LegalPage = (typeof LEGAL_PAGES)[number]

/** Ruta pública de cada página (la de cancelación ya existía como /policies). */
export const LEGAL_PATHS: Record<LegalPage, string> = {
  terms: '/terms',
  privacy: '/privacy',
  policies: '/policies',
  accessibility: '/accessibility',
}

export function parseLegal(text: string): LegalBlock[] {
  const blocks: LegalBlock[] = []
  for (const chunk of text.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const lines = chunk
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')
    let para: string[] = []
    let list: string[] = []
    const flush = () => {
      if (para.length > 0) blocks.push({ kind: 'p', text: para.join(' ') })
      if (list.length > 0) blocks.push({ kind: 'ul', items: list })
      para = []
      list = []
    }
    for (const line of lines) {
      if (line.startsWith('## ')) {
        flush()
        blocks.push({ kind: 'h2', text: line.slice(3).trim() })
      } else if (line === '{refund_table}') {
        flush()
        blocks.push({ kind: 'refund_table' })
      } else if (line.startsWith('- ')) {
        if (para.length > 0) {
          blocks.push({ kind: 'p', text: para.join(' ') })
          para = []
        }
        list.push(line.slice(2).trim())
      } else {
        if (list.length > 0) {
          blocks.push({ kind: 'ul', items: list })
          list = []
        }
        para.push(line)
      }
    }
    flush()
  }
  return blocks
}

/** Reemplaza {business_name}, {email}… Un dato que falta se ve como "(dato pendiente)", nunca vacío. */
export function fillVars(text: string, vars: Record<string, string | null>, missing: string): string {
  return text.replace(/\{([a-z_]+)\}/g, (match, name: string) => {
    if (!(name in vars)) return match
    const value = vars[name]
    return value === null || value === undefined || value.trim() === '' ? missing : value
  })
}

/** Filas de la tabla de reembolsos de catering, en el mismo orden y con los mismos cortes que tierPpm(). */
export function refundRows(
  tiers: readonly RefundTier[],
  locale: Locale,
): Array<{ when: string; refund: string }> {
  const sorted = [...tiers].sort((a, b) => b.hoursBefore - a.hoursBefore)
  return sorted.map((tier, i) => {
    const prev = sorted[i - 1]
    const when =
      i === 0
        ? tier.hoursBefore === 0
          ? t(locale, 'legal.tier_any')
          : t(locale, 'legal.tier_first', { h: tier.hoursBefore })
        : tier.hoursBefore === 0
          ? t(locale, 'legal.tier_last', { h: prev?.hoursBefore ?? 0 })
          : t(locale, 'legal.tier_mid', { lo: tier.hoursBefore, hi: prev?.hoursBefore ?? 0 })
    return { when, refund: formatPpm(ppm(tier.refundPpm)) }
  })
}

/** Frase de la política del menú según refunds.menu_until_status. */
export function menuRule(status: 'confirmed' | 'preparing', locale: Locale): string {
  return t(locale, status === 'preparing' ? 'legal.menu_rule_preparing' : 'legal.menu_rule_confirmed')
}
