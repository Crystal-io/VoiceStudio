// Общие типы данных, отражающие таблицы в БД (см. supabase/schema.sql).

export type Role = 'teacher' | 'director'

export type Profile = {
  id: string
  studio_id: string
  full_name: string
  role: Role
  color: string | null
  is_active: boolean
  created_at: string
}

export type Invitation = {
  id: string
  studio_id: string
  email: string
  full_name: string
  role: Role
  created_at: string
}

export type Room = {
  id: string
  studio_id: string
  name: string
  is_active: boolean
  created_at: string
}

/** Карточка ученика. full_name база собирает сама из имени и фамилии. */
export type Student = {
  id: string
  studio_id: string
  first_name: string
  last_name: string
  full_name: string
  birth_date: string | null
  main_teacher_id: string | null
  /** ФИО родителя */
  parent_name: string | null
  /** телефон родителя (WhatsApp) */
  parent_phone: string | null
  /** файл в хранилище student-photos */
  photo_path: string | null
  /** в студии с */
  joined_on: string
  notes: string | null
  is_active: boolean
  /** карточка создана */
  created_at: string
}

export type Group = {
  id: string
  studio_id: string
  name: string
  is_active: boolean
  created_at: string
}

export type GroupMember = {
  group_id: string
  student_id: string
}

export type SessionStatus = 'scheduled' | 'done' | 'cancelled'

/**
 * Шаблон повторяющегося занятия: «каждый вторник 15:00».
 * Состав: группа (необязательно) и/или отдельные ученики.
 */
export type LessonSeries = {
  id: string
  studio_id: string
  teacher_id: string
  room_id: string | null
  group_id: string | null
  /** ученики серии, кроме группы */
  student_ids: string[]
  weekday: number
  start_time: string
  duration_min: number
  start_date: string
  end_date: string | null
  is_active: boolean
  created_at: string
}

/**
 * Конкретное занятие в календаре (разовое или из серии). Состав — нынешние
 * ученики группы + student_ids + все, у кого уже есть отметка.
 */
export type Session = {
  id: string
  studio_id: string
  series_id: string | null
  teacher_id: string
  room_id: string | null
  group_id: string | null
  /** ученики занятия, кроме группы */
  student_ids: string[]
  date: string
  /** исходная дата вхождения серии; отличается от date, если занятие перенесли */
  occurrence_date: string | null
  start_time: string
  duration_min: number
  status: SessionStatus
  note: string | null
  created_at: string
}

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused'

/** Ребёнок × занятие: посещение (может быть ещё не отмечено) и оплата. */
export type Attendance = {
  session_id: string
  student_id: string
  status: AttendanceStatus | null
  is_paid: boolean
}
