// Claude API 공통 호출 — 생성·검증 패스 모두 structured outputs로 스키마를 강제한다
import Anthropic from 'npm:@anthropic-ai/sdk'
import { AiError } from './http.ts'

export const MODEL = 'claude-sonnet-5'
// 검증 패스 전용 모델. 검증은 명시된 규칙으로 생성 결과를 대조하는 좁은 작업이라
// 빠른 Haiku로 충분하고, 이렇게 해야 생성+검증이 Edge Function 150초 wall-clock 한도 안에 든다.
export const VERIFY_MODEL = 'claude-haiku-4-5'

// 생성 패스 공통 지침 (스펙 §생성 패스). 검증 패스 지침은 verify.ts에 별도.
export const COMMON_RULES = `- 원문에 근거 없는 내용은 추측하지 말고 "확인 필요"로 기록한다.
- 대화 후반에 번복·수정된 결정은 최종 상태만 기록한다.
- "예정", "검토 중", "미정"인 사안을 확정된 것처럼 서술하지 않는다.
- 날짜·수치는 원문에서 그대로 가져오고, 특정할 수 없으면 "확인 필요"로 둔다.
- 인물은 [학생 정보]의 이름으로 일관되게 지칭한다.
- 모든 출력은 한국어로 작성한다.`

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (!client) {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new AiError('ai_error', 'ANTHROPIC_API_KEY가 설정되지 않았습니다.')
    client = new Anthropic({ apiKey })
  }
  return client
}

// 일시오류(429/529) 자동 재시도: 짧은 지수 백오프로 최대 2회 더 시도한다.
// 타임아웃·그 외 오류는 재시도해도 같은 결과라 즉시 실패시킨다 (재시도는 사용자 수동 몫).
const MAX_RETRIES = 2
const RETRY_BASE_MS = 1500

function isTransient(e: unknown): boolean {
  return (
    e instanceof Anthropic.RateLimitError ||
    (e instanceof Anthropic.APIError && e.status === 529)
  )
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// 생성 패스 사고 깊이. claude-sonnet-5는 thinking 미지정 시 adaptive가 effort high로 켜져
// 상담 추출·재배치엔 과했다 → low로 낮춰 실시간 지연을 줄인다(structured outputs·adaptive는 유지).
// 주의: effort는 검증 모델(Haiku 4.5)에서 400이므로 생성 호출에만 넘긴다(verify는 미지정).
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export const GEN_EFFORT: Effort = 'low'

export async function callClaudeJson<T>(params: {
  system: string
  userText: string
  schema: Record<string, unknown>
  model?: string
  effort?: Effort
}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await getClient().messages.create({
        model: params.model ?? MODEL,
        max_tokens: 16000,
        system: params.system,
        messages: [{ role: 'user', content: params.userText }],
        output_config: {
          format: { type: 'json_schema', schema: params.schema },
          ...(params.effort ? { effort: params.effort } : {}),
        },
      })
      if (response.stop_reason === 'refusal')
        throw new AiError('ai_error', 'AI가 요청 처리를 거부했습니다. 입력 내용을 확인해 주세요.')
      if (response.stop_reason === 'max_tokens')
        throw new AiError('ai_error', '입력이 너무 길어 AI 응답이 잘렸습니다. 원문을 나눠서 시도해 주세요.')
      const block = response.content.find((b) => b.type === 'text')
      if (!block || block.type !== 'text') throw new AiError('ai_error', 'AI 응답이 비어 있습니다.')
      return JSON.parse(block.text) as T
    } catch (e) {
      if (e instanceof AiError) throw e
      if (isTransient(e) && attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_MS * 2 ** attempt)
        continue
      }
      if (e instanceof Anthropic.RateLimitError)
        throw new AiError('rate_limited', '요청이 많아 잠시 후 다시 시도해 주세요.')
      if (e instanceof Anthropic.APIError && e.status === 529)
        throw new AiError('overloaded', 'AI 서비스가 혼잡합니다. 잠시 후 다시 시도해 주세요.')
      console.error('[ai-generate] claude error', e)
      throw new AiError('ai_error', 'AI 호출에 실패했습니다.')
    }
  }
}
