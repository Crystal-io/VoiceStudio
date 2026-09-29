import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import type { Directory } from '@/lib/directory'
import type { LessonSeries, Session } from '@/lib/types'
import { formatDayMonth, hhmm } from '@/lib/dates'
import { candidateDates, horizonFrom, lessonTitle } from '@/lib/schedule'
import { useConflictGuard } from '@/lib/useConflictGuard'
import { Button, ErrorNote, Field, Modal } from '@/components/ui'
import {
  ConflictNote,
  DurationPicker,
  RoomSelect,
  TeacherSelect,
  WeekdayPicker,
} from '@/components/schedule/fields'

// ---------------------------------------------------------------------------
// Перенос одного занятия (остальные занятия серии не меняются)
// ---------------------------------------------------------------------------

export function MoveSessionModal({
  session,
  dir,
  canChangeTeacher,
  onClose,
  onDone,
}: {
  session: Session
  dir: Directory
  canChangeTeacher: boolean
  onClose: () => void
  onDone: (date: string) => void
}) {
  const [date, setDate] = useState(session.date)
  const [start, setStart] = useState(hhmm(session.start_time))
  const [duration, setDuration] = useState(session.duration_min)
  const [roomId, setRoomId] = useState(session.room_id ?? '')
  const [teacherId, setTeacherId] = useState(session.teacher_id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const invalid = !date || !start || !(duration > 0) || !teacherId
  const guard = useConflictGuard(
    dir,
    invalid
      ? null
      : {
          teacherId,
          roomId: roomId || null,
          dates: [date],
          start,
          duration,
          ignoreSessionId: session.id,
        },
  )

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
    const { error } = await supabase
      .from('sessions')
      .update({
        date,
        start_time: start,
        duration_min: duration,
        room_id: roomId || null,
        teacher_id: teacherId,
        // перенос отменённого занятия — значит, оно всё-таки состоится
        ...(session.status === 'cancelled' ? { status: 'scheduled' } : {}),
      })
      .eq('id', session.id)
    if (error) {
      setBusy(false)
      setError(error.message)
      return
    }
    onDone(date)
  }

  return (
    <Modal title="Перенести занятие" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {lessonTitle(session, dir)} · меняется только это занятие
          {session.series_id ? ', остальные в серии останутся как были' : ''}.
        </p>
        <Field
          label="Дата"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
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
        {canChangeTeacher && <TeacherSelect dir={dir} value={teacherId} onChange={setTeacherId} />}

        {guard.conflicts && <ConflictNote conflicts={guard.conflicts} />}
        {error && <ErrorNote text={error} />}

        <Button type="submit" disabled={busy || invalid} className="w-full">
          {busy ? 'Сохраняем…' : guard.conflicts ? 'Сохранить всё равно' : 'Перенести'}
        </Button>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Изменение серии начиная с даты (прошлые занятия не трогаются)
// ---------------------------------------------------------------------------

export function EditSeriesModal({
  series,
  fromDate,
  dir,
  canChangeTeacher,
  onClose,
  onDone,
}: {
  series: LessonSeries
  /** с какого занятия менять (по умолчанию — открытое занятие) */
  fromDate: string
  dir: Directory
  canChangeTeacher: boolean
  onClose: () => void
  onDone: (date: string) => void
}) {
  const [from, setFrom] = useState(fromDate)
  const [weekday, setWeekday] = useState(series.weekday)
  const [start, setStart] = useState(hhmm(series.start_time))
  const [duration, setDuration] = useState(series.duration_min)
  const [roomId, setRoomId] = useState(series.room_id ?? '')
  const [teacherId, setTeacherId] = useState(series.teacher_id)
  const [endDate, setEndDate] = useState(series.end_date ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const invalid =
    !from || !start || !(duration > 0) || !teacherId || (!!endDate && endDate < from)
  const guard = useConflictGuard(
    dir,
    invalid
      ? null
      : {
          teacherId,
          roomId: roomId || null,
          dates: candidateDates(from, endDate || null, [weekday]),
          start,
          duration,
          ignoreSeriesId: series.id,
        },
  )

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
    const { error } = await supabase.rpc('update_series', {
      p_series: series.id,
      p_from: from,
      p_teacher: teacherId,
      p_room: roomId || null,
      p_weekday: weekday,
      p_start: start,
      p_duration: duration,
      p_end: endDate || null,
      p_until: horizonFrom(from),
    })
    if (error) {
      setBusy(false)
      setError(error.message)
      return
    }
    onDone(from)
  }

  return (
    <Modal title="Изменить расписание серии" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {lessonTitle(series, dir)}. Новые правила действуют с выбранной даты,
          занятия до {from ? formatDayMonth(from) : '…'} останутся как были. Разовые
          переносы и отмены после этой даты сбросятся.
        </p>
        <Field
          label="Изменить начиная с"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          required
        />
        <WeekdayPicker value={[weekday]} onChange={(v) => setWeekday(v[0])} />
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
        {canChangeTeacher && <TeacherSelect dir={dir} value={teacherId} onChange={setTeacherId} />}
        <Field
          label="Последний день (необязательно)"
          type="date"
          value={endDate}
          min={from}
          onChange={(e) => setEndDate(e.target.value)}
          hint="Пусто — занятия идут, пока повторение не остановят."
        />

        {guard.conflicts && <ConflictNote conflicts={guard.conflicts} />}
        {error && <ErrorNote text={error} />}

        <Button type="submit" disabled={busy || invalid} className="w-full">
          {busy ? 'Сохраняем…' : guard.conflicts ? 'Сохранить всё равно' : 'Сохранить'}
        </Button>
      </form>
    </Modal>
  )
}
