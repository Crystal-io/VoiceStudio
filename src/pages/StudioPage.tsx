import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/lib/profile'
import { useDirectory, type Directory } from '@/lib/directory'
import { formatDayWeekday, hhmm, todayISO } from '@/lib/dates'
import { Button, Card, ErrorNote, Field, Spinner } from '@/components/ui'
import { WeekdayPicker } from '@/components/schedule/fields'
import { PlusIcon, TrashIcon } from '@/components/icons'

/** Государственные праздники РФ (ст. 112 ТК) — без ежегодных переносов выходных. */
function russianHolidays(year: number): { date: string; name: string }[] {
  const d = (m: number, day: number) => `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return [
    ...[1, 2, 3, 4, 5, 6, 8].map((day) => ({ date: d(1, day), name: 'Новогодние каникулы' })),
    { date: d(1, 7), name: 'Рождество Христово' },
    { date: d(2, 23), name: 'День защитника Отечества' },
    { date: d(3, 8), name: 'Международный женский день' },
    { date: d(5, 1), name: 'Праздник Весны и Труда' },
    { date: d(5, 9), name: 'День Победы' },
    { date: d(6, 12), name: 'День России' },
    { date: d(11, 4), name: 'День народного единства' },
  ]
}

/** Студия: часы работы (от них считается загрузка кабинетов) и праздники. */
export function StudioPage() {
  const { profile } = useProfile()
  const { dir, error, reload } = useDirectory()

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Студия</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Часы работы — для загрузки кабинетов, праздники — пометки в календаре.
        </p>
      </div>
      {error && <ErrorNote text={error} />}
      {!dir || !profile ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <>
          <HoursCard key={`${dir.studio.open_time}${dir.studio.close_time}${dir.studio.work_days}`} dir={dir} onSaved={reload} />
          <HolidaysCard dir={dir} studioId={profile.studio_id} onChanged={reload} />
        </>
      )}
    </div>
  )
}

function HoursCard({ dir, onSaved }: { dir: Directory; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(hhmm(dir.studio.open_time))
  const [close, setClose] = useState(hhmm(dir.studio.close_time))
  const [days, setDays] = useState(dir.studio.work_days)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const invalid = !open || !close || close <= open || days.length === 0
  const changed =
    open !== hhmm(dir.studio.open_time) ||
    close !== hhmm(dir.studio.close_time) ||
    days.join() !== dir.studio.work_days.join()

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (invalid) return
    setError(null)
    setBusy(true)
    const { error } = await supabase
      .from('studios')
      .update({ open_time: open, close_time: close, work_days: days })
      .eq('id', dir.studio.id)
    setBusy(false)
    if (error) return setError(error.message)
    setSaved(true)
    await onSaved()
  }

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="space-y-4">
        <h3 className="font-semibold">Часы работы</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Открытие" type="time" step={900} value={open} onChange={(e) => setOpen(e.target.value)} required />
          <Field label="Закрытие" type="time" step={900} value={close} onChange={(e) => setClose(e.target.value)} required />
        </div>
        <WeekdayPicker multiple label="Рабочие дни" value={days} onChange={setDays} />
        {error && <ErrorNote text={error} />}
        <div className="space-y-1.5">
          <Button type="submit" disabled={busy || invalid || !changed} className="w-full">
            {busy ? 'Сохраняем…' : 'Сохранить часы'}
          </Button>
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            {invalid
              ? close <= open
                ? 'Закрытие должно быть позже открытия'
                : 'Выберите хотя бы один рабочий день'
              : saved && !changed
                ? 'Сохранено'
                : 'Загрузка кабинета — доля занятого времени от этих часов.'}
          </p>
        </div>
      </form>
    </Card>
  )
}

function HolidaysCard({
  dir,
  studioId,
  onChanged,
}: {
  dir: Directory
  studioId: string
  onChanged: () => Promise<void>
}) {
  const thisYear = Number(todayISO().slice(0, 4))
  const [year, setYear] = useState(thisYear)
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const list = [...dir.holidays]
    .filter(([d]) => d.startsWith(String(year)))
    .sort(([a], [b]) => (a < b ? -1 : 1))
  const missingState = russianHolidays(year).filter((h) => !dir.holidays.has(h.date)).length

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>) {
    setError(null)
    setBusy(true)
    const { error } = await action()
    setBusy(false)
    if (error) {
      setError(error.message.includes('duplicate') ? 'На эту дату праздник уже есть.' : error.message)
      return false
    }
    await onChanged()
    return true
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!date || !name.trim()) return
    const ok = await run(() =>
      supabase.from('holidays').insert({ studio_id: studioId, date, name: name.trim() }),
    )
    if (ok) {
      setDate('')
      setName('')
      if (!date.startsWith(String(year))) setYear(Number(date.slice(0, 4)))
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Праздники</h3>
        <div className="flex gap-1">
          {[thisYear, thisYear + 1].map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              aria-pressed={y === year}
              className={`rounded-lg px-2.5 py-1 text-sm font-semibold transition ${
                y === year
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Праздник только помечается в расписании и на табло — занятия и брони в этот день идут как
        обычно.
      </p>

      {list.length > 0 ? (
        <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-800">
          {list.map(([d, n]) => (
            <li key={d} className="flex items-center gap-3 px-3 py-2">
              <span className="w-24 shrink-0 text-sm text-rose-600 first-letter:uppercase dark:text-rose-400">
                {formatDayWeekday(d)}
              </span>
              <span className="min-w-0 flex-1 truncate">{n}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => supabase.from('holidays').delete().eq('date', d))}
                aria-label={`Удалить: ${n}`}
                className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
              >
                <TrashIcon className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
          На {year} год праздников пока нет.
        </p>
      )}

      {missingState > 0 && (
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          className="w-full"
          onClick={() =>
            void run(() =>
              supabase.from('holidays').upsert(
                russianHolidays(year).map((h) => ({ ...h, studio_id: studioId })),
                { onConflict: 'studio_id,date', ignoreDuplicates: true },
              ),
            )
          }
        >
          Добавить праздники РФ на {year} ({missingState})
        </Button>
      )}

      <form onSubmit={add} className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
          <Field label="Дата" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <Field
            label="Название"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Отчётный концерт"
            required
          />
        </div>
        {error && <ErrorNote text={error} />}
        <Button type="submit" variant="ghost" disabled={busy || !date || !name.trim()} className="w-full">
          <PlusIcon className="size-5" />
          Добавить праздник
        </Button>
      </form>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Ежегодные переносы выходных правительство объявляет отдельно — их можно добавить вручную.
      </p>
    </Card>
  )
}
