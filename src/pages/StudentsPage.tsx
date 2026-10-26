import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/lib/profile'
import { useDirectory, type Directory } from '@/lib/directory'
import { ageFrom, plural } from '@/lib/format'
import { diff, groupIdsOf, syncMembers, toggle } from '@/lib/groups'
import type { Group, Profile, Student } from '@/lib/types'
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
} from '@/components/ui'
import { StudentAvatar } from '@/components/students/StudentAvatar'
import { StudentCardModal } from '@/components/students/StudentCard'
import {
  ArchiveIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MusicIcon,
  PlusIcon,
  UsersIcon,
} from '@/components/icons'

type Tab = 'students' | 'groups'
type Whose = 'mine' | 'all'

export function StudentsPage() {
  const { profile } = useProfile()
  const { dir, error: loadError, reload } = useDirectory()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'groups' ? 'groups' : 'students'

  const [studentForm, setStudentForm] = useState<Student | 'new' | null>(null)
  const [groupForm, setGroupForm] = useState<Group | 'new' | null>(null)

  function closeForms() {
    setStudentForm(null)
    setGroupForm(null)
  }

  function saved() {
    closeForms()
    void reload()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Ученики</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {tab === 'students'
              ? 'Карточки детей, которые занимаются в студии.'
              : 'Составы для групповых занятий.'}
          </p>
        </div>
        <Button
          onClick={() => (tab === 'students' ? setStudentForm('new') : setGroupForm('new'))}
          className="shrink-0"
        >
          <PlusIcon className="size-5" />
          Добавить
        </Button>
      </div>

      <Segmented<Tab>
        value={tab}
        onChange={(t) => setParams(t === 'groups' ? { tab: 'groups' } : {}, { replace: true })}
        options={[
          { value: 'students', label: 'Ученики' },
          { value: 'groups', label: 'Группы' },
        ]}
      />

      {loadError && <ErrorNote text={loadError} />}

      {!dir || !profile ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : tab === 'students' ? (
        <StudentsList dir={dir} me={profile} onOpen={setStudentForm} />
      ) : (
        <GroupsList dir={dir} onOpen={setGroupForm} />
      )}

      {studentForm && dir && profile && (
        <StudentCardModal
          student={studentForm === 'new' ? null : studentForm}
          dir={dir}
          me={profile}
          onClose={closeForms}
          onChanged={saved}
        />
      )}

      {groupForm && dir && profile && (
        <GroupModal
          me={profile}
          dir={dir}
          group={groupForm === 'new' ? null : groupForm}
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
  dir,
  me,
  onOpen,
}: {
  dir: Directory
  me: Profile
  onOpen: (s: Student) => void
}) {
  const isDirector = me.role === 'director'
  const hasMine = dir.students.some((s) => s.main_teacher_id === me.id)
  const [whose, setWhose] = useState<Whose>(!isDirector && hasMine ? 'mine' : 'all')
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const matches = (s: Student) =>
    !q ||
    s.full_name.toLowerCase().includes(q) ||
    (s.parent_name ?? '').toLowerCase().includes(q) ||
    (s.parent_phone ?? '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '—')
  const scoped = dir.students.filter((s) => whose === 'all' || s.main_teacher_id === me.id)
  const active = scoped.filter((s) => s.is_active && matches(s))
  const archived = scoped.filter((s) => !s.is_active && matches(s))

  if (dir.students.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<MusicIcon className="size-6" />}
          title="Пока нет учеников"
          hint="Добавьте карточки детей — потом их можно будет записывать на занятия и собирать в группы."
        />
      </Card>
    )
  }

  function subtitle(s: Student): string {
    const age = s.birth_date ? ageFrom(s.birth_date) : null
    const teacher =
      whose === 'all' && s.main_teacher_id
        ? dir.profileById.get(s.main_teacher_id)?.full_name
        : null
    const groups = groupIdsOf(s.id, dir)
      .map((id) => dir.groupById.get(id))
      .filter((g) => !!g && g.is_active)
      .map((g) => g!.name)
      .join(', ')
    return (
      [age !== null ? plural(age, ['год', 'года', 'лет']) : null, teacher, groups]
        .filter(Boolean)
        .join(' · ') || 'Индивидуально'
    )
  }

  const row = (s: Student) => (
    <PersonRow
      key={s.id}
      title={s.full_name}
      subtitle={subtitle(s)}
      avatar={<StudentAvatar student={s} muted={!s.is_active} />}
      muted={!s.is_active}
      onClick={() => onOpen(s)}
    />
  )

  return (
    <div className="space-y-3">
      {!isDirector && (
        <Segmented<Whose>
          value={whose}
          onChange={setWhose}
          options={[
            { value: 'mine', label: 'Мои ученики' },
            { value: 'all', label: 'Все' },
          ]}
        />
      )}
      {scoped.length > 6 && (
        <SearchField value={query} onChange={setQuery} placeholder="Имя, родитель или телефон" />
      )}

      {active.length > 0 ? (
        <Card>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">{active.map(row)}</ul>
        </Card>
      ) : (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {q
            ? 'Никого не нашли.'
            : whose === 'mine' && scoped.length === 0
              ? 'Вы пока не основной педагог ни у кого из учеников.'
              : 'Все ученики в архиве.'}
        </p>
      )}

      <ArchiveSection count={archived.length} forceOpen={q !== ''}>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">{archived.map(row)}</ul>
      </ArchiveSection>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Вкладка «Группы»
// ---------------------------------------------------------------------------

function GroupsList({ dir, onOpen }: { dir: Directory; onOpen: (g: Group) => void }) {
  if (dir.groups.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<UsersIcon className="size-6" />}
          title="Пока нет групп"
          hint="Создайте группу и отметьте, кто в неё входит — на групповое занятие придёт весь состав."
        />
      </Card>
    )
  }

  function subtitle(g: Group): string {
    const members = (dir.membersByGroup.get(g.id) ?? [])
      .map((id) => dir.studentById.get(id))
      .filter((s): s is Student => !!s && s.is_active)
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'))
    if (members.length === 0) return 'Пока никого'
    const names = members.map((s) => s.first_name).join(', ')
    return `${plural(members.length, ['ученик', 'ученика', 'учеников'])} · ${names}`
  }

  const row = (g: Group) => (
    <PersonRow
      key={g.id}
      title={g.name}
      subtitle={subtitle(g)}
      avatar={
        <span
          className={`flex size-10 items-center justify-center rounded-full ${
            g.is_active
              ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/50 dark:text-brand-400'
              : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
          }`}
        >
          <UsersIcon className="size-5" />
        </span>
      }
      muted={!g.is_active}
      onClick={() => onOpen(g)}
    />
  )

  const active = dir.groups.filter((g) => g.is_active)
  const archived = dir.groups.filter((g) => !g.is_active)

  return (
    <div className="space-y-3">
      {active.length > 0 ? (
        <Card>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">{active.map(row)}</ul>
        </Card>
      ) : (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Все группы в архиве.
        </p>
      )}

      <ArchiveSection count={archived.length}>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">{archived.map(row)}</ul>
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
        {avatar}
        <div className="min-w-0 flex-1">
          <p className={`truncate font-medium ${muted ? 'text-slate-500 dark:text-slate-400' : ''}`}>
            {title}
          </p>
          <p className="truncate text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
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
        <ChevronDownIcon className={`size-4 transition ${shown ? 'rotate-180' : ''}`} />
      </button>
      {shown && <Card>{children}</Card>}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Группа: название + состав. Создаёт и комплектует любой педагог,
// убрать в архив — директор.
// ---------------------------------------------------------------------------

function GroupModal({
  me,
  dir,
  group,
  onClose,
  onDone,
}: {
  me: Profile
  dir: Directory
  group: Group | null
  onClose: () => void
  onDone: () => void
}) {
  const isDirector = me.role === 'director'
  const [initialMemberIds] = useState(() => new Set(group ? (dir.membersByGroup.get(group.id) ?? []) : []))
  const [name, setName] = useState(group?.name ?? '')
  const [memberIds, setMemberIds] = useState(initialMemberIds)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canEdit = isDirector || !group || group.is_active

  // Порядок фиксируем при открытии: сначала состав, потом остальные —
  // чтобы строки не прыгали, пока ставят галочки. Архивных учеников
  // показываем, только если они ещё числятся в группе.
  const [choices] = useState(() =>
    dir.students
      .filter((s) => s.is_active || initialMemberIds.has(s.id))
      .sort(
        (a, b) =>
          Number(initialMemberIds.has(b.id)) - Number(initialMemberIds.has(a.id)) ||
          a.full_name.localeCompare(b.full_name, 'ru'),
      ),
  )
  const q = query.trim().toLowerCase()
  const visible = useMemo(
    () => (q ? choices.filter((s) => s.full_name.toLowerCase().includes(q)) : choices),
    [choices, q],
  )

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const trimmed = name.trim()

    let id = group?.id
    if (group) {
      const { error } = await supabase.from('groups').update({ name: trimmed }).eq('id', group.id)
      if (error) return fail(error.message)
    } else {
      const { data, error } = await supabase
        .from('groups')
        .insert({ name: trimmed, studio_id: me.studio_id })
        .select('id')
        .single()
      if (error) return fail(error.message)
      id = data.id as string
    }

    const groupId = id!
    const syncError = await syncMembers({
      studioId: me.studio_id,
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
    const { error } = await supabase.from('groups').update({ is_active: !archived }).eq('id', group.id)
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
            Группа в архиве — на неё нельзя поставить новое занятие
            {isDirector ? '.' : '. Вернуть её может директор.'}
          </div>
        )}

        <Field
          label="Название"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Младшая группа, вокал"
          required
          disabled={!canEdit}
          autoFocus={!group}
        />

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Состав</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {memberIds.size > 0 ? `выбрано: ${memberIds.size}` : 'отметьте учеников'}
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
                        disabled={!canEdit}
                        onClick={() => setMemberIds(toggle(memberIds, s.id))}
                        aria-pressed={on}
                        className="flex w-full items-center gap-3 px-4 py-2 text-left transition hover:bg-slate-50 disabled:hover:bg-transparent dark:hover:bg-slate-800/50"
                      >
                        <span
                          className={`flex size-5 shrink-0 items-center justify-center rounded-md transition ${
                            on ? 'bg-brand-600 text-white' : 'ring-1 ring-slate-300 dark:ring-slate-600'
                          }`}
                        >
                          {on && <CheckIcon className="size-4" />}
                        </span>
                        <StudentAvatar student={s} size="sm" muted={!s.is_active} />
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

        {canEdit && (
          <Button type="submit" disabled={busy || !name.trim()} className="w-full">
            {busy ? 'Сохраняем…' : group ? 'Сохранить' : 'Создать группу'}
          </Button>
        )}
        {group && isDirector && (
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
