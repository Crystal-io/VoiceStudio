import { supabase } from '@/lib/supabase'
import type { Directory } from '@/lib/directory'
import type { Attendance, AttendanceStatus, Session, Student } from '@/lib/types'
import { toMinutes, todayISO } from '@/lib/dates'

export const attendanceColumns = 'session_id, student_id, status, is_paid'

/** Кнопки статуса — в порядке «как чаще отмечают». Подписи без рода. */
export const STATUS_OPTIONS: { value: AttendanceStatus; label: string; on: string }[] = [
  {
    value: 'present',
    label: 'Есть',
    on: 'bg-emerald-600 text-white',
  },
  {
    value: 'late',
    label: 'Опоздание',
    on: 'bg-amber-500 text-white',
  },
  {
    value: 'absent',
    label: 'Пропуск',
    on: 'bg-rose-600 text-white',
  },
  {
    value: 'excused',
    label: 'Уважит.',
    on: 'bg-sky-600 text-white',
  },
]

export const STATUS_TEXT: Record<AttendanceStatus, string> = {
  present: 'есть',
  late: 'опоздание',
  absent: 'пропуск',
  excused: 'уважительная причина',
}

/** Отметки для набора занятий: id занятия → строки посещаемости. */
export async function loadAttendance(
  sessionIds: string[],
): Promise<{ bySession: Map<string, Attendance[]>; error: string | null }> {
  const bySession = new Map<string, Attendance[]>()
  if (sessionIds.length === 0) return { bySession, error: null }
  const { data, error } = await supabase
    .from('attendance')
    .select(attendanceColumns)
    .in('session_id', sessionIds)
  for (const row of (data as Attendance[]) ?? []) {
    const list = bySession.get(row.session_id) ?? []
    list.push(row)
    bySession.set(row.session_id, list)
  }
  return { bySession, error: error ? error.message : null }
}

/**
 * Кто должен быть на занятии: ученик индивидуального занятия или нынешний
 * состав группы — плюс все, у кого на этом занятии уже есть отметка (даже
 * если с тех пор ушли из группы или в архиве).
 */
export function rosterOf(session: Session, dir: Directory, rows: Attendance[]): Student[] {
  const ids = new Set<string>()
  if (session.type === 'individual') {
    if (session.student_id) ids.add(session.student_id)
  } else {
    for (const id of dir.membersByGroup.get(session.group_id ?? '') ?? []) {
      if (dir.studentById.get(id)?.is_active) ids.add(id)
    }
  }
  for (const r of rows) ids.add(r.student_id)
  return [...ids]
    .map((id) => dir.studentById.get(id))
    .filter((s): s is Student => !!s)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'))
}

/** Занятие уже закончилось (по времени устройства). */
export function isOver(session: Session): boolean {
  const today = todayISO()
  if (session.date !== today) return session.date < today
  const now = new Date()
  return toMinutes(session.start_time) + session.duration_min <= now.getHours() * 60 + now.getMinutes()
}

/** Прошедшее, не отменённое и без единой отметки посещения. */
export function isUnmarked(session: Session): boolean {
  return session.status === 'scheduled' && isOver(session)
}

/** Короткая сводка для карточки: «Есть · оплачено», «Были 4 из 5 · оплатили 3». */
export function attendanceSummary(
  session: Session,
  dir: Directory,
  rows: Attendance[],
): { text: string; tone: 'ok' | 'warn' | 'muted' } | null {
  if (session.status === 'cancelled') return null
  const marked = rows.filter((r) => r.status)
  const paid = rows.filter((r) => r.is_paid).length

  if (session.type === 'individual') {
    const row = rows[0]
    if (!row) return null
    const parts: string[] = []
    if (row.status) parts.push(STATUS_TEXT[row.status])
    if (row.is_paid) parts.push('оплачено')
    else if (row.status) parts.push('не оплачено')
    const text = parts.join(' · ')
    return {
      text: text.charAt(0).toUpperCase() + text.slice(1),
      tone: row.is_paid ? 'ok' : 'warn',
    }
  }

  const total = rosterOf(session, dir, rows).length
  if (marked.length === 0 && paid === 0) return null
  const came = marked.filter((r) => r.status === 'present' || r.status === 'late').length
  const parts: string[] = []
  if (marked.length > 0) parts.push(`Были ${came} из ${total}`)
  parts.push(`оплатили ${paid}${marked.length === 0 ? ` из ${total}` : ''}`)
  const text = parts.join(' · ')
  return { text: text.charAt(0).toUpperCase() + text.slice(1), tone: paid >= total ? 'ok' : 'muted' }
}
