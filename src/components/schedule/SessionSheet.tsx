import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import type { Directory } from '@/lib/directory'
import type { LessonSeries, Session } from '@/lib/types'
import { formatDayLong, formatDayMonth, hhmm, timeRange, WEEKDAYS_EVERY } from '@/lib/dates'
import { findPhone } from '@/lib/format'
import { lessonTitle, seriesColumns, teacherColor } from '@/lib/schedule'
import { Button, ErrorNote, Modal } from '@/components/ui'
import {
  CalendarIcon,
  ClockIcon,
  DoorIcon,
  PhoneIcon,
  RepeatIcon,
  UserIcon,
  UsersIcon,
} from '@/components/icons'

type Confirm = 'delete' | 'stop' | null

/** Подробности занятия и действия с ним. */
export function SessionSheet({
  session,
  dir,
  canEdit,
  onClose,
  onChanged,
  onMove,
  onEditSeries,
}: {
  session: Session
  dir: Directory
  canEdit: boolean
  onClose: () => void
  /** занятие изменилось или удалено — перечитать список */
  onChanged: () => void
  onMove: () => void
  onEditSeries: (series: LessonSeries) => void
}) {
  const [series, setSeries] = useState<LessonSeries | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session.series_id) return
    let alive = true
    void supabase
      .from('lesson_series')
      .select(seriesColumns)
      .eq('id', session.series_id)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setSeries((data as LessonSeries) ?? null)
      })
    return () => {
      alive = false
    }
  }, [session.series_id])

  const teacher = dir.profileById.get(session.teacher_id)
  const room = session.room_id ? dir.roomById.get(session.room_id)?.name : null
  const cancelled = session.status === 'cancelled'
  const moved = !!session.occurrence_date && session.occurrence_date !== session.date
  const student = session.student_id ? dir.studentById.get(session.student_id) : null
  const phone = findPhone(student?.parent_contact ?? null)
  const members =
    session.type === 'group'
      ? (dir.membersByGroup.get(session.group_id ?? '') ?? [])
          .map((id) => dir.studentById.get(id))
          .filter((s) => s && s.is_active)
          .map((s) => s!.full_name)
          .sort((a, b) => a.localeCompare(b, 'ru'))
      : []

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>) {
    setError(null)
    setBusy(true)
    const { error } = await action()
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    onChanged()
  }

  function toggleCancelled() {
    void run(() =>
      supabase
        .from('sessions')
        .update({ status: cancelled ? 'scheduled' : 'cancelled' })
        .eq('id', session.id),
    )
  }

  async function deleteOneOff() {
    // занятие с отметками посещаемости не удаляем — их унесло бы каскадом
    const { count } = await supabase
      .from('attendance')
      .select('session_id', { count: 'exact', head: true })
      .eq('session_id', session.id)
    if (count) {
      setError('На занятии уже отмечена посещаемость — его можно только отменить.')
      setConfirm(null)
      return
    }
    void run(() => supabase.from('sessions').delete().eq('id', session.id))
  }

  function stopSeries() {
    void run(() =>
      supabase.rpc('stop_series', { p_series: session.series_id, p_from: session.date }),
    )
  }

  return (
    <Modal title={lessonTitle(session, dir)} onClose={onClose}>
      <div className="space-y-4">
        {cancelled && (
          <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            Занятие отменено
          </div>
        )}

        <ul className="space-y-2.5 text-sm">
          <InfoRow icon={<CalendarIcon className="size-5" />}>
            <span className="block first-letter:uppercase">{formatDayLong(session.date)}</span>
            {moved && (
              <span className="block text-amber-600 dark:text-amber-400">
                перенесено с {formatDayMonth(session.occurrence_date!)}
              </span>
            )}
          </InfoRow>
          <InfoRow icon={<ClockIcon className="size-5" />}>
            {timeRange(session.start_time, session.duration_min)} · {session.duration_min} мин
          </InfoRow>
          <InfoRow
            icon={
              <span
                className="block size-3 rounded-full"
                style={{ background: teacherColor(teacher) }}
              />
            }
          >
            {teacher?.full_name ?? 'Педагог'}
          </InfoRow>
          <InfoRow icon={<DoorIcon className="size-5" />}>{room ?? 'Без кабинета'}</InfoRow>
          <InfoRow icon={<RepeatIcon className="size-5" />}>
            {!session.series_id
              ? 'Разовое занятие'
              : series
                ? seriesText(series)
                : 'Повторяющееся занятие'}
          </InfoRow>
          {session.type === 'group' ? (
            <InfoRow icon={<UsersIcon className="size-5" />}>
              {members.length > 0 ? members.join(', ') : 'В группе пока никого'}
            </InfoRow>
          ) : (
            student?.parent_contact && (
              <InfoRow icon={<UserIcon className="size-5" />}>
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
              </InfoRow>
            )
          )}
        </ul>

        {error && <ErrorNote text={error} />}

        {canEdit && confirm && (
          <div className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800/60">
            <p>
              {confirm === 'delete'
                ? 'Удалить это разовое занятие?'
                : `Остановить повторение? Это и все следующие занятия серии (с ${formatDayMonth(session.date)}) будут удалены. Прошедшие останутся.`}
            </p>
            <div className="flex gap-2">
              <Button
                variant="danger"
                disabled={busy}
                onClick={confirm === 'delete' ? deleteOneOff : stopSeries}
                className="flex-1"
              >
                {confirm === 'delete' ? 'Да, удалить' : 'Да, остановить'}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setConfirm(null)}
                className="flex-1"
              >
                Нет
              </Button>
            </div>
          </div>
        )}

        {canEdit && !confirm && (
          <div className="grid gap-2">
            <Button variant="ghost" disabled={busy} onClick={onMove}>
              {cancelled ? 'Перенести на другое время' : 'Перенести это занятие'}
            </Button>
            {series && (
              <Button variant="ghost" disabled={busy} onClick={() => onEditSeries(series)}>
                Изменить расписание серии
              </Button>
            )}
            {session.status !== 'done' && (
              <Button variant={cancelled ? 'ghost' : 'danger'} disabled={busy} onClick={toggleCancelled}>
                {cancelled ? 'Вернуть занятие' : 'Отменить занятие'}
              </Button>
            )}
            {session.series_id ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirm('stop')}
                className="py-2 text-sm font-medium text-rose-600 transition hover:underline dark:text-rose-400"
              >
                Остановить повторение
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirm('delete')}
                className="py-2 text-sm font-medium text-rose-600 transition hover:underline dark:text-rose-400"
              >
                Удалить занятие
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

function InfoRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex size-5 shrink-0 items-center justify-center text-slate-400">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-slate-700 dark:text-slate-200">{children}</span>
    </li>
  )
}

/** «каждый вторник в 15:00, с 1 сентября по 31 мая» */
function seriesText(s: LessonSeries): string {
  let text = `${WEEKDAYS_EVERY[s.weekday]} в ${hhmm(s.start_time)}, с ${formatDayMonth(s.start_date)}`
  if (s.end_date) text += ` по ${formatDayMonth(s.end_date)}`
  return text.charAt(0).toUpperCase() + text.slice(1)
}
