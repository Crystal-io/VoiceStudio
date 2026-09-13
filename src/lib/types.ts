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
