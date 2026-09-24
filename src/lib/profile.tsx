import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import type { Profile } from '@/lib/types'

type ProfileContextValue = {
  profile: Profile | null
  loading: boolean
  /** Профиль не найден: пользователь вошёл, но не привязан к студии. */
  missing: boolean
  reload: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!user) {
      setProfile(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const columns = 'id, studio_id, full_name, role, color, is_active, created_at'
    let { data } = await supabase
      .from('profiles')
      .select(columns)
      .eq('id', user.id)
      .maybeSingle()

    // Профиля нет: возможно, есть приглашение по email, которое ещё не
    // превратилось в профиль (напр. аккаунт создан раньше приглашения).
    // Пробуем привязать его на месте и перечитываем.
    if (!data) {
      await supabase.rpc('claim_invitation')
      const retry = await supabase
        .from('profiles')
        .select(columns)
        .eq('id', user.id)
        .maybeSingle()
      data = retry.data
    }

    setProfile((data as Profile) ?? null)
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  return (
    <ProfileContext.Provider
      value={{
        profile,
        loading,
        missing: !loading && profile === null,
        reload: load,
      }}
    >
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile должен использоваться внутри <ProfileProvider>')
  return ctx
}
