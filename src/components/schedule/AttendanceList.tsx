import type { Attendance, AttendanceStatus, Student } from '@/lib/types'
import { came, isPaid } from '@/lib/attendance'
import { money } from '@/lib/tariffs'
import { Badge } from '@/components/ui'
import { StudentAvatar } from '@/components/students/StudentAvatar'
import { CheckIcon, CloseIcon } from '@/components/icons'

/**
 * Следующая отметка по касанию: без отметки → есть → нет → без отметки.
 * Старые «опоздание» и «уважительная» идут как «есть» и «нет».
 */
function nextStatus(status: AttendanceStatus | null): AttendanceStatus | null {
  if (!status) return 'present'
  return came(status) ? 'absent' : null
}

/** Как отметка выглядит на кнопке: пришёл, не пришёл, ещё не отмечен. */
type Mark = 'in' | 'out' | 'none'

function markOf(status: AttendanceStatus | null): Mark {
  return !status ? 'none' : came(status) ? 'in' : 'out'
}

const MARK_LOOK: Record<Mark, string> = {
  in: 'bg-emerald-600 text-white',
  out: 'bg-rose-600 text-white',
  // пунктир — «ещё не спросили», как перекличка: «Петрова?» — «Есть!»
  none: 'border border-dashed border-slate-400 text-slate-500 dark:border-slate-500 dark:text-slate-400',
}

/**
 * Список детей занятия: у каждого «есть/нет» в одно касание и деньги — сумма
 * за занятие (оплачено / частично / «Принять») и долг или аванс ребёнка.
 * balances — null, пока не загружены; педагогу — только его ученики.
 */
export function AttendanceList({
  roster,
  rows,
  balances,
  currency,
  canMarkStatus,
  canAccept,
  onStatus,
  onAccept,
  onAllPresent,
}: {
  roster: Student[]
  rows: Attendance[]
  balances: Map<string, number> | null
  currency: string
  canMarkStatus: boolean
  canAccept: boolean
  onStatus: (studentId: string, status: AttendanceStatus | null) => void
  onAccept: (student: Student) => void
  onAllPresent: () => void
}) {
  const rowOf = (id: string) => rows.find((r) => r.student_id === id)
  const unmarked = roster.filter((s) => !rowOf(s.id)?.status).length
  const charged = rows.filter((r) => r.amount !== null)
  const paid = charged.filter(isPaid).length
  const known = charged.length > 0 && charged.every((r) => r.covered !== undefined)

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Посещаемость и оплата</h3>
          {(roster.length > 1 || known) && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {roster.length > 1 && `отмечено ${roster.length - unmarked} из ${roster.length}`}
              {roster.length > 1 && known && ' · '}
              {known && `оплачено ${paid} из ${charged.length}`}
            </p>
          )}
        </div>
        {canMarkStatus && roster.length > 1 && unmarked > 0 && (
          <button
            type="button"
            onClick={onAllPresent}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-50 dark:text-emerald-300 dark:ring-emerald-900 dark:hover:bg-emerald-950/40"
          >
            {unmarked === roster.length ? 'Все пришли' : 'Остальные пришли'}
          </button>
        )}
      </div>

      {roster.length > 0 && !canMarkStatus && canAccept && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Посещение отмечается в день занятия, а деньги можно принять заранее — они лягут авансом.
        </p>
      )}

      {roster.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
          В составе пока никого — добавьте учеников в группу (таб «Группы») или
          кнопкой «Изменить состав».
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-800">
          {roster.map((s) => {
            const row = rowOf(s.id)
            const status = row?.status ?? null
            const balance = balances?.get(s.id)
            const hasBalance = balance !== undefined && balance !== 0
            // узко: имя, а под ним долг или аванс (если их нет — фамилия)
            const surname = s.first_name ? s.last_name : ''
            return (
              <li key={s.id} className="flex items-center gap-2.5 px-3 py-2.5">
                <StudentAvatar student={s} size="sm" muted={!s.is_active} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate font-medium">{s.first_name || s.full_name}</span>
                  {(hasBalance || surname || !s.is_active) && (
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                      {!hasBalance && surname}
                      {hasBalance && (
                        <span
                          className={`font-medium ${
                            balance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {balance < 0 ? `долг ${money(-balance, currency)}` : `аванс ${money(balance, currency)}`}
                        </span>
                      )}
                      {!s.is_active && <Badge>архив</Badge>}
                    </span>
                  )}
                </span>
                <MarkButton
                  status={status}
                  disabled={!canMarkStatus}
                  name={s.full_name}
                  onClick={() => onStatus(s.id, nextStatus(status))}
                />
                <MoneyCell
                  row={row}
                  balance={balance}
                  currency={currency}
                  canAccept={canAccept}
                  onClick={() => onAccept(s)}
                />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** «Есть» / «Нет» / без отметки — одна кнопка на ребёнка. */
function MarkButton({
  status,
  disabled,
  name,
  onClick,
}: {
  status: AttendanceStatus | null
  disabled: boolean
  name: string
  onClick: () => void
}) {
  const mark = markOf(status)
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${name}: ${mark === 'in' ? 'есть' : mark === 'out' ? 'нет' : 'без отметки'}`}
      className={`inline-flex h-10 w-[4.5rem] shrink-0 items-center justify-center gap-1 rounded-xl text-sm font-semibold transition disabled:opacity-40 ${MARK_LOOK[mark]} ${
        mark === 'none' ? 'hover:bg-slate-100 dark:hover:bg-slate-800' : ''
      }`}
    >
      {mark === 'in' && <CheckIcon className="size-4" />}
      {mark === 'out' && <CloseIcon className="size-4" />}
      {mark === 'in' ? 'Есть' : mark === 'out' ? 'Нет' : 'Есть?'}
    </button>
  )
}

/**
 * Деньги ребёнка на занятии: «✓ 25 €» — оплачено, «◐ 10 / 25 €» — частично,
 * «Принять» — не оплачено (или ещё не начислено). Нажатие — принять оплату.
 */
function MoneyCell({
  row,
  balance,
  currency,
  canAccept,
  onClick,
}: {
  row: Attendance | undefined
  balance: number | undefined
  currency: string
  canAccept: boolean
  onClick: () => void
}) {
  const base =
    'inline-flex h-10 w-[5.75rem] shrink-0 items-center justify-center gap-1 rounded-xl text-xs font-semibold tabular-nums transition'
  const amount = row?.amount ?? null
  const covered = row?.covered
  let look: { cls: string; text: string; label: string }
  if (amount !== null && covered !== undefined && covered >= amount) {
    look = {
      cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800',
      text: `✓ ${money(amount, currency)}`,
      label: 'оплачено',
    }
  } else if (amount !== null && covered !== undefined && covered > 0) {
    look = {
      cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800',
      text: `◐ ${covered} / ${money(amount, currency)}`,
      label: 'оплачено частично',
    }
  } else if (amount !== null && covered !== undefined) {
    look = {
      cls: 'bg-brand-600 text-white hover:bg-brand-700',
      text: 'Принять',
      label: `не оплачено, ${money(amount, currency)}`,
    }
  } else if (amount !== null) {
    // что оплачено, не видно (не свой ученик у педагога) — только сумма
    look = {
      cls: 'text-slate-500 ring-1 ring-slate-200 dark:text-slate-400 dark:ring-slate-700',
      text: money(amount, currency),
      label: 'начислено',
    }
  } else {
    look = {
      cls:
        balance !== undefined && balance < 0
          ? 'text-brand-700 ring-1 ring-brand-300 hover:bg-brand-50 dark:text-brand-300 dark:ring-brand-800 dark:hover:bg-brand-950/40'
          : 'text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800',
      text: 'Принять',
      label: 'не начислено',
    }
  }
  if (!canAccept) {
    return look.text === 'Принять' ? (
      <span className="w-[5.75rem] shrink-0" aria-hidden />
    ) : (
      <span className={`${base} ${look.cls}`} aria-label={look.label}>
        {look.text}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${look.label}: принять оплату`}
      className={`${base} ${look.cls}`}
    >
      {look.text}
    </button>
  )
}
