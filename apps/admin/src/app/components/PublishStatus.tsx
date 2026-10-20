// Estado de publicación del sitio (site_publish): lo que se edita en el panel se publica solo en ~1 minuto;
// la dueña o un admin también pueden "Publicar ahora". El sitio tarda 1–2 minutos más en compilar.
import { useCallback, useEffect, useState } from 'react'
import { workerApi } from '../../lib/api'
import { publishState, type PublishRow as Row } from '../../lib/publish'
import { supabase } from '../../lib/supabase'
import { useI18n } from '../i18n-context'

const POLL_MS = 20_000

export function PublishStatus(props: { canPublish: boolean }) {
  const { t } = useI18n()
  const [row, setRow] = useState<Row | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('site_publish')
      .select('dirty_at, requested_at, last_status')
      .maybeSingle<Row>()
    setRow(data)
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  if (row === null) return null
  const state = publishState(row)

  const publish = async () => {
    setBusy(true)
    setError(null)
    try {
      await workerApi('/admin/publish', { method: 'POST' })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pub.error'))
    } finally {
      setBusy(false)
      void load()
    }
  }

  const dot = {
    up_to_date: 'bg-primary-ink',
    pending: 'bg-toast-warning',
    publishing: 'bg-secondary motion-safe:animate-pulse',
    error: 'bg-toast-error',
  }[state]

  return (
    <div className="mx-3 mb-2 grid gap-2 rounded-2xl bg-accent p-3">
      <p className="flex items-center gap-2 text-sm font-medium" role="status">
        <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${dot}`} />
        {t(`pub.${state}`)}
      </p>
      {state === 'pending' && <p className="text-xs text-muted">{t('pub.pending_hint')}</p>}
      {state === 'publishing' && <p className="text-xs text-muted">{t('pub.publishing_hint')}</p>}
      {props.canPublish && (state === 'pending' || state === 'error') && (
        <button
          type="button"
          onClick={() => void publish()}
          disabled={busy}
          className="min-h-11 rounded-full bg-secondary px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? t('pub.publishing') : t('pub.now')}
        </button>
      )}
      {error !== null && (
        <p className="text-xs text-toast-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
