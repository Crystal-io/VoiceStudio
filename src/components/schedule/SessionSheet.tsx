import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import type { Directory } from '@/lib/directory'
import type { Attendance, AttendanceStatus, LessonSeries, Profile, Session, Student } from '@/lib/types'
import { formatDayMonth, timeRange, todayISO, weekdayOf, WEEKDAYS_EVERY, WEEKDAYS_SHORT } from '@/lib/dates'
import { loadAttendance, nobodyCame, rosterOf } from '@/lib/attendance'
import { loadBalances } from '@/lib/money'
import { lessonTitle, seriesColumns, teacherColor, toSeries } from '@/lib/schedule'
import { lessonTariff, money, rateFor, tariffTitle } from '@/lib/tariffs'
import { Button, ErrorNote, Modal, Spinner } from '@/components/ui'
import { AttendanceList } from '@/components/schedule/AttendanceList'
import { ParentContact } from '@/components/students/StudentCard'
import { AcceptPaymentSheet } from '@/components/cash/AcceptPaymentSheet'
import { CalendarIcon, ChevronDownIcon, ClockIcon, DoorIcon, RepeatIcon, WalletIcon } from '@/components/icons'

type Confirm = 'delete' | 'stop' | null

/** Подробности занятия и действия с ним. */
export function SessionSheet({
  session,
  dir,
  me,
  canEdit,
  onClose,
  onChanged,
  onAttendanceChanged,
  onMove,
  onEditSeries,
  onEditRoster,
}: {
  session: Session
  dir: Directory
  me: Profile
  canEdit: boolean
  onClose: () => void
  /** занятие изменилось или удалено — перечитать список */
  onChanged: () => void
  /** отметки посещаемости/оплаты изменились (список обновим при закрытии) */
  onAttendanceChanged: () => void
  onMove: () => void
  onEditSeries: (series: LessonSeries) => void
  /** «Изменить состав» — с текущими отметками занятия */
  onEditRoster: (rows: Attendance[]) => void
}) {
  const [series, setSeries] = useState<LessonSeries | null>(null)
  const [rows, setRows] = useState<Attendance[] | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session.series_id) return
    let alive = true
    void supabase
      .from('lesson_series')
      .select(seriesColumns)
      .eq('id', session.series_id)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setSeries(data ? toSeries(data) : null)
      })
    return () => {
      alive = false
    }
  }, [session.series_id])

  // отметки с ценой и что оплачено, балансы детей (педагогу — своих учеников)
  const [balances, setBalances] = useState<Map<string, number> | null>(null)
  const [paying, setPaying] = useState<Student | null>(null)
  const [moneyVersion, setMoneyVersion] = useState(0)

  useEffect(() => {
    let alive = true
    void (async () => {
      const att = await loadAttendance([session.id], { money: true })
      const list = att.bySession.get(session.id) ?? []
      const ids = rosterOf(session, dir, list).map((s) => s.id)
      const bal = await loadBalances(ids)
      if (!alive) return
      setRows(list)
      setBalances(bal.balances)
      if (att.error || bal.error) setError(att.error ?? bal.error)
    })()
    return () => {
      alive = false
    }
  }, [session, dir, moneyVersion])

  const teacher = dir.profileById.get(session.teacher_id)
  const room = session.room_id ? dir.roomById.get(session.room_id)?.name : null
  const cancelled = session.status === 'cancelled'
  // «проведено» / «не состоялось» база ставит сама по отметкам — здесь
  // повторяем это локально
  const done = rows ? rows.some((r) => r.status) : session.status === 'done' || session.status === 'missed'
  const missed = !cancelled && !!rows && nobodyCame(rows)
  const moved = !!session.occurrence_date && session.occurrence_date !== session.date
  const roster = rosterOf(session, dir, rows ?? [])
  // занятие с одним учеником — сразу под рукой контакт родителя
  const solo = !session.group_id && roster.length === 1 ? roster[0] : null

  /**
   * Сохранить отметки учеников. Без отметки строка удаляется. Цену при «Есть»
   * ставит база — после записи перечитываем суммы и что оплачено.
   */
  async function saveRows(studentIds: string[], status: AttendanceStatus | null) {
    const prev = rows ?? []
    const next: Attendance[] = studentIds.map((student_id) => ({
      session_id: session.id,
      student_id,
      status,
      amount: prev.find((r) => r.student_id === student_id)?.amount ?? null,
    }))
    const keep = status ? next : []
    const drop = status ? [] : studentIds
    setRows([...prev.filter((r) => !studentIds.includes(r.student_id)), ...keep])
    setError(null)

    const results = await Promise.all([
      keep.length > 0
        ? supabase.from('attendance').upsert(
            keep.map((r) => ({
              session_id: r.session_id,
              student_id: r.student_id,
              status: r.status,
              studio_id: session.studio_id,
            })),
            { onConflict: 'session_id,student_id' },
          )
        : null,
      drop.length > 0
        ? supabase
            .from('attendance')
            .delete()
            .eq('session_id', session.id)
            .in('student_id', drop)
        : null,
    ])
    const failed = results.find((r) => r?.error)?.error
    if (failed) {
      setRows(prev)
      setError(failed.message)
      return
    }
    setMoneyVersion((v) => v + 1)
    onAttendanceChanged()
  }

  const setStatus = (id: string, status: AttendanceStatus | null) => void saveRows([id], status)
  const allPresent = () =>
    void saveRows(
      roster.filter((s) => !rows?.find((r) => r.student_id === s.id)?.status).map((s) => s.id),
      'present',
    )

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>) {
    setError(null)
    setBusy(true)
    const { error } = await action()
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    onChanged()
  }

  function toggleCancelled() {
    void run(() =>
      supabase
        .from('sessions')
        .update({ status: cancelled ? 'scheduled' : 'cancelled' })
        .eq('id', session.id),
    )
  }

  async function deleteOneOff() {
    // занятие с отметками посещаемости не удаляем — их унесло бы каскадом
    const { count } = await supabase
      .from('attendance')
      .select('session_id', { count: 'exact', head: true })
      .eq('session_id', session.id)
    if (count) {
      setError('На занятии уже есть отметки посещения — его можно только отменить.')
      setConfirm(null)
      return
    }
    void run(() => supabase.from('sessions').delete().eq('id', session.id))
  }

  function stopSeries() {
    void run(() =>
      supabase.rpc('stop_series', { p_series: session.series_id, p_from: session.date }),
    )
  }

  return (
    <Modal
      title={lessonTitle(session, dir)}
      aside={
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: teacherColor(teacher) }}
            aria-hidden
          />
          <span className="truncate">{teacher?.full_name ?? 'Педагог'}</span>
        </span>
      }
      onClose={onClose}
    >
      <div className="space-y-4">
        {cancelled && (
          <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            Занятие отменено
          </div>
        )}

        {/* два столбца: когда | во сколько, где | как часто; педагог — в шапке */}
        <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <InfoRow icon={<CalendarIcon className="size-4" />}>
            {WEEKDAYS_SHORT[weekdayOf(session.date)]}, {formatDayMonth(session.date)}
            {moved && (
              <span className="block text-xs text-amber-600 dark:text-amber-400">
                перенесено с {formatDayMonth(session.occurrence_date!)}
              </span>
            )}
          </InfoRow>
          <InfoRow icon={<ClockIcon className="size-4" />}>
            {timeRange(session.start_time, session.duration_min)}
          </InfoRow>
          <InfoRow icon={<DoorIcon className="size-4" />}>{room ?? 'Без кабинета'}</InfoRow>
          <InfoRow icon={<RepeatIcon className="size-4" />} muted>
            {!session.series_id ? 'Разовое' : series ? seriesText(series) : 'Повторяется'}
          </InfoRow>
        </ul>
        {!cancelled && (
          <TariffLine
            session={session}
            dir={dir}
            canChange={me.role === 'director'}
            onChanged={onAttendanceChanged}
          />
        )}
        {solo && (solo.parent_name || solo.parent_phone) && <ParentContact student={solo} />}

        {!cancelled &&
          (rows ? (
            <AttendanceList
              roster={roster}
              rows={rows}
              balances={balances}
              currency={dir.studio.currency}
              canMarkStatus={canEdit && session.date <= todayISO()}
              canAccept={canEdit}
              onStatus={setStatus}
              onAccept={setPaying}
              onAllPresent={allPresent}
            />
          ) : (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ))}

        {/* под списком, а не над ним — чтобы строки не прыгали под пальцем */}
        {missed && (
          <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            <p className="font-semibold text-slate-800 dark:text-slate-100">
              Никто не пришёл — занятие не состоялось
            </p>
            <p className="mt-0.5">
              Оно не идёт в нагрузку педагога. Если кто-то всё же был — отметьте «Есть».
            </p>
          </div>
        )}

        {error && <ErrorNote text={error} />}

        {paying && (
          <AcceptPaymentSheet
            student={paying}
            dir={dir}
            me={me}
            onClose={() => setPaying(null)}
            onDone={() => {
              setPaying(null)
              setMoneyVersion((v) => v + 1)
              onAttendanceChanged()
            }}
          />
        )}

        {canEdit && confirm && (
          <div className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800/60">
            <p>
              {confirm === 'delete'
                ? 'Удалить это разовое занятие?'
                : `Остановить повторение? Это и все следующие занятия серии (с ${formatDayMonth(session.date)}) будут удалены. Прошедшие останутся.`}
            </p>
            <div className="flex gap-2">
              <Button
                variant="danger"
                disabled={busy}
                onClick={confirm === 'delete' ? deleteOneOff : stopSeries}
                className="flex-1"
              >
                {confirm === 'delete' ? 'Да, удалить' : 'Да, остановить'}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setConfirm(null)}
                className="flex-1"
              >
                Нет
              </Button>
            </div>
          </div>
        )}

        {canEdit && !confirm && (
          <div className="grid gap-2">
            <Button variant="ghost" disabled={busy || !rows} onClick={() => onEditRoster(rows ?? [])}>
              Изменить состав
            </Button>
            <Button variant="ghost" disabled={busy} onClick={onMove}>
              {cancelled ? 'Перенести на другое время' : 'Перенести это занятие'}
            </Button>
            {series && (
              <Button variant="ghost" disabled={busy} onClick={() => onEditSeries(series)}>
                Изменить расписание серии
              </Button>
            )}
            {!done && (
              <Button variant={cancelled ? 'ghost' : 'danger'} disabled={busy} onClick={toggleCancelled}>
                {cancelled ? 'Вернуть занятие' : 'Отменить занятие'}
              </Button>
            )}
            {session.series_id ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirm('stop')}
                className="py-2 text-sm font-medium text-rose-600 transition hover:underline dark:text-rose-400"
              >
                Остановить повторение
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirm('delete')}
                className="py-2 text-sm font-medium text-rose-600 transition hover:underline dark:text-rose-400"
              >
                Удалить занятие
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

/**
 * Тариф и цена занятия. Директор может поставить другой тариф того же вида —
 * начисления пришедших пересчитаются сами.
 */
function TariffLine({
  session,
  dir,
  canChange,
  onChanged,
}: {
  session: Session
  dir: Directory
  canChange: boolean
  onChanged: () => void
}) {
  const [tariffId, setTariffId] = useState(session.tariff_id)
  const [error, setError] = useState<string | null>(null)
  const isGroup = !!session.group_id || session.student_ids.length > 1
  const tariff = lessonTariff(dir, tariffId, isGroup, session.duration_min)
  const rate = tariff ? rateFor(dir, tariff.id, session.teacher_id, session.date) : null
  const currency = dir.studio.currency
  const options = dir.tariffs.filter(
    (t) => t.kind === (isGroup ? 'group' : 'private') && (t.is_active || t.id === tariff?.id),
  )

  async function change(id: string) {
    const prev = tariffId
    setTariffId(id)
    setError(null)
    const { error } = await supabase.from('sessions').update({ tariff_id: id }).eq('id', session.id)
    if (error) {
      setTariffId(prev)
      setError(error.message)
      return
    }
    onChanged()
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2 text-sm">
        <span className="flex h-5 w-4 shrink-0 items-center justify-center text-slate-400">
          <WalletIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 text-slate-700 dark:text-slate-200">
          {canChange && options.length > 1 ? (
            // список невидим поверх названия: нажали на тариф — выбор другого
            <span className="relative inline-flex max-w-full items-center gap-1 font-medium text-brand-600 dark:text-brand-400">
              <span className="truncate">{tariff ? tariffTitle(tariff) : 'Тарифа нет'}</span>
              <ChevronDownIcon className="size-4 shrink-0" />
              <select
                value={tariff?.id ?? ''}
                onChange={(e) => void change(e.target.value)}
                aria-label="Тариф занятия"
                className="absolute inset-0 cursor-pointer opacity-0"
              >
                {options.map((t) => (
                  <option key={t.id} value={t.id}>
                    {tariffTitle(t)}
                  </option>
                ))}
              </select>
            </span>
          ) : tariff ? (
            tariffTitle(tariff)
          ) : (
            'Тарифа нет'
          )}
          <span className="block text-xs text-slate-500 dark:text-slate-400">
            {rate
              ? `${money(rate.price, currency)} ${isGroup ? 'с каждого пришедшего' : 'за занятие'}${rate.special ? ' · особые условия педагога' : ''}`
              : '«Есть» начислится, когда появится подходящий тариф'}
          </span>
        </span>
      </div>
      {error && <ErrorNote text={error} />}
    </div>
  )
}

function InfoRow({
  icon,
  muted,
  children,
}: {
  icon: ReactNode
  muted?: boolean
  children: ReactNode
}) {
  return (
    <li className="flex items-start gap-2">
      <span className="flex h-5 w-4 shrink-0 items-center justify-center text-slate-400">
        {icon}
      </span>
      <span
        className={`min-w-0 flex-1 break-words ${
          muted ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-200'
        }`}
      >
        {children}
      </span>
    </li>
  )
}

/** «Каждый вторник», «Каждый вторник до 31 мая» — время уже в соседней клетке. */
function seriesText(s: LessonSeries): string {
  let text = WEEKDAYS_EVERY[s.weekday]
  if (s.end_date) text += ` до ${formatDayMonth(s.end_date)}`
  return text.charAt(0).toUpperCase() + text.slice(1)
}
