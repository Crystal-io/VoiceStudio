import { supabase } from '@/lib/supabase'
import type { Directory } from '@/lib/directory'
import type { GroupMember } from '@/lib/types'

/** Группы, в которых числится ученик. */
export function groupIdsOf(studentId: string, dir: Directory): string[] {
  return [...dir.membersByGroup].filter(([, ids]) => ids.includes(studentId)).map(([id]) => id)
}

/** Изменить состав: добавить недостающие связи и убрать лишние. */
export async function syncMembers({
  studioId,
  pairs,
  added,
  removed,
}: {
  studioId: string
  /** как превратить id из added/removed в пару (группа, ученик) */
  pairs: (id: string) => GroupMember
  added: string[]
  removed: string[]
}): Promise<string | null> {
  if (added.length > 0) {
    const { error } = await supabase
      .from('group_members')
      .insert(added.map((id) => ({ ...pairs(id), studio_id: studioId })))
    if (error) return error.message
  }
  for (const id of removed) {
    const { group_id, student_id } = pairs(id)
    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', group_id)
      .eq('student_id', student_id)
    if (error) return error.message
  }
  return null
}

export function diff(initial: Set<string>, selected: Set<string>) {
  return {
    added: [...selected].filter((id) => !initial.has(id)),
    removed: [...initial].filter((id) => !selected.has(id)),
  }
}

export function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}
