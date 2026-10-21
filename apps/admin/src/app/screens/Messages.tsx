// Mensajes del formulario de Contacto: lista por estado, detalle y cambio de estado (nuevo → respondido →
// archivado). Lo que escribió el cliente no se puede cambiar (contact_messages_guard en la BD).
import { getRule } from '@atalia/shared/rules'
import { Dialog, useToast } from '@atalia/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getRuleRows } from '../../lib/business'
import { supabase } from '../../lib/supabase'
import type { AdminKey } from '../../i18n'
import type { Role } from '../auth'
import { useI18n } from '../i18n-context'

type Status = 'new' | 'answered' | 'archived'
const STATUSES: Status[] = ['new', 'answered', 'archived']
const TONE: Record<Status, string> = {
  new: 'bg-blush',
  answered: 'bg-sage-soft',
  archived: 'bg-dark/10',
}

interface Message {
  id: string
  code: string
  status: Status
  name: string
  email: string
  phone: string | null
  topic: string
  message: string
  created_at: string
}

export function Messages({ role }: { role: Role }) {
  const { t, locale } = useI18n()
  const toast = useToast()
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [filter, setFilter] = useState<Status | 'all'>('new')
  const [open, setOpen] = useState<Message | null>(null)
  const [saving, setSaving] = useState(false)
  const [noRecipients, setNoRecipients] = useState(false)
  const canEdit = role !== 'staff'
  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('contact_messages')
      .select('id, code, status, name, email, phone, topic, message, created_at')
      .order('created_at', { ascending: false })
      .limit(200)
      .returns<Message[]>()
    if (error) toast(t('dash.error'), { tone: 'error' })
    else setMessages(data)
  }, [t, toast])
  useEffect(() => void load(), [load])

  // Aviso si nadie recibe los mensajes por correo (solo quedan aquí).
  useEffect(() => {
    if (!canEdit) return
    void getRuleRows()
      .then((rows) => {
        setNoRecipients(getRule('notifications.contact_recipients', rows, { storeId: '' }).length === 0)
      })
      .catch(() => undefined)
  }, [canEdit])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: messages?.length ?? 0 }
    for (const m of messages ?? []) c[m.status] = (c[m.status] ?? 0) + 1
    return c
  }, [messages])
  const visible = (messages ?? []).filter((m) => filter === 'all' || m.status === filter)

  const setStatus = async (m: Message, status: Status) => {
    setSaving(true)
    const { error } = await supabase.from('contact_messages').update({ status }).eq('id', m.id)
    setSaving(false)
    if (error) {
      toast(t('cat.save_error', { msg: error.message }), { tone: 'error' })
      return
    }
    toast(t('cat.saved'))
    const next = { ...m, status }
    setMessages((list) => list?.map((x) => (x.id === m.id ? next : x)) ?? null)
    setOpen(next)
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 tabIndex={-1} className="font-heading text-3xl font-bold md:text-4xl">
        {t('msg.title')}
      </h1>
      <p className="mt-2 text-muted">{t('msg.intro')}</p>
      {noRecipients && (
        <p role="status" className="mt-4 rounded-2xl bg-sand px-4 py-3 text-sm">
          {t('msg.no_recipients')}
        </p>
      )}
      <div role="radiogroup" aria-label={t('msg.filter')} className="mt-5 flex flex-wrap gap-2">
        {(['all', ...STATUSES] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={filter === s}
            onClick={() => setFilter(s)}
            className={`min-h-11 rounded-full border px-4 text-sm font-medium ${filter === s ? 'border-secondary bg-secondary text-white' : 'border-dark/15 bg-white hover:border-secondary'}`}
          >
            {s === 'all' ? t('msg.all') : t(`msg.status.${s}` as AdminKey)}{' '}
            <span className="tabular-nums opacity-80">({counts[s] ?? 0})</span>
          </button>
        ))}
      </div>

      {messages === null ? (
        <p role="status" className="mt-10 text-center text-muted">
          {t('cat.loading')}
        </p>
      ) : visible.length === 0 ? (
        <p className="mt-6 rounded-3xl bg-white p-8 text-center text-muted">{t('msg.empty')}</p>
      ) : (
        <ul className="mt-6 grid gap-3">
          {visible.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setOpen(m)}
                className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 text-left shadow-sm hover:ring-1 hover:ring-secondary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">
                    {m.name} · {t(`msg.topic.${m.topic}` as AdminKey)}
                  </span>
                  <span className="block truncate text-sm text-muted">{m.message}</span>
                  <span className="block text-xs text-muted">
                    {m.code} · {t('msg.received', { date: when(m.created_at) })}
                  </span>
                </span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TONE[m.status]}`}>
                  {t(`msg.status.${m.status}` as AdminKey)}
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
          title={t('msg.detail', { code: open.code })}
          closeLabel={t('orders.close')}
          size="lg"
          footer={
            canEdit ? (
              <div role="radiogroup" aria-label={t('msg.change_status')} className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={open.status === s}
                    disabled={saving}
                    onClick={() => void setStatus(open, s)}
                    className={`min-h-11 rounded-full border px-4 text-sm font-medium ${open.status === s ? 'border-secondary bg-secondary text-white' : 'border-dark/15 bg-white'}`}
                  >
                    {t(`msg.status.${s}` as AdminKey)}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">{t('msg.staff_readonly')}</p>
            )
          }
        >
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted">{t('msg.from')}</dt>
              <dd className="font-semibold">{open.name}</dd>
              <dd className="break-all text-sm text-muted">
                {open.email}
                {open.phone !== null && ` · ${open.phone}`}
              </dd>
              <dd className="flex flex-wrap gap-x-3 text-sm">
                <a
                  href={`mailto:${open.email}?subject=${encodeURIComponent(`Atalia Café · ${open.code}`)}`}
                  className="inline-flex min-h-11 items-center text-secondary underline"
                >
                  {t('msg.reply')}
                </a>
                {open.phone !== null && (
                  <a
                    href={`tel:${open.phone}`}
                    className="inline-flex min-h-11 items-center text-secondary underline"
                  >
                    {t('msg.call')}
                  </a>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{t('msg.topic')}</dt>
              <dd className="font-semibold">{t(`msg.topic.${open.topic}` as AdminKey)}</dd>
              <dd className="text-sm text-muted">{when(open.created_at)}</dd>
            </div>
          </dl>
          <h3 className="mt-5 font-semibold">{t('msg.message')}</h3>
          <p className="mt-1 whitespace-pre-line break-words rounded-2xl bg-sand px-4 py-3">{open.message}</p>
        </Dialog>
      )}
    </div>
  )
}
