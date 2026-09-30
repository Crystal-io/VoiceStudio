import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Directory } from '@/lib/directory'
import type { Student } from '@/lib/types'
import { came, STATUS_OPTIONS, type LessonMark } from '@/lib/attendance'
import { formatDayWeekday, hhmm } from '@/lib/dates'
import { findPhone, plural } from '@/lib/format'
import { byDateTime } from '@/lib/reports'
import { Button, ErrorNote, Modal } from '@/components/ui'
import { PaidToggle } from '@/components/schedule/AttendanceList'
import { PhoneIcon } from '@/components/icons'

/**
 * Занятия ученика с отметками: статус посещения и оплата. Директор может
 * отметить оплату по одному занятию или сразу по всем посещённым.
 */
export function StudentMarksModal({
  student,
  marks,
  dir,
  caption,
  onClose,
  onChanged,
}: {
  student: Student
  marks: LessonMark[]
  dir: Directory
  /** что за список: «Сентябрь 2026», «Не оплачено» */
  caption: string
  onClose: () => void
  /** оплата менялась — перечитать отчёт */
  onChanged: () => void
}) {
  // оплата по id занятия — меняется на месте, список не перестраиваем,
  // чтобы случайное касание можно было тут же вернуть
  const [paid, setPaid] = useState(() => new Map(marks.map((m) => [m.session.id, m.row.is_paid])))
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sorted = [...marks].sort(byDateTime)
  const owed = sorted.filter((m) => came(m.row.status) && !paid.get(m.session.id))
  const phone = findPhone(student.parent_contact)

  async function save(sessionIds: string[], value: boolean) {
    const prev = new Map(paid)
    setPaid((p) => {
      const next = new Map(p)
      for (const id of sessionIds) next.set(id, value)
      return next
    })
    setError(null)
    setBusy(true)
    const { error } = await supabase
      .from('attendance')
      .update({ is_paid: value })
      .eq('student_id', student.id)
      .in('session_id', sessionIds)
    setBusy(false)
    if (error) {
      setPaid(prev)
      setError(error.message)
      return
    }
    setDirty(true)
  }

  return (
    <Modal title={student.full_name} onClose={() => (dirty ? onChanged() : onClose())}>
      <div className="space-y-4">
        <div className="space-y-1 text-sm text-slate-500 dark:text-slate-400">
          <p>
            {caption} · {plural(sorted.length, ['занятие', 'занятия', 'занятий'])}
            {owed.length > 0 ? (
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {' '}
                · не оплачено {owed.length}
              </span>
            ) : (
              sorted.some((m) => came(m.row.status)) && (
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {' '}
                  · всё оплачено
                </span>
              )
            )}
          </p>
          {student.parent_contact && (
            <p className="text-slate-700 dark:text-slate-200">
              {student.parent_contact}
              {phone && (
                <a
                  href={`tel:${phone}`}
                  className="ml-2 inline-flex items-center gap-1 font-medium text-brand-600 dark:text-brand-400"
                >
                  <PhoneIcon className="size-4" />
                  Позвонить
                </a>
              )}
            </p>
          )}
        </div>

        {owed.length > 1 && (
          <Button
            className="w-full"
            disabled={busy}
            onClick={() => void save(owed.map((m) => m.session.id), true)}
          >
            Отметить оплату за {plural(owed.length, ['занятие', 'занятия', 'занятий'])}
          </Button>
        )}

        {error && <ErrorNote text={error} />}

        <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-800">
          {sorted.map(({ session, row }) => {
            const status = STATUS_OPTIONS.find((o) => o.value === row.status)
            const isPaid = !!paid.get(session.id)
            const what =
              session.type === 'group'
                ? (dir.groupById.get(session.group_id ?? '')?.name ?? 'Группа')
                : 'Индивидуальное'
            const teacher = dir.profileById.get(session.teacher_id)?.full_name
            return (
              <li key={session.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <span className="first-letter:uppercase">{formatDayWeekday(session.date)}</span>
                    <span className="text-slate-400">{hhmm(session.start_time)}</span>
                    {status ? (
                      <span className={`rounded-md px-1.5 py-px text-[11px] font-semibold ${status.on}`}>
                        {status.label}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">без отметки</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {[what, teacher].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <PaidToggle
                  on={isPaid}
                  disabled={busy}
                  onClick={() => void save([session.id], !isPaid)}
                />
              </li>
            )
          })}
        </ul>
      </div>
    </Modal>
  )
}
