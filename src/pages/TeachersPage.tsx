import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/lib/profile'
import type { Invitation, Profile } from '@/lib/types'
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Modal,
  Spinner,
} from '@/components/ui'
import { MailIcon, PlusIcon, UsersIcon } from '@/components/icons'

export function TeachersPage() {
  const { profile } = useProfile()
  const [teachers, setTeachers] = useState<Profile[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  async function load() {
    setLoading(true)
    const [profilesRes, invitesRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, studio_id, full_name, role, color, is_active, created_at')
        .eq('role', 'teacher')
        .order('full_name'),
      supabase
        .from('invitations')
        .select('id, studio_id, email, full_name, role, created_at')
        .order('created_at', { ascending: false }),
    ])
    setTeachers((profilesRes.data as Profile[]) ?? [])
    setInvitations((invitesRes.data as Invitation[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  async function toggleActive(t: Profile) {
    await supabase
      .from('profiles')
      .update({ is_active: !t.is_active })
      .eq('id', t.id)
    void load()
  }

  async function cancelInvite(inv: Invitation) {
    await supabase.from('invitations').delete().eq('id', inv.id)
    void load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Педагоги</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Заводите педагогов — они войдут по своей почте.
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
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Приглашены · ещё не вошли
              </h3>
              <Card>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {invitations.map((inv) => (
                    <li
                      key={inv.id}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <div className="flex size-9 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                        <MailIcon className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{inv.full_name}</p>
                        <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                          {inv.email}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => cancelInvite(inv)}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        Отменить
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}

          <section className="space-y-2">
            {invitations.length > 0 && (
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                В студии
              </h3>
            )}
            {teachers.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<UsersIcon className="size-6" />}
                  title="Пока нет педагогов"
                  hint="Добавьте первого — на его почту можно будет войти по коду."
                />
              </Card>
            ) : (
              <Card>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {teachers.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                      <div
                        className="flex size-9 items-center justify-center rounded-full text-sm font-semibold text-white"
                        style={{ background: t.color ?? '#4f46e5' }}
                      >
                        {initials(t.full_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {t.full_name}
                          {!t.is_active && (
                            <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              отключён
                            </span>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleActive(t)}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {t.is_active ? 'Отключить' : 'Включить'}
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </>
      )}

      {adding && profile && (
        <AddTeacherModal
          studioId={profile.studio_id}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false)
            void load()
          }}
        />
      )}
    </div>
  )
}

function AddTeacherModal({
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
      role: 'teacher',
    })
    setBusy(false)
    if (error) {
      setError(
        error.code === '23505'
          ? 'Такая почта уже приглашена.'
          : error.message,
      )
      return
    }
    onDone()
  }

  return (
    <Modal title="Новый педагог" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
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
          placeholder="teacher@example.com"
          required
          hint="По этой почте педагог войдёт в приложение по одноразовому коду."
        />
        {error && <ErrorNote text={error} />}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Сохраняем…' : 'Пригласить'}
        </Button>
      </form>
    </Modal>
  )
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}
