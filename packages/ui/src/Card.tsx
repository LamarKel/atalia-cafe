// Tarjeta base: blanca, rounded-2xl y sombra suave, como en la referencia (carrito, checkout) y el diseño.
import type { ElementType, HTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

export type CardPadding = 'none' | 'sm' | 'md' | 'lg'

const paddings: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6 md:p-8',
}

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Elemento HTML que se renderiza: 'div', 'article', 'section', 'li'… */
  as?: ElementType
  padding?: CardPadding
  /** Se eleva al pasar el mouse (tarjetas de producto). Respeta prefers-reduced-motion. */
  interactive?: boolean
  children: ReactNode
}

export function Card({
  as: Element = 'div',
  padding = 'md',
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Element
      className={cx(
        'overflow-hidden rounded-2xl bg-white shadow-sm',
        paddings[padding],
        interactive &&
          'transition-[box-shadow,transform] duration-300 hover:shadow-md motion-safe:hover:-translate-y-1',
        className,
      )}
      {...rest}
    >
      {children}
    </Element>
  )
}
