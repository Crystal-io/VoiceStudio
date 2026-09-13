import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/lib/profile'
import { Card, Spinner } from '@/components/ui'
import { DoorIcon, UsersIcon } from '@/components/icons'

export function HomePage() {
  const { profile } = useProfile()
  if (profile?.role === 'director') return <DirectorHome />
  return <TeacherHome name={profile?.full_name} />
}

function DirectorHome() {
  const [counts, setCounts] = useState<{
    teachers: number
    invites: number
    rooms: number
  } | null>(null)

  useEffect(() => {
    async function load() {
      const [teachers, invites, rooms] = await Promise.all([
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'teacher'),
        supabase
          .from('invitations')
          .select('id', { count: 'exact', head: true }),
        supabase.from('rooms').select('id', { count: 'exact', head: true }),
      ])
      setCounts({
        teachers: teachers.count ?? 0,
        invites: invites.count ?? 0,
        rooms: rooms.count ?? 0,
      })
    }
    void load()
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Обзор студии</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Наполните студию людьми и кабинетами — дальше добавим учеников и
          расписание.
        </p>
      </div>

      {!counts ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <StatLink
            to="/teachers"
            icon={<UsersIcon className="size-5" />}
            value={counts.teachers}
            label="педагогов"
            note={
              counts.invites > 0
                ? `+${counts.invites} приглашены`
                : undefined
            }
          />
          <StatLink
            to="/rooms"
            icon={<DoorIcon className="size-5" />}
            value={counts.rooms}
            label="кабинетов"
          />
        </div>
      )}
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
      <Card className="h-full p-4 transition hover:ring-brand-300 dark:hover:ring-brand-700">
        <div className="mb-3 flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/50 dark:text-brand-400">
          {icon}
        </div>
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
        {note && (
          <div className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            {note}
          </div>
        )}
      </Card>
    </Link>
  )
}

function TeacherHome({ name }: { name?: string }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">
          Здравствуйте{name ? `, ${name.split(' ')[0]}` : ''} 👋
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Вы вошли в VoiceStage.
        </p>
      </div>
      <Card className="p-6">
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Ваше расписание и отметка посещаемости появятся здесь в следующих
          обновлениях. Пока директор настраивает студию.
        </p>
      </Card>
    </div>
  )
}
