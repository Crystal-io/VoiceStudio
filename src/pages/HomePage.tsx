import { isSupabaseConfigured } from '@/lib/supabase'

export function HomePage() {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-5 py-10">
      <header className="mb-10 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-white shadow-lg shadow-brand-600/30">
          V
        </div>
        <div>
          <h1 className="text-xl font-semibold leading-tight">VoiceStage</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Студия · расписание и посещаемость
          </p>
        </div>
      </header>

      <main className="flex-1">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
          <h2 className="text-lg font-semibold">Каркас готов 🎉</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Это устанавливаемое приложение (PWA). Дальше добавим вход, расписание
            педагогов, занятость кабинетов и учёт посещаемости.
          </p>

          <div className="mt-5 flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800/60">
            <span
              className={
                isSupabaseConfigured
                  ? 'size-2.5 rounded-full bg-emerald-500'
                  : 'size-2.5 rounded-full bg-amber-500'
              }
            />
            <span className="text-slate-700 dark:text-slate-200">
              {isSupabaseConfigured
                ? 'База данных подключена'
                : 'База данных ещё не подключена'}
            </span>
          </div>
        </div>
      </main>

      <footer className="mt-10 text-center text-xs text-slate-400">
        VoiceStage · pet-project
      </footer>
    </div>
  )
}
