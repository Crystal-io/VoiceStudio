import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDirectory } from '@/lib/directory'
import type { Attendance, Session } from '@/lib/types'
import { isISODate, todayISO } from '@/lib/dates'
import { ensureSessions, loadSessions } from '@/lib/schedule'
import { loadAttendance } from '@/lib/attendance'
import { periodOf, type Period } from '@/lib/reports'
import { ErrorNote, Segmented, Spinner } from '@/components/ui'
import { PeriodPicker } from '@/components/reports/parts'
import { LoadReport } from '@/components/reports/LoadReport'
import { AttendanceReport } from '@/components/reports/AttendanceReport'
import { PaymentsReport } from '@/components/reports/PaymentsReport'

type Tab = 'load' | 'attendance' | 'payments'

const TABS: { value: Tab; label: string }[] = [
  { value: 'load', label: 'Нагрузка' },
  { value: 'attendance', label: 'Посещаемость' },
  { value: 'payments', label: 'Оплата' },
]

/** Отчёты директора: нагрузка, посещаемость, неоплаченные занятия. */
export function ReportsPage() {
  const [params, setParams] = useSearchParams()
  const { dir, error: dirError } = useDirectory()

  const tab: Tab = TABS.some((t) => t.value === params.get('tab'))
    ? (params.get('tab') as Tab)
    : 'load'
  const date = isISODate(params.get('date')) ? params.get('date')! : todayISO()
  const period = periodOf(params.get('period') === 'month' ? 'month' : 'week', date)

  const [data, setData] = useState<{
    key: string
    sessions: Session[]
    bySession: Map<string, Attendance[]>
  } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const key = `${period.from}:${period.to}:${version}`
  // занятия за период нужны нагрузке и посещаемости; оплате — нет
  const needSessions = tab !== 'payments'

  useEffect(() => {
    if (!needSessions) return
    let alive = true
    void (async () => {
      // для будущих недель занятия серий досоздаются заранее
      const ensureError = await ensureSessions(period.to)
      const res = await loadSessions(period.from, period.to)
      const att = await loadAttendance(res.sessions.map((s) => s.id))
      if (!alive) return
      setData({ key, sessions: res.sessions, bySession: att.bySession })
      setLoadError(ensureError ?? res.error ?? att.error)
    })()
    return () => {
      alive = false
    }
  }, [needSessions, key, period.from, period.to])

  function update(next: { tab?: Tab; period?: Period }) {
    const p = new URLSearchParams(params)
    if (next.tab) {
      if (next.tab === 'load') p.delete('tab')
      else p.set('tab', next.tab)
    }
    if (next.period) {
      if (next.period.kind === 'month') p.set('period', 'month')
      else p.delete('period')
      p.set('date', next.period.from)
    }
    setParams(p, { replace: true })
  }

  const ready = dir && data && data.key === key

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Отчёты</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Нагрузка педагогов и кабинетов, посещаемость и оплата.
        </p>
      </div>

      <Segmented<Tab> value={tab} onChange={(t) => update({ tab: t })} options={TABS} />

      {tab !== 'payments' && <PeriodPicker period={period} onChange={(p) => update({ period: p })} />}

      {(dirError || loadError) && <ErrorNote text={(dirError ?? loadError)!} />}

      {tab === 'payments' ? (
        dir ? (
          <PaymentsReport dir={dir} />
        ) : (
          <Loading />
        )
      ) : !ready ? (
        <Loading />
      ) : tab === 'load' ? (
        <LoadReport period={period} sessions={data.sessions} dir={dir} />
      ) : (
        <AttendanceReport
          period={period}
          sessions={data.sessions}
          bySession={data.bySession}
          dir={dir}
          onChanged={() => setVersion((v) => v + 1)}
        />
      )}
    </div>
  )
}

function Loading() {
  return (
    <div className="flex justify-center py-16">
      <Spinner />
    </div>
  )
}
