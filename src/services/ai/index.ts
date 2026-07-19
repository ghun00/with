// AI 서비스 인터페이스 — 1차에는 mock 구현을 사용한다.
// 2차에서 Supabase Edge Function + Claude API 구현으로 교체한다.
import { mockAiService } from './mock'

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
}

export interface KakaoAnalysisResult {
  daily_highlights: { date: string; summary: string }[]
  requests: string[]
  decisions: string[]
  student_todos: string[]
  consultant_todos: string[]
  issues: string[]
  risk_signals: string[]
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
}

export interface AiService {
  generateCounselReport(rawText: string): Promise<CounselReportResult>
  analyzeKakaoChat(rawText: string): Promise<KakaoAnalysisResult>
  generateWeeklySummary(context: string): Promise<string>
  generateMonthlyReport(context: string): Promise<MonthlyReportResult>
}

export function getAiService(): AiService {
  return mockAiService
}
