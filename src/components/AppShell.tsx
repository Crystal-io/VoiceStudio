import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { useProfile } from '@/lib/profile'
import { HomeIcon, UsersIcon, DoorIcon } from '@/components/icons'
import type { ComponentType, SVGProps } from 'react'

type NavItem = {
  to: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

const directorNav: NavItem[] = [
  { to: '/', label: 'Главная', icon: HomeIcon },
  { to: '/teachers', label: 'Педагоги', icon: UsersIcon },
  { to: '/rooms', label: 'Кабинеты', icon: DoorIcon },
]

const teacherNav: NavItem[] = [{ to: '/', label: 'Главная', icon: HomeIcon }]

export function AppShell() {
  const { user, signOut } = useAuth()
  const { profile } = useProfile()

  const nav = profile?.role === 'director' ? directorNav : teacherNav
  const roleLabel = profile?.role === 'director' ? 'Директор' : 'Педагог'

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <header className="flex items-center justify-between gap-3 px-5 pb-3 pt-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-brand-600 text-lg font-bold text-white shadow-lg shadow-brand-600/30">
            V
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight">VoiceStage</h1>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {profile?.full_name ?? user?.email} · {roleLabel}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-100 dark:ring-slate-700 dark:hover:bg-slate-800"
        >
          Выйти
        </button>
      </header>

      <main className="flex-1 px-5 pb-28 pt-2">
        <Outlet />
      </main>

      {nav.length > 1 && (
        <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
          <div className="flex">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition ${
                    isActive
                      ? 'text-brand-600 dark:text-brand-400'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`
                }
              >
                <Icon className="size-6" />
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}
