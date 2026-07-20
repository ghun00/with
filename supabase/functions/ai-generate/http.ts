// 공통 HTTP 유틸 — 에러 코드 체계와 CORS (스펙 §에러 처리)
export type AiErrorCode =
  | 'unauthorized'
  | 'student_not_found'
  | 'invalid_request'
  | 'input_too_long'
  | 'rate_limited'
  | 'overloaded'
  | 'ai_error'

// 원문 길이 상한. 생성+검증 2패스가 Edge Function 150초 wall-clock 한도 안에 들도록
// 하는 백스톱 — 초과 요청은 150초를 기다렸다 실패하는 대신 즉시 명확한 에러로 막는다.
// (프론트에도 동일 값 MAX_AI_SOURCE_LENGTH로 존재)
export const MAX_RAW_TEXT_LENGTH = 12000

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message: string,
  ) {
    super(message)
  }
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ERROR_STATUS: Record<AiErrorCode, number> = {
  unauthorized: 401,
  student_not_found: 404,
  invalid_request: 400,
  input_too_long: 413,
  rate_limited: 429,
  overloaded: 503,
  ai_error: 500,
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function errorResponse(error: AiError): Response {
  return jsonResponse({ error: { code: error.code, message: error.message } }, ERROR_STATUS[error.code])
}
