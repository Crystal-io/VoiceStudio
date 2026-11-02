import { useState } from 'react'
import type { Directory } from '@/lib/directory'
import type { Tariff } from '@/lib/types'
import { formatDayNum, todayISO } from '@/lib/dates'
import { baseRate, money, overrideOn, rateFor, tariffTitle } from '@/lib/tariffs'
import { Button, Card, EmptyState, Segmented } from '@/components/ui'
import { Pill, SplitBar, SplitLabels } from '@/components/cash/parts'
import { OverrideSheet, TariffSheet } from '@/components/cash/TariffSheets'
import { ArchiveIcon, ChevronDownIcon, ChevronRightIcon, PlusIcon, WalletIcon } from '@/components/icons'

type View = 'tariffs' | 'teachers'

type Sheet =
  | { kind: 'tariff'; tariff: Tariff | null }
  | { kind: 'override'; tariff: Tariff; teacherId: string | null }
  | null

/**
 * «Прайс и доли»: тарифы с раскладкой цены и особыми условиями педагогов —
 * по тарифам или по педагогам. Меняет только директор.
 */
export function PriceList({ dir, onChanged }: { dir: Directory; onChanged: () => Promise<void> }) {
  const [view, setView] = useState<View>('tariffs')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const active = dir.tariffs.filter((t) => t.is_active)
  const archived = dir.tariffs.filter((t) => !t.is_active)

  async function saved() {
    setSheet(null)
    await onChanged()
  }

  return (
    <div className="space-y-4">
      <Segmented<View>
        value={view}
        onChange={setView}
        options={[
          { value: 'tariffs', label: 'По тарифам' },
          { value: 'teachers', label: 'По педагогам' },
        ]}
      />
      <p className="px-1 text-sm text-slate-500 dark:text-slate-400">
        Сначала особые условия педагога, если их нет — общий тариф. Изменения действуют с выбранного
        дня; уже отмеченные занятия не пересчитываются.
      </p>

      {dir.tariffs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<WalletIcon className="size-6" />}
            title="Пока нет тарифов"
            hint="Заведите групповой и частные тарифы: цена с ребёнка и доля педагога. Занятия возьмут их сами по составу и длительности."
          />
        </Card>
      ) : view === 'tariffs' ? (
        <div className="space-y-3">
          {active.map((t) => (
            <TariffCard
              key={t.id}
              tariff={t}
              dir={dir}
              onOpen={() => setSheet({ kind: 'tariff', tariff: t })}
              onOverride={(teacherId) => setSheet({ kind: 'override', tariff: t, teacherId })}
            />
          ))}
        </div>
      ) : (
        <ByTeachers dir={dir} onOpen={(tariff, teacherId) => setSheet({ kind: 'override', tariff, teacherId })} />
      )}

      {view === 'tariffs' && (
        <Button variant="ghost" onClick={() => setSheet({ kind: 'tariff', tariff: null })} className="w-full">
          <PlusIcon className="size-5" />
          Новый тариф
        </Button>
      )}

      {view === 'tariffs' && archived.length > 0 && (
        <section className="space-y-2">
          <button
            type="button"
            onClick={() => setArchiveOpen(!archiveOpen)}
            className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-300"
          >
            <ArchiveIcon className="size-4" />
            Архив · {archived.length}
            <ChevronDownIcon className={`size-4 transition ${archiveOpen ? 'rotate-180' : ''}`} />
          </button>
          {archiveOpen && (
            <Card className="divide-y divide-slate-100 dark:divide-slate-800">
              {archived.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSheet({ kind: 'tariff', tariff: t })}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-slate-500 transition first:rounded-t-2xl last:rounded-b-2xl hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50"
                >
                  <span className="min-w-0 flex-1 truncate">{tariffTitle(t)}</span>
                  <ChevronRightIcon className="size-4 shrink-0 text-slate-300 dark:text-slate-600" />
                </button>
              ))}
            </Card>
          )}
        </section>
      )}

      {sheet?.kind === 'tariff' && (
        <TariffSheet tariff={sheet.tariff} dir={dir} onClose={() => setSheet(null)} onSaved={saved} />
      )}
      {sheet?.kind === 'override' && (
        <OverrideSheet
          tariff={sheet.tariff}
          teacherId={sheet.teacherId}
          dir={dir}
          onClose={() => setSheet(null)}
          onSaved={saved}
        />
      )}
    </div>
  )
}

/** Тариф: цена, раскладка, запланированное изменение и особые условия педагогов. */
function TariffCard({
  tariff,
  dir,
  onOpen,
  onOverride,
}: {
  tariff: Tariff
  dir: Directory
  onOpen: () => void
  onOverride: (teacherId: string | null) => void
}) {
  const today = todayISO()
  const currency = dir.studio.currency
  const rate = baseRate(dir, tariff.id, today)
  const next = (dir.ratesByTariff.get(tariff.id) ?? []).find((r) => r.valid_from > today)
  // у кого особые условия сейчас или с будущей даты
  const teacherIds = [
    ...new Set(dir.overrides.filter((o) => o.tariff_id === tariff.id).map((o) => o.teacher_id)),
  ]
  const special = teacherIds
    .map((id) => {
      const nowOv = overrideOn(dir, tariff.id, id, today)
      const future = dir.overrides.find(
        (o) => o.tariff_id === tariff.id && o.teacher_id === id && o.valid_from > today,
      )
      return { id, nowOv, future }
    })
    .filter((x) => x.nowOv || x.future)

  return (
    <Card>
      <button
        type="button"
        onClick={onOpen}
        className="block w-full space-y-2 rounded-t-2xl px-4 pb-2 pt-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <span className="flex items-start gap-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{tariffTitle(tariff)}</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              {tariff.kind === 'group' ? 'с каждого пришедшего' : 'один ребёнок'}
            </span>
          </span>
          <span className="text-lg font-semibold tabular-nums">{rate ? money(rate.price, currency) : '—'}</span>
        </span>
        {rate && (
          <>
            <SplitBar teacher={rate.teacher_share} studio={rate.price - rate.teacher_share} />
            <SplitLabels teacher={rate.teacher_share} studio={rate.price - rate.teacher_share} currency={currency} />
          </>
        )}
        {next && (
          <span className="block text-xs font-medium text-amber-600 dark:text-amber-400">
            с {formatDayNum(next.valid_from)} — {money(next.price, currency)} · педагогу{' '}
            {money(next.teacher_share, currency)}
          </span>
        )}
      </button>
      <div className="space-y-1 px-4 pb-3">
        {special.map(({ id, nowOv, future }) => {
          const r = rateFor(dir, tariff.id, id, today)
          const name = dir.profileById.get(id)?.full_name ?? 'Педагог'
          return (
            <button
              key={id}
              type="button"
              onClick={() => onOverride(id)}
              className="flex w-full items-center gap-2 border-l-2 border-brand-500 py-1 pl-2.5 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <span className="min-w-0 flex-1 truncate">{name}</span>
              <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                {nowOv && r
                  ? `${money(r.price, currency)} · ${r.teacherShare} / ${r.price - r.teacherShare} · с ${formatDayNum(nowOv.valid_from)}`
                  : future
                    ? `с ${formatDayNum(future.valid_from)}`
                    : ''}
              </span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => onOverride(null)}
          className="py-1 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400"
        >
          + особые условия
        </button>
      </div>
    </Card>
  )
}

/** Что действует у каждого педагога сейчас; нажатие — «Как у всех / Свои». */
function ByTeachers({
  dir,
  onOpen,
}: {
  dir: Directory
  onOpen: (tariff: Tariff, teacherId: string) => void
}) {
  const today = todayISO()
  const currency = dir.studio.currency
  const teachers = dir.profiles.filter((p) => p.is_active && p.role === 'teacher')
  const tariffs = dir.tariffs.filter((t) => t.is_active)

  if (teachers.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
        Педагогов пока нет — их добавляют в «Студии» → «Педагоги».
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {teachers.map((p) => (
        <Card key={p.id}>
          <h3 className="px-4 pb-1 pt-3 font-semibold">{p.full_name}</h3>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {tariffs.map((t) => {
              const r = rateFor(dir, t.id, p.id, today)
              const ov = overrideOn(dir, t.id, p.id, today)
              const label = !ov
                ? 'как у всех'
                : ov.price !== null && ov.teacher_share !== null
                  ? 'своя цена и доля'
                  : ov.price !== null
                    ? 'своя цена'
                    : 'своя доля'
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(t, p.id)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition last:rounded-b-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{tariffTitle(t)}</span>
                      <span className="block text-xs tabular-nums text-slate-500 dark:text-slate-400">
                        {r
                          ? `${money(r.price, currency)} · ${r.teacherShare} / ${r.price - r.teacherShare}`
                          : 'нет цены'}
                        {ov && ` · с ${formatDayNum(ov.valid_from)}`}
                      </span>
                    </span>
                    <Pill tone={ov ? 'brand' : 'neutral'}>{label}</Pill>
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
      ))}
    </div>
  )
}
