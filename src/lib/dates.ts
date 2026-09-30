// Даты и время для расписания. Дата — строка «ГГГГ-ММ-ДД» (как в БД),
// время — «ЧЧ:ММ» или «ЧЧ:ММ:СС». Всё в местном времени, без часовых поясов.
// Неделя начинается с понедельника: день недели 0 = Пн … 6 = Вс (как в БД).

export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export const WEEKDAYS_EVERY = [
  'каждый понедельник',
  'каждый вторник',
  'каждую среду',
  'каждый четверг',
  'каждую пятницу',
  'каждую субботу',
  'каждое воскресенье',
]

export function toISO(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayISO(): string {
  return toISO(new Date())
}

export function isISODate(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function addDays(iso: string, days: number): string {
  const d = fromISO(iso)
  d.setDate(d.getDate() + days)
  return toISO(d)
}

/** День недели: 0 = понедельник … 6 = воскресенье. */
export function weekdayOf(iso: string): number {
  return (fromISO(iso).getDay() + 6) % 7
}

export function startOfWeek(iso: string): string {
  return addDays(iso, -weekdayOf(iso))
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

/** Все даты от from до to (включительно), приходящиеся на дни недели weekdays. */
export function datesOnWeekdays(from: string, to: string, weekdays: number[]): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (weekdays.includes(weekdayOf(d))) out.push(d)
  }
  return out
}

const longDay = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
const shortDay = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
const shortWeekday = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

/** «вторник, 29 сентября» */
export function formatDayLong(iso: string): string {
  return longDay.format(fromISO(iso))
}

/** «29 сентября» */
export function formatDayMonth(iso: string): string {
  return dayMonth.format(fromISO(iso))
}

/** «29 сент.» */
export function formatDayShort(iso: string): string {
  return shortDay.format(fromISO(iso))
}

/** «вт, 29 сент.» */
export function formatDayWeekday(iso: string): string {
  return shortWeekday.format(fromISO(iso))
}

/** «28 сент. – 4 окт.» */
export function formatWeekRange(weekStart: string): string {
  return `${formatDayShort(weekStart)} – ${formatDayShort(addDays(weekStart, 6))}`
}

/** «15:00:00» → «15:00» */
export function hhmm(time: string): string {
  return time.slice(0, 5)
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function fromMinutes(total: number): string {
  const t = ((total % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/** «15:00–15:45» */
export function timeRange(start: string, durationMin: number): string {
  return `${hhmm(start)}–${fromMinutes(toMinutes(start) + durationMin)}`
}

// ---------------------------------------------------------------------------
// Месяцы — для отчётов
// ---------------------------------------------------------------------------

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

export function addMonths(iso: string, months: number): string {
  const d = fromISO(startOfMonth(iso))
  d.setMonth(d.getMonth() + months)
  return toISO(d)
}

export function endOfMonth(iso: string): string {
  return addDays(addMonths(iso, 1), -1)
}

const monthName = new Intl.DateTimeFormat('ru-RU', { month: 'long' })

/** «Сентябрь 2026» */
export function formatMonth(iso: string): string {
  const name = monthName.format(fromISO(iso))
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${iso.slice(0, 4)}`
}
