import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { getAiService } from '@/services/ai'
import {
  fetchMonthlyReports,
  formatTargetMonth,
  monthlyResultToSections,
  sectionsToMarkdown,
} from '@/services/aiReports'
import { formatDateTime } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input, Label, Textarea } from '@/components/ui/Field'
import { ListItem, SectionHeader } from '@/components/ui/ListItem'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { FadeIn } from '@/components/motion'
import { COUNSEL_REPORT_METHOD_LABEL, type MonthlyReport, type Student } from '@/types'
import { AiGeneratingIndicator } from './AiGeneratingIndicator'
import { ReportEditorModal, type ReportEditorDraft } from './ReportEditorModal'

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

function reportToDraft(report: MonthlyReport): ReportEditorDraft {
  return {
    kind: 'monthly',
    reportId: report.id,
    title: report.title,
    method: report.method,
    targetMonth: report.target_month,
    authorName: report.author?.name,
    markdown: report.result.markdown ?? sectionsToMarkdown(report.result.sections),
    sourceText: report.source_text,
  }
}

export function MonthlyReportTab({ student }: { student: Student }) {
  const [creating, setCreating] = useState(false)
  const [targetMonth, setTargetMonth] = useState(lastMonth)
  const [note, setNote] = useState('')
  const [existing, setExisting] = useState<MonthlyReport | null>(null)
  const [editorDraft, setEditorDraft] = useState<ReportEditorDraft | null>(null)

  const { data: reports, isLoading } = useQuery({
    queryKey: ['monthlyReports', student.id],
    queryFn: () => fetchMonthlyReports(student.id),
  })

  // AI 생성은 저장하지 않고 결과가 입력된 편집 상태의 Report Modal을 연다 — 검토·수정 후 저장 (editReport.md 4차 §8)
  // 컨텍스트 조립은 Edge Function이 수행하고 source_context로 돌려준다 (source_text 스냅샷 유지)
  const generateMutation = useMutation({
    mutationFn: () =>
      getAiService().generateMonthlyReport({
        studentId: student.id,
        targetMonth,
        note: note.trim() || undefined,
      }),
    onSuccess: (result) => {
      setEditorDraft({
        kind: 'monthly',
        title: `${formatTargetMonth(targetMonth)} 월간보고서`,
        method: 'ai',
        targetMonth,
        markdown: sectionsToMarkdown(monthlyResultToSections(result)),
        sourceText: result.source_context ?? '',
      })
      setCreating(false)
      setNote('')
      setExisting(null)
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

  if (generateMutation.isPending) {
    return <AiGeneratingIndicator messages={GENERATE_MESSAGES} />
  }

  if (creating) {
    return (
      <FadeIn className="space-y-4">
        <div className="rounded-card border border-line bg-surface p-5 shadow-card">
          <h3 className="mb-1 text-heading">월간 보고서 생성</h3>
          <p className="mb-4 text-body text-fg-secondary">
            대상 월의 상담·활동·메모 기록을 모아 학부모 전달용 보고서 초안을 작성합니다. 생성된
            내용은 편집 화면에서 검토·수정 후 저장됩니다.
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
                    setEditorDraft(reportToDraft(existing))
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
                  onClick={() => setEditorDraft(reportToDraft(report))}
                  title={report.title || `${formatTargetMonth(report.target_month)} 월간보고서`}
                  subtitle={[
                    report.author?.name,
                    `수정 ${formatDateTime(report.updated_at)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  trailing={
                    <Badge tone="outline">{COUNSEL_REPORT_METHOD_LABEL[report.method]}</Badge>
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      <ReportEditorModal
        draft={editorDraft}
        student={student}
        onClose={() => setEditorDraft(null)}
      />
    </div>
  )
}
