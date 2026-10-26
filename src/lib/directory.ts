import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { studentColumns } from '@/lib/students'
import type { Group, GroupMember, Holiday, Profile, Room, Student, Studio } from '@/lib/types'

/** Если студию прочитать не удалось — часы по умолчанию (как в базе). */
const DEFAULT_STUDIO: Studio = {
  id: '',
  name: '',
  open_time: '10:00:00',
  close_time: '21:00:00',
  work_days: [0, 1, 2, 3, 4, 5],
}

/**
 * Справочники студии одним пакетом: часы работы, праздники, педагоги,
 * кабинеты, ученики, группы и их составы. Их немного (десятки строк),
 * поэтому грузим целиком и сопоставляем по id на клиенте.
 */
export type Directory = {
  studio: Studio
  /** дата «ГГГГ-ММ-ДД» → название праздника */
  holidays: Map<string, string>
  profiles: Profile[]
  rooms: Room[]
  students: Student[]
  groups: Group[]
  profileById: Map<string, Profile>
  roomById: Map<string, Room>
  studentById: Map<string, Student>
  groupById: Map<string, Group>
  /** id группы → id учеников */
  membersByGroup: Map<string, string[]>
}

export async function loadDirectory(): Promise<{ dir: Directory; error: string | null }> {
  const [studio, holidays, profiles, rooms, students, groups, members] = await Promise.all([
    supabase.from('studios').select('id, name, open_time, close_time, work_days').maybeSingle(),
    supabase.from('holidays').select('id, studio_id, date, name'),
    supabase
      .from('profiles')
      .select('id, studio_id, full_name, role, color, is_active, created_at')
      .order('full_name'),
    supabase.from('rooms').select('id, studio_id, name, is_active, created_at').order('name'),
    supabase.from('students').select(studentColumns).order('full_name'),
    supabase.from('groups').select('id, studio_id, name, is_active, created_at').order('name'),
    supabase.from('group_members').select('group_id, student_id'),
  ])
  const error =
    studio.error ??
    holidays.error ??
    profiles.error ??
    rooms.error ??
    students.error ??
    groups.error ??
    members.error

  const membersByGroup = new Map<string, string[]>()
  for (const m of (members.data as GroupMember[]) ?? []) {
    const list = membersByGroup.get(m.group_id) ?? []
    list.push(m.student_id)
    membersByGroup.set(m.group_id, list)
  }

  const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]))
  const p = (profiles.data as Profile[]) ?? []
  const r = (rooms.data as Room[]) ?? []
  const s = (students.data as Student[]) ?? []
  const g = (groups.data as Group[]) ?? []

  return {
    dir: {
      studio: (studio.data as Studio | null) ?? DEFAULT_STUDIO,
      holidays: new Map(((holidays.data as Holiday[]) ?? []).map((h) => [h.date, h.name])),
      profiles: p,
      rooms: r,
      students: s,
      groups: g,
      profileById: byId(p),
      roomById: byId(r),
      studentById: byId(s),
      groupById: byId(g),
      membersByGroup,
    },
    error: error ? error.message : null,
  }
}

export function useDirectory() {
  const [dir, setDir] = useState<Directory | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const res = await loadDirectory()
    setDir(res.dir)
    setError(res.error)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { dir, error, reload }
}
