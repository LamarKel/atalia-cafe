// Pasos del checkout (diseño 05: "1 · Cuándo  2 · Tus datos  3 · Pago") y contador ± (diseños 03 y 04).
import { useId } from 'react'
import { cx } from './cx'

export interface StepperProps {
  /** Nombre accesible, por ejemplo "Pasos del pedido". */
  label: string
  steps: readonly string[]
  /** Índice del paso actual, desde 0. */
  current: number
}

export function Stepper({ label, steps, current }: StepperProps) {
  return (
    <nav aria-label={label}>
      <ol className="grid gap-3" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((step, index) => {
          const state = index < current ? 'done' : index === current ? 'current' : 'upcoming'
          return (
            <li key={step} aria-current={state === 'current' ? 'step' : undefined} data-state={state}>
              <span
                aria-hidden="true"
                className={cx(
                  'block h-1 rounded-full transition-colors',
                  state === 'upcoming' ? 'bg-dark/15' : 'bg-secondary',
                )}
              />
              <span
                className={cx(
                  'mt-2 block text-sm',
                  state === 'current' ? 'font-semibold text-secondary' : 'text-muted',
                )}
              >
                {index + 1} · {step}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export interface QuantityStepperProps {
  /** Nombre accesible de la cantidad: "Cantidad", "Quipe de res". */
  label: string
  /** Muestra el nombre junto al contador (si es false, solo lo leen los lectores de pantalla). */
  showLabel?: boolean
  value: number
  min?: number
  max?: number
  onChange: (value: number) => void
  decreaseLabel: string
  increaseLabel: string
  /** Desactiva solo el botón +, por ejemplo cuando la picadera ya está completa. */
  increaseDisabled?: boolean
  /**
   * En el mínimo, el − se vuelve una papelera que quita la línea (carrito). Sin esto, en el mínimo el −
   * queda desactivado (al elegir la cantidad antes de agregar).
   */
  onRemove?: () => void
  /** Nombre accesible de la papelera ("Quitar Latte"). Obligatorio si hay onRemove. */
  removeLabel?: string
}

export function QuantityStepper({
  label,
  showLabel = false,
  value,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  onChange,
  decreaseLabel,
  increaseLabel,
  increaseDisabled = false,
  onRemove,
  removeLabel,
}: QuantityStepperProps) {
  const id = useId()
  const canDecrease = value > min
  const canIncrease = value < max && !increaseDisabled
  const removes = !canDecrease && onRemove !== undefined
  const button =
    'inline-flex size-11 items-center justify-center rounded-full text-xl leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed'

  return (
    <div role="group" aria-labelledby={id} className="inline-flex items-center gap-3">
      <span id={id} className={showLabel ? 'font-medium' : 'sr-only'}>
        {label}
      </span>
      {removes ? (
        <button
          type="button"
          aria-label={removeLabel ?? `${decreaseLabel}: ${label}`}
          onClick={onRemove}
          className={cx(button, 'border border-dark/20 bg-white text-secondary hover:bg-blush')}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          aria-label={`${decreaseLabel}: ${label}`}
          disabled={!canDecrease}
          onClick={() => onChange(Math.max(min, value - 1))}
          className={cx(button, 'border border-dark/20 bg-white text-dark disabled:opacity-40')}
        >
          <span aria-hidden="true">−</span>
        </button>
      )}
      <output aria-live="polite" className="min-w-6 text-center text-lg font-semibold tabular-nums">
        {value}
      </output>
      <button
        type="button"
        aria-label={`${increaseLabel}: ${label}`}
        disabled={!canIncrease}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={cx(button, 'bg-secondary text-white disabled:bg-disabled')}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  )
}
