import type { InputHTMLAttributes, ReactNode } from 'react'
import { money } from '@/lib/tariffs'

// Мелкие части экранов кассы: раскладка цены, поле суммы, плашки.

/** Полоска «педагогу | студии» — сколько из цены кому. */
export function SplitBar({ teacher, studio }: { teacher: number; studio: number }) {
  return (
    <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
      {teacher > 0 && <i className="block bg-brand-500" style={{ flexGrow: teacher }} />}
      {studio > 0 && <i className="block bg-slate-400 dark:bg-slate-500" style={{ flexGrow: studio }} />}
    </div>
  )
}

/** Подписи под полоской: «педагогу 15 €» слева, «студии 10 €» справа. */
export function SplitLabels({
  teacher,
  studio,
  currency,
}: {
  teacher: number
  studio: number
  currency: string
}) {
  return (
    <div className="flex justify-between text-xs font-semibold tabular-nums">
      <span className="text-brand-600 dark:text-brand-400">педагогу {money(teacher, currency)}</span>
      <span className="text-slate-500 dark:text-slate-400">студии {money(studio, currency)}</span>
    </div>
  )
}

/** Поле суммы: цифровая клавиатура, крупные цифры. */
export function MoneyField({
  label,
  hint,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={`w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xl font-semibold tabular-nums outline-none transition placeholder:text-base placeholder:font-normal placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-950 ${className}`}
        {...props}
      />
      {hint && (
        <span className="mt-1.5 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {hint}
        </span>
      )}
    </label>
  )
}

type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'bad'

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300',
  ok: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  warn: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  bad: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
}

/** Плашка-метка: «как у всех», «своя доля», «Долг 25 €». */
export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${TONES[tone]}`}
    >
      {children}
    </span>
  )
}
