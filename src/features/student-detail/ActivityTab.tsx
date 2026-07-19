import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchStudentActivities } from '@/services/studentActivities'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Badge, STUDENT_ACTIVITY_STATUS_TONE } from '@/components/ui/Badge'
import { ListItem, SectionHeader } from '@/components/ui/ListItem'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { STUDENT_ACTIVITY_CATEGORY_LABEL, STUDENT_ACTIVITY_STATUS_LABEL, type StudentActivity } from '@/types'
import { ActivityFormModal } from './ActivityFormModal'
import { ActivityDetailView } from './ActivityDetailView'

function ActivityRow({
  activity,
  onClick,
}: {
  activity: StudentActivity & { subtasks: { id: string; is_done: boolean }[] }
  onClick: () => void
}) {
  const overdue =
    activity.due_date &&
    activity.status !== 'completed' &&
    activity.due_date < new Date().toISOString().slice(0, 10)
  const subtaskProgress = activity.subtasks.length
    ? `세부 작업 ${activity.subtasks.filter((s) => s.is_done).length}/${activity.subtasks.length}`
    : undefined

  return (
    <ListItem
      onClick={onClick}
      leading={<Badge tone="outline">{STUDENT_ACTIVITY_CATEGORY_LABEL[activity.category]}</Badge>}
      title={activity.name}
      subtitle={subtaskProgress}
      trailing={
        <>
          {activity.due_date && activity.status !== 'completed' && (
            <span className={`text-caption ${overdue ? 'font-medium text-danger' : 'text-fg-tertiary'}`}>
              {formatDate(activity.due_date)}
              {overdue && ' 지남'}
            </span>
          )}
          <Badge tone={STUDENT_ACTIVITY_STATUS_TONE[activity.status]}>
            {STUDENT_ACTIVITY_STATUS_LABEL[activity.status]}
          </Badge>
        </>
      }
    />
  )
}

export function ActivityTab({ studentId }: { studentId: string }) {
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const { data: activities, isLoading } = useQuery({
    queryKey: ['studentActivities', studentId],
    queryFn: () => fetchStudentActivities(studentId),
  })

  if (selectedActivityId) {
    return (
      <ActivityDetailView
        activityId={selectedActivityId}
        studentId={studentId}
        onBack={() => setSelectedActivityId(null)}
      />
    )
  }

  const inProgress = (activities ?? []).filter((a) => a.status !== 'completed')
  const done = (activities ?? []).filter((a) => a.status === 'completed')

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setFormOpen(true)}>활동 생성</Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : !activities?.length ? (
        <EmptyState title="등록된 활동이 없습니다." description="첫 활동을 등록해 진행 상황을 기록하세요." />
      ) : (
        <>
          <div className="rounded-card border border-line bg-surface shadow-card">
            <SectionHeader title={`진행 중인 활동 (${inProgress.length})`} />
            {inProgress.length === 0 ? (
              <p className="px-5 pb-5 text-body text-fg-tertiary">진행 중인 활동이 없습니다.</p>
            ) : (
              <ul className="divide-y divide-line/60 pb-2">
                {inProgress.map((a) => (
                  <li key={a.id}>
                    <ActivityRow activity={a} onClick={() => setSelectedActivityId(a.id)} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-card border border-line bg-surface shadow-card">
            <SectionHeader title={`완료한 활동 (${done.length})`} />
            {done.length === 0 ? (
              <p className="px-5 pb-5 text-body text-fg-tertiary">완료한 활동이 없습니다.</p>
            ) : (
              <ul className="divide-y divide-line/60 pb-2">
                {done.map((a) => (
                  <li key={a.id}>
                    <ActivityRow activity={a} onClick={() => setSelectedActivityId(a.id)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <ActivityFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        studentId={studentId}
        onCreated={(newId) => setSelectedActivityId(newId)}
      />
    </div>
  )
}
