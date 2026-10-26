import { supabase } from '@/lib/supabase'
import type { Directory } from '@/lib/directory'
import type { LessonSeries, Profile, Session } from '@/lib/types'
import { addDays, datesOnWeekdays, formatDayShort, timeRange, todayISO, toMinutes, WEEKDAYS_SHORT, weekdayOf } from '@/lib/dates'
import { isLiveBooking, loadBookings } from '@/lib/bookings'

/** На сколько дней вперёд заранее создаём занятия из серий. */
export const HORIZON_DAYS = 16 * 7

// Ученики занятия/серии (кроме группы) приходят вложенным списком —
// toSession/toSeries разворачивают его в student_ids.
export const sessionColumns =
  'id, studio_id, series_id, teacher_id, room_id, group_id, date, occurrence_date, start_time, duration_min, status, note, created_at, session_students(student_id)'

export const seriesColumns =
  'id, studio_id, teacher_id, room_id, group_id, weekday, start_time, duration_min, start_date, end_date, is_active, created_at, series_students(student_id)'

type RosterRows = { student_id: string }[] | null | undefined

export function toSession(raw: unknown): Session {
  const { session_students, ...rest } = raw as Omit<Session, 'student_ids'> & {
    session_students?: RosterRows
  }
  return { ...rest, student_ids: (session_students ?? []).map((r) => r.student_id) }
}

export function toSeries(raw: unknown): LessonSeries {
  const { series_students, ...rest } = raw as Omit<LessonSeries, 'student_ids'> & {
    series_students?: RosterRows
  }
  return { ...rest, student_ids: (series_students ?? []).map((r) => r.student_id) }
}

const toSessions = (data: unknown): Session[] => ((data as unknown[]) ?? []).map(toSession)

// До какой даты занятия уже досозданы в этой вкладке — чтобы не дёргать
// базу при каждом листании недели.
let ensuredUntil: string | null = null

/** Досоздать занятия всех серий студии до даты until (включительно). */
export async function ensureSessions(until: string): Promise<string | null> {
  const target = until > addDays(todayISO(), HORIZON_DAYS) ? until : addDays(todayISO(), HORIZON_DAYS)
  if (ensuredUntil && ensuredUntil >= target) return null
  const { error } = await supabase.rpc('ensure_sessions', { p_until: target })
  if (error) return error.message
  ensuredUntil = target
  return null
}

/** Горизонт генерации для серии, которая начинается с from. */
export function horizonFrom(from: string): string {
  const today = todayISO()
  return addDays(from > today ? from : today, HORIZON_DAYS)
}

export async function loadSessions(
  from: string,
  to: string,
  teacherId?: string,
): Promise<{ sessions: Session[]; error: string | null }> {
  let q = supabase
    .from('sessions')
    .select(sessionColumns)
    .gte('date', from)
    .lte('date', to)
    .order('date')
    .order('start_time')
  if (teacherId) q = q.eq('teacher_id', teacherId)
  const { data, error } = await q
  return { sessions: toSessions(data), error: error ? error.message : null }
}

/** Разбить список на порции — для длинных фильтров `in (...)` в адресе запроса. */
export function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Занятия по списку id (порциями). */
export async function loadSessionsByIds(
  ids: string[],
): Promise<{ sessions: Session[]; error: string | null }> {
  const results = await Promise.all(
    chunks(ids, 100).map((part) => supabase.from('sessions').select(sessionColumns).in('id', part)),
  )
  const sessions = results.flatMap((r) => toSessions(r.data))
  const error = results.find((r) => r.error)?.error
  return { sessions, error: error ? error.message : null }
}

type Roster = { group_id: string | null; student_ids: string[] }

/**
 * Кого учим: «Хор», «Хор + 2», «Маша Петрова», «Маша и Петя»,
 * «Маша, Петя и ещё 3».
 */
export function lessonTitle(s: Roster, dir: Directory): string {
  const group = s.group_id ? (dir.groupById.get(s.group_id)?.name ?? 'Группа') : null
  const extra = s.student_ids.length
  if (group) return extra > 0 ? `${group} + ${extra}` : group
  const names = s.student_ids
    .map((id) => dir.studentById.get(id))
    .filter((x) => !!x)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'))
  if (names.length === 0) return 'Ученик'
  if (names.length === 1) return names[0].full_name
  const first = names.map((x) => x.first_name)
  if (names.length === 2) return `${first[0]} и ${first[1]}`
  return `${first[0]}, ${first[1]} и ещё ${names.length - 2}`
}

/** Групповое: есть группа или учеников больше одного. */
export function isGroupLesson(s: Roster): boolean {
  return !!s.group_id || s.student_ids.length > 1
}

const palette = ['#4f46e5', '#0891b2', '#db2777', '#ea580c', '#16a34a', '#9333ea', '#ca8a04', '#dc2626']

/** Цвет педагога в календаре: заданный в профиле или постоянный по id. */
export function teacherColor(p: Pick<Profile, 'id' | 'color'> | null | undefined): string {
  if (!p) return '#94a3b8'
  if (p.color) return p.color
  let h = 0
  for (const ch of p.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return palette[h % palette.length]
}

// ---------------------------------------------------------------------------
// Пересечения в расписании
// ---------------------------------------------------------------------------

/** Даты, на которые придётся занятие: одна дата или все вхождения серии. */
export function candidateDates(from: string, until: string | null, weekdays: number[] | null): string[] {
  if (!weekdays) return [from]
  const cap = addDays(from, HORIZON_DAYS)
  const to = until && until < cap ? until : cap
  return datesOnWeekdays(from, to, weekdays)
}

export type ConflictQuery = {
  teacherId: string
  roomId: string | null
  dates: string[]
  start: string
  duration: number
  ignoreSeriesId?: string | null
  ignoreSessionId?: string | null
  /** правим бронь — её саму не считаем */
  ignoreBookingId?: string | null
}

/** «Педагог», который ни с кем не совпадёт — для проверки только кабинета (брони). */
export const NO_TEACHER = '00000000-0000-0000-0000-000000000000'

export type Conflict = {
  key: string
  /** что совпало: педагог, кабинет или оба */
  clash: 'teacher' | 'room' | 'both'
  title: string
  teacher: string
  room: string | null
  /** «вт 15:00–15:45» для серии или «6 окт., 15:00–15:45» для разового */
  when: string
  recurring: boolean
  dates: string[]
}

export async function findConflicts(
  q: ConflictQuery,
  dir: Directory,
): Promise<{ conflicts: Conflict[]; error: string | null }> {
  if (q.dates.length === 0) return { conflicts: [], error: null }
  const { data, error } = await supabase
    .rpc('schedule_conflicts', {
      p_teacher: q.teacherId,
      p_room: q.roomId,
      p_dates: q.dates,
      p_start: q.start,
      p_duration: q.duration,
      p_ignore_series: q.ignoreSeriesId ?? null,
      p_ignore_session: q.ignoreSessionId ?? null,
    })
    .select(sessionColumns)
  if (error) return { conflicts: [], error: error.message }

  // Занятия одной серии сворачиваем в одну строку: «вт 15:00–15:45 · 12 дат».
  const byKey = new Map<string, Conflict>()
  for (const s of toSessions(data)) {
    const key = s.series_id ?? s.id
    const sameTeacher = s.teacher_id === q.teacherId
    const sameRoom = !!q.roomId && s.room_id === q.roomId
    const clash = sameTeacher && sameRoom ? 'both' : sameTeacher ? 'teacher' : 'room'
    const existing = byKey.get(key)
    if (existing) {
      existing.dates.push(s.date)
      if (existing.clash !== clash) existing.clash = 'both'
      continue
    }
    byKey.set(key, {
      key,
      clash,
      title: lessonTitle(s, dir),
      teacher: dir.profileById.get(s.teacher_id)?.full_name ?? 'Педагог',
      room: s.room_id ? (dir.roomById.get(s.room_id)?.name ?? null) : null,
      when: s.series_id
        ? `${WEEKDAYS_SHORT[weekdayOf(s.date)].toLowerCase()} ${timeRange(s.start_time, s.duration_min)}`
        : `${formatDayShort(s.date)}, ${timeRange(s.start_time, s.duration_min)}`,
      recurring: !!s.series_id,
      dates: [s.date],
    })
  }

  // брони того же кабинета на эти даты и время (снятые не мешают)
  if (q.roomId) {
    const sorted = [...q.dates].sort()
    const res = await loadBookings(sorted[0], sorted[sorted.length - 1], q.roomId)
    if (res.error) return { conflicts: [], error: res.error }
    const dates = new Set(q.dates)
    const st = toMinutes(q.start)
    for (const b of res.bookings) {
      if (!dates.has(b.date) || b.id === q.ignoreBookingId || !isLiveBooking(b)) continue
      const bs = toMinutes(b.start_time)
      if (!(bs < st + q.duration && st < bs + b.duration_min)) continue
      byKey.set(`b:${b.id}`, {
        key: `b:${b.id}`,
        clash: 'room',
        title: `Бронь: ${b.title}`,
        teacher: (b.created_by && dir.profileById.get(b.created_by)?.full_name) || 'Бронь',
        room: dir.roomById.get(b.room_id)?.name ?? null,
        when: `${formatDayShort(b.date)}, ${timeRange(b.start_time, b.duration_min)}`,
        recurring: false,
        dates: [b.date],
      })
    }
  }
  return { conflicts: [...byKey.values()], error: null }
}
