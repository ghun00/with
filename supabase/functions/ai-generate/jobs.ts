// ai_jobs 행 헬퍼 — 비동기 잡의 상태/단계/결과를 기록한다.
// 상태 쓰기는 service_role 클라이언트로 수행한다: 백그라운드 처리가 ~120초 뒤 끝나
//   사용자 JWT가 만료돼도 결과 기록이 보장돼야 하기 때문. 접근 권한은 INSERT 시점에
//   사용자 JWT + RLS로 이미 검증되므로, 이후 job id 키 쓰기는 RLS 우회가 안전하다.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { AiError, type AiErrorCode } from './http.ts'

export type JobStage = 'context' | 'generating' | 'verifying' | 'done'
export type StageReporter = (stage: JobStage) => Promise<void>

// 서버가 150초 wall-clock에 죽어 상태를 못 남긴 잡을 실패로 간주하는 임계.
// (클라도 동일 개념으로 running+updated_at 초과를 실패 처리한다)
const STALE_MS = 160_000

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

// 해당 (student, task)의 오래된 running/queued 잡을 실패로 정리 → unique 인덱스 충돌 방지
export async function reapStaleJobs(
  admin: SupabaseClient,
  studentId: string,
  task: string,
): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString()
  const { error } = await admin
    .from('ai_jobs')
    .update({
      status: 'failed',
      error_code: 'ai_error',
      error_message: '생성이 시간 내에 끝나지 않아 중단되었습니다. 다시 시도해 주세요.',
      updated_at: new Date().toISOString(),
    })
    .eq('student_id', studentId)
    .eq('task', task)
    .in('status', ['queued', 'running'])
    .lt('updated_at', cutoff)
  if (error) console.error('[ai-generate] reapStaleJobs failed', error)
}

// 잡 생성. 사용자 JWT 클라이언트로 INSERT(RLS + created_by 기본값 auth.uid()).
// 활성 잡이 이미 있으면(unique 충돌) 그 잡 id를 돌려주되 created=false로 알려,
// 호출부가 중복 백그라운드 처리를 띄우지 않도록 한다 (동시 시작 수렴).
export async function insertJob(
  userClient: SupabaseClient,
  params: { studentId: string; task: string; input: Record<string, unknown> },
): Promise<{ id: string; created: boolean }> {
  const { data, error } = await userClient
    .from('ai_jobs')
    .insert({
      student_id: params.studentId,
      task: params.task,
      input: params.input,
      status: 'running',
      stage: 'context',
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      const { data: active } = await userClient
        .from('ai_jobs')
        .select('id')
        .eq('student_id', params.studentId)
        .eq('task', params.task)
        .in('status', ['queued', 'running'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (active?.id) return { id: active.id as string, created: false }
    }
    console.error('[ai-generate] insertJob failed', error)
    throw new AiError('ai_error', '생성 작업을 시작하지 못했습니다.')
  }
  return { id: data.id as string, created: true }
}

export async function updateJobStage(
  admin: SupabaseClient,
  jobId: string,
  stage: JobStage,
): Promise<void> {
  const { error } = await admin
    .from('ai_jobs')
    .update({ status: 'running', stage, updated_at: new Date().toISOString() })
    .eq('id', jobId)
  if (error) console.error('[ai-generate] updateJobStage failed', error)
}

export async function completeJob(
  admin: SupabaseClient,
  jobId: string,
  result: unknown,
): Promise<void> {
  const { error } = await admin
    .from('ai_jobs')
    .update({
      status: 'succeeded',
      stage: 'done',
      result,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
  if (error) console.error('[ai-generate] completeJob failed', error)
}

export async function failJob(
  admin: SupabaseClient,
  jobId: string,
  code: AiErrorCode,
  message: string,
): Promise<void> {
  const { error } = await admin
    .from('ai_jobs')
    .update({
      status: 'failed',
      error_code: code,
      error_message: message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
  if (error) console.error('[ai-generate] failJob failed', error)
}
