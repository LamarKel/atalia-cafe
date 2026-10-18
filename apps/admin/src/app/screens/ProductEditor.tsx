// Editor de un producto (menú o catering). Valida con el esquema de packages/shared antes de guardar y avisa
// si se sale con cambios sin guardar. Las fotos se suben ya achicadas a WebP.
import { productDraftSchema, slugify, type ProductDraftInput } from '@atalia/shared/catalog'
import { Button, Dialog, useToast } from '@atalia/ui'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  addProductImage,
  emptyDraft,
  getProduct,
  removeProductImage,
  saveProduct,
  setPrimaryImage,
  toWebp,
  uploadImage,
  type AdminCategory,
  type AdminImage,
} from '../../lib/catalog'
import type { AdminKey } from '../../i18n'
import {
  FormCard,
  MoneyField,
  NumberField,
  RowsEditor,
  SelectField,
  Switch,
  TextField,
} from '../components/Fields'
import { useI18n } from '../i18n-context'

type Draft = ProductDraftInput
type Errors = Record<string, string>

export function ProductEditor(props: {
  productId: string | null
  section: 'menu' | 'catering'
  categories: AdminCategory[]
  onClose: (changed: boolean) => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [images, setImages] = useState<AdminImage[]>([])
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const [savedOnce, setSavedOnce] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const initial = useRef<string>('')
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const firstCat = props.categories[0]?.id ?? ''
    if (props.productId === null) {
      const d = emptyDraft(props.section === 'menu' ? 'menu' : 'tray', firstCat)
      setDraft(d)
      initial.current = JSON.stringify(d)
    } else {
      void getProduct(props.productId).then(
        (p) => {
          setDraft(p.draft)
          setImages(p.images)
          initial.current = JSON.stringify(p.draft)
        },
        (e: unknown) =>
          toast(t('cat.save_error', { msg: e instanceof Error ? e.message : '' }), { tone: 'error' }),
      )
    }
    headingRef.current?.focus()
  }, [props.productId, props.section, props.categories, t, toast])

  const dirty = draft !== null && JSON.stringify(draft) !== initial.current
  const set = (patch: Partial<Draft>) => setDraft((d) => (d === null ? d : { ...d, ...patch }))
  const err = (path: string) => (errors[path] === undefined ? null : errors[path])

  const typeOptions = useMemo(
    () =>
      (props.section === 'menu' ? (['menu'] as const) : (['tray', 'table', 'picadera_pack'] as const)).map(
        (v) => ({
          value: v,
          label: t(`type.${v}` as AdminKey),
        }),
      ),
    [props.section, t],
  )

  if (draft === null)
    return (
      <p role="status" className="py-10 text-center text-muted">
        {t('cat.loading')}
      </p>
    )

  const isMenu = draft.type === 'menu'
  const isPicadera = draft.type === 'picadera_pack'

  const save = async () => {
    const parsed = productDraftSchema.safeParse(draft)
    if (!parsed.success) {
      const next: Errors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.')
        const msg = `err.${issue.message}` as AdminKey
        next[key] = t(msg) === msg ? t('f.required') : t(msg)
      }
      setErrors(next)
      toast(t('err.form'), { tone: 'error' })
      return
    }
    setErrors({})
    setSaving(true)
    try {
      const id = await saveProduct(parsed.data)
      // Recarga para tener los ids nuevos de tamaños, extras, etc.
      const fresh = await getProduct(id)
      setDraft(fresh.draft)
      setImages(fresh.images)
      initial.current = JSON.stringify(fresh.draft)
      setSavedOnce(true)
      toast(t('cat.saved'))
    } catch (e) {
      toast(t('cat.save_error', { msg: e instanceof Error ? e.message : '' }), { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const leave = () => (dirty ? setConfirmLeave(true) : props.onClose(savedOnce))

  return (
    <div className="mx-auto max-w-4xl">
      <button
        type="button"
        onClick={leave}
        className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-secondary"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m15 6-6 6 6 6" />
        </svg>
        {t('cat.back')}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 ref={headingRef} tabIndex={-1} className="font-heading text-3xl font-bold outline-none">
          {draft.id === null ? t('cat.creating') : draft.nameEs || draft.nameEn || t('cat.editing')}
        </h1>
        {dirty && <p className="rounded-full bg-sand px-3 py-1 text-sm">{t('cat.unsaved')}</p>}
      </div>

      <div className="mt-6 grid gap-4">
        <FormCard title={t('f.basics')}>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label={t('f.name_es')}
              value={draft.nameEs ?? ''}
              onChange={(v) => set({ nameEs: v })}
              maxLength={200}
            />
            <TextField
              label={t('f.name_en')}
              value={draft.nameEn}
              onChange={(v) =>
                set({ nameEn: v, ...(draft.id === null && !isMenu ? { slug: slugify(v) } : {}) })
              }
              error={err('nameEn')}
              required
              maxLength={200}
            />
            <SelectField
              label={t('f.category')}
              value={draft.categoryId}
              onChange={(v) => set({ categoryId: v })}
              options={props.categories.map((c) => ({ value: c.id, label: c.nameEs ?? c.nameEn }))}
              error={err('categoryId')}
            />
            {!isMenu && (
              <SelectField
                label={t('f.type')}
                value={draft.type}
                onChange={(v) => set({ type: v })}
                options={typeOptions}
              />
            )}
            {!isMenu && (
              <TextField
                label={t('f.slug')}
                value={draft.slug ?? ''}
                onChange={(v) => set({ slug: slugify(v) })}
                hint={t('f.slug_hint', { slug: draft.slug || '…' })}
                error={err('slug')}
              />
            )}
            <TextField
              label={t('f.short_es')}
              value={draft.shortDescriptionEs ?? ''}
              onChange={(v) => set({ shortDescriptionEs: v })}
              maxLength={300}
            />
            <TextField
              label={t('f.short_en')}
              value={draft.shortDescriptionEn ?? ''}
              onChange={(v) => set({ shortDescriptionEn: v })}
              maxLength={300}
            />
            <TextField
              label={t('f.desc_es')}
              value={draft.descriptionEs ?? ''}
              onChange={(v) => set({ descriptionEs: v })}
              maxLength={2000}
              multiline
            />
            <TextField
              label={t('f.desc_en')}
              value={draft.descriptionEn ?? ''}
              onChange={(v) => set({ descriptionEn: v })}
              maxLength={2000}
              multiline
            />
          </div>
        </FormCard>

        <FormCard title={t('f.price')}>
          <div className="grid gap-4 md:grid-cols-2">
            <MoneyField
              label={t('f.price')}
              valueCents={draft.priceCents ?? null}
              onChange={(v) => set({ priceCents: v })}
              nullable
              hint={t('f.price_hint')}
              error={err('priceCents')}
            />
            <NumberField
              label={t('f.lead')}
              value={draft.minLeadHours}
              onChange={(v) => set({ minLeadHours: v ?? 0 })}
              min={0}
              max={720}
              hint={t('f.lead_hint')}
            />
          </div>
        </FormCard>

        <FormCard title={t('f.sizes')} hint={t('f.sizes_hint')}>
          {err('sizes') !== null && <p className="mb-3 text-sm text-toast-error">{err('sizes')}</p>}
          <RowsEditor
            rows={draft.sizes ?? []}
            onChange={(sizes) => set({ sizes })}
            rowLabel={(s, i) => s.nameEs || s.nameEn || String(i + 1)}
            newRow={() => ({
              id: null,
              nameEn: '',
              nameEs: '',
              serves: null,
              units: null,
              priceCents: null,
              priceModifierCents: 0,
              active: true,
            })}
            render={(s, update, i) => (
              <div className="grid gap-3 md:grid-cols-2">
                <TextField
                  label={t('f.size_name_es')}
                  value={s.nameEs ?? ''}
                  onChange={(v) => update({ nameEs: v })}
                  maxLength={50}
                />
                <TextField
                  label={t('f.size_name_en')}
                  value={s.nameEn}
                  onChange={(v) => update({ nameEn: v })}
                  maxLength={50}
                  error={err(`sizes.${String(i)}.nameEn`)}
                />
                {!isMenu && !isPicadera && (
                  <NumberField
                    label={t('f.serves')}
                    value={s.serves}
                    onChange={(v) => update({ serves: v })}
                    min={1}
                    error={err(`sizes.${String(i)}.units`)}
                  />
                )}
                {isPicadera && (
                  <NumberField
                    label={t('f.units')}
                    value={s.units}
                    onChange={(v) => update({ units: v })}
                    min={1}
                  />
                )}
                <MoneyField
                  label={t('f.size_price')}
                  valueCents={s.priceCents}
                  onChange={(v) => update({ priceCents: v })}
                  nullable
                />
                <MoneyField
                  label={t('f.size_modifier')}
                  valueCents={s.priceModifierCents}
                  onChange={(v) => update({ priceModifierCents: v ?? 0 })}
                />
                <div className="md:col-span-2">
                  <Switch
                    label={t('cat.visible')}
                    checked={s.active}
                    onChange={(v) => update({ active: v })}
                  />
                </div>
              </div>
            )}
          />
        </FormCard>

        {isMenu && (
          <FormCard title={t('f.extras')} hint={t('f.extras_hint')}>
            <RowsEditor
              rows={draft.extras ?? []}
              onChange={(extras) => set({ extras })}
              rowLabel={(e, i) => e.nameEs || e.nameEn || String(i + 1)}
              newRow={() => ({ id: null, nameEn: '', nameEs: '', priceCents: 0, active: true })}
              render={(e, update, i) => (
                <div className="grid gap-3 md:grid-cols-3">
                  <TextField
                    label={t('f.size_name_es')}
                    value={e.nameEs ?? ''}
                    onChange={(v) => update({ nameEs: v })}
                    maxLength={100}
                  />
                  <TextField
                    label={t('f.size_name_en')}
                    value={e.nameEn}
                    onChange={(v) => update({ nameEn: v })}
                    maxLength={100}
                    error={err(`extras.${String(i)}.nameEn`)}
                  />
                  <MoneyField
                    label={t('f.extra_price')}
                    valueCents={e.priceCents}
                    onChange={(v) => update({ priceCents: v ?? 0 })}
                  />
                  <div className="md:col-span-3">
                    <Switch
                      label={t('cat.visible')}
                      checked={e.active}
                      onChange={(v) => update({ active: v })}
                    />
                  </div>
                </div>
              )}
            />
          </FormCard>
        )}

        {isMenu && (
          <FormCard title={t('f.nutrition')}>
            <RowsEditor
              rows={draft.nutrition ?? []}
              onChange={(nutrition) => set({ nutrition })}
              rowLabel={(n, i) => n.labelEs || n.labelEn || String(i + 1)}
              newRow={() => ({ id: null, labelEn: '', labelEs: '', value: '' })}
              render={(n, update, i) => (
                <div className="grid gap-3 md:grid-cols-3">
                  <TextField
                    label={t('f.label_es')}
                    value={n.labelEs ?? ''}
                    onChange={(v) => update({ labelEs: v })}
                    maxLength={100}
                  />
                  <TextField
                    label={t('f.label_en')}
                    value={n.labelEn}
                    onChange={(v) => update({ labelEn: v })}
                    maxLength={100}
                    error={err(`nutrition.${String(i)}.labelEn`)}
                  />
                  <TextField
                    label={t('f.value')}
                    value={n.value}
                    onChange={(v) => update({ value: v })}
                    maxLength={200}
                    error={err(`nutrition.${String(i)}.value`)}
                  />
                </div>
              )}
            />
          </FormCard>
        )}

        {!isMenu && (
          <FormCard title={t('f.inclusions')}>
            <RowsEditor
              rows={draft.inclusions ?? []}
              onChange={(inclusions) => set({ inclusions })}
              rowLabel={(n, i) => n.labelEs || n.labelEn || String(i + 1)}
              newRow={() => ({ id: null, labelEn: '', labelEs: '' })}
              render={(n, update, i) => (
                <div className="grid gap-3 md:grid-cols-2">
                  <TextField
                    label={t('f.item_es')}
                    value={n.labelEs ?? ''}
                    onChange={(v) => update({ labelEs: v })}
                    maxLength={200}
                  />
                  <TextField
                    label={t('f.item_en')}
                    value={n.labelEn}
                    onChange={(v) => update({ labelEn: v })}
                    maxLength={200}
                    error={err(`inclusions.${String(i)}.labelEn`)}
                  />
                </div>
              )}
            />
          </FormCard>
        )}

        <FormCard title={t('f.photos')} hint={t('f.photos_hint')}>
          {draft.id === null ? (
            <p className="text-sm text-muted">{t('f.photos_save_first')}</p>
          ) : (
            <Photos
              productId={draft.id}
              name={draft.nameEs || draft.nameEn}
              images={images}
              onChange={setImages}
            />
          )}
        </FormCard>

        <FormCard title={t('f.visibility')}>
          <div className="grid gap-1 divide-y divide-dark/5">
            <Switch
              label={t('f.active')}
              checked={draft.active ?? true}
              onChange={(v) => set({ active: v })}
            />
            <Switch
              label={t('f.featured')}
              checked={draft.featured ?? false}
              onChange={(v) => set({ featured: v })}
            />
            {isMenu && (
              <Switch
                label={t('f.vegetarian')}
                checked={draft.vegetarian ?? false}
                onChange={(v) => set({ vegetarian: v })}
              />
            )}
            <Switch
              label={t('f.sold_out')}
              checked={(draft.stockEnabled ?? false) && !(draft.inStock ?? true)}
              onChange={(v) => set({ stockEnabled: v, inStock: !v })}
            />
          </div>
        </FormCard>
      </div>

      {/* Barra de guardar fija abajo: siempre a mano en el teléfono */}
      <div className="sticky bottom-0 -mx-4 mt-6 border-t border-dark/10 bg-accent/95 px-4 py-3 backdrop-blur md:mx-0 md:rounded-2xl md:border md:px-5">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button variant="outline" onClick={leave}>
            {t('cat.back')}
          </Button>
          <Button
            onClick={() => void save()}
            loading={saving}
            loadingLabel={t('cat.saving')}
            disabled={!dirty && draft.id !== null}
          >
            {t('cat.save')}
          </Button>
        </div>
      </div>

      <Dialog
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title={t('cat.discard_confirm')}
        closeLabel={t('orders.close')}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmLeave(false)}>
              {t('cat.stay')}
            </Button>
            <Button onClick={() => props.onClose(savedOnce)}>{t('cat.leave')}</Button>
          </div>
        }
      >
        <p className="mt-2 text-muted">{t('cat.unsaved')}</p>
      </Dialog>
    </div>
  )
}

function Photos(props: {
  productId: string
  name: string
  images: AdminImage[]
  onChange: (images: AdminImage[]) => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const reload = async () => props.onChange((await getProduct(props.productId)).images)

  const upload = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith('image/'))
    if (list.length === 0) return
    setBusy(true)
    try {
      let order = props.images.length
      for (const file of list) {
        const url = await uploadImage(`products/${props.productId}`, await toWebp(file))
        order++
        await addProductImage(
          props.productId,
          url,
          { en: props.name, es: props.name },
          props.images.length === 0 && order === 1,
          order,
        )
      }
      await reload()
      toast(t('cat.saved'))
    } catch (e) {
      toast(t('cat.save_error', { msg: e instanceof Error ? e.message : '' }), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    void upload(e.dataTransfer.files)
  }

  return (
    <div>
      {props.images.length > 0 && (
        <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {props.images.map((img) => (
            <li key={img.id} className="overflow-hidden rounded-2xl border border-dark/10 bg-white">
              <img
                src={img.url}
                alt={t('f.photo_alt', { name: props.name })}
                className="aspect-[4/3] w-full object-cover"
                loading="lazy"
              />
              <div className="flex flex-wrap items-center justify-between gap-1 p-2">
                {img.isPrimary ? (
                  <span className="rounded-full bg-sage-soft px-2.5 py-1 text-xs font-semibold">
                    {t('f.primary')}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void setPrimaryImage(props.productId, img.id).then(reload)}
                    className="min-h-11 px-2 text-xs font-medium text-secondary underline underline-offset-2"
                  >
                    {t('f.make_primary')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void removeProductImage(img.id, img.url).then(reload)}
                  className="min-h-11 px-2 text-xs font-medium text-secondary underline underline-offset-2"
                >
                  {t('f.remove_photo')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
          over ? 'border-secondary bg-secondary/5' : 'border-dark/15'
        }`}
      >
        <p className="text-sm text-muted">{t('f.photos_hint')}</p>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => e.target.files && void upload(e.target.files)}
        />
        <Button
          variant="outline"
          onClick={() => input.current?.click()}
          loading={busy}
          loadingLabel={t('f.uploading')}
        >
          {t('f.choose_photos')}
        </Button>
      </div>
    </div>
  )
}
