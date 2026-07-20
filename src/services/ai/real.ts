// 실제 AI 서비스 — Supabase Edge Function(ai-generate)을 호출한다.
// 서버 에러 코드({ error: { code, message } })를 한국어 사용자 메시지로 변환해 throw한다.
import { FunctionsHttpError } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'
import type {
  AiService,
  CounselReportResult,
  KakaoAnalysisResult,
  MonthlyReportResult,
} from './index'
import { MAX_AI_SOURCE_LENGTH } from './index'

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
  student_not_found: '학생을 찾을 수 없거나 접근 권한이 없습니다.',
  invalid_request: '요청이 올바르지 않습니다. 입력 내용을 확인해 주세요.',
  input_too_long: `원문이 너무 깁니다 (최대 ${MAX_AI_SOURCE_LENGTH.toLocaleString()}자). 내용을 나눠서 생성해 주세요.`,
  rate_limited: '요청이 많아 잠시 후 다시 시도해 주세요.',
  overloaded: 'AI 서비스가 혼잡합니다. 잠시 후 다시 시도해 주세요.',
  ai_error: 'AI 생성에 실패했습니다. 다시 시도해 주세요.',
}

async function invokeAi<T>(body: Record<string, unknown>): Promise<T> {
  const supabase = getSupabase()
  const { data, error } = await supabase.functions.invoke('ai-generate', { body })
  if (error) {
    let code = 'ai_error'
    let serverMessage: string | undefined
    if (error instanceof FunctionsHttpError) {
      const payload = (await error.context.json().catch(() => null)) as {
        error?: { code?: string; message?: string }
      } | null
      code = payload?.error?.code ?? 'ai_error'
      serverMessage = payload?.error?.message
    }
    throw new Error(ERROR_MESSAGES[code] ?? serverMessage ?? ERROR_MESSAGES.ai_error)
  }
  return data as T
}

export const realAiService: AiService = {
  generateCounselReport: (input) =>
    invokeAi<CounselReportResult>({
      task: 'counsel_report',
      student_id: input.studentId,
      raw_text: input.rawText,
    }),

  analyzeKakaoChat: (input) =>
    invokeAi<KakaoAnalysisResult>({
      task: 'kakao_analysis',
      student_id: input.studentId,
      raw_text: input.rawText,
    }),

  // 주간 요약은 UI와 함께 4차 이후 task로 추가된다 (스펙 §범위 외)
  generateWeeklySummary: () => {
    return Promise.reject(new Error('주간 요약은 아직 지원되지 않습니다.'))
  },

  generateMonthlyReport: (input) =>
    invokeAi<MonthlyReportResult>({
      task: 'monthly_report',
      student_id: input.studentId,
      target_month: input.targetMonth,
      note: input.note,
    }),
}
