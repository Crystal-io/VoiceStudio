import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import type { Directory } from '@/lib/directory'
import type { LessonType, Profile } from '@/lib/types'
import { weekdayOf } from '@/lib/dates'
import { candidateDates, horizonFrom } from '@/lib/schedule'
import { useConflictGuard } from '@/lib/useConflictGuard'
import { Button, ErrorNote, Field, Modal, Segmented, SelectField } from '@/components/ui'
import {
  ConflictNote,
  DurationPicker,
  RoomSelect,
  TeacherSelect,
  WeekdayPicker,
} from '@/components/schedule/fields'

type Repeat = 'weekly' | 'once'

/** Новое занятие: разовое или повторяющееся каждую неделю. */
export function NewLessonModal({
  dir,
  me,
  defaultDate,
  onClose,
  onDone,
}: {
  dir: Directory
  me: Profile
  defaultDate: string
  onClose: () => void
  onDone: (date: string) => void
}) {
  const isDirector = me.role === 'director'
  const activeTeachers = dir.profiles.filter((p) => p.is_active && p.role === 'teacher')

  const [type, setType] = useState<LessonType>('individual')
  const [studentId, setStudentId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [teacherId, setTeacherId] = useState(
    !isDirector ? me.id : activeTeachers.length === 1 ? activeTeachers[0].id : '',
  )
  const [roomId, setRoomId] = useState('')
  const [repeat, setRepeat] = useState<Repeat>('weekly')
  const [date, setDate] = useState(defaultDate)
  // null — день недели следует за датой начала, пока его не выбрали вручную
  const [pickedWeekdays, setPickedWeekdays] = useState<number[] | null>(null)
  const [endDate, setEndDate] = useState('')
  const [start, setStart] = useState('15:00')
  const [duration, setDuration] = useState(45)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const weekdays = pickedWeekdays ?? [weekdayOf(date)]
  const students = dir.students.filter((s) => s.is_active)
  const groups = dir.groups.filter((g) => g.is_active)
  const targetId = type === 'individual' ? studentId : groupId

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

  const invalid =
    !targetId ||
    !teacherId ||
    !date ||
    !start ||
    !(duration > 0) ||
    (repeat === 'weekly' && (weekdays.length === 0 || (!!endDate && endDate < date)))

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

    const base = {
      studio_id: me.studio_id,
      teacher_id: teacherId,
      room_id: roomId || null,
      type,
      student_id: type === 'individual' ? studentId : null,
      group_id: type === 'group' ? groupId : null,
      start_time: start,
      duration_min: duration,
    }

    if (repeat === 'once') {
      const { error } = await supabase.from('sessions').insert({ ...base, date })
      if (error) return fail(error.message)
    } else {
      const { data, error } = await supabase
        .from('lesson_series')
        .insert(
          weekdays.map((weekday) => ({
            ...base,
            weekday,
            start_date: date,
            end_date: endDate || null,
          })),
        )
        .select('id')
      if (error) return fail(error.message)
      for (const row of (data as { id: string }[]) ?? []) {
        const { error } = await supabase.rpc('generate_series_sessions', {
          p_series: row.id,
          p_until: horizonFrom(date),
        })
        if (error) return fail(error.message)
      }
    }
    onDone(date)
  }

  function fail(message: string) {
    setBusy(false)
    setError(message)
  }

  return (
    <Modal title="Новое занятие" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Segmented<LessonType>
          value={type}
          onChange={setType}
          options={[
            { value: 'individual', label: 'Индивидуальное' },
            { value: 'group', label: 'Групповое' },
          ]}
        />

        {type === 'individual' ? (
          students.length === 0 ? (
            <EmptyHint text="Пока нет учеников — директор добавляет их в разделе «Ученики»." />
          ) : (
            <SelectField
              label="Ученик"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              required
            >
              <option value="" disabled>
                Выберите ученика
              </option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </SelectField>
          )
        ) : groups.length === 0 ? (
          <EmptyHint text="Пока нет групп — директор создаёт их в разделе «Ученики» → «Группы»." />
        ) : (
          <SelectField
            label="Группа"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            required
          >
            <option value="" disabled>
              Выберите группу
            </option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </SelectField>
        )}

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

        <Button type="submit" disabled={busy || invalid} className="w-full">
          {busy ? 'Сохраняем…' : guard.conflicts ? 'Сохранить всё равно' : 'Добавить занятие'}
        </Button>
      </form>
    </Modal>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
      {text}
    </p>
  )
}
