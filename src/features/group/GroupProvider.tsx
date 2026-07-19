import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMyMemberships, type Membership } from '@/services/groups'
import { useAuth } from '@/features/auth/AuthProvider'

interface GroupContextValue {
  memberships: Membership[]
  current: Membership | null
  isOwner: boolean
  loading: boolean
  setCurrentGroupId: (groupId: string) => void
  refetch: () => Promise<void>
}

const GroupContext = createContext<GroupContextValue | null>(null)

const STORAGE_KEY = 'with.currentGroupId'

export function GroupProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY),
  )

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['memberships', session?.user?.id],
    queryFn: fetchMyMemberships,
    enabled: Boolean(session),
  })

  const memberships = data ?? []
  const current =
    memberships.find((m) => m.group.id === currentGroupId) ?? memberships[0] ?? null

  useEffect(() => {
    if (current) localStorage.setItem(STORAGE_KEY, current.group.id)
  }, [current])

  const value: GroupContextValue = {
    memberships,
    current,
    isOwner: current?.role === 'owner',
    loading: Boolean(session) && isLoading,
    setCurrentGroupId: (groupId) => {
      localStorage.setItem(STORAGE_KEY, groupId)
      setCurrentGroupId(groupId)
    },
    refetch: async () => {
      await refetch()
    },
  }

  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>
}

export function useGroup(): GroupContextValue {
  const ctx = useContext(GroupContext)
  if (!ctx) throw new Error('useGroup must be used within GroupProvider')
  return ctx
}
