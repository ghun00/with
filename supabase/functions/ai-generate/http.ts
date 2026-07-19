// 공통 HTTP 유틸 — 에러 코드 체계와 CORS (스펙 §에러 처리)
export type AiErrorCode =
  | 'unauthorized'
  | 'student_not_found'
  | 'invalid_request'
  | 'rate_limited'
  | 'overloaded'
  | 'ai_error'

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
