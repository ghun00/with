import { useQuery } from '@tanstack/react-query'
import { fetchActivities } from '@/services/activities'
import { fetchStudentActivities } from '@/services/studentActivities'
import { formatDate, formatRelative } from '@/lib/format'
import { Badge, STUDENT_ACTIVITY_STATUS_TONE } from '@/components/ui/Badge'
import {
  ACTIVITY_TYPE_LABEL,
  STUDENT_ACTIVITY_CATEGORY_LABEL,
  STUDENT_ACTIVITY_STATUS_LABEL,
  type StudentListItem,
} from '@/types'

function Card({ title, children, onMore }: { title: string; children: React.ReactNode; onMore?: () => void }) {
  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-label font-semibold text-fg-secondary">{title}</h2>
        {onMore && (
          <button
            onClick={onMore}
            className="text-caption text-fg-tertiary transition-colors hover:text-accent-600"
          >
            전체 보기 →
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

export function SummaryTab({
  student,
  onNavigateTab,
}: {
  student: StudentListItem
  onNavigateTab: (tab: string) => void
}) {
  const { data: studentActivities = [] } = useQuery({
    queryKey: ['studentActivities', student.id],
    queryFn: () => fetchStudentActivities(student.id),
  })
  const { data: activities = [] } = useQuery({
    queryKey: ['activities', student.id, undefined],
    queryFn: () => fetchActivities(student.id),
  })

  const primary = student.assignments.find((a) => a.role === 'primary')
  const cos = student.assignments.filter((a) => a.role === 'co')
  const openActivities = studentActivities.filter((a) => a.status !== 'completed').slice(0, 5)
  const recentActivities = activities.slice(0, 5)

  return (
    <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
      <Card title="기본 정보">
        <dl className="space-y-2.5 text-body">
          {[
            ['학교', `${student.school} ${student.grade}`],
            ['학생 연락처', student.student_phone],
            ['학부모 연락처', student.parent_phone],
            ['등록일', formatDate(student.created_at)],
            ['최종 수정일', formatDate(student.updated_at)],
          ].map(([label, value]) => (
            <div key={label} className="flex">
              <dt className="w-28 shrink-0 text-fg-tertiary">{label}</dt>
              <dd className="text-fg">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title="담당 컨설턴트">
        <dl className="space-y-2.5 text-body">
          <div className="flex">
            <dt className="w-28 shrink-0 text-fg-tertiary">주 담당</dt>
            <dd className="text-fg">{primary?.profile?.name ?? '미지정'}</dd>
          </div>
          <div className="flex">
            <dt className="w-28 shrink-0 text-fg-tertiary">공동 담당</dt>
            <dd className="text-fg">
              {cos.length ? cos.map((a) => a.profile?.name).filter(Boolean).join(', ') : '-'}
            </dd>
          </div>
        </dl>
      </Card>

      <Card title="진행 중인 활동" onMore={() => onNavigateTab('activity')}>
        {openActivities.length === 0 ? (
          <p className="text-body text-fg-tertiary">진행 중인 활동이 없습니다.</p>
        ) : (
          <ul className="space-y-2.5">
            {openActivities.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-body">
                <span className="truncate text-fg">
                  <Badge tone="outline">{STUDENT_ACTIVITY_CATEGORY_LABEL[a.category]}</Badge>
                  <span className="ml-1.5">{a.name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {a.due_date && <span className="text-caption text-fg-tertiary">{formatDate(a.due_date)}</span>}
                  <Badge tone={STUDENT_ACTIVITY_STATUS_TONE[a.status]}>
                    {STUDENT_ACTIVITY_STATUS_LABEL[a.status]}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="최근 활동" onMore={() => onNavigateTab('timeline')}>
        {recentActivities.length === 0 ? (
          <p className="text-body text-fg-tertiary">아직 활동 기록이 없습니다.</p>
        ) : (
          <ul className="space-y-2.5">
            {recentActivities.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-body">
                <span className="truncate text-fg">
                  <span className="mr-1.5 text-caption text-fg-tertiary">
                    {ACTIVITY_TYPE_LABEL[a.type] ?? a.type}
                  </span>
                  {a.summary}
                </span>
                <span className="shrink-0 text-caption text-fg-tertiary">{formatRelative(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
