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

export type Student = {
  id: string
  studio_id: string
  full_name: string
  birth_date: string | null
  parent_contact: string | null
  notes: string | null
  is_active: boolean
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

export type LessonType = 'individual' | 'group'

export type SessionStatus = 'scheduled' | 'done' | 'cancelled'

/** Шаблон повторяющегося занятия: «каждый вторник 15:00». */
export type LessonSeries = {
  id: string
  studio_id: string
  teacher_id: string
  room_id: string | null
  type: LessonType
  student_id: string | null
  group_id: string | null
  weekday: number
  start_time: string
  duration_min: number
  start_date: string
  end_date: string | null
  is_active: boolean
  created_at: string
}

/** Конкретное занятие в календаре (разовое или из серии). */
export type Session = {
  id: string
  studio_id: string
  series_id: string | null
  teacher_id: string
  room_id: string | null
  type: LessonType
  student_id: string | null
  group_id: string | null
  date: string
  /** исходная дата вхождения серии; отличается от date, если занятие перенесли */
  occurrence_date: string | null
  start_time: string
  duration_min: number
  status: SessionStatus
  note: string | null
  created_at: string
}
