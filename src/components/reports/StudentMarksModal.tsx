import type { Directory } from '@/lib/directory'
import type { Student } from '@/lib/types'
import { STATUS_OPTIONS, type LessonMark } from '@/lib/attendance'
import { formatDayWeekday, hhmm } from '@/lib/dates'
import { plural } from '@/lib/format'
import { byDateTime } from '@/lib/reports'
import { isGroupLesson, lessonTitle } from '@/lib/schedule'
import { money } from '@/lib/tariffs'
import { Modal } from '@/components/ui'
import { ParentContact } from '@/components/students/StudentCard'

/**
 * Занятия ученика за период с отметками и ценой, которую начислила отметка
 * «Есть». Оплаты — в карточке ученика («Оплаты») и в «Кассе».
 */
export function StudentMarksModal({
  student,
  marks,
  dir,
  caption,
  onClose,
}: {
  student: Student
  marks: LessonMark[]
  dir: Directory
  /** что за список: «Сентябрь 2026» */
  caption: string
  onClose: () => void
}) {
  const sorted = [...marks].sort(byDateTime)
  const charged = sorted.reduce((n, m) => n + Number(m.row.amount ?? 0), 0)
  const currency = dir.studio.currency

  return (
    <Modal title={student.full_name} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {caption} · {plural(sorted.length, ['занятие', 'занятия', 'занятий'])}
          {charged > 0 && ` · начислено ${money(charged, currency)}`}
        </p>
        {(student.parent_name || student.parent_phone) && <ParentContact student={student} />}

        <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-800">
          {sorted.map(({ session, row }) => {
            const status = STATUS_OPTIONS.find((o) => o.value === row.status)
            const what = isGroupLesson(session) ? lessonTitle(session, dir) : 'Индивидуальное'
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
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                  {row.amount !== null ? money(Number(row.amount), currency) : '—'}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </Modal>
  )
}
