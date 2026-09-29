import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDirectory } from '@/lib/directory'
import type { Session } from '@/lib/types'
import { formatDayLong, todayISO } from '@/lib/dates'
import { ensureSessions, loadSessions } from '@/lib/schedule'
import { Card, Spinner } from '@/components/ui'
import { LessonCard } from '@/components/schedule/LessonCard'

/** Занятия на сегодня: педагога (teacherId) или всей студии. */
export function TodayLessons({ teacherId }: { teacherId?: string }) {
  const { dir } = useDirectory()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const today = todayISO()

  useEffect(() => {
    let alive = true
    void (async () => {
      await ensureSessions(today)
      const res = await loadSessions(today, today, teacherId)
      if (alive) setSessions(res.sessions)
    })()
    return () => {
      alive = false
    }
  }, [today, teacherId])

  return (
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
      ) : sessions.length === 0 ? (
        <Card className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Сегодня занятий нет.
        </Card>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <LessonCard
              key={s.id}
              session={s}
              dir={dir}
              showTeacher={!teacherId}
              onClick={() => navigate(`/schedule?date=${today}`)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
