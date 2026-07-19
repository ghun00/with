import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getAiService, type KakaoAnalysisResult } from '@/services/ai'
import {
  finalizeAiReport,
  regenerateAiReportResult,
  updateAiReportResult,
} from '@/services/aiReports'
import { formatDate, formatDateTime } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { AI_REPORT_STATUS_TONE, Badge } from '@/components/ui/Badge'
import { Label, Textarea } from '@/components/ui/Field'
import { StaggerItem, StaggerList } from '@/components/motion'
import { AI_REPORT_STATUS_LABEL, type KakaoAnalysis } from '@/types'
import { AiGeneratingIndicator } from './AiGeneratingIndicator'
import { TodoRegisterModal } from './TodoRegisterModal'

// 카카오톡 분석 목록형 항목 (prd §6.8) — 날짜별 주요 대화는 별도 렌더링
const LIST_SECTIONS: { key: keyof Omit<KakaoAnalysisResult, 'daily_highlights' | 'warnings'>; label: string; reference?: boolean }[] = [
  { key: 'requests', label: '요청 사항' },
  { key: 'decisions', label: '결정 사항' },
  { key: 'student_todos', label: '학생 To Do' },
  { key: 'consultant_todos', label: '컨설턴트 To Do' },
  { key: 'issues', label: '중요 이슈' },
  { key: 'risk_signals', label: '감정·위험 신호', reference: true },
]

const REGENERATE_MESSAGES = [
  '대화 내용을 다시 분석하고 있습니다…',
  '날짜별 핵심 대화를 정리하고 있습니다…',
  '분석 결과를 작성하고 있습니다…',
]

// 수정 폼에서 날짜별 주요 대화는 '날짜 | 내용' 한 줄 형식으로 다룬다
function highlightsToText(highlights: { date: string; summary: string }[]): string {
  return highlights.map((h) => `${h.date} | ${h.summary}`).join('\n')
}

function textToHighlights(text: string): { date: string; summary: string }[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const sep = line.indexOf('|')
      if (sep === -1) return { date: '', summary: line }
      return { date: line.slice(0, sep).trim(), summary: line.slice(sep + 1).trim() }
    })
}

function analysisPeriod(highlights: { date: string; summary: string }[]): string | null {
  const dates = highlights.map((h) => h.date).filter(Boolean).sort()
  if (dates.length === 0) return null
  const from = formatDate(dates[0])
  const to = formatDate(dates[dates.length - 1])
  return from === to ? from : `${from} ~ ${to}`
}

export function KakaoAnalysisDetail({
  analysis,
  studentId,
  onBack,
}: {
  analysis: KakaoAnalysis
  studentId: string
  onBack: () => void
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [todoOpen, setTodoOpen] = useState(false)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['kakaoAnalyses', studentId] })
    void queryClient.invalidateQueries({ queryKey: ['activities', studentId] })
  }

  const startEditing = () => {
    const draftInit: Record<string, string> = {
      daily_highlights: highlightsToText(analysis.result.daily_highlights),
    }
    for (const { key } of LIST_SECTIONS) draftInit[key] = analysis.result[key].join('\n')
    setDraft(draftInit)
    setEditing(true)
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const result: Record<string, unknown> = {
        daily_highlights: textToHighlights(draft.daily_highlights ?? ''),
      }
      for (const { key } of LIST_SECTIONS) {
        result[key] = (draft[key] ?? '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
      }
      return updateAiReportResult('kakao_analyses', analysis.id, result)
    },
    onSuccess: () => {
      setEditing(false)
      invalidate()
    },
  })

  const finalizeMutation = useMutation({
    mutationFn: () => finalizeAiReport('kakao_analyses', analysis.id, studentId),
    onSuccess: invalidate,
  })

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const result = await getAiService().analyzeKakaoChat({ studentId, rawText: analysis.source_text })
      await regenerateAiReportResult('kakao_analyses', analysis.id, studentId, { ...result })
    },
    onSuccess: invalidate,
  })

  const handleRegenerate = () => {
    if (!window.confirm('재분석하면 현재 결과(수정 포함)가 새 결과로 대체됩니다. 계속할까요?')) return
    regenerateMutation.mutate()
  }

  if (regenerateMutation.isPending) {
    return <AiGeneratingIndicator messages={REGENERATE_MESSAGES} />
  }

  const period = analysisPeriod(analysis.result.daily_highlights)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-body text-fg-tertiary transition-colors hover:text-fg"
        >
          ← 분석 목록
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
              <Button variant="secondary" size="sm" onClick={() => setTodoOpen(true)}>
                To Do 등록
              </Button>
              <Button variant="secondary" size="sm" onClick={handleRegenerate}>
                재분석
              </Button>
              <Button variant="secondary" size="sm" onClick={startEditing}>
                수정
              </Button>
              {analysis.status === 'draft' && (
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
        <Badge tone={AI_REPORT_STATUS_TONE[analysis.status]}>
          {AI_REPORT_STATUS_LABEL[analysis.status]}
        </Badge>
        <span className="text-caption text-fg-tertiary">
          {formatDateTime(analysis.created_at)} 분석
          {period && ` · 분석 대상 기간 ${period}`}
        </span>
      </div>

      {(saveMutation.isError || finalizeMutation.isError || regenerateMutation.isError) && (
        <p className="rounded-field bg-danger-soft px-3 py-2 text-body text-danger">
          처리에 실패했습니다. 다시 시도해 주세요.
        </p>
      )}

      {editing ? (
        <div className="space-y-4 rounded-card border border-line bg-surface p-5 shadow-card">
          <div>
            <Label>
              날짜별 주요 대화
              <span className="ml-1.5 text-caption text-fg-tertiary">
                (한 줄에 한 항목, '날짜 | 내용' 형식)
              </span>
            </Label>
            <Textarea
              rows={4}
              value={draft.daily_highlights ?? ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, daily_highlights: e.target.value }))}
            />
          </div>
          {LIST_SECTIONS.map(({ key, label }) => (
            <div key={key}>
              <Label>
                {label}
                <span className="ml-1.5 text-caption text-fg-tertiary">(한 줄에 한 항목)</span>
              </Label>
              <Textarea
                rows={3}
                value={draft[key] ?? ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      ) : (
        <StaggerList className="space-y-3">
          <StaggerItem>
            <div className="rounded-card border border-line bg-surface p-5 shadow-card">
              <h3 className="mb-2 text-label font-semibold text-fg-secondary">날짜별 주요 대화</h3>
              {analysis.result.daily_highlights.length === 0 ? (
                <p className="text-body text-fg-tertiary">항목 없음</p>
              ) : (
                <ul className="space-y-2">
                  {analysis.result.daily_highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="shrink-0 pt-0.5 text-caption font-medium text-fg-tertiary">
                        {h.date ? formatDate(h.date) : '-'}
                      </span>
                      <span className="text-body text-fg">{h.summary}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </StaggerItem>
          {LIST_SECTIONS.map(({ key, label, reference }) => {
            const items = analysis.result[key]
            return (
              <StaggerItem key={key}>
                <div className="rounded-card border border-line bg-surface p-5 shadow-card">
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-label font-semibold text-fg-secondary">{label}</h3>
                    {reference && <Badge tone="outline">참고 정보</Badge>}
                  </div>
                  {items.length === 0 ? (
                    <p className="text-body text-fg-tertiary">
                      {reference ? '감지된 신호가 없습니다.' : '항목 없음'}
                    </p>
                  ) : (
                    <ul className="list-disc space-y-1 pl-5">
                      {items.map((item, i) => (
                        <li
                          key={i}
                          className={`text-body ${item === '확인 필요' ? 'text-fg-tertiary' : 'text-fg'}`}
                        >
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </StaggerItem>
            )
          })}
          <StaggerItem>
            <details className="rounded-card border border-line bg-surface shadow-card">
              <summary className="cursor-pointer px-5 py-4 text-label font-semibold text-fg-secondary transition-colors hover:text-fg">
                대화 원문 보기
              </summary>
              <p className="whitespace-pre-wrap border-t border-line/60 px-5 py-4 text-body text-fg-secondary">
                {analysis.source_text}
              </p>
            </details>
          </StaggerItem>
        </StaggerList>
      )}

      <TodoRegisterModal
        open={todoOpen}
        onClose={() => setTodoOpen(false)}
        studentId={studentId}
        studentTodos={analysis.result.student_todos}
        consultantTodos={analysis.result.consultant_todos}
      />
    </div>
  )
}
