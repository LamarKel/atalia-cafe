// Enlace al carrito con el contador ("Carrito (2)" del diseño). Isla mínima: solo lee el carrito local.
import { useEffect, useState } from 'react'
import { cartCount, getCart, onCartChange } from '../lib/cart'

interface Props {
  href: string
  label: string
  /** "Carrito, {count} productos" para lectores de pantalla. */
  countLabel: string
  variant: 'pill' | 'bar'
}

export default function CartLink({ href, label, countLabel, variant }: Props) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    setCount(cartCount(getCart()))
    return onCartChange((items) => setCount(cartCount(items)))
  }, [])

  const a11y = countLabel.replace('{count}', String(count))

  if (variant === 'bar') {
    return (
      <a href={href} className="flex min-h-14 items-center justify-center gap-1 text-sm font-medium">
        {/* Sin aria-label: el nombre sale del contenido e incluye la palabra visible (WCAG 2.5.3) */}
        <span aria-hidden="true">{label}</span>
        {count > 0 && (
          <span
            aria-hidden="true"
            className="inline-flex min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-xs text-white"
          >
            {count}
          </span>
        )}
        <span className="sr-only">{a11y}</span>
      </a>
    )
  }

  return (
    <a
      href={href}
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-dark/15 px-4 text-sm font-medium hover:border-secondary"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path
          d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="10" cy="20" r="1.3" />
        <circle cx="17" cy="20" r="1.3" />
      </svg>
      <span aria-hidden="true">{label}</span>
      {count > 0 && <span aria-hidden="true">({count})</span>}
      <span className="sr-only">{a11y}</span>
    </a>
  )
}
