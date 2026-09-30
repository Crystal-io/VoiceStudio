// Расчёты для отчётов директора: нагрузка педагогов и кабинетов,
// посещаемость учеников. Всё считается на клиенте из занятий за период —
// данных немного (сотни занятий за месяц).

import type { Directory } from '@/lib/directory'
import type { Attendance, AttendanceStatus, Profile, Room, Session, Student } from '@/lib/types'
import { came, isOver, type LessonMark } from '@/lib/attendance'
import { addDays, addMonths, endOfMonth, formatMonth, formatWeekRange, startOfMonth, startOfWeek } from '@/lib/dates'

// ---------------------------------------------------------------------------
// Период отчёта
// ---------------------------------------------------------------------------

export type PeriodKind = 'week' | 'month'

export type Period = { kind: PeriodKind; from: string; to: string; label: string }

export function periodOf(kind: PeriodKind, date: string): Period {
  if (kind === 'week') {
    const from = startOfWeek(date)
    return { kind, from, to: addDays(from, 6), label: formatWeekRange(from) }
  }
  const from = startOfMonth(date)
  return { kind, from, to: endOfMonth(from), label: formatMonth(from) }
}

export function shiftPeriod(p: Period, step: number): Period {
  return periodOf(p.kind, p.kind === 'week' ? addDays(p.from, step * 7) : addMonths(p.from, step))
}

// ---------------------------------------------------------------------------
// Нагрузка
// ---------------------------------------------------------------------------

/**
 * Состояние занятия для отчёта: проведено (есть отметки), не отмечено
 * (прошло, но отметок нет), впереди, отменено.
 */
export type LessonState = 'done' | 'unmarked' | 'planned' | 'cancelled'

export function lessonState(s: Session): LessonState {
  if (s.status === 'cancelled') return 'cancelled'
  if (s.status === 'done') return 'done'
  return isOver(s) ? 'unmarked' : 'planned'
}

/** Сводка по набору занятий. Минуты и число — без отменённых. */
export type Tally = {
  count: number
  minutes: number
  individual: number
  group: number
  /** число занятий по состоянию */
  byState: Record<LessonState, number>
  /** минуты по состоянию */
  minutesByState: Record<LessonState, number>
}

function emptyTally(): Tally {
  return {
    count: 0,
    minutes: 0,
    individual: 0,
    group: 0,
    byState: { done: 0, unmarked: 0, planned: 0, cancelled: 0 },
    minutesByState: { done: 0, unmarked: 0, planned: 0, cancelled: 0 },
  }
}

function add(t: Tally, s: Session) {
  const state = lessonState(s)
  t.byState[state] += 1
  t.minutesByState[state] += s.duration_min
  if (state === 'cancelled') return
  t.count += 1
  t.minutes += s.duration_min
  if (s.type === 'group') t.group += 1
  else t.individual += 1
}

export function tally(sessions: Session[]): Tally {
  const t = emptyTally()
  for (const s of sessions) add(t, s)
  return t
}

export type TeacherLoad = { id: string; teacher: Profile | undefined; tally: Tally }

/**
 * Нагрузка по педагогам: все активные педагоги (даже без занятий) и все,
 * у кого за период были занятия. Сначала самые загруженные.
 */
export function loadByTeacher(sessions: Session[], dir: Directory): TeacherLoad[] {
  const map = new Map<string, TeacherLoad>()
  for (const p of dir.profiles) {
    if (p.is_active && p.role === 'teacher') map.set(p.id, { id: p.id, teacher: p, tally: emptyTally() })
  }
  for (const s of sessions) {
    let item = map.get(s.teacher_id)
    if (!item) {
      item = { id: s.teacher_id, teacher: dir.profileById.get(s.teacher_id), tally: emptyTally() }
      map.set(s.teacher_id, item)
    }
    add(item.tally, s)
  }
  return [...map.values()].sort(
    (a, b) =>
      b.tally.minutes - a.tally.minutes ||
      (a.teacher?.full_name ?? '').localeCompare(b.teacher?.full_name ?? '', 'ru'),
  )
}

/** id = null — занятия без кабинета. */
export type RoomLoad = { id: string | null; room: Room | undefined; tally: Tally }

/** Занятость кабинетов: активные кабинеты и все, где за период были занятия. */
export function loadByRoom(sessions: Session[], dir: Directory): RoomLoad[] {
  const map = new Map<string | null, RoomLoad>()
  for (const r of dir.rooms) {
    if (r.is_active) map.set(r.id, { id: r.id, room: r, tally: emptyTally() })
  }
  for (const s of sessions) {
    let item = map.get(s.room_id)
    if (!item) {
      item = { id: s.room_id, room: s.room_id ? dir.roomById.get(s.room_id) : undefined, tally: emptyTally() }
      map.set(s.room_id, item)
    }
    add(item.tally, s)
  }
  // «Без кабинета» — в конце, и только если такие занятия были
  return [...map.values()]
    .filter((r) => r.id !== null || r.tally.count > 0)
    .sort(
      (a, b) =>
        Number(a.id === null) - Number(b.id === null) ||
        b.tally.minutes - a.tally.minutes ||
        (a.room?.name ?? '').localeCompare(b.room?.name ?? '', 'ru'),
    )
}

// ---------------------------------------------------------------------------
// Посещаемость
// ---------------------------------------------------------------------------

export type StatusCounts = Record<AttendanceStatus, number>

function emptyCounts(): StatusCounts {
  return { present: 0, late: 0, absent: 0, excused: 0 }
}

export type StudentAttendance = {
  student: Student
  counts: StatusCounts
  /** отмечено занятий (с любым статусом) */
  marked: number
  /** пришёл (есть + опоздание) */
  came: number
  /** пришёл, но оплата не отмечена */
  unpaid: number
  marks: LessonMark[]
}

export type AttendanceReport = {
  counts: StatusCounts
  marked: number
  came: number
  /** прошедшие занятия без единой отметки */
  unmarkedLessons: number
  students: StudentAttendance[]
}

export function attendanceReport(
  sessions: Session[],
  bySession: Map<string, Attendance[]>,
  dir: Directory,
): AttendanceReport {
  const counts = emptyCounts()
  const byStudent = new Map<string, StudentAttendance>()
  let unmarkedLessons = 0

  for (const s of sessions) {
    const state = lessonState(s)
    if (state === 'cancelled') continue
    if (state === 'unmarked') unmarkedLessons += 1
    for (const row of bySession.get(s.id) ?? []) {
      const student = dir.studentById.get(row.student_id)
      if (!student || (!row.status && !row.is_paid)) continue
      let item = byStudent.get(student.id)
      if (!item) {
        item = { student, counts: emptyCounts(), marked: 0, came: 0, unpaid: 0, marks: [] }
        byStudent.set(student.id, item)
      }
      item.marks.push({ session: s, row })
      if (!row.status) continue
      counts[row.status] += 1
      item.counts[row.status] += 1
      item.marked += 1
      if (came(row.status)) {
        item.came += 1
        if (!row.is_paid) item.unpaid += 1
      }
    }
  }

  const marked = counts.present + counts.late + counts.absent + counts.excused
  return {
    counts,
    marked,
    came: counts.present + counts.late,
    unmarkedLessons,
    students: [...byStudent.values()]
      .filter((s) => s.marked > 0)
      .sort((a, b) => a.student.full_name.localeCompare(b.student.full_name, 'ru')),
  }
}

/** Упорядочить занятия по дате и времени. */
export function byDateTime(a: { session: Session }, b: { session: Session }): number {
  return (
    a.session.date.localeCompare(b.session.date) ||
    a.session.start_time.localeCompare(b.session.start_time)
  )
}
