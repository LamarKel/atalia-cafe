// Catálogo (menú) y Catering en el panel: lista de productos con búsqueda y filtros, interruptores rápidos
// (visible, agotado), categorías y, en catering, las piezas de la picadera. Edición en ProductEditor.
import { cents, formatUSD } from '@atalia/shared/money'
import { Button, Dialog, useToast } from '@atalia/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  listCategories,
  listPieces,
  listProducts,
  saveCategory,
  savePiece,
  setProductFlags,
  swapOrder,
  toWebp,
  uploadImage,
  type AdminCategory,
  type PicaderaPiece,
  type ProductRow,
  type Section,
} from '../../lib/catalog'
import { slugify } from '@atalia/shared/catalog'
import type { AdminKey } from '../../i18n'
import { Switch, TextField } from '../components/Fields'
import { useI18n } from '../i18n-context'
import { ProductEditor } from './ProductEditor'

type Tab = 'products' | 'categories' | 'pieces'
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function Catalog({ section }: { section: Section }) {
  const { t, locale } = useI18n()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('products')
  const [categories, setCategories] = useState<AdminCategory[] | null>(null)
  const [products, setProducts] = useState<ProductRow[] | null>(null)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [failed, setFailed] = useState(false)

  const name = (en: string, es: string | null) => (locale === 'es' && es ? es : en)
  const usd = (v: number) => formatUSD(cents(v), locale)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const [c, p] = await Promise.all([listCategories(section), listProducts(section)])
      setCategories(c)
      setProducts(p)
    } catch {
      setFailed(true)
    }
  }, [section])

  useEffect(() => {
    setTab('products')
    setEditing(null)
    setCategory('all')
    void load()
  }, [load])

  const visible = useMemo(() => {
    const q = normalize(query.trim())
    return (products ?? []).filter(
      (p) =>
        (category === 'all' || p.categoryId === category) &&
        (q === '' || normalize(`${p.nameEn} ${p.nameEs ?? ''}`).includes(q)),
    )
  }, [products, category, query])

  const flag = async (p: ProductRow, flags: Parameters<typeof setProductFlags>[1]) => {
    try {
      await setProductFlags(p.id, flags)
      setProducts((list) =>
        list === null
          ? list
          : list.map((x) =>
              x.id === p.id
                ? {
                    ...x,
                    ...(flags.active !== undefined ? { active: flags.active } : {}),
                    ...(flags.soldOut !== undefined ? { soldOut: flags.soldOut } : {}),
                  }
                : x,
            ),
      )
      toast(t('cat.saved'))
    } catch (e) {
      toast(t('cat.save_error', { msg: e instanceof Error ? e.message : '' }), { tone: 'error' })
    }
  }

  if (editing !== null && categories !== null) {
    return (
      <ProductEditor
        productId={editing === 'new' ? null : editing}
        section={section}
        categories={categories}
        onClose={(changed) => {
          setEditing(null)
          if (changed) void load()
        }}
      />
    )
  }

  const tabs: Array<{ key: Tab; label: AdminKey }> = [
    { key: 'products', label: 'cat.products' },
    { key: 'categories', label: 'cat.categories' },
    ...(section === 'catering' ? [{ key: 'pieces' as const, label: 'cat.pieces' as const }] : []),
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 tabIndex={-1} className="font-heading text-3xl font-bold md:text-4xl">
          {t(section === 'menu' ? 'nav.catalog' : 'nav.catering')}
        </h1>
        <div
          role="tablist"
          aria-label={t(section === 'menu' ? 'nav.catalog' : 'nav.catering')}
          className="inline-flex flex-wrap rounded-full bg-white p-1"
        >
          {tabs.map((x) => (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={tab === x.key}
              onClick={() => setTab(x.key)}
              className={`min-h-11 rounded-full px-4 text-sm font-medium ${tab === x.key ? 'bg-secondary text-white' : 'text-dark hover:bg-dark/5'}`}
            >
              {t(x.label)}
            </button>
          ))}
        </div>
      </div>

      {failed && (
        <div
          role="alert"
          className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-blush px-4 py-3 text-sm"
        >
          {t('dash.error')}
          <button
            type="button"
            onClick={() => void load()}
            className="min-h-11 font-semibold text-secondary underline"
          >
            {t('dash.retry')}
          </button>
        </div>
      )}

      {tab === 'products' && (
        <>
          <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
            <label className="block md:w-72">
              <span className="sr-only">{t('cat.search')}</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('cat.search')}
                className="block min-h-11 w-full rounded-full border border-dark/15 bg-white px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              />
            </label>
            <label className="block md:w-64">
              <span className="sr-only">{t('cat.filter_category')}</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="block min-h-11 w-full rounded-full border border-dark/15 bg-white px-4"
              >
                <option value="all">{t('cat.all_categories')}</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {name(c.nameEn, c.nameEs)} ({c.productCount})
                  </option>
                ))}
              </select>
            </label>
            <div className="md:ml-auto">
              <Button
                onClick={() => setEditing('new')}
                disabled={categories === null || categories.length === 0}
              >
                + {t('cat.new_product')}
              </Button>
            </div>
          </div>

          {products === null ? (
            <p role="status" className="mt-10 text-center text-muted">
              {t('cat.loading')}
            </p>
          ) : visible.length === 0 ? (
            <p className="mt-6 rounded-3xl bg-white p-8 text-center text-muted">{t('cat.empty')}</p>
          ) : (
            <ul className="mt-6 divide-y divide-dark/10 overflow-hidden rounded-3xl bg-white">
              {visible.map((p) => {
                const cat = categories?.find((c) => c.id === p.categoryId)
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-4 p-3 md:p-4">
                    <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-sand">
                      {p.imageUrl !== null && (
                        <img src={p.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{name(p.nameEn, p.nameEs)}</p>
                      <p className="text-sm text-muted">
                        {cat !== undefined && name(cat.nameEn, cat.nameEs)}
                        {section === 'catering' && ` · ${t(`type.${p.type}` as AdminKey)}`}
                        {' · '}
                        <span className="tabular-nums">
                          {p.fromPriceCents === null
                            ? t('cat.price_tbd')
                            : p.priceCents === p.fromPriceCents
                              ? usd(p.fromPriceCents)
                              : t('cat.from', { price: usd(p.fromPriceCents) })}
                        </span>
                      </p>
                      <p className="mt-1 flex flex-wrap gap-1.5">
                        {!p.active && (
                          <span className="rounded-full bg-dark/10 px-2.5 py-0.5 text-xs font-semibold">
                            {t('cat.inactive')}
                          </span>
                        )}
                        {p.soldOut && (
                          <span className="rounded-full bg-blush px-2.5 py-0.5 text-xs font-semibold">
                            {t('cat.sold_out')}
                          </span>
                        )}
                        {p.featured && (
                          <span className="rounded-full bg-sage-soft px-2.5 py-0.5 text-xs font-semibold">
                            {t('cat.featured')}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-x-6 gap-y-1 sm:w-auto">
                      <Switch
                        label={t('cat.visible')}
                        checked={p.active}
                        onChange={(v) => void flag(p, { active: v })}
                      />
                      <Switch
                        label={t('cat.sold_out')}
                        checked={p.soldOut}
                        onChange={(v) => void flag(p, { soldOut: v })}
                      />
                      <Button
                        variant="outline"
                        className="!min-h-11 !py-2 text-sm"
                        onClick={() => setEditing(p.id)}
                      >
                        {t('cat.edit')}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {tab === 'categories' && categories !== null && (
        <Categories section={section} categories={categories} onChanged={() => void load()} />
      )}
      {tab === 'pieces' && <Pieces />}
    </div>
  )
}

function emptyCategory(section: Section, sortOrder: number): AdminCategory {
  return {
    id: '',
    section,
    slug: '',
    nameEn: '',
    nameEs: '',
    descriptionEn: '',
    descriptionEs: '',
    icon: 'fas fa-tag',
    groupName: section === 'menu' ? 'Drinks' : 'Catering',
    imageUrl: null,
    ctaLabelEn: '',
    ctaLabelEs: '',
    sortOrder,
    active: true,
    productCount: 0,
  }
}

function Categories(props: { section: Section; categories: AdminCategory[]; onChanged: () => void }) {
  const { t, locale } = useI18n()
  const toast = useToast()
  const [edit, setEdit] = useState<AdminCategory | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const name = (c: AdminCategory) => (locale === 'es' && c.nameEs ? c.nameEs : c.nameEn)

  const save = async () => {
    if (edit === null) return
    if (edit.nameEn.trim().length < 2) {
      toast(t('err.name_required'), { tone: 'error' })
      return
    }
    setSaving(true)
    try {
      const nul = (v: string | null) => (v === null || v.trim() === '' ? null : v.trim())
      await saveCategory({
        ...edit,
        nameEn: edit.nameEn.trim(),
        nameEs: nul(edit.nameEs),
        descriptionEn: nul(edit.descriptionEn),
        descriptionEs: nul(edit.descriptionEs),
        ctaLabelEn: nul(edit.ctaLabelEn),
        ctaLabelEs: nul(edit.ctaLabelEs),
        slug: edit.slug || slugify(edit.nameEn),
      })
      toast(t('cat.saved'))
      setEdit(null)
      props.onChanged()
    } catch (e) {
      toast(t('cat.save_error', { msg: e instanceof Error ? e.message : '' }), { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const move = async (i: number, d: -1 | 1) => {
    const a = props.categories[i]
    const b = props.categories[i + d]
    if (a === undefined || b === undefined) return
    await swapOrder('categories', a, b)
    props.onChanged()
  }

  return (
    <div className="mt-6">
      <div className="mb-4 flex justify-end">
        <Button
          onClick={() => setEdit(emptyCategory(props.section, (props.categories.at(-1)?.sortOrder ?? 0) + 1))}
        >
          + {t('cat.new_category')}
        </Button>
      </div>
      <ol className="divide-y divide-dark/10 overflow-hidden rounded-3xl bg-white">
        {props.categories.map((c, i) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 p-3 md:p-4">
            <div className="flex flex-col">
              <button
                type="button"
                disabled={i === 0}
                onClick={() => void move(i, -1)}
                aria-label={t('cat.move_up', { name: name(c) })}
                className="inline-flex size-11 items-center justify-center rounded-full hover:bg-dark/5 disabled:opacity-30"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="m6 15 6-6 6 6" />
                </svg>
              </button>
              <button
                type="button"
                disabled={i === props.categories.length - 1}
                onClick={() => void move(i, 1)}
                aria-label={t('cat.move_down', { name: name(c) })}
                className="inline-flex size-11 items-center justify-center rounded-full hover:bg-dark/5 disabled:opacity-30"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </div>
            {c.imageUrl !== null && (
              <img src={c.imageUrl} alt="" className="size-14 rounded-xl object-cover" loading="lazy" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{name(c)}</p>
              <p className="text-sm text-muted">
                {c.groupName} · {c.productCount} {t('cat.products').toLowerCase()}
              </p>
            </div>
            {!c.active && (
              <span className="rounded-full bg-dark/10 px-2.5 py-0.5 text-xs font-semibold">
                {t('cat.inactive')}
              </span>
            )}
            <Button variant="outline" className="!min-h-11 !py-2 text-sm" onClick={() => setEdit(c)}>
              {t('cat.edit')}
            </Button>
          </li>
        ))}
      </ol>

      <Dialog
        open={edit !== null}
        onClose={() => setEdit(null)}
        title={edit?.id === '' ? t('cat.new_category') : edit !== null ? name(edit) : ''}
        closeLabel={t('orders.close')}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEdit(null)}>
              {t('orders.cancel')}
            </Button>
            <Button onClick={() => void save()} loading={saving} loadingLabel={t('cat.saving')}>
              {t('cat.save')}
            </Button>
          </div>
        }
      >
        {edit !== null && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <TextField
              label={t('f.name_es')}
              value={edit.nameEs ?? ''}
              onChange={(v) => setEdit({ ...edit, nameEs: v })}
              maxLength={100}
            />
            <TextField
              label={t('f.name_en')}
              value={edit.nameEn}
              onChange={(v) => setEdit({ ...edit, nameEn: v })}
              maxLength={100}
              required
            />
            <TextField
              label={t('f.desc_es')}
              value={edit.descriptionEs ?? ''}
              onChange={(v) => setEdit({ ...edit, descriptionEs: v })}
              multiline
            />
            <TextField
              label={t('f.desc_en')}
              value={edit.descriptionEn ?? ''}
              onChange={(v) => setEdit({ ...edit, descriptionEn: v })}
              multiline
            />
            {props.section === 'menu' ? (
              <TextField
                label={t('f.group')}
                value={edit.groupName}
                onChange={(v) => setEdit({ ...edit, groupName: v })}
                maxLength={40}
              />
            ) : (
              <>
                <TextField
                  label={t('f.cta_es')}
                  value={edit.ctaLabelEs ?? ''}
                  onChange={(v) => setEdit({ ...edit, ctaLabelEs: v })}
                  maxLength={40}
                />
                <TextField
                  label={t('f.cta_en')}
                  value={edit.ctaLabelEn ?? ''}
                  onChange={(v) => setEdit({ ...edit, ctaLabelEn: v })}
                  maxLength={40}
                />
              </>
            )}
            <div className="md:col-span-2">
              <p className="text-sm font-medium">{t('f.image_url')}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {edit.imageUrl !== null && (
                  <img src={edit.imageUrl} alt="" className="size-20 rounded-xl object-cover" />
                )}
                <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-secondary px-4 text-sm font-semibold text-secondary hover:bg-secondary/5">
                  {uploading ? t('f.uploading') : t('f.choose_photos')}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file === undefined) return
                      setUploading(true)
                      void toWebp(file)
                        .then((b) => uploadImage('categories', b))
                        .then((url) => setEdit((x) => (x === null ? x : { ...x, imageUrl: url })))
                        .finally(() => setUploading(false))
                    }}
                  />
                </label>
              </div>
            </div>
            <div className="md:col-span-2">
              <Switch
                label={t('cat.visible')}
                checked={edit.active}
                onChange={(v) => setEdit({ ...edit, active: v })}
              />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}

function Pieces() {
  const { t, locale } = useI18n()
  const toast = useToast()
  const [pieces, setPieces] = useState<PicaderaPiece[] | null>(null)
  const [edit, setEdit] = useState<PicaderaPiece | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const load = useCallback(() => void listPieces().then(setPieces), [])
  useEffect(load, [load])
  const label = (p: PicaderaPiece) =>
    locale === 'es'
      ? `${p.pieceTypeEs ?? p.pieceTypeEn} · ${p.fillingEs ?? p.fillingEn}`
      : `${p.pieceTypeEn} · ${p.fillingEn}`

  const save = async () => {
    if (edit === null) return
    if (edit.pieceTypeEn.trim() === '' || edit.fillingEn.trim() === '') {
      toast(t('f.required'), { tone: 'error' })
      return
    }
    setSaving(true)
    try {
      await savePiece(edit)
      toast(t('cat.saved'))
      setEdit(null)
      load()
    } catch (e) {
      toast(t('cat.save_error', { msg: e instanceof Error ? e.message : '' }), { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (pieces === null)
    return (
      <p role="status" className="mt-10 text-center text-muted">
        {t('cat.loading')}
      </p>
    )

  return (
    <div className="mt-6">
      <div className="mb-4 flex justify-end">
        <Button
          onClick={() =>
            setEdit({
              id: '',
              pieceTypeEn: '',
              pieceTypeEs: '',
              fillingEn: '',
              fillingEs: '',
              imageUrl: null,
              sortOrder: (pieces.at(-1)?.sortOrder ?? 0) + 1,
              active: true,
            })
          }
        >
          + {t('cat.new_piece')}
        </Button>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {pieces.map((p, i) => (
          <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-white p-3">
            <div className="flex flex-col">
              <button
                type="button"
                disabled={i === 0}
                onClick={() => {
                  const b = pieces[i - 1]
                  if (b) void swapOrder('picadera_options', p, b).then(load)
                }}
                aria-label={t('cat.move_up', { name: label(p) })}
                className="inline-flex size-11 items-center justify-center rounded-full hover:bg-dark/5 disabled:opacity-30"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="m6 15 6-6 6 6" />
                </svg>
              </button>
              <button
                type="button"
                disabled={i === pieces.length - 1}
                onClick={() => {
                  const b = pieces[i + 1]
                  if (b) void swapOrder('picadera_options', p, b).then(load)
                }}
                aria-label={t('cat.move_down', { name: label(p) })}
                className="inline-flex size-11 items-center justify-center rounded-full hover:bg-dark/5 disabled:opacity-30"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </div>
            <div className="size-14 shrink-0 overflow-hidden rounded-full bg-sand">
              {p.imageUrl !== null && (
                <img src={p.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{label(p)}</p>
              {!p.active && (
                <span className="rounded-full bg-dark/10 px-2.5 py-0.5 text-xs font-semibold">
                  {t('cat.inactive')}
                </span>
              )}
            </div>
            <Button variant="outline" className="!min-h-11 !py-2 text-sm" onClick={() => setEdit(p)}>
              {t('cat.edit')}
            </Button>
          </li>
        ))}
      </ul>

      <Dialog
        open={edit !== null}
        onClose={() => setEdit(null)}
        title={edit?.id === '' ? t('cat.new_piece') : edit !== null ? label(edit) : ''}
        closeLabel={t('orders.close')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEdit(null)}>
              {t('orders.cancel')}
            </Button>
            <Button onClick={() => void save()} loading={saving} loadingLabel={t('cat.saving')}>
              {t('cat.save')}
            </Button>
          </div>
        }
      >
        {edit !== null && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField
              label={t('f.piece_type_es')}
              value={edit.pieceTypeEs ?? ''}
              onChange={(v) => setEdit({ ...edit, pieceTypeEs: v || null })}
              maxLength={60}
            />
            <TextField
              label={t('f.piece_type_en')}
              value={edit.pieceTypeEn}
              onChange={(v) => setEdit({ ...edit, pieceTypeEn: v })}
              maxLength={60}
              required
            />
            <TextField
              label={t('f.filling_es')}
              value={edit.fillingEs ?? ''}
              onChange={(v) => setEdit({ ...edit, fillingEs: v || null })}
              maxLength={60}
            />
            <TextField
              label={t('f.filling_en')}
              value={edit.fillingEn}
              onChange={(v) => setEdit({ ...edit, fillingEn: v })}
              maxLength={60}
              required
            />
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
              {edit.imageUrl !== null && (
                <img src={edit.imageUrl} alt="" className="size-16 rounded-full object-cover" />
              )}
              <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-secondary px-4 text-sm font-semibold text-secondary hover:bg-secondary/5">
                {uploading ? t('f.uploading') : t('f.choose_photos')}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file === undefined) return
                    setUploading(true)
                    void toWebp(file, 400, 400)
                      .then((b) => uploadImage('pieces', b))
                      .then((url) => setEdit((x) => (x === null ? x : { ...x, imageUrl: url })))
                      .finally(() => setUploading(false))
                  }}
                />
              </label>
            </div>
            <div className="sm:col-span-2">
              <Switch
                label={t('cat.visible')}
                checked={edit.active}
                onChange={(v) => setEdit({ ...edit, active: v })}
              />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
