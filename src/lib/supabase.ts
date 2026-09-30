import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined

/**
 * Готов ли проект к работе с Supabase.
 * Пока ключи не заданы в .env.local — приложение работает,
 * но экраны, которым нужна база, покажут подсказку по настройке.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

/**
 * Ошибка, с которой Supabase вернул браузер после входа через Google
 * (например, почты нет в приглашениях): приходит в адресе как
 * `error_description`. Забираем её до создания клиента и убираем из адреса,
 * чтобы не всплывала после перезагрузки. Показывает экран входа.
 */
let redirectError = takeRedirectError()

function takeRedirectError(): string | null {
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const query = new URLSearchParams(window.location.search)
  const text = hash.get('error_description') ?? query.get('error_description')
  if (!text) return null
  window.history.replaceState(null, '', window.location.pathname)
  return text
}

export function peekRedirectError() {
  return redirectError
}

export function clearRedirectError() {
  redirectError = null
}

export const supabase = createClient(
  supabaseUrl ?? 'http://localhost:54321',
  supabaseAnonKey ?? 'public-anon-key-placeholder',
)
