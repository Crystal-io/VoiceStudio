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

/** значение пункта «+ Новый ученик» в списке учеников */
const NEW_STUDENT = '__new'

const normName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/** Новое занятие: разовое или повторяющееся каждую неделю. */
export function NewLessonModal({
  dir,
  me,
  defaultDate,
  defaultStart,
  defaultRoomId,
  onClose,
  onDone,
}: {
  dir: Directory
  me: Profile
  defaultDate: string
  /** из сетки кабинетов: время и кабинет, куда нажали */
  defaultStart?: string
  defaultRoomId?: string | null
  onClose: () => void
  /** studentAdded — по ходу добавлен новый ученик (справочник устарел) */
  onDone: (date: string, studentAdded: boolean) => void
}) {
  const isDirector = me.role === 'director'
  const activeTeachers = dir.profiles.filter((p) => p.is_active && p.role === 'teacher')
  const students = dir.students.filter((s) => s.is_active)
  const groups = dir.groups.filter((g) => g.is_active)

  // учеников нет, а группы есть — сразу открываем групповое
  const [type, setType] = useState<LessonType>(
    students.length === 0 && groups.length > 0 ? 'group' : 'individual',
  )
  const [studentId, setStudentId] = useState('')
  // новый ученик вводится прямо здесь; без учеников в студии — сразу так
  const [newName, setNewName] = useState('')
  const [newContact, setNewContact] = useState('')
  // уже созданный при прошлой попытке — чтобы повтор не завёл дубль
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null)
  const [groupId, setGroupId] = useState('')
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
  const addingStudent =
    type === 'individual' && (students.length === 0 || studentId === NEW_STUDENT)
  const hasTarget =
    type === 'individual' ? (addingStudent ? !!newName.trim() : !!studentId) : !!groupId
  // такое имя уже есть — предлагаем выбрать, а не заводить второго
  const sameName = addingStudent
    ? dir.students.find((s) => newName.trim() && normName(s.full_name) === normName(newName))
    : undefined

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
  const missing = !hasTarget
    ? type === 'individual'
      ? addingStudent
        ? 'Укажите имя ученика'
        : 'Выберите ученика'
      : groups.length === 0
        ? 'Групп пока нет — выберите «Индивидуальное»'
        : 'Выберите группу'
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

    // ученика заводим только после проверки пересечений: иначе «передумал
    // из-за пересечения» оставил бы его в студии
    let targetStudent = studentId
    if (addingStudent) {
      const name = newName.trim().replace(/\s+/g, ' ')
      if (created && created.name === name) {
        targetStudent = created.id
      } else {
        const { data, error } = await supabase
          .from('students')
          .insert({
            studio_id: me.studio_id,
            full_name: name,
            parent_contact: newContact.trim() || null,
          })
          .select('id')
          .single()
        if (error) return fail(error.message)
        targetStudent = data.id as string
        setCreated({ id: targetStudent, name })
      }
    }

    const base = {
      studio_id: me.studio_id,
      teacher_id: teacherId,
      room_id: roomId || null,
      type,
      student_id: type === 'individual' ? targetStudent : null,
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
    onDone(date, addingStudent || created !== null)
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
          <div className="space-y-3">
            {students.length > 0 && (
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
                <option value={NEW_STUDENT}>+ Новый ученик</option>
              </SelectField>
            )}
            {addingStudent && (
              <NewStudentFields
                first={students.length === 0}
                isDirector={isDirector}
                name={newName}
                contact={newContact}
                onName={setNewName}
                onContact={setNewContact}
                sameName={sameName ?? null}
                onPick={(id) => setStudentId(id)}
              />
            )}
          </div>
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

/** Новый ученик прямо в форме занятия — заводится вместе с занятием. */
function NewStudentFields({
  first,
  isDirector,
  name,
  contact,
  onName,
  onContact,
  sameName,
  onPick,
}: {
  /** в студии ещё нет учеников */
  first: boolean
  isDirector: boolean
  name: string
  contact: string
  onName: (v: string) => void
  onContact: (v: string) => void
  /** ученик с таким же именем, если есть */
  sameName: { id: string; full_name: string; is_active: boolean } | null
  onPick: (id: string) => void
}) {
  return (
    <div className="space-y-3 rounded-xl p-3 ring-1 ring-slate-200 dark:ring-slate-700">
      <Field
        label={first ? 'Ученик' : 'Новый ученик'}
        value={name}
        onChange={(e) => onName(e.target.value)}
        placeholder="Маша Петрова"
        autoFocus={!first}
        required
      />
      {sameName &&
        (sameName.is_active ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            <span>«{sameName.full_name}» уже есть в студии.</span>
            <button
              type="button"
              onClick={() => onPick(sameName.id)}
              className="shrink-0 font-semibold text-brand-700 hover:underline dark:text-brand-300"
            >
              Выбрать
            </button>
          </div>
        ) : (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            «{sameName.full_name}» есть в архиве —{' '}
            {isDirector
              ? 'карточку можно вернуть в разделе «Ученики».'
              : 'вернуть карточку может директор, или добавьте заново.'}
          </p>
        ))}
      <Field
        label="Контакт родителя"
        value={contact}
        onChange={(e) => onContact(e.target.value)}
        placeholder="Мама Ольга, +7 900 123-45-67"
        hint="Необязательно"
      />
      <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        {first ? 'Учеников в студии пока нет — этот будет первым. ' : ''}
        {isDirector
          ? 'Ученик появится в разделе «Ученики» вместе с занятием.'
          : 'Ученик добавится в студию вместе с занятием. Исправить карточку или убрать в архив сможет директор.'}
      </p>
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
      {text}
    </p>
  )
}
