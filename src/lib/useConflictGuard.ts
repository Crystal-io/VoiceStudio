import { useState } from 'react'
import type { Directory } from '@/lib/directory'
import { findConflicts, type Conflict, type ConflictQuery } from '@/lib/schedule'

/**
 * Проверка пересечений перед сохранением занятия.
 * Первое «Сохранить» ищет пересечения; если нашлись — показываем их, и
 * повторное «Сохранить» (при тех же полях) уже сохраняет «всё равно».
 * Стоит поменять время, кабинет или даты — проверка начинается заново.
 */
export function useConflictGuard(dir: Directory | null, query: ConflictQuery | null) {
  const [checked, setChecked] = useState<{ sig: string; items: Conflict[] } | null>(null)
  const sig = query ? JSON.stringify(query) : ''
  const conflicts = checked && checked.sig === sig ? checked.items : null

  /** ok = можно сохранять. */
  async function check(): Promise<{ ok: boolean; error: string | null }> {
    if (!query || !dir) return { ok: false, error: null }
    if (conflicts && conflicts.length > 0) return { ok: true, error: null }
    const res = await findConflicts(query, dir)
    if (res.error) return { ok: false, error: res.error }
    setChecked({ sig, items: res.conflicts })
    return { ok: res.conflicts.length === 0, error: null }
  }

  return {
    /** найденные пересечения для текущих полей (null — ещё не проверяли) */
    conflicts: conflicts && conflicts.length > 0 ? conflicts : null,
    check,
  }
}
