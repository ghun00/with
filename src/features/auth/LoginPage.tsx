import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { Spinner } from '@/components/ui/Spinner'

export function LoginPage() {
  const { session, loading, signInWithKakao } = useAuth()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [signingIn, setSigningIn] = useState(false)

  const redirect = searchParams.get('redirect') ?? '/'

  if (loading) return <Spinner className="h-screen" />
  if (session) return <Navigate to={redirect} replace />

  const handleLogin = async () => {
    setSigningIn(true)
    setError(null)
    try {
      await signInWithKakao(redirect)
    } catch (e) {
      setError(e instanceof Error ? e.message : '로그인에 실패했습니다.')
      setSigningIn(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-modal bg-fg text-title text-surface">
            W
          </div>
          <h1 className="text-body">WITH</h1>
          <p className="mt-2 text-body text-fg-secondary">
            학생 관리 컨설턴트를 위한
            <br />
            학생 관리 통합 서비스
          </p>
        </div>

        <button
          onClick={handleLogin}
          disabled={signingIn}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-field bg-[#FEE500] text-body font-semibold text-[#191919] transition hover:brightness-95 disabled:opacity-60"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#191919">
            <path d="M12 3C6.48 3 2 6.48 2 10.8c0 2.76 1.86 5.18 4.66 6.56l-.95 3.52c-.08.3.26.55.52.38l4.18-2.78c.52.07 1.05.12 1.59.12 5.52 0 10-3.48 10-7.8S17.52 3 12 3z" />
          </svg>
          {signingIn ? '이동 중...' : '카카오로 시작하기'}
        </button>

        {error && <p className="mt-4 text-center text-body text-danger">{error}</p>}
      </div>
    </div>
  )
}
