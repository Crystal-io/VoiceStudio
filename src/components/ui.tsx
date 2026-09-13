import {
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import { CloseIcon } from '@/components/icons'

// ---------------------------------------------------------------------------
// Кнопка
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'ghost' | 'danger'

const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 focus-visible:ring-brand-500/40',
  ghost:
    'text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 focus-visible:ring-slate-400/40 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800',
  danger:
    'text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50 focus-visible:ring-rose-400/40 dark:text-rose-300 dark:ring-rose-900 dark:hover:bg-rose-950/40',
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none transition focus-visible:ring-2 disabled:opacity-60 ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  )
}

// ---------------------------------------------------------------------------
// Текстовое поле с подписью
// ---------------------------------------------------------------------------

export function Field({
  label,
  hint,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </span>
      <input
        className={`w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-950 ${className}`}
        {...props}
      />
      {hint && (
        <span className="mt-1.5 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {hint}
        </span>
      )}
    </label>
  )
}

// ---------------------------------------------------------------------------
// Карточка-контейнер
// ---------------------------------------------------------------------------

export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 ${className}`}
    >
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Спиннер
// ---------------------------------------------------------------------------

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div
      className={`size-6 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600 dark:border-slate-700 dark:border-t-brand-500 ${className}`}
    />
  )
}

// ---------------------------------------------------------------------------
// Заглушка «пусто»
// ---------------------------------------------------------------------------

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon?: ReactNode
  title: string
  hint?: string
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && (
        <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          {icon}
        </div>
      )}
      <p className="font-medium text-slate-700 dark:text-slate-200">{title}</p>
      {hint && (
        <p className="mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Сообщение об ошибке
// ---------------------------------------------------------------------------

export function ErrorNote({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
      {text}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Модалка (снизу на телефоне, по центру на широком экране)
// ---------------------------------------------------------------------------

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
