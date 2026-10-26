import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import type { Directory } from '@/lib/directory'
import type { Profile, RoomBooking } from '@/lib/types'
import { formatDayLong, fromMinutes, hhmm, timeRange, toMinutes } from '@/lib/dates'
import { NO_TEACHER } from '@/lib/schedule'
import {
  BOOKING_TITLES,
  bookingState,
  CONFIRM_BEFORE_MIN,
  confirmBooking,
  confirmDeadline,
  RELEASE_AFTER_MIN,
} from '@/lib/bookings'
import { useConflictGuard } from '@/lib/useConflictGuard'
import { Button, ErrorNote, Field, Modal, SelectField, TextArea } from '@/components/ui'
import { ConflictNote, DurationPicker } from '@/components/schedule/fields'
import { CheckIcon, ClockIcon, DoorIcon, UserIcon } from '@/components/icons'

// ---------------------------------------------------------------------------
// Новая бронь
// ---------------------------------------------------------------------------

/** Бронь кабинета без урока: репетиция, концерт, настройщик… */
export function BookingModal({
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
  defaultStart?: string
  defaultRoomId?: string | null
  onClose: () => void
  onDone: (date: string) => void
}) {
  const rooms = dir.rooms.filter((r) => r.is_active)
  const [roomId, setRoomId] = useState(defaultRoomId ?? (rooms.length === 1 ? rooms[0].id : ''))
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [start, setStart] = useState(defaultStart ?? '15:00')
  const [duration, setDuration] = useState(60)
  const [note, setNote] = useState('')
  const [autoRelease, setAutoRelease] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const guard = useConflictGuard(
    dir,
    roomId && date && start && duration > 0
      ? { teacherId: NO_TEACHER, roomId, dates: [date], start, duration }
      : null,
  )

  const missing = !roomId
    ? 'Выберите кабинет'
    : !title.trim()
      ? 'Напишите, для чего бронь'
      : !date
        ? 'Укажите дату'
        : !start
          ? 'Укажите время начала'
          : !(duration > 0)
            ? 'Укажите длительность'
            : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (missing) return
    setError(null)
    setBusy(true)
    const check = await guard.check()
    if (!check.ok) {
      setBusy(false)
      setError(check.error)
      return
    }
    // автора база подставит сама — тот, кто ставит бронь
    const { error } = await supabase.from('room_bookings').insert({
      studio_id: me.studio_id,
      room_id: roomId,
      date,
      start_time: start,
      duration_min: duration,
      title: title.trim(),
      note: note.trim() || null,
      auto_release: autoRelease,
    })
    if (error) {
      setBusy(false)
      setError(error.message)
      return
    }
    onDone(date)
  }

  return (
    <Modal title="Бронь кабинета" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <SelectField label="Кабинет" value={roomId} onChange={(e) => setRoomId(e.target.value)} required>
          <option value="" disabled>
            Выберите кабинет
          </option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </SelectField>

        <div>
          <Field
            label="Для чего"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Репетиция к концерту"
            required
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {BOOKING_TITLES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTitle(t)}
                aria-pressed={title === t}
                className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                  title === t
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <Field label="Дата" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
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
        <TextArea
          label="Заметка"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Кто будет, что подготовить…"
        />

        <label className="flex items-start gap-3 rounded-xl p-3 ring-1 ring-slate-200 dark:ring-slate-800">
          <input
            type="checkbox"
            checked={autoRelease}
            onChange={(e) => setAutoRelease(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-brand-600"
          />
          <span className="text-sm">
            <span className="block font-medium">Снять бронь, если её не подтвердят</span>
            <span className="block text-slate-500 dark:text-slate-400">
              Подтвердить «я в кабинете» можно за {CONFIRM_BEFORE_MIN} минут до начала и до{' '}
              {RELEASE_AFTER_MIN} минут после — в брони или на табло. Не подтвердили — кабинет
              освобождается. Для настройщика или ремонта галочку лучше снять.
            </span>
          </span>
        </label>

        {guard.conflicts && <ConflictNote conflicts={guard.conflicts} />}
        {error && <ErrorNote text={error} />}

        <div className="space-y-2">
          <Button type="submit" disabled={busy || !!missing} className="w-full">
            {busy ? 'Сохраняем…' : guard.conflicts ? 'Забронировать всё равно' : 'Забронировать'}
          </Button>
          {missing && !busy && (
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">{missing}</p>
          )}
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Карточка брони
// ---------------------------------------------------------------------------

export function BookingSheet({
  booking,
  dir,
  me,
  onClose,
  onChanged,
}: {
  booking: RoomBooking
  dir: Directory
  me: Profile
  onClose: () => void
  /** бронь подтвердили или сняли — перечитать */
  onChanged: () => void
}) {
  const [confirmRelease, setConfirmRelease] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const state = bookingState(booking)
  const room = dir.roomById.get(booking.room_id)?.name ?? 'Кабинет'
  const author = booking.created_by ? dir.profileById.get(booking.created_by)?.full_name : null
  const canRelease = me.role === 'director' || booking.created_by === me.id
  const opensAt = fromMinutes(toMinutes(booking.start_time) - CONFIRM_BEFORE_MIN)

  async function confirm() {
    setError(null)
    setBusy(true)
    const err = await confirmBooking(booking.id)
    setBusy(false)
    if (err) return setError(err)
    onChanged()
  }

  async function release() {
    setError(null)
    setBusy(true)
    const { error } = await supabase.from('room_bookings').delete().eq('id', booking.id)
    setBusy(false)
    if (error) return setError(error.message)
    onChanged()
  }

  const status: Record<typeof state, { text: string; cls: string }> = {
    fixed: { text: 'Подтверждать не нужно — бронь держится до конца.', cls: 'bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300' },
    confirmed: {
      text: `Подтверждена в ${booking.confirmed_at ? hhmm(new Date(booking.confirmed_at).toTimeString()) : ''}.`,
      cls: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
    },
    waiting: {
      text: `Подтвердить можно с ${opensAt} до ${confirmDeadline(booking)} в день брони — иначе она снимется.`,
      cls: 'bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300',
    },
    confirm_now: {
      text: `Пора подтвердить: до ${confirmDeadline(booking)}, иначе бронь снимется и кабинет освободится.`,
      cls: 'bg-amber-50 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900',
    },
    released: {
      text: `Снята: не подтвердили до ${confirmDeadline(booking)}. Кабинет свободен.`,
      cls: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
    },
  }

  return (
    <Modal title="Бронь кабинета" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-lg font-semibold leading-tight">{booking.title}</p>
        <ul className="space-y-2.5 text-sm">
          <li className="flex items-center gap-3">
            <DoorIcon className="size-5 shrink-0 text-slate-400" />
            {room}
          </li>
          <li className="flex items-center gap-3">
            <ClockIcon className="size-5 shrink-0 text-slate-400" />
            <span className="first-letter:uppercase">
              {formatDayLong(booking.date)}, {timeRange(booking.start_time, booking.duration_min)}
            </span>
          </li>
          {author && (
            <li className="flex items-center gap-3">
              <UserIcon className="size-5 shrink-0 text-slate-400" />
              Автор брони: {author}
            </li>
          )}
        </ul>
        {booking.note && (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800/60">{booking.note}</p>
        )}

        <p className={`rounded-xl px-4 py-3 text-sm ${status[state].cls}`}>{status[state].text}</p>

        {error && <ErrorNote text={error} />}

        {state === 'confirm_now' && (
          <Button type="button" disabled={busy} onClick={confirm} className="w-full">
            <CheckIcon className="size-5" />
            Подтвердить — я в кабинете
          </Button>
        )}

        {canRelease &&
          (confirmRelease ? (
            <div className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800/60">
              <p>Снять бронь? Кабинет освободится.</p>
              <div className="flex gap-2">
                <Button variant="danger" disabled={busy} onClick={release} className="flex-1">
                  Да, снять
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setConfirmRelease(false)} className="flex-1">
                  Нет
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="danger" disabled={busy} onClick={() => setConfirmRelease(true)} className="w-full">
              {state === 'released' ? 'Удалить снятую бронь' : 'Снять бронь'}
            </Button>
          ))}
      </div>
    </Modal>
  )
}
