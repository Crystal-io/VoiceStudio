import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import type { Directory } from '@/lib/directory'
import type { Attendance, Payment, Profile, Session, Student } from '@/lib/types'
import { addDays, formatDayLong, fromISO, hhmm, todayISO } from '@/lib/dates'
import { came, loadAttendance, rosterOf } from '@/lib/attendance'
import { loadSessions, lessonTitle } from '@/lib/schedule'
import { METHOD_LABEL, paymentColumns, unpaid } from '@/lib/money'
import { money } from '@/lib/tariffs'
import { Card, ErrorNote, Spinner } from '@/components/ui'
import { Pill } from '@/components/cash/parts'
import { StudentCardModal } from '@/components/students/StudentCard'
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons'

type DayData = {
  payments: Payment[]
  sessions: Session[]
  bySession: Map<string, Attendance[]>
  /** доля педагога за день: id педагога → сумма (директору — все, педагогу — своя) */
  shares: Map<string, number>
}

/**
 * Касса дня — как страница дневника: сколько принято и кем, начислено и не
 * оплачено за день, занятия по педагогам с тем, кто из детей оплатил.
 * Педагогу — только его занятия и принятые им деньги.
 */
export function CashDay({ dir, me, onMoneyChanged }: { dir: Directory; me: Profile; onMoneyChanged?: () => void }) {
  const isDirector = me.role === 'director'
  const currency = dir.studio.currency
  const [date, setDate] = useState(todayISO())
  const [data, setData] = useState<(DayData & { date: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [open, setOpen] = useState<Student | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      // границы дня — по часам устройства
      const from = fromISO(date)
      const to = fromISO(addDays(date, 1))
      let pq = supabase
        .from('payments')
        .select(paymentColumns)
        .gte('received_at', from.toISOString())
        .lt('received_at', to.toISOString())
        .order('received_at')
      if (!isDirector) pq = pq.eq('received_by', me.id)
      const [pay, ses] = await Promise.all([pq, loadSessions(date, date, isDirector ? undefined : me.id)])
      const live = ses.sessions.filter((s) => s.status !== 'cancelled')
      const ids = live.map((s) => s.id)
      const [att, acc] = await Promise.all([
        loadAttendance(ids, { money: true }),
        ids.length
          ? supabase.from('teacher_accruals').select('session_id, teacher_id, amount').in('session_id', ids)
          : null,
      ])
      const shares = new Map<string, number>()
      for (const a of (acc?.data as { teacher_id: string; amount: number }[] | null) ?? []) {
        shares.set(a.teacher_id, (shares.get(a.teacher_id) ?? 0) + Number(a.amount))
      }
      if (!alive) return
      setData({ date, payments: (pay.data as Payment[]) ?? [], sessions: live, bySession: att.bySession, shares })
      setError(pay.error?.message ?? ses.error ?? att.error ?? acc?.error?.message ?? null)
    })()
    return () => {
      alive = false
    }
  }, [date, version, isDirector, me.id])

  const today = todayISO()
  const live = data?.date === date ? data : null
  const taken = live?.payments.filter((p) => !p.cancelled_at) ?? []
  const sum = (list: Payment[]) => list.reduce((n, p) => n + Number(p.amount), 0)
  const rows = live ? [...live.bySession.values()].flat() : []
  const charged = rows.reduce((n, r) => n + Number(r.amount ?? 0), 0)
  const owed = rows.reduce(
    (n, r) => n + (r.amount !== null && r.covered !== undefined ? unpaid({ amount: r.amount, covered: r.covered }) : 0),
    0,
  )

  // занятия по педагогам: директору — все, педагогу — свои
  const teachers = live
    ? [...new Set(live.sessions.map((s) => s.teacher_id))].map((id) => ({
        teacher: dir.profileById.get(id),
        id,
        sessions: live.sessions.filter((s) => s.teacher_id === id),
      }))
    : []

  return (
    <div className="space-y-4">
      <Card className="flex items-center justify-between gap-2 p-2">
        <StepButton label="Предыдущий день" onClick={() => setDate(addDays(date, -1))}>
          <ChevronLeftIcon className="size-5" />
        </StepButton>
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold first-letter:uppercase">{formatDayLong(date)}</span>
          {date !== today && (
            <button
              type="button"
              onClick={() => setDate(today)}
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-brand-600 ring-1 ring-brand-200 transition hover:bg-brand-50 dark:text-brand-400 dark:ring-brand-800 dark:hover:bg-brand-950/40"
            >
              Сегодня
            </button>
          )}
        </div>
        <StepButton label="Следующий день" onClick={() => setDate(addDays(date, 1))}>
          <ChevronRightIcon className="size-5" />
        </StepButton>
      </Card>

      {error && <ErrorNote text={error} />}

      {!live ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat
              value={money(sum(taken), currency)}
              label={isDirector ? 'принято' : 'принято мной'}
              note={
                taken.length
                  ? `нал. ${money(sum(taken.filter((p) => p.method === 'cash')), currency)}`
                  : undefined
              }
            />
            <Stat value={money(charged, currency)} label="начислено" />
            <Stat value={money(owed, currency)} label="не оплачено" bad={owed > 0} />
          </div>

          <section className="space-y-2">
            <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {isDirector ? 'Оплаты за день' : 'Принято мной'}
            </h3>
            {live.payments.length === 0 ? (
              <p className="px-1 text-sm text-slate-500 dark:text-slate-400">Оплат за этот день нет.</p>
            ) : (
              <Card className="divide-y divide-slate-100 dark:divide-slate-800">
                {live.payments.map((p) => {
                  const student = dir.studentById.get(p.student_id)
                  const gone = !!p.cancelled_at
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => student && setOpen(student)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition first:rounded-t-2xl last:rounded-b-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <span className="w-11 shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                        {new Date(p.received_at).toTimeString().slice(0, 5)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm font-medium ${gone ? 'text-slate-400 line-through' : ''}`}>
                          {student?.full_name ?? 'Ученик'}
                        </span>
                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                          {gone
                            ? `отменена: ${p.cancel_reason ?? ''}`
                            : [METHOD_LABEL[p.method], isDirector ? dir.profileById.get(p.received_by)?.full_name : null]
                                .filter(Boolean)
                                .join(' · ')}
                        </span>
                      </span>
                      <span className={`shrink-0 text-sm font-semibold tabular-nums ${gone ? 'text-slate-400' : ''}`}>
                        {money(Number(p.amount), currency)}
                      </span>
                    </button>
                  )
                })}
              </Card>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Занятия</h3>
            {teachers.length === 0 ? (
              <p className="px-1 text-sm text-slate-500 dark:text-slate-400">Занятий в этот день нет.</p>
            ) : (
              teachers.map(({ id, teacher, sessions }) => (
                <Card key={id} className="space-y-1 p-3">
                  <div className="flex items-baseline justify-between gap-2 px-1">
                    <span className="truncate font-semibold">{teacher?.full_name ?? 'Педагог'}</span>
                    {live.shares.has(id) && (
                      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                        доля за день {money(live.shares.get(id) ?? 0, currency)}
                      </span>
                    )}
                  </div>
                  {sessions.map((s) => (
                    <LessonMoney
                      key={s.id}
                      session={s}
                      dir={dir}
                      rows={live.bySession.get(s.id) ?? []}
                      onOpen={setOpen}
                    />
                  ))}
                </Card>
              ))
            )}
          </section>
        </>
      )}

      {open && (
        <StudentCardModal
          student={open}
          dir={dir}
          me={me}
          initialTab="money"
          onClose={() => setOpen(null)}
          onChanged={() => setOpen(null)}
          onMoneyChanged={() => {
            setVersion((v) => v + 1)
            onMoneyChanged?.()
          }}
        />
      )}
    </div>
  )
}

/** Занятие в кассе дня: дети и что с их деньгами. */
function LessonMoney({
  session,
  dir,
  rows,
  onOpen,
}: {
  session: Session
  dir: Directory
  rows: Attendance[]
  onOpen: (s: Student) => void
}) {
  const currency = dir.studio.currency
  const roster = rosterOf(session, dir, rows)
  // индивидуальное — одной строкой: время, ребёнок, деньги
  if (!session.group_id && roster.length === 1) {
    const st = roster[0]
    return (
      <div className="border-t border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onClick={() => onOpen(st)}
          className="flex w-full items-center gap-2 rounded-lg px-1 py-2 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
        >
          <span className="tabular-nums text-slate-500 dark:text-slate-400">{hhmm(session.start_time)}</span>
          <span className="min-w-0 flex-1 truncate font-medium">{st.full_name}</span>
          <MoneyPill row={rows.find((x) => x.student_id === st.id)} currency={currency} />
        </button>
      </div>
    )
  }
  return (
    <div className="border-t border-slate-100 pt-1.5 dark:border-slate-800">
      <p className="flex items-baseline gap-2 px-1 text-sm">
        <span className="tabular-nums text-slate-500 dark:text-slate-400">{hhmm(session.start_time)}</span>
        <span className="truncate font-medium">{lessonTitle(session, dir)}</span>
      </p>
      <ul>
        {roster.map((st) => {
          const r = rows.find((x) => x.student_id === st.id)
          return (
            <li key={st.id}>
              <button
                type="button"
                onClick={() => onOpen(st)}
                className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <span className="min-w-0 flex-1 truncate">{st.full_name}</span>
                <MoneyPill row={r} currency={currency} />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function MoneyPill({ row, currency }: { row: Attendance | undefined; currency: string }) {
  if (!row?.status) return <Pill>ждём отметку</Pill>
  if (!came(row.status)) return <Pill>пропуск · 0</Pill>
  if (row.amount === null) return <Pill tone="warn">нет тарифа</Pill>
  if (row.covered === undefined) return <Pill>{money(row.amount, currency)}</Pill>
  if (row.covered >= row.amount) return <Pill tone="ok">✓ {money(row.amount, currency)}</Pill>
  if (row.covered > 0)
    return (
      <Pill tone="warn">
        ◐ {row.covered} из {money(row.amount, currency)}
      </Pill>
    )
  return <Pill tone="bad">! долг {money(row.amount, currency)}</Pill>
}

function Stat({ value, label, note, bad }: { value: string; label: string; note?: string; bad?: boolean }) {
  return (
    <Card className="min-w-0 px-2.5 py-2">
      <p className={`truncate text-base font-semibold tabular-nums ${bad ? 'text-rose-600 dark:text-rose-400' : ''}`}>
        {value}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      {note && <p className="truncate text-[11px] text-slate-400">{note}</p>}
    </Card>
  )
}

function StepButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      {children}
    </button>
  )
}
