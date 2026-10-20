// Campos del panel: labels reales, error debajo del campo (aria-describedby), 44 px de alto.
// MoneyField: el equipo escribe dólares ("12.50") y el formulario guarda centavos con parseUSD (REGLAS A3).
import { cents, formatUSD, parseUSD } from '@atalia/shared/money'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n-context'

export const inputClass =
  'mt-1.5 block min-h-11 w-full rounded-xl border bg-white px-3.5 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:bg-dark/5'

function FieldShell(props: {
  id: string
  label: string
  hint?: string | undefined
  error?: string | null | undefined
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={props.id} className="text-sm font-medium">
        {props.label}
      </label>
      {props.children}
      {props.hint !== undefined && (
        <p id={`${props.id}-hint`} className="mt-1 text-xs text-muted">
          {props.hint}
        </p>
      )}
      {props.error != null && (
        <p id={`${props.id}-error`} className="mt-1 text-sm text-toast-error">
          {props.error}
        </p>
      )}
    </div>
  )
}

const describedBy = (id: string, hint?: string, error?: string | null) =>
  [hint !== undefined && `${id}-hint`, error != null && `${id}-error`].filter(Boolean).join(' ') || undefined

export function TextField(props: {
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
  error?: string | null
  maxLength?: number
  required?: boolean
  multiline?: boolean
  inputMode?: 'text' | 'numeric'
}) {
  const id = useId()
  const common = {
    id,
    value: props.value,
    maxLength: props.maxLength,
    required: props.required,
    'aria-invalid': props.error != null,
    'aria-describedby': describedBy(id, props.hint, props.error),
    className: `${inputClass} ${props.error != null ? 'border-toast-error' : 'border-dark/15'}`,
  }
  return (
    <FieldShell id={id} label={props.label} hint={props.hint} error={props.error}>
      {props.multiline === true ? (
        <textarea {...common} rows={3} onChange={(e) => props.onChange(e.target.value)} />
      ) : (
        <input {...common} inputMode={props.inputMode} onChange={(e) => props.onChange(e.target.value)} />
      )}
    </FieldShell>
  )
}

export function NumberField(props: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  min?: number
  max?: number
  hint?: string
  error?: string | null
}) {
  const id = useId()
  return (
    <FieldShell id={id} label={props.label} hint={props.hint} error={props.error}>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={props.min}
        max={props.max}
        value={props.value ?? ''}
        onChange={(e) => props.onChange(e.target.value === '' ? null : Math.trunc(Number(e.target.value)))}
        aria-invalid={props.error != null}
        aria-describedby={describedBy(id, props.hint, props.error)}
        className={`${inputClass} ${props.error != null ? 'border-toast-error' : 'border-dark/15'}`}
      />
    </FieldShell>
  )
}

/** Monto en dólares. Muestra "12.50"; entrega centavos (o null si se deja vacío y `nullable`). */
export function MoneyField(props: {
  label: string
  valueCents: number | null
  onChange: (cents: number | null) => void
  nullable?: boolean
  hint?: string
  error?: string | null
}) {
  const { t, locale } = useI18n()
  const id = useId()
  const toText = (v: number | null) => (v === null ? '' : (v / 100).toFixed(2))
  const [text, setText] = useState(toText(props.valueCents))
  const [invalid, setInvalid] = useState(false)
  // Si el valor cambia desde fuera (otra opción, cargar el producto), se refleja en el texto.
  useEffect(() => {
    setText((current) => {
      try {
        return current.trim() !== '' && parseUSD(current) === props.valueCents
          ? current
          : toText(props.valueCents)
      } catch {
        return toText(props.valueCents)
      }
    })
  }, [props.valueCents])

  const commit = (raw: string) => {
    if (raw.trim() === '') {
      setInvalid(false)
      props.onChange(props.nullable === true ? null : 0)
      return
    }
    try {
      const c = parseUSD(raw)
      setInvalid(false)
      props.onChange(c)
    } catch {
      setInvalid(true)
    }
  }
  const error = invalid ? t('f.invalid_money') : props.error
  return (
    <FieldShell id={id} label={props.label} hint={props.hint} error={error}>
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 mt-0.5 -translate-y-1/2 text-muted"
        >
          $
        </span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            commit(e.target.value)
          }}
          onBlur={() => {
            if (!invalid && props.valueCents !== null) setText(toText(props.valueCents))
          }}
          aria-invalid={error != null}
          aria-describedby={describedBy(id, props.hint, error)}
          className={`${inputClass} pl-7 tabular-nums ${error != null ? 'border-toast-error' : 'border-dark/15'}`}
        />
      </div>
      {props.valueCents !== null && !invalid && (
        <span className="sr-only">{formatUSD(cents(props.valueCents), locale)}</span>
      )}
    </FieldShell>
  )
}

export function SelectField<V extends string>(props: {
  label: string
  value: V
  onChange: (v: V) => void
  options: Array<{ value: V; label: string }>
  error?: string | null
}) {
  const id = useId()
  return (
    <FieldShell id={id} label={props.label} error={props.error}>
      <select
        id={id}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as V)}
        aria-invalid={props.error != null}
        aria-describedby={describedBy(id, undefined, props.error)}
        className={`${inputClass} ${props.error != null ? 'border-toast-error' : 'border-dark/15'}`}
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

/** Interruptor accesible (role="switch"), con el estado también en texto, no solo en color. */
export function Switch(props: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  hint?: string
}) {
  const { t } = useI18n()
  const id = useId()
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <div>
        <span id={id} className="font-medium">
          {props.label}
        </span>
        {props.hint !== undefined && <p className="text-xs text-muted">{props.hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        aria-labelledby={id}
        onClick={() => props.onChange(!props.checked)}
        className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
      >
        <span className="text-sm text-muted">{props.checked ? t('f.on') : t('f.off')}</span>
        <span
          className={`relative h-7 w-12 rounded-full transition-colors ${props.checked ? 'bg-primary-ink' : 'bg-dark/20'}`}
        >
          <span
            className={`absolute top-1 size-5 rounded-full bg-white shadow transition-transform ${props.checked ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </span>
      </button>
    </div>
  )
}

/** Tarjeta de sección del formulario. */
export function FormCard(props: { title: string; hint?: string; children: ReactNode; action?: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="rounded-3xl bg-white p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={id} className="font-heading text-xl font-bold">
            {props.title}
          </h2>
          {props.hint !== undefined && <p className="mt-1 text-sm text-muted">{props.hint}</p>}
        </div>
        {props.action}
      </div>
      <div className="mt-4">{props.children}</div>
    </section>
  )
}

/**
 * Lista editable (tamaños, extras, nutrición, qué incluye): agregar, quitar y reordenar con botones
 * (funciona con teclado y lector de pantalla; no depende de arrastrar).
 */
export function RowsEditor<T>(props: {
  rows: T[]
  onChange: (rows: T[]) => void
  newRow: () => T
  rowLabel: (row: T, index: number) => string
  render: (row: T, update: (patch: Partial<T>) => void, index: number) => ReactNode
}) {
  const { t } = useI18n()
  const move = (i: number, d: -1 | 1) => {
    const next = [...props.rows]
    const [r] = next.splice(i, 1)
    if (r === undefined) return
    next.splice(i + d, 0, r)
    props.onChange(next)
  }
  const small =
    'inline-flex size-11 items-center justify-center rounded-full border border-dark/15 bg-white hover:border-secondary disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary'
  return (
    <div>
      <ol className="grid gap-3">
        {props.rows.map((row, i) => {
          const label = props.rowLabel(row, i)
          return (
            <li key={i} className="rounded-2xl border border-dark/10 p-3 md:p-4">
              <div className="grid gap-3">
                {props.render(
                  row,
                  (patch) => props.onChange(props.rows.map((r, j) => (j === i ? { ...r, ...patch } : r))),
                  i,
                )}
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className={small}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={t('cat.move_up', { name: label })}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="m6 15 6-6 6 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={small}
                  disabled={i === props.rows.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={t('cat.move_down', { name: label })}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => props.onChange(props.rows.filter((_, j) => j !== i))}
                  className="min-h-11 rounded-full px-4 text-sm font-medium text-secondary underline underline-offset-2"
                  aria-label={`${t('f.remove_row')}: ${label}`}
                >
                  {t('f.remove_row')}
                </button>
              </div>
            </li>
          )
        })}
      </ol>
      <button
        type="button"
        onClick={() => props.onChange([...props.rows, props.newRow()])}
        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-dashed border-secondary/60 px-4 text-sm font-semibold text-secondary hover:bg-secondary/5"
      >
        + {t('f.add_row')}
      </button>
    </div>
  )
}
