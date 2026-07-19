import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getAiService } from '@/services/ai'
import {
  counselSectionContent,
  createMonthlyReport,
  fetchCounselReports,
  fetchMonthlyReports,
  formatTargetMonth,
} from '@/services/aiReports'
import { fetchMemos } from '@/services/memos'
import { fetchStudentActivities } from '@/services/studentActivities'
import { formatDateTime } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { AI_REPORT_STATUS_TONE, Badge } from '@/components/ui/Badge'
import { Input, Label, Textarea } from '@/components/ui/Field'
import { ListItem, SectionHeader } from '@/components/ui/ListItem'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { FadeIn } from '@/components/motion'
import {
  AI_REPORT_STATUS_LABEL,
  STUDENT_ACTIVITY_STATUS_LABEL,
  type MonthlyReport,
} from '@/types'
import { AiGeneratingIndicator } from './AiGeneratingIndicator'
import { MonthlyReportDetail } from './MonthlyReportDetail'

const GENERATE_MESSAGES = [
  '한 달간의 기록을 모으고 있습니다…',
  '상담·활동 내용을 정리하고 있습니다…',
  '학부모님께 전할 보고서를 작성하고 있습니다…',
]

function lastMonth(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// 프로토타입 수준 컨텍스트 조립: 대상 월의 메모/활동/상담보고서를 텍스트로 합친다.
// 실제 LLM 전환 시 Edge Function에서 서버측 조립로 이동한다 (source_text 스냅샷 구조는 유지).
async function buildMonthlyContext(
  studentId: string,
  targetMonth: string,
  note: string,
): Promise<string> {
  const [memos, activities, counselReports] = await Promise.all([
    fetchMemos(studentId),
    fetchStudentActivities(studentId),
    fetchCounselReports(studentId),
  ])
  const inMonth = (value: string | null) => Boolean(value?.startsWith(targetMonth))

  const lines: string[] = [`대상 월: ${targetMonth}`]

  const monthActivities = activities.filter(
    (a) => inMonth(a.created_at) || inMonth(a.completed_at) || inMonth(a.due_date),
  )
  if (monthActivities.length) {
    lines.push('\n[활동]')
    for (const a of monthActivities) {
      lines.push(`- ${a.name} (${STUDENT_ACTIVITY_STATUS_LABEL[a.status]})`)
    }
  }

  const monthMemos = memos.filter((m) => inMonth(m.created_at))
  if (monthMemos.length) {
    lines.push('\n[메모]')
    for (const m of monthMemos) lines.push(`- [${m.tag}] ${m.content}`)
  }

  const monthReports = counselReports.filter(
    (r) => inMonth(r.created_at) || inMonth(r.counsel_date),
  )
  if (monthReports.length) {
    lines.push('\n[상담보고서]')
    for (const r of monthReports) {
      const summary = counselSectionContent(r, '1Page Documentation')
      lines.push(`- ${r.title}${summary ? `: ${summary}` : ''}`)
    }
  }

  if (note.trim()) {
    lines.push('\n[참고 사항]')
    lines.push(note.trim())
  }

  return lines.join('\n')
}

export function MonthlyReportTab({
  studentId,
  studentName,
}: {
  studentId: string
  studentName: string
}) {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [targetMonth, setTargetMonth] = useState(lastMonth)
  const [note, setNote] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [existing, setExisting] = useState<MonthlyReport | null>(null)

  const { data: reports, isLoading } = useQuery({
    queryKey: ['monthlyReports', studentId],
    queryFn: () => fetchMonthlyReports(studentId),
  })

  const generateMutation = useMutation({
    mutationFn: async () => {
      const context = await buildMonthlyContext(studentId, targetMonth, note)
      const result = await getAiService().generateMonthlyReport(context)
      return createMonthlyReport({ studentId, targetMonth, sourceText: context, result })
    },
    onSuccess: (newId) => {
      setCreating(false)
      setNote('')
      setExisting(null)
      void queryClient.invalidateQueries({ queryKey: ['monthlyReports', studentId] })
      void queryClient.invalidateQueries({ queryKey: ['activities', studentId] })
      setSelectedId(newId)
    },
  })

  const handleGenerate = () => {
    const found = reports?.find((r) => r.target_month === targetMonth)
    if (found && !existing) {
      setExisting(found)
      return
    }
    generateMutation.mutate()
  }

  const selected = reports?.find((r) => r.id === selectedId)
  if (selected) {
    return (
      <MonthlyReportDetail
        report={selected}
        studentId={studentId}
        studentName={studentName}
        onBack={() => setSelectedId(null)}
      />
    )
  }

  if (generateMutation.isPending) {
    return <AiGeneratingIndicator messages={GENERATE_MESSAGES} />
  }

  if (creating) {
    return (
      <FadeIn className="space-y-4">
        <div className="rounded-card border border-line bg-surface p-5 shadow-card">
          <h3 className="mb-1 text-heading">월간 보고서 생성</h3>
          <p className="mb-4 text-body text-fg-secondary">
            대상 월의 상담·활동·메모 기록을 모아 학부모 전달용 보고서 초안을 작성합니다.
          </p>
          {generateMutation.isError && (
            <p className="mb-3 rounded-field bg-danger-soft px-3 py-2 text-body text-danger">
              보고서 생성에 실패했습니다. 다시 시도해 주세요.
            </p>
          )}
          {existing && (
            <div className="mb-3 rounded-field bg-warning-soft px-3 py-2.5">
              <p className="text-body text-warning">
                {formatTargetMonth(existing.target_month)} 보고서가 이미 있습니다. 새로 생성하면
                별도 보고서로 추가됩니다.
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setCreating(false)
                    setExisting(null)
                    setSelectedId(existing.id)
                  }}
                >
                  기존 보고서 보기
                </Button>
                <Button variant="secondary" size="sm" onClick={() => generateMutation.mutate()}>
                  그래도 생성
                </Button>
              </div>
            </div>
          )}
          <div className="space-y-4">
            <div>
              <Label required>대상 월</Label>
              <Input
                type="month"
                value={targetMonth}
                onChange={(e) => {
                  setTargetMonth(e.target.value)
                  setExisting(null)
                }}
                className="w-48"
              />
            </div>
            <div>
              <Label>참고 사항</Label>
              <Textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="보고서에 반영할 참고 사항이 있으면 입력하세요 (선택)"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setCreating(false)
                setExisting(null)
              }}
            >
              취소
            </Button>
            <Button disabled={!targetMonth || Boolean(existing)} onClick={handleGenerate}>
              {generateMutation.isError ? '재시도' : 'AI 보고서 생성'}
            </Button>
          </div>
        </div>
      </FadeIn>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>월간 보고서 생성</Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : !reports?.length ? (
        <EmptyState
          title="생성된 월간 보고서가 없습니다."
          description="대상 월을 선택하면 AI가 학부모 전달용 보고서 초안을 작성해 드립니다."
        />
      ) : (
        <div className="rounded-card border border-line bg-surface shadow-card">
          <SectionHeader title={`월간 보고서 (${reports.length})`} />
          <ul className="divide-y divide-line/60 pb-2">
            {reports.map((report) => (
              <li key={report.id}>
                <ListItem
                  onClick={() => setSelectedId(report.id)}
                  title={`${formatTargetMonth(report.target_month)} 월간 보고서`}
                  subtitle={`${formatDateTime(report.created_at)} 생성`}
                  trailing={
                    <Badge tone={AI_REPORT_STATUS_TONE[report.status]}>
                      {AI_REPORT_STATUS_LABEL[report.status]}
                    </Badge>
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
