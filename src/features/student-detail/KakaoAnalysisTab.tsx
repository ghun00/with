import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getAiService, MAX_AI_SOURCE_LENGTH } from '@/services/ai'
import {
  createKakaoAnalysis,
  fetchKakaoAnalyses,
  findKakaoAnalysisByHash,
} from '@/services/aiReports'
import { sha256Hex } from '@/lib/hash'
import { formatDate, formatDateTime } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { AI_REPORT_STATUS_TONE, Badge } from '@/components/ui/Badge'
import { ListItem, SectionHeader } from '@/components/ui/ListItem'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { FadeIn } from '@/components/motion'
import { AI_REPORT_STATUS_LABEL, type KakaoAnalysis } from '@/types'
import { AiSourceInput } from './AiSourceInput'
import { AiGeneratingIndicator } from './AiGeneratingIndicator'
import { KakaoAnalysisDetail } from './KakaoAnalysisDetail'

const GENERATE_MESSAGES = [
  '대화 내용을 읽고 있습니다…',
  '날짜별 핵심 대화를 정리하고 있습니다…',
  '요청·결정 사항을 추출하고 있습니다…',
]

export function KakaoAnalysisTab({ studentId }: { studentId: string }) {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [sourceText, setSourceText] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // 완전 중복 감지 결과 (prd §6.8 중복 안내 — 원문 해시 동일 건만)
  const [duplicate, setDuplicate] = useState<{ existing: KakaoAnalysis; hash: string } | null>(null)

  const { data: analyses, isLoading } = useQuery({
    queryKey: ['kakaoAnalyses', studentId],
    queryFn: () => fetchKakaoAnalyses(studentId),
  })

  const generateMutation = useMutation({
    mutationFn: async ({ hash }: { hash: string }) => {
      const text = sourceText.trim()
      const result = await getAiService().analyzeKakaoChat({ studentId, rawText: text })
      return createKakaoAnalysis({ studentId, sourceText: text, sourceHash: hash, result })
    },
    onSuccess: (newId) => {
      setCreating(false)
      setSourceText('')
      setDuplicate(null)
      void queryClient.invalidateQueries({ queryKey: ['kakaoAnalyses', studentId] })
      void queryClient.invalidateQueries({ queryKey: ['activities', studentId] })
      setSelectedId(newId)
    },
  })

  const checkMutation = useMutation({
    mutationFn: async () => {
      const hash = await sha256Hex(sourceText.trim())
      const existing = await findKakaoAnalysisByHash(studentId, hash)
      return { existing, hash }
    },
    onSuccess: ({ existing, hash }) => {
      if (existing) setDuplicate({ existing, hash })
      else generateMutation.mutate({ hash })
    },
  })

  const selected = analyses?.find((a) => a.id === selectedId)
  if (selected) {
    return (
      <KakaoAnalysisDetail
        analysis={selected}
        studentId={studentId}
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
          <h3 className="mb-1 text-heading">카카오톡 대화 등록</h3>
          <p className="mb-4 text-body text-fg-secondary">
            카카오톡 대화 내보내기(TXT) 파일을 업로드하거나 내용을 붙여넣으면 AI가 분석합니다.
          </p>
          {(checkMutation.isError || generateMutation.isError) && (
            <p className="mb-3 rounded-field bg-danger-soft px-3 py-2 text-body text-danger">
              분석에 실패했습니다. 원문은 유지되니 다시 시도해 주세요.
            </p>
          )}
          {duplicate && (
            <div className="mb-3 rounded-field bg-warning-soft px-3 py-2.5">
              <p className="text-body text-warning">
                동일한 대화 원문이 이미 분석되어 있습니다. ({formatDate(duplicate.existing.created_at)}{' '}
                분석)
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setCreating(false)
                    setDuplicate(null)
                    setSelectedId(duplicate.existing.id)
                  }}
                >
                  기존 결과 보기
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => generateMutation.mutate({ hash: duplicate.hash })}
                >
                  그래도 분석
                </Button>
              </div>
            </div>
          )}
          <AiSourceInput
            value={sourceText}
            onChange={(v) => {
              setSourceText(v)
              setDuplicate(null)
            }}
            placeholder="카카오톡 대화 내용을 입력하세요"
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setCreating(false)
                setDuplicate(null)
              }}
            >
              취소
            </Button>
            <Button
              disabled={
                !sourceText.trim() ||
                sourceText.trim().length > MAX_AI_SOURCE_LENGTH ||
                checkMutation.isPending ||
                Boolean(duplicate)
              }
              onClick={() => checkMutation.mutate()}
            >
              {checkMutation.isPending
                ? '확인 중...'
                : checkMutation.isError || generateMutation.isError
                  ? '재시도'
                  : 'AI 분석'}
            </Button>
          </div>
        </div>
      </FadeIn>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>대화 분석</Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : !analyses?.length ? (
        <EmptyState
          title="분석된 대화가 없습니다."
          description="카카오톡 대화를 등록하면 AI가 요청·결정 사항과 To Do를 추출해 드립니다."
        />
      ) : (
        <div className="rounded-card border border-line bg-surface shadow-card">
          <SectionHeader title={`카카오톡 분석 (${analyses.length})`} />
          <ul className="divide-y divide-line/60 pb-2">
            {analyses.map((analysis) => (
              <li key={analysis.id}>
                <ListItem
                  onClick={() => setSelectedId(analysis.id)}
                  title={
                    analysis.result.daily_highlights[0]?.summary.slice(0, 40) || '카카오톡 분석'
                  }
                  subtitle={`${formatDateTime(analysis.created_at)} 분석`}
                  trailing={
                    <Badge tone={AI_REPORT_STATUS_TONE[analysis.status]}>
                      {AI_REPORT_STATUS_LABEL[analysis.status]}
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
