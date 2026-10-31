import type { Attendance, AttendanceStatus, Student } from '@/lib/types'
import { came } from '@/lib/attendance'
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
 * Список детей занятия: у каждого две кнопки — «есть/нет» и «оплачено»,
 * обе в одно касание.
 */
export function AttendanceList({
  roster,
  rows,
  canMarkStatus,
  canTogglePaid,
  onStatus,
  onPaid,
  onAllPresent,
}: {
  roster: Student[]
  rows: Attendance[]
  canMarkStatus: boolean
  canTogglePaid: boolean
  onStatus: (studentId: string, status: AttendanceStatus | null) => void
  onPaid: (studentId: string, paid: boolean) => void
  onAllPresent: () => void
}) {
  const rowOf = (id: string) => rows.find((r) => r.student_id === id)
  const unmarked = roster.filter((s) => !rowOf(s.id)?.status).length
  const paid = roster.filter((s) => rowOf(s.id)?.is_paid).length

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Посещаемость и оплата</h3>
          {roster.length > 1 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              отмечено {roster.length - unmarked} из {roster.length} · оплатили {paid}
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

      {roster.length > 0 && !canMarkStatus && canTogglePaid && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Посещение отмечается в день занятия, а оплату можно отметить заранее.
        </p>
      )}

      {roster.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
          В составе пока никого — добавьте учеников в группу («Ученики» → «Группы») или
          кнопкой «Изменить состав».
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-800">
          {roster.map((s) => {
            const row = rowOf(s.id)
            const status = row?.status ?? null
            // имя и фамилия в две строки — справа место под две кнопки
            const surname = s.first_name ? s.last_name : ''
            return (
              <li key={s.id} className="flex items-center gap-2.5 px-3 py-2.5">
                <StudentAvatar student={s} size="sm" muted={!s.is_active} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate font-medium">{s.first_name || s.full_name}</span>
                  {(surname || !s.is_active) && (
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                      {surname}
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
                <PaidToggle
                  on={!!row?.is_paid}
                  disabled={!canTogglePaid}
                  onClick={() => onPaid(s.id, !row?.is_paid)}
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

export function PaidToggle({
  on,
  disabled,
  onClick,
}: {
  on: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      aria-label={on ? 'оплачено' : 'не оплачено'}
      className={`inline-flex h-10 w-[5.75rem] shrink-0 items-center justify-center gap-1 rounded-xl text-xs font-semibold ring-1 transition disabled:opacity-50 ${
        on
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800'
          : 'text-slate-600 ring-slate-300 hover:bg-slate-100 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800'
      }`}
    >
      {on ? <CheckIcon className="size-3.5" /> : <span aria-hidden>₽</span>}
      {on ? 'Оплачено' : 'Оплата'}
    </button>
  )
}
