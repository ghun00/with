// 실제 AI 서비스 — Supabase Edge Function(ai-generate) + ai_jobs 테이블.
// startJob은 잡을 만들고 jobId를 즉시 받는다(202). 진행/결과는 ai_jobs 폴링으로 읽는다.
// 서버 에러 코드({ error: { code, message } })는 한국어 사용자 메시지로 변환해 throw한다.
import { FunctionsHttpError } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'
import type { AiJob, AiService, AiTask, StartJobInput } from './index'
import { MAX_AI_SOURCE_LENGTH } from './constants'

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
  student_not_found: '학생을 찾을 수 없거나 접근 권한이 없습니다.',
  invalid_request: '요청이 올바르지 않습니다. 입력 내용을 확인해 주세요.',
  input_too_long: `원문이 너무 깁니다 (최대 ${MAX_AI_SOURCE_LENGTH.toLocaleString()}자). 내용을 나눠서 생성해 주세요.`,
  rate_limited: '요청이 많아 잠시 후 다시 시도해 주세요.',
  overloaded: 'AI 서비스가 혼잡합니다. 잠시 후 다시 시도해 주세요.',
  ai_error: 'AI 생성에 실패했습니다. 다시 시도해 주세요.',
}

// 생성 요청은 즉시 반환되므로(백그라운드 처리) 이 매핑은 "시작" 단계 에러 전용이다.
// 처리 중 실패는 ai_jobs.error_code/message로 내려와 useAiJob이 표면화한다.
function startBody(input: StartJobInput): Record<string, unknown> {
  switch (input.task) {
    case 'counsel_report':
      return { task: input.task, student_id: input.studentId, raw_text: input.rawText }
    case 'kakao_analysis':
      return {
        task: input.task,
        student_id: input.studentId,
        raw_text: input.rawText,
        ...(input.sourceHash ? { source_hash: input.sourceHash } : {}),
        ...(input.analysisId ? { analysis_id: input.analysisId } : {}),
      }
    case 'monthly_report':
      return {
        task: input.task,
        student_id: input.studentId,
        target_month: input.targetMonth,
        note: input.note,
      }
  }
}

export const realAiService: AiService = {
  async startJob(input) {
    const supabase = getSupabase()
    const { data, error } = await supabase.functions.invoke('ai-generate', {
      body: startBody(input),
    })
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
    return (data as { job_id: string }).job_id
  },

  async fetchActiveJob(studentId: string, task: AiTask) {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('ai_jobs')
      .select('*')
      .eq('student_id', studentId)
      .eq('task', task)
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error('생성 상태를 불러오지 못했습니다.')
    return (data as AiJob | null) ?? null
  },

  async markJobConsumed(jobId: string) {
    const supabase = getSupabase()
    const { error } = await supabase
      .from('ai_jobs')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', jobId)
    if (error) throw new Error('상태 갱신에 실패했습니다.')
  },
}
