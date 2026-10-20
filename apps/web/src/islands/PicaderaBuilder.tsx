// Armador de picaderas (docs/design/04-arma-tu-picadera.png): tamaño del paquete, piezas con ±,
// "Combínalas por mí" y resumen con barra de progreso. El botón se activa solo con la cuenta exacta (RF06).
// Las reglas viven en @atalia/shared/picadera; el Worker las vuelve a validar al pagar.
import { cents, formatUSD } from '@atalia/shared/money'
import { autoDistribute, fitToUnits, isComplete, toComponents, totalPieces } from '@atalia/shared/picadera'
import { Button, OptionGroup, QuantityStepper, ToastProvider, useToast, type Option } from '@atalia/ui'
import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { addToCart } from '../lib/cart'
import type { PicaderaBuilderData } from '../lib/catalog'
import type { Locale, MessageKey } from '../i18n'

export interface PicaderaBuilderProps extends PicaderaBuilderData {
  locale: Locale
  title: string
  subtitle: string | undefined
  messages: Record<MessageKey, string>
}

export default function PicaderaBuilder(props: PicaderaBuilderProps) {
  return (
    <ToastProvider
      closeLabel={props.messages['a11y.close']}
      regionLabel={props.messages['a11y.notifications']}
    >
      <Builder {...props} />
    </ToastProvider>
  )
}

function Builder({ locale, title, subtitle, product, sizes, pieces, messages: m }: PicaderaBuilderProps) {
  const tf = (key: MessageKey, params: Record<string, string | number>) =>
    m[key].replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
  const usd = (value: number) => formatUSD(cents(value), locale)
  const toast = useToast()
  const reduceMotion = useReducedMotion()

  const [sizeId, setSizeId] = useState<string | null>(sizes[1]?.id ?? sizes[0]?.id ?? null)
  const [counts, setCounts] = useState<Record<string, number>>({})

  const size = sizes.find((s) => s.id === sizeId) ?? null
  const units = size?.units ?? 0
  const count = totalPieces(counts)
  const complete = units > 0 && isComplete(units, counts)
  const progress = units === 0 ? 0 : Math.min(count / units, 1)

  const status =
    count === units
      ? m['picadera.complete']
      : count < units
        ? tf('picadera.remaining', { n: units - count })
        : tf('picadera.too_many', { n: count - units })

  const sizeOptions: Option<string>[] = sizes.map((s) => ({
    value: s.id,
    label: String(s.units),
    caption: s.priceCents === null ? m['picadera.pieces'] : `${m['picadera.pieces']} · ${usd(s.priceCents)}`,
  }))

  const chooseSize = (id: string) => {
    setSizeId(id)
    const next = sizes.find((s) => s.id === id)?.units ?? 0
    setCounts((prev) => fitToUnits(next, prev))
  }

  const setPiece = (id: string, qty: number) =>
    setCounts((prev) => Object.fromEntries(Object.entries({ ...prev, [id]: qty }).filter(([, n]) => n > 0)))

  const label = (id: string) => {
    const piece = pieces.find((p) => p.id === id)
    return piece === undefined ? '' : `${piece.pieceType} · ${piece.filling}`
  }

  const add = () => {
    if (size === null || !complete) return
    addToCart({
      productId: product.id,
      slug: product.slug,
      type: 'picadera_pack',
      name: product.name,
      sizeId: size.id,
      sizeLabel: size.label,
      serves: null,
      units,
      unitPriceCents: size.priceCents,
      quantity: 1,
      notes: '',
      minLeadHours: product.minLeadHours,
      components: toComponents(counts).map((c) => ({ ...c, label: label(c.optionId) })),
    })
    toast(tf('picadera.added', { units }))
    setCounts({})
  }

  const selected = pieces.filter((p) => (counts[p.id] ?? 0) > 0)

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 pb-24 pt-10 md:px-8 md:pt-14 lg:grid-cols-[1fr_22rem] lg:gap-10">
      <div>
        <h1 className="font-heading text-4xl font-bold text-dark md:text-5xl">{title}</h1>
        {subtitle !== undefined && <p className="mt-2 text-lg text-muted">{subtitle}</p>}

        <div className="mt-8">
          <OptionGroup
            label={m['picadera.step_size']}
            options={sizeOptions}
            value={sizeId}
            onChange={chooseSize}
            layout="tile"
          />
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">{m['picadera.step_pieces']}</h2>
          <Button
            variant="outline"
            onClick={() =>
              setCounts(
                autoDistribute(
                  units,
                  pieces.map((p) => p.id),
                ),
              )
            }
            disabled={units === 0 || pieces.length === 0}
          >
            {m['picadera.auto']}
          </Button>
        </div>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {pieces.map((piece) => {
            const qty = counts[piece.id] ?? 0
            return (
              <li key={piece.id} className="flex items-center gap-3 rounded-2xl bg-white p-3 md:p-4">
                <div className="size-12 shrink-0 overflow-hidden rounded-xl bg-sand">
                  {piece.imageUrl !== null && (
                    <img src={piece.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">{piece.pieceType}</p>
                  <p className="text-sm text-muted">{piece.filling}</p>
                </div>
                <QuantityStepper
                  label={`${piece.pieceType} ${piece.filling}`}
                  value={qty}
                  onChange={(n) => setPiece(piece.id, n)}
                  decreaseLabel={m['a11y.decrease']}
                  increaseLabel={m['a11y.increase']}
                  increaseDisabled={count >= units}
                />
              </li>
            )
          })}
        </ul>
      </div>

      <aside className="lg:pt-10">
        <div className="lg:sticky lg:top-28">
          <p className="flex items-center gap-2 rounded-2xl bg-sand px-4 py-3 text-sm">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-5 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" strokeLinecap="round" />
            </svg>
            {tf('picadera.note', { n: product.minLeadHours })}
          </p>

          <section aria-labelledby="picadera-summary" className="mt-4 rounded-3xl bg-white p-6 shadow-sm">
            <h2 id="picadera-summary" className="font-heading text-2xl font-bold">
              {m['picadera.summary']}
            </h2>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={units}
              aria-valuenow={count}
              aria-label={m['picadera.summary']}
              className="mt-4 h-2 overflow-hidden rounded-full bg-dark/10"
            >
              <motion.div
                className="h-full origin-left rounded-full bg-secondary"
                initial={false}
                animate={{ scaleX: progress }}
                transition={
                  reduceMotion === true ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 30 }
                }
              />
            </div>
            <p className="mt-2 text-sm font-semibold text-secondary" aria-live="polite">
              {tf('picadera.progress', { count, units })} · {status}
            </p>

            {selected.length === 0 ? (
              <p className="mt-4 text-sm text-muted">{m['picadera.empty']}</p>
            ) : (
              <ul className="mt-4 divide-y divide-dark/10 border-b border-dark/10 text-sm">
                {selected.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3 py-2.5">
                    <span>
                      {p.pieceType} · {p.filling}
                    </span>
                    <span className="font-semibold">× {counts[p.id]}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-6 flex items-center justify-between border-t border-dark/10 pt-4">
              <span className="font-semibold">{m['picadera.total']}</span>
              <span className="text-xl font-semibold text-secondary">
                {size?.priceCents == null ? m['catalog.price_tbd'] : usd(size.priceCents)}
              </span>
            </div>
            <Button size="lg" fullWidth className="mt-4" onClick={add} disabled={!complete}>
              {tf('picadera.add', { units })}
            </Button>
            {!complete && (
              <p className="mt-3 text-center text-xs text-muted">{tf('picadera.helper', { units })}</p>
            )}
          </section>
        </div>
      </aside>
    </div>
  )
}
