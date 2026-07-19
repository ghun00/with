import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { getAiService } from '@/services/ai'
import { counselResultToSections, fetchCounselReports } from '@/services/aiReports'
import { formatDate, formatDateTime } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ListItem, SectionHeader } from '@/components/ui/ListItem'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { FadeIn } from '@/components/motion'
import {
  COUNSEL_REPORT_METHOD_LABEL,
  type CounselReport,
  type Student,
} from '@/types'
import { AiSourceInput } from './AiSourceInput'
import { AiGeneratingIndicator } from './AiGeneratingIndicator'
import {
  COUNSEL_TEMPLATE_SECTIONS,
  CounselReportEditorModal,
  type CounselReportEditorDraft,
} from './CounselReportEditorModal'

const GENERATE_MESSAGES = [
  '상담 원문을 분석하고 있습니다…',
  '핵심 내용을 정리하고 있습니다…',
  '보고서를 작성하고 있습니다…',
]

// 직접 작성: 기본 템플릿이 적용된 빈 문서 (editReport.md 3차 §3·§6)
function manualDraft(): CounselReportEditorDraft {
  return {
    title: `${formatDate(new Date())} 상담보고서`,
    method: 'manual',
    counselDate: new Date().toISOString().slice(0, 10),
    sections: COUNSEL_TEMPLATE_SECTIONS,
    sourceText: '',
  }
}

function reportToDraft(report: CounselReport): CounselReportEditorDraft {
  return {
    reportId: report.id,
    title: report.title,
    method: report.method,
    counselDate: report.counsel_date,
    authorName: report.author?.name,
    sections: report.result.sections,
    sourceText: report.source_text,
  }
}

export function CounselReportTab({ student }: { student: Student }) {
  const [aiInputOpen, setAiInputOpen] = useState(false)
  const [sourceText, setSourceText] = useState('')
  const [editorDraft, setEditorDraft] = useState<CounselReportEditorDraft | null>(null)

  const { data: reports, isLoading } = useQuery({
    queryKey: ['counselReports', student.id],
    queryFn: () => fetchCounselReports(student.id),
  })

  // AI 생성은 저장하지 않고 결과가 입력된 편집 상태의 에디터를 연다 — 검토·수정 후 저장 (editReport.md 3차 §9)
  const generateMutation = useMutation({
    mutationFn: () => getAiService().generateCounselReport(sourceText.trim()),
    onSuccess: (result) => {
      setEditorDraft({
        title: `${result.counsel_date} 상담보고서`,
        method: 'ai',
        counselDate: result.counsel_date || null,
        sections: counselResultToSections(result),
        sourceText: sourceText.trim(),
      })
      setAiInputOpen(false)
      setSourceText('')
    },
  })

  if (generateMutation.isPending) {
    return <AiGeneratingIndicator messages={GENERATE_MESSAGES} />
  }

  if (aiInputOpen) {
    return (
      <FadeIn className="space-y-4">
        <div className="rounded-card border border-line bg-surface p-5 shadow-card">
          <h3 className="mb-1 text-heading">AI 상담보고서 생성</h3>
          <p className="mb-4 text-body text-fg-secondary">
            상담 원문을 붙여넣거나 TXT 파일을 업로드하면 AI가 보고서 초안을 작성합니다. 생성된
            내용은 편집 화면에서 검토·수정 후 저장됩니다.
          </p>
          {generateMutation.isError && (
            <p className="mb-3 rounded-field bg-danger-soft px-3 py-2 text-body text-danger">
              보고서 생성에 실패했습니다. 원문은 유지되니 다시 시도해 주세요.
            </p>
          )}
          <AiSourceInput
            value={sourceText}
            onChange={setSourceText}
            placeholder="상담 원문을 입력하세요"
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAiInputOpen(false)}>
              취소
            </Button>
            <Button disabled={!sourceText.trim()} onClick={() => generateMutation.mutate()}>
              {generateMutation.isError ? '재시도' : 'AI 보고서 생성'}
            </Button>
          </div>
        </div>
      </FadeIn>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setAiInputOpen(true)}>
          AI 상담보고서 생성
        </Button>
        <Button onClick={() => setEditorDraft(manualDraft())}>상담보고서 작성</Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : !reports?.length ? (
        <EmptyState
          title="작성된 상담보고서가 없습니다."
          description="직접 작성하거나, 상담 원문으로 AI 초안을 만들어 시작하세요."
        />
      ) : (
        <div className="rounded-card border border-line bg-surface shadow-card">
          <SectionHeader title={`상담보고서 (${reports.length})`} />
          <ul className="divide-y divide-line/60 pb-2">
            {reports.map((report) => (
              <li key={report.id}>
                <ListItem
                  onClick={() => setEditorDraft(reportToDraft(report))}
                  title={report.title || '상담보고서'}
                  subtitle={[
                    report.counsel_date && `상담 일시 ${formatDate(report.counsel_date)}`,
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

      <CounselReportEditorModal
        draft={editorDraft}
        student={student}
        onClose={() => setEditorDraft(null)}
      />
    </div>
  )
}
