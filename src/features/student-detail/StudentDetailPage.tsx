import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchStudent, softDeleteStudent } from '@/services/students'
import { useGroup } from '@/features/group/GroupProvider'
import { StudentFormModal } from '@/features/students/StudentFormModal'
import { SummaryTab } from './SummaryTab'
import { TimelineTab } from './TimelineTab'
import { MemoTab } from './MemoTab'
import { ActivityTab } from './ActivityTab'
import { CounselReportTab } from './CounselReportTab'
import { KakaoAnalysisTab } from './KakaoAnalysisTab'
import { MonthlyReportTab } from './MonthlyReportTab'
import { PlaceholderTab } from './PlaceholderTab'
import { Button } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/Tabs'
import { Badge, STUDENT_STATUS_TONE } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { FadeIn } from '@/components/motion'
import { STUDENT_STATUS_LABEL } from '@/types'

const TABS = [
  { key: 'summary', label: '요약' },
  { key: 'timeline', label: '타임라인' },
  { key: 'memo', label: '메모' },
  { key: 'activity', label: '활동 관리' },
  { key: 'counsel', label: '상담보고서' },
  { key: 'kakao', label: '카카오톡 분석' },
  { key: 'schedule', label: '일정' },
  { key: 'monthly', label: '월간 보고서' },
  { key: 'files', label: '파일' },
] as const

type TabKey = (typeof TABS)[number]['key']

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isOwner } = useGroup()
  const [tab, setTab] = useState<TabKey>('summary')
  const [editOpen, setEditOpen] = useState(false)

  const { data: student, isLoading } = useQuery({
    queryKey: ['student', id],
    queryFn: () => fetchStudent(id!),
    enabled: Boolean(id),
  })

  if (isLoading) return <Spinner className="h-full" />
  if (!student) {
    return (
      <div className="mx-auto max-w-4xl px-8 py-16">
        <EmptyState
          title="학생을 찾을 수 없습니다."
          description="삭제되었거나 접근 권한이 없는 학생입니다."
          action={
            <Button variant="secondary" onClick={() => navigate('/students')}>
              목록으로
            </Button>
          }
        />
      </div>
    )
  }

  const handleDelete = async () => {
    if (!window.confirm(`${student.name} 학생을 삭제할까요?\n삭제 후에도 데이터는 보관되며 복구할 수 있습니다.`)) return
    await softDeleteStudent(student.id)
    void queryClient.invalidateQueries({ queryKey: ['students'] })
    navigate('/students', { replace: true })
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <button
        onClick={() => navigate('/students')}
        className="mb-4 text-body text-fg-tertiary transition-colors hover:text-fg"
      >
        ← 학생 목록
      </button>

      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={student.name} />
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-title">{student.name}</h1>
              <Badge tone={STUDENT_STATUS_TONE[student.status]}>
                {STUDENT_STATUS_LABEL[student.status]}
              </Badge>
            </div>
            <p className="mt-1 text-body text-fg-secondary">
              {student.school} {student.grade}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
            정보 수정
          </Button>
          {isOwner && (
            <Button variant="danger" size="sm" onClick={() => void handleDelete()}>
              삭제
            </Button>
          )}
        </div>
      </div>

      <Tabs items={TABS} value={tab} onChange={setTab} />

      {/* key=tab: 탭 전환 시 콘텐츠 페이드인 재생 */}
      <FadeIn key={tab}>
        {tab === 'summary' && <SummaryTab student={student} onNavigateTab={(k) => setTab(k as TabKey)} />}
        {tab === 'timeline' && <TimelineTab studentId={student.id} />}
        {tab === 'memo' && <MemoTab studentId={student.id} />}
        {tab === 'activity' && <ActivityTab studentId={student.id} />}
        {tab === 'counsel' && <CounselReportTab student={student} />}
        {tab === 'kakao' && <KakaoAnalysisTab studentId={student.id} />}
        {tab === 'schedule' && <PlaceholderTab label="일정" phase="3차" />}
        {tab === 'monthly' && <MonthlyReportTab studentId={student.id} studentName={student.name} />}
        {tab === 'files' && <PlaceholderTab label="파일" phase="3차" />}
      </FadeIn>

      <StudentFormModal open={editOpen} onClose={() => setEditOpen(false)} student={student} />
    </div>
  )
}
