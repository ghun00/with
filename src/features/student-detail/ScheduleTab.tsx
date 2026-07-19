import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteStudentSchedule, fetchStudentSchedules } from '@/services/schedules'
import { ScheduleFormModal } from './ScheduleFormModal'
import { formatDateTime } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { StaggerList, StaggerItem } from '@/components/motion'
import type { StudentSchedule } from '@/types'

// 종료가 없으면 시작만, 있으면 시작 ~ 종료
function formatPeriod(s: StudentSchedule): string {
  if (!s.end_at) return formatDateTime(s.start_at)
  return `${formatDateTime(s.start_at)} ~ ${formatDateTime(s.end_at)}`
}

export function ScheduleTab({ studentId }: { studentId: string }) {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<StudentSchedule | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data: schedules, isLoading } = useQuery({
    queryKey: ['schedules', studentId],
    queryFn: () => fetchStudentSchedules(studentId),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['schedules', studentId] })
    void queryClient.invalidateQueries({ queryKey: ['activities', studentId] })
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteStudentSchedule(id),
    onSuccess: () => {
      setErrorMessage(null)
      invalidate()
    },
    onError: () => setErrorMessage('일정 삭제에 실패했습니다.'),
  })

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }
  const openEdit = (s: StudentSchedule) => {
    setEditing(s)
    setModalOpen(true)
  }

  // 서비스는 start_at 오름차순으로 준다. end_at(없으면 start_at) 기준으로 다가오는/지난 분리.
  const now = Date.now()
  const refTime = (s: StudentSchedule) => new Date(s.end_at ?? s.start_at).getTime()
  const upcoming = (schedules ?? []).filter((s) => refTime(s) >= now)
  const past = (schedules ?? []).filter((s) => refTime(s) < now).reverse()

  const renderItem = (s: StudentSchedule) => (
    <StaggerItem key={s.id}>
      <div className="flex items-start justify-between rounded-card border border-line bg-surface p-4 shadow-card">
        <div className="min-w-0">
          <p className="text-body font-medium text-fg">{s.title}</p>
          <p className="mt-0.5 text-caption text-fg-tertiary">{formatPeriod(s)}</p>
          {s.memo && <p className="mt-1 whitespace-pre-wrap text-caption text-fg-secondary">{s.memo}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            className="rounded-field px-2 py-1 text-caption text-fg-tertiary transition-colors hover:bg-sunken hover:text-fg"
            onClick={() => openEdit(s)}
          >
            수정
          </button>
          <button
            className="rounded-field px-2 py-1 text-caption text-fg-tertiary transition-colors hover:bg-danger-soft hover:text-danger"
            onClick={() => {
              if (window.confirm(`'${s.title}' 일정을 삭제할까요?`)) deleteMutation.mutate(s.id)
            }}
          >
            삭제
          </button>
        </div>
      </div>
    </StaggerItem>
  )

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={openCreate}>
          일정 추가
        </Button>
      </div>

      {errorMessage && <p className="text-caption text-danger">{errorMessage}</p>}

      {isLoading ? (
        <Spinner />
      ) : !schedules?.length ? (
        <EmptyState title="등록된 일정이 없습니다." description="상담·활동 일정을 추가해보세요." />
      ) : (
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 text-label font-medium text-fg-secondary">다가오는 일정</h3>
            {upcoming.length ? (
              <StaggerList className="space-y-3">{upcoming.map(renderItem)}</StaggerList>
            ) : (
              <p className="text-caption text-fg-tertiary">다가오는 일정이 없습니다.</p>
            )}
          </section>
          {past.length > 0 && (
            <section>
              <h3 className="mb-2 text-label font-medium text-fg-secondary">지난 일정</h3>
              <StaggerList className="space-y-3">{past.map(renderItem)}</StaggerList>
            </section>
          )}
        </div>
      )}

      <ScheduleFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        studentId={studentId}
        editing={editing}
        onSaved={invalidate}
      />
    </div>
  )
}
