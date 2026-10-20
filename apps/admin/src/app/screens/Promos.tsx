// Promociones: cupones de descuento (porcentaje o monto fijo, mínimo de compra, usos, fechas). Se validan con
// el esquema de packages/shared/promos, el mismo que usará el Worker al aplicarlos.
import { cents, formatPpm, formatUSD, ppm } from '@atalia/shared/money'
import { promoDraftSchema, promoState, type PromoDraftInput } from '@atalia/shared/promos'
import { Button, Dialog, useToast } from '@atalia/ui'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { AdminKey } from '../../i18n'
import { inputClass, MoneyField, NumberField, SelectField, Switch, TextField } from '../components/Fields'
import { useI18n } from '../i18n-context'

interface PromoRow {
  id: string
  code: string
  description: string | null
  discount_type: 'percentage' | 'fixed'
  discount_ppm: number | null
  discount_cents: number | null
  min_order_cents: number
  max_uses: number | null
  max_uses_per_customer: number | null
  used_count: number
  applies_to_catering: boolean
  starts_at: string | null
  expires_at: string | null
  active: boolean
}

const STATE_TONE = {
  active: 'bg-sage-soft',
  inactive: 'bg-dark/10',
  scheduled: 'bg-sand',
  expired: 'bg-blush',
  used_up: 'bg-blush',
} as const

const toDraft = (r: PromoRow): PromoDraftInput => ({
  id: r.id,
  code: r.code,
  description: r.description ?? '',
  discountType: r.discount_type,
  discountPpm: r.discount_ppm,
  discountCents: r.discount_cents,
  minOrderCents: r.min_order_cents,
  maxUses: r.max_uses,
  maxUsesPerCustomer: r.max_uses_per_customer,
  appliesToCatering: r.applies_to_catering,
  startsAt: r.starts_at,
  expiresAt: r.expires_at,
  active: r.active,
})

const empty: PromoDraftInput = {
  id: null,
  code: '',
  description: '',
  discountType: 'percentage',
  discountPpm: 100_000,
  discountCents: null,
  minOrderCents: 0,
  maxUses: null,
  maxUsesPerCustomer: 1,
  appliesToCatering: true,
  startsAt: null,
  expiresAt: null,
  active: true,
}

/** Fecha del calendario → inicio (o fin) de ese día en la hora del navegador, como ISO. */
const dayToIso = (d: string, end: boolean) =>
  d === '' ? null : new Date(`${d}T${end ? '23:59:59' : '00:00:00'}`).toISOString()
const isoToDay = (iso: string | null | undefined) => {
  if (iso == null) return ''
  const d = new Date(iso)
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function Promos() {
  const { t, locale } = useI18n()
  const toast = useToast()
  const [rows, setRows] = useState<PromoRow[] | null>(null)
  const [edit, setEdit] = useState<PromoDraftInput | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const usd = (v: number) => formatUSD(cents(v), locale)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('promo_codes')
      .select('*')
      .order('created_at', { ascending: false })
      .returns<PromoRow[]>()
    if (error) toast(t('dash.error'), { tone: 'error' })
    else setRows(data)
  }, [t, toast])
  useEffect(() => void load(), [load])

  const save = async () => {
    if (edit === null) return
    const parsed = promoDraftSchema.safeParse(edit)
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [i.path.join('.'), t(`p.${i.message}` as AdminKey)]),
        ),
      )
      return
    }
    setErrors({})
    const p = parsed.data
    const row = {
      code: p.code,
      description: p.description,
      discount_type: p.discountType,
      discount_ppm: p.discountType === 'percentage' ? p.discountPpm : null,
      discount_cents: p.discountType === 'fixed' ? p.discountCents : null,
      min_order_cents: p.minOrderCents,
      max_uses: p.maxUses,
      max_uses_per_customer: p.maxUsesPerCustomer,
      applies_to_catering: p.appliesToCatering,
      starts_at: p.startsAt,
      expires_at: p.expiresAt,
      active: p.active,
    }
    setSaving(true)
    const { error } =
      p.id === null
        ? await supabase.from('promo_codes').insert(row)
        : await supabase.from('promo_codes').update(row).eq('id', p.id)
    setSaving(false)
    if (error) {
      toast(t('cat.save_error', { msg: error.code === '23505' ? p.code : error.message }), { tone: 'error' })
      return
    }
    toast(t('cat.saved'))
    setEdit(null)
    void load()
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 tabIndex={-1} className="font-heading text-3xl font-bold md:text-4xl">
          {t('p.title')}
        </h1>
        <Button onClick={() => setEdit(empty)}>+ {t('p.new')}</Button>
      </div>
      <p className="mt-3 rounded-2xl bg-sand px-4 py-3 text-sm">{t('p.how_it_works')}</p>

      {rows === null ? (
        <p role="status" className="mt-10 text-center text-muted">
          {t('cat.loading')}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded-3xl bg-white p-8 text-center text-muted">{t('p.empty')}</p>
      ) : (
        <ul className="mt-6 grid gap-3 md:grid-cols-2">
          {rows.map((r) => {
            const state = promoState({
              active: r.active,
              startsAt: r.starts_at,
              expiresAt: r.expires_at,
              maxUses: r.max_uses,
              usedCount: r.used_count,
            })
            const value =
              r.discount_type === 'percentage' && r.discount_ppm !== null
                ? formatPpm(ppm(r.discount_ppm))
                : usd(r.discount_cents ?? 0)
            return (
              <li key={r.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono text-lg font-bold tracking-wide">{r.code}</p>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATE_TONE[state]}`}>
                    {t((state === 'used_up' ? 'p.expired' : `p.${state}`) as AdminKey)}
                  </span>
                </div>
                <p className="mt-1">
                  {t('p.off', { value })}
                  {r.min_order_cents > 0 && ` · ${t('p.min', { value: usd(r.min_order_cents) })}`}
                </p>
                <p className="text-sm text-muted">
                  {r.max_uses === null
                    ? t('p.used', { n: r.used_count })
                    : t('p.used_of', { n: r.used_count, max: r.max_uses })}
                  {r.description !== null && ` · ${r.description}`}
                </p>
                <div className="mt-3 flex justify-end">
                  <Button
                    variant="outline"
                    className="!min-h-11 !py-2 text-sm"
                    onClick={() => setEdit(toDraft(r))}
                  >
                    {t('cat.edit')}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {edit !== null && (
        <Dialog
          open
          onClose={() => setEdit(null)}
          title={edit.id === null ? t('p.new') : String(edit.code)}
          closeLabel={t('orders.close')}
          size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEdit(null)}>
                {t('orders.cancel')}
              </Button>
              <Button loading={saving} loadingLabel={t('cat.saving')} onClick={() => void save()}>
                {t('cat.save')}
              </Button>
            </div>
          }
        >
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <TextField
              label={t('p.code')}
              value={String(edit.code)}
              onChange={(v) => setEdit({ ...edit, code: v.toUpperCase().replace(/\s/g, '') })}
              hint={t('p.code_hint')}
              error={errors.code ?? null}
              maxLength={30}
            />
            <TextField
              label={t('p.description')}
              value={edit.description ?? ''}
              onChange={(v) => setEdit({ ...edit, description: v })}
              maxLength={200}
            />
            <SelectField
              label={t('p.type')}
              value={edit.discountType}
              onChange={(v) => setEdit({ ...edit, discountType: v })}
              options={[
                { value: 'percentage', label: t('p.percentage') },
                { value: 'fixed', label: t('p.fixed') },
              ]}
            />
            {edit.discountType === 'percentage' ? (
              <NumberField
                label={t('p.value_pct')}
                value={edit.discountPpm == null ? null : edit.discountPpm / 10_000}
                onChange={(v) => setEdit({ ...edit, discountPpm: v === null ? null : v * 10_000 })}
                min={1}
                max={100}
                error={errors.discount ?? null}
              />
            ) : (
              <MoneyField
                label={t('p.value_usd')}
                valueCents={edit.discountCents ?? null}
                onChange={(v) => setEdit({ ...edit, discountCents: v })}
                nullable
                error={errors.discount ?? null}
              />
            )}
            <MoneyField
              label={t('p.min_order')}
              valueCents={edit.minOrderCents ?? 0}
              onChange={(v) => setEdit({ ...edit, minOrderCents: v ?? 0 })}
            />
            <NumberField
              label={t('p.max_uses')}
              value={edit.maxUses ?? null}
              onChange={(v) => setEdit({ ...edit, maxUses: v })}
              min={1}
            />
            <NumberField
              label={t('p.max_per_customer')}
              value={edit.maxUsesPerCustomer ?? null}
              onChange={(v) => setEdit({ ...edit, maxUsesPerCustomer: v })}
              min={1}
            />
            <div />
            <div>
              <label htmlFor="promo-starts" className="text-sm font-medium">
                {t('p.starts')}
              </label>
              <input
                id="promo-starts"
                type="date"
                value={isoToDay(edit.startsAt)}
                onChange={(e) => setEdit({ ...edit, startsAt: dayToIso(e.target.value, false) })}
                className={`${inputClass} border-dark/15`}
              />
            </div>
            <div>
              <label htmlFor="promo-expires" className="text-sm font-medium">
                {t('p.expires')}
              </label>
              <input
                id="promo-expires"
                type="date"
                value={isoToDay(edit.expiresAt)}
                onChange={(e) => setEdit({ ...edit, expiresAt: dayToIso(e.target.value, true) })}
                aria-invalid={errors.expiresAt !== undefined}
                aria-describedby={errors.expiresAt === undefined ? undefined : 'promo-expires-error'}
                className={`${inputClass} ${errors.expiresAt === undefined ? 'border-dark/15' : 'border-toast-error'}`}
              />
              {errors.expiresAt !== undefined && (
                <p id="promo-expires-error" className="mt-1 text-sm text-toast-error">
                  {errors.expiresAt}
                </p>
              )}
            </div>
            <div className="md:col-span-2 grid gap-1">
              <Switch
                label={t('p.catering')}
                checked={edit.appliesToCatering ?? true}
                onChange={(v) => setEdit({ ...edit, appliesToCatering: v })}
              />
              <Switch
                label={t('p.active')}
                checked={edit.active ?? true}
                onChange={(v) => setEdit({ ...edit, active: v })}
              />
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
