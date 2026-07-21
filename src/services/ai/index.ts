// AI 서비스 인터페이스 — 실제 구현은 Supabase Edge Function(ai-generate) 호출로 동작한다.
// VITE_USE_MOCK_AI=true일 때만 mock을 사용한다 (함수 미배포 환경의 UI 개발용).
import { mockAiService } from './mock'
import { realAiService } from './real'

// 순환 참조 방지를 위해 상수는 별도 모듈에 정의하고 여기서 재노출한다 (기존 import 경로 유지)
export { MAX_AI_SOURCE_LENGTH } from './constants'

export interface CounselReportResult {
  counsel_date: string
  purpose: string
  discussion: string
  student_status: string
  decisions: string // Markdown (글머리 기호 목록 + 필요 시 "### " 소제목)
  student_todos: string[]
  consultant_todos: string[]
  next_plan: string
  summary: string
  warnings?: string[] // 검증 패스 경고 — 문서 하단 '⚠ 검토 필요 사항'으로 노출
}

export interface KakaoAnalysisResult {
  daily_highlights: { date: string; summary: string }[]
  requests: string[]
  decisions: string[]
  student_todos: string[]
  consultant_todos: string[]
  issues: string[]
  risk_signals: string[]
  warnings?: string[]
}

// 월간 보고서 기본 목차 7개 섹션 (prd §6.12)
export interface MonthlyReportResult {
  activity_summary: string      // 이번 달 활동 요약
  achievements: string          // 주요 성과
  communication: string         // 상담 및 소통 내용
  todo_progress: string         // To Do 수행 현황
  improvements: string          // 보완 필요 사항
  next_month_plan: string       // 다음 달 계획
  consultant_opinion: string    // 컨설턴트 의견
  warnings?: string[]
  source_context?: string       // 서버가 조립한 컨텍스트 원문 — source_text 스냅샷 저장용
}

// ===== 비동기 잡 모델 =====
// 생성은 서버측 ai_jobs 잡으로 처리한다. startJob이 잡을 만들고 jobId만 즉시 돌려주며,
// 클라는 fetchActiveJob으로 폴링해 진행/완료/실패를 추적한다 (마이그레이션 0013).
export type AiTask = 'counsel_report' | 'kakao_analysis' | 'monthly_report'
export type AiJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'
export type AiJobStage = 'context' | 'generating' | 'verifying' | 'done'

export interface AiJob {
  id: string
  student_id: string
  task: AiTask
  status: AiJobStatus
  stage: AiJobStage | null
  input: Record<string, unknown>
  result: unknown | null
  error_code: string | null
  error_message: string | null
  consumed_at: string | null
  created_at: string
  updated_at: string
}

export type StartJobInput =
  | { task: 'counsel_report'; studentId: string; rawText: string }
  // 신규 분석은 sourceHash(중복 감지 키), 기존 분석 재생성은 analysisId를 준다
  | { task: 'kakao_analysis'; studentId: string; rawText: string; sourceHash?: string; analysisId?: string }
  | { task: 'monthly_report'; studentId: string; targetMonth: string; note?: string }

export interface AiService {
  // 잡 시작 → jobId 반환 (브라우저는 연결을 붙들지 않는다)
  startJob(input: StartJobInput): Promise<string>
  // (student, task)의 미소비 최신 잡 1건 (폴링·마운트 복구용)
  fetchActiveJob(studentId: string, task: AiTask): Promise<AiJob | null>
  // 결과를 편집기/상세로 열어 소비했음을 기록 → 복귀 시 재오픈 방지
  markJobConsumed(jobId: string): Promise<void>
}

// VITE_USE_MOCK_AI=true → mock (Edge Function 미배포 환경의 UI 개발용)
const USE_MOCK = import.meta.env.VITE_USE_MOCK_AI === 'true'

export function getAiService(): AiService {
  return USE_MOCK ? mockAiService : realAiService
}
