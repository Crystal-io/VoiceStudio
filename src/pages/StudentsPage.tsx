import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/lib/profile'
import { ageFrom, findPhone, initials, plural } from '@/lib/format'
import type { Group, GroupMember, Student } from '@/lib/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Modal,
  SearchField,
  Segmented,
  Spinner,
  TextArea,
} from '@/components/ui'
import {
  ArchiveIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MusicIcon,
  PhoneIcon,
  PlusIcon,
  UsersIcon,
} from '@/components/icons'

type Tab = 'students' | 'groups'

type Directory = {
  students: Student[]
  groups: Group[]
  members: GroupMember[]
}

const studentColumns =
  'id, studio_id, full_name, birth_date, parent_contact, notes, is_active, created_at'

export function StudentsPage() {
  const { profile } = useProfile()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'groups' ? 'groups' : 'students'

  const [data, setData] = useState<Directory | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [studentForm, setStudentForm] = useState<Student | 'new' | null>(null)
  const [groupForm, setGroupForm] = useState<Group | 'new' | null>(null)

  async function load() {
    const [studentsRes, groupsRes, membersRes] = await Promise.all([
      supabase.from('students').select(studentColumns).order('full_name'),
      supabase
        .from('groups')
        .select('id, studio_id, name, is_active, created_at')
        .order('name'),
      supabase.from('group_members').select('group_id, student_id'),
    ])
    const error = studentsRes.error ?? groupsRes.error ?? membersRes.error
    setLoadError(error ? error.message : null)
    setData({
      students: (studentsRes.data as Student[]) ?? [],
      groups: (groupsRes.data as Group[]) ?? [],
      members: (membersRes.data as GroupMember[]) ?? [],
    })
  }

  useEffect(() => {
    void load()
  }, [])

  // Связи «группа → ученики» и «ученик → группы» для быстрых подписей.
  const index = useMemo(() => {
    const byGroup = new Map<string, Set<string>>()
    const byStudent = new Map<string, Set<string>>()
    for (const m of data?.members ?? []) {
      if (!byGroup.has(m.group_id)) byGroup.set(m.group_id, new Set())
      if (!byStudent.has(m.student_id)) byStudent.set(m.student_id, new Set())
      byGroup.get(m.group_id)!.add(m.student_id)
      byStudent.get(m.student_id)!.add(m.group_id)
    }
    return { byGroup, byStudent }
  }, [data])

  function closeForms() {
    setStudentForm(null)
    setGroupForm(null)
  }

  function saved() {
    closeForms()
    void load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Ученики</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {tab === 'students'
              ? 'Дети, которые занимаются в студии.'
              : 'Составы для групповых занятий.'}
          </p>
        </div>
        <Button
          onClick={() =>
            tab === 'students' ? setStudentForm('new') : setGroupForm('new')
          }
          className="shrink-0"
        >
          <PlusIcon className="size-5" />
          Добавить
        </Button>
      </div>

      <Segmented<Tab>
        value={tab}
        onChange={(t) =>
          setParams(t === 'groups' ? { tab: 'groups' } : {}, { replace: true })
        }
        options={[
          { value: 'students', label: 'Ученики' },
          { value: 'groups', label: 'Группы' },
        ]}
      />

      {loadError && <ErrorNote text={loadError} />}

      {!data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : tab === 'students' ? (
        <StudentsList
          students={data.students}
          groups={data.groups}
          groupsOf={(id) => index.byStudent.get(id)}
          onOpen={setStudentForm}
        />
      ) : (
        <GroupsList
          groups={data.groups}
          students={data.students}
          membersOf={(id) => index.byGroup.get(id)}
          onOpen={setGroupForm}
        />
      )}

      {studentForm && data && profile && (
        <StudentModal
          studioId={profile.studio_id}
          student={studentForm === 'new' ? null : studentForm}
          groups={data.groups}
          initialGroupIds={
            studentForm === 'new'
              ? new Set()
              : (index.byStudent.get(studentForm.id) ?? new Set())
          }
          onClose={closeForms}
          onDone={saved}
        />
      )}

      {groupForm && data && profile && (
        <GroupModal
          studioId={profile.studio_id}
          group={groupForm === 'new' ? null : groupForm}
          students={data.students}
          initialMemberIds={
            groupForm === 'new'
              ? new Set()
              : (index.byGroup.get(groupForm.id) ?? new Set())
          }
          onClose={closeForms}
          onDone={saved}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Вкладка «Ученики»
// ---------------------------------------------------------------------------

function StudentsList({
  students,
  groups,
  groupsOf,
  onOpen,
}: {
  students: Student[]
  groups: Group[]
  groupsOf: (studentId: string) => Set<string> | undefined
  onOpen: (s: Student) => void
}) {
  const [query, setQuery] = useState('')

  const groupName = useMemo(
    () => new Map(groups.map((g) => [g.id, g.name])),
    [groups],
  )

  const q = query.trim().toLowerCase()
  const matches = (s: Student) =>
    !q ||
    s.full_name.toLowerCase().includes(q) ||
    (s.parent_contact ?? '').toLowerCase().includes(q)

  const active = students.filter((s) => s.is_active && matches(s))
  const archived = students.filter((s) => !s.is_active && matches(s))

  if (students.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<MusicIcon className="size-6" />}
          title="Пока нет учеников"
          hint="Добавьте детей — потом их можно будет записывать на занятия и собирать в группы."
        />
      </Card>
    )
  }

  function subtitle(s: Student): string {
    const age = s.birth_date ? ageFrom(s.birth_date) : null
    const names = [...(groupsOf(s.id) ?? [])]
      .map((id) => groupName.get(id))
      .filter(Boolean)
      .join(', ')
    const parts = [age !== null ? plural(age, ['год', 'года', 'лет']) : null, names]
      .filter(Boolean)
      .join(' · ')
    return parts || s.parent_contact || 'Индивидуально'
  }

  const row = (s: Student) => (
    <PersonRow
      key={s.id}
      title={s.full_name}
      subtitle={subtitle(s)}
      avatar={initials(s.full_name)}
      muted={!s.is_active}
      onClick={() => onOpen(s)}
    />
  )

  return (
    <div className="space-y-3">
      {students.length > 6 && (
        <SearchField value={query} onChange={setQuery} placeholder="Имя или контакт" />
      )}

      {active.length > 0 ? (
        <Card>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {active.map(row)}
          </ul>
        </Card>
      ) : (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {q ? 'Никого не нашли.' : 'Все ученики в архиве.'}
        </p>
      )}

      <ArchiveSection count={archived.length} forceOpen={q !== ''}>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {archived.map(row)}
        </ul>
      </ArchiveSection>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Вкладка «Группы»
// ---------------------------------------------------------------------------

function GroupsList({
  groups,
  students,
  membersOf,
  onOpen,
}: {
  groups: Group[]
  students: Student[]
  membersOf: (groupId: string) => Set<string> | undefined
  onOpen: (g: Group) => void
}) {
  const studentById = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students],
  )

  if (groups.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<UsersIcon className="size-6" />}
          title="Пока нет групп"
          hint="Создайте группу и отметьте, кто в неё входит — на групповое занятие запишется весь состав."
        />
      </Card>
    )
  }

  function subtitle(g: Group): string {
    const members = [...(membersOf(g.id) ?? [])]
      .map((id) => studentById.get(id))
      .filter((s): s is Student => !!s && s.is_active)
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'))
    if (members.length === 0) return 'Пока никого'
    const names = members.map((s) => s.full_name.split(/\s+/)[0]).join(', ')
    return `${plural(members.length, ['ученик', 'ученика', 'учеников'])} · ${names}`
  }

  const row = (g: Group) => (
    <PersonRow
      key={g.id}
      title={g.name}
      subtitle={subtitle(g)}
      avatar={<UsersIcon className="size-5" />}
      muted={!g.is_active}
      onClick={() => onOpen(g)}
    />
  )

  const active = groups.filter((g) => g.is_active)
  const archived = groups.filter((g) => !g.is_active)

  return (
    <div className="space-y-3">
      {active.length > 0 ? (
        <Card>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {active.map(row)}
          </ul>
        </Card>
      ) : (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Все группы в архиве.
        </p>
      )}

      <ArchiveSection count={archived.length}>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {archived.map(row)}
        </ul>
      </ArchiveSection>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Общие кусочки списков
// ---------------------------------------------------------------------------

function PersonRow({
  title,
  subtitle,
  avatar,
  muted,
  onClick,
}: {
  title: string
  subtitle: string
  avatar: ReactNode
  muted?: boolean
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-label={title}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
            muted
              ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
              : 'bg-brand-50 text-brand-600 dark:bg-brand-950/50 dark:text-brand-400'
          }`}
        >
          {avatar}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={`truncate font-medium ${muted ? 'text-slate-500 dark:text-slate-400' : ''}`}
          >
            {title}
          </p>
          <p className="truncate text-sm text-slate-500 dark:text-slate-400">
            {subtitle}
          </p>
        </div>
        <ChevronRightIcon className="size-5 shrink-0 text-slate-300 dark:text-slate-600" />
      </button>
    </li>
  )
}

function ArchiveSection({
  count,
  forceOpen = false,
  children,
}: {
  count: number
  forceOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  if (count === 0) return null
  const shown = open || forceOpen

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-300"
      >
        <ArchiveIcon className="size-4" />
        Архив · {count}
        <ChevronDownIcon
          className={`size-4 transition ${shown ? 'rotate-180' : ''}`}
        />
      </button>
      {shown && <Card>{children}</Card>}
    </section>
  )
}

/** Изменить состав: добавить недостающие связи и убрать лишние. */
async function syncMembers({
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

function diff(initial: Set<string>, selected: Set<string>) {
  return {
    added: [...selected].filter((id) => !initial.has(id)),
    removed: [...initial].filter((id) => !selected.has(id)),
  }
}

function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

// ---------------------------------------------------------------------------
// Карточка ученика
// ---------------------------------------------------------------------------

function StudentModal({
  studioId,
  student,
  groups,
  initialGroupIds,
  onClose,
  onDone,
}: {
  studioId: string
  student: Student | null
  groups: Group[]
  initialGroupIds: Set<string>
  onClose: () => void
  onDone: () => void
}) {
  const [fullName, setFullName] = useState(student?.full_name ?? '')
  const [birthDate, setBirthDate] = useState(student?.birth_date ?? '')
  const [contact, setContact] = useState(student?.parent_contact ?? '')
  const [notes, setNotes] = useState(student?.notes ?? '')
  const [groupIds, setGroupIds] = useState(initialGroupIds)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Показываем действующие группы и те архивные, где ученик ещё числится.
  const groupChoices = groups.filter((g) => g.is_active || initialGroupIds.has(g.id))
  const phone = findPhone(student?.parent_contact ?? null)
  const age = birthDate ? ageFrom(birthDate) : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const fields = {
      full_name: fullName.trim(),
      birth_date: birthDate || null,
      parent_contact: contact.trim() || null,
      notes: notes.trim() || null,
    }

    let id = student?.id
    if (student) {
      const { error } = await supabase
        .from('students')
        .update(fields)
        .eq('id', student.id)
      if (error) return fail(error.message)
    } else {
      const { data, error } = await supabase
        .from('students')
        .insert({ ...fields, studio_id: studioId })
        .select('id')
        .single()
      if (error) return fail(error.message)
      id = data.id as string
    }

    const studentId = id!
    const syncError = await syncMembers({
      studioId,
      pairs: (groupId) => ({ group_id: groupId, student_id: studentId }),
      ...diff(initialGroupIds, groupIds),
    })
    if (syncError) return fail(syncError)
    onDone()
  }

  async function setArchived(archived: boolean) {
    if (!student) return
    setError(null)
    setBusy(true)
    const { error } = await supabase
      .from('students')
      .update({ is_active: !archived })
      .eq('id', student.id)
    if (error) return fail(error.message)
    onDone()
  }

  function fail(message: string) {
    setBusy(false)
    setError(message)
  }

  return (
    <Modal title={student ? 'Карточка ученика' : 'Новый ученик'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {student && !student.is_active && (
          <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Ученик в архиве — его не предлагают при записи на занятия.
          </div>
        )}

        <Field
          label="Имя и фамилия"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Маша Петрова"
          required
          autoFocus={!student}
        />
        <Field
          label="Дата рождения"
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          hint={age !== null ? plural(age, ['год', 'года', 'лет']) : 'Необязательно'}
        />
        <div className="space-y-1.5">
          <Field
            label="Контакт родителя"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Мама Ольга, +7 900 123-45-67"
          />
          {phone && (
            <a
              href={`tel:${phone}`}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-brand-600 transition hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/40"
            >
              <PhoneIcon className="size-4" />
              Позвонить
            </a>
          )}
        </div>
        <TextArea
          label="Заметки"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Голос, репертуар, особенности…"
        />

        {groupChoices.length > 0 && (
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Группы
            </span>
            <div className="flex flex-wrap gap-2">
              {groupChoices.map((g) => {
                const on = groupIds.has(g.id)
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGroupIds(toggle(groupIds, g.id))}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      on
                        ? 'bg-brand-600 text-white'
                        : 'text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800'
                    }`}
                  >
                    {on && <CheckIcon className="size-4" />}
                    {g.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {error && <ErrorNote text={error} />}

        <Button type="submit" disabled={busy || !fullName.trim()} className="w-full">
          {busy ? 'Сохраняем…' : student ? 'Сохранить' : 'Добавить'}
        </Button>
        {student && (
          <Button
            type="button"
            variant={student.is_active ? 'danger' : 'ghost'}
            disabled={busy}
            onClick={() => setArchived(student.is_active)}
            className="w-full"
          >
            <ArchiveIcon className="size-5" />
            {student.is_active ? 'В архив' : 'Вернуть из архива'}
          </Button>
        )}
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Группа: название + состав
// ---------------------------------------------------------------------------

function GroupModal({
  studioId,
  group,
  students,
  initialMemberIds,
  onClose,
  onDone,
}: {
  studioId: string
  group: Group | null
  students: Student[]
  initialMemberIds: Set<string>
  onClose: () => void
  onDone: () => void
}) {
  const [name, setName] = useState(group?.name ?? '')
  const [memberIds, setMemberIds] = useState(initialMemberIds)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Порядок фиксируем при открытии: сначала состав, потом остальные —
  // чтобы строки не прыгали, пока директор ставит галочки. Архивных
  // учеников показываем, только если они ещё числятся в группе.
  const [choices] = useState(() =>
    students
      .filter((s) => s.is_active || initialMemberIds.has(s.id))
      .sort(
        (a, b) =>
          Number(initialMemberIds.has(b.id)) - Number(initialMemberIds.has(a.id)) ||
          a.full_name.localeCompare(b.full_name, 'ru'),
      ),
  )
  const q = query.trim().toLowerCase()
  const visible = q
    ? choices.filter((s) => s.full_name.toLowerCase().includes(q))
    : choices

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const trimmed = name.trim()

    let id = group?.id
    if (group) {
      const { error } = await supabase
        .from('groups')
        .update({ name: trimmed })
        .eq('id', group.id)
      if (error) return fail(error.message)
    } else {
      const { data, error } = await supabase
        .from('groups')
        .insert({ name: trimmed, studio_id: studioId })
        .select('id')
        .single()
      if (error) return fail(error.message)
      id = data.id as string
    }

    const groupId = id!
    const syncError = await syncMembers({
      studioId,
      pairs: (studentId) => ({ group_id: groupId, student_id: studentId }),
      ...diff(initialMemberIds, memberIds),
    })
    if (syncError) return fail(syncError)
    onDone()
  }

  async function setArchived(archived: boolean) {
    if (!group) return
    setError(null)
    setBusy(true)
    const { error } = await supabase
      .from('groups')
      .update({ is_active: !archived })
      .eq('id', group.id)
    if (error) return fail(error.message)
    onDone()
  }

  function fail(message: string) {
    setBusy(false)
    setError(message)
  }

  return (
    <Modal title={group ? 'Группа' : 'Новая группа'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {group && !group.is_active && (
          <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Группа в архиве — на неё нельзя поставить новое занятие.
          </div>
        )}

        <Field
          label="Название"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Младшая группа, вокал"
          required
          autoFocus={!group}
        />

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Состав
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {memberIds.size > 0
                ? `выбрано: ${memberIds.size}`
                : 'отметьте учеников'}
            </span>
          </div>

          {choices.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
              Сначала добавьте учеников на вкладке «Ученики».
            </p>
          ) : (
            <div className="space-y-2">
              {choices.length > 8 && (
                <SearchField value={query} onChange={setQuery} placeholder="Найти ученика" />
              )}
              <ul className="max-h-72 overflow-y-auto rounded-xl ring-1 ring-slate-200 dark:ring-slate-800">
                {visible.map((s) => {
                  const on = memberIds.has(s.id)
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setMemberIds(toggle(memberIds, s.id))}
                        aria-pressed={on}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <span
                          className={`flex size-5 shrink-0 items-center justify-center rounded-md transition ${
                            on
                              ? 'bg-brand-600 text-white'
                              : 'ring-1 ring-slate-300 dark:ring-slate-600'
                          }`}
                        >
                          {on && <CheckIcon className="size-4" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {s.full_name}
                          {!s.is_active && <Badge>архив</Badge>}
                        </span>
                      </button>
                    </li>
                  )
                })}
                {visible.length === 0 && (
                  <li className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                    Никого не нашли.
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        {error && <ErrorNote text={error} />}

        <Button type="submit" disabled={busy || !name.trim()} className="w-full">
          {busy ? 'Сохраняем…' : group ? 'Сохранить' : 'Создать группу'}
        </Button>
        {group && (
          <Button
            type="button"
            variant={group.is_active ? 'danger' : 'ghost'}
            disabled={busy}
            onClick={() => setArchived(group.is_active)}
            className="w-full"
          >
            <ArchiveIcon className="size-5" />
            {group.is_active ? 'В архив' : 'Вернуть из архива'}
          </Button>
        )}
      </form>
    </Modal>
  )
}
