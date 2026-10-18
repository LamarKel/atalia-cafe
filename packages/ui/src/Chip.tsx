// Chips de selección.
//  - ToggleChip: varios a la vez (extras del menú). aria-pressed.
//  - OptionGroup: uno solo (tamaño, personas, paquete de picadera). Semántica de radiogroup con flechas.
//  - Tag: etiqueta informativa ("Bandeja", "24 h antes").
// Tonos: 'menu' replica la referencia (ProductModal: verde al elegir, gris si no);
//        'catering' sigue el diseño nuevo (café al elegir, blanco con borde si no).
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from './cx'

export type ChipTone = 'menu' | 'catering'

const pillBase =
  'inline-flex min-h-11 items-center justify-center gap-1 rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed disabled:opacity-50'

const pillTones: Record<ChipTone, { on: string; off: string }> = {
  menu: { on: 'bg-primary-ink text-white', off: 'bg-gray-100 text-gray-700 hover:bg-gray-200' },
  catering: {
    on: 'border border-secondary bg-secondary text-white',
    off: 'border border-dark/15 bg-white text-dark hover:border-secondary',
  },
}

export interface ToggleChipProps {
  pressed: boolean
  onPressedChange: (pressed: boolean) => void
  tone?: ChipTone
  disabled?: boolean
  children: ReactNode
}

export function ToggleChip({ pressed, onPressedChange, tone = 'menu', disabled, children }: ToggleChipProps) {
  const t = pillTones[tone]
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={() => onPressedChange(!pressed)}
      className={cx(pillBase, pressed ? t.on : t.off)}
    >
      {children}
    </button>
  )
}

export interface Option<V extends string> {
  value: V
  /** Texto principal: "10", "Mediano". */
  label: string
  /** Texto secundario: "personas", "+$1.00". */
  caption?: string
  disabled?: boolean
}

export interface OptionGroupProps<V extends string> {
  /** Nombre accesible del grupo, por ejemplo "¿Para cuántas personas?". */
  label: string
  /** Oculta visualmente el nombre del grupo (sigue disponible para lectores de pantalla). */
  hideLabel?: boolean
  options: readonly Option<V>[]
  value: V | null
  onChange: (value: V) => void
  tone?: ChipTone
  /** 'pill' = píldoras (referencia y filtro de invitados); 'tile' = recuadros con número grande (diseño 03 y 04). */
  layout?: 'pill' | 'tile'
}

export function OptionGroup<V extends string>({
  label,
  hideLabel = false,
  options,
  value,
  onChange,
  tone = 'catering',
  layout = 'pill',
}: OptionGroupProps<V>) {
  const labelId = useId()
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const enabled = options.filter((o) => o.disabled !== true)
  const selectedIndex = options.findIndex((o) => o.value === value)
  // Solo un elemento del grupo entra en el orden de tabulación (roving tabindex).
  const focusIndex = selectedIndex >= 0 ? selectedIndex : options.findIndex((o) => o.disabled !== true)

  const move = (from: number, step: 1 | -1) => {
    if (enabled.length === 0) return
    let i = from
    for (let n = 0; n < options.length; n++) {
      i = (i + step + options.length) % options.length
      const option = options[i]
      if (option !== undefined && option.disabled !== true) {
        onChange(option.value)
        refs.current[i]?.focus()
        return
      }
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      move(index, 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      move(index, -1)
    }
  }

  const t = pillTones[tone]

  return (
    <div>
      <p id={labelId} className={cx('mb-3 font-semibold', hideLabel && 'sr-only')}>
        {label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className={cx(layout === 'tile' ? 'grid grid-cols-2 gap-3 sm:grid-cols-4' : 'flex flex-wrap gap-2')}
      >
        {options.map((option, index) => {
          const checked = option.value === value
          return (
            <button
              key={option.value}
              ref={(el) => {
                refs.current[index] = el
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={option.disabled}
              tabIndex={index === focusIndex ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={
                layout === 'tile'
                  ? cx(
                      'flex min-h-20 flex-col items-center justify-center rounded-xl border px-3 py-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed disabled:opacity-50',
                      checked
                        ? 'border-secondary bg-secondary text-white'
                        : 'border-dark/15 bg-white text-dark hover:border-secondary',
                    )
                  : cx(pillBase, checked ? t.on : t.off)
              }
            >
              <span className={layout === 'tile' ? 'text-xl font-semibold' : undefined}>{option.label}</span>
              {option.caption !== undefined && (
                <span
                  className={cx('text-xs', layout === 'tile' ? 'mt-0.5' : 'ml-1', !checked && 'text-muted')}
                >
                  {option.caption}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export type TagTone = 'sage' | 'sand' | 'brown'

const tagTones: Record<TagTone, string> = {
  sage: 'bg-sage-soft text-dark', // "Bandeja", "Pedir con 24 h de anticipación"
  sand: 'bg-sand text-dark', // notas de anticipación
  brown: 'bg-secondary text-white', // etiqueta destacada sobre fotos (el diseño usa verde: ver primary-ink en tokens.css)
}

export function Tag({ tone = 'sage', children }: { tone?: TagTone; children: ReactNode }) {
  return (
    <span
      className={cx('inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold', tagTones[tone])}
    >
      {children}
    </span>
  )
}
