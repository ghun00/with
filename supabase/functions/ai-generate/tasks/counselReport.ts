// 상담보고서 생성 task — 학생 컨텍스트 주입 → 생성 패스 → 검증 패스
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { AiError, MAX_RAW_TEXT_LENGTH } from '../http.ts'
import { COMMON_RULES, GEN_EFFORT, callClaudeJson } from '../claude.ts'
import { buildStudentContext } from '../studentContext.ts'
import { verifyResult } from '../verify.ts'
import type { StageReporter } from '../jobs.ts'

// 프론트 CounselReportResult(src/services/ai/index.ts)와 1:1 — 필드를 바꿀 때는 항상 두 파일을 함께 수정할 것
// (decisions는 2026-07 구조화 개선으로 string[] → string(Markdown)로 변경됨)
interface CounselReportResult {
  counsel_date: string
  purpose: string
  discussion: string
  student_status: string
  decisions: string
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
    purpose: { type: 'string', description: '이번 상담의 목적. 1~2문장 내외의 간결한 서술형.' },
    discussion: {
      type: 'string',
      description:
        '주요 논의 내용. 상담에서 다룬 논의 주제를 시간순이 아니라 주제별로 재구성해 Markdown으로 작성한다. ' +
        '서로 다른 주제가 섞이면 "### 소제목"으로 분리하고, 소제목 아래에는 핵심 맥락을 짧은 문단으로, 수치·대학명·전형명 등 비교가 필요한 정보는 "- " 목록으로 정리한다. ' +
        '내용이 짧거나 주제가 하나뿐이면 소제목 없이 문단으로 작성해도 된다. 소제목은 실제 논의된 내용을 대표하는 짧고 명확한 명사형 표현으로 쓰고, "주제 1"/"분석 내용"/"기타 사항"처럼 모호한 이름은 쓰지 않는다. ' +
        '확정된 내용과 제안·검토 중인 내용을 구분해서 쓴다.',
    },
    student_status: {
      type: 'string',
      description:
        '학생의 현재 학업·활동·심리 상태. 강점/보완점/현재 고민 등 서로 다른 주제로 나뉘면 "### 소제목"으로 구분하고, 짧으면 소제목 없이 문단으로 작성한다. 단순 정보 나열보다 현재 상태와 판단 근거가 드러나게 쓴다.',
    },
    decisions: {
      type: 'string',
      description:
        '상담에서 확정된 결정 사항. 기본은 "- " 글머리 기호 목록이며, 확정 사항과 미확정 사항을 구분해 미확정 항목에는 "(확인 필요)"/"(추후 확정 예정)" 등을 표시한다. ' +
        '결정 사항의 성격이 여러 종류로 뚜렷이 나뉠 때만 "### 소제목"으로 그룹핑한다.',
    },
    student_todos: { type: 'array', items: { type: 'string' }, description: '학생이 해야 할 일. 항목 하나에 행동 하나만.' },
    consultant_todos: { type: 'array', items: { type: 'string' }, description: '컨설턴트가 해야 할 일. 항목 하나에 행동 하나만.' },
    next_plan: {
      type: 'string',
      description:
        '다음 상담 계획. 다음 상담 시점과 목적을 간결한 문단으로 쓰고, 확인할 내용이 여러 개면 "- " 목록으로 정리한다. 내용이 복잡하면 "### 소제목"으로 나눈다.',
    },
    summary: {
      type: 'string',
      description:
        '1Page Documentation — 보고서 전체를 반복하는 것이 아니라 핵심 진단·결정 사항·지원 전략·다음 단계 중심으로 압축한 한 페이지 요약. ' +
        '본문 문장을 그대로 복사하지 않고, "### 소제목"으로 정보를 구조화한다. 대괄호 제목("[상담 개요]" 등)은 쓰지 않는다.',
    },
  },
}

const SYSTEM = `너는 학생부종합전형(학종) 컨설팅 회사의 보고서 보조 작성자다. 컨설턴트와 학생(또는 학부모) 간 상담 원문을 읽고, 학부모가 열람해도 좋은 격식 있는 상담보고서 초안을 작성한다.

${COMMON_RULES}

[Markdown 서식 규칙]
- 이 구조화는 내용을 요약·축약하는 것이 아니라 재배치하는 것이다. 소제목으로 나누더라도 수치, 대학명, 전형명, 학생·학부모의 발언과 의사 등 구체적인 정보는 지금까지와 동일한 수준으로 상세히 남긴다. 정보를 생략하거나 뭉뚱그려 표현하지 않는다. (단, summary는 압축 요약이 목적이므로 예외)
- 각 필드 안의 소제목은 "### " 형식만 사용한다.
- 소제목에 대괄호를 쓰지 않는다.
- HTML 태그를 쓰지 않는다.
- 구분선(---)을 불필요하게 반복하지 않는다.
- 하나의 문단이 지나치게 길어지면 의미 단위로 소제목을 나눈다.`

export async function runCounselReport(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
  onStage: StageReporter = async () => {},
): Promise<CounselReportResult & { warnings: string[] }> {
  const studentId = typeof body.student_id === 'string' ? body.student_id : ''
  const rawText = typeof body.raw_text === 'string' ? body.raw_text.trim() : ''
  if (!studentId || !rawText)
    throw new AiError('invalid_request', 'student_id와 raw_text가 필요합니다.')
  if (rawText.length > MAX_RAW_TEXT_LENGTH)
    throw new AiError(
      'input_too_long',
      `상담 원문이 너무 깁니다 (최대 ${MAX_RAW_TEXT_LENGTH.toLocaleString()}자). 내용을 나눠서 생성해 주세요.`,
    )

  await onStage('context')
  const studentContext = await buildStudentContext(supabase, studentId)

  await onStage('generating')
  const generated = await callClaudeJson<CounselReportResult>({
    system: `${SYSTEM}\n\n${studentContext}`,
    userText: `[상담 원문]\n${rawText}`,
    schema: SCHEMA,
    effort: GEN_EFFORT,
  })

  await onStage('verifying')
  return verifyResult({
    taskLabel: '상담보고서',
    studentContext,
    sourceText: rawText,
    generated,
    schema: SCHEMA,
  })
}
