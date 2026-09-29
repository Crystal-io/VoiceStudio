import type { Directory } from '@/lib/directory'
import type { Attendance, Session } from '@/lib/types'
import { fromMinutes, hhmm, toMinutes } from '@/lib/dates'
import { lessonTitle, teacherColor } from '@/lib/schedule'
import { attendanceSummary, isUnmarked } from '@/lib/attendance'
import { UsersIcon } from '@/components/icons'

/** Карточка занятия в списке: время, кого учим, кабинет, педагог, отметки. */
export function LessonCard({
  session,
  dir,
  attendance = [],
  showTeacher,
  onClick,
}: {
  session: Session
  dir: Directory
  attendance?: Attendance[]
  showTeacher: boolean
  onClick: () => void
}) {
  const teacher = dir.profileById.get(session.teacher_id)
  const room = session.room_id ? dir.roomById.get(session.room_id)?.name : null
  const cancelled = session.status === 'cancelled'
  const moved = !!session.occurrence_date && session.occurrence_date !== session.date
  const groupSize =
    session.type === 'group'
      ? (dir.membersByGroup.get(session.group_id ?? '') ?? []).filter(
          (id) => dir.studentById.get(id)?.is_active,
        ).length
      : null

  const summary = attendanceSummary(session, dir, attendance)
  const badge = cancelled
    ? { text: 'отменено', cls: 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300' }
    : isUnmarked(session)
      ? { text: 'не отмечено', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' }
      : moved && session.status !== 'done'
        ? { text: 'перенесено', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' }
        : null

  const details = [room ?? 'Без кабинета', showTeacher ? teacher?.full_name : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-stretch gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-brand-300 dark:bg-slate-900 dark:ring-slate-800 dark:hover:ring-brand-700 ${
        cancelled ? 'opacity-60' : ''
      }`}
    >
      <span
        className="w-1 shrink-0 rounded-full"
        style={{ background: teacherColor(teacher) }}
        aria-hidden
      />
      <div className="w-12 shrink-0 pt-0.5 text-sm leading-tight">
        <p className="font-semibold tabular-nums">{hhmm(session.start_time)}</p>
        <p className="tabular-nums text-slate-400">
          {fromMinutes(toMinutes(session.start_time) + session.duration_min)}
        </p>
      </div>
      <div className="min-w-0 flex-1">
        <p className={`flex items-center gap-1.5 font-medium ${cancelled ? 'line-through' : ''}`}>
          {session.type === 'group' && (
            <UsersIcon className="size-4 shrink-0 text-slate-400" aria-label="Группа" />
          )}
          <span className="truncate">{lessonTitle(session, dir)}</span>
          {groupSize !== null && (
            <span className="shrink-0 text-sm font-normal text-slate-400">· {groupSize}</span>
          )}
        </p>
        <p className="truncate text-sm text-slate-500 dark:text-slate-400">{details}</p>
        {summary && (
          <p
            className={`truncate text-xs font-medium ${
              summary.tone === 'ok'
                ? 'text-emerald-600 dark:text-emerald-400'
                : summary.tone === 'warn'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {summary.text}
          </p>
        )}
      </div>
      {badge && (
        <span className={`self-start rounded-md px-1.5 py-0.5 text-xs font-medium ${badge.cls}`}>
          {badge.text}
        </span>
      )}
    </button>
  )
}
