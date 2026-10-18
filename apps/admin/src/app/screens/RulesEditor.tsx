// Reglas de negocio (RF-A05): el formulario sale del registro de packages/shared/rules. Una regla nueva en
// el código aparece aquí sola, con su campo según la unidad. Las de dinero solo las edita la dueña (la RLS
// también lo exige). Cada cambio es una fila nueva con fecha: los pedidos ya hechos no cambian.
import { cents, formatPpm, formatUSD, parsePercent, parseUSD, ppm } from '@atalia/shared/money'
import { RULES, type RuleKey, type StoredRule } from '@atalia/shared/rules'
import { Button, useToast } from '@atalia/ui'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { currentValue, saveRule } from '../../lib/business'
import type { AdminKey } from '../../i18n'
import type { Role } from '../auth'
import { inputClass } from '../components/Fields'
import { useI18n } from '../i18n-context'

const GROUP_ORDER = [
  'payments',
  'tax',
  'tips',
  'deposit',
  'time',
  'orders',
  'refunds',
  'promos',
  'notifications',
  'legal',
] as const
const STATUS_OPTIONS = ['confirmed', 'preparing'] as const
const TYPES = ['menu', 'tray', 'table', 'picadera_pack'] as const

export function RulesEditor(props: { rows: StoredRule[]; storeId: string; role: Role; onSaved: () => void }) {
  const { t } = useI18n()
  const keys = Object.keys(RULES) as RuleKey[]
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">{t('biz.rules_hint')}</p>
      {GROUP_ORDER.map((group) => {
        const inGroup = keys.filter((k) => RULES[k].group === group)
        if (inGroup.length === 0) return null
        return (
          <section key={group} aria-labelledby={`g-${group}`} className="rounded-3xl bg-white p-5 md:p-6">
            <h2 id={`g-${group}`} className="font-heading text-xl font-bold">
              {t(`group.${group}` as AdminKey)}
            </h2>
            <ul className="mt-3 divide-y divide-dark/10">
              {inGroup.map((key) => (
                <li key={key} className="py-4">
                  <RuleRow ruleKey={key} {...props} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function display(key: RuleKey, value: unknown, locale: 'es' | 'en', t: (k: AdminKey) => string): string {
  const unit = RULES[key].unit
  switch (unit) {
    case 'boolean':
      return value === true ? t('f.on') : t('f.off')
    case 'usd':
      return formatUSD(cents(value as number), locale)
    case 'percent':
      return formatPpm(ppm(value as number))
    case 'percent_list':
      return (value as number[]).map((v) => formatPpm(ppm(v))).join(', ') || '—'
    case 'localized_text':
      return (value as { en: string; es: string })[locale]
    case 'email_list':
      return (value as string[]).join(', ') || '—'
    case 'refund_tiers':
      return (value as Array<{ hoursBefore: number; refundPpm: number }>)
        .map((x) => `${String(x.hoursBefore)} h → ${formatPpm(ppm(x.refundPpm))}`)
        .join(' · ')
    // Valores internos → texto para la persona (no "table", "confirmed", "es")
    case 'product_types':
      return (value as string[]).map((v) => t(`type.${v}` as AdminKey)).join(', ')
    case 'order_status':
      return t(`status.${String(value)}` as AdminKey)
    case 'locale':
      return t(`locale.${String(value)}` as AdminKey)
    default:
      return String(value)
  }
}

function RuleRow(props: {
  ruleKey: RuleKey
  rows: StoredRule[]
  storeId: string
  role: Role
  onSaved: () => void
}) {
  const { t, locale } = useI18n()
  const toast = useToast()
  const def = RULES[props.ruleKey]
  const current = currentValue(props.ruleKey, props.rows, props.storeId)
  const [value, setValue] = useState<unknown>(current)
  const [inputError, setInputError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const locked = def.editableBy === 'owner' && props.role !== 'owner'
  const id = `rule-${props.ruleKey.replace('.', '-')}`
  const changed = JSON.stringify(value) !== JSON.stringify(current)

  // Las reglas con listas u objetos se recalculan como objetos nuevos en cada render: se compara el contenido.
  const currentKey = JSON.stringify(current)
  useEffect(() => setValue(JSON.parse(currentKey) as unknown), [currentKey])

  const save = async () => {
    setSaving(true)
    try {
      await saveRule(props.ruleKey, value, props.storeId)
      toast(t('biz.rule_saved'))
      props.onSaved()
    } catch (e) {
      toast(t('biz.invalid_value', { msg: e instanceof Error ? e.message : '' }), { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-3 md:grid-cols-[1fr_minmax(16rem,22rem)] md:items-start">
      <div>
        <p id={`${id}-label`} className="font-semibold">
          {def.label[locale]}
        </p>
        <p id={`${id}-help`} className="mt-0.5 text-sm text-muted">
          {def.help[locale]}
        </p>
        <p className="mt-1 text-xs text-muted">
          {t('biz.current', { value: display(props.ruleKey, current, locale, t) })}
        </p>
        {locked && <p className="mt-1 text-xs font-semibold text-secondary">{t('biz.owner_only')}</p>}
      </div>
      <div className="grid gap-2">
        <RuleInput
          id={id}
          ruleKey={props.ruleKey}
          value={value}
          onChange={setValue}
          disabled={locked}
          onError={setInputError}
        />
        {inputError !== null && <p className="text-sm text-toast-error">{inputError}</p>}
        {!locked && changed && inputError === null && (
          <div className="flex justify-end">
            <Button
              className="!min-h-11 !py-2 text-sm"
              loading={saving}
              loadingLabel={t('cat.saving')}
              onClick={() => void save()}
            >
              {t('biz.save_rule')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/** Campo según la unidad de la regla. Montos en dólares y porcentajes se escriben como texto y se convierten. */
function RuleInput(props: {
  id: string
  ruleKey: RuleKey
  value: unknown
  onChange: (v: unknown) => void
  disabled: boolean
  onError: (e: string | null) => void
}) {
  const { t } = useI18n()
  const def = RULES[props.ruleKey]
  const aria = { 'aria-labelledby': `${props.id}-label`, 'aria-describedby': `${props.id}-help` }
  const cls = `${inputClass} border-dark/15`

  // Texto intermedio para montos y porcentajes (se valida al escribir)
  const toText = useMemo(
    () => (v: unknown) =>
      def.unit === 'usd'
        ? ((v as number) / 100).toFixed(2)
        : def.unit === 'percent'
          ? String((v as number) / 10_000)
          : '',
    [def.unit],
  )
  const [text, setText] = useState(() => toText(props.value))
  const valueKey = JSON.stringify(props.value)
  useEffect(() => setText(toText(JSON.parse(valueKey) as unknown)), [valueKey, toText])

  switch (def.unit) {
    case 'boolean':
      return (
        <button
          type="button"
          role="switch"
          aria-checked={props.value === true}
          {...aria}
          disabled={props.disabled}
          onClick={() => props.onChange(props.value !== true)}
          className="inline-flex min-h-11 items-center gap-2 justify-self-end rounded-full px-1 disabled:opacity-50"
        >
          <span className="text-sm text-muted">{props.value === true ? t('f.on') : t('f.off')}</span>
          <span
            className={`relative h-7 w-12 rounded-full transition-colors ${props.value === true ? 'bg-primary-ink' : 'bg-dark/20'}`}
          >
            <span
              className={`absolute left-0 top-1 size-5 rounded-full bg-white shadow transition-transform ${props.value === true ? 'translate-x-6' : 'translate-x-1'}`}
            />
          </span>
        </button>
      )
    case 'usd':
    case 'percent':
      return (
        <div className="relative">
          <input
            {...aria}
            disabled={props.disabled}
            inputMode="decimal"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              try {
                props.onChange(def.unit === 'usd' ? parseUSD(e.target.value) : parsePercent(e.target.value))
                props.onError(null)
              } catch {
                props.onError(
                  def.unit === 'usd' ? t('f.invalid_money') : t('biz.invalid_value', { msg: '6.625' }),
                )
              }
            }}
            className={`${cls} tabular-nums ${def.unit === 'usd' ? 'pl-7' : 'pr-8'}`}
          />
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute top-1/2 mt-0.5 -translate-y-1/2 text-muted ${def.unit === 'usd' ? 'left-3.5' : 'right-3.5'}`}
          >
            {def.unit === 'usd' ? '$' : '%'}
          </span>
        </div>
      )
    case 'minutes':
    case 'hours':
    case 'days':
    case 'months':
    case 'guests':
    case 'count':
      return (
        <input
          {...aria}
          disabled={props.disabled}
          type="number"
          inputMode="numeric"
          value={String(props.value)}
          onChange={(e) => props.onChange(Math.trunc(Number(e.target.value)))}
          className={`${cls} tabular-nums`}
        />
      )
    case 'time_of_day':
      return (
        <input
          {...aria}
          disabled={props.disabled}
          type="time"
          value={String(props.value)}
          onChange={(e) => props.onChange(e.target.value)}
          className={cls}
        />
      )
    case 'locale':
      return (
        <select
          {...aria}
          disabled={props.disabled}
          value={String(props.value)}
          onChange={(e) => props.onChange(e.target.value)}
          className={cls}
        >
          <option value="es">{t('locale.es')}</option>
          <option value="en">{t('locale.en')}</option>
        </select>
      )
    case 'order_status':
      return (
        <select
          {...aria}
          disabled={props.disabled}
          value={String(props.value)}
          onChange={(e) => props.onChange(e.target.value)}
          className={cls}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}` as AdminKey)}
            </option>
          ))}
        </select>
      )
    case 'localized_text': {
      const v = props.value as { en: string; es: string }
      return (
        <div className="grid gap-2">
          <input
            {...aria}
            disabled={props.disabled}
            value={v.es}
            onChange={(e) => props.onChange({ ...v, es: e.target.value })}
            className={cls}
            placeholder={t('locale.es')}
          />
          <input
            aria-label={t('locale.en')}
            disabled={props.disabled}
            value={v.en}
            onChange={(e) => props.onChange({ ...v, en: e.target.value })}
            className={cls}
            placeholder={t('locale.en')}
          />
        </div>
      )
    }
    case 'email_list': {
      const list = props.value as string[]
      return (
        <ListEditor
          items={list}
          disabled={props.disabled}
          addLabel={t('biz.add_email')}
          onChange={props.onChange}
          newItem=""
          render={(item, update, i) => (
            <input
              aria-label={`${t('biz.email')} ${String(i + 1)}`}
              type="email"
              value={item}
              onChange={(e) => update(e.target.value)}
              className={cls}
              disabled={props.disabled}
            />
          )}
        />
      )
    }
    case 'percent_list': {
      const list = props.value as number[]
      return (
        <ListEditor
          items={list}
          disabled={props.disabled}
          addLabel={t('biz.add_percent')}
          onChange={props.onChange}
          newItem={100_000}
          render={(item, update, i) => (
            <PercentInput
              label={`${t('biz.percent')} ${String(i + 1)}`}
              value={item}
              onChange={update}
              disabled={props.disabled}
              onError={props.onError}
            />
          )}
        />
      )
    }
    case 'refund_tiers': {
      const list = props.value as Array<{ hoursBefore: number; refundPpm: number }>
      return (
        <ListEditor
          items={list}
          disabled={props.disabled}
          addLabel={t('biz.add_tier')}
          onChange={props.onChange}
          newItem={{ hoursBefore: 0, refundPpm: 0 }}
          render={(item, update, i) => (
            <div className="grid grid-cols-2 gap-2">
              <input
                aria-label={`${t('biz.hours_before')} ${String(i + 1)}`}
                type="number"
                min={0}
                value={item.hoursBefore}
                onChange={(e) => update({ ...item, hoursBefore: Math.trunc(Number(e.target.value)) })}
                className={cls}
                disabled={props.disabled}
              />
              <PercentInput
                label={`${t('biz.refund')} ${String(i + 1)}`}
                value={item.refundPpm}
                onChange={(v) => update({ ...item, refundPpm: v })}
                disabled={props.disabled}
                onError={props.onError}
              />
            </div>
          )}
        />
      )
    }
    case 'product_types': {
      const list = props.value as string[]
      return (
        <div role="group" {...aria} className="flex flex-wrap gap-2">
          {TYPES.map((type) => {
            const on = list.includes(type)
            return (
              <button
                key={type}
                type="button"
                aria-pressed={on}
                disabled={props.disabled}
                onClick={() => props.onChange(on ? list.filter((x) => x !== type) : [...list, type])}
                className={`min-h-11 rounded-full border px-4 text-sm font-medium ${on ? 'border-secondary bg-secondary text-white' : 'border-dark/15 bg-white'}`}
              >
                {t(`type.${type}` as AdminKey)}
              </button>
            )
          })}
        </div>
      )
    }
    default:
      return <p className="text-sm text-muted">{JSON.stringify(props.value)}</p>
  }
}

function PercentInput(props: {
  label: string
  value: number
  onChange: (ppm: number) => void
  disabled: boolean
  onError: (e: string | null) => void
}) {
  const { t } = useI18n()
  const [text, setText] = useState(String(props.value / 10_000))
  return (
    <div className="relative">
      <input
        aria-label={props.label}
        inputMode="decimal"
        value={text}
        disabled={props.disabled}
        onChange={(e) => {
          setText(e.target.value)
          try {
            props.onChange(parsePercent(e.target.value))
            props.onError(null)
          } catch {
            props.onError(t('biz.invalid_value', { msg: '15' }))
          }
        }}
        className={`${inputClass} border-dark/15 pr-8 tabular-nums`}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3.5 top-1/2 mt-0.5 -translate-y-1/2 text-muted"
      >
        %
      </span>
    </div>
  )
}

function ListEditor<T>(props: {
  items: T[]
  onChange: (v: T[]) => void
  newItem: T
  addLabel: string
  disabled: boolean
  render: (item: T, update: (v: T) => void, i: number) => ReactNode
}) {
  const { t } = useI18n()
  return (
    <div className="grid gap-2">
      {props.items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {props.render(item, (v) => props.onChange(props.items.map((x, j) => (j === i ? v : x))), i)}
          </div>
          {!props.disabled && (
            <button
              type="button"
              onClick={() => props.onChange(props.items.filter((_, j) => j !== i))}
              className="mt-1.5 min-h-11 px-2 text-sm text-secondary underline"
            >
              {t('biz.remove')}
            </button>
          )}
        </div>
      ))}
      {!props.disabled && (
        <button
          type="button"
          onClick={() => props.onChange([...props.items, props.newItem])}
          className="min-h-11 justify-self-start rounded-full border border-dashed border-secondary/60 px-4 text-sm font-semibold text-secondary"
        >
          + {props.addLabel}
        </button>
      )}
    </div>
  )
}
