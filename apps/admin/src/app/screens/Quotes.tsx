// Cotizaciones (RF-Q05): lista por estado, detalle, cambio de estado (nueva → contactado → ganada / perdida) y
// notas internas. Lo que escribió el cliente no se puede cambiar (quote_requests_guard en la BD).
import { Button, Dialog, useToast } from '@atalia/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { AdminKey } from '../../i18n'
import type { Role } from '../auth'
import { TextField } from '../components/Fields'
import { useI18n } from '../i18n-context'

type Status = 'new' | 'contacted' | 'won' | 'lost'
const STATUSES: Status[] = ['new', 'contacted', 'won', 'lost']
const TONE: Record<Status, string> = {
  new: 'bg-blush',
  contacted: 'bg-sand',
  won: 'bg-sage-soft',
  lost: 'bg-dark/10',
}

interface Quote {
  id: string
  code: string
  status: Status
  customer_name: string
  customer_email: string
  customer_phone: string
  event_date: string
  event_type: string
  guests: number
  products: Array<{ name: string }>
  notes: string | null
  internal_notes: string | null
  created_at: string
}

export function Quotes({ role }: { role: Role }) {
  const { t, locale } = useI18n()
  const toast = useToast()
  const [quotes, setQuotes] = useState<Quote[] | null>(null)
  const [filter, setFilter] = useState<Status | 'all'>('new')
  const [open, setOpen] = useState<Quote | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const canEdit = role !== 'staff'
  const intl = locale === 'es' ? 'es-US' : 'en-US'
  const day = (iso: string) =>
    new Intl.DateTimeFormat(intl, { dateStyle: 'medium', timeZone: 'UTC' }).format(
      new Date(`${iso}T12:00:00Z`),
    )
  const when = (iso: string) =>
    new Intl.DateTimeFormat(intl, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('quote_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
      .returns<Quote[]>()
    if (error) toast(t('dash.error'), { tone: 'error' })
    else setQuotes(data)
  }, [t, toast])
  useEffect(() => void load(), [load])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: quotes?.length ?? 0 }
    for (const q of quotes ?? []) c[q.status] = (c[q.status] ?? 0) + 1
    return c
  }, [quotes])
  const visible = (quotes ?? []).filter((q) => filter === 'all' || q.status === filter)

  const update = async (q: Quote, patch: Partial<Pick<Quote, 'status' | 'internal_notes'>>) => {
    setSaving(true)
    const { error } = await supabase.from('quote_requests').update(patch).eq('id', q.id)
    setSaving(false)
    if (error) {
      toast(t('cat.save_error', { msg: error.message }), { tone: 'error' })
      return
    }
    toast(t('cat.saved'))
    const next = { ...q, ...patch }
    setQuotes((list) => list?.map((x) => (x.id === q.id ? next : x)) ?? null)
    setOpen(next)
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 tabIndex={-1} className="font-heading text-3xl font-bold md:text-4xl">
        {t('q.title')}
      </h1>
      <div role="radiogroup" aria-label={t('q.filter')} className="mt-5 flex flex-wrap gap-2">
        {(['all', ...STATUSES] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={filter === s}
            onClick={() => setFilter(s)}
            className={`min-h-11 rounded-full border px-4 text-sm font-medium ${filter === s ? 'border-secondary bg-secondary text-white' : 'border-dark/15 bg-white hover:border-secondary'}`}
          >
            {s === 'all' ? t('q.all') : t(`q.status.${s}` as AdminKey)}{' '}
            <span className="tabular-nums opacity-80">({counts[s] ?? 0})</span>
          </button>
        ))}
      </div>

      {quotes === null ? (
        <p role="status" className="mt-10 text-center text-muted">
          {t('cat.loading')}
        </p>
      ) : visible.length === 0 ? (
        <p className="mt-6 rounded-3xl bg-white p-8 text-center text-muted">{t('q.empty')}</p>
      ) : (
        <ul className="mt-6 grid gap-3">
          {visible.map((q) => (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(q)
                  setNotes(q.internal_notes ?? '')
                }}
                className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 text-left shadow-sm hover:ring-1 hover:ring-secondary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              >
                <span className="min-w-0">
                  <span className="font-semibold">
                    {q.code} · {q.customer_name}
                  </span>
                  <span className="block text-sm text-muted">
                    {t(`q.event.${q.event_type}` as AdminKey)} · {t('q.guests', { n: q.guests })} ·{' '}
                    {t('q.event_on', { date: day(q.event_date) })}
                  </span>
                  <span className="block text-xs text-muted">
                    {t('q.received', { date: when(q.created_at) })}
                  </span>
                </span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TONE[q.status]}`}>
                  {t(`q.status.${q.status}` as AdminKey)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open !== null && (
        <Dialog
          open
          onClose={() => setOpen(null)}
          title={t('q.detail', { code: open.code })}
          closeLabel={t('orders.close')}
          size="lg"
          footer={
            canEdit ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div role="radiogroup" aria-label={t('q.change_status')} className="flex flex-wrap gap-2">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={open.status === s}
                      disabled={saving}
                      onClick={() => void update(open, { status: s })}
                      className={`min-h-11 rounded-full border px-4 text-sm font-medium ${open.status === s ? 'border-secondary bg-secondary text-white' : 'border-dark/15 bg-white'}`}
                    >
                      {t(`q.status.${s}` as AdminKey)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">{t('q.staff_readonly')}</p>
            )
          }
        >
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted">{t('q.customer')}</dt>
              <dd className="font-semibold">{open.customer_name}</dd>
              <dd className="flex flex-wrap gap-x-3 text-sm">
                <a
                  href={`mailto:${open.customer_email}?subject=${encodeURIComponent(open.code)}`}
                  className="inline-flex min-h-11 items-center text-secondary underline"
                >
                  {t('q.reply')}
                </a>
                <a
                  href={`tel:${open.customer_phone}`}
                  className="inline-flex min-h-11 items-center text-secondary underline"
                >
                  {t('q.call')}
                </a>
                <a
                  href={`https://wa.me/${open.customer_phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex min-h-11 items-center text-secondary underline"
                >
                  {t('q.whatsapp')}
                </a>
              </dd>
              <dd className="break-all text-sm text-muted">
                {open.customer_email} · {open.customer_phone}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{t('q.event')}</dt>
              <dd className="font-semibold">{day(open.event_date)}</dd>
              <dd className="text-sm">
                {t(`q.event.${open.event_type}` as AdminKey)} · {t('q.guests', { n: open.guests })}
              </dd>
            </div>
          </dl>
          {open.products.length > 0 && (
            <>
              <h3 className="mt-5 font-semibold">{t('q.products')}</h3>
              <p className="mt-1">{open.products.map((p) => p.name).join(', ')}</p>
            </>
          )}
          {open.notes !== null && (
            <>
              <h3 className="mt-5 font-semibold">{t('q.notes')}</h3>
              <p className="mt-1 whitespace-pre-line rounded-2xl bg-sand px-4 py-3">{open.notes}</p>
            </>
          )}
          <div className="mt-5">
            {canEdit ? (
              <>
                <TextField
                  label={t('q.internal')}
                  value={notes}
                  onChange={setNotes}
                  multiline
                  maxLength={2000}
                  hint={t('q.internal_hint')}
                />
                {notes !== (open.internal_notes ?? '') && (
                  <div className="mt-2 flex justify-end">
                    <Button
                      className="!min-h-11 !py-2 text-sm"
                      loading={saving}
                      loadingLabel={t('cat.saving')}
                      onClick={() =>
                        void update(open, { internal_notes: notes.trim() === '' ? null : notes })
                      }
                    >
                      {t('q.save_notes')}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              open.internal_notes !== null && (
                <>
                  <h3 className="font-semibold">{t('q.internal')}</h3>
                  <p className="mt-1 whitespace-pre-line">{open.internal_notes}</p>
                </>
              )
            )}
          </div>
        </Dialog>
      )}
    </div>
  )
}
