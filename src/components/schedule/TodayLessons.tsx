import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDirectory } from '@/lib/directory'
import { useProfile } from '@/lib/profile'
import type { Attendance, Session } from '@/lib/types'
import { addDays, formatDayLong, formatDayShort, todayISO } from '@/lib/dates'
import { ensureSessions, loadSessions } from '@/lib/schedule'
import { isUnmarked, loadAttendance } from '@/lib/attendance'
import { Card, Spinner } from '@/components/ui'
import { LessonCard } from '@/components/schedule/LessonCard'
import { LessonDialogs } from '@/components/schedule/LessonDialogs'

/** За сколько дней назад напоминать о неотмеченных занятиях. */
const UNMARKED_DAYS = 30
/** Сколько неотмеченных показывать на главной. */
const UNMARKED_SHOWN = 5

/**
 * Главная: «Не отмечены» (прошедшие занятия без посещаемости) и «Сегодня».
 * teacherId — только занятия педагога; без него — вся студия (директор).
 */
export function TodayLessons({ teacherId }: { teacherId?: string }) {
  const { profile } = useProfile()
  const { dir } = useDirectory()
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [attendance, setAttendance] = useState<Map<string, Attendance[]>>(new Map())
  const [selected, setSelected] = useState<Session | null>(null)
  const [version, setVersion] = useState(0)
  const today = todayISO()

  useEffect(() => {
    let alive = true
    void (async () => {
      await ensureSessions(today)
      const res = await loadSessions(addDays(today, -UNMARKED_DAYS), today, teacherId)
      const att = await loadAttendance(res.sessions.map((s) => s.id))
      if (!alive) return
      setSessions(res.sessions)
      setAttendance(att.bySession)
    })()
    return () => {
      alive = false
    }
  }, [today, teacherId, version])

  const todays = (sessions ?? []).filter((s) => s.date === today)
  // сначала самые давние — их важнее не забыть
  const unmarked = (sessions ?? []).filter((s) => s.date < today && isUnmarked(s))

  const card = (s: Session, withDate = false) => (
    <div key={s.id} className="space-y-1">
      {withDate && (
        <p className="px-1 text-xs font-medium text-slate-500 first-letter:uppercase dark:text-slate-400">
          {formatDayShort(s.date)}
        </p>
      )}
      <LessonCard
        session={s}
        dir={dir!}
        attendance={attendance.get(s.id) ?? []}
        showTeacher={!teacherId}
        onClick={() => setSelected(s)}
      />
    </div>
  )

  return (
    <div className="space-y-5">
      {dir && unmarked.length > 0 && (
        <section className="space-y-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            Не отмечена посещаемость · {unmarked.length}
          </h3>
          <div className="space-y-2">
            {unmarked.slice(0, UNMARKED_SHOWN).map((s) => card(s, true))}
          </div>
          {unmarked.length > UNMARKED_SHOWN && (
            <p className="px-1 text-xs text-slate-500 dark:text-slate-400">
              И ещё {unmarked.length - UNMARKED_SHOWN} — найдёте их в расписании по метке
              «не отмечено».
            </p>
          )}
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-baseline justify-between px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Сегодня · {formatDayLong(today)}
          </h3>
          <Link
            to="/schedule"
            className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            Расписание →
          </Link>
        </div>
        {!sessions || !dir ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : todays.length === 0 ? (
          <Card className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Сегодня занятий нет.
          </Card>
        ) : (
          <div className="space-y-2">{todays.map((s) => card(s))}</div>
        )}
      </section>

      {selected && dir && profile && (
        <LessonDialogs
          key={selected.id}
          session={selected}
          dir={dir}
          me={profile}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null)
            setVersion((v) => v + 1)
          }}
        />
      )}
    </div>
  )
}
