import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createInvitation,
  fetchGroupMembers,
  fetchMemberStudents,
  fetchPendingInvitations,
  removeMember,
  revokeInvitation,
  updateGroupName,
} from '@/services/groups'
import { useAuth } from '@/features/auth/AuthProvider'
import { useGroup } from '@/features/group/GroupProvider'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { PageHeader } from '@/components/ui/PageHeader'
import { ListItem, SectionHeader } from '@/components/ui/ListItem'
import { formatDate } from '@/lib/format'
import type { GroupMember } from '@/types'

function MemberRow({ member, groupId, isOwnerView }: { member: GroupMember; groupId: string; isOwnerView: boolean }) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)

  const { data: students } = useQuery({
    queryKey: ['memberStudents', groupId, member.user_id],
    queryFn: () => fetchMemberStudents(groupId, member.user_id),
    enabled: expanded,
  })

  const removeMutation = useMutation({
    mutationFn: () => removeMember(groupId, member.user_id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['groupMembers', groupId] }),
  })

  return (
    <li>
      <ListItem
        leading={<Avatar name={member.profile?.name ?? ''} url={member.profile?.avatar_url} />}
        title={member.profile?.name || '이름 없음'}
        subtitle={`${formatDate(member.created_at)} 합류`}
        trailing={
          <>
            <Badge tone={member.role === 'owner' ? 'accent' : 'neutral'}>
              {member.role === 'owner' ? '대표 관리자' : '컨설턴트'}
            </Badge>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="rounded-field px-2 py-1 text-caption text-fg-tertiary transition-colors hover:bg-sunken hover:text-fg"
            >
              담당 학생 {expanded ? '접기' : '보기'}
            </button>
            {isOwnerView && member.role !== 'owner' && (
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      `${member.profile?.name} 멤버를 그룹에서 제외할까요?\n제외된 멤버는 담당 학생에 접근할 수 없습니다.`,
                    )
                  )
                    removeMutation.mutate()
                }}
                className="rounded-field px-2 py-1 text-caption text-fg-tertiary transition-colors hover:bg-danger-soft hover:text-danger"
              >
                제외
              </button>
            )}
          </>
        }
      />
      {expanded && (
        <div className="mx-5 mb-3 rounded-field bg-sunken px-4 py-3">
          {!students ? (
            <p className="text-caption text-fg-tertiary">불러오는 중...</p>
          ) : students.length === 0 ? (
            <p className="text-caption text-fg-tertiary">담당 학생이 없습니다.</p>
          ) : (
            <p className="text-body text-fg-secondary">{students.map((s) => s.name).join(', ')}</p>
          )}
        </div>
      )}
    </li>
  )
}

export function GroupSettingsPage() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { current, isOwner } = useGroup()
  const group = current!.group
  const [name, setName] = useState(group.name)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { data: members, isLoading } = useQuery({
    queryKey: ['groupMembers', group.id],
    queryFn: () => fetchGroupMembers(group.id),
  })

  const { data: invitations } = useQuery({
    queryKey: ['invitations', group.id],
    queryFn: () => fetchPendingInvitations(group.id),
    enabled: isOwner,
  })

  const nameMutation = useMutation({
    mutationFn: () => updateGroupName(group.id, name.trim()),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['memberships'] }),
  })

  const inviteMutation = useMutation({
    mutationFn: () => createInvitation(group.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['invitations', group.id] }),
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeInvitation(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['invitations', group.id] }),
  })

  const copyLink = async (token: string, id: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/invite/${token}`)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <PageHeader title="설정" />

      <section className="mb-6 rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 className="mb-4 text-label font-semibold text-fg-secondary">그룹 정보</h2>
        {isOwner ? (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label>그룹명</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button
              variant="secondary"
              disabled={!name.trim() || name === group.name || nameMutation.isPending}
              onClick={() => nameMutation.mutate()}
            >
              저장
            </Button>
          </div>
        ) : (
          <p className="text-body text-fg">{group.name}</p>
        )}
        <p className="mt-3 text-caption text-fg-tertiary">
          내 역할: {isOwner ? '대표 관리자' : '컨설턴트'} ({profile?.name})
        </p>
      </section>

      <section className="mb-6 rounded-card border border-line bg-surface pb-2 shadow-card">
        <SectionHeader
          title={`멤버${members ? ` (${members.length})` : ''}`}
          action={
            isOwner ? (
              <Button size="sm" disabled={inviteMutation.isPending} onClick={() => inviteMutation.mutate()}>
                초대 링크 만들기
              </Button>
            ) : undefined
          }
        />
        {isLoading ? (
          <Spinner />
        ) : (
          <ul className="divide-y divide-line/60">
            {(members ?? []).map((m) => (
              <MemberRow key={m.user_id} member={m} groupId={group.id} isOwnerView={isOwner} />
            ))}
          </ul>
        )}
      </section>

      {isOwner && (invitations?.length ?? 0) > 0 && (
        <section className="rounded-card border border-line bg-surface p-5 shadow-card">
          <h2 className="mb-4 text-label font-semibold text-fg-secondary">대기 중인 초대</h2>
          <ul className="space-y-2">
            {invitations!.map((inv) => (
              <li key={inv.id} className="flex items-center gap-2 rounded-field bg-sunken px-4 py-2.5">
                <code className="flex-1 truncate text-caption text-fg-secondary">
                  {window.location.origin}/invite/{inv.token}
                </code>
                <Button variant="secondary" size="sm" onClick={() => void copyLink(inv.token, inv.id)}>
                  {copiedId === inv.id ? '복사됨!' : '링크 복사'}
                </Button>
                <Button variant="danger" size="sm" onClick={() => revokeMutation.mutate(inv.id)}>
                  취소
                </Button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-caption text-fg-tertiary">
            초대 링크를 컨설턴트에게 전달하세요. 링크를 열고 카카오 로그인하면 그룹에 합류합니다.
          </p>
        </section>
      )}
    </div>
  )
}
