// Estado de publicación del sitio a partir de la fila site_publish.
export interface PublishRow {
  dirty_at: string | null
  requested_at: string | null
  last_status: 'ok' | 'error' | null
}

export type PublishState = 'up_to_date' | 'pending' | 'publishing' | 'error'

const BUILD_MINUTES = 3

export function publishState(row: PublishRow, now = Date.now()): PublishState {
  if (row.last_status === 'error' && row.requested_at === null) return 'error'
  const dirty = row.dirty_at === null ? null : Date.parse(row.dirty_at)
  const requested = row.requested_at === null ? null : Date.parse(row.requested_at)
  if (dirty !== null && (requested === null || dirty > requested)) return 'pending'
  if (requested !== null && now - requested < BUILD_MINUTES * 60_000) return 'publishing'
  return 'up_to_date'
}
