import { useState, type ReactNode } from 'react'
import type { Student } from '@/lib/types'
import { ageFrom, plural } from '@/lib/format'
import { toggle } from '@/lib/groups'
import { Button, SearchField } from '@/components/ui'
import { StudentAvatar } from '@/components/students/StudentAvatar'
import { CheckIcon, PlusIcon } from '@/components/icons'

/**
 * Выбор учеников из списка галочками. Ученики группы (locked) отмечены и не
 * снимаются — они приходят вместе с группой. Сверху — «мои» (основной
 * педагог — я), потом остальные.
 */
export function StudentPicker({
  students,
  initial,
  locked = new Set(),
  lockedHint = 'в группе',
  myId,
  onDone,
  onCancel,
  onCreate,
}: {
  students: Student[]
  initial: Set<string>
  locked?: Set<string>
  lockedHint?: string
  /** id педагога — его ученики идут первыми */
  myId?: string
  onDone: (selected: Set<string>) => void
  onCancel: () => void
  /** «Новая карточка» — если можно завести ученика прямо отсюда */
  onCreate?: () => void
}) {
  const [selected, setSelected] = useState(initial)
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const visible = students
    .filter((s) => !q || s.full_name.toLowerCase().includes(q))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'))
  const mine = myId ? visible.filter((s) => s.main_teacher_id === myId) : []
  const rest = myId ? visible.filter((s) => s.main_teacher_id !== myId) : visible
  const count = [...selected].filter((id) => !locked.has(id)).length

  const row = (s: Student) => {
    const isLocked = locked.has(s.id)
    const on = isLocked || selected.has(s.id)
    const age = s.birth_date ? ageFrom(s.birth_date) : null
    return (
      <li key={s.id}>
        <button
          type="button"
          disabled={isLocked}
          onClick={() => setSelected(toggle(selected, s.id))}
          aria-pressed={on}
          className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-slate-800/50"
        >
          <span
            className={`flex size-5 shrink-0 items-center justify-center rounded-md transition ${
              on
                ? isLocked
                  ? 'bg-slate-300 text-white dark:bg-slate-600'
                  : 'bg-brand-600 text-white'
                : 'ring-1 ring-slate-300 dark:ring-slate-600'
            }`}
          >
            {on && <CheckIcon className="size-4" />}
          </span>
          <StudentAvatar student={s} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{s.full_name}</span>
            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
              {isLocked ? lockedHint : age !== null ? plural(age, ['год', 'года', 'лет']) : ' '}
            </span>
          </span>
        </button>
      </li>
    )
  }

  return (
    <div className="space-y-3">
      {students.length > 6 && (
        <SearchField value={query} onChange={setQuery} placeholder="Найти ученика" />
      )}

      {students.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
          В студии пока нет учеников.
        </p>
      ) : (
        <div className="max-h-[55dvh] space-y-3 overflow-y-auto">
          {mine.length > 0 && (
            <Section title="Мои ученики">{mine.map(row)}</Section>
          )}
          {rest.length > 0 && (
            <Section title={mine.length > 0 ? 'Остальные' : null}>{rest.map(row)}</Section>
          )}
          {visible.length === 0 && (
            <p className="px-1 py-3 text-sm text-slate-500 dark:text-slate-400">Никого не нашли.</p>
          )}
        </div>
      )}

      {onCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-brand-600 transition hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/40"
        >
          <PlusIcon className="size-4" />
          Новая карточка ученика
        </button>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Назад
        </Button>
        <Button type="button" onClick={() => onDone(selected)}>
          Готово{count > 0 ? ` · ${count}` : ''}
        </Button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string | null; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      {title && (
        <h4 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h4>
      )}
      <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-800">
        {children}
      </ul>
    </section>
  )
}
