import type { MouseEvent } from 'react'
import { useNowMinutes } from '@/lib/useNow'
import type { Directory } from '@/lib/directory'
import type { Profile, RoomBooking, Session } from '@/lib/types'
import { fromMinutes, hhmm, todayISO, toMinutes } from '@/lib/dates'
import { isUnmarked } from '@/lib/attendance'
import { lessonTitle, teacherColor } from '@/lib/schedule'
import { bookingState, confirmDeadline } from '@/lib/bookings'
import { busyIntervals, freeGaps, workRange } from '@/lib/rooms'
import { Card, EmptyState } from '@/components/ui'
import { DoorIcon } from '@/components/icons'

/** Пикселей на минуту: час = 72 px. */
const PX = 1.2
/** Отступ сверху и снизу, чтобы подписи крайних часов не обрезались. */
const PAD = 8
/** Больше стольких кабинетов — сетка листается вбок в своей рамке. */
const FIT_COLUMNS = 4
/** Свободное окно короче этого не подписываем. */
const MIN_GAP = 30

type Column = { id: string | null; name: string; inactive: boolean }
type Item =
  | { kind: 'session'; start: number; end: number; session: Session }
  | { kind: 'booking'; start: number; end: number; booking: RoomBooking }
type Placed = { item: Item; lane: number; lanes: number }

/**
 * Занятость кабинетов за день: колонки — кабинеты, строки — часы работы
 * студии. Директор видит все занятия; педагог — свои, а чужие — как
 * «занято». Брони без урока — штриховкой, свободные окна — пунктиром.
 * Нажатие на свободное место — новое занятие или бронь в это время.
 */
export function RoomGrid({
  date,
  sessions,
  bookings,
  dir,
  me,
  canCreate,
  onSelect,
  onSelectBooking,
  onCreate,
}: {
  date: string
  sessions: Session[]
  bookings: RoomBooking[]
  dir: Directory
  me: Profile
  canCreate: boolean
  onSelect: (s: Session) => void
  onSelectBooking: (b: RoomBooking) => void
  onCreate: (roomId: string | null, start: string) => void
}) {
  const now = useNowMinutes()
  const isDirector = me.role === 'director'
  const live = sessions.filter((s) => s.status !== 'cancelled')
  const cancelled = sessions.length - live.length
  const liveBookings = bookings.filter((b) => bookingState(b) !== 'released')
  const released = bookings.length - liveBookings.length

  const used = new Set<string | null>([...live.map((s) => s.room_id), ...liveBookings.map((b) => b.room_id)])
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
          hint="Директор добавляет их в разделе «Кабинеты» — здесь появится сетка занятости."
        />
      </Card>
    )
  }

  const items: Item[] = [
    ...live.map((s) => {
      const start = toMinutes(s.start_time)
      return { kind: 'session' as const, start, end: start + s.duration_min, session: s }
    }),
    ...liveBookings.map((b) => {
      const start = toMinutes(b.start_time)
      return { kind: 'booking' as const, start, end: start + b.duration_min, booking: b }
    }),
  ]
  const roomOf = (i: Item) => (i.kind === 'session' ? i.session.room_id : i.booking.room_id)

  // сетка — по часам работы студии; раздвигается, если занятия раньше или позже
  const [open, close] = workRange(dir.studio)
  let from = Math.floor(open / 60) * 60
  let to = Math.ceil(close / 60) * 60
  for (const i of items) {
    from = Math.min(from, Math.floor(i.start / 60) * 60)
    to = Math.max(to, Math.ceil(i.end / 60) * 60)
  }
  to = Math.min(to, 24 * 60)
  const height = (to - from) * PX + PAD * 2
  const y = (min: number) => PAD + (min - from) * PX
  const hours = Array.from({ length: (to - from) / 60 + 1 }, (_, i) => from + i * 60)

  const today = todayISO()
  const isToday = date === today
  const wide = columns.length > FIT_COLUMNS
  // свободные окна — только в рабочие часы и только впереди
  const gapFrom = isToday ? Math.max(open, Math.ceil(now / 15) * 15) : open
  const showGaps = date >= today

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
              {/* Вне рабочих часов — притушено */}
              {open > from && (
                <div className="pointer-events-none absolute inset-x-0 top-0 bg-slate-50 dark:bg-slate-950/40" style={{ height: y(open) }} />
              )}
              {close < to && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-slate-50 dark:bg-slate-950/40" style={{ top: y(close) }} />
              )}

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
                  {showGaps &&
                    c.id !== null &&
                    freeGaps(busyIntervals(c.id, date, live, liveBookings), gapFrom, close, MIN_GAP).map(([s, e]) => (
                      <div
                        key={s}
                        className="pointer-events-none absolute inset-x-1 rounded-md border border-dashed border-emerald-300 dark:border-emerald-800"
                        style={{ top: y(s) + 2, height: (e - s) * PX - 4 }}
                      >
                        <span className="block px-1 pt-0.5 text-[10px] leading-tight text-emerald-700 dark:text-emerald-400">
                          свободно {fromMinutes(s)}–{fromMinutes(e)}
                        </span>
                      </div>
                    ))}

                  {layout(items.filter((i) => roomOf(i) === c.id)).map(({ item, lane, lanes }) => {
                    const pos = {
                      top: y(item.start),
                      height: (item.end - item.start) * PX,
                      lane,
                      lanes,
                    }
                    if (item.kind === 'booking') {
                      return (
                        <BookingBlock
                          key={`b:${item.booking.id}`}
                          booking={item.booking}
                          dir={dir}
                          {...pos}
                          onClick={() => onSelectBooking(item.booking)}
                        />
                      )
                    }
                    const mine = isDirector || item.session.teacher_id === me.id
                    return mine ? (
                      <Block
                        key={item.session.id}
                        session={item.session}
                        dir={dir}
                        {...pos}
                        onClick={() => onSelect(item.session)}
                      />
                    ) : (
                      <BusyBlock key={item.session.id} session={item.session} {...pos} />
                    )
                  })}
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
          ? 'Нажмите на свободное место, чтобы поставить занятие или забронировать кабинет.'
          : 'Прошедший день — только просмотр.'}
        {!isDirector && ' Чужие занятия — «занято».'}
        {cancelled > 0 && ` Отменённые занятия (${cancelled}) не показаны.`}
        {released > 0 && ` Снятые брони (${released}) не показаны.`}
      </p>
    </div>
  )
}

type Pos = { top: number; height: number; lane: number; lanes: number }

function blockStyle({ top, height, lane, lanes }: Pos) {
  return {
    top: top + 1,
    height: Math.max(height - 2, 14),
    left: `calc(${(lane / lanes) * 100}% + 2px)`,
    width: `calc(${100 / lanes}% - 4px)`,
  }
}

function Block({
  session,
  dir,
  onClick,
  ...pos
}: Pos & { session: Session; dir: Directory; onClick: () => void }) {
  const teacher = dir.profileById.get(session.teacher_id)
  const color = teacherColor(teacher)
  const unmarked = isUnmarked(session)
  // два занятия в одном кабинете одновременно — пересечение
  const clash = pos.lanes > 1
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
      style={{ ...blockStyle(pos), background: `${color}26`, borderLeft: `3px solid ${color}` }}
      title={`${hhmm(session.start_time)} · ${lessonTitle(session, dir)} · ${teacher?.full_name ?? ''}`}
    >
      <span className="block font-semibold tabular-nums">{hhmm(session.start_time)}</span>
      <span className="block truncate">{lessonTitle(session, dir)}</span>
      {pos.height >= 48 && (
        <span className="block truncate text-slate-500 dark:text-slate-400">
          {teacher?.full_name.split(' ')[0]}
        </span>
      )}
    </button>
  )
}

/** Чужое занятие в сетке педагога: время и «занято», без подробностей. */
function BusyBlock({ session, ...pos }: Pos & { session: Session }) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`absolute z-10 overflow-hidden rounded-md bg-slate-200/70 px-1 py-0.5 text-[11px] leading-tight text-slate-500 dark:bg-slate-700/60 dark:text-slate-300 ${
        pos.lanes > 1 ? 'ring-2 ring-rose-500' : ''
      }`}
      style={blockStyle(pos)}
    >
      <span className="block font-semibold tabular-nums">{hhmm(session.start_time)}</span>
      <span className="block truncate">занято</span>
    </div>
  )
}

function BookingBlock({
  booking,
  dir,
  onClick,
  ...pos
}: Pos & { booking: RoomBooking; dir: Directory; onClick: () => void }) {
  const state = bookingState(booking)
  const author = booking.created_by ? dir.profileById.get(booking.created_by)?.full_name : null
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`absolute z-10 overflow-hidden rounded-md px-1 py-0.5 text-left text-[11px] leading-tight text-slate-700 transition hover:brightness-95 dark:text-slate-200 ${
        pos.lanes > 1 ? 'ring-2 ring-rose-500' : state === 'confirm_now' ? 'ring-2 ring-amber-400' : 'ring-1 ring-slate-300 dark:ring-slate-600'
      }`}
      style={{
        ...blockStyle(pos),
        background:
          'repeating-linear-gradient(135deg, rgb(148 163 184 / 0.18) 0 6px, rgb(148 163 184 / 0.06) 6px 12px)',
      }}
      title={`Бронь · ${hhmm(booking.start_time)} · ${booking.title}${author ? ` · ${author}` : ''}`}
    >
      <span className="block font-semibold tabular-nums">{hhmm(booking.start_time)} · бронь</span>
      <span className="block truncate">{booking.title}</span>
      {state === 'confirm_now' ? (
        <span className="block truncate font-medium text-amber-700 dark:text-amber-300">
          подтвердить до {confirmDeadline(booking)}
        </span>
      ) : (
        pos.height >= 48 &&
        author && <span className="block truncate text-slate-500 dark:text-slate-400">{author.split(' ')[0]}</span>
      )}
    </button>
  )
}

/**
 * Раскладка пересекающихся занятий и броней одного кабинета по дорожкам:
 * такие встают рядом, каждое — на свою часть ширины колонки.
 */
function layout(items: Item[]): Placed[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end)
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

  for (const item of sorted) {
    if (item.start >= clusterEnd) flush()
    let lane = laneEnds.findIndex((e) => e <= item.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(item.end)
    } else {
      laneEnds[lane] = item.end
    }
    cluster.push({ item, lane, lanes: 1 })
    clusterEnd = Math.max(clusterEnd, item.end)
  }
  flush()
  return out
}
