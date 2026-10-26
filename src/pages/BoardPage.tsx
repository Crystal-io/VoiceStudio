import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDirectory, type Directory } from '@/lib/directory'
import type { RoomBooking, Session } from '@/lib/types'
import { formatDayLong, fromMinutes, hhmm, todayISO, toMinutes } from '@/lib/dates'
import { loadSessions } from '@/lib/schedule'
import { bookingState, confirmBooking, confirmDeadline, isLiveBooking, loadBookings } from '@/lib/bookings'
import { groupMemberIds } from '@/lib/attendance'
import { useNow } from '@/lib/useNow'
import { Spinner } from '@/components/ui'

/** Как часто перечитывать расписание. */
const RELOAD_MS = 60_000

type Item =
  | { kind: 'session'; start: number; end: number; session: Session }
  | { kind: 'booking'; start: number; end: number; booking: RoomBooking }

/**
 * Табло для холла: что сейчас и что дальше в каждом кабинете. Крупно, без
 * меню, обновляется само и не даёт экрану погаснуть — для планшета или ТВ
 * на стене. Детей показываем «Алиса М.» — экран видят все в холле.
 */
export function BoardPage() {
  const { dir, reload: reloadDir } = useDirectory()
  const navigate = useNavigate()
  const now = useNow(15_000)
  const today = todayISO()
  const [data, setData] = useState<{ day: string; sessions: Session[]; bookings: RoomBooking[] } | null>(null)
  const [tick, setTick] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void Promise.all([loadSessions(today, today), loadBookings(today, today)]).then(([s, b]) => {
      if (!alive) return
      setData({ day: today, sessions: s.sessions, bookings: b.bookings })
      setError(s.error ?? b.error)
    })
    return () => {
      alive = false
    }
  }, [today, tick])

  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1)
      // праздники, кабинеты и часы могли поменять — раз в 10 минут
      if (new Date().getMinutes() % 10 === 0) void reloadDir()
    }, RELOAD_MS)
    return () => clearInterval(id)
  }, [reloadDir])

  useWakeLock()

  const nowMin = now.getHours() * 60 + now.getMinutes()
  const holiday = dir?.holidays.get(today)

  return (
    <div className="min-h-dvh bg-slate-50 px-4 py-5 text-slate-900 sm:px-8 sm:py-8 dark:bg-slate-950 dark:text-slate-100">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
            VoiceStage · кабинеты сегодня
          </p>
          <h1 className="text-2xl font-semibold first-letter:uppercase sm:text-3xl">{formatDayLong(today)}</h1>
          {holiday && <p className="mt-1 text-lg font-medium text-rose-600 dark:text-rose-400">{holiday}</p>}
        </div>
        <div className="flex items-end gap-4">
          <p className="text-5xl font-semibold tabular-nums sm:text-6xl">{fromMinutes(nowMin)}</p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-500 ring-1 ring-slate-200 transition hover:bg-white dark:ring-slate-700 dark:hover:bg-slate-900"
          >
            Выйти
          </button>
        </div>
      </header>

      {error && <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}

      {!dir || !data ? (
        <div className="flex justify-center py-24">
          <Spinner className="size-8" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {dir.rooms
            .filter((r) => r.is_active)
            .map((r) => (
              <RoomCard
                key={r.id}
                name={r.name}
                items={itemsOf(r.id, data.sessions, data.bookings)}
                nowMin={nowMin}
                dir={dir}
                onConfirm={async (id) => {
                  const err = await confirmBooking(id)
                  if (err) setError(err)
                  setTick((t) => t + 1)
                }}
              />
            ))}
        </div>
      )}

      <p className="mt-6 text-center text-sm text-slate-400">
        Обновляется само каждую минуту · часы работы {dir ? `${hhmm(dir.studio.open_time)}–${hhmm(dir.studio.close_time)}` : ''}
      </p>
    </div>
  )
}

function itemsOf(roomId: string, sessions: Session[], bookings: RoomBooking[]): Item[] {
  const items: Item[] = []
  for (const s of sessions) {
    if (s.room_id !== roomId || s.status === 'cancelled') continue
    const start = toMinutes(s.start_time)
    items.push({ kind: 'session', start, end: start + s.duration_min, session: s })
  }
  for (const b of bookings) {
    if (b.room_id !== roomId || !isLiveBooking(b)) continue
    const start = toMinutes(b.start_time)
    items.push({ kind: 'booking', start, end: start + b.duration_min, booking: b })
  }
  return items.sort((a, b) => a.start - b.start)
}

function RoomCard({
  name,
  items,
  nowMin,
  dir,
  onConfirm,
}: {
  name: string
  items: Item[]
  nowMin: number
  dir: Directory
  onConfirm: (bookingId: string) => Promise<void>
}) {
  const current = items.filter((i) => i.start <= nowMin && nowMin < i.end)
  const upcoming = items.filter((i) => i.start > nowMin).slice(0, 3)
  const busy = current.length > 0
  const freeUntil = upcoming[0]?.start

  return (
    <section
      className={`rounded-3xl bg-white p-5 shadow-sm ring-1 dark:bg-slate-900 ${
        busy ? 'ring-rose-200 dark:ring-rose-900' : 'ring-emerald-200 dark:ring-emerald-900'
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="truncate text-2xl font-semibold">{name}</h2>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${
            busy
              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
          }`}
        >
          {busy ? 'занят' : 'свободен'}
        </span>
      </div>

      {busy ? (
        <div className="space-y-3">
          {current.map((i) => (
            <Line key={key(i)} item={i} dir={dir} big onConfirm={onConfirm} />
          ))}
        </div>
      ) : (
        <p className="text-lg text-emerald-700 dark:text-emerald-400">
          {freeUntil !== undefined ? `Свободен до ${fromMinutes(freeUntil)}` : 'Свободен до конца дня'}
        </p>
      )}

      {upcoming.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Дальше</p>
          <div className="space-y-2">
            {upcoming.map((i) => (
              <Line key={key(i)} item={i} dir={dir} onConfirm={onConfirm} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

const key = (i: Item) => (i.kind === 'session' ? i.session.id : `b:${i.booking.id}`)

function Line({
  item,
  dir,
  big = false,
  onConfirm,
}: {
  item: Item
  dir: Directory
  big?: boolean
  onConfirm: (bookingId: string) => Promise<void>
}) {
  const time = big ? `до ${fromMinutes(item.end)}` : `${fromMinutes(item.start)}–${fromMinutes(item.end)}`
  if (item.kind === 'session') {
    const teacher = dir.profileById.get(item.session.teacher_id)?.full_name
    return (
      <div className="flex items-baseline gap-3">
        <span className={`shrink-0 tabular-nums text-slate-500 dark:text-slate-400 ${big ? 'text-lg' : ''}`}>{time}</span>
        <span className="min-w-0">
          <span className={`block truncate font-semibold ${big ? 'text-xl' : ''}`}>{boardTitle(item.session, dir)}</span>
          {teacher && <span className="block truncate text-slate-500 dark:text-slate-400">{teacher}</span>}
        </span>
      </div>
    )
  }
  const b = item.booking
  const state = bookingState(b)
  const author = b.created_by ? dir.profileById.get(b.created_by)?.full_name : null
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-3">
        <span className={`shrink-0 tabular-nums text-slate-500 dark:text-slate-400 ${big ? 'text-lg' : ''}`}>{time}</span>
        <span className="min-w-0">
          <span className={`block truncate font-semibold ${big ? 'text-xl' : ''}`}>Бронь: {b.title}</span>
          {author && <span className="block truncate text-slate-500 dark:text-slate-400">{author}</span>}
        </span>
      </div>
      {state === 'confirm_now' && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-3 py-2 dark:bg-amber-950/40">
          <span className="text-sm font-medium text-amber-900 dark:text-amber-100">
            Подтвердите до {confirmDeadline(b)}, иначе бронь снимется
          </span>
          <button
            type="button"
            onClick={() => void onConfirm(b.id)}
            className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-600"
          >
            Я здесь
          </button>
        </div>
      )}
    </div>
  )
}

/** Название занятия для общего экрана: группа или «Алиса М.», без полных фамилий. */
function boardTitle(s: Session, dir: Directory): string {
  const short = (id: string) => {
    const st = dir.studentById.get(id)
    if (!st) return null
    return st.last_name ? `${st.first_name} ${st.last_name[0]}.` : st.first_name
  }
  const group = s.group_id ? dir.groupById.get(s.group_id)?.name : null
  const names = s.student_ids.map(short).filter((x): x is string => !!x)
  if (group) return names.length > 0 ? `${group} + ${names.length}` : group
  if (names.length === 0) {
    return groupMemberIds(s.group_id, dir).length > 0 ? 'Группа' : 'Занятие'
  }
  if (names.length <= 2) return names.join(', ')
  return `${names[0]} и ещё ${names.length - 1}`
}

/** Не давать экрану гаснуть, пока табло открыто (где браузер это умеет). */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request('screen')) ?? null
      } catch {
        lock = null
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request()
    }
    void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [])
}
