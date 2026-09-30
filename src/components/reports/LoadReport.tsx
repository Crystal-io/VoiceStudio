import { Link } from 'react-router-dom'
import type { Directory } from '@/lib/directory'
import type { Session } from '@/lib/types'
import { todayISO } from '@/lib/dates'
import { formatDuration, plural, pluralForm } from '@/lib/format'
import { loadByRoom, loadByTeacher, tally, type Period, type Tally } from '@/lib/reports'
import { teacherColor } from '@/lib/schedule'
import { Badge, Card, EmptyState } from '@/components/ui'
import { ChartIcon, ChevronRightIcon } from '@/components/icons'
import { Legend, SectionTitle, StackBar } from '@/components/reports/parts'

/** Нагрузка за период: итог, педагоги, кабинеты. */
export function LoadReport({
  period,
  sessions,
  dir,
}: {
  period: Period
  sessions: Session[]
  dir: Directory
}) {
  const total = tally(sessions)
  const teachers = loadByTeacher(sessions, dir)
  const rooms = loadByRoom(sessions, dir)
  const maxTeacher = Math.max(...teachers.map((t) => t.tally.minutes), 1)
  const maxRoom = Math.max(...rooms.map((r) => r.tally.minutes), 1)

  // ссылки в расписание — на сегодня, если он в периоде, иначе на начало
  const today = todayISO()
  const anchor = period.from <= today && today <= period.to ? today : period.from

  if (sessions.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<ChartIcon className="size-6" />}
          title="За этот период занятий нет"
          hint="Нагрузка появится, когда в расписании будут занятия."
        />
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Stat value={String(total.count)} label={pluralForm(total.count, ['занятие', 'занятия', 'занятий'])} />
          <Stat value={formatDuration(total.minutes)} label="всего часов" />
        </div>
        <StateLine t={total} withCount={false} />
      </Card>

      <section className="space-y-2">
        <SectionTitle>Педагоги</SectionTitle>
        <div className="px-1">
          <Legend
            items={[
              { label: 'проведено', className: 'bg-slate-400' },
              { label: 'не отмечено', className: 'bg-amber-400' },
              { label: 'впереди', className: 'bg-slate-400/40' },
            ]}
          />
        </div>
        <div className="space-y-2">
          {teachers.map(({ id, teacher, tally: t }) => {
            const color = teacherColor(teacher ?? null)
            return (
              <Link
                key={id}
                to={`/schedule?teacher=${id}&view=week&date=${anchor}`}
                className="block"
              >
                <Card className="space-y-2 p-3 transition hover:ring-brand-300 dark:hover:ring-brand-700">
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {teacher?.full_name ?? 'Педагог'}
                      {teacher && !teacher.is_active && <Badge>отключён</Badge>}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatDuration(t.minutes)}
                    </span>
                    <ChevronRightIcon className="size-4 shrink-0 text-slate-300 dark:text-slate-600" />
                  </div>
                  <StackBar
                    total={maxTeacher}
                    parts={[
                      { value: t.minutesByState.done, style: { background: color } },
                      { value: t.minutesByState.unmarked, className: 'bg-amber-400' },
                      { value: t.minutesByState.planned, style: { background: color, opacity: 0.3 } },
                    ]}
                  />
                  <StateLine t={t} />
                </Card>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="space-y-2">
        <SectionTitle aside="нажмите — сетка по дням">Кабинеты</SectionTitle>
        <div className="space-y-2">
          {rooms.map(({ id, room, tally: t }) => (
            <Link
              key={id ?? 'none'}
              to={`/schedule?view=rooms&date=${anchor}`}
              className="block"
            >
              <Card className="space-y-2 p-3 transition hover:ring-brand-300 dark:hover:ring-brand-700">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {id === null ? 'Без кабинета' : (room?.name ?? 'Кабинет')}
                    {room && !room.is_active && <Badge>выключен</Badge>}
                  </span>
                  <span className="shrink-0 text-sm text-slate-500 dark:text-slate-400">
                    {plural(t.count, ['занятие', 'занятия', 'занятий'])} ·
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatDuration(t.minutes)}
                  </span>
                  <ChevronRightIcon className="size-4 shrink-0 text-slate-300 dark:text-slate-600" />
                </div>
                <StackBar total={maxRoom} parts={[{ value: t.minutes, className: 'bg-brand-500' }]} />
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  )
}

/** «12 занятий · проведено 8 · не отмечено 1 · впереди 3 · отменено 1» */
function StateLine({ t, withCount = true }: { t: Tally; withCount?: boolean }) {
  const parts = [
    withCount && { text: plural(t.count, ['занятие', 'занятия', 'занятий']), cls: '' },
    t.byState.done > 0 && { text: `проведено ${t.byState.done}`, cls: '' },
    t.byState.unmarked > 0 && {
      text: `не отмечено ${t.byState.unmarked}`,
      cls: 'font-medium text-amber-600 dark:text-amber-400',
    },
    t.byState.planned > 0 && { text: `впереди ${t.byState.planned}`, cls: '' },
    t.byState.cancelled > 0 && { text: `отменено ${t.byState.cancelled}`, cls: 'text-slate-400' },
  ].filter((p): p is { text: string; cls: string } => !!p)
  return (
    <p className="text-xs text-slate-500 dark:text-slate-400">
      {parts.map((p, i) => (
        <span key={p.text} className={p.cls}>
          {i > 0 && ' · '}
          {p.text}
        </span>
      ))}
    </p>
  )
}
