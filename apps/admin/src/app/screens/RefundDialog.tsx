// Reembolsar o cancelar un pedido (dueña o admin). Muestra lo que sugiere la política guardada en el pedido;
// el monto se puede cambiar sin pasar de lo que queda. Lo hace el Worker con Stripe; el pedido se actualiza
// cuando llega el webhook.
import { cents, formatPpm, formatUSD, ppm } from '@atalia/shared/money'
import { REFUND_REASONS, type RefundReason } from '@atalia/shared/refunds'
import { Button, Dialog, useToast } from '@atalia/ui'
import { useEffect, useState } from 'react'
import { workerApi } from '../../lib/api'
import type { AdminKey } from '../../i18n'
import { MoneyField, SelectField, Switch, TextField } from '../components/Fields'
import { useI18n } from '../i18n-context'

interface Quote {
  suggestedCents: number
  remainingCents: number
  hoursBefore: number
  cateringPpm: number
  menuRefundable: boolean
  hasMenu: boolean
  hasCatering: boolean
}

export function RefundDialog(props: {
  orderId: string
  code: string
  status: string
  onClose: () => void
  onDone: () => void
}) {
  const { t, locale } = useI18n()
  const toast = useToast()
  const usd = (v: number) => formatUSD(cents(v), locale)
  const [reason, setReason] = useState<RefundReason>('customer')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [amount, setAmount] = useState<number | null>(null)
  const [cancel, setCancel] = useState(props.status !== 'picked_up')
  const [note, setNote] = useState('')
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  // Una clave por intento: si se reintenta o hay doble clic, Stripe no reembolsa dos veces
  const [key] = useState(() => crypto.randomUUID())

  useEffect(() => {
    setQuote(null)
    workerApi<Quote>(`/admin/orders/${props.orderId}/refund-quote?reason=${reason}`).then(
      (q) => {
        setQuote(q)
        setAmount(q.suggestedCents)
      },
      (e: unknown) => toast(t('rf.error', { msg: e instanceof Error ? e.message : '' }), { tone: 'error' }),
    )
  }, [props.orderId, reason, t, toast])

  const amountCents = amount ?? 0
  const tooMuch = quote !== null && amountCents > quote.remainingCents
  const canCancel = !['picked_up', 'cancelled', 'refunded'].includes(props.status)
  const nothing = amountCents === 0 && !(cancel && canCancel)

  const submit = async () => {
    setBusy(true)
    try {
      await workerApi(`/admin/orders/${props.orderId}/refund`, {
        method: 'POST',
        body: JSON.stringify({ amountCents, reason, note, cancel: cancel && canCancel, idempotencyKey: key }),
      })
      toast(amountCents > 0 ? t('rf.done', { amount: usd(amountCents) }) : t('rf.done_cancel'))
      props.onDone()
    } catch (e) {
      toast(t('rf.error', { msg: e instanceof Error ? e.message : '' }), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={props.onClose}
      title={t('rf.title', { code: props.code })}
      closeLabel={t('orders.close')}
      size="lg"
      footer={
        <div className="grid gap-3">
          {amountCents > 0 && <Switch label={t('rf.confirm')} checked={sure} onChange={setSure} />}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={props.onClose}>
              {t('orders.cancel')}
            </Button>
            <Button
              disabled={quote === null || tooMuch || nothing || (amountCents > 0 && !sure)}
              loading={busy}
              loadingLabel={t('cat.saving')}
              onClick={() => void submit()}
            >
              {amountCents > 0 ? t('rf.submit', { amount: usd(amountCents) }) : t('rf.submit_cancel_only')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="mt-4 grid gap-4">
        <SelectField
          label={t('rf.reason')}
          value={reason}
          onChange={setReason}
          options={REFUND_REASONS.map((r) => ({ value: r, label: t(`rf.reason.${r}` as AdminKey) }))}
        />
        {quote === null ? (
          <p role="status" className="text-muted">
            {t('rf.loading')}
          </p>
        ) : (
          <div className="rounded-2xl bg-sand px-4 py-3 text-sm">
            <p className="font-semibold">{t('rf.policy', { amount: usd(quote.suggestedCents) })}</p>
            <p className="text-muted">
              {[
                t('rf.hours_left', { hours: Math.max(quote.hoursBefore, 0) }),
                quote.hasCatering ? t('rf.catering_part', { pct: formatPpm(ppm(quote.cateringPpm)) }) : null,
                quote.hasMenu
                  ? t('rf.menu_part', { state: quote.menuRefundable ? t('rf.menu_yes') : t('rf.menu_no') })
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="text-muted">{t('rf.remaining', { amount: usd(quote.remainingCents) })}</p>
          </div>
        )}
        <MoneyField
          label={t('rf.amount')}
          valueCents={amount}
          onChange={(v) => setAmount(v ?? 0)}
          hint={t('rf.amount_hint')}
          error={tooMuch ? t('rf.remaining', { amount: usd(quote.remainingCents) }) : null}
        />
        {canCancel && (
          <Switch label={t('rf.cancel')} hint={t('rf.cancel_hint')} checked={cancel} onChange={setCancel} />
        )}
        <TextField label={t('rf.note')} value={note} onChange={setNote} maxLength={500} multiline />
      </div>
    </Dialog>
  )
}
