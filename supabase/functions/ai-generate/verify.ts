// 검증 패스 — 생성 결과를 원문과 대조하는 별도 호출 (스펙 §[3])
// "요약하고 검증도 해줘"를 한 호출에 합치지 않는다.
import { callClaudeJson } from './claude.ts'

const VERIFY_RULES = `너는 AI가 생성한 결과물을 원문과 대조해 검증하는 검수자다. 새로운 내용을 창작하지 말고 아래 항목만 검사해, 수정된 결과와 경고 목록을 출력한다.
1. 원문에 근거 없는 내용 → "확인 필요"로 바꾸고 경고에 기록
2. 원문에서 "예정/검토 중/미정"인 사안이 확정된 것처럼 서술된 부분 → 미정 표현으로 되돌리고 경고에 기록
3. 원문 후반에 번복·수정된 결정이 이전 상태로 기록된 부분 → 최종 상태로 고치고 경고에 기록
4. 수치·날짜가 원문과 다르거나 서로 충돌하는 부분 → 원문 기준으로 고치고 경고에 기록
5. 학생·컨설턴트 등 인물 지칭이 [학생 정보]와 다르게 표기된 부분 → 통일하고 경고에 기록
문제없는 항목은 그대로 유지한다. 경고는 "무엇을 왜 고쳤는지"를 한 문장씩 한국어로 쓴다. 고칠 것이 없으면 warnings는 빈 배열로 둔다.`

interface ObjectSchema {
  type: string
  additionalProperties: boolean
  required: string[]
  properties: Record<string, unknown>
}

// 생성 스키마에 warnings 필드를 추가한 검증용 스키마를 만든다
export function withWarnings(schema: ObjectSchema): Record<string, unknown> {
  return {
    ...schema,
    required: [...schema.required, 'warnings'],
    properties: {
      ...schema.properties,
      warnings: {
        type: 'array',
        items: { type: 'string' },
        description: '검증에서 수정하거나 확인이 필요하다고 판단한 사항 목록. 없으면 빈 배열.',
      },
    },
  }
}

export async function verifyResult<T>(params: {
  taskLabel: string
  studentContext: string
  sourceText: string
  generated: T
  schema: ObjectSchema
}): Promise<T & { warnings: string[] }> {
  return callClaudeJson<T & { warnings: string[] }>({
    system: `${VERIFY_RULES}\n\n${params.studentContext}`,
    userText: `[원문]\n${params.sourceText}\n\n[검증 대상: ${params.taskLabel} 생성 결과 JSON]\n${JSON.stringify(params.generated, null, 2)}`,
    schema: withWarnings(params.schema),
  })
}
