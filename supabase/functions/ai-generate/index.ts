// ai-generate: AI 생성 단일 진입점 — task 라우팅
// 스펙: docs/superpowers/specs/2026-07-20-ai-integration-design.md
import { createClient } from 'npm:@supabase/supabase-js@2'
import { AiError, corsHeaders, errorResponse, jsonResponse } from './http.ts'
import { runCounselReport } from './tasks/counselReport.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    if (req.method !== 'POST') throw new AiError('invalid_request', 'POST 요청만 지원합니다.')

    // 사용자 JWT를 그대로 실어 Supabase 클라이언트 생성 — 모든 DB 조회에 RLS가 적용된다
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new AiError('unauthorized', '로그인이 필요합니다.')

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) throw new AiError('invalid_request', '요청 본문이 올바르지 않습니다.')

    switch (body.task) {
      case 'counsel_report':
        return jsonResponse(await runCounselReport(supabase, body))
      case 'kakao_analysis':
      case 'monthly_report':
        throw new AiError('invalid_request', '아직 구현되지 않은 task입니다.')
      default:
        throw new AiError('invalid_request', `알 수 없는 task입니다: ${String(body.task)}`)
    }
  } catch (e) {
    if (e instanceof AiError) return errorResponse(e)
    console.error('[ai-generate] unexpected error', e)
    return errorResponse(new AiError('ai_error', 'AI 생성 중 오류가 발생했습니다.'))
  }
})
