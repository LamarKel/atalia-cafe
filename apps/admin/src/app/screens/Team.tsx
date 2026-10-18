// Equipo (solo la dueña): ver quién tiene acceso, invitar por correo, cambiar rol y quitar o devolver el
// acceso. Listar e invitar van por el Worker (necesitan la clave de servicio); el resto, directo con la RLS.
import { Button, Dialog, useToast } from '@atalia/ui'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { AdminKey } from '../../i18n'
import { SelectField, TextField } from '../components/Fields'
import { useI18n } from '../i18n-context'

type Role = 'owner' | 'admin' | 'staff'
interface Member {
  userId: string
  email: string
  role: Role
  displayName: string | null
  active: boolean
  lastSignInAt: string | null
  mfa: boolean
}

const API = import.meta.env.PUBLIC_API_URL.replace(/\/$/, '')

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
      ...init?.headers,
    },
  })
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } }
  if (!res.ok) throw new Error(body.error?.message ?? String(res.status))
  return body
}

export function Team({ selfEmail }: { selfEmail: string }) {
  const { t, locale } = useI18n()
  const toast = useToast()
  const [members, setMembers] = useState<Member[] | null>(null)
  const [invite, setInvite] = useState({ email: '', role: 'staff' as Role, displayName: '' })
  const [sending, setSending] = useState(false)
  const [confirm, setConfirm] = useState<Member | null>(null)
  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))

  const load = useCallback(async () => {
    try {
      setMembers((await api<{ members: Member[] }>('/admin/team')).members)
    } catch (e) {
      toast(t('t.error', { msg: e instanceof Error ? e.message : '' }), { tone: 'error' })
    }
  }, [t, toast])
  useEffect(() => void load(), [load])

  const send = async () => {
    setSending(true)
    try {
      await api('/admin/team/invite', { method: 'POST', body: JSON.stringify(invite) })
      toast(t('t.sent', { email: invite.email }))
      setInvite({ email: '', role: 'staff', displayName: '' })
      void load()
    } catch (e) {
      toast(t('t.error', { msg: e instanceof Error ? e.message : '' }), { tone: 'error' })
    } finally {
      setSending(false)
    }
  }

  const update = async (m: Member, patch: { role?: Role; active?: boolean }) => {
    const { error } = await supabase.from('admin_profiles').update(patch).eq('user_id', m.userId)
    if (error) {
      // El trigger de la BD no deja quedarse sin una dueña activa
      toast(error.message.includes('last_owner') ? t('t.last_owner') : t('t.error', { msg: error.message }), {
        tone: 'error',
      })
      return
    }
    toast(t('cat.saved'))
    setMembers((list) => list?.map((x) => (x.userId === m.userId ? { ...x, ...patch } : x)) ?? null)
  }

  const roles: Array<{ value: Role; label: string }> = [
    { value: 'owner', label: t('role.owner') },
    { value: 'admin', label: t('role.admin') },
    { value: 'staff', label: t('role.staff') },
  ]

  return (
    <div className="mx-auto max-w-4xl">
      <h1 tabIndex={-1} className="font-heading text-3xl font-bold md:text-4xl">
        {t('t.title')}
      </h1>

      <section aria-labelledby="invite-title" className="mt-6 rounded-3xl bg-white p-5 md:p-6">
        <h2 id="invite-title" className="font-heading text-xl font-bold">
          {t('t.invite')}
        </h2>
        <p className="mt-1 text-sm text-muted">{t('t.invite_hint')}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <TextField
            label={t('t.email')}
            value={invite.email}
            onChange={(v) => setInvite({ ...invite, email: v })}
            maxLength={254}
            required
          />
          <TextField
            label={t('t.name')}
            value={invite.displayName}
            onChange={(v) => setInvite({ ...invite, displayName: v })}
            maxLength={80}
          />
          <SelectField
            label={t('t.role')}
            value={invite.role}
            onChange={(v) => setInvite({ ...invite, role: v })}
            options={roles}
          />
        </div>
        <ul className="mt-3 grid gap-1 text-xs text-muted">
          {(['owner', 'admin', 'staff'] as const).map((r) => (
            <li key={r}>{t(`t.role_${r}` as AdminKey)}</li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <Button
            disabled={!/^\S+@\S+\.\S+$/.test(invite.email.trim())}
            loading={sending}
            loadingLabel={t('cat.saving')}
            onClick={() => void send()}
          >
            {t('t.send')}
          </Button>
        </div>
      </section>

      {members === null ? (
        <p role="status" className="mt-10 text-center text-muted">
          {t('cat.loading')}
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-dark/10 overflow-hidden rounded-3xl bg-white">
          {members.map((m) => {
            const self = m.email === selfEmail
            return (
              <li key={m.userId} className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {m.displayName ?? m.email}
                    {self && (
                      <span className="ml-2 rounded-full bg-sage-soft px-2 py-0.5 text-xs">{t('t.you')}</span>
                    )}
                    {!m.active && (
                      <span className="ml-2 rounded-full bg-dark/10 px-2 py-0.5 text-xs">
                        {t('t.inactive')}
                      </span>
                    )}
                  </p>
                  <p className="break-all text-sm text-muted">{m.email}</p>
                  <p className="text-xs text-muted">
                    {m.lastSignInAt === null
                      ? t('t.never')
                      : t('t.last_seen', { date: when(m.lastSignInAt) })}{' '}
                    · {m.mfa ? t('t.mfa_on') : t('t.mfa_off')}
                  </p>
                </div>
                <div className="w-44">
                  <SelectField
                    label={t('t.role')}
                    value={m.role}
                    onChange={(v) => void update(m, { role: v })}
                    options={roles}
                  />
                </div>
                {!self &&
                  (m.active ? (
                    <Button
                      variant="outline"
                      className="!min-h-11 !py-2 text-sm"
                      onClick={() => setConfirm(m)}
                    >
                      {t('t.deactivate')}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="!min-h-11 !py-2 text-sm"
                      onClick={() => void update(m, { active: true })}
                    >
                      {t('t.activate')}
                    </Button>
                  ))}
              </li>
            )
          })}
        </ul>
      )}

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={t('t.deactivate')}
        closeLabel={t('orders.close')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)}>
              {t('orders.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (confirm !== null) void update(confirm, { active: false })
                setConfirm(null)
              }}
            >
              {t('orders.confirm')}
            </Button>
          </div>
        }
      >
        <p className="mt-2">{confirm !== null && t('t.confirm_deactivate', { email: confirm.email })}</p>
      </Dialog>
    </div>
  )
}
