import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Directory } from '@/lib/directory'
import type { Attendance, Profile, Session, Student } from '@/lib/types'
import { formatDayMonth } from '@/lib/dates'
import { groupMemberIds } from '@/lib/attendance'
import { Button, ErrorNote, Modal, Segmented } from '@/components/ui'
import { GroupField, StudentsField } from '@/components/students/RosterFields'
import { StudentPicker } from '@/components/students/StudentPicker'
import { StudentForm } from '@/components/students/StudentCard'

type Scope = 'one' | 'following'
type View = 'form' | 'pick' | 'newStudent'

/**
 * Состав занятия: группа и ученики. Для серии — только это занятие или это
 * и все следующие.
 */
export function RosterModal({
  session,
  rows,
  dir,
  me,
  onClose,
  onDone,
  reloadDir,
}: {
  session: Session
  /** отметки занятия — кто с отметкой, тот сейчас тоже в составе */
  rows: Attendance[]
  dir: Directory
  me: Profile
  onClose: () => void
  onDone: () => void
  reloadDir: () => Promise<void>
}) {
  const isDirector = me.role === 'director'
  const [view, setView] = useState<View>('form')
  const [groupId, setGroupId] = useState(session.group_id ?? '')
  // ученики «сверх группы»: записанные на занятие и все, у кого есть отметка
  const [picked, setPicked] = useState(() => {
    const inGroup = new Set(groupMemberIds(session.group_id, dir))
    return new Set([...session.student_ids, ...rows.map((r) => r.student_id)].filter((id) => !inGroup.has(id)))
  })
  const [scope, setScope] = useState<Scope>('one')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const members = groupMemberIds(groupId || null, dir)
  const extras = [...picked].filter((id) => !members.includes(id))
  const stays = new Set([...members, ...extras])
  // у кого отметка пропадёт (только для «этого занятия» — серия отметки не трогает)
  const losing = rows
    .filter((r) => (r.status || r.is_paid) && !stays.has(r.student_id))
    .map((r) => dir.studentById.get(r.student_id))
    .filter((s): s is Student => !!s)
  const empty = !groupId && extras.length === 0

  async function save() {
    setError(null)
    setBusy(true)
    const { error } =
      scope === 'one'
        ? await supabase.rpc('set_session_roster', {
            p_session: session.id,
            p_group: groupId || null,
            p_students: extras,
          })
        : await supabase.rpc('set_series_roster', {
            p_series: session.series_id,
            p_from: session.date,
            p_group: groupId || null,
            p_students: extras,
          })
    setBusy(false)
    if (error) return setError(error.message)
    onDone()
  }

  if (view === 'pick') {
    return (
      <Modal title="Ученики на занятии" onClose={() => setView('form')}>
        <StudentPicker
          students={dir.students.filter((s) => s.is_active || picked.has(s.id))}
          initial={new Set(extras)}
          locked={new Set(members)}
          myId={isDirector ? undefined : me.id}
          onDone={(selected) => {
            setPicked(selected)
            setView('form')
          }}
          onCancel={() => setView('form')}
          onCreate={() => setView('newStudent')}
        />
      </Modal>
    )
  }

  if (view === 'newStudent') {
    return (
      <Modal title="Новый ученик" onClose={() => setView('pick')}>
        <StudentForm
          student={null}
          dir={dir}
          me={me}
          onSaved={async (id) => {
            await reloadDir()
            setPicked((prev) => new Set(prev).add(id))
            setView('form')
          }}
        />
      </Modal>
    )
  }

  return (
    <Modal title="Состав занятия" onClose={onClose}>
      <div className="space-y-4">
        {session.series_id && (
          <Segmented<Scope>
            value={scope}
            onChange={setScope}
            options={[
              { value: 'one', label: 'Только это занятие' },
              { value: 'following', label: 'Это и следующие' },
            ]}
          />
        )}

        <GroupField dir={dir} value={groupId} onChange={setGroupId} />
        <StudentsField
          dir={dir}
          label={groupId ? 'Ещё ученики (необязательно)' : 'Ученики'}
          ids={extras}
          onRemove={(id) =>
            setPicked((prev) => {
              const next = new Set(prev)
              next.delete(id)
              return next
            })
          }
          onAdd={() => setView('pick')}
        />

        {scope === 'following' ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Новый состав — у этого и всех следующих занятий серии (с{' '}
            {formatDayMonth(session.date)}). Уже поставленные отметки сохранятся.
          </p>
        ) : (
          losing.length > 0 && (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900">
              На этом занятии уже есть отметка у:{' '}
              {losing.map((s) => s.full_name).join(', ')}. Она удалится вместе с учеником.
            </div>
          )
        )}

        {error && <ErrorNote text={error} />}

        <div className="space-y-2">
          <Button type="button" disabled={busy || empty} onClick={save} className="w-full">
            {busy ? 'Сохраняем…' : 'Сохранить состав'}
          </Button>
          {empty && (
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">
              Выберите группу или учеников
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
