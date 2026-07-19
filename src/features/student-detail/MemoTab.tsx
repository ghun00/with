import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createMemo, deleteMemo, fetchMemos, updateMemo } from '@/services/memos'
import { useAuth } from '@/features/auth/AuthProvider'
import { useGroup } from '@/features/group/GroupProvider'
import { formatDateTime } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Field'
import { Dropdown } from '@/components/ui/Dropdown'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { MEMO_TAGS, type Memo, type MemoTag } from '@/types'

const MEMO_TAG_OPTIONS = MEMO_TAGS.map((t) => ({ value: t, label: t }))

export function MemoTab({ studentId }: { studentId: string }) {
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const { isOwner } = useGroup()
  const [content, setContent] = useState('')
  const [tag, setTag] = useState<MemoTag>('상담')
  const [editing, setEditing] = useState<Memo | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editTag, setEditTag] = useState<MemoTag>('상담')

  const { data: memos, isLoading } = useQuery({
    queryKey: ['memos', studentId],
    queryFn: () => fetchMemos(studentId),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['memos', studentId] })
    void queryClient.invalidateQueries({ queryKey: ['activities', studentId] })
  }

  const createMutation = useMutation({
    mutationFn: () => createMemo(studentId, content.trim(), tag),
    onSuccess: () => {
      setContent('')
      invalidate()
    },
  })

  const updateMutation = useMutation({
    mutationFn: () => updateMemo(editing!.id, editContent.trim(), editTag),
    onSuccess: () => {
      setEditing(null)
      invalidate()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (memoId: string) => deleteMemo(memoId),
    onSuccess: invalidate,
  })

  const canManage = (memo: Memo) => isOwner || memo.author_id === session?.user?.id

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-line bg-surface p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <Dropdown<MemoTag> options={MEMO_TAG_OPTIONS} value={tag} onChange={setTag} className="w-32" />
        </div>
        <Textarea
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="메모를 입력하세요"
        />
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            disabled={!content.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? '등록 중...' : '메모 등록'}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : !memos?.length ? (
        <EmptyState title="작성된 메모가 없습니다." description="첫 메모를 남겨보세요." />
      ) : (
        <ul className="space-y-3">
          {memos.map((memo) => (
            <li key={memo.id} className="rounded-card border border-line bg-surface p-4 shadow-card">
              {editing?.id === memo.id ? (
                <div>
                  <Dropdown<MemoTag>
                    options={MEMO_TAG_OPTIONS}
                    value={editTag}
                    onChange={setEditTag}
                    className="mb-3 w-32"
                  />
                  <Textarea rows={3} value={editContent} onChange={(e) => setEditContent(e.target.value)} />
                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>
                      취소
                    </Button>
                    <Button
                      size="sm"
                      disabled={!editContent.trim() || updateMutation.isPending}
                      onClick={() => updateMutation.mutate()}
                    >
                      저장
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge>{memo.tag}</Badge>
                      <div className="flex items-center gap-1.5 text-caption text-fg-tertiary">
                        <Avatar name={memo.author?.name ?? ''} url={memo.author?.avatar_url} size="sm" />
                        {memo.author?.name} · {formatDateTime(memo.created_at)}
                      </div>
                    </div>
                    {canManage(memo) && (
                      <div className="flex gap-1">
                        <button
                          className="rounded-field px-2 py-1 text-caption text-fg-tertiary transition-colors hover:bg-sunken hover:text-fg"
                          onClick={() => {
                            setEditing(memo)
                            setEditContent(memo.content)
                            setEditTag(memo.tag)
                          }}
                        >
                          수정
                        </button>
                        <button
                          className="rounded-field px-2 py-1 text-caption text-fg-tertiary transition-colors hover:bg-danger-soft hover:text-danger"
                          onClick={() => {
                            if (window.confirm('메모를 삭제할까요?')) deleteMutation.mutate(memo.id)
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-body text-fg">{memo.content}</p>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
