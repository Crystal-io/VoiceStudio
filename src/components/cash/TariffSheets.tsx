import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import type { Directory } from '@/lib/directory'
import type { Tariff, TariffKind } from '@/lib/types'
import { formatDate, todayISO } from '@/lib/dates'
import { plural } from '@/lib/format'
import { baseRate, KIND_LABEL, money, overrideOn, parseMoney, tariffTitle } from '@/lib/tariffs'
import { Button, ErrorNote, Field, Modal, Segmented, SelectField } from '@/components/ui'
import { DurationPicker } from '@/components/schedule/fields'
import { MoneyField, SplitBar, SplitLabels } from '@/components/cash/parts'
import { ArchiveIcon, TrashIcon } from '@/components/icons'

/** Число для поля ввода: 15 → «15», 12.5 → «12,5». */
const toText = (n: number | null | undefined) =>
  n === null || n === undefined ? '' : String(Math.round(n * 100) / 100).replace('.', ',')

/** Пример на знакомом случае: «Пришли 4 ребёнка: педагогу 60 €, студии 40 €». */
function Example({
  kind,
  teacher,
  studio,
  currency,
}: {
  kind: TariffKind
  teacher: number
  studio: number
  currency: string
}) {
  const [kids, setKids] = useState(4)
  if (kind === 'private') {
    return (
      <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:bg-brand-950/50 dark:text-brand-300">
        За занятие: педагогу {money(teacher, currency)}, студии {money(studio, currency)}
      </p>
    )
  }
  const step =
    'flex size-8 items-center justify-center rounded-lg text-lg font-semibold text-brand-600 transition hover:bg-brand-100 disabled:opacity-40 dark:text-brand-300 dark:hover:bg-brand-900/50'
  return (
    <div className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:bg-brand-950/50 dark:text-brand-300">
      <span className="min-w-0 flex-1" aria-live="polite">
        Пришли {plural(kids, ['ребёнок', 'ребёнка', 'детей'])}: педагогу{' '}
        {money(teacher * kids, currency)}, студии {money(studio * kids, currency)}
      </span>
      <button type="button" className={step} disabled={kids <= 1} onClick={() => setKids(kids - 1)} aria-label="Меньше детей">
        −
      </button>
      <button type="button" className={step} disabled={kids >= 20} onClick={() => setKids(kids + 1)} aria-label="Больше детей">
        +
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Тариф: вид, длительность, цена и доля педагога с даты
// ---------------------------------------------------------------------------

export function TariffSheet({
  tariff,
  dir,
  onClose,
  onSaved,
}: {
  /** null — новый тариф */
  tariff: Tariff | null
  dir: Directory
  onClose: () => void
  onSaved: () => void
}) {
  const today = todayISO()
  const currency = dir.studio.currency
  const current = tariff ? baseRate(dir, tariff.id, today) : null
  const history = tariff ? [...(dir.ratesByTariff.get(tariff.id) ?? [])].reverse() : []
  const special = tariff
    ? new Set(
        dir.overrides
          .filter((o) => o.tariff_id === tariff.id && overrideOn(dir, tariff.id, o.teacher_id, today))
          .map((o) => o.teacher_id),
      ).size
    : 0

  const [kind, setKind] = useState<TariffKind>(tariff?.kind ?? 'group')
  const [duration, setDuration] = useState(tariff?.duration_min ?? 60)
  const [name, setName] = useState(tariff?.name ?? '')
  const [price, setPrice] = useState(toText(current?.price))
  const [teacher, setTeacher] = useState(toText(current?.teacher_share))
  const [studio, setStudio] = useState(current ? toText(current.price - current.teacher_share) : '')
  const [from, setFrom] = useState(today)
  const [series, setSeries] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tariff) return
    let alive = true
    void supabase
      .from('lesson_series')
      .select('id', { count: 'exact', head: true })
      .eq('tariff_id', tariff.id)
      .eq('is_active', true)
      .or(`end_date.is.null,end_date.gte.${todayISO()}`)
      .then(({ count }) => {
        if (alive) setSeries(count ?? 0)
      })
    return () => {
      alive = false
    }
  }, [tariff])

  const p = parseMoney(price)
  const t = parseMoney(teacher)
  // поменяли цену или долю педагога — доля студии считается сама; вписали
  // долю студии — пересчитывается доля педагога
  function onPrice(v: string) {
    setPrice(v)
    const np = parseMoney(v)
    if (np !== null && t !== null) setStudio(toText(np - t))
  }
  function onTeacher(v: string) {
    setTeacher(v)
    const nt = parseMoney(v)
    if (p !== null && nt !== null) setStudio(toText(p - nt))
  }
  function onStudio(v: string) {
    setStudio(v)
    const ns = parseMoney(v)
    if (p !== null && ns !== null) setTeacher(toText(Math.max(p - ns, 0)))
  }

  const changedRate = !current || p !== current.price || t !== current.teacher_share
  const missing =
    p === null
      ? 'Впишите цену'
      : t === null
        ? 'Впишите долю педагога'
        : t > p
          ? 'Доля педагога больше цены'
          : !from
            ? 'Укажите, с какого дня'
            : !tariff && !(duration > 0)
              ? 'Укажите длительность'
              : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (missing || p === null || t === null) return
    setError(null)
    setBusy(true)
    let id = tariff?.id
    if (!tariff) {
      const { data, error } = await supabase
        .from('tariffs')
        .insert({ studio_id: dir.studio.id, kind, duration_min: duration, name: name.trim() || null })
        .select('id')
        .single()
      if (error) return fail(error.message)
      id = data.id as string
    } else if ((tariff.name ?? '') !== name.trim()) {
      const { error } = await supabase.from('tariffs').update({ name: name.trim() || null }).eq('id', tariff.id)
      if (error) return fail(error.message)
    }
    if (changedRate) {
      const { error } = await supabase
        .from('tariff_rates')
        .upsert(
          { tariff_id: id, studio_id: dir.studio.id, valid_from: from, price: p, teacher_share: t },
          { onConflict: 'tariff_id,valid_from' },
        )
      if (error) return fail(error.message)
    }
    onSaved()
  }

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>) {
    setError(null)
    setBusy(true)
    const { error } = await action()
    if (error) return fail(error.message)
    onSaved()
  }

  function fail(message: string) {
    setBusy(false)
    setError(message)
  }

  const title = tariff ? tariffTitle(tariff) : 'Новый тариф'
  const priceLabel = kind === 'group' ? 'Цена с ребёнка' : 'Цена занятия'

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {tariff && !tariff.is_active && (
          <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Тариф в архиве — новые занятия его не берут. История и начисления остаются.
          </div>
        )}

        {!tariff ? (
          <>
            <Segmented<TariffKind>
              value={kind}
              onChange={setKind}
              options={[
                { value: 'group', label: 'Группа' },
                { value: 'private', label: 'Частное' },
              ]}
            />
            <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">
              {kind === 'group'
                ? 'Группа или несколько детей: цена — с каждого пришедшего, доля педагога — тоже.'
                : 'Один ребёнок.'}
            </p>
            <DurationPicker value={duration} onChange={setDuration} />
          </>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {tariff.kind === 'group' ? 'С каждого пришедшего' : 'Один ребёнок'} · для всех педагогов
            {special > 0 && `, кроме особых условий у ${plural(special, ['педагога', 'педагогов', 'педагогов'])}`}
          </p>
        )}

        <Field
          label="Название (необязательно)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`${KIND_LABEL[kind]} · ${duration} мин`}
        />

        <MoneyField
          label={`${priceLabel}, ${currency === 'EUR' ? '€' : currency}`}
          value={price}
          onChange={(e) => onPrice(e.target.value)}
          placeholder="25"
        />
        <div className="grid grid-cols-2 gap-3">
          <MoneyField label="Педагогу" value={teacher} onChange={(e) => onTeacher(e.target.value)} placeholder="15" />
          <MoneyField label="Студии" value={studio} onChange={(e) => onStudio(e.target.value)} placeholder="10" />
        </div>
        {p !== null && t !== null && t <= p && (
          <div className="space-y-1.5">
            <SplitBar teacher={t} studio={p - t} />
            <SplitLabels teacher={t} studio={p - t} currency={currency} />
            <Example kind={tariff?.kind ?? kind} teacher={t} studio={p - t} currency={currency} />
          </div>
        )}

        <Field
          label="Действует с"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          required
          hint={
            tariff
              ? 'Занятия до этого дня — по прежней ставке. Уже отмеченные не пересчитываются.'
              : 'Занятия, отмеченные раньше этого дня, тоже возьмут эту ставку, пока нет более ранней.'
          }
        />

        {tariff && series !== null && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Сейчас по тарифу {plural(series, ['серия занятий', 'серии занятий', 'серий занятий'])}; разовые занятия и
            серии без тарифа берут его сами по составу и длительности.
          </p>
        )}

        {history.length > 0 && (
          <section className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">История</h3>
            <ul className="divide-y divide-slate-100 rounded-xl text-sm ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-800">
              {history.map((r) => {
                const future = r.valid_from > today
                return (
                  <li key={r.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 tabular-nums">
                      с {formatDate(r.valid_from)} — {money(r.price, currency)} ·{' '}
                      {toText(r.teacher_share)} / {toText(r.price - r.teacher_share)}
                      {future && (
                        <span className="ml-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                          запланировано
                        </span>
                      )}
                      {current?.id === r.id && (
                        <span className="ml-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          сейчас
                        </span>
                      )}
                    </span>
                    {future && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(() => supabase.from('tariff_rates').delete().eq('id', r.id))}
                        aria-label="Отменить запланированное изменение"
                        className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                      >
                        <TrashIcon className="size-4" />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {error && <ErrorNote text={error} />}

        <div className="space-y-2">
          <Button type="submit" disabled={busy || !!missing} className="w-full">
            {busy ? 'Сохраняем…' : tariff ? 'Сохранить' : 'Добавить тариф'}
          </Button>
          {missing && !busy && (
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">{missing}</p>
          )}
        </div>
        {tariff && (
          <Button
            type="button"
            variant={tariff.is_active ? 'danger' : 'ghost'}
            disabled={busy}
            onClick={() => run(() => supabase.from('tariffs').update({ is_active: !tariff.is_active }).eq('id', tariff.id))}
            className="w-full"
          >
            <ArchiveIcon className="size-5" />
            {tariff.is_active ? 'В архив' : 'Вернуть из архива'}
          </Button>
        )}
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Особые условия педагога: своя цена и/или доля с даты
// ---------------------------------------------------------------------------

type Mode = 'same' | 'own'

export function OverrideSheet({
  tariff,
  teacherId: fixedTeacher,
  dir,
  onClose,
  onSaved,
}: {
  tariff: Tariff
  /** null — педагога выбирают в шторке */
  teacherId: string | null
  dir: Directory
  onClose: () => void
  onSaved: () => void
}) {
  const today = todayISO()
  const currency = dir.studio.currency
  const teachers = dir.profiles.filter((x) => x.is_active && x.role === 'teacher')
  const [teacherId, setTeacherId] = useState(fixedTeacher ?? '')
  const [from, setFrom] = useState(today)
  const base = baseRate(dir, tariff.id, from || today)
  const now = teacherId ? overrideOn(dir, tariff.id, teacherId, today) : null
  const [mode, setMode] = useState<Mode>(now ? 'own' : 'same')
  const [price, setPrice] = useState(toText(now?.price))
  const [share, setShare] = useState(toText(now?.teacher_share))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const history = [...dir.overrides]
    .filter((o) => o.tariff_id === tariff.id && o.teacher_id === teacherId)
    .reverse()

  function pickTeacher(id: string) {
    setTeacherId(id)
    const ov = id ? overrideOn(dir, tariff.id, id, today) : null
    setMode(ov ? 'own' : 'same')
    setPrice(toText(ov?.price))
    setShare(toText(ov?.teacher_share))
  }

  const p = parseMoney(price)
  const s = parseMoney(share)
  const badText = (price.trim() !== '' && p === null) || (share.trim() !== '' && s === null)
  const effPrice = p ?? base?.price ?? 0
  const effShare = Math.min(s ?? base?.teacher_share ?? 0, effPrice)
  const missing = !teacherId
    ? 'Выберите педагога'
    : !base
      ? 'У тарифа ещё нет цены'
      : !from
        ? 'Укажите, с какого дня'
        : mode === 'own' && p === null && s === null
          ? 'Впишите свою цену или долю — или выберите «Как у всех»'
          : badText
            ? 'Проверьте суммы'
            : mode === 'own' && (s ?? base.teacher_share) > effPrice
              ? 'Доля педагога больше цены'
              : mode === 'same' && !now && !history.some((o) => o.valid_from > today)
                ? 'Сейчас и так как у всех'
                : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (missing) return
    setError(null)
    setBusy(true)
    const { error } = await supabase.from('tariff_overrides').upsert(
      {
        tariff_id: tariff.id,
        teacher_id: teacherId,
        studio_id: dir.studio.id,
        valid_from: from,
        price: mode === 'own' ? p : null,
        teacher_share: mode === 'own' ? s : null,
      },
      { onConflict: 'tariff_id,teacher_id,valid_from' },
    )
    if (error) {
      setBusy(false)
      setError(error.message)
      return
    }
    onSaved()
  }

  async function cancelFuture(id: string) {
    setError(null)
    setBusy(true)
    const { error } = await supabase.from('tariff_overrides').delete().eq('id', id)
    if (error) {
      setBusy(false)
      setError(error.message)
      return
    }
    onSaved()
  }

  const teacher = teacherId ? dir.profileById.get(teacherId) : null

  return (
    <Modal
      title={tariffTitle(tariff)}
      aside={fixedTeacher && teacher ? <span className="truncate text-sm text-slate-600 dark:text-slate-300">{teacher.full_name}</span> : undefined}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        {!fixedTeacher && (
          <SelectField label="Педагог" value={teacherId} onChange={(e) => pickTeacher(e.target.value)}>
            <option value="">Выберите педагога</option>
            {teachers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.full_name}
              </option>
            ))}
          </SelectField>
        )}

        {base && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            У всех: {money(base.price, currency)} · педагогу {money(base.teacher_share, currency)}, студии{' '}
            {money(base.price - base.teacher_share, currency)}
          </p>
        )}

        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { value: 'same', label: 'Как у всех' },
            { value: 'own', label: 'Свои' },
          ]}
        />

        {mode === 'own' && base && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <MoneyField
                label={tariff.kind === 'group' ? 'Цена с ребёнка' : 'Цена занятия'}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={`как у всех · ${toText(base.price)}`}
              />
              <MoneyField
                label="Педагогу"
                value={share}
                onChange={(e) => setShare(e.target.value)}
                placeholder={`как у всех · ${toText(base.teacher_share)}`}
              />
            </div>
            <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">
              Пустое поле — как у всех: поднимут общую цену — она поднимется и здесь.
            </p>
            <div className="space-y-1.5">
              <SplitBar teacher={effShare} studio={effPrice - effShare} />
              <SplitLabels teacher={effShare} studio={effPrice - effShare} currency={currency} />
              <Example kind={tariff.kind} teacher={effShare} studio={effPrice - effShare} currency={currency} />
            </div>
          </>
        )}

        <Field
          label="Действует с"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          required
          hint="Уже отмеченные занятия не пересчитываются."
        />

        {history.length > 0 && (
          <section className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">История</h3>
            <ul className="divide-y divide-slate-100 rounded-xl text-sm ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-800">
              {history.map((o) => {
                const future = o.valid_from > today
                const parts = [
                  o.price !== null ? `цена ${money(o.price, currency)}` : null,
                  o.teacher_share !== null ? `педагогу ${money(o.teacher_share, currency)}` : null,
                ].filter(Boolean)
                return (
                  <li key={o.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      с {formatDate(o.valid_from)} — {parts.length ? parts.join(', ') : 'как у всех'}
                      {future && (
                        <span className="ml-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                          запланировано
                        </span>
                      )}
                    </span>
                    {future && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => cancelFuture(o.id)}
                        aria-label="Отменить запланированное изменение"
                        className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                      >
                        <TrashIcon className="size-4" />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {error && <ErrorNote text={error} />}

        <div className="space-y-2">
          <Button type="submit" disabled={busy || !!missing} className="w-full">
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </Button>
          {missing && !busy && (
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">{missing}</p>
          )}
        </div>
      </form>
    </Modal>
  )
}
