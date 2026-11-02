import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { studentColumns } from '@/lib/students'
import type {
  Group,
  GroupMember,
  Holiday,
  Profile,
  Room,
  Student,
  Studio,
  Tariff,
  TariffOverride,
  TariffRate,
} from '@/lib/types'

/** Если студию прочитать не удалось — часы по умолчанию (как в базе). */
const DEFAULT_STUDIO: Studio = {
  id: '',
  name: '',
  open_time: '10:00:00',
  close_time: '21:00:00',
  work_days: [0, 1, 2, 3, 4, 5],
  currency: 'EUR',
  timezone: null,
}

/**
 * Справочники студии одним пакетом: часы работы, праздники, педагоги,
 * кабинеты, ученики, группы и их составы, тарифы со ставками (особые
 * условия — директору все, педагогу свои). Их немного (десятки строк),
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
  tariffs: Tariff[]
  tariffById: Map<string, Tariff>
  /** id тарифа → ставки по дате (от ранней к поздней) */
  ratesByTariff: Map<string, TariffRate[]>
  /** особые условия по дате (от ранней к поздней) */
  overrides: TariffOverride[]
}

export async function loadDirectory(): Promise<{ dir: Directory; error: string | null }> {
  const [studio, holidays, profiles, rooms, students, groups, members, tariffs, rates, overrides] =
    await Promise.all([
    supabase.from('studios').select('id, name, open_time, close_time, work_days, currency, timezone').maybeSingle(),
    supabase.from('holidays').select('id, studio_id, date, name'),
    supabase
      .from('profiles')
      .select('id, studio_id, full_name, role, color, is_active, created_at')
      .order('full_name'),
    supabase.from('rooms').select('id, studio_id, name, is_active, created_at').order('name'),
    supabase.from('students').select(studentColumns).order('full_name'),
    supabase.from('groups').select('id, studio_id, name, is_active, created_at').order('name'),
    supabase.from('group_members').select('group_id, student_id'),
    supabase
      .from('tariffs')
      .select('id, studio_id, kind, duration_min, name, is_active, created_at')
      .order('kind')
      .order('duration_min'),
    supabase
      .from('tariff_rates')
      .select('id, tariff_id, valid_from, price, teacher_share')
      .order('valid_from'),
    supabase
      .from('tariff_overrides')
      .select('id, tariff_id, teacher_id, valid_from, price, teacher_share')
      .order('valid_from'),
  ])
  const error =
    studio.error ??
    holidays.error ??
    profiles.error ??
    rooms.error ??
    students.error ??
    groups.error ??
    members.error ??
    tariffs.error ??
    rates.error ??
    overrides.error

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
  const t = (tariffs.data as Tariff[]) ?? []
  const ratesByTariff = new Map<string, TariffRate[]>()
  for (const rate of (rates.data as TariffRate[]) ?? []) {
    const list = ratesByTariff.get(rate.tariff_id) ?? []
    list.push(rate)
    ratesByTariff.set(rate.tariff_id, list)
  }

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
      tariffs: t,
      tariffById: byId(t),
      ratesByTariff,
      overrides: (overrides.data as TariffOverride[]) ?? [],
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
