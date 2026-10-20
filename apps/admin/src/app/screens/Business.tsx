// Negocio (fase 4): horario semanal, días cerrados, cupos por día y tipo, tienda y puntos de recogida,
// contacto y redes, textos del sitio y reglas de negocio.
import { Button, useToast } from '@atalia/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addClosedDay,
  CAPACITY_CATEGORIES,
  getCapacity,
  getClosedDays,
  getHours,
  getPickups,
  getRuleRows,
  getSettings,
  getSiteTexts,
  getStore,
  removeClosedDay,
  saveCapacity,
  saveHours,
  savePickup,
  saveSettings,
  saveSiteText,
  saveStore,
  type CapacityRule,
  type ClosedDay,
  type DayHours,
  type PickupPoint,
  type Settings,
  type SiteText,
  type Store,
} from '../../lib/business'
import type { StoredRule } from '@atalia/shared/rules'
import type { AdminKey } from '../../i18n'
import type { Role } from '../auth'
import { FormCard, inputClass, NumberField, Switch, TextField } from '../components/Fields'
import { useI18n } from '../i18n-context'
import { RulesEditor } from './RulesEditor'

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

type Tab = 'hours' | 'closed' | 'capacity' | 'store' | 'texts' | 'rules'
const TABS: Array<{ key: Tab; label: AdminKey }> = [
  { key: 'hours', label: 'biz.tab_hours' },
  { key: 'closed', label: 'biz.tab_closed' },
  { key: 'capacity', label: 'biz.tab_capacity' },
  { key: 'store', label: 'biz.tab_store' },
  { key: 'texts', label: 'biz.tab_texts' },
  { key: 'rules', label: 'biz.tab_rules' },
]

function useSaver() {
  const { t } = useI18n()
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setSaving(true)
      try {
        await fn()
        toast(t('cat.saved'))
        return true
      } catch (e) {
        toast(t('cat.save_error', { msg: e instanceof Error ? e.message : '' }), { tone: 'error' })
        return false
      } finally {
        setSaving(false)
      }
    },
    [t, toast],
  )
  return { saving, run }
}

export function Business({ role }: { role: Role }) {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('hours')
  const [store, setStore] = useState<Store | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    getStore().then(setStore, () => setFailed(true))
  }, [])

  return (
    <div className="mx-auto max-w-5xl">
      <h1 tabIndex={-1} className="font-heading text-3xl font-bold md:text-4xl">
        {t('biz.title')}
      </h1>
      <div
        role="tablist"
        aria-label={t('biz.title')}
        className="mt-5 flex gap-1 overflow-x-auto rounded-full bg-white p-1"
      >
        {TABS.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={tab === x.key}
            onClick={() => setTab(x.key)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-medium ${tab === x.key ? 'bg-secondary text-white' : 'text-dark hover:bg-dark/5'}`}
          >
            {t(x.label)}
          </button>
        ))}
      </div>
      {failed && (
        <p role="alert" className="mt-6 rounded-2xl bg-blush px-4 py-3 text-sm">
          {t('dash.error')}
        </p>
      )}
      {store === null ? (
        !failed && (
          <p role="status" className="mt-10 text-center text-muted">
            {t('cat.loading')}
          </p>
        )
      ) : (
        <div className="mt-6">
          {tab === 'hours' && <Hours storeId={store.id} />}
          {tab === 'closed' && <Closed storeId={store.id} />}
          {tab === 'capacity' && <Capacity storeId={store.id} />}
          {tab === 'store' && <StoreTab store={store} onSaved={setStore} />}
          {tab === 'texts' && <Texts />}
          {tab === 'rules' && <Rules storeId={store.id} role={role} />}
        </div>
      )}
    </div>
  )
}

function Hours({ storeId }: { storeId: string }) {
  const { t } = useI18n()
  const { saving, run } = useSaver()
  const [days, setDays] = useState<DayHours[] | null>(null)
  useEffect(() => void getHours(storeId).then(setDays), [storeId])
  if (days === null)
    return (
      <p role="status" className="text-muted">
        {t('cat.loading')}
      </p>
    )
  const invalid = days.some((d) => d.open && d.closesAt <= d.opensAt)
  const update = (i: number, patch: Partial<DayHours>) =>
    setDays(days.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  // Lunes primero, como se lee un horario
  const order = [1, 2, 3, 4, 5, 6, 0]
  return (
    <FormCard title={t('biz.tab_hours')} hint={t('biz.hours_hint')}>
      <ul className="divide-y divide-dark/10">
        {order.map((w) => {
          const i = days.findIndex((d) => d.weekday === w)
          const d = days[i]
          if (d === undefined) return null
          const dayName = t(`day.${String(w)}` as AdminKey)
          return (
            <li key={w} className="grid gap-3 py-3 md:grid-cols-[8rem_12rem_1fr] md:items-center">
              <p className="font-semibold">{dayName}</p>
              <Switch label={t('biz.open')} checked={d.open} onChange={(v) => update(i, { open: v })} />
              {d.open ? (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    {t('biz.opens')}
                    <input
                      type="time"
                      value={d.opensAt}
                      onChange={(e) => update(i, { opensAt: e.target.value })}
                      className={`${inputClass} mt-0 w-36 border-dark/15`}
                      aria-label={`${dayName}: ${t('biz.opens')}`}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    {t('biz.closes')}
                    <input
                      type="time"
                      value={d.closesAt}
                      onChange={(e) => update(i, { closesAt: e.target.value })}
                      aria-invalid={d.closesAt <= d.opensAt}
                      className={`${inputClass} mt-0 w-36 ${d.closesAt <= d.opensAt ? 'border-toast-error' : 'border-dark/15'}`}
                      aria-label={`${dayName}: ${t('biz.closes')}`}
                    />
                  </label>
                </div>
              ) : (
                <p className="text-sm text-muted">{t('biz.closed')}</p>
              )}
            </li>
          )
        })}
      </ul>
      {invalid && (
        <p role="alert" className="mt-3 text-sm text-toast-error">
          {t('biz.hours_invalid')}
        </p>
      )}
      <div className="mt-4 flex justify-end">
        <Button
          disabled={invalid}
          loading={saving}
          loadingLabel={t('cat.saving')}
          onClick={() => void run(() => saveHours(storeId, days))}
        >
          {t('cat.save')}
        </Button>
      </div>
    </FormCard>
  )
}

function Closed({ storeId }: { storeId: string }) {
  const { t, locale } = useI18n()
  const { saving, run } = useSaver()
  const [days, setDays] = useState<ClosedDay[] | null>(null)
  const [draft, setDraft] = useState<ClosedDay>({ date: '', reasonEn: '', reasonEs: '' })
  const load = useCallback(() => void getClosedDays(storeId).then(setDays), [storeId])
  useEffect(load, [load])
  const fmt = (d: string) =>
    new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', {
      dateStyle: 'full',
      timeZone: 'UTC',
    }).format(new Date(`${d}T12:00:00Z`))
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div className="grid gap-4">
      <FormCard title={t('biz.add_closed')} hint={t('biz.closed_hint')}>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label htmlFor="closed-date" className="text-sm font-medium">
              {t('biz.closed_date')}
            </label>
            <input
              id="closed-date"
              type="date"
              min={today}
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              className={`${inputClass} border-dark/15`}
            />
          </div>
          <TextField
            label={t('biz.reason_es')}
            value={draft.reasonEs ?? ''}
            onChange={(v) => setDraft({ ...draft, reasonEs: v })}
            maxLength={100}
          />
          <TextField
            label={t('biz.reason_en')}
            value={draft.reasonEn ?? ''}
            onChange={(v) => setDraft({ ...draft, reasonEn: v })}
            maxLength={100}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            disabled={draft.date === ''}
            loading={saving}
            loadingLabel={t('cat.saving')}
            onClick={() =>
              void run(() =>
                addClosedDay(storeId, {
                  date: draft.date,
                  reasonEn: draft.reasonEn || null,
                  reasonEs: draft.reasonEs || null,
                }),
              ).then((ok) => {
                if (ok) {
                  setDraft({ date: '', reasonEn: '', reasonEs: '' })
                  load()
                }
              })
            }
          >
            {t('biz.add_closed')}
          </Button>
        </div>
      </FormCard>
      <section className="rounded-3xl bg-white p-5 md:p-6">
        {days === null ? (
          <p role="status" className="text-muted">
            {t('cat.loading')}
          </p>
        ) : days.length === 0 ? (
          <p className="text-muted">{t('biz.no_closed')}</p>
        ) : (
          <ul className="divide-y divide-dark/10">
            {days.map((d) => (
              <li key={d.date} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">{capitalize(fmt(d.date))}</p>
                  {(d.reasonEs ?? d.reasonEn) !== null && (
                    <p className="text-sm text-muted">
                      {locale === 'es' ? (d.reasonEs ?? d.reasonEn) : (d.reasonEn ?? d.reasonEs)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void run(() => removeClosedDay(storeId, d.date)).then(load)}
                  className="min-h-11 px-3 text-sm font-medium text-secondary underline"
                  aria-label={t('biz.remove_day', { date: fmt(d.date) })}
                >
                  {t('biz.remove')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Capacity({ storeId }: { storeId: string }) {
  const { t } = useI18n()
  const { saving, run } = useSaver()
  const [rules, setRules] = useState<CapacityRule[] | null>(null)
  useEffect(() => {
    void getCapacity(storeId).then((existing) => {
      const all: CapacityRule[] = []
      for (let w = 0; w < 7; w++)
        for (const c of CAPACITY_CATEGORIES)
          all.push(
            existing.find((r) => r.weekday === w && r.category === c) ?? {
              weekday: w,
              category: c,
              perSlot: null,
              perDay: null,
            },
          )
      setRules(all)
    })
  }, [storeId])
  if (rules === null)
    return (
      <p role="status" className="text-muted">
        {t('cat.loading')}
      </p>
    )
  const set = (w: number, c: string, patch: Partial<CapacityRule>) =>
    setRules(rules.map((r) => (r.weekday === w && r.category === c ? { ...r, ...patch } : r)))
  const order = [1, 2, 3, 4, 5, 6, 0]
  return (
    <FormCard title={t('biz.tab_capacity')} hint={t('biz.capacity_hint')}>
      <div className="grid gap-4">
        {order.map((w) => (
          <fieldset key={w} className="rounded-2xl border border-dark/10 p-3 md:p-4">
            <legend className="px-1 font-semibold">{t(`day.${String(w)}` as AdminKey)}</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {CAPACITY_CATEGORIES.map((c) => {
                const r = rules.find((x) => x.weekday === w && x.category === c)
                if (r === undefined) return null
                return (
                  <div key={c} className="rounded-xl bg-accent/60 p-3">
                    <p className="text-sm font-semibold">{t(`type.${c}` as AdminKey)}</p>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <NumberField
                        label={t('biz.per_slot')}
                        value={r.perSlot}
                        onChange={(v) => set(w, c, { perSlot: v })}
                        min={0}
                      />
                      <NumberField
                        label={t('biz.per_day')}
                        value={r.perDay}
                        onChange={(v) => set(w, c, { perDay: v })}
                        min={0}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          loading={saving}
          loadingLabel={t('cat.saving')}
          onClick={() => void run(() => saveCapacity(storeId, rules))}
        >
          {t('cat.save')}
        </Button>
      </div>
    </FormCard>
  )
}

function StoreTab({ store, onSaved }: { store: Store; onSaved: (s: Store) => void }) {
  const { t, locale } = useI18n()
  const { saving, run } = useSaver()
  const [s, setS] = useState(store)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [pickups, setPickups] = useState<PickupPoint[] | null>(null)
  const loadPickups = useCallback(() => void getPickups(store.id).then(setPickups), [store.id])
  useEffect(() => {
    void getSettings().then(setSettings)
    loadPickups()
  }, [loadPickups])
  const nul = (v: string) => (v.trim() === '' ? null : v.trim())
  const num = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v))
  return (
    <div className="grid gap-4">
      <FormCard title={t('biz.store_data')}>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            label={t('biz.store_name')}
            value={s.name}
            onChange={(v) => setS({ ...s, name: v })}
            maxLength={100}
          />
          <TextField
            label={t('biz.phone')}
            value={s.phone ?? ''}
            onChange={(v) => setS({ ...s, phone: nul(v) })}
            maxLength={30}
          />
          <TextField
            label={t('biz.address')}
            value={s.address ?? ''}
            onChange={(v) => setS({ ...s, address: nul(v) })}
            maxLength={200}
          />
          <TextField
            label={t('biz.city')}
            value={s.city ?? ''}
            onChange={(v) => setS({ ...s, city: nul(v) })}
            maxLength={80}
          />
          <TextField
            label={t('biz.state')}
            value={s.state ?? ''}
            onChange={(v) => setS({ ...s, state: nul(v) })}
            maxLength={40}
          />
          <TextField
            label={t('biz.zip')}
            value={s.zipCode ?? ''}
            onChange={(v) => setS({ ...s, zipCode: nul(v) })}
            maxLength={12}
          />
          <TextField
            label={t('biz.lat')}
            value={s.lat === null ? '' : String(s.lat)}
            onChange={(v) => setS({ ...s, lat: num(v) })}
            hint={t('biz.coords_hint')}
          />
          <TextField
            label={t('biz.lng')}
            value={s.lng === null ? '' : String(s.lng)}
            onChange={(v) => setS({ ...s, lng: num(v) })}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            loading={saving}
            loadingLabel={t('cat.saving')}
            onClick={() => void run(() => saveStore(s)).then((ok) => ok && onSaved(s))}
          >
            {t('cat.save')}
          </Button>
        </div>
      </FormCard>

      {settings !== null && (
        <FormCard title={t('biz.contact')}>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label={t('biz.business_name')}
              value={settings.businessName}
              onChange={(v) => setSettings({ ...settings, businessName: v })}
              maxLength={100}
            />
            <TextField
              label={t('biz.email')}
              value={settings.email ?? ''}
              onChange={(v) => setSettings({ ...settings, email: nul(v) })}
              maxLength={254}
            />
            <TextField
              label={t('biz.phone')}
              value={settings.phone ?? ''}
              onChange={(v) => setSettings({ ...settings, phone: nul(v) })}
              maxLength={30}
            />
            <TextField
              label={t('biz.whatsapp')}
              value={settings.whatsapp ?? ''}
              onChange={(v) => setSettings({ ...settings, whatsapp: nul(v) })}
              hint={t('biz.whatsapp_hint')}
              inputMode="numeric"
              maxLength={20}
            />
            <TextField
              label={t('biz.instagram')}
              value={settings.instagram ?? ''}
              onChange={(v) => setSettings({ ...settings, instagram: nul(v) })}
              maxLength={200}
            />
            <TextField
              label={t('biz.facebook')}
              value={settings.facebook ?? ''}
              onChange={(v) => setSettings({ ...settings, facebook: nul(v) })}
              maxLength={200}
            />
            <TextField
              label={t('biz.tiktok')}
              value={settings.tiktok ?? ''}
              onChange={(v) => setSettings({ ...settings, tiktok: nul(v) })}
              maxLength={200}
            />
            <TextField
              label={t('biz.x')}
              value={settings.x ?? ''}
              onChange={(v) => setSettings({ ...settings, x: nul(v) })}
              maxLength={200}
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              loading={saving}
              loadingLabel={t('cat.saving')}
              onClick={() => void run(() => saveSettings(settings))}
            >
              {t('cat.save')}
            </Button>
          </div>
        </FormCard>
      )}

      <FormCard
        title={t('biz.pickups')}
        hint={t('biz.pickups_hint')}
        action={
          <Button
            variant="outline"
            className="!min-h-11 !py-2 text-sm"
            onClick={() =>
              setPickups((p) => [
                ...(p ?? []),
                {
                  id: '',
                  nameEn: '',
                  nameEs: '',
                  descriptionEn: '',
                  descriptionEs: '',
                  icon: 'store',
                  sortOrder: (p?.at(-1)?.sortOrder ?? 0) + 1,
                  active: true,
                },
              ])
            }
          >
            + {t('biz.new_pickup')}
          </Button>
        }
      >
        <ul className="grid gap-3">
          {(pickups ?? []).map((p, i) => (
            <li key={p.id || `new-${String(i)}`} className="rounded-2xl border border-dark/10 p-3 md:p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <TextField
                  label={t('f.name_es')}
                  value={p.nameEs ?? ''}
                  onChange={(v) =>
                    setPickups(pickups?.map((x, j) => (j === i ? { ...x, nameEs: v } : x)) ?? null)
                  }
                  maxLength={100}
                />
                <TextField
                  label={t('f.name_en')}
                  value={p.nameEn}
                  onChange={(v) =>
                    setPickups(pickups?.map((x, j) => (j === i ? { ...x, nameEn: v } : x)) ?? null)
                  }
                  maxLength={100}
                />
                <TextField
                  label={t('f.desc_es')}
                  value={p.descriptionEs ?? ''}
                  onChange={(v) =>
                    setPickups(pickups?.map((x, j) => (j === i ? { ...x, descriptionEs: v } : x)) ?? null)
                  }
                  maxLength={200}
                />
                <TextField
                  label={t('f.desc_en')}
                  value={p.descriptionEn ?? ''}
                  onChange={(v) =>
                    setPickups(pickups?.map((x, j) => (j === i ? { ...x, descriptionEn: v } : x)) ?? null)
                  }
                  maxLength={200}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <Switch
                  label={t('cat.visible')}
                  checked={p.active}
                  onChange={(v) =>
                    setPickups(pickups?.map((x, j) => (j === i ? { ...x, active: v } : x)) ?? null)
                  }
                />
                <Button
                  className="!min-h-11 !py-2 text-sm"
                  loading={saving}
                  loadingLabel={t('cat.saving')}
                  disabled={p.nameEn.trim().length < 2}
                  onClick={() =>
                    void run(() =>
                      savePickup(store.id, {
                        ...p,
                        nameEs: nul(p.nameEs ?? ''),
                        descriptionEn: nul(p.descriptionEn ?? ''),
                        descriptionEs: nul(p.descriptionEs ?? ''),
                      }),
                    ).then((ok) => ok && loadPickups())
                  }
                >
                  {t('cat.save')} · {locale === 'es' ? (p.nameEs ?? p.nameEn) : p.nameEn}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </FormCard>
    </div>
  )
}

function Texts() {
  const { t } = useI18n()
  const { saving, run } = useSaver()
  const [texts, setTexts] = useState<SiteText[] | null>(null)
  const [saved, setSaved] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  useEffect(() => {
    void getSiteTexts().then((list) => {
      setTexts(list)
      setSaved(Object.fromEntries(list.map((x) => [x.key, JSON.stringify(x)])))
    })
  }, [])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (texts ?? []).filter((x) => q === '' || `${x.key} ${x.es} ${x.en}`.toLowerCase().includes(q))
  }, [texts, query])
  if (texts === null)
    return (
      <p role="status" className="text-muted">
        {t('cat.loading')}
      </p>
    )
  // Agrupa por la primera parte de la clave: home, catering, footer…
  const groups = [...new Set(visible.map((x) => x.key.split('.')[0] ?? ''))]
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">{t('biz.texts_hint')}</p>
      <label className="block md:w-80">
        <span className="sr-only">{t('biz.texts_search')}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('biz.texts_search')}
          className="block min-h-11 w-full rounded-full border border-dark/15 bg-white px-4"
        />
      </label>
      {groups.map((g) => (
        <section key={g} className="rounded-3xl bg-white p-5 md:p-6">
          <h2 className="font-heading text-xl font-bold capitalize">{g}</h2>
          <ul className="mt-3 divide-y divide-dark/10">
            {visible
              .filter((x) => x.key.split('.')[0] === g)
              .map((x) => {
                const dirty = saved[x.key] !== JSON.stringify(x)
                const update = (patch: Partial<SiteText>) =>
                  setTexts(texts.map((y) => (y.key === x.key ? { ...y, ...patch } : y)))
                const long = x.es.length > 60 || x.en.length > 60
                return (
                  <li key={x.key} className="py-4">
                    <p className="font-mono text-xs text-muted">{x.key}</p>
                    <div className="mt-1 grid gap-3 md:grid-cols-2">
                      <TextField
                        label={t('biz.text_es')}
                        value={x.es}
                        onChange={(v) => update({ es: v })}
                        multiline={long}
                      />
                      <TextField
                        label={t('biz.text_en')}
                        value={x.en}
                        onChange={(v) => update({ en: v })}
                        multiline={long}
                      />
                    </div>
                    {dirty && (
                      <div className="mt-2 flex justify-end">
                        <Button
                          className="!min-h-11 !py-2 text-sm"
                          loading={saving}
                          loadingLabel={t('cat.saving')}
                          onClick={() =>
                            void run(() => saveSiteText(x)).then(
                              (ok) => ok && setSaved((s) => ({ ...s, [x.key]: JSON.stringify(x) })),
                            )
                          }
                        >
                          {t('cat.save')}
                        </Button>
                      </div>
                    )}
                  </li>
                )
              })}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Rules({ storeId, role }: { storeId: string; role: Role }) {
  const { t } = useI18n()
  const [rows, setRows] = useState<StoredRule[] | null>(null)
  const load = useCallback(() => void getRuleRows().then(setRows), [])
  useEffect(load, [load])
  if (rows === null)
    return (
      <p role="status" className="text-muted">
        {t('cat.loading')}
      </p>
    )
  return <RulesEditor rows={rows} storeId={storeId} role={role} onSaved={load} />
}
