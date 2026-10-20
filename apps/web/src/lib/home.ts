// Inicio v2 (docs/design/01-inicio-v2.html): lógica pura que usan la página y su script de animación.
import { formatTime } from './catalog-format'

/** "Café, sabor\ny *celebraciones*" → líneas con tramos normales y en cursiva (sin HTML). */
export function richTitle(text: string): Array<Array<{ text: string; em: boolean }>> {
  return text.split('\n').map((line) =>
    line
      .split(/(\*[^*]+\*)/)
      .filter((part) => part !== '')
      .map((part) =>
        part.startsWith('*') && part.endsWith('*') && part.length > 2
          ? { text: part.slice(1, -1), em: true }
          : { text: part, em: false },
      ),
  )
}

/** "Bandejas · Charcutería · …" → ["Bandejas", "Charcutería", …] */
export function marqueeItems(text: string | undefined): string[] {
  return (text ?? '')
    .split('·')
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

export interface HoursRow {
  weekday: number
  opens_at: string
  closes_at: string
}

export type OpenStatus =
  | { kind: 'open'; from: string; to: string }
  | { kind: 'later'; from: string; to: string }
  | { kind: 'closed_today' }

/** Estado de hoy en la zona horaria de la tienda: abierto ahora, abre más tarde o cerrado. */
export function openStatus(hours: readonly HoursRow[], now: Date, timezone: string): OpenStatus {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  const minutes = Number(get('hour')) * 60 + Number(get('minute'))
  const today = hours.find((h) => h.weekday === weekday)
  if (today === undefined) return { kind: 'closed_today' }
  const toMin = (t: string) => {
    const [h = '0', m = '0'] = t.split(':')
    return Number(h) * 60 + Number(m)
  }
  const from = formatTime(today.opens_at)
  const to = formatTime(today.closes_at)
  if (minutes >= toMin(today.closes_at)) return { kind: 'closed_today' }
  return minutes >= toMin(today.opens_at) ? { kind: 'open', from, to } : { kind: 'later', from, to }
}

/** "120+" → 120 con sufijo "+"; "4.9" → 4.9 con 1 decimal. null si no es una cifra (se muestra tal cual). */
export function parseStat(
  text: string,
): { value: number; decimals: number; prefix: string; suffix: string } | null {
  const m = /^(\D*?)(\d+(?:[.,]\d+)?)(.*)$/.exec(text.trim())
  if (m === null) return null
  const [, prefix = '', num = '', suffix = ''] = m
  const decimals = num.includes('.') || num.includes(',') ? (num.split(/[.,]/)[1]?.length ?? 0) : 0
  return { value: Number(num.replace(',', '.')), decimals, prefix, suffix }
}

/** Imagen de site_content: un archivo del sitio ("/images/…") o una URL https (Storage). Lo demás no se usa. */
export function contentImage(url: string | undefined): string | null {
  if (url === undefined) return null
  const v = url.trim()
  if (v.startsWith('/') && !v.startsWith('//')) return v
  return v.startsWith('https://') ? v : null
}
