import { useState } from 'react'
import type { Directory } from '@/lib/directory'
import type { Attendance, Session } from '@/lib/types'
import { STATUS_OPTIONS } from '@/lib/attendance'
import { percent, plural } from '@/lib/format'
import { attendanceReport, type Period, type StudentAttendance } from '@/lib/reports'
import { Badge, Card, EmptyState } from '@/components/ui'
import { AlertIcon, CheckIcon, ChevronRightIcon } from '@/components/icons'
import { Legend, SectionTitle, StackBar } from '@/components/reports/parts'
import { StudentMarksModal } from '@/components/reports/StudentMarksModal'

/** Посещаемость за период: общая доля пришедших и разбивка по ученикам. */
export function AttendanceReport({
  period,
  sessions,
  bySession,
  dir,
  onChanged,
}: {
  period: Period
  sessions: Session[]
  bySession: Map<string, Attendance[]>
  dir: Directory
  onChanged: () => void
}) {
  const report = attendanceReport(sessions, bySession, dir)
  const [openId, setOpenId] = useState<string | null>(null)
  const open = report.students.find((s) => s.student.id === openId)
  const rate = percent(report.came, report.marked)

  const unmarkedNote = report.unmarkedLessons > 0 && (
    <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertIcon className="mt-0.5 size-4 shrink-0" />
      <span>
        Не отмечена посещаемость на{' '}
        {plural(report.unmarkedLessons, ['занятии', 'занятиях', 'занятиях'])} — они не вошли в
        сводку.
      </span>
    </p>
  )

  if (report.marked === 0) {
    return (
      <div className="space-y-3">
        {unmarkedNote}
        <Card>
          <EmptyState
            icon={<CheckIcon className="size-6" />}
            title="За этот период отметок нет"
            hint="Сводка появится, когда педагоги отметят посещаемость на занятиях."
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-3 p-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">{rate}%</span>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            пришли · из {plural(report.marked, ['отметки', 'отметок', 'отметок'])}
          </span>
        </div>
        <StackBar
          parts={STATUS_OPTIONS.map((o) => ({ value: report.counts[o.value], className: o.on }))}
        />
        <Legend
          items={STATUS_OPTIONS.map((o) => ({
            label: `${o.label} ${report.counts[o.value]}`,
            className: o.on,
          }))}
        />
      </Card>

      {unmarkedNote}

      <section className="space-y-2">
        <SectionTitle aside="нажмите — занятия и оплата">
          Ученики · {report.students.length}
        </SectionTitle>
        <Card className="divide-y divide-slate-100 dark:divide-slate-800">
          {report.students.map((s) => (
            <StudentRow key={s.student.id} item={s} onClick={() => setOpenId(s.student.id)} />
          ))}
        </Card>
      </section>

      {open && (
        <StudentMarksModal
          student={open.student}
          marks={open.marks}
          dir={dir}
          caption={period.label}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            setOpenId(null)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function StudentRow({ item, onClick }: { item: StudentAttendance; onClick: () => void }) {
  const { student, counts } = item
  const missed = counts.absent + counts.excused
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition first:rounded-t-2xl last:rounded-b-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate font-medium">
            {student.full_name}
            {!student.is_active && <Badge>архив</Badge>}
          </span>
          <span className="shrink-0 text-sm tabular-nums text-slate-500 dark:text-slate-400">
            {item.came} из {item.marked}
          </span>
        </div>
        <StackBar
          parts={STATUS_OPTIONS.map((o) => ({ value: counts[o.value], className: o.on }))}
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {counts.late > 0 && <span>опозданий {counts.late} · </span>}
          {missed > 0 ? (
            <span className={counts.absent > 0 ? 'text-rose-600 dark:text-rose-400' : ''}>
              пропусков {missed}
              {counts.excused > 0 && ` (уважит. ${counts.excused})`}
            </span>
          ) : (
            <span>без пропусков</span>
          )}
          {item.unpaid > 0 && (
            <span className="font-medium text-amber-600 dark:text-amber-400">
              {' '}
              · не оплачено {item.unpaid}
            </span>
          )}
        </p>
      </div>
      <ChevronRightIcon className="size-4 shrink-0 text-slate-300 dark:text-slate-600" />
    </button>
  )
}
