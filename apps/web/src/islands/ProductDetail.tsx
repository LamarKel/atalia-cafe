// Detalle de bandeja o mesa (docs/design/03-detalle-bandeja.png): galería, opción por personas con precio,
// qué incluye, notas para la cocina, cantidad y "Agregar al carrito". Los datos llegan ya cargados de la BD.
import { cents, formatUSD, multiplyCents } from '@atalia/shared/money'
import { Button, OptionGroup, QuantityStepper, Tag, ToastProvider, useToast, type Option } from '@atalia/ui'
import { useId, useState } from 'react'
import { addToCart } from '../lib/cart'
import { perPersonCents } from '../lib/catalog-format'
import type { ProductDetail as Product } from '../lib/catalog'
import type { Locale, MessageKey } from '../i18n'

export interface ProductDetailProps {
  locale: Locale
  product: Product
  messages: Record<MessageKey, string>
  /** Regla orders.quote_threshold_guests: por encima, se sugiere pedir cotización (RF-Q02). */
  quoteThreshold: number
  quoteHref: string
}

const MAX_QUANTITY = 20

export default function ProductDetail(props: ProductDetailProps) {
  return (
    <ToastProvider
      closeLabel={props.messages['a11y.close']}
      regionLabel={props.messages['a11y.notifications']}
    >
      <Detail {...props} />
    </ToastProvider>
  )
}

function Detail({ locale, product, messages: m, quoteThreshold, quoteHref }: ProductDetailProps) {
  const tf = (key: MessageKey, params: Record<string, string | number>) =>
    m[key].replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
  const usd = (value: number) => formatUSD(cents(value), locale)
  const toast = useToast()
  const notesId = useId()

  const { options } = product
  const [sizeId, setSizeId] = useState<string | null>(options[1]?.id ?? options[0]?.id ?? null)
  const [photo, setPhoto] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')

  const size = options.find((o) => o.id === sizeId) ?? null
  const unitPrice = size === null ? product.fromPriceCents : size.priceCents
  const perPerson = size === null ? null : perPersonCents(size.priceCents, size.serves)
  const image = product.images[photo] ?? null

  const choices: Option<string>[] = options.map((o) => ({
    value: o.id,
    label: o.serves !== null ? String(o.serves) : o.label,
    ...(o.serves !== null ? { caption: m['detail.people'] } : {}),
  }))

  const add = () => {
    addToCart({
      productId: product.id,
      slug: product.slug,
      type: product.type,
      name: product.name,
      sizeId: size?.id ?? null,
      sizeLabel: size?.label ?? null,
      serves: size?.serves ?? null,
      units: size?.units ?? null,
      unitPriceCents: unitPrice,
      quantity,
      notes: notes.trim(),
      minLeadHours: product.minLeadHours,
      components: [],
      extras: [],
    })
    toast(tf('detail.added', { name: product.name }))
    setQuantity(1)
    setNotes('')
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:gap-12">
      <section aria-label={m['a11y.gallery']}>
        <div className="aspect-[4/3] overflow-hidden rounded-3xl bg-sage-soft">
          {image === null ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-muted">
              {m['catalog.photo_placeholder']}
            </div>
          ) : (
            <img src={image.url} alt={image.alt} className="size-full object-cover" />
          )}
        </div>
        {product.images.length > 1 && (
          <ul className="mt-3 grid grid-cols-4 gap-3">
            {product.images.map((img, i) => (
              <li key={img.url}>
                <button
                  type="button"
                  onClick={() => setPhoto(i)}
                  aria-label={tf('a11y.view_photo', { n: i + 1 })}
                  aria-pressed={i === photo}
                  className={`block aspect-[3/2] w-full overflow-hidden rounded-xl border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary ${
                    i === photo ? 'border-secondary' : 'border-transparent'
                  }`}
                >
                  <img src={img.url} alt="" className="size-full object-cover" loading="lazy" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div>
        <Tag>
          {m[`type.${product.type}`]} · {tf('detail.lead', { n: product.minLeadHours })}
        </Tag>
        <h1 className="mt-3 font-heading text-4xl font-bold text-dark md:text-5xl">{product.name}</h1>
        {product.shortDescription !== null && (
          <p className="mt-3 text-lg text-muted">{product.shortDescription}</p>
        )}
        <p className="mt-4 text-3xl font-semibold text-secondary" aria-live="polite">
          {unitPrice === null ? m['catalog.price_tbd'] : usd(unitPrice)}
        </p>
        {product.description !== null && <p className="mt-4 leading-relaxed">{product.description}</p>}

        {choices.length > 0 && (
          <div className="mt-8">
            <OptionGroup
              label={m['detail.serves_question']}
              options={choices}
              value={sizeId}
              onChange={setSizeId}
              layout="tile"
            />
            {perPerson !== null && (
              <p className="mt-3 text-sm text-muted">{tf('detail.per_person', { price: usd(perPerson) })}</p>
            )}
          </div>
        )}

        {size?.serves != null && size.serves > quoteThreshold && (
          <p className="mt-4 rounded-xl bg-sand px-4 py-3 text-sm">
            {tf('quote.cta_threshold', { n: quoteThreshold })}{' '}
            <a href={quoteHref} className="font-semibold text-secondary underline underline-offset-2">
              {m['quote.cta']}
            </a>
          </p>
        )}

        {unitPrice === null && (
          <p className="mt-4 rounded-xl bg-sand px-4 py-3 text-sm">{m['detail.price_tbd_note']}</p>
        )}

        {product.inclusions.length > 0 && (
          <section className="mt-8 rounded-2xl bg-white p-5 md:p-6">
            <h2 className="font-semibold">{m['detail.includes']}</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {product.inclusions.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="mt-0.5 size-5 shrink-0 text-primary"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="m5 12 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-8">
          <label htmlFor={notesId} className="font-semibold">
            {m['detail.notes']}
          </label>
          <textarea
            id={notesId}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={m['detail.notes_placeholder']}
            className="mt-3 block w-full rounded-xl border border-dark/15 bg-white px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          />
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="inline-flex justify-center rounded-full border border-dark/15 bg-white px-3 py-1.5">
            <QuantityStepper
              label={m['detail.quantity']}
              value={quantity}
              min={1}
              max={MAX_QUANTITY}
              onChange={setQuantity}
              decreaseLabel={m['a11y.decrease']}
              increaseLabel={m['a11y.increase']}
            />
          </div>
          <Button size="lg" fullWidth onClick={add} disabled={options.length > 0 && size === null}>
            {unitPrice === null
              ? m['detail.add']
              : tf('detail.add_with_price', { price: usd(multiplyCents(cents(unitPrice), quantity)) })}
          </Button>
        </div>
      </div>
    </div>
  )
}
