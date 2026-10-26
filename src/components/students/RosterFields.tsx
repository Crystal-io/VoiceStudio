import type { Directory } from '@/lib/directory'
import type { Student } from '@/lib/types'
import { groupMemberIds } from '@/lib/attendance'
import { plural } from '@/lib/format'
import { SelectField } from '@/components/ui'
import { StudentAvatar } from '@/components/students/StudentAvatar'
import { CloseIcon, PlusIcon } from '@/components/icons'

// Поля состава занятия: группа (необязательно) и отдельные ученики.
// Общие для «Нового занятия» и «Изменить состав».

export function GroupField({
  dir,
  value,
  onChange,
}: {
  dir: Directory
  value: string
  onChange: (id: string) => void
}) {
  const groups = dir.groups.filter((g) => g.is_active || g.id === value)
  const members = groupMemberIds(value || null, dir)
    .map((id) => dir.studentById.get(id))
    .filter((s): s is Student => !!s)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'))

  return (
    <div>
      <SelectField label="Группа" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Без группы</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </SelectField>
      {value && (
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {members.length > 0
            ? `В группе ${plural(members.length, ['ученик', 'ученика', 'учеников'])}: ${members
                .map((s) => s.first_name)
                .join(', ')}. Посещаемость отмечается по каждому.`
            : 'В группе пока никого — состав меняется в разделе «Ученики» → «Группы».'}
        </p>
      )}
    </div>
  )
}

export function StudentsField({
  dir,
  label,
  ids,
  onRemove,
  onAdd,
}: {
  dir: Directory
  label: string
  ids: string[]
  onRemove: (id: string) => void
  onAdd: () => void
}) {
  const list = ids
    .map((id) => dir.studentById.get(id))
    .filter((s): s is Student => !!s)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'))

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </span>
      {list.length > 0 && (
        <ul className="mb-2 divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-800">
          {list.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-3 py-2">
              <StudentAvatar student={s} size="sm" />
              <span className="min-w-0 flex-1 truncate">{s.full_name}</span>
              <button
                type="button"
                onClick={() => onRemove(s.id)}
                aria-label={`Убрать: ${s.full_name}`}
                className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <CloseIcon className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2.5 text-sm font-semibold text-brand-600 transition hover:bg-brand-50 dark:border-slate-700 dark:text-brand-400 dark:hover:bg-brand-950/40"
      >
        <PlusIcon className="size-4" />
        {list.length > 0 ? 'Изменить список' : 'Добавить учеников'}
      </button>
    </div>
  )
}
