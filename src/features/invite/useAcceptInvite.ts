import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { acceptInvitation, fetchMyMemberships } from '@/services/groups'
import { useGroup } from '@/features/group/GroupProvider'

// OAuth 리다이렉트 왕복(redirectTo)이 /invite/:token으로 돌아오지 못했을 때를 위한
// 백업 채널. 1차 채널인 LoginPage/AuthProvider의 redirect 쿼리파라미터는 그대로 유지.
export const PENDING_INVITE_TOKEN_KEY = 'with.pendingInviteToken'

type AcceptInviteStatus = 'idle' | 'accepting' | 'error'

interface UseAcceptInviteResult {
  status: AcceptInviteStatus
  error: string | null
  accept: (token: string) => void
}

const INVALID_INVITATION_ERROR = '유효하지 않거나 이미 사용된 초대 링크입니다.'

export function useAcceptInvite(): UseAcceptInviteResult {
  const navigate = useNavigate()
  const { current, refetch, setCurrentGroupId } = useGroup()
  const [status, setStatus] = useState<AcceptInviteStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const inFlightToken = useRef<string | null>(null)

  const accept = useCallback(
    (token: string) => {
      if (inFlightToken.current === token) return
      inFlightToken.current = token

      // 그룹이 없는 상태에서 실패했다면, 다른 탭 등에서 같은 토큰이 먼저
      // 수락되었을 가능성이 있다 - 아래 catch에서 멤버십을 재확인해 구분한다.
      const hadNoGroupBefore = !current

      const clearPendingToken = () => {
        if (localStorage.getItem(PENDING_INVITE_TOKEN_KEY) === token) {
          localStorage.removeItem(PENDING_INVITE_TOKEN_KEY)
        }
      }

      setStatus('accepting')
      setError(null)

      acceptInvitation(token)
        .then(async (groupId) => {
          clearPendingToken()
          setCurrentGroupId(groupId)
          await refetch()
          navigate('/students', { replace: true })
        })
        .catch(async (e: unknown) => {
          clearPendingToken()
          const message = e instanceof Error ? e.message : ''

          if (hadNoGroupBefore && message.includes('invalid_invitation')) {
            try {
              const memberships = await fetchMyMemberships()
              if (memberships.length > 0) {
                setCurrentGroupId(memberships[0].group.id)
                await refetch()
                navigate('/students', { replace: true })
                return
              }
            } catch {
              // 재확인 자체가 실패하면 아래에서 일반 에러로 표시한다
            }
          }

          setStatus('error')
          setError(INVALID_INVITATION_ERROR)
        })
    },
    [current, navigate, refetch, setCurrentGroupId],
  )

  return { status, error, accept }
}
