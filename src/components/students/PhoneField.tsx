import type { Student } from '@/lib/types'
import {
  allCountries,
  countryByIso,
  lastCountry,
  rememberCountry,
  splitPhone,
} from '@/lib/phone'
import { ChevronDownIcon } from '@/components/icons'

/** Номер в форме: страна отдельно, остальное — как ввели. */
export type PhoneValue = { iso: string | null; rest: string }

/**
 * Начальное значение поля: из сохранённого номера, а для нового — страна,
 * выбранная в прошлый раз, или самая частая среди номеров студии.
 */
export function initialPhone(phone: string | null, students: Student[]): PhoneValue {
  if (phone) return splitPhone(phone)
  return { iso: lastCountry() ?? usedCountries(students)[0] ?? null, rest: '' }
}

/** Что не так с номером (null — всё в порядке или номер не указан). */
export function phoneProblem(v: PhoneValue): string | null {
  const digits = v.rest.replace(/\D/g, '')
  if (!digits) return null
  if (!v.iso) return 'Выберите страну — без кода не написать в WhatsApp.'
  const total = (countryByIso(v.iso)?.dial.length ?? 0) + digits.length
  if (digits.length < 5) return 'Похоже, в номере не хватает цифр.'
  if (total > 15) return 'Похоже, в номере лишние цифры.'
  return null
}

/** Страны из номеров студии — от самой частой. */
function usedCountries(students: Student[]): string[] {
  const count = new Map<string, number>()
  for (const s of students) {
    const { iso } = splitPhone(s.parent_phone)
    if (iso) count.set(iso, (count.get(iso) ?? 0) + 1)
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([iso]) => iso)
}

/**
 * Телефон родителя: страна с флагом (выпадающий список) и номер. Вставили
 * номер с «+» целиком — страна выберется сама.
 */
export function PhoneField({
  label,
  value,
  onChange,
  students,
}: {
  label: string
  value: PhoneValue
  onChange: (v: PhoneValue) => void
  /** ученики студии — их страны идут в начале списка */
  students: Student[]
}) {
  const country = countryByIso(value.iso)
  const problem = phoneProblem(value)
  const all = allCountries()
  const top = [...new Set([value.iso, lastCountry(), ...usedCountries(students)])]
    .map((iso) => countryByIso(iso))
    .filter((c) => !!c)
    .slice(0, 5)

  function setRest(rest: string) {
    // целый номер с кодом страны — разбираем сразу
    if (/^\s*(\+|00)/.test(rest)) {
      const parsed = splitPhone(rest)
      if (parsed.iso) {
        rememberCountry(parsed.iso)
        onChange(parsed)
        return
      }
    }
    onChange({ ...value, rest })
  }

  function setIso(iso: string) {
    rememberCountry(iso)
    onChange({ ...value, iso })
  }

  const option = (c: (typeof all)[number]) => (
    <option key={c.iso} value={c.iso}>
      {c.flag} {c.name} +{c.dial}
    </option>
  )

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </span>
      <div className="flex gap-2">
        {/* настоящий список невидим поверх: на телефоне откроется системный выбор */}
        <div className="relative w-[6.75rem] shrink-0">
          <select
            value={value.iso ?? ''}
            onChange={(e) => setIso(e.target.value)}
            aria-label="Страна"
            className="peer absolute inset-0 z-10 w-full cursor-pointer opacity-0"
          >
            <option value="" disabled>
              Страна
            </option>
            {top.length > 0 && <optgroup label="Часто">{top.map(option)}</optgroup>}
            <optgroup label="Все страны">{all.map(option)}</optgroup>
          </select>
          <div
            className={`flex h-full items-center gap-1.5 rounded-xl border bg-white py-3 pl-3 pr-2 text-base transition peer-focus-visible:border-brand-500 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/30 dark:bg-slate-950 ${
              problem && !value.iso
                ? 'border-rose-400 dark:border-rose-700'
                : 'border-slate-300 dark:border-slate-700'
            }`}
            aria-hidden
          >
            {country ? (
              <>
                <span className="text-lg leading-none">{country.flag}</span>
                <span className="tabular-nums">+{country.dial}</span>
              </>
            ) : (
              <span className="text-slate-400">Страна</span>
            )}
            <ChevronDownIcon className="ml-auto size-4 shrink-0 text-slate-400" />
          </div>
        </div>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={value.rest}
          onChange={(e) => setRest(e.target.value)}
          placeholder="151 234 5678"
          aria-label="Номер"
          className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-950"
        />
      </div>
      {problem && (
        <span className="mt-1.5 block text-xs leading-relaxed text-rose-600 dark:text-rose-400">
          {problem}
        </span>
      )}
    </div>
  )
}
