import type { Attendance, AttendanceStatus, Student } from '@/lib/types'
import { STATUS_OPTIONS } from '@/lib/attendance'
import { Badge } from '@/components/ui'
import { CheckIcon } from '@/components/icons'

/**
 * Список детей занятия: статус в одно касание и флаг «оплачено».
 * Повторное касание выбранного статуса снимает отметку.
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
          <h3 className="text-sm font-semibold">Посещаемость</h3>
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

      {!canMarkStatus && canTogglePaid && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Посещение отмечается в день занятия, а оплату можно отметить заранее.
        </p>
      )}

      {roster.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
          В группе пока никого — состав меняется в разделе «Ученики» → «Группы».
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-800">
          {roster.map((s) => {
            const row = rowOf(s.id)
            return (
              <li key={s.id} className="space-y-2 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">
                    {s.full_name}
                    {!s.is_active && <Badge>архив</Badge>}
                  </span>
                  <PaidToggle
                    on={!!row?.is_paid}
                    disabled={!canTogglePaid}
                    onClick={() => onPaid(s.id, !row?.is_paid)}
                  />
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {STATUS_OPTIONS.map((o) => {
                    const on = row?.status === o.value
                    return (
                      <button
                        key={o.value}
                        type="button"
                        disabled={!canMarkStatus}
                        aria-pressed={on}
                        onClick={() => onStatus(s.id, on ? null : o.value)}
                        className={`rounded-lg px-1 py-2 text-xs font-semibold transition disabled:opacity-40 ${
                          on
                            ? o.on
                            : 'text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800'
                        }`}
                      >
                        {o.label}
                      </button>
                    )
                  })}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
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
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition disabled:opacity-50 ${
        on
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800'
          : 'text-slate-500 ring-slate-200 hover:bg-slate-100 dark:text-slate-400 dark:ring-slate-700 dark:hover:bg-slate-800'
      }`}
    >
      {on ? <CheckIcon className="size-3.5" /> : <span aria-hidden>₽</span>}
      {on ? 'оплачено' : 'не оплачено'}
    </button>
  )
}
