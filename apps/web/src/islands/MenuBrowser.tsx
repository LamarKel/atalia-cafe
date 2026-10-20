// Menú del café. Funciones de la app anterior (D:\Dev\cafe/menu.html): categorías agrupadas con la activa
// marcada al hacer scroll, búsqueda, "Agregar" directo, modal con tamaños, extras, nutrición y cantidad, y
// selector de dónde recoger antes de agregar. Aspecto: el lenguaje de la pantalla 02 (Catálogo).
import { cents, formatUSD, multiplyCents } from '@atalia/shared/money'
import {
  Button,
  Dialog,
  OptionGroup,
  QuantityStepper,
  Tag,
  ToastProvider,
  ToggleChip,
  useToast,
  type Option,
} from '@atalia/ui'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { addToCart } from '../lib/cart'
import type { MenuCategory, MenuItem, PickupStore } from '../lib/catalog'
import {
  activeSection,
  cardPrice,
  centeredScroll,
  groupCategories,
  needsOptions,
  searchMenu,
  unitPrice,
} from '../lib/menu'
import { getPickup, onPickupChange, setPickup, type PickupChoice } from '../lib/pickup'
import type { Locale, MessageKey } from '../i18n'

export interface MenuBrowserProps {
  locale: Locale
  messages: Record<MessageKey, string>
  categories: MenuCategory[]
  stores: PickupStore[]
}

type Messages = Record<MessageKey, string>
const MAX_QUANTITY = 20
const tints = ['bg-sage-soft', 'bg-blush', 'bg-sand'] as const

export default function MenuBrowser(props: MenuBrowserProps) {
  return (
    <ToastProvider
      closeLabel={props.messages['a11y.close']}
      regionLabel={props.messages['a11y.notifications']}
    >
      <Menu {...props} />
    </ToastProvider>
  )
}

function Menu({ locale, messages: m, categories, stores }: MenuBrowserProps) {
  const tf = (key: MessageKey, params: Record<string, string | number>) =>
    m[key].replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
  const usd = (value: number) => formatUSD(cents(value), locale)
  const toast = useToast()
  const searchId = useId()

  const [query, setQuery] = useState('')
  const [active, setActive] = useState<string | null>(categories[0]?.id ?? null)
  const [open, setOpen] = useState<MenuItem | null>(null)
  const [pickup, setPickupState] = useState<PickupChoice | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  // Lo que se quería agregar antes de elegir dónde recoger; se agrega al guardar.
  const pending = useRef<(() => void) | null>(null)

  useEffect(() => {
    // Con una sola tienda y un solo punto no hay nada que elegir.
    const saved = getPickup()
    const only = stores.length === 1 && stores[0]?.locations.length === 1 ? stores[0] : null
    if (saved === null && only !== null) {
      const choice = { storeId: only.id, locationId: only.locations[0]?.id ?? null }
      setPickup(choice)
      setPickupState(choice)
    } else setPickupState(saved)
    return onPickupChange(setPickupState)
  }, [stores])

  const visible = useMemo(() => searchMenu(categories, query), [categories, query])
  const groups = useMemo(() => groupCategories(visible), [visible])
  const store = stores.find((s) => s.id === pickup?.storeId) ?? null
  const location = store?.locations.find((l) => l.id === pickup?.locationId) ?? null

  // Categoría activa según el scroll (scroll spy de la app anterior): la última cuyo título ya pasó las
  // barras fijas. Mientras se salta a una categoría con un clic, se respeta esa elección.
  const lockUntil = useRef(0)
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      if (performance.now() < lockUntil.current) return
      // Encabezado + fila de categorías (teléfono) o encabezado (escritorio), con un margen
      const offset = window.innerWidth >= 1024 ? 180 : 170
      const sections = visible.flatMap((c) => {
        const el = document.getElementById(`cat-${c.slug}`)
        return el === null ? [] : [{ id: c.id, top: el.getBoundingClientRect().top }]
      })
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
      const id = activeSection(sections, offset, atBottom)
      if (id !== null) setActive(id)
    }
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [visible])

  // La categoría activa siempre a la vista: centrada en la fila del teléfono y en la barra lateral.
  const pillRow = useRef<HTMLUListElement>(null)
  const sidebar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (active === null) return
    const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth'
    const pill = pillRow.current?.querySelector<HTMLElement>(`[data-cat="${active}"]`)
    if (pillRow.current && pill) {
      pillRow.current.scrollTo({
        left: centeredScroll(pill.offsetLeft, pill.offsetWidth, pillRow.current.clientWidth),
        behavior,
      })
    }
    const link = sidebar.current?.querySelector<HTMLElement>(`[data-cat="${active}"]`)
    if (sidebar.current && link) {
      const box = sidebar.current.getBoundingClientRect()
      const r = link.getBoundingClientRect()
      if (r.top < box.top || r.bottom > box.bottom) {
        sidebar.current.scrollTo({
          top: centeredScroll(r.top - box.top + sidebar.current.scrollTop, r.height, box.height),
          behavior,
        })
      }
    }
  }, [active])

  const withPickup = (action: () => void) => {
    if (pickup !== null && store !== null) {
      action()
      return
    }
    pending.current = action
    toast(m['pickup.required'], { tone: 'warning' })
    setPickerOpen(true)
  }

  const add = (item: MenuItem, sizeId: string | null, extraIds: string[], quantity: number) => {
    const size = item.sizes.find((s) => s.id === sizeId) ?? null
    addToCart({
      productId: item.id,
      slug: item.id,
      type: 'menu',
      name: item.name,
      sizeId: size?.id ?? null,
      sizeLabel: size?.name ?? null,
      serves: null,
      units: null,
      unitPriceCents: unitPrice(item, sizeId, extraIds),
      quantity,
      notes: '',
      minLeadHours: 0,
      components: [],
      extras: item.extras
        .filter((e) => extraIds.includes(e.id))
        .map((e) => ({ id: e.id, name: e.name, priceCents: e.priceCents })),
    })
    toast(tf('menu.added', { name: item.name }))
  }

  const quickAdd = (item: MenuItem) => {
    if (needsOptions(item)) setOpen(item)
    else withPickup(() => add(item, null, [], 1))
  }

  const jump = (category: MenuCategory) => {
    // Durante el desplazamiento suave no se recalcula (si no, la marca pasa por todas las categorías del medio)
    lockUntil.current = performance.now() + 900
    setActive(category.id)
    document.getElementById(`cat-${category.slug}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-10 md:px-8 md:pt-14">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-heading text-4xl font-bold text-dark md:text-5xl">{m['menu.title']}</h1>
          <p className="mt-2 text-lg text-muted">{m['menu.subtitle']}</p>
        </div>
        <div className="relative w-full md:max-w-sm">
          <label htmlFor={searchId} className="sr-only">
            {m['menu.search_label']}
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
            placeholder={m['menu.search_placeholder']}
            className="block min-h-12 w-full rounded-full border border-dark/15 bg-white pl-12 pr-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          />
        </div>
      </div>

      {/* Dónde recoger (la app anterior lo pedía antes de agregar) */}
      <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-white px-4 py-3 text-sm">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-5 text-secondary"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11Z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
        {store === null ? (
          <span>{m['pickup.title']}</span>
        ) : (
          <span>
            {m['pickup.at']}: <strong>{store.name}</strong>
            {location !== null && ` · ${location.name}`}
          </span>
        )}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="min-h-11 font-semibold text-secondary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
        >
          {store === null ? m['pickup.choose'] : m['pickup.change']}
        </button>
      </div>

      {/* Teléfono: categorías en una fila que se desliza y se queda arriba */}
      <nav
        aria-label={m['menu.jump_to']}
        className="sticky top-16 z-30 -mx-4 mt-4 border-b border-dark/5 bg-accent/95 px-4 py-2 backdrop-blur lg:hidden"
      >
        <ul ref={pillRow} className="flex gap-2 overflow-x-auto pb-1">
          {visible.map((c) => (
            <li key={c.id} className="shrink-0">
              <button
                type="button"
                data-cat={c.id}
                onClick={() => jump(c)}
                aria-current={active === c.id ? 'true' : undefined}
                className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary ${
                  active === c.id
                    ? 'border-secondary bg-secondary text-white'
                    : 'border-dark/15 bg-white text-dark'
                }`}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-6 grid gap-8 lg:mt-10 lg:grid-cols-[16rem_1fr] lg:gap-10">
        {/* Escritorio: barra lateral como el filtro de la pantalla 02 */}
        <nav aria-label={m['menu.categories']} className="hidden lg:block">
          <div
            ref={sidebar}
            className="sticky top-28 max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-3xl bg-white p-5"
          >
            {groups.map((g) => (
              <div key={g.group} className="mb-4 last:mb-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  {m[`menu.group.${g.group}` as MessageKey] ?? g.group}
                </p>
                <ul>
                  {g.categories.map((c) => (
                    <li key={c.id}>
                      <a
                        data-cat={c.id}
                        href={`#cat-${c.slug}`}
                        onClick={(e) => {
                          e.preventDefault()
                          jump(c)
                        }}
                        aria-current={active === c.id ? 'true' : undefined}
                        className={`flex min-h-11 items-center justify-between rounded-xl px-3 text-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary ${
                          active === c.id
                            ? 'bg-sage-soft font-semibold text-dark'
                            : 'text-dark hover:bg-dark/5'
                        }`}
                      >
                        {c.name}
                        <span className="text-xs text-muted">{c.items.length}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <div className="min-w-0">
          {visible.length === 0 && (
            <p role="status" className="rounded-3xl bg-white p-10 text-center text-muted">
              {tf('menu.no_results', { q: query.trim() })}
            </p>
          )}
          {visible.map((c) => (
            <section
              key={c.id}
              id={`cat-${c.slug}`}
              data-category={c.id}
              aria-labelledby={`cat-${c.slug}-title`}
              className="mb-12 scroll-mt-36 last:mb-0 lg:scroll-mt-28"
            >
              <h2
                id={`cat-${c.slug}-title`}
                className="font-heading text-2xl font-bold text-dark md:text-3xl"
              >
                {c.name}
              </h2>
              {c.description !== null && <p className="mt-1 text-muted">{c.description}</p>}
              {c.items.length === 0 ? (
                <p className="mt-4 text-sm text-muted">{m['menu.empty_category']}</p>
              ) : (
                <ul className="mt-4 grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-3">
                  {c.items.map((item, i) => (
                    <li key={item.id}>
                      <MenuCard
                        item={item}
                        tint={tints[i % tints.length] ?? 'bg-sand'}
                        m={m}
                        usd={usd}
                        onOpen={() => setOpen(item)}
                        onAdd={() => quickAdd(item)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>

      {open !== null && (
        <ProductDialog
          key={open.id}
          item={open}
          m={m}
          usd={usd}
          onClose={() => setOpen(null)}
          onAdd={(sizeId, extraIds, qty) =>
            withPickup(() => {
              add(open, sizeId, extraIds, qty)
              setOpen(null)
            })
          }
        />
      )}

      <PickupDialog
        open={pickerOpen}
        stores={stores}
        current={pickup}
        m={m}
        onClose={() => {
          pending.current = null
          setPickerOpen(false)
        }}
        onSave={(choice) => {
          setPickup(choice)
          setPickupState(choice)
          setPickerOpen(false)
          const action = pending.current
          pending.current = null
          action?.()
        }}
      />
    </div>
  )
}

function MenuCard(props: {
  item: MenuItem
  tint: string
  m: Messages
  usd: (v: number) => string
  onOpen: () => void
  onAdd: () => void
}) {
  const { item, m } = props
  const price = cardPrice(item)
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm">
      <button
        type="button"
        onClick={props.onOpen}
        className="group text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
      >
        <div className={`relative aspect-[4/3] overflow-hidden ${props.tint}`}>
          {item.imageUrl !== null ? (
            <img
              src={item.imageUrl}
              alt=""
              loading="lazy"
              className={`size-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-105 ${item.soldOut ? 'opacity-50 grayscale' : ''}`}
            />
          ) : (
            <div className="flex size-full items-center justify-center p-3 text-center text-xs text-muted">
              {m['catalog.photo_placeholder']}
            </div>
          )}
          {item.featured && (
            <span className="absolute left-2 top-2">
              <Tag tone="brown">{m['menu.featured']}</Tag>
            </span>
          )}
        </div>
        <div className="px-3 pt-3 md:px-4 md:pt-4">
          <h3 className="font-heading text-lg font-bold leading-tight text-dark md:text-xl">{item.name}</h3>
          {item.description !== null && (
            <p className="mt-1 line-clamp-2 text-xs text-muted md:text-sm">{item.description}</p>
          )}
        </div>
      </button>
      <div className="mt-auto flex flex-col gap-2 px-3 pb-3 pt-3 sm:flex-row sm:items-center sm:justify-between md:px-4 md:pb-4">
        <span className="font-semibold text-secondary">
          {price === null ? m['catalog.price_tbd'] : props.usd(price)}
        </span>
        <Button
          size="md"
          className="!min-h-11 !px-4 !py-2 text-sm"
          disabled={item.soldOut || price === null}
          onClick={props.onAdd}
          aria-label={item.soldOut ? `${item.name}: ${m['menu.sold_out']}` : `${m['menu.add']} ${item.name}`}
        >
          {item.soldOut ? m['menu.sold_out'] : `+ ${m['menu.add']}`}
        </Button>
      </div>
    </article>
  )
}

function ProductDialog(props: {
  item: MenuItem
  m: Messages
  usd: (v: number) => string
  onClose: () => void
  onAdd: (sizeId: string | null, extraIds: string[], quantity: number) => void
}) {
  const { item, m } = props
  const [sizeId, setSizeId] = useState<string | null>(item.sizes[0]?.id ?? null)
  const [extraIds, setExtraIds] = useState<string[]>([])
  const [quantity, setQuantity] = useState(1)
  const unit = unitPrice(item, sizeId, extraIds)
  const total = unit === null ? null : multiplyCents(unit, quantity)

  const sizeOptions: Option<string>[] = item.sizes.map((s) => ({
    value: s.id,
    label: s.name,
    ...(s.priceCents !== null && item.priceCents !== null && s.priceCents > item.priceCents
      ? { caption: `+${props.usd(s.priceCents - item.priceCents)}` }
      : {}),
  }))

  return (
    <Dialog
      open
      onClose={props.onClose}
      title={item.name}
      closeLabel={m['menu.close']}
      size="lg"
      media={
        item.imageUrl !== null ? (
          <img src={item.imageUrl} alt="" className="aspect-[16/9] w-full object-cover" />
        ) : undefined
      }
      footer={
        <div className="flex items-center gap-3">
          <div className="inline-flex shrink-0 rounded-full border border-dark/15 px-2 py-1">
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
          <Button
            fullWidth
            size="lg"
            disabled={item.soldOut || total === null}
            onClick={() => props.onAdd(sizeId, extraIds, quantity)}
          >
            {item.soldOut
              ? m['menu.sold_out']
              : total === null
                ? m['menu.add']
                : m['menu.add_with_price'].replace('{price}', props.usd(total))}
          </Button>
        </div>
      }
    >
      {item.description !== null && <p className="mt-2 text-muted">{item.description}</p>}

      {item.nutrition.length > 0 && (
        <div className="mt-4">
          <p className="sr-only">{m['menu.nutrition']}</p>
          <ul className="flex flex-wrap gap-2 text-xs">
            {item.nutrition.map((n) => (
              <li key={n.label} className="rounded-full bg-sand px-3 py-1">
                <strong>{n.label}:</strong> {n.value}
              </li>
            ))}
          </ul>
        </div>
      )}

      {sizeOptions.length > 0 && (
        <div className="mt-6">
          <OptionGroup
            label={m['menu.size']}
            options={sizeOptions}
            value={sizeId}
            onChange={setSizeId}
            tone="catering"
          />
        </div>
      )}

      {item.extras.length > 0 && (
        <div className="mt-6">
          <p id={`extras-${item.id}`} className="mb-3 font-semibold">
            {m['menu.extras']}
          </p>
          <div role="group" aria-labelledby={`extras-${item.id}`} className="flex flex-wrap gap-2">
            {item.extras.map((e) => (
              <ToggleChip
                key={e.id}
                tone="catering"
                pressed={extraIds.includes(e.id)}
                onPressedChange={(on) =>
                  setExtraIds((ids) => (on ? [...ids, e.id] : ids.filter((x) => x !== e.id)))
                }
              >
                {e.name}
                {e.priceCents > 0 && (
                  <span className="ml-1 text-xs opacity-80">+{props.usd(e.priceCents)}</span>
                )}
              </ToggleChip>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  )
}

function PickupDialog(props: {
  open: boolean
  stores: PickupStore[]
  current: PickupChoice | null
  m: Messages
  onClose: () => void
  onSave: (choice: PickupChoice) => void
}) {
  const { stores, m } = props
  const [storeId, setStoreId] = useState<string | null>(null)
  const [locationId, setLocationId] = useState<string | null>(null)

  useEffect(() => {
    if (!props.open) return
    const first = props.current?.storeId ?? stores[0]?.id ?? null
    setStoreId(first)
    const s = stores.find((x) => x.id === first)
    setLocationId(props.current?.locationId ?? s?.locations[0]?.id ?? null)
  }, [props.open, props.current, stores])

  const store = stores.find((s) => s.id === storeId)

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title={m['pickup.title']}
      closeLabel={m['menu.close']}
      footer={
        <Button
          fullWidth
          size="lg"
          disabled={storeId === null || ((store?.locations.length ?? 0) > 0 && locationId === null)}
          onClick={() => storeId !== null && props.onSave({ storeId, locationId })}
        >
          {m['pickup.save']}
        </Button>
      }
    >
      <p className="mt-2 text-muted">{m['pickup.subtitle']}</p>
      {stores.length > 1 && (
        <div className="mt-6">
          <OptionGroup
            label={m['pickup.store']}
            options={stores.map((s) => ({
              value: s.id,
              label: s.name,
              ...(s.address ? { caption: s.address } : {}),
            }))}
            value={storeId}
            onChange={(id) => {
              setStoreId(id)
              setLocationId(stores.find((s) => s.id === id)?.locations[0]?.id ?? null)
            }}
            layout="tile"
            tone="catering"
          />
        </div>
      )}
      {stores.length === 1 && store !== undefined && (
        <p className="mt-4 rounded-2xl bg-sand px-4 py-3 text-sm">
          <strong>{store.name}</strong>
          {store.address !== null && ` · ${store.address}`}
        </p>
      )}
      {store !== undefined && store.locations.length > 0 && (
        <div className="mt-6">
          <OptionGroup
            label={m['pickup.location']}
            options={store.locations.map((l) => ({
              value: l.id,
              label: l.name,
              ...(l.description ? { caption: l.description } : {}),
            }))}
            value={locationId}
            onChange={setLocationId}
            layout="tile"
            tone="catering"
          />
        </div>
      )}
    </Dialog>
  )
}
