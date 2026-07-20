import { useEffect, useRef } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { useAcceptInvite, PENDING_INVITE_TOKEN_KEY } from '@/features/invite/useAcceptInvite'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'

export function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { session, loading } = useAuth()
  const { status, error, accept } = useAcceptInvite()
  const attemptedRef = useRef(false)

  // OAuth 리다이렉트가 이 페이지로 돌아오지 못하는 경우를 대비한 백업 채널
  useEffect(() => {
    if (!loading && !session && token) {
      localStorage.setItem(PENDING_INVITE_TOKEN_KEY, token)
    }
  }, [loading, session, token])

  useEffect(() => {
    if (loading || !session || !token || attemptedRef.current) return
    attemptedRef.current = true
    accept(token)
  }, [loading, session, token, accept])

  if (loading) return <Spinner className="h-screen" />
  if (!session) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(`/invite/${token}`)}`} replace />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm rounded-modal bg-surface p-8 text-center shadow-card">
        {status === 'error' ? (
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
