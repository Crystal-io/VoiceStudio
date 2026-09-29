import { supabase } from '@/lib/supabase'
import type { Directory } from '@/lib/directory'
import type { LessonType, Profile, Session } from '@/lib/types'
import { addDays, datesOnWeekdays, formatDayShort, timeRange, todayISO, WEEKDAYS_SHORT, weekdayOf } from '@/lib/dates'

/** На сколько дней вперёд заранее создаём занятия из серий. */
export const HORIZON_DAYS = 16 * 7

export const sessionColumns =
  'id, studio_id, series_id, teacher_id, room_id, type, student_id, group_id, date, occurrence_date, start_time, duration_min, status, note, created_at'

export const seriesColumns =
  'id, studio_id, teacher_id, room_id, type, student_id, group_id, weekday, start_time, duration_min, start_date, end_date, is_active, created_at'

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
  return { sessions: (data as Session[]) ?? [], error: error ? error.message : null }
}

/** Кого учим: имя ученика или название группы. */
export function lessonTitle(
  s: { type: LessonType; student_id: string | null; group_id: string | null },
  dir: Directory,
): string {
  if (s.type === 'group') return dir.groupById.get(s.group_id ?? '')?.name ?? 'Группа'
  return dir.studentById.get(s.student_id ?? '')?.full_name ?? 'Ученик'
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
}

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
  const { data, error } = await supabase.rpc('schedule_conflicts', {
    p_teacher: q.teacherId,
    p_room: q.roomId,
    p_dates: q.dates,
    p_start: q.start,
    p_duration: q.duration,
    p_ignore_series: q.ignoreSeriesId ?? null,
    p_ignore_session: q.ignoreSessionId ?? null,
  })
  if (error) return { conflicts: [], error: error.message }

  // Занятия одной серии сворачиваем в одну строку: «вт 15:00–15:45 · 12 дат».
  const byKey = new Map<string, Conflict>()
  for (const s of (data as Session[]) ?? []) {
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
  return { conflicts: [...byKey.values()], error: null }
}
