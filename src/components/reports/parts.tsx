import type { CSSProperties, ReactNode } from 'react'
import type { Period, PeriodKind } from '@/lib/reports'
import { periodOf, shiftPeriod } from '@/lib/reports'
import { todayISO } from '@/lib/dates'
import { Card, Segmented } from '@/components/ui'
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons'

/** Выбор периода отчёта: «Неделя | Месяц» и листание. */
export function PeriodPicker({
  period,
  onChange,
}: {
  period: Period
  onChange: (p: Period) => void
}) {
  const today = todayISO()
  const isCurrent = period.from <= today && today <= period.to
  return (
    <Card className="space-y-2 p-3">
      <Segmented<PeriodKind>
        value={period.kind}
        onChange={(kind) => onChange(periodOf(kind, isCurrent ? today : period.from))}
        options={[
          { value: 'week', label: 'Неделя' },
          { value: 'month', label: 'Месяц' },
        ]}
      />
      <div className="flex items-center justify-between gap-2">
        <StepButton label="Назад" onClick={() => onChange(shiftPeriod(period, -1))}>
          <ChevronLeftIcon className="size-5" />
        </StepButton>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{period.label}</span>
          {!isCurrent && (
            <button
              type="button"
              onClick={() => onChange(periodOf(period.kind, today))}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-600 ring-1 ring-brand-200 transition hover:bg-brand-50 dark:text-brand-400 dark:ring-brand-800 dark:hover:bg-brand-950/40"
            >
              {period.kind === 'week' ? 'Эта неделя' : 'Этот месяц'}
            </button>
          )}
        </div>
        <StepButton label="Вперёд" onClick={() => onChange(shiftPeriod(period, 1))}>
          <ChevronRightIcon className="size-5" />
        </StepButton>
      </div>
    </Card>
  )
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      {children}
    </button>
  )
}

export type BarPart = { value: number; className?: string; style?: CSSProperties }

/** Горизонтальная полоска из частей; total — во сколько вписываем (по умолчанию сумма). */
export function StackBar({ parts, total }: { parts: BarPart[]; total?: number }) {
  const sum = total ?? parts.reduce((a, p) => a + p.value, 0)
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      {sum > 0 &&
        parts
          .filter((p) => p.value > 0)
          .map((p, i) => (
            <div
              key={i}
              className={`h-full ${p.className ?? ''}`}
              style={{ width: `${(p.value / sum) * 100}%`, ...p.style }}
            />
          ))}
    </div>
  )
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{children}</h3>
      {aside && <span className="text-xs text-slate-500 dark:text-slate-400">{aside}</span>}
    </div>
  )
}

/** Цветная точка легенды и подпись. */
export function Legend({ items }: { items: { label: string; className?: string; style?: CSSProperties }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className={`size-2 rounded-full ${i.className ?? ''}`} style={i.style} aria-hidden />
          {i.label}
        </span>
      ))}
    </div>
  )
}
