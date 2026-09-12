import { useRef, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'

type Step = 'email' | 'code'

export function LoginPage() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const codeInputRef = useRef<HTMLInputElement>(null)

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

function mapError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid') && m.includes('token')) return 'Неверный или просроченный код. Попробуйте ещё раз.'
  if (m.includes('rate') || m.includes('limit')) return 'Слишком много попыток. Подождите минуту и повторите.'
  if (m.includes('expired')) return 'Код истёк. Запросите новый.'
  return message
}
