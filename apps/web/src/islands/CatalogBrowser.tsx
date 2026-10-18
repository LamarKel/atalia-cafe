// Catálogo de catering (docs/design/02-catalogo.png): búsqueda, filtros por categoría e invitados, y tarjetas.
// Recibe los productos ya cargados de la BD y los textos ya traducidos; aquí solo se filtra en el navegador.
import { cents, formatUSD } from '@atalia/shared/money'
import { OptionGroup, Tag, type Option } from '@atalia/ui'
import { useEffect, useId, useMemo, useState } from 'react'
import { matchesGuests, type GuestFilter } from '../lib/catalog-format'
import type { CateringCategory, CateringProduct } from '../lib/catalog'
import type { Locale, MessageKey } from '../i18n'

export interface CatalogBrowserProps {
  locale: Locale
  title: string
  subtitle: string | undefined
  leadTimeNote: string | undefined
  categories: CateringCategory[]
  products: CateringProduct[]
  messages: Record<MessageKey, string>
  /** Rutas ya localizadas: base del detalle ("/es/catering") y del armador ("/es/picadera"). */
  detailBase: string
  picaderaHref: string
}

const GUESTS: GuestFilter[] = ['5', '10', '15', '20+']
const tints = ['bg-sage-soft', 'bg-blush', 'bg-sand'] as const

/** Quita acentos y mayúsculas para buscar "charcuteria" y encontrar "Charcutería". */
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function CatalogBrowser(props: CatalogBrowserProps) {
  const { messages: m, locale, categories, products } = props
  const tf = (key: MessageKey, params: Record<string, string | number>) =>
    m[key].replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))

  const [category, setCategory] = useState<string>('all')
  const [guests, setGuests] = useState<GuestFilter | null>(null)
  const [query, setQuery] = useState('')
  const searchId = useId()
  const resultsId = useId()

  // ?category=trays desde las tarjetas del inicio
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('category')
    if (fromUrl !== null && categories.some((c) => c.slug === fromUrl)) setCategory(fromUrl)
  }, [categories])

  const selectCategory = (slug: string) => {
    setCategory(slug)
    const url = new URL(window.location.href)
    if (slug === 'all') url.searchParams.delete('category')
    else url.searchParams.set('category', slug)
    window.history.replaceState(null, '', url)
  }

  const counts = useMemo(() => {
    const byCategory = new Map<string, number>()
    for (const p of products) byCategory.set(p.categorySlug, (byCategory.get(p.categorySlug) ?? 0) + 1)
    return byCategory
  }, [products])

  const visible = useMemo(() => {
    const q = normalize(query.trim())
    return products.filter(
      (p) =>
        (category === 'all' || p.categorySlug === category) &&
        matchesGuests(p.sizes, guests) &&
        (q === '' || normalize(`${p.name} ${p.shortDescription ?? ''} ${m[`type.${p.type}`]}`).includes(q)),
    )
  }, [products, category, guests, query, m])

  const guestOptions: Option<GuestFilter>[] = GUESTS.map((g) => ({ value: g, label: g }))
  const clearFilters = () => {
    selectCategory('all')
    setGuests(null)
    setQuery('')
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-10 md:px-8 md:pt-14">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-heading text-4xl font-bold md:text-5xl">{props.title}</h1>
          {props.subtitle !== undefined && <p className="mt-2 text-muted">{props.subtitle}</p>}
        </div>
        <div className="relative w-full md:max-w-sm">
          <label htmlFor={searchId} className="sr-only">
            {m['catalog.search_label']}
          </label>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={m['catalog.search_placeholder']}
            aria-controls={resultsId}
            className="min-h-12 w-full rounded-full border border-dark/15 bg-white py-3 pl-12 pr-5 text-[15px] placeholder:text-muted focus:border-secondary focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          />
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[280px_1fr]">
        <aside aria-label={m['catalog.filters']} className="h-fit rounded-2xl bg-white p-6 shadow-sm">
          <fieldset>
            <legend className="mb-3 font-semibold">{m['catalog.category']}</legend>
            <ul className="space-y-1">
              {[
                { slug: 'all', name: m['catalog.all'], count: products.length },
                ...categories.map((c) => ({ slug: c.slug, name: c.name, count: counts.get(c.slug) ?? 0 })),
              ].map((opt) => (
                <li key={opt.slug}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3">
                    <input
                      type="radio"
                      name="category"
                      value={opt.slug}
                      checked={category === opt.slug}
                      onChange={() => selectCategory(opt.slug)}
                      className="size-5 accent-secondary"
                    />
                    <span>
                      {opt.name} <span className="text-muted">({opt.count})</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          <div className="mt-6">
            <OptionGroup
              label={m['catalog.guests']}
              options={guestOptions}
              value={guests}
              // Tocar el invitado ya elegido lo quita
              onChange={(v) => setGuests((current) => (current === v ? null : v))}
              tone="catering"
            />
          </div>

          {props.leadTimeNote !== undefined && (
            <p className="mt-6 rounded-xl bg-sand p-4 text-sm leading-relaxed">{props.leadTimeNote}</p>
          )}
        </aside>

        <section aria-labelledby={`${resultsId}-label`}>
          <p id={`${resultsId}-label`} className="sr-only" aria-live="polite">
            {tf('catalog.results', { n: visible.length })}
          </p>
          {visible.length === 0 ? (
            <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
              <p className="text-muted">{m['catalog.no_results']}</p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 inline-flex min-h-11 items-center rounded-full border border-secondary px-6 font-semibold text-secondary hover:bg-secondary/5"
              >
                {m['catalog.clear_filters']}
              </button>
            </div>
          ) : (
            <ul id={resultsId} className="grid grid-cols-2 gap-3 sm:gap-6 xl:grid-cols-3">
              {visible.map((p, i) => {
                const href = p.type === 'picadera_pack' ? props.picaderaHref : `${props.detailBase}/${p.slug}`
                const amounts =
                  p.amounts === null
                    ? null
                    : tf(p.amounts.kind === 'serves' ? 'catalog.serves' : 'catalog.pieces', {
                        list: p.amounts.values.join(' · '),
                      })
                return (
                  <li
                    key={p.id}
                    className="overflow-hidden rounded-2xl bg-white shadow-sm transition-shadow hover:shadow-md"
                  >
                    <a href={href} className="group flex h-full flex-col focus-visible:outline-offset-[-4px]">
                      {p.imageUrl !== null ? (
                        <img
                          src={p.imageUrl}
                          alt={p.imageAlt ?? ''}
                          loading="lazy"
                          className="aspect-[4/3] w-full object-cover sm:aspect-auto sm:h-44"
                        />
                      ) : (
                        <div
                          aria-hidden="true"
                          className={`flex aspect-[4/3] items-center justify-center px-2 text-center sm:aspect-auto sm:h-44 ${tints[i % tints.length]}`}
                        >
                          <span className="text-xs text-muted sm:text-sm">
                            {m['catalog.photo_placeholder']}
                          </span>
                        </div>
                      )}
                      <div className="flex flex-1 flex-col p-3 sm:p-5">
                        <div>
                          <Tag tone="sage">{m[`type.${p.type}`]}</Tag>
                        </div>
                        <h2 className="mt-2 font-heading text-lg font-bold leading-snug sm:mt-3 sm:text-2xl">
                          {p.name}
                        </h2>
                        {amounts !== null && <p className="mt-1 text-xs text-muted sm:text-sm">{amounts}</p>}
                        <div className="mt-auto flex flex-col gap-1 pt-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:pt-5">
                          <p className="text-sm font-semibold text-secondary sm:whitespace-nowrap sm:text-base">
                            {p.fromPriceCents === null
                              ? m['catalog.price_tbd']
                              : tf('catalog.from', { price: formatUSD(cents(p.fromPriceCents), locale) })}
                          </p>
                          <p className="shrink-0 whitespace-nowrap text-xs text-muted sm:text-sm">
                            {tf('catalog.lead_hours', { n: p.minLeadHours })}
                          </p>
                        </div>
                      </div>
                    </a>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
