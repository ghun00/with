import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { acceptInvitation } from '@/services/groups'
import { useAuth } from '@/features/auth/AuthProvider'
import { useGroup } from '@/features/group/GroupProvider'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'

export function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { session, loading } = useAuth()
  const { refetch, setCurrentGroupId } = useGroup()
  const [error, setError] = useState<string | null>(null)
  const accepting = useRef(false)

  useEffect(() => {
    if (loading || !session || !token || accepting.current) return
    accepting.current = true
    acceptInvitation(token)
      .then(async (groupId) => {
        setCurrentGroupId(groupId)
        await refetch()
        navigate('/students', { replace: true })
      })
      .catch(() => {
        setError('유효하지 않거나 이미 사용된 초대 링크입니다.')
      })
  }, [loading, session, token, navigate, refetch, setCurrentGroupId])

  if (loading) return <Spinner className="h-screen" />
  if (!session) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(`/invite/${token}`)}`} replace />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm rounded-modal bg-surface p-8 text-center shadow-card">
        {error ? (
          <>
            <p className="text-body text-danger">{error}</p>
            <Button variant="secondary" className="mt-6" onClick={() => navigate('/')}>
              홈으로 이동
            </Button>
          </>
        ) : (
          <>
            <Spinner />
            <p className="text-body text-fg-secondary">초대를 수락하는 중입니다...</p>
          </>
        )}
      </div>
    </div>
  )
}
