import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import type { Directory } from '@/lib/directory'
import type { Profile } from '@/lib/types'
import { weekdayOf } from '@/lib/dates'
import { groupMemberIds } from '@/lib/attendance'
import { candidateDates, horizonFrom } from '@/lib/schedule'
import { useConflictGuard } from '@/lib/useConflictGuard'
import { Button, ErrorNote, Field, Modal, Segmented } from '@/components/ui'
import {
  ConflictNote,
  DurationPicker,
  RoomSelect,
  TeacherSelect,
  WeekdayPicker,
} from '@/components/schedule/fields'
import { GroupField, StudentsField } from '@/components/students/RosterFields'
import { StudentPicker } from '@/components/students/StudentPicker'
import { StudentForm } from '@/components/students/StudentCard'

type Repeat = 'weekly' | 'once'
/** что сейчас на экране модалки: форма, выбор учеников или новая карточка */
type View = 'form' | 'pick' | 'newStudent'

/**
 * Новое занятие: разовое или повторяющееся каждую неделю. Состав — группа,
 * ученики из списка или группа и ещё ученики.
 */
export function NewLessonModal({
  dir,
  me,
  defaultDate,
  defaultStart,
  defaultRoomId,
  onClose,
  onDone,
  reloadDir,
}: {
  dir: Directory
  me: Profile
  defaultDate: string
  /** из сетки кабинетов: время и кабинет, куда нажали */
  defaultStart?: string
  defaultRoomId?: string | null
  onClose: () => void
  onDone: (date: string) => void
  /** перечитать справочник — после новой карточки ученика */
  reloadDir: () => Promise<void>
}) {
  const isDirector = me.role === 'director'
  const activeTeachers = dir.profiles.filter((p) => p.is_active && p.role === 'teacher')
  const students = dir.students.filter((s) => s.is_active)

  const [view, setView] = useState<View>('form')
  const [groupId, setGroupId] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [teacherId, setTeacherId] = useState(
    !isDirector ? me.id : activeTeachers.length === 1 ? activeTeachers[0].id : '',
  )
  const [roomId, setRoomId] = useState(defaultRoomId ?? '')
  const [repeat, setRepeat] = useState<Repeat>('weekly')
  const [date, setDate] = useState(defaultDate)
  // null — день недели следует за датой начала, пока его не выбрали вручную
  const [pickedWeekdays, setPickedWeekdays] = useState<number[] | null>(null)
  const [endDate, setEndDate] = useState('')
  const [start, setStart] = useState(defaultStart ?? '15:00')
  const [duration, setDuration] = useState(45)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const weekdays = pickedWeekdays ?? [weekdayOf(date)]
  const members = groupMemberIds(groupId || null, dir)
  // кто и так в группе, отдельно не записываем
  const extras = [...picked].filter((id) => !members.includes(id))

  const query =
    teacherId && date && start && duration > 0
      ? {
          teacherId,
          roomId: roomId || null,
          dates:
            repeat === 'weekly'
              ? candidateDates(date, endDate || null, weekdays)
              : candidateDates(date, null, null),
          start,
          duration,
        }
      : null
  const guard = useConflictGuard(dir, query)

  // чего не хватает для сохранения — показывается под неактивной кнопкой
  const missing =
    !groupId && extras.length === 0
      ? 'Выберите группу или учеников'
      : !teacherId
        ? 'Выберите педагога'
        : !date
          ? 'Укажите дату'
          : !start
            ? 'Укажите время начала'
            : !(duration > 0)
              ? 'Укажите длительность'
              : repeat === 'weekly' && weekdays.length === 0
                ? 'Выберите хотя бы один день недели'
                : repeat === 'weekly' && !!endDate && endDate < date
                  ? 'Дата «до» раньше даты начала'
                  : null
  const invalid = missing !== null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (invalid) return
    setError(null)
    setBusy(true)

    const check = await guard.check()
    if (!check.ok) {
      setBusy(false)
      setError(check.error)
      return
    }

    const { error } = await supabase.rpc('create_lesson', {
      p_teacher: teacherId,
      p_room: roomId || null,
      p_group: groupId || null,
      p_students: extras,
      p_date: date,
      p_start: start,
      p_duration: duration,
      p_weekdays: repeat === 'weekly' ? weekdays : null,
      p_end: repeat === 'weekly' ? endDate || null : null,
      p_until: horizonFrom(date),
    })
    if (error) {
      setBusy(false)
      setError(error.message)
      return
    }
    onDone(date)
  }

  if (view === 'pick') {
    return (
      <Modal title="Ученики на занятии" onClose={() => setView('form')}>
        <StudentPicker
          students={students}
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
    <Modal title="Новое занятие" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <GroupField dir={dir} value={groupId} onChange={setGroupId} />
        <StudentsField
          dir={dir}
          label={groupId ? 'Ещё ученики (необязательно)' : 'Ученики'}
          ids={extras}
          onRemove={(id) => setPicked((prev) => {
            const next = new Set(prev)
            next.delete(id)
            return next
          })}
          onAdd={() => setView('pick')}
        />

        <Segmented<Repeat>
          value={repeat}
          onChange={setRepeat}
          options={[
            { value: 'weekly', label: 'Каждую неделю' },
            { value: 'once', label: 'Разовое' },
          ]}
        />

        {repeat === 'weekly' ? (
          <>
            <WeekdayPicker
              multiple
              label="Дни недели"
              value={weekdays}
              onChange={setPickedWeekdays}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Начиная с"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
              <Field
                label="До (необяз.)"
                type="date"
                value={endDate}
                min={date}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </>
        ) : (
          <Field
            label="Дата"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        )}

        <div className="grid gap-4">
          <Field
            label="Начало"
            type="time"
            step={300}
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
          />
          <DurationPicker value={duration} onChange={setDuration} />
        </div>

        <RoomSelect dir={dir} value={roomId} onChange={setRoomId} />
        {isDirector && <TeacherSelect dir={dir} value={teacherId} onChange={setTeacherId} />}

        {guard.conflicts && <ConflictNote conflicts={guard.conflicts} />}
        {error && <ErrorNote text={error} />}

        <div className="space-y-2">
          <Button type="submit" disabled={busy || invalid} className="w-full">
            {busy ? 'Сохраняем…' : guard.conflicts ? 'Сохранить всё равно' : 'Добавить занятие'}
          </Button>
          {missing && !busy && (
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">{missing}</p>
          )}
        </div>
      </form>
    </Modal>
  )
}
