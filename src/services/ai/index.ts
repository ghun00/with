// AI 서비스 인터페이스 — 실제 구현은 Supabase Edge Function(ai-generate) 호출로 동작한다.
// VITE_USE_MOCK_AI=true일 때만 mock을 사용한다 (함수 미배포 환경의 UI 개발용).
import { mockAiService } from './mock'
import { realAiService } from './real'

// AI 원문 입력 상한(글자 수). 생성+검증 2패스가 Edge Function 150초 wall-clock 한도 안에
// 들도록 하는 가드 — 넘으면 생성 버튼을 막고 안내한다. 서버에도 동일 값(MAX_RAW_TEXT_LENGTH).
export const MAX_AI_SOURCE_LENGTH = 12000

export interface CounselReportResult {
  counsel_date: string
  purpose: string
  discussion: string
  student_status: string
  decisions: string[]
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

export interface CounselReportInput {
  studentId: string
  rawText: string
}

export interface KakaoAnalysisInput {
  studentId: string
  rawText: string
}

export interface MonthlyReportInput {
  studentId: string
  targetMonth: string
  note?: string
}

export interface AiService {
  generateCounselReport(input: CounselReportInput): Promise<CounselReportResult>
  analyzeKakaoChat(input: KakaoAnalysisInput): Promise<KakaoAnalysisResult>
  generateWeeklySummary(context: string): Promise<string>
  generateMonthlyReport(input: MonthlyReportInput): Promise<MonthlyReportResult>
}

// VITE_USE_MOCK_AI=true → mock (Edge Function 미배포 환경의 UI 개발용)
const USE_MOCK = import.meta.env.VITE_USE_MOCK_AI === 'true'

export function getAiService(): AiService {
  return USE_MOCK ? mockAiService : realAiService
}
