import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { createGroup } from '@/services/groups'
import { useAuth } from '@/features/auth/AuthProvider'
import { useGroup } from '@/features/group/GroupProvider'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Field'

export function OnboardingPage() {
  const navigate = useNavigate()
  const { session, profile, signOut } = useAuth()
  const { current, refetch, setCurrentGroupId } = useGroup()
  const [name, setName] = useState('')

  const mutation = useMutation({
    mutationFn: () => createGroup(name.trim()),
    onSuccess: async (groupId) => {
      setCurrentGroupId(groupId)
      // 멤버십 목록이 갱신되기 전에 이동하면 AppLayout이 다시 온보딩으로 보내므로 완료를 기다린다
      await refetch()
      navigate('/students', { replace: true })
    },
  })

  if (!session) return <Navigate to="/login" replace />
  if (current && !mutation.isPending) return <Navigate to="/students" replace />

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-md rounded-modal bg-surface p-8 shadow-card">
        <h1 className="text-title">
          {profile?.name ? `${profile.name}님, 환영합니다!` : '환영합니다!'}
        </h1>
        <p className="mt-2 text-body text-fg-secondary">
          아직 소속된 그룹이 없습니다. 새 그룹(컨설팅 조직)을 만들거나, 대표 관리자에게 초대
          링크를 요청하세요.
        </p>

        <form
          className="mt-8"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) mutation.mutate()
          }}
        >
          <Label required>그룹명</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 위드 입시컨설팅"
            autoFocus
          />
          {mutation.isError && (
            <p className="mt-2 text-body text-danger">
              {mutation.error.message.includes('group_limit_reached')
                ? '계정당 1개의 그룹만 생성할 수 있습니다.'
                : '그룹 생성에 실패했습니다. 다시 시도해주세요.'}
            </p>
          )}
          <Button type="submit" className="mt-4 w-full" disabled={!name.trim() || mutation.isPending}>
            {mutation.isPending ? '생성 중...' : '그룹 만들고 시작하기'}
          </Button>
        </form>

        <div className="mt-6 border-t border-line pt-4 text-center">
          <p className="text-caption text-fg-tertiary">
            초대 링크를 받았다면 브라우저에서 해당 링크를 열어주세요.
          </p>
          <button
            onClick={() => void signOut()}
            className="mt-3 text-caption text-fg-tertiary underline transition-colors hover:text-fg"
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  )
}
