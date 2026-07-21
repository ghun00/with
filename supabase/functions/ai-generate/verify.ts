// 검증 패스 — 생성 결과를 원문과 대조하는 별도 호출 (스펙 §[3])
// "요약하고 검증도 해줘"를 한 호출에 합치지 않는다.
//
// 성능: 문서 전체를 다시 쓰지 않고 warnings + 고친 필드만(corrections) 낸다.
// 출력 토큰이 문서 1벌 → 수정분으로 줄어 검증 지연이 급감하고(문서 자동 교정은 유지),
// 검증 모델이 멀쩡한 필드를 건드려 새 오류를 넣을 위험도 사라진다.
import { VERIFY_MODEL, callClaudeJson } from './claude.ts'

const VERIFY_RULES = `너는 AI가 생성한 결과물을 원문과 대조해 검증하는 검수자다. 새로운 내용을 창작하지 말고 아래 항목만 검사해, 실제로 고친 필드와 경고 목록을 출력한다.
1. 원문에 근거 없는 내용 → "확인 필요"로 바꾸고 경고에 기록
2. 원문에서 "예정/검토 중/미정"인 사안이 확정된 것처럼 서술된 부분 → 미정 표현으로 되돌리고 경고에 기록
3. 원문 후반에 번복·수정된 결정이 이전 상태로 기록된 부분 → 최종 상태로 고치고 경고에 기록
4. 수치·날짜가 원문과 다르거나 서로 충돌하는 부분 → 원문 기준으로 고치고 경고에 기록
5. 학생·컨설턴트 등 인물 지칭이 [학생 정보]와 다르게 표기된 부분 → 통일하고 경고에 기록

출력 형식(중요):
- corrections에는 **실제로 고친 필드만** 넣는다. 고치지 않은 필드는 절대 넣지 않는다. 고칠 것이 하나도 없으면 corrections는 빈 객체 {}로 둔다.
- 고친 필드는 그 필드의 **전체 값**을 수정본으로 다시 쓴다(부분만 쓰지 않는다). 그 필드의 Markdown 구조(소제목 "### ", 목록 "- ", 체크리스트 "- [ ] " 등)는 그대로 유지하고, 위 5가지에 해당하는 내용만 바꾼다.
- warnings는 "무엇을 왜 고쳤는지"를 한 문장씩 한국어로 쓴다. 고칠 것이 없으면 빈 배열로 둔다.`

interface ObjectSchema {
  type: string
  additionalProperties: boolean
  required: string[]
  properties: Record<string, unknown>
}

// 검증 출력 스키마: 문서 전체가 아니라 warnings + 바뀐 필드만(corrections).
// corrections는 생성 스키마와 동일 필드지만 전부 optional(required:[]) — 고친 필드만 채운다.
export function verifySchema(schema: ObjectSchema): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['warnings', 'corrections'],
    properties: {
      warnings: {
        type: 'array',
        items: { type: 'string' },
        description: '검증에서 수정하거나 확인이 필요하다고 판단한 사항 목록. 없으면 빈 배열.',
      },
      corrections: {
        type: 'object',
        additionalProperties: false,
        required: [],
        properties: schema.properties,
        description:
          '위 규칙에 따라 실제로 고친 필드만 포함한다. 고치지 않은 필드는 넣지 않는다. 고칠 게 없으면 빈 객체.',
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
  const out = await callClaudeJson<{ warnings: string[]; corrections: Partial<T> }>({
    model: VERIFY_MODEL,
    system: `${VERIFY_RULES}\n\n${params.studentContext}`,
    userText: `[원문]\n${params.sourceText}\n\n[검증 대상: ${params.taskLabel} 생성 결과 JSON]\n${JSON.stringify(params.generated, null, 2)}`,
    schema: verifySchema(params.schema),
  })
  // 생성 결과에 고친 필드만 덮어써 문서를 자동 교정한다.
  return { ...params.generated, ...out.corrections, warnings: out.warnings ?? [] }
}
