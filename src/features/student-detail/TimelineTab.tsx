import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchActivities } from '@/services/activities'
import { formatDateTime } from '@/lib/format'
import { Badge } from '@/components/ui/Badge'
import { Chip } from '@/components/ui/Chip'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { ACTIVITY_TYPE_LABEL, type ActivityType } from '@/types'

const FILTERS: ActivityType[] = [
  'student_created',
  'student_updated',
  'memo_created',
  'activity_created',
  'activity_status_changed',
  'activity_completed',
  'counsel_report',
  'kakao_analysis',
  'report_generated',
]

export function TimelineTab({ studentId }: { studentId: string }) {
  const [typeFilter, setTypeFilter] = useState<ActivityType | ''>('')

  const { data: activities, isLoading } = useQuery({
    queryKey: ['activities', studentId, typeFilter || undefined],
    queryFn: () => fetchActivities(studentId, typeFilter || undefined),
  })

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((t) => (
          <Chip key={t} selected={typeFilter === t} onClick={() => setTypeFilter(typeFilter === t ? '' : t)}>
            {ACTIVITY_TYPE_LABEL[t]}
          </Chip>
        ))}
      </div>

      {isLoading ? (
        <Spinner />
      ) : !activities?.length ? (
        <EmptyState
          title="활동 기록이 없습니다."
          description="메모, 활동 등 학생 관련 기록이 생기면 시간순으로 표시됩니다."
        />
      ) : (
        <div className="rounded-card border border-line bg-surface shadow-card">
          <ol>
            {activities.map((a, i) => (
              <li
                key={a.id}
                className={`flex items-start gap-4 px-5 py-4 ${i !== activities.length - 1 ? 'border-b border-line/60' : ''}`}
              >
                <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-fg-tertiary" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge>{ACTIVITY_TYPE_LABEL[a.type] ?? a.type}</Badge>
                    <span className="text-caption text-fg-tertiary">{formatDateTime(a.created_at)}</span>
                    {a.actor?.name && <span className="text-caption text-fg-tertiary">· {a.actor.name}</span>}
                  </div>
                  <p className="mt-1.5 text-body text-fg">{a.summary}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
