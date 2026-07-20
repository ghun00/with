// 상담보고서 생성 task — 학생 컨텍스트 주입 → 생성 패스 → 검증 패스
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { AiError } from '../http.ts'
import { COMMON_RULES, callClaudeJson } from '../claude.ts'
import { buildStudentContext } from '../studentContext.ts'
import { verifyResult } from '../verify.ts'

// 프론트 CounselReportResult(src/services/ai/index.ts)와 1:1 — 필드 변경 금지
interface CounselReportResult {
  counsel_date: string
  purpose: string
  discussion: string
  student_status: string
  decisions: string[]
  student_todos: string[]
  consultant_todos: string[]
  next_plan: string
  summary: string
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'counsel_date',
    'purpose',
    'discussion',
    'student_status',
    'decisions',
    'student_todos',
    'consultant_todos',
    'next_plan',
    'summary',
  ],
  properties: {
    counsel_date: {
      type: 'string',
      description: '상담이 진행된 날짜 (YYYY-MM-DD). 원문에서 특정할 수 없으면 빈 문자열.',
    },
    purpose: { type: 'string', description: '이번 상담의 목적' },
    discussion: { type: 'string', description: '주요 논의 내용 (서술형, 시간 순)' },
    student_status: { type: 'string', description: '학생의 현재 학업·활동·심리 상태' },
    decisions: { type: 'array', items: { type: 'string' }, description: '상담에서 확정된 최종 결정 사항' },
    student_todos: { type: 'array', items: { type: 'string' }, description: '학생이 해야 할 일' },
    consultant_todos: { type: 'array', items: { type: 'string' }, description: '컨설턴트가 해야 할 일' },
    next_plan: { type: 'string', description: '다음 상담 계획' },
    summary: {
      type: 'string',
      description: '상담 전체를 한 페이지 분량으로 정리한 서술형 요약 (1Page Documentation)',
    },
  },
}

const SYSTEM = `너는 학생부종합전형(학종) 컨설팅 회사의 보고서 보조 작성자다. 컨설턴트와 학생(또는 학부모) 간 상담 원문을 읽고, 학부모가 열람해도 좋은 격식 있는 상담보고서 초안을 작성한다.

${COMMON_RULES}`

export async function runCounselReport(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<CounselReportResult & { warnings: string[] }> {
  const studentId = typeof body.student_id === 'string' ? body.student_id : ''
  const rawText = typeof body.raw_text === 'string' ? body.raw_text.trim() : ''
  if (!studentId || !rawText)
    throw new AiError('invalid_request', 'student_id와 raw_text가 필요합니다.')

  const studentContext = await buildStudentContext(supabase, studentId)

  const generated = await callClaudeJson<CounselReportResult>({
    system: `${SYSTEM}\n\n${studentContext}`,
    userText: `[상담 원문]\n${rawText}`,
    schema: SCHEMA,
  })

  return verifyResult({
    taskLabel: '상담보고서',
    studentContext,
    sourceText: rawText,
    generated,
    schema: SCHEMA,
  })
}
