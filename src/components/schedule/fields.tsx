import type { Directory } from '@/lib/directory'
import type { Conflict } from '@/lib/schedule'
import { formatDayShort, WEEKDAYS_SHORT } from '@/lib/dates'
import { plural } from '@/lib/format'
import { money, pickTariff, rateFor, tariffTitle } from '@/lib/tariffs'
import { SelectField } from '@/components/ui'
import { AlertIcon } from '@/components/icons'

// Поля, общие для форм «новое занятие», «перенести», «изменить серию».

function FieldLabel({ children }: { children: string }) {
  return (
    <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
      {children}
    </span>
  )
}

function chipClass(on: boolean) {
  return `rounded-xl py-2 text-sm font-semibold transition ${
    on
      ? 'bg-brand-600 text-white'
      : 'text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800'
  }`
}

/** Дни недели: несколько (multiple) или ровно один. */
export function WeekdayPicker({
  value,
  onChange,
  multiple = false,
  label = 'День недели',
}: {
  value: number[]
  onChange: (value: number[]) => void
  multiple?: boolean
  label?: string
}) {
  function toggle(day: number) {
    if (!multiple) return onChange([day])
    const next = value.includes(day) ? value.filter((d) => d !== day) : [...value, day]
    onChange(next.sort())
  }
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS_SHORT.map((name, day) => (
          <button
            key={name}
            type="button"
            onClick={() => toggle(day)}
            aria-pressed={value.includes(day)}
            className={chipClass(value.includes(day))}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  )
}

const DURATIONS = [30, 45, 60, 90]

export function DurationPicker({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div>
      <FieldLabel>Длительность, мин</FieldLabel>
      <div className="flex gap-1.5">
        {DURATIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            aria-pressed={value === d}
            className={`flex-1 ${chipClass(value === d)}`}
          >
            {d}
          </button>
        ))}
        <input
          type="number"
          inputMode="numeric"
          min={5}
          max={480}
          step={5}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Другая длительность, минут"
          className="w-16 rounded-xl border border-slate-300 bg-white px-2 text-center text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-950"
        />
      </div>
    </div>
  )
}

export function TeacherSelect({
  dir,
  value,
  onChange,
}: {
  dir: Directory
  value: string
  onChange: (id: string) => void
}) {
  const options = dir.profiles.filter((p) => p.is_active || p.id === value)
  return (
    <SelectField label="Педагог" value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="" disabled>
        Выберите педагога
      </option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.full_name}
          {p.role === 'director' ? ' (директор)' : ''}
        </option>
      ))}
    </SelectField>
  )
}

export function RoomSelect({
  dir,
  value,
  onChange,
}: {
  dir: Directory
  value: string
  onChange: (id: string) => void
}) {
  const options = dir.rooms.filter((r) => r.is_active || r.id === value)
  return (
    <SelectField label="Кабинет" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Без кабинета</option>
      {options.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </SelectField>
  )
}

const clashLabel: Record<Conflict['clash'], string> = {
  teacher: 'Педагог занят',
  room: 'Кабинет занят',
  both: 'Педагог и кабинет заняты',
}

export function ConflictNote({ conflicts }: { conflicts: Conflict[] }) {
  return (
    <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900">
      <p className="flex items-center gap-2 font-semibold">
        <AlertIcon className="size-5 shrink-0" />
        Пересечения в расписании
      </p>
      <ul className="mt-2 space-y-2">
        {conflicts.map((c) => (
          <li key={c.key}>
            <p className="font-medium">
              {clashLabel[c.clash]} · {c.title}
            </p>
            <p className="text-amber-800 dark:text-amber-200/80">
              {c.when} · {c.teacher}
              {c.room ? ` · ${c.room}` : ''}
              {c.dates.length > 1
                ? ` · ${formatDayShort(c.dates[0])} и ещё ${plural(c.dates.length - 1, ['дата', 'даты', 'дат'])}`
                : c.recurring
                  ? ` · ${formatDayShort(c.dates[0])}`
                  : ''}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-amber-800 dark:text-amber-200/80">
        Поменяйте время, день или кабинет — или сохраните всё равно.
      </p>
    </div>
  )
}

/**
 * Тариф занятия. Подставляется сам по составу и длительности; директор может
 * выбрать другой того же вида (value — выбранный вручную, '' — сам). Педагог
 * видит, какой подставится, — выбирает тариф директор.
 */
export function TariffField({
  dir,
  isDirector,
  isGroup,
  duration,
  teacherId,
  date,
  value,
  onChange,
}: {
  dir: Directory
  isDirector: boolean
  isGroup: boolean
  duration: number
  teacherId: string
  date: string
  value: string
  onChange: (id: string) => void
}) {
  const kind = isGroup ? 'group' : 'private'
  const auto = pickTariff(dir, isGroup, duration)
  const manual = value ? dir.tariffById.get(value) : null
  const chosen = manual && manual.kind === kind ? manual : auto
  const rate = chosen ? rateFor(dir, chosen.id, teacherId || null, date) : null
  const currency = dir.studio.currency
  const hint = rate
    ? `${money(rate.price, currency)} ${isGroup ? 'с каждого пришедшего' : 'за занятие'}${
        teacherId ? ` · педагогу ${money(rate.teacherShare, currency)}` : ''
      }${rate.special ? ' (особые условия)' : ''}`
    : dir.tariffs.length === 0
      ? isDirector
        ? 'Тарифов пока нет — заведите их в «Касса» → «Прайс и доли».'
        : 'Тарифы заводит директор.'
      : `Нет ${isGroup ? 'группового' : 'частного'} тарифа — «Есть» начислится, когда он появится.`

  if (!isDirector) {
    return (
      <div>
        <FieldLabel>Тариф</FieldLabel>
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800/50">
          <span className="font-medium">{chosen ? tariffTitle(chosen) : 'Подберётся сам'}</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
        </p>
      </div>
    )
  }

  const options = dir.tariffs.filter((t) => t.kind === kind && (t.is_active || t.id === manual?.id))
  return (
    <div>
      <SelectField
        label="Тариф"
        value={manual && manual.kind === kind ? manual.id : ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{auto ? `${tariffTitle(auto)} — по составу` : 'Подберётся сам'}</option>
        {options
          .filter((t) => t.id !== auto?.id)
          .map((t) => (
            <option key={t.id} value={t.id}>
              {tariffTitle(t)}
            </option>
          ))}
      </SelectField>
      <span className="mt-1.5 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">{hint}</span>
    </div>
  )
}
