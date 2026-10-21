// Campo de texto con label real y error accesible (aria-invalid + aria-describedby), de los formularios públicos.

export const inputClass =
  'mt-2 block min-h-11 w-full rounded-xl border bg-white px-4 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary'

export function FormInput(props: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  error: string | null
  type?: 'text' | 'tel' | 'email' | 'date' | 'number'
  inputMode?: 'tel' | 'numeric'
  autoComplete?: string
  min?: string | number
  max?: string | number
  /** false en los campos opcionales (por defecto es obligatorio). */
  required?: boolean
}) {
  return (
    <div>
      <label htmlFor={props.id} className="font-medium">
        {props.label}
      </label>
      <input
        id={props.id}
        type={props.type ?? 'text'}
        inputMode={props.inputMode}
        autoComplete={props.autoComplete}
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        required={props.required ?? true}
        aria-invalid={props.error !== null}
        aria-describedby={props.error === null ? undefined : `${props.id}-error`}
        className={`${inputClass} ${props.error === null ? 'border-dark/15' : 'border-toast-error'}`}
      />
      {props.error !== null && (
        <p id={`${props.id}-error`} className="mt-1 text-sm text-toast-error">
          {props.error}
        </p>
      )}
    </div>
  )
}
