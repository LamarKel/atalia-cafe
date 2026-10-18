// Botón base. Variantes tomadas de la referencia (globals.css, MenuPage) y del diseño aprobado (docs/design).
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

export type ButtonVariant =
  /** Principal: fondo café, texto blanco; al pasar el mouse se invierte (referencia .btn-primary). */
  | 'primary'
  /** Verde de acción del menú ("Add"), como en la referencia. */
  | 'green'
  /** Borde café sin fondo ("Agregar al calendario", "Combínalas por mí"). */
  | 'outline'
  /** Para fondos oscuros como el hero: borde blanco (referencia .btn-secondary). */
  | 'on-dark'
  /** Píldora blanca ("Ver menú" del hero, "Escríbenos por WhatsApp"). */
  | 'light'

export type ButtonSize = 'md' | 'lg'

const base =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full font-semibold transition-[background-color,color,border-color,transform] duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed aria-disabled:cursor-not-allowed'

const variants: Record<ButtonVariant, string> = {
  primary:
    'border-2 border-transparent bg-secondary text-white hover:border-secondary hover:bg-transparent hover:text-secondary motion-safe:hover:-translate-y-1',
  green: 'border-2 border-transparent bg-primary-ink text-white hover:bg-secondary',
  outline: 'border border-secondary bg-transparent text-secondary hover:bg-secondary/5',
  'on-dark':
    'border-2 border-white bg-transparent text-white hover:bg-white hover:text-secondary motion-safe:hover:-translate-y-1',
  light: 'border border-dark/15 bg-white text-dark hover:border-secondary',
}

// Deshabilitado como en el diseño (pantalla 04): beige con texto blanco y sin efectos de hover.
const disabledClasses =
  'border-transparent bg-disabled text-white hover:translate-y-0 hover:border-transparent hover:bg-disabled hover:text-white'

const sizes: Record<ButtonSize, string> = {
  md: 'px-6 py-3 text-base',
  lg: 'px-8 py-4 text-lg',
}

interface CommonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  /** Muestra que la acción está en curso: bloquea el botón y lo anuncia (aria-busy). */
  loading?: boolean
  /** Texto para lectores de pantalla mientras carga, por ejemplo "Procesando…". */
  loadingLabel?: string
  children: ReactNode
}

export type ButtonProps = CommonProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  loadingLabel,
  disabled,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const inactive = disabled === true || loading
  return (
    <button
      type={type}
      disabled={inactive}
      aria-busy={loading || undefined}
      className={cx(
        base,
        variants[variant],
        sizes[size],
        inactive && disabledClasses,
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="size-4 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
        />
      )}
      {children}
      {loading && loadingLabel !== undefined && <span className="sr-only">{loadingLabel}</span>}
    </button>
  )
}

export type ButtonLinkProps = Omit<CommonProps, 'loading' | 'loadingLabel'> &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & { href: string }

/** Un enlace con aspecto de botón (navegación, no acciones). */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <a className={cx(base, variants[variant], sizes[size], fullWidth && 'w-full', className)} {...rest}>
      {children}
    </a>
  )
}
