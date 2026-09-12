import { AuthProvider, useAuth } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase'
import { LoginPage } from '@/pages/LoginPage'
import { HomePage } from '@/pages/HomePage'

function Splash() {
  return (
    <div className="flex min-h-full items-center justify-center">
      <div className="size-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
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

function Gate() {
  const { session, loading } = useAuth()
  if (loading) return <Splash />
  if (!session) return <LoginPage />
  return <HomePage />
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
