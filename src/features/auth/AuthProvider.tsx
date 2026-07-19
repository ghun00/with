import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import type { Profile } from '@/types'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signInWithKakao: (redirectPath?: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    const supabase = getSupabase()

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) {
      setProfile(null)
      return
    }
    const supabase = getSupabase()
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProfile(data as Profile)
      })
  }, [session?.user?.id, session])

  const value: AuthContextValue = {
    session,
    profile,
    loading,
    async signInWithKakao(redirectPath = '/') {
      const supabase = getSupabase()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'kakao',
        options: { redirectTo: `${window.location.origin}${redirectPath}` },
      })
      if (error) throw error
    },
    async signOut() {
      const supabase = getSupabase()
      await supabase.auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
