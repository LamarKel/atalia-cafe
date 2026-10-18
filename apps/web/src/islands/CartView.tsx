// Carrito (sin pantalla propia en el diseño: sigue el lenguaje visual de las pantallas 03 y 04).
// Lee el carrito local; los precios son solo para mostrar, el Worker recalcula todo al pagar.
import { cents, formatUSD, multiplyCents } from '@atalia/shared/money'
import { ButtonLink, QuantityStepper } from '@atalia/ui'
import { useEffect, useState } from 'react'
import { cartSubtotal, getCart, onCartChange, removeLine, updateQuantity, type CartItem } from '../lib/cart'
import type { Locale, MessageKey } from '../i18n'

export interface CartViewProps {
  locale: Locale
  messages: Record<MessageKey, string>
  /** Rutas ya localizadas. */
  cateringHref: string
  checkoutHref: string
}

const MAX_QUANTITY = 20

export default function CartView({ locale, messages: m, cateringHref, checkoutHref }: CartViewProps) {
  const tf = (key: MessageKey, params: Record<string, string | number>) =>
    m[key].replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
  const usd = (value: number) => formatUSD(cents(value), locale)

  const [items, setItems] = useState<CartItem[] | null>(null)
  useEffect(() => {
    setItems(getCart())
    return onCartChange(setItems)
  }, [])

  if (items === null) return <p className="py-10 text-muted">{m['home.loading']}</p>

  if (items.length === 0) {
    return (
      <div className="rounded-3xl bg-white p-10 text-center">
        <p className="text-lg">{m['cart.empty']}</p>
        <ButtonLink href={cateringHref} className="mt-6">
          {m['cart.browse']}
        </ButtonLink>
      </div>
    )
  }

  const subtotal = cartSubtotal(items)

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <ul className="grid gap-3">
        {items.map((item) => (
          <li key={item.lineId} className="rounded-2xl bg-white p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{item.name}</p>
                <p className="text-sm text-muted">
                  {item.serves !== null
                    ? tf('cart.serves', { n: item.serves })
                    : item.units !== null
                      ? tf('cart.pieces', { n: item.units })
                      : item.sizeLabel}
                </p>
                {item.extras.length > 0 && (
                  <p className="mt-1 text-sm text-muted">{item.extras.map((e) => e.name).join(' · ')}</p>
                )}
                {item.components.length > 0 && (
                  <p className="mt-1 text-sm text-muted">
                    {item.components.map((c) => `${c.label} × ${c.qty}`).join(', ')}
                  </p>
                )}
                {item.notes !== '' && (
                  <p className="mt-1 text-sm text-muted">{tf('cart.notes', { notes: item.notes })}</p>
                )}
              </div>
              <p className="font-semibold text-secondary">
                {item.unitPriceCents === null
                  ? m['catalog.price_tbd']
                  : usd(multiplyCents(cents(item.unitPriceCents), item.quantity))}
              </p>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <QuantityStepper
                label={`${m['detail.quantity']}: ${item.name}`}
                value={item.quantity}
                min={1}
                max={MAX_QUANTITY}
                onChange={(n) => updateQuantity(item.lineId, n)}
                decreaseLabel={m['a11y.decrease']}
                increaseLabel={m['a11y.increase']}
              />
              <button
                type="button"
                onClick={() => removeLine(item.lineId)}
                aria-label={tf('cart.remove_item', { name: item.name })}
                className="min-h-11 rounded-full px-4 text-sm font-medium text-secondary underline underline-offset-2 hover:bg-secondary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              >
                {m['cart.remove']}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <aside>
        <section className="rounded-3xl bg-white p-6 shadow-sm lg:sticky lg:top-28">
          <div className="flex items-center justify-between">
            <span className="font-semibold">{m['cart.subtotal']}</span>
            <span className="text-xl font-semibold text-secondary">
              {subtotal.hasUnpriced && subtotal.cents === 0 ? m['catalog.price_tbd'] : usd(subtotal.cents)}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted">{m['cart.taxes_note']}</p>
          {subtotal.hasUnpriced && (
            <p className="mt-3 rounded-xl bg-sand px-4 py-3 text-sm">{m['cart.unpriced_note']}</p>
          )}
          <ButtonLink href={checkoutHref} size="lg" fullWidth className="mt-5">
            {m['cart.checkout']}
          </ButtonLink>
          <a
            href={cateringHref}
            className="mt-3 flex min-h-11 items-center justify-center text-sm font-medium text-secondary underline underline-offset-2"
          >
            {m['cart.keep_shopping']}
          </a>
        </section>
      </aside>
    </div>
  )
}
