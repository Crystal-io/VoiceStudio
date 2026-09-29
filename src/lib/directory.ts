import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Group, GroupMember, Profile, Room, Student } from '@/lib/types'

/**
 * Справочники студии одним пакетом: педагоги, кабинеты, ученики, группы и
 * их составы. Их немного (десятки строк), поэтому грузим целиком и
 * сопоставляем по id на клиенте.
 */
export type Directory = {
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
  const [profiles, rooms, students, groups, members] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, studio_id, full_name, role, color, is_active, created_at')
      .order('full_name'),
    supabase.from('rooms').select('id, studio_id, name, is_active, created_at').order('name'),
    supabase
      .from('students')
      .select('id, studio_id, full_name, birth_date, parent_contact, notes, is_active, created_at')
      .order('full_name'),
    supabase.from('groups').select('id, studio_id, name, is_active, created_at').order('name'),
    supabase.from('group_members').select('group_id, student_id'),
  ])
  const error =
    profiles.error ?? rooms.error ?? students.error ?? groups.error ?? members.error

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
