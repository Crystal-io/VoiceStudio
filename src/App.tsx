import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/lib/auth'
import { ProfileProvider, useProfile } from '@/lib/profile'
import { isSupabaseConfigured } from '@/lib/supabase'
import { LoginPage } from '@/pages/LoginPage'
import { HomePage } from '@/pages/HomePage'
import { TeachersPage } from '@/pages/TeachersPage'
import { RoomsPage } from '@/pages/RoomsPage'
import { AppShell } from '@/components/AppShell'
import { Spinner } from '@/components/ui'

function Splash() {
  return (
    <div className="flex min-h-full items-center justify-center">
      <Spinner className="size-8" />
    </div>
  )
}

function ConfigNotice() {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6 text-center">
      <h1 className="text-lg font-semibold">База данных не подключена</h1>
      <p className="mt-2 text-sm text-slate-500">
        Заполните VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в файле .env.local.
      </p>
    </div>
  )
}

function NoProfileNotice() {
  const { user, signOut } = useAuth()
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6 text-center">
      <h1 className="text-lg font-semibold">Доступ ещё не открыт</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Аккаунт <span className="font-medium">{user?.email}</span> пока не
        привязан к студии. Попросите директора добавить эту почту в разделе
        «Педагоги».
      </p>
      <button
        type="button"
        onClick={signOut}
        className="mx-auto mt-6 rounded-lg px-4 py-2 text-sm text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-100 dark:ring-slate-700 dark:hover:bg-slate-800"
      >
        Выйти
      </button>
    </div>
  )
}

/** Только директор; иначе — на главную. */
function DirectorOnly({ children }: { children: ReactNode }) {
  const { profile } = useProfile()
  if (profile?.role !== 'director') return <Navigate to="/" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { profile, loading, missing } = useProfile()
  if (loading) return <Splash />
  if (missing || !profile) return <NoProfileNotice />

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route
            path="teachers"
            element={
              <DirectorOnly>
                <TeachersPage />
              </DirectorOnly>
            }
          />
          <Route
            path="rooms"
            element={
              <DirectorOnly>
                <RoomsPage />
              </DirectorOnly>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

function Gate() {
  const { session, loading } = useAuth()
  if (loading) return <Splash />
  if (!session) return <LoginPage />
  return (
    <ProfileProvider>
      <AppRoutes />
    </ProfileProvider>
  )
}

function App() {
  if (!isSupabaseConfigured) return <ConfigNotice />
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

export default App
