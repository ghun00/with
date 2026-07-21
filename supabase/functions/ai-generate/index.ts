// ai-generate: AI 생성 비동기 잡 진입점
// 요청을 받으면 ai_jobs 행을 만들고 { job_id }를 즉시 반환한 뒤, 실제 2-패스 생성은
// EdgeRuntime.waitUntil로 백그라운드에서 처리하며 stage/status/result를 갱신한다.
// 클라는 브라우저 연결을 붙들지 않고 ai_jobs를 폴링한다 → 이탈 안전·진행표시·실패 복구.
// 스펙: docs/superpowers/specs/2026-07-20-ai-integration-design.md (잡 모델 후속)
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { AiError, MAX_RAW_TEXT_LENGTH, corsHeaders, errorResponse, jsonResponse } from './http.ts'
import {
  adminClient,
  completeJob,
  failJob,
  insertJob,
  reapStaleJobs,
  updateJobStage,
} from './jobs.ts'
import { runCounselReport } from './tasks/counselReport.ts'
import { runKakaoAnalysis } from './tasks/kakaoAnalysis.ts'
import { runMonthlyReport } from './tasks/monthlyReport.ts'

// Supabase 런타임의 백그라운드 태스크 API (응답 반환 후에도 살아 있게 한다)
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

// 요청 본문을 task별로 검증해 잡 input(원문 보존·재시도 근거)으로 정규화한다.
// 실패 시 잡을 만들기 전에 동기 에러로 반환 → 유령 실패 잡을 남기지 않는다.
function normalizeInput(body: Record<string, unknown>): {
  task: string
  studentId: string
  input: Record<string, unknown>
} {
  const task = String(body.task ?? '')
  const studentId = typeof body.student_id === 'string' ? body.student_id : ''
  if (!studentId) throw new AiError('invalid_request', 'student_id가 필요합니다.')

  if (task === 'counsel_report' || task === 'kakao_analysis') {
    const rawText = typeof body.raw_text === 'string' ? body.raw_text.trim() : ''
    if (!rawText) throw new AiError('invalid_request', '원문이 필요합니다.')
    if (rawText.length > MAX_RAW_TEXT_LENGTH)
      throw new AiError(
        'input_too_long',
        `원문이 너무 깁니다 (최대 ${MAX_RAW_TEXT_LENGTH.toLocaleString()}자). 내용을 나눠서 시도해 주세요.`,
      )
    const input: Record<string, unknown> = { student_id: studentId, raw_text: rawText }
    // 카카오는 완료 시 클라가 쓸 의도를 함께 보존한다: 신규는 원문 해시, 재생성은 대상 분석 id.
    // (서버 처리는 raw_text만 사용하고 이 값들은 그대로 input에 저장만 한다)
    if (task === 'kakao_analysis') {
      if (typeof body.source_hash === 'string') input.source_hash = body.source_hash
      if (typeof body.analysis_id === 'string') input.analysis_id = body.analysis_id
    }
    return { task, studentId, input }
  }

  if (task === 'monthly_report') {
    const targetMonth = typeof body.target_month === 'string' ? body.target_month : ''
    if (!/^\d{4}-\d{2}$/.test(targetMonth))
      throw new AiError('invalid_request', 'target_month(YYYY-MM)가 필요합니다.')
    const note = typeof body.note === 'string' ? body.note.trim() : ''
    return {
      task,
      studentId,
      input: { student_id: studentId, target_month: targetMonth, ...(note ? { note } : {}) },
    }
  }

  throw new AiError('invalid_request', `알 수 없는 task입니다: ${task}`)
}

// 백그라운드 2-패스 처리 — 단계마다 stage를 기록하고 결과/에러를 잡 행에 남긴다.
async function processJob(params: {
  jobId: string
  task: string
  input: Record<string, unknown>
  authHeader: string
}): Promise<void> {
  const admin = adminClient()
  // 학생 컨텍스트 읽기는 사용자 JWT로 (RLS 유지). 백그라운드 수명 내에는 토큰이 유효하다.
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: params.authHeader } } },
  )
  const onStage = (stage: 'context' | 'generating' | 'verifying' | 'done') =>
    updateJobStage(admin, params.jobId, stage)

  try {
    let result: unknown
    switch (params.task) {
      case 'counsel_report':
        result = await runCounselReport(userClient, params.input, onStage)
        break
      case 'kakao_analysis':
        result = await runKakaoAnalysis(userClient, params.input, onStage)
        break
      case 'monthly_report':
        result = await runMonthlyReport(userClient, params.input, onStage)
        break
      default:
        throw new AiError('invalid_request', `알 수 없는 task입니다: ${params.task}`)
    }
    await completeJob(admin, params.jobId, result)
  } catch (e) {
    if (e instanceof AiError) await failJob(admin, params.jobId, e.code, e.message)
    else {
      console.error('[ai-generate] processJob unexpected error', e)
      await failJob(admin, params.jobId, 'ai_error', 'AI 생성 중 오류가 발생했습니다.')
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    if (req.method !== 'POST') throw new AiError('invalid_request', 'POST 요청만 지원합니다.')

    const authHeader = req.headers.get('Authorization') ?? ''
    // 사용자 JWT로 인증 확인 + 잡 INSERT(RLS 적용)
    const supabase: SupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new AiError('unauthorized', '로그인이 필요합니다.')

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) throw new AiError('invalid_request', '요청 본문이 올바르지 않습니다.')

    const { task, studentId, input } = normalizeInput(body)

    // 죽은 활성 잡 정리 후 새 잡 생성 (중복은 unique 인덱스로 차단, 충돌 시 기존 잡 id 수렴)
    await reapStaleJobs(adminClient(), studentId, task)
    const { id: jobId, created } = await insertJob(supabase, { studentId, task, input })

    // 이미 진행 중인 잡을 수렴한 경우엔 백그라운드 처리를 중복으로 띄우지 않는다
    if (created) EdgeRuntime.waitUntil(processJob({ jobId, task, input, authHeader }))
    return jsonResponse({ job_id: jobId }, 202)
  } catch (e) {
    if (e instanceof AiError) return errorResponse(e)
    console.error('[ai-generate] unexpected error', e)
    return errorResponse(new AiError('ai_error', 'AI 생성 중 오류가 발생했습니다.'))
  }
})
