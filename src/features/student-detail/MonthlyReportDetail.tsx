import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getAiService } from '@/services/ai'
import {
  finalizeAiReport,
  formatTargetMonth,
  regenerateAiReportResult,
  updateAiReportResult,
} from '@/services/aiReports'
import { formatDateTime } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { AI_REPORT_STATUS_TONE, Badge } from '@/components/ui/Badge'
import { Label, Textarea } from '@/components/ui/Field'
import { StaggerItem, StaggerList } from '@/components/motion'
import {
  AI_REPORT_STATUS_LABEL,
  MONTHLY_REPORT_SECTIONS,
  type MonthlyReport,
} from '@/types'
import { AiGeneratingIndicator } from './AiGeneratingIndicator'

const REGENERATE_MESSAGES = [
  '한 달간의 기록을 다시 살펴보고 있습니다…',
  '주요 성과를 정리하고 있습니다…',
  '보고서를 작성하고 있습니다…',
]

// 대상 월의 첫날~마지막날 (prd §7: 대상 기간 명시)
function monthPeriod(targetMonth: string): string {
  const [year, month] = targetMonth.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  const mm = String(month).padStart(2, '0')
  return `${year}.${mm}.01 ~ ${year}.${mm}.${lastDay}`
}

function toPlainText(report: MonthlyReport): string {
  const title = `${formatTargetMonth(report.target_month)} 월간 보고서`
  const body = MONTHLY_REPORT_SECTIONS.map(
    ({ key, label }) => `■ ${label}\n${report.result[key]}`,
  ).join('\n\n')
  return `${title}\n대상 기간: ${monthPeriod(report.target_month)}\n\n${body}`
}

export function MonthlyReportDetail({
  report,
  studentId,
  studentName,
  onBack,
}: {
  report: MonthlyReport
  studentId: string
  studentName: string
  onBack: () => void
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<number>()

  useEffect(() => () => window.clearTimeout(copiedTimer.current), [])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['monthlyReports', studentId] })
    void queryClient.invalidateQueries({ queryKey: ['activities', studentId] })
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const result: Record<string, unknown> = {}
      for (const { key } of MONTHLY_REPORT_SECTIONS) result[key] = draft[key] ?? ''
      return updateAiReportResult('monthly_reports', report.id, result)
    },
    onSuccess: () => {
      setEditing(false)
      invalidate()
    },
  })

  const finalizeMutation = useMutation({
    mutationFn: () => finalizeAiReport('monthly_reports', report.id, studentId),
    onSuccess: invalidate,
  })

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const result = await getAiService().generateMonthlyReport(report.source_text)
      await regenerateAiReportResult('monthly_reports', report.id, studentId, { ...result })
    },
    onSuccess: invalidate,
  })

  const handleRegenerate = () => {
    if (!window.confirm('재생성하면 기존 수정 내용이 사라집니다. 계속할까요?')) return
    regenerateMutation.mutate()
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(toPlainText(report))
    setCopied(true)
    window.clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopied(false), 1500)
  }

  const startEditing = () => {
    const draftInit: Record<string, string> = {}
    for (const { key } of MONTHLY_REPORT_SECTIONS) draftInit[key] = report.result[key]
    setDraft(draftInit)
    setEditing(true)
  }

  if (regenerateMutation.isPending) {
    return <AiGeneratingIndicator messages={REGENERATE_MESSAGES} />
  }

  const title = `${formatTargetMonth(report.target_month)} 월간 보고서`

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-body text-fg-tertiary transition-colors hover:text-fg"
        >
          ← 보고서 목록
        </button>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
                취소
              </Button>
              <Button
                size="sm"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? '저장 중...' : '저장'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={() => void handleCopy()}>
                {copied ? '복사됨' : '전체 복사'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => window.print()}>
                PDF 저장
              </Button>
              <Button variant="secondary" size="sm" onClick={handleRegenerate}>
                재생성
              </Button>
              <Button variant="secondary" size="sm" onClick={startEditing}>
                수정
              </Button>
              {report.status === 'draft' && (
                <Button
                  size="sm"
                  disabled={finalizeMutation.isPending}
                  onClick={() => finalizeMutation.mutate()}
                >
                  확정
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge tone={AI_REPORT_STATUS_TONE[report.status]}>
          {AI_REPORT_STATUS_LABEL[report.status]}
        </Badge>
        <span className="text-caption text-fg-tertiary">
          대상 기간 {monthPeriod(report.target_month)} · {formatDateTime(report.created_at)} 생성
        </span>
      </div>

      {(saveMutation.isError || finalizeMutation.isError || regenerateMutation.isError) && (
        <p className="rounded-field bg-danger-soft px-3 py-2 text-body text-danger">
          처리에 실패했습니다. 다시 시도해 주세요.
        </p>
      )}

      {editing ? (
        <div className="space-y-4 rounded-card border border-line bg-surface p-5 shadow-card">
          {MONTHLY_REPORT_SECTIONS.map(({ key, label }) => (
            <div key={key}>
              <Label>{label}</Label>
              <Textarea
                rows={4}
                value={draft[key] ?? ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="print-area">
          <StaggerList className="space-y-3">
            <StaggerItem>
              <div className="hidden print:block">
                <h2 className="text-title">
                  {studentName} · {title}
                </h2>
                <p className="mt-1 text-caption text-fg-secondary">
                  대상 기간 {monthPeriod(report.target_month)}
                </p>
              </div>
            </StaggerItem>
            {MONTHLY_REPORT_SECTIONS.map(({ key, label }) => {
              const value = report.result[key]
              return (
                <StaggerItem key={key}>
                  <div className="rounded-card border border-line bg-surface p-5 shadow-card">
                    <h3 className="mb-2 text-label font-semibold text-fg-secondary">{label}</h3>
                    <p
                      className={`whitespace-pre-wrap text-body ${value === '확인 필요' ? 'text-fg-tertiary' : 'text-fg'}`}
                    >
                      {value || '-'}
                    </p>
                  </div>
                </StaggerItem>
              )
            })}
          </StaggerList>
        </div>
      )}
    </div>
  )
}
