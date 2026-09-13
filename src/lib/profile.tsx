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
    const { data } = await supabase
      .from('profiles')
      .select('id, studio_id, full_name, role, color, is_active, created_at')
      .eq('id', user.id)
      .maybeSingle()
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
