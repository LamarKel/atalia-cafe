// Archivo .ics para "Agregar al calendario" (pantalla 06). Se genera en el navegador con los datos del pedido.
const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
const escapeText = (s: string) => s.replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n')

export function pickupIcs(input: {
  code: string
  title: string
  startsAt: string
  durationMinutes: number
  location: string | null
  now?: Date
}): string {
  const start = new Date(input.startsAt)
  const end = new Date(start.getTime() + input.durationMinutes * 60_000)
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Atalia Cafe//Pedidos//ES',
    'BEGIN:VEVENT',
    `UID:${input.code}@atalia.cafe`,
    `DTSTAMP:${stamp(input.now ?? new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeText(input.title)}`,
    ...(input.location === null ? [] : [`LOCATION:${escapeText(input.location)}`]),
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}
