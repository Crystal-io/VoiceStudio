import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/lib/profile'
import { initials, plural } from '@/lib/format'
import { formatDayMonth, toISO, todayISO } from '@/lib/dates'
import { ensureSessions, horizonFrom, teacherColor } from '@/lib/schedule'
import { useNow } from '@/lib/useNow'
import type { Invitation, Profile, Role } from '@/lib/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Modal,
  Segmented,
  SelectField,
  Spinner,
} from '@/components/ui'
import { MailIcon, PencilIcon, PlusIcon, UsersIcon } from '@/components/icons'

/** Сколько действует приглашение (как в базе: invitations.expires_at). */
const INVITE_DAYS = 30

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'teacher', label: 'Педагог' },
  { value: 'director', label: 'Директор' },
]

/** Сначала действующие, отключённые — в конце. */
function byActive(a: Profile, b: Profile) {
  return Number(b.is_active) - Number(a.is_active) || a.full_name.localeCompare(b.full_name, 'ru')
}

export function TeachersPage() {
  const { profile } = useProfile()
  const [members, setMembers] = useState<Profile[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Profile | null>(null)
  const now = useNow()

  async function load() {
    setLoading(true)
    const [profilesRes, invitesRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, studio_id, full_name, role, color, is_active, created_at')
        .order('full_name'),
      supabase
        .from('invitations')
        .select('id, studio_id, email, full_name, role, created_at, expires_at')
        .order('created_at', { ascending: false }),
    ])
    setMembers((profilesRes.data as Profile[]) ?? [])
    setInvitations((invitesRes.data as Invitation[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  async function cancelInvite(inv: Invitation) {
    await supabase.from('invitations').delete().eq('id', inv.id)
    void load()
  }

  async function prolongInvite(inv: Invitation) {
    const expires = new Date(Date.now() + INVITE_DAYS * 24 * 3600 * 1000).toISOString()
    await supabase.from('invitations').update({ expires_at: expires }).eq('id', inv.id)
    void load()
  }

  const directors = members.filter((m) => m.role === 'director').sort(byActive)
  const teachers = members.filter((m) => m.role === 'teacher').sort(byActive)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Педагоги</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Педагоги и директора — входят по своей почте Google.
          </p>
        </div>
        <Button onClick={() => setAdding(true)} className="shrink-0">
          <PlusIcon className="size-5" />
          Добавить
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <>
          {invitations.length > 0 && (
            <section className="space-y-2">
              <SectionTitle>Приглашены · ещё не вошли</SectionTitle>
              <Card>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {invitations.map((inv) => (
                    <InvitationRow
                      key={inv.id}
                      inv={inv}
                      now={now}
                      onCancel={() => cancelInvite(inv)}
                      onProlong={() => prolongInvite(inv)}
                    />
                  ))}
                </ul>
              </Card>
            </section>
          )}

          <section className="space-y-2">
            <SectionTitle>Директора</SectionTitle>
            <MemberList members={directors} meId={profile?.id} onEdit={setEditing} />
          </section>

          <section className="space-y-2">
            <SectionTitle>Педагоги</SectionTitle>
            {teachers.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<UsersIcon className="size-6" />}
                  title="Пока нет педагогов"
                  hint="Добавьте первого — он войдёт через Google с той почтой, которую вы укажете."
                />
              </Card>
            ) : (
              <MemberList members={teachers} meId={profile?.id} onEdit={setEditing} />
            )}
          </section>
        </>
      )}

      {adding && profile && (
        <AddMemberModal
          studioId={profile.studio_id}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false)
            void load()
          }}
        />
      )}

      {editing && profile && (
        <MemberModal
          member={editing}
          me={profile}
          members={members}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null)
            void load()
          }}
        />
      )}
    </div>
  )
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{children}</h3>
  )
}

function InvitationRow({
  inv,
  now,
  onCancel,
  onProlong,
}: {
  inv: Invitation
  now: Date
  onCancel: () => void
  onProlong: () => void
}) {
  const expired = new Date(inv.expires_at) <= now
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
        <MailIcon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {inv.full_name}
          {inv.role === 'director' && <Badge>директор</Badge>}
        </p>
        <p className="truncate text-sm text-slate-500 dark:text-slate-400">{inv.email}</p>
        <p
          className={`text-xs ${expired ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}
        >
          {expired
            ? 'Приглашение истекло — войти не получится'
            : `Действует до ${formatDayMonth(toISO(new Date(inv.expires_at)))}`}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {expired && (
          <button
            type="button"
            onClick={onProlong}
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-600 transition hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/40"
          >
            Продлить
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Отменить
        </button>
      </div>
    </li>
  )
}

function MemberList({
  members,
  meId,
  onEdit,
}: {
  members: Profile[]
  meId: string | undefined
  onEdit: (m: Profile) => void
}) {
  return (
    <Card>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {members.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onEdit(m)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <div
                className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${m.is_active ? '' : 'opacity-40'}`}
                style={{ background: teacherColor(m) }}
              >
                {initials(m.full_name)}
              </div>
              <p className="min-w-0 flex-1 truncate font-medium">
                {m.full_name}
                {m.id === meId && <Badge>вы</Badge>}
                {!m.is_active && <Badge>отключён</Badge>}
              </p>
              <PencilIcon className="size-4 shrink-0 text-slate-400" />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function AddMemberModal({
  studioId,
  onClose,
  onDone,
}: {
  studioId: string
  onClose: () => void
  onDone: () => void
}) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('teacher')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await supabase.from('invitations').insert({
      studio_id: studioId,
      full_name: fullName.trim(),
      email: email.trim().toLowerCase(),
      role,
    })
    setBusy(false)
    if (error) {
      setError(error.code === '23505' ? 'Такая почта уже приглашена.' : error.message)
      return
    }
    onDone()
  }

  return (
    <Modal title="Пригласить в студию" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Segmented value={role} options={ROLE_OPTIONS} onChange={setRole} />
        <Field
          label="Имя"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Анна Иванова"
          required
          autoFocus
        />
        <Field
          label="Почта"
          type="email"
          inputMode="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="anna.ivanova@gmail.com"
          required
          hint={`Почта Google-аккаунта, с которым человек будет входить, — лучше попросить прислать её. Приглашение действует ${INVITE_DAYS} дней.`}
        />
        {role === 'director' && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            Директор видит и меняет всё: отчёты, оплаты, педагогов, кабинеты и настройки студии.
          </p>
        )}
        {error && <ErrorNote text={error} />}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Сохраняем…' : 'Пригласить'}
        </Button>
      </form>
    </Modal>
  )
}

/** Карточка человека: имя, роль, доступ. Отключение — отдельным шагом. */
function MemberModal({
  member,
  me,
  members,
  onClose,
  onDone,
}: {
  member: Profile
  me: Profile
  members: Profile[]
  onClose: () => void
  onDone: () => void
}) {
  const isMe = member.id === me.id
  const [view, setView] = useState<'edit' | 'disable'>('edit')
  const [fullName, setFullName] = useState(member.full_name)
  const [role, setRole] = useState<Role>(member.role)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim(), role })
      .eq('id', member.id)
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    onDone()
  }

  async function enable() {
    setError(null)
    setBusy(true)
    const { error } = await supabase.from('profiles').update({ is_active: true }).eq('id', member.id)
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    onDone()
  }

  if (view === 'disable') {
    return (
      <DisableMemberModal
        member={member}
        members={members}
        onClose={onClose}
        onBack={() => setView('edit')}
        onDone={onDone}
      />
    )
  }

  const changed = fullName.trim() !== member.full_name || role !== member.role

  return (
    <Modal title={member.full_name} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field
          label="Имя"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
        {isMe ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Свою роль и доступ меняет другой директор — так студия не останется без директора.
          </p>
        ) : (
          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">Роль</span>
            <Segmented value={role} options={ROLE_OPTIONS} onChange={setRole} />
            {role === 'director' && member.role !== 'director' && (
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Директор видит и меняет всё: отчёты, оплаты, педагогов, кабинеты и настройки
                студии. Свои занятия он ведёт как раньше.
              </p>
            )}
          </div>
        )}
        {error && <ErrorNote text={error} />}
        <Button type="submit" disabled={busy || !changed || !fullName.trim()} className="w-full">
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </Button>
      </form>

      {!isMe && (
        <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
          {member.is_active ? (
            <Button variant="danger" onClick={() => setView('disable')} className="w-full">
              Отключить доступ
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Доступ отключён: войти в приложение не получится.
              </p>
              <Button variant="ghost" onClick={enable} disabled={busy} className="w-full">
                Вернуть доступ
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

type DisableMode = 'transfer' | 'cancel' | 'keep'

const DISABLE_OPTIONS: { value: DisableMode; label: string }[] = [
  { value: 'transfer', label: 'Передать' },
  { value: 'cancel', label: 'Отменить' },
  { value: 'keep', label: 'Оставить' },
]

type DisableResult = {
  series: number
  sessions: number
  kept: number
  students: number
  conflicts: number
}

/**
 * Отключить доступ. Если у человека есть будущие занятия или ученики —
 * сразу решаем, что с ними: передать другому, отменить или оставить.
 */
function DisableMemberModal({
  member,
  members,
  onClose,
  onBack,
  onDone,
}: {
  member: Profile
  members: Profile[]
  onClose: () => void
  onBack: () => void
  onDone: () => void
}) {
  const others = members.filter((m) => m.is_active && m.id !== member.id).sort(byActive)
  const [from, setFrom] = useState(todayISO())
  const [stats, setStats] = useState<{ lessons: number; students: number } | null>(null)
  const [mode, setMode] = useState<DisableMode>('transfer')
  const [toId, setToId] = useState('')
  const [withStudents, setWithStudents] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DisableResult | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      // занятия серий создаются на горизонт вперёд — досоздаём, чтобы посчитать все
      await ensureSessions(horizonFrom(from))
      const [lessons, students] = await Promise.all([
        supabase
          .from('sessions')
          .select('id', { count: 'exact', head: true })
          .eq('teacher_id', member.id)
          .gte('date', from)
          .neq('status', 'cancelled'),
        supabase
          .from('students')
          .select('id', { count: 'exact', head: true })
          .eq('main_teacher_id', member.id)
          .eq('is_active', true),
      ])
      if (alive) setStats({ lessons: lessons.count ?? 0, students: students.count ?? 0 })
    })()
    return () => {
      alive = false
    }
  }, [member.id, from])

  const hasLoad = !!stats && (stats.lessons > 0 || stats.students > 0)
  const effectiveMode: DisableMode = hasLoad ? mode : 'keep'
  const toName = others.find((o) => o.id === toId)?.full_name ?? ''

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { data, error } = await supabase.rpc('disable_member', {
      p_member: member.id,
      p_mode: effectiveMode,
      p_to: effectiveMode === 'transfer' ? toId : null,
      p_from: from,
      p_until: horizonFrom(from),
      p_students: effectiveMode === 'transfer' && withStudents,
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    const res = data as DisableResult | null
    if (res && (res.conflicts > 0 || res.kept > 0)) setResult(res)
    else onDone()
  }

  if (result) {
    return (
      <Modal title="Доступ отключён" onClose={onDone}>
        <div className="space-y-4">
          {result.conflicts > 0 && (
            <ErrorNote
              text={`${toName}: ${plural(result.conflicts, ['пересечение', 'пересечения', 'пересечений'])} в расписании — два занятия в одно время. Откройте «Расписание» и разведите их.`}
            />
          )}
          {result.kept > 0 && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {plural(result.kept, ['занятие осталось', 'занятия остались', 'занятий осталось'])} в
              расписании: на них уже есть отметки (например, оплата вперёд). Решите их вручную —
              передайте другому педагогу или отмените.
            </p>
          )}
          <Button onClick={onDone} className="w-full">
            Понятно
          </Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={`Отключить: ${member.full_name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Войти в приложение больше не получится — даже на уже открытом телефоне. Прошлые
          занятия, посещаемость и оплаты остаются. Вернуть доступ можно в любой момент.
        </p>

        {!stats ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : hasLoad ? (
          <>
            <Field
              label="С какого дня"
              type="date"
              value={from}
              min={todayISO()}
              onChange={(e) => e.target.value && setFrom(e.target.value)}
              required
            />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              С {formatDayMonth(from)} в расписании{' '}
              {plural(stats.lessons, ['занятие', 'занятия', 'занятий'])}
              {stats.students > 0 &&
                `, основной педагог у ${plural(stats.students, ['ученика', 'учеников', 'учеников'])}`}
              . Что с ними сделать?
            </p>
            <Segmented value={mode} options={DISABLE_OPTIONS} onChange={setMode} />

            {mode === 'transfer' && (
              <>
                <SelectField
                  label="Кому передать"
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Выберите педагога
                  </option>
                  {others.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.full_name}
                      {o.role === 'director' ? ' (директор)' : ''}
                    </option>
                  ))}
                </SelectField>
                {stats.students > 0 && (
                  <label className="flex items-start gap-3 rounded-xl p-3 ring-1 ring-slate-200 dark:ring-slate-800">
                    <input
                      type="checkbox"
                      checked={withStudents}
                      onChange={(e) => setWithStudents(e.target.checked)}
                      className="mt-0.5 size-5 shrink-0 accent-brand-600"
                    />
                    <span className="text-sm">
                      <span className="block font-medium">И учеников</span>
                      <span className="block text-slate-500 dark:text-slate-400">
                        Новый педагог станет основным у{' '}
                        {plural(stats.students, ['ученика', 'учеников', 'учеников'])} — и сможет
                        править их карточки.
                      </span>
                    </span>
                  </label>
                )}
                <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  Те же дни, время и кабинеты — только с другим педагогом. Если у него в это время
                  уже есть занятия, покажем пересечения.
                </p>
              </>
            )}
            {mode === 'cancel' && (
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Повторяющиеся занятия остановятся, будущие уберутся из расписания и освободят
                кабинеты. Занятия, где уже стоят отметки (например, оплата вперёд), останутся — их
                решите вручную.
              </p>
            )}
            {mode === 'keep' && (
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Занятия останутся в расписании с этим именем и будут занимать кабинеты, пока вы их
                не перенесёте. Подходит, если доступ отключаете ненадолго.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Будущих занятий и своих учеников нет — передавать ничего не нужно.
          </p>
        )}

        {error && <ErrorNote text={error} />}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onBack} className="flex-1">
            Назад
          </Button>
          <Button
            type="submit"
            variant="danger"
            disabled={busy || !stats || (effectiveMode === 'transfer' && !toId)}
            className="flex-1"
          >
            {busy ? 'Отключаем…' : 'Отключить'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
