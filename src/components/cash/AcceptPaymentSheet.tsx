import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import type { Directory } from '@/lib/directory'
import type { ChargeStatus, PaymentMethod, Profile, Student } from '@/lib/types'
import { formatDayNum } from '@/lib/dates'
import { plural } from '@/lib/format'
import { balanceLabel, cancelPayment, loadAccount, METHOD_LABEL, planPayment, unpaid } from '@/lib/money'
import { money, parseMoney } from '@/lib/tariffs'
import { Button, ErrorNote, Modal, Segmented, Spinner } from '@/components/ui'
import { MoneyField, Pill } from '@/components/cash/parts'

type Extra = 'advance' | 'change'

/** Сколько секунд после приёма можно нажать «Отменить» без причины. */
const UNDO_S = 5

/**
 * Принять оплату у ученика — у директора и у педагога. Деньги гасят занятия
 * с самого старого, остаток — аванс; при переплате — «сдача или аванс».
 * Записывается только оставленная сумма.
 */
export function AcceptPaymentSheet({
  student,
  dir,
  me,
  onClose,
  onDone,
}: {
  student: Student
  dir: Directory
  me: Profile
  onClose: () => void
  /** оплата принята (или отменена сразу) — перечитать суммы */
  onDone: () => void
}) {
  const currency = dir.studio.currency
  const [charges, setCharges] = useState<ChargeStatus[] | null>(null)
  const [balance, setBalance] = useState(0)
  const [amountText, setAmountText] = useState('')
  const [extra, setExtra] = useState<Extra>('advance')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState<{ id: string; amount: number } | null>(null)
  const [left, setLeft] = useState(UNDO_S)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let alive = true
    void loadAccount(student.id).then((res) => {
      if (!alive) return
      setCharges(res.charges)
      const paid = res.payments.filter((p) => !p.cancelled_at).reduce((n, p) => n + Number(p.amount), 0)
      setBalance(paid - res.charges.reduce((n, c) => n + Number(c.amount), 0))
      setError(res.error)
    })
    return () => {
      alive = false
    }
  }, [student.id])

  // после приёма — 5 секунд на «Отменить», потом шторка закрывается сама
  useEffect(() => {
    if (!accepted) return
    timer.current = setInterval(() => setLeft((s) => s - 1), 1000)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [accepted])
  useEffect(() => {
    if (accepted && left <= 0) onDone()
  }, [accepted, left, onDone])

  const owed = (charges ?? []).filter((c) => unpaid(c) > 0)
  const debt = owed.reduce((n, c) => n + unpaid(c), 0)
  const lastPrice = charges?.length ? Number(charges[charges.length - 1].amount) : null
  const given = parseMoney(amountText)
  const over = given !== null && debt > 0 && given > debt
  const kept = given === null ? null : over && extra === 'change' ? debt : given
  const plan = kept ? planPayment(kept, charges ?? []) : null

  const chips: { label: string; value: number }[] = []
  if (debt > 0) chips.push({ label: `Весь долг · ${money(debt, currency)}`, value: debt })
  if (debt > 0 && lastPrice) chips.push({ label: `Долг + занятие · ${money(debt + lastPrice, currency)}`, value: debt + lastPrice })
  if (lastPrice && lastPrice !== debt) chips.push({ label: `1 занятие · ${money(lastPrice, currency)}`, value: lastPrice })

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!kept || kept <= 0) return
    setError(null)
    setBusy(true)
    const { data, error } = await supabase
      .from('payments')
      .insert({ student_id: student.id, studio_id: dir.studio.id, amount: kept, method })
      .select('id')
      .single()
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setAccepted({ id: data.id as string, amount: kept })
  }

  async function undo() {
    if (!accepted) return
    if (timer.current) clearInterval(timer.current)
    setBusy(true)
    const err = await cancelPayment(accepted.id, 'Отменено сразу после приёма')
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    onDone()
  }

  const label = balanceLabel(balance, currency)

  return (
    <Modal
      title={student.full_name}
      aside={charges && !accepted ? <Pill tone={label.tone}>{label.tone === 'bad' ? '! ' : label.tone === 'ok' ? '✓ ' : ''}{label.text}</Pill> : undefined}
      onClose={accepted ? onDone : onClose}
    >
      {!charges ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : accepted ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
            <p className="text-lg font-semibold">Принято {money(accepted.amount, currency)}</p>
            <p className="text-sm">{METHOD_LABEL[method]} · принято: {me.full_name}</p>
          </div>
          {error && <ErrorNote text={error} />}
          <div className="flex gap-2">
            <Button variant="ghost" disabled={busy} onClick={undo} className="flex-1">
              Отменить · {Math.max(left, 0)}
            </Button>
            <Button onClick={onDone} className="flex-1">
              Готово
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="-mt-2 text-sm text-slate-500 dark:text-slate-400">
            {owed.length > 0
              ? `${plural(owed.length, ['занятие', 'занятия', 'занятий'])}: ${owed
                  .slice(0, 5)
                  .map((c) => formatDayNum(c.date))
                  .join(', ')}${owed.length > 5 ? '…' : ''} · `
              : 'Долгов нет · '}
            принимает {me.full_name}
          </p>

          <MoneyField
            label={`Получено, ${currency === 'EUR' ? '€' : currency}`}
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="0"
            autoFocus
            className="!py-3 !text-2xl"
          />
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {chips.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => setAmountText(String(c.value).replace('.', ','))}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition ${
                    given === c.value
                      ? 'bg-brand-50 text-brand-700 ring-brand-300 dark:bg-brand-950/50 dark:text-brand-300 dark:ring-brand-700'
                      : 'text-slate-600 ring-slate-200 hover:bg-slate-100 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          {over && given !== null && (
            <div className="space-y-1.5">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Лишние {money(given - debt, currency)}:
              </p>
              <Segmented<Extra>
                value={extra}
                onChange={setExtra}
                options={[
                  { value: 'change', label: `Сдача ${money(given - debt, currency)}` },
                  { value: 'advance', label: 'Оставить авансом' },
                ]}
              />
            </div>
          )}

          <Segmented<PaymentMethod>
            value={method}
            onChange={setMethod}
            options={[
              { value: 'cash', label: 'Наличные' },
              { value: 'transfer', label: 'Перевод' },
            ]}
          />

          {plan && kept && (
            <div className="space-y-1 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-sm dark:border-slate-700" aria-live="polite">
              {plan.closes.filter((c) => c.full).length > 0 && (
                <p className="text-emerald-700 dark:text-emerald-400">
                  ✓ Закроет{' '}
                  {plan.closes
                    .filter((c) => c.full)
                    .map((c) => formatDayNum(c.charge.date))
                    .join(', ')}
                </p>
              )}
              {plan.closes
                .filter((c) => !c.full)
                .map((c) => (
                  <p key={c.charge.session_id} className="text-amber-700 dark:text-amber-400">
                    ◐ {formatDayNum(c.charge.date)} — {money(Number(c.charge.covered) + c.part, currency)} из{' '}
                    {money(Number(c.charge.amount), currency)}
                  </p>
                ))}
              {plan.debtLeft > 0 && (
                <p className="text-rose-700 dark:text-rose-400">! Останется долг {money(plan.debtLeft, currency)}</p>
              )}
              {plan.advance > 0 && (
                <p className="font-semibold text-brand-700 dark:text-brand-300">Аванс {money(plan.advance, currency)}</p>
              )}
              {over && extra === 'change' && given !== null && (
                <p className="text-slate-500 dark:text-slate-400">
                  Сдача {money(given - debt, currency)} — в кассу не записывается
                </p>
              )}
            </div>
          )}

          {error && <ErrorNote text={error} />}

          <Button type="submit" disabled={busy || !kept || kept <= 0} className="w-full !py-3 !text-base">
            {busy ? 'Сохраняем…' : kept ? `Принять ${money(kept, currency)}` : 'Впишите сумму'}
          </Button>
        </form>
      )}
    </Modal>
  )
}
