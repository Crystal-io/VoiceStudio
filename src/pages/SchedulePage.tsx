import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useProfile } from '@/lib/profile'
import { useDirectory } from '@/lib/directory'
import type { Attendance, Session } from '@/lib/types'
import {
  addDays,
  formatDayLong,
  formatWeekRange,
  fromISO,
  isISODate,
  startOfWeek,
  todayISO,
  weekDays,
  WEEKDAYS_SHORT,
} from '@/lib/dates'
import { ensureSessions, loadSessions } from '@/lib/schedule'
import { loadAttendance } from '@/lib/attendance'
import { Button, Card, EmptyState, ErrorNote, Segmented, SelectField, Spinner } from '@/components/ui'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '@/components/icons'
import { LessonCard } from '@/components/schedule/LessonCard'
import { NewLessonModal } from '@/components/schedule/NewLessonModal'
import { LessonDialogs } from '@/components/schedule/LessonDialogs'

type View = 'day' | 'week'

export function SchedulePage() {
  const { profile } = useProfile()
  const { dir, error: dirError } = useDirectory()
  const [params, setParams] = useSearchParams()

  const isDirector = profile?.role === 'director'
  const today = todayISO()
  const date = isISODate(params.get('date')) ? params.get('date')! : today
  const view: View = params.get('view') === 'week' ? 'week' : 'day'
  // педагог видит только свои занятия; директор — всех или выбранного
  const teacherFilter = isDirector ? (params.get('teacher') ?? 'all') : (profile?.id ?? '')

  const weekStart = startOfWeek(date)
  const weekEnd = addDays(weekStart, 6)
  const days = weekDays(weekStart)

  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [attendance, setAttendance] = useState<Map<string, Attendance[]>>(new Map())
  const [loadError, setLoadError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Session | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const ensureError = await ensureSessions(weekEnd)
      const res = await loadSessions(
        weekStart,
        weekEnd,
        teacherFilter === 'all' ? undefined : teacherFilter,
      )
      const att = await loadAttendance(res.sessions.map((s) => s.id))
      if (!alive) return
      setSessions(res.sessions)
      setAttendance(att.bySession)
      setLoadError(ensureError ?? res.error ?? att.error)
    })()
    return () => {
      alive = false
    }
  }, [weekStart, weekEnd, teacherFilter, version])

  function update(next: { date?: string; view?: View; teacher?: string }) {
    const p = new URLSearchParams(params)
    if (next.date !== undefined) p.set('date', next.date)
    if (next.view !== undefined) {
      if (next.view === 'week') p.set('view', 'week')
      else p.delete('view')
    }
    if (next.teacher !== undefined) {
      if (next.teacher === 'all') p.delete('teacher')
      else p.set('teacher', next.teacher)
    }
    setParams(p, { replace: true })
  }

  function changed(goTo?: string) {
    setSelected(null)
    setCreating(false)
    if (goTo) update({ date: goTo })
    setVersion((v) => v + 1)
  }

  const byDay = new Map<string, Session[]>()
  for (const s of sessions ?? []) {
    const list = byDay.get(s.date) ?? []
    list.push(s)
    byDay.set(s.date, list)
  }
  const showTeacher = isDirector && teacherFilter === 'all'

  const teacherOptions = dir?.profiles.filter((p) => p.is_active) ?? []

  const renderList = (list: Session[]) => (
    <div className="space-y-2">
      {list.map((s) => (
        <LessonCard
          key={s.id}
          session={s}
          dir={dir!}
          attendance={attendance.get(s.id) ?? []}
          showTeacher={showTeacher}
          onClick={() => setSelected(s)}
        />
      ))}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Расписание</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isDirector ? 'Все занятия студии.' : 'Ваши занятия.'}
          </p>
        </div>
        <Button onClick={() => setCreating(true)} disabled={!dir} className="shrink-0">
          <PlusIcon className="size-5" />
          Добавить
        </Button>
      </div>

      <Card className="p-3">
        <div className="flex items-center justify-between gap-2">
          <NavButton label="Предыдущая неделя" onClick={() => update({ date: addDays(date, -7) })}>
            <ChevronLeftIcon className="size-5" />
          </NavButton>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{formatWeekRange(weekStart)}</span>
            {(date < startOfWeek(today) || date > addDays(startOfWeek(today), 6)) && (
              <button
                type="button"
                onClick={() => update({ date: today })}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-600 ring-1 ring-brand-200 transition hover:bg-brand-50 dark:text-brand-400 dark:ring-brand-800 dark:hover:bg-brand-950/40"
              >
                Сегодня
              </button>
            )}
          </div>
          <NavButton label="Следующая неделя" onClick={() => update({ date: addDays(date, 7) })}>
            <ChevronRightIcon className="size-5" />
          </NavButton>
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1">
          {days.map((d, i) => {
            const count = (byDay.get(d) ?? []).filter((s) => s.status !== 'cancelled').length
            const isSelected = view === 'day' && d === date
            return (
              <button
                key={d}
                type="button"
                onClick={() => update({ date: d, view: 'day' })}
                aria-label={formatDayLong(d)}
                aria-pressed={isSelected}
                className={`flex flex-col items-center gap-0.5 rounded-xl py-1.5 transition ${
                  isSelected
                    ? 'bg-brand-600 text-white'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span
                  className={`text-[11px] font-medium uppercase ${
                    isSelected ? 'text-white/80' : i >= 5 ? 'text-rose-400' : 'text-slate-400'
                  }`}
                >
                  {WEEKDAYS_SHORT[i]}
                </span>
                <span
                  className={`flex size-7 items-center justify-center rounded-full text-sm font-semibold ${
                    d === today && !isSelected ? 'ring-2 ring-brand-500' : ''
                  }`}
                >
                  {fromISO(d).getDate()}
                </span>
                <span
                  className={`size-1.5 rounded-full ${
                    count === 0 ? 'bg-transparent' : isSelected ? 'bg-white' : 'bg-brand-500'
                  }`}
                />
              </button>
            )
          })}
        </div>
      </Card>

      <Segmented<View>
        value={view}
        onChange={(v) => update({ view: v })}
        options={[
          { value: 'day', label: 'День' },
          { value: 'week', label: 'Неделя' },
        ]}
      />

      {isDirector && (
        <SelectField
          value={teacherFilter}
          onChange={(e) => update({ teacher: e.target.value })}
          aria-label="Педагог"
        >
          <option value="all">Все педагоги</option>
          {teacherOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </SelectField>
      )}

      {(dirError || loadError) && <ErrorNote text={(dirError ?? loadError)!} />}

      {!sessions || !dir ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : view === 'day' ? (
        <section className="space-y-2">
          <h3 className="px-1 text-sm font-semibold text-slate-500 first-letter:uppercase dark:text-slate-400">
            {formatDayLong(date)}
            {date === today ? ' · сегодня' : ''}
          </h3>
          {(byDay.get(date) ?? []).length > 0 ? (
            renderList(byDay.get(date)!)
          ) : (
            <Card>
              <EmptyState
                icon={<CalendarIcon className="size-6" />}
                title="Занятий нет"
                hint="Нажмите «Добавить», чтобы поставить занятие на этот день."
              />
            </Card>
          )}
        </section>
      ) : (sessions ?? []).length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarIcon className="size-6" />}
            title="На этой неделе занятий нет"
            hint="Добавьте разовое или повторяющееся занятие."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {days
            .filter((d) => byDay.has(d))
            .map((d) => (
              <section key={d} className="space-y-2">
                <h3 className="px-1 text-sm font-semibold text-slate-500 first-letter:uppercase dark:text-slate-400">
                  {formatDayLong(d)}
                  {d === today ? ' · сегодня' : ''}
                </h3>
                {renderList(byDay.get(d)!)}
              </section>
            ))}
        </div>
      )}

      {creating && dir && profile && (
        <NewLessonModal
          dir={dir}
          me={profile}
          defaultDate={date < today ? today : date}
          onClose={() => setCreating(false)}
          onDone={changed}
        />
      )}

      {selected && dir && profile && (
        <LessonDialogs
          key={selected.id}
          session={selected}
          dir={dir}
          me={profile}
          onClose={() => setSelected(null)}
          onChanged={changed}
        />
      )}
    </div>
  )
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      {children}
    </button>
  )
}
