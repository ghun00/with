// 카카오톡 분석 task — 학생 컨텍스트 주입 → 생성 패스 → 검증 패스
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { AiError } from '../http.ts'
import { COMMON_RULES, callClaudeJson } from '../claude.ts'
import { buildStudentContext } from '../studentContext.ts'
import { verifyResult } from '../verify.ts'

// 프론트 KakaoAnalysisResult(src/services/ai/index.ts)와 1:1 — 필드 변경 금지
interface KakaoAnalysisResult {
  daily_highlights: { date: string; summary: string }[]
  requests: string[]
  decisions: string[]
  student_todos: string[]
  consultant_todos: string[]
  issues: string[]
  risk_signals: string[]
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'daily_highlights',
    'requests',
    'decisions',
    'student_todos',
    'consultant_todos',
    'issues',
    'risk_signals',
  ],
  properties: {
    daily_highlights: {
      type: 'array',
      description: '날짜별 주요 대화 요약. 대화가 있었던 날짜마다 1개 항목.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'summary'],
        properties: {
          date: { type: 'string', description: '대화 날짜 (YYYY-MM-DD). 특정 불가하면 빈 문자열.' },
          summary: { type: 'string', description: '그날 대화의 핵심 요약 (1~2문장)' },
        },
      },
    },
    requests: { type: 'array', items: { type: 'string' }, description: '학생·학부모의 요청 사항' },
    decisions: { type: 'array', items: { type: 'string' }, description: '대화에서 확정된 최종 결정 사항' },
    student_todos: { type: 'array', items: { type: 'string' }, description: '학생이 해야 할 일' },
    consultant_todos: { type: 'array', items: { type: 'string' }, description: '컨설턴트가 해야 할 일' },
    issues: { type: 'array', items: { type: 'string' }, description: '주의가 필요한 중요 이슈' },
    risk_signals: {
      type: 'array',
      items: { type: 'string' },
      description: '학생의 감정 변화·위험 신호 (스트레스, 갈등, 무기력 등). 근거가 있는 것만.',
    },
  },
}

const SYSTEM = `너는 학생부종합전형(학종) 컨설팅 회사의 상담 기록 분석가다. 카카오톡 대화 내보내기 원문을 읽고 컨설턴트가 챙겨야 할 정보를 추출한다. 대화명은 [학생 정보]의 인물과 대조해 학생/학부모/컨설턴트를 구분한다.

${COMMON_RULES}`

export async function runKakaoAnalysis(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<KakaoAnalysisResult & { warnings: string[] }> {
  const studentId = typeof body.student_id === 'string' ? body.student_id : ''
  const rawText = typeof body.raw_text === 'string' ? body.raw_text.trim() : ''
  if (!studentId || !rawText)
    throw new AiError('invalid_request', 'student_id와 raw_text가 필요합니다.')

  const studentContext = await buildStudentContext(supabase, studentId)

  const generated = await callClaudeJson<KakaoAnalysisResult>({
    system: `${SYSTEM}\n\n${studentContext}`,
    userText: `[카카오톡 대화 원문]\n${rawText}`,
    schema: SCHEMA,
  })

  return verifyResult({
    taskLabel: '카카오톡 분석',
    studentContext,
    sourceText: rawText,
    generated,
    schema: SCHEMA,
  })
}
