import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import type { Directory } from '@/lib/directory'
import type { Attendance, ChargeStatus, Payment, Profile, Session, Student } from '@/lib/types'
import { formatDayNum, toISO } from '@/lib/dates'
import { plural } from '@/lib/format'
import { lessonTitle, loadSessionsByIds } from '@/lib/schedule'
import { balanceLabel, canCancel, cancelPayment, loadAccount, METHOD_LABEL, unpaid } from '@/lib/money'
import { phoneDigits } from '@/lib/phone'
import { whatsappUrl } from '@/lib/students'
import { money } from '@/lib/tariffs'
import { Button, ErrorNote, Spinner } from '@/components/ui'
import { AcceptPaymentSheet } from '@/components/cash/AcceptPaymentSheet'
import { ChatIcon } from '@/components/icons'

type Line = {
  key: string
  /** для порядка: «ГГГГ-ММ-ДД ЧЧ:ММ» */
  at: string
  title: string
  sub: string
  /** плюс — оплата, минус — занятие; null — отменённая оплата */
  amount: number | null
  balance?: number
  payment?: Payment
}

/**
 * Лицевой счёт ученика: долг или аванс одним числом и выписка — занятия,
 * пропуски (бесплатно) и оплаты с тем, кто принял. Отменённые оплаты
 * остаются зачёркнутыми.
 */
export function StudentAccount({
  student,
  dir,
  me,
  onChanged,
}: {
  student: Student
  dir: Directory
  me: Profile
  /** деньги поменялись — перечитать списки вокруг */
  onChanged?: () => void
}) {
  const isDirector = me.role === 'director'
  const currency = dir.studio.currency
  const [data, setData] = useState<{
    charges: ChargeStatus[]
    payments: Payment[]
    absences: Attendance[]
    sessions: Map<string, Session>
    visible: boolean
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [cancelling, setCancelling] = useState<Payment | null>(null)

  const load = useCallback(async () => {
    const [account, absences, bal] = await Promise.all([
      loadAccount(student.id),
      supabase
        .from('attendance')
        .select('session_id, student_id, status, amount')
        .eq('student_id', student.id)
        .in('status', ['absent', 'excused']),
      supabase.from('student_balances').select('student_id').eq('student_id', student.id),
    ])
    const abs = (absences.data as Attendance[]) ?? []
    const res = await loadSessionsByIds([
      ...new Set([...account.charges.map((c) => c.session_id), ...abs.map((a) => a.session_id)]),
    ])
    setData({
      charges: account.charges,
      payments: account.payments,
      absences: abs,
      sessions: new Map(res.sessions.map((s) => [s.id, s])),
      // счёт видят директор и педагоги этого ученика
      visible: isDirector || ((bal.data as unknown[]) ?? []).length > 0,
    })
    setError(account.error ?? res.error)
  }, [student.id, isDirector])

  useEffect(() => {
    void load()
  }, [load])

  if (!data) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  if (!data.visible) {
    return (
      <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
        Оплаты ученика видят директор и педагоги, у которых он занимается.
      </p>
    )
  }

  const nameOf = (id: string | null) => (id ? (dir.profileById.get(id)?.full_name ?? 'Педагог') : '—')
  const lines: Line[] = [
    ...data.charges.map((c): Line => {
      const s = data.sessions.get(c.session_id)
      const owe = unpaid(c)
      return {
        key: `c${c.session_id}`,
        at: `${c.date} ${c.start_time.slice(0, 5)}`,
        title: s ? lessonTitle(s, dir) : 'Занятие',
        sub:
          owe <= 0
            ? 'оплачено'
            : Number(c.covered) > 0
              ? `◐ оплачено ${money(Number(c.covered), currency)} из ${money(Number(c.amount), currency)}`
              : 'не оплачено',
        amount: -Number(c.amount),
      }
    }),
    ...data.absences
      .filter((a) => data.sessions.get(a.session_id)?.status !== 'cancelled')
      .map((a): Line => {
        const s = data.sessions.get(a.session_id)
        return {
          key: `a${a.session_id}`,
          at: s ? `${s.date} ${s.start_time.slice(0, 5)}` : '',
          title: 'Пропуск',
          sub: 'бесплатно',
          amount: 0,
        }
      }),
    ...data.payments.map((p): Line => {
      const d = new Date(p.received_at)
      return {
        key: `p${p.id}`,
        at: `${toISO(d)} ${d.toTimeString().slice(0, 5)}`,
        title: `Оплата · ${METHOD_LABEL[p.method]}${p.cancelled_at ? ` ${money(Number(p.amount), currency)}` : ''}`,
        sub: p.cancelled_at ? `отменена: ${p.cancel_reason ?? ''}` : `принято: ${nameOf(p.received_by)}`,
        amount: p.cancelled_at ? null : Number(p.amount),
        payment: p,
      }
    }),
  ].sort((a, b) => a.at.localeCompare(b.at))

  let running = 0
  for (const l of lines) {
    if (l.amount !== null) running += l.amount
    l.balance = running
  }
  const balance = running
  const label = balanceLabel(balance, currency)
  const owed = data.charges.filter((c) => unpaid(c) > 0)
  const lastPrice = data.charges.length ? Number(data.charges[data.charges.length - 1].amount) : null
  const digits = phoneDigits(student.parent_phone)
  const reminder =
    balance < 0 && owed.length > 0
      ? `Здравствуйте! Напоминаем об оплате занятий ${student.first_name}: ${owed
          .map((c) => formatDayNum(c.date))
          .join(', ')} — ${money(-balance, currency)}. Спасибо!`
      : null

  function changed() {
    setAccepting(false)
    setCancelling(null)
    void load()
    onChanged?.()
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl p-4 ring-1 ring-slate-200 dark:ring-slate-800">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Баланс</p>
          <p
            className={`text-2xl font-bold tabular-nums ${
              label.tone === 'bad'
                ? 'text-rose-600 dark:text-rose-400'
                : label.tone === 'ok'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : ''
            }`}
          >
            {label.text}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {balance < 0
              ? `не оплачено ${plural(owed.length, ['занятие', 'занятия', 'занятий'])}`
              : balance > 0 && lastPrice
                ? `хватит примерно на ${plural(Math.floor(balance / lastPrice), ['занятие', 'занятия', 'занятий'])}`
                : 'всё оплачено'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAccepting(true)} className="flex-1">
            Принять оплату
          </Button>
          {digits && reminder && (
            <a
              href={`${whatsappUrl(digits)}?text=${encodeURIComponent(reminder)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-50 dark:text-emerald-300 dark:ring-emerald-900 dark:hover:bg-emerald-950/40"
            >
              <ChatIcon className="size-4" />
              Написать родителю
            </a>
          )}
        </div>
      </section>

      {error && <ErrorNote text={error} />}

      {cancelling && (
        <CancelForm
          payment={cancelling}
          currency={currency}
          onCancel={() => setCancelling(null)}
          onDone={changed}
        />
      )}

      {lines.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
          Пока ни занятий с отметкой «Есть», ни оплат.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-800">
          {[...lines].reverse().map((l) => {
            const cancellable = !!l.payment && canCancel(l.payment, me.id, isDirector)
            const body = (
              <>
                <span className="w-11 shrink-0 pt-0.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  {l.at ? formatDayNum(l.at.slice(0, 10)) : ''}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${l.amount === null ? 'text-slate-400 line-through' : ''}`}>
                    {l.title}
                  </span>
                  <span
                    className={`block truncate text-xs ${
                      l.sub === 'не оплачено'
                        ? 'text-rose-600 dark:text-rose-400'
                        : l.sub.startsWith('◐')
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {l.sub}
                  </span>
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <span
                    className={`block text-sm font-semibold ${
                      l.amount === null || l.amount === 0
                        ? 'text-slate-400'
                        : l.amount > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : ''
                    }`}
                  >
                    {l.amount === null ? '—' : l.amount > 0 ? `+${money(l.amount, currency)}` : money(l.amount, currency)}
                  </span>
                  <span className="block text-[11px] text-slate-400">{money(l.balance ?? 0, currency)}</span>
                </span>
              </>
            )
            return (
              <li key={l.key}>
                {cancellable ? (
                  <button
                    type="button"
                    onClick={() => setCancelling(l.payment!)}
                    aria-label={`${l.title}: отменить`}
                    className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex items-start gap-2 px-3 py-2.5">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {lines.some((l) => l.payment && canCancel(l.payment, me.id, isDirector)) && (
        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          {isDirector
            ? 'Ошиблись в оплате — нажмите на неё, чтобы отменить с причиной.'
            : 'Свою оплату можно отменить до конца дня — нажмите на неё.'}
        </p>
      )}

      {accepting && (
        <AcceptPaymentSheet
          student={student}
          dir={dir}
          me={me}
          onClose={() => setAccepting(false)}
          onDone={changed}
        />
      )}
    </div>
  )
}

/** Отмена оплаты: запись остаётся зачёркнутой, нужна причина. */
export function CancelForm({
  payment,
  currency,
  onCancel,
  onDone,
}: {
  payment: Payment
  currency: string
  onCancel: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const err = await cancelPayment(payment.id, reason)
    setBusy(false)
    if (err) return setError(err)
    onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl bg-rose-50 p-4 text-sm dark:bg-rose-950/30">
      <p className="font-semibold text-rose-800 dark:text-rose-200">
        Отменить оплату {money(Number(payment.amount), currency)} от {formatDayNum(toISO(new Date(payment.received_at)))}?
      </p>
      <p className="text-rose-700/80 dark:text-rose-300/80">Запись останется в выписке зачёркнутой.</p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Причина: ошиблись суммой, двойная запись…"
        autoFocus
        className="w-full rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-base outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-400/30 dark:border-rose-900 dark:bg-slate-950"
      />
      {error && <ErrorNote text={error} />}
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={busy || !reason.trim()} className="flex-1">
          Отменить оплату
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel} className="flex-1">
          Не надо
        </Button>
      </div>
    </form>
  )
}
