import { useEffect, useState, type MouseEvent } from 'react'
import type { Directory } from '@/lib/directory'
import type { Session } from '@/lib/types'
import { fromMinutes, hhmm, todayISO, toMinutes } from '@/lib/dates'
import { isUnmarked } from '@/lib/attendance'
import { lessonTitle, teacherColor } from '@/lib/schedule'
import { Card, EmptyState } from '@/components/ui'
import { DoorIcon } from '@/components/icons'

/** Пикселей на минуту: час = 72 px. */
const PX = 1.2
/** Отступ сверху и снизу, чтобы подписи крайних часов не обрезались. */
const PAD = 8
/** Рабочий день по умолчанию; раздвигается, если занятия раньше или позже. */
const DAY_FROM = 9 * 60
const DAY_TO = 21 * 60
/** Больше стольких кабинетов — сетка листается вбок в своей рамке. */
const FIT_COLUMNS = 4

type Column = { id: string | null; name: string; inactive: boolean }
type Placed = { session: Session; lane: number; lanes: number }

/**
 * Занятость кабинетов за день: колонки — кабинеты, строки — часы.
 * Нажатие на занятие открывает его, на свободное место — новое занятие
 * в этом кабинете и в это время.
 */
export function RoomGrid({
  date,
  sessions,
  dir,
  canCreate,
  onSelect,
  onCreate,
}: {
  date: string
  sessions: Session[]
  dir: Directory
  canCreate: boolean
  onSelect: (s: Session) => void
  onCreate: (roomId: string | null, start: string) => void
}) {
  const now = useNowMinutes()
  const live = sessions.filter((s) => s.status !== 'cancelled')
  const cancelled = sessions.length - live.length

  const used = new Set(live.map((s) => s.room_id))
  const columns: Column[] = dir.rooms
    .filter((r) => r.is_active || used.has(r.id))
    .map((r) => ({ id: r.id, name: r.name, inactive: !r.is_active }))
  if (used.has(null)) columns.push({ id: null, name: 'Без кабинета', inactive: false })

  if (columns.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<DoorIcon className="size-6" />}
          title="Кабинетов пока нет"
          hint="Добавьте их в разделе «Кабинеты» — здесь появится сетка занятости."
        />
      </Card>
    )
  }

  let from = DAY_FROM
  let to = DAY_TO
  for (const s of live) {
    const start = toMinutes(s.start_time)
    from = Math.min(from, Math.floor(start / 60) * 60)
    to = Math.max(to, Math.ceil((start + s.duration_min) / 60) * 60)
  }
  to = Math.min(to, 24 * 60)
  const height = (to - from) * PX + PAD * 2
  const y = (min: number) => PAD + (min - from) * PX
  const hours = Array.from({ length: (to - from) / 60 + 1 }, (_, i) => from + i * 60)

  const isToday = date === todayISO()
  const wide = columns.length > FIT_COLUMNS

  function create(e: MouseEvent<HTMLDivElement>, roomId: string | null) {
    if (!canCreate) return
    const rect = e.currentTarget.getBoundingClientRect()
    const min = from + (e.clientY - rect.top - PAD) / PX
    const snapped = Math.min(Math.max(Math.floor(min / 15) * 15, from), to - 15)
    onCreate(roomId, fromMinutes(snapped))
  }

  return (
    <div className="space-y-2">
      {/* Узкая сетка прокручивается вместе со страницей; широкая — в своей
          рамке, чтобы и названия кабинетов, и часы оставались на виду. */}
      <div
        className={`rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 ${
          wide ? 'max-h-[70dvh] overflow-auto overscroll-contain' : ''
        }`}
      >
        <div style={wide ? { minWidth: 40 + columns.length * 88 } : undefined}>
          {/* Названия кабинетов — прилипают к верху при прокрутке */}
          <div className="sticky top-0 z-30 flex rounded-t-2xl border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="sticky left-0 z-10 w-10 shrink-0 rounded-tl-2xl bg-white dark:bg-slate-900" />
            {columns.map((c) => (
              <div
                key={c.id ?? 'none'}
                className={`line-clamp-2 min-w-0 flex-1 border-l border-slate-100 px-1 py-2 text-center text-xs font-semibold leading-tight break-words dark:border-slate-800 ${
                  c.id === null || c.inactive ? 'text-slate-400' : ''
                }`}
                title={c.name}
              >
                {c.name}
              </div>
            ))}
          </div>

          <div className="relative flex" style={{ height }}>
            {/* Часы слева — остаются на месте при прокрутке вбок */}
            <div className="sticky left-0 z-20 w-10 shrink-0 bg-white dark:bg-slate-900">
              {hours.map((h) => (
                <span
                  key={h}
                  className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-slate-400"
                  style={{ top: y(h) }}
                >
                  {fromMinutes(h)}
                </span>
              ))}
            </div>

            <div className="relative flex flex-1">
              {/* Линии часов и получасов */}
              {hours.map((h) => (
                <div key={h} className="pointer-events-none absolute inset-x-0" style={{ top: y(h) }}>
                  <div className="border-t border-slate-200 dark:border-slate-800" />
                  {h < to && (
                    <div
                      className="border-t border-dashed border-slate-100 dark:border-slate-800/60"
                      style={{ marginTop: 30 * PX - 1 }}
                    />
                  )}
                </div>
              ))}

              {columns.map((c) => (
                <div
                  key={c.id ?? 'none'}
                  onClick={(e) => create(e, c.id)}
                  className={`relative min-w-0 flex-1 border-l border-slate-100 dark:border-slate-800 ${
                    canCreate ? 'cursor-pointer transition hover:bg-brand-50/40 dark:hover:bg-brand-950/20' : ''
                  }`}
                >
                  {layout(live.filter((s) => s.room_id === c.id)).map(({ session, lane, lanes }) => (
                    <Block
                      key={session.id}
                      session={session}
                      dir={dir}
                      top={y(toMinutes(session.start_time))}
                      height={session.duration_min * PX}
                      lane={lane}
                      lanes={lanes}
                      onClick={() => onSelect(session)}
                    />
                  ))}
                </div>
              ))}

              {/* Сейчас */}
              {isToday && now >= from && now <= to && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-rose-500"
                  style={{ top: y(now) }}
                >
                  <span className="absolute -left-1 -top-[3px] size-2 rounded-full bg-rose-500" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="px-1 text-xs text-slate-500 dark:text-slate-400">
        {canCreate
          ? 'Нажмите на свободное место, чтобы поставить занятие в этот кабинет и время.'
          : 'Прошедший день — только просмотр.'}
        {cancelled > 0 && ` Отменённые (${cancelled}) не показаны.`}
      </p>
    </div>
  )
}

function Block({
  session,
  dir,
  top,
  height,
  lane,
  lanes,
  onClick,
}: {
  session: Session
  dir: Directory
  top: number
  height: number
  lane: number
  lanes: number
  onClick: () => void
}) {
  const teacher = dir.profileById.get(session.teacher_id)
  const color = teacherColor(teacher)
  const unmarked = isUnmarked(session)
  // два занятия в одном кабинете одновременно — пересечение
  const clash = lanes > 1
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`absolute z-10 overflow-hidden rounded-md px-1 py-0.5 text-left text-[11px] leading-tight text-slate-800 transition hover:brightness-95 dark:text-slate-100 ${
        clash ? 'ring-2 ring-rose-500' : unmarked ? 'ring-1 ring-amber-400' : ''
      }`}
      style={{
        top: top + 1,
        height: Math.max(height - 2, 14),
        left: `calc(${(lane / lanes) * 100}% + 2px)`,
        width: `calc(${100 / lanes}% - 4px)`,
        background: `${color}26`,
        borderLeft: `3px solid ${color}`,
      }}
      title={`${hhmm(session.start_time)} · ${lessonTitle(session, dir)} · ${teacher?.full_name ?? ''}`}
    >
      <span className="block font-semibold tabular-nums">{hhmm(session.start_time)}</span>
      <span className="block truncate">{lessonTitle(session, dir)}</span>
      {height >= 48 && (
        <span className="block truncate text-slate-500 dark:text-slate-400">
          {teacher?.full_name.split(' ')[0]}
        </span>
      )}
    </button>
  )
}

/**
 * Раскладка пересекающихся занятий одного кабинета по дорожкам: такие
 * занятия встают рядом, каждое — на свою часть ширины колонки.
 */
function layout(sessions: Session[]): Placed[] {
  const sorted = [...sessions].sort(
    (a, b) => toMinutes(a.start_time) - toMinutes(b.start_time) || b.duration_min - a.duration_min,
  )
  const out: Placed[] = []
  let cluster: Placed[] = []
  let laneEnds: number[] = []
  let clusterEnd = -1

  const flush = () => {
    for (const p of cluster) p.lanes = laneEnds.length
    out.push(...cluster)
    cluster = []
    laneEnds = []
  }

  for (const s of sorted) {
    const start = toMinutes(s.start_time)
    const end = start + s.duration_min
    if (start >= clusterEnd) flush()
    let lane = laneEnds.findIndex((e) => e <= start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(end)
    } else {
      laneEnds[lane] = end
    }
    cluster.push({ session: s, lane, lanes: 1 })
    clusterEnd = Math.max(clusterEnd, end)
  }
  flush()
  return out
}

/** Текущее время в минутах; обновляется раз в минуту. */
function useNowMinutes(): number {
  const read = () => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  }
  const [now, setNow] = useState(read)
  useEffect(() => {
    const id = setInterval(() => setNow(read()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}
