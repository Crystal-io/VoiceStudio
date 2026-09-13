import { useRef, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'

type Step = 'email' | 'code'

export function LoginPage() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const codeInputRef = useRef<HTMLInputElement>(null)

  async function signInWithGoogle() {
    setError(null)
    setGoogleBusy(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    // при успехе браузер уходит на Google и возвращается назад —
    // сессию подхватит onAuthStateChange. Сюда попадаем только при ошибке.
    if (error) {
      setGoogleBusy(false)
      setError(mapError(error.message))
    }
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    })
    setBusy(false)
    if (error) {
      setError(mapError(error.message))
      return
    }
    setStep('code')
    // дать полю появиться и сфокусироваться
    setTimeout(() => codeInputRef.current?.focus(), 50)
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    })
    setBusy(false)
    if (error) {
      setError(mapError(error.message))
      return
    }
    // успех: onAuthStateChange в AuthProvider подхватит сессию и покажет приложение
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-10">
      <header className="mb-8 flex flex-col items-center text-center">
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white shadow-lg shadow-brand-600/30">
          V
        </div>
        <h1 className="text-2xl font-semibold">VoiceStage</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Вход для педагогов студии
        </p>
      </header>

      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        {step === 'email' && (
          <>
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={googleBusy}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:ring-2 focus:ring-brand-500/30 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <GoogleIcon className="size-5" />
              {googleBusy ? 'Открываем Google…' : 'Продолжить с Google'}
            </button>
            <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              или по коду на почту
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            </div>
          </>
        )}
        {step === 'email' ? (
          <form onSubmit={sendCode} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                Ваша почта
              </label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@example.com"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Пришлём одноразовый код на почту — пароль не нужен.
            </p>
            {error && <ErrorNote text={error} />}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-brand-600 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:ring-2 focus:ring-brand-500/40 disabled:opacity-60"
            >
              {busy ? 'Отправляем…' : 'Получить код'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="space-y-4">
            <div>
              <label
                htmlFor="code"
                className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                Код из письма
              </label>
              <input
                id="code"
                ref={codeInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="______"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Код отправлен на <span className="font-medium">{email}</span>.
            </p>
            {error && <ErrorNote text={error} />}
            <button
              type="submit"
              disabled={busy || code.length < 6}
              className="w-full rounded-xl bg-brand-600 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:ring-2 focus:ring-brand-500/40 disabled:opacity-60"
            >
              {busy ? 'Проверяем…' : 'Войти'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('email')
                setCode('')
                setError(null)
              }}
              className="w-full text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              ← Изменить почту
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
      {text}
    </div>
  )
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.5 0 10.5-2.1 14.3-5.6l-6.6-5.6C29.6 34.6 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.6 5.6C41.9 36.3 44 30.7 44 24c0-1.3-.1-2.3-.4-3.5z"
      />
    </svg>
  )
}

function mapError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid') && m.includes('token')) return 'Неверный или просроченный код. Попробуйте ещё раз.'
  if (m.includes('rate') || m.includes('limit')) return 'Слишком много попыток. Подождите минуту и повторите.'
  if (m.includes('expired')) return 'Код истёк. Запросите новый.'
  return message
}
