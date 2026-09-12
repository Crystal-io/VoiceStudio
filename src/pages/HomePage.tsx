import { useAuth } from '@/lib/auth'

export function HomePage() {
  const { user, signOut } = useAuth()

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-5 py-8">
      <header className="mb-8 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-white shadow-lg shadow-brand-600/30">
            V
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">VoiceStage</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {user?.email}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="rounded-lg px-3 py-1.5 text-sm text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-100 dark:ring-slate-700 dark:hover:bg-slate-800"
        >
          Выйти
        </button>
      </header>

      <main className="flex-1">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
          <h2 className="text-lg font-semibold">Вы вошли 👋</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Вход работает. Следующий шаг — создать вашу студию, завести педагогов
            и кабинеты, а затем расписание и посещаемость.
          </p>
        </div>
      </main>

      <footer className="mt-10 text-center text-xs text-slate-400">
        VoiceStage · pet-project
      </footer>
    </div>
  )
}
