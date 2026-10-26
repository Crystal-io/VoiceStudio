import { Fragment } from 'react'
import type { Directory } from '@/lib/directory'
import type { RoomBooking, Session } from '@/lib/types'
import { formatDayLong, fromISO, hhmm, todayISO, WEEKDAYS_SHORT } from '@/lib/dates'
import { isWorkDay, roomLoad } from '@/lib/rooms'
import { Card } from '@/components/ui'

/** Цвет клетки по доле занятого времени. */
function tone(percent: number, workDay: boolean): string {
  if (percent === 0) {
    return workDay
      ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
      : 'bg-slate-50 text-slate-300 dark:bg-slate-900 dark:text-slate-600'
  }
  if (percent < 25) return 'bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-200'
  if (percent < 50) return 'bg-brand-200 text-brand-900 dark:bg-brand-900 dark:text-brand-100'
  if (percent < 75) return 'bg-brand-400 text-white dark:bg-brand-700'
  return 'bg-brand-600 text-white dark:bg-brand-500'
}

/**
 * Загрузка кабинетов за неделю: строки — кабинеты, колонки — дни, в клетке —
 * сколько процентов рабочих часов студии кабинет занят (занятия и брони).
 * Нажатие на клетку открывает этот день в сетке кабинетов.
 */
export function RoomHeatmap({
  days,
  sessions,
  bookings,
  dir,
  selected,
  onSelect,
}: {
  days: string[]
  sessions: Session[]
  bookings: RoomBooking[]
  dir: Directory
  selected: string
  onSelect: (date: string) => void
}) {
  const rooms = dir.rooms.filter((r) => r.is_active)
  if (rooms.length === 0) return null
  const today = todayISO()

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2 px-0.5">
        <h3 className="text-sm font-semibold">Загрузка кабинетов</h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          % от {hhmm(dir.studio.open_time)}–{hhmm(dir.studio.close_time)}
        </span>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: '76px repeat(7, minmax(0, 1fr))' }}>
        <div />
        {days.map((d, i) => {
          const holiday = dir.holidays.get(d)
          return (
            <div
              key={d}
              title={holiday}
              className={`text-center text-[11px] font-semibold uppercase leading-tight ${
                holiday
                  ? 'text-rose-500'
                  : !isWorkDay(dir.studio, d)
                    ? 'text-slate-300 dark:text-slate-600'
                    : 'text-slate-400'
              }`}
            >
              {WEEKDAYS_SHORT[i]}
              <span className={`block text-[10px] font-medium normal-case ${d === today ? 'text-brand-600 dark:text-brand-400' : ''}`}>
                {fromISO(d).getDate()}
                {holiday ? '•' : ''}
              </span>
            </div>
          )
        })}

        {rooms.map((r) => (
          <Fragment key={r.id}>
            <div className="self-center truncate pr-1 text-xs font-medium" title={r.name}>
              {r.name}
            </div>
            {days.map((d) => {
              const { percent } = roomLoad(r.id, d, sessions, bookings, dir.studio)
              const workDay = isWorkDay(dir.studio, d)
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => onSelect(d)}
                  aria-label={`${r.name}, ${formatDayLong(d)}: занято ${percent}%`}
                  className={`flex h-8 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums transition hover:brightness-95 ${tone(percent, workDay)} ${
                    d === selected ? 'ring-2 ring-brand-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-900' : ''
                  }`}
                >
                  {percent === 0 && !workDay ? '—' : percent}
                </button>
              )
            })}
          </Fragment>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5 px-0.5 text-[11px] text-slate-500 dark:text-slate-400">
        <span>0%</span>
        {['bg-slate-100 dark:bg-slate-800', 'bg-brand-100 dark:bg-brand-950', 'bg-brand-200 dark:bg-brand-900', 'bg-brand-400 dark:bg-brand-700', 'bg-brand-600 dark:bg-brand-500'].map((c) => (
          <span key={c} className={`h-2.5 flex-1 rounded-sm ${c}`} />
        ))}
        <span>100%</span>
        <span className="ml-2 text-rose-500">• праздник</span>
      </div>
    </Card>
  )
}
