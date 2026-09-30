import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/lib/profile'
import { addDays, startOfWeek, todayISO } from '@/lib/dates'
import { ensureSessions, loadSessions } from '@/lib/schedule'
import { came, loadAttendance, loadDebts } from '@/lib/attendance'
import { formatDuration, percent, plural } from '@/lib/format'
import { Card, Spinner } from '@/components/ui'
import {
  ChartIcon,
  CheckIcon,
  ChevronRightIcon,
  DoorIcon,
  MusicIcon,
  UsersIcon,
  WalletIcon,
} from '@/components/icons'
import { TodayLessons } from '@/components/schedule/TodayLessons'

export function HomePage() {
  const { profile } = useProfile()
  if (profile?.role === 'director') return <DirectorHome />
  return <TeacherHome name={profile?.full_name} teacherId={profile?.id} />
}

function DirectorHome() {
  const [counts, setCounts] = useState<{
    teachers: number
    invites: number
    rooms: number
    students: number
    groups: number
  } | null>(null)

  useEffect(() => {
    async function load() {
      const [teachers, invites, rooms, students, groups] = await Promise.all([
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'teacher'),
        supabase
          .from('invitations')
          .select('id', { count: 'exact', head: true }),
        supabase.from('rooms').select('id', { count: 'exact', head: true }),
        supabase
          .from('students')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true),
        supabase
          .from('groups')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true),
      ])
      setCounts({
        teachers: teachers.count ?? 0,
        invites: invites.count ?? 0,
        rooms: rooms.count ?? 0,
        students: students.count ?? 0,
        groups: groups.count ?? 0,
      })
    }
    void load()
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Обзор студии</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Состав студии, нагрузка, посещаемость и оплата — подробности по нажатию.
        </p>
      </div>

      {!counts ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          <StatLink
            to="/students"
            icon={<MusicIcon className="size-4" />}
            value={counts.students}
            label="учеников"
          />
          <StatLink
            to="/students?tab=groups"
            icon={<UsersIcon className="size-4" />}
            value={counts.groups}
            label="групп"
          />
          <StatLink
            to="/teachers"
            icon={<UsersIcon className="size-4" />}
            value={counts.teachers}
            label="педагогов"
            note={counts.invites > 0 ? `+${counts.invites} пригл.` : undefined}
          />
          <StatLink
            to="/rooms"
            icon={<DoorIcon className="size-4" />}
            value={counts.rooms}
            label="кабинетов"
          />
        </div>
      )}

      <ReportsSummary />

      <TodayLessons />
    </div>
  )
}

function StatLink({
  to,
  icon,
  value,
  label,
  note,
}: {
  to: string
  icon: ReactNode
  value: number
  label: string
  note?: string
}) {
  return (
    <Link to={to} className="block">
      <Card className="flex h-full flex-col items-center px-1 py-3 text-center transition hover:ring-brand-300 dark:hover:ring-brand-700">
        <div className="mb-1.5 flex size-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/50 dark:text-brand-400">
          {icon}
        </div>
        <div className="text-xl font-semibold leading-tight">{value}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
        {note && (
          <div className="mt-0.5 text-[11px] font-medium leading-tight text-amber-600 dark:text-amber-400">
            {note}
          </div>
        )}
      </Card>
    </Link>
  )
}

type Summary = {
  lessons: number
  minutes: number
  /** доля пришедших среди отметок недели; null — отметок нет */
  rate: number | null
  debts: number
}

/** Короткие итоги недели со ссылками на отчёты. */
function ReportsSummary() {
  const [sum, setSum] = useState<Summary | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const from = startOfWeek(todayISO())
      const to = addDays(from, 6)
      await ensureSessions(to)
      const [week, debts] = await Promise.all([loadSessions(from, to), loadDebts()])
      const live = week.sessions.filter((s) => s.status !== 'cancelled')
      const att = await loadAttendance(live.map((s) => s.id))
      const statuses = [...att.bySession.values()].flat().filter((r) => r.status)
      if (!alive) return
      setSum({
        lessons: live.length,
        minutes: live.reduce((n, s) => n + s.duration_min, 0),
        rate: percent(statuses.filter((r) => came(r.status)).length, statuses.length),
        debts: debts.debts.length,
      })
    })()
    return () => {
      alive = false
    }
  }, [])

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Отчёты
        </h3>
        <Link
          to="/reports"
          className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          Все отчёты →
        </Link>
      </div>
      <Card className="divide-y divide-slate-100 dark:divide-slate-800">
        <ReportRow
          to="/reports"
          icon={<ChartIcon className="size-5" />}
          title="Нагрузка за неделю"
          value={
            sum &&
            (sum.lessons > 0
              ? `${plural(sum.lessons, ['занятие', 'занятия', 'занятий'])} · ${formatDuration(sum.minutes)}`
              : 'занятий нет')
          }
        />
        <ReportRow
          to="/reports?tab=attendance"
          icon={<CheckIcon className="size-5" />}
          title="Посещаемость за неделю"
          value={sum && (sum.rate === null ? 'отметок пока нет' : `пришли ${sum.rate}%`)}
        />
        <ReportRow
          to="/reports?tab=payments"
          icon={<WalletIcon className="size-5" />}
          title="Оплата"
          value={
            sum &&
            (sum.debts > 0
              ? `не оплачено ${plural(sum.debts, ['занятие', 'занятия', 'занятий'])}`
              : 'долгов нет')
          }
          warn={!!sum && sum.debts > 0}
        />
      </Card>
    </section>
  )
}

function ReportRow({
  to,
  icon,
  title,
  value,
  warn,
}: {
  to: string
  icon: ReactNode
  title: string
  value: string | null
  warn?: boolean
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-4 py-3 transition first:rounded-t-2xl last:rounded-b-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/50 dark:text-brand-400">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span
          className={`block truncate text-sm ${
            warn ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {value ?? '…'}
        </span>
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-slate-300 dark:text-slate-600" />
    </Link>
  )
}

function TeacherHome({ name, teacherId }: { name?: string; teacherId?: string }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">
          Здравствуйте{name ? `, ${name.split(' ')[0]}` : ''} 👋
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Ваши занятия на сегодня. Всё расписание — во вкладке «Расписание».
        </p>
      </div>
      {teacherId && <TodayLessons teacherId={teacherId} />}
    </div>
  )
}
