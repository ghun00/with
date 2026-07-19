import { getSupabase } from '@/lib/supabase'
import { logActivity } from '@/services/activities'
import {
  MONTHLY_REPORT_SECTIONS,
  type ActivityType,
  type CounselReport,
  type CounselReportMethod,
  type CounselReportSection,
  type KakaoAnalysis,
  type MonthlyReport,
} from '@/types'
import type {
  CounselReportResult,
  KakaoAnalysisResult,
  MonthlyReportResult,
} from '@/services/ai'

// AI 보고서 3종(상담보고서/카카오톡 분석/월간 보고서)의 저장·수정·확정 공통 서비스.
// prd §7: 생성 즉시 초안 자동 저장, 원문과 결과 분리 보관, 재생성 시 초안 복귀.
export type AiReportTable = 'counsel_reports' | 'kakao_analyses' | 'monthly_reports'

const REPORT_ACTIVITY_TYPE: Record<AiReportTable, ActivityType> = {
  counsel_reports: 'counsel_report',
  kakao_analyses: 'kakao_analysis',
  monthly_reports: 'report_generated',
}

const REPORT_LABEL: Record<AiReportTable, string> = {
  counsel_reports: '상담보고서',
  kakao_analyses: '카카오톡 분석',
  monthly_reports: '월간 보고서',
}

export function formatTargetMonth(targetMonth: string): string {
  const [year, month] = targetMonth.split('-')
  return `${year}년 ${Number(month)}월`
}

export async function fetchCounselReports(studentId: string): Promise<CounselReport[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('counsel_reports')
    .select('*, author:profiles(id, name, avatar_url)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as CounselReport[]
}

// AI 결과(고정 필드)를 편집 문서의 섹션 배열로 변환한다 — AI 계약은 그대로 두고 UI 진입 시점에 변환.
// 상담 일시는 보고서 기본정보(counsel_date)로 이동했으므로 섹션에서 제외한다.
// 목록형 항목은 섹션 기본 형식(글머리 기호/체크리스트) 마커로 직렬화한다 (editReport.md 3차 §4).
export function counselResultToSections(result: CounselReportResult): CounselReportSection[] {
  return [
    { name: '상담 목적', content: result.purpose },
    { name: '주요 논의', content: result.discussion },
    { name: '학생 현황', content: result.student_status },
    { name: '결정 사항', content: result.decisions.map((d) => `- ${d}`).join('\n') },
    { name: '학생 To Do', content: result.student_todos.map((t) => `- [ ] ${t}`).join('\n') },
    {
      name: '컨설턴트 To Do',
      content: result.consultant_todos.map((t) => `- [ ] ${t}`).join('\n'),
    },
    { name: '다음 상담 계획', content: result.next_plan },
    { name: '1Page Documentation', content: result.summary },
  ]
}

// 항목명으로 섹션 본문 조회 (목록 표시·월간 보고서 컨텍스트 조립용)
export function counselSectionContent(report: CounselReport, name: string): string {
  return report.result.sections.find((s) => s.name === name)?.content.trim() ?? ''
}

export async function fetchKakaoAnalyses(studentId: string): Promise<KakaoAnalysis[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('kakao_analyses')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as KakaoAnalysis[]
}

export async function fetchMonthlyReports(studentId: string): Promise<MonthlyReport[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('monthly_reports')
    .select('*, author:profiles(id, name, avatar_url)')
    .eq('student_id', studentId)
    .order('target_month', { ascending: false })
  if (error) throw error
  return (data ?? []) as MonthlyReport[]
}

// AI 월간 보고서 결과(고정 7개 목차)를 편집 문서의 섹션 배열로 변환한다
export function monthlyResultToSections(result: MonthlyReportResult): CounselReportSection[] {
  return MONTHLY_REPORT_SECTIONS.map(({ key, label }) => ({ name: label, content: result[key] }))
}

async function requireUserId(): Promise<string> {
  const supabase = getSupabase()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('로그인이 필요합니다.')
  return auth.user.id
}

// 편집 모달의 저장으로 신규 보고서를 등록한다 (직접 작성/AI 생성 공통)
export async function createCounselReport(params: {
  studentId: string
  title: string
  method: CounselReportMethod
  counselDate: string | null
  sections: CounselReportSection[]
  sourceText: string
}): Promise<string> {
  const supabase = getSupabase()
  const userId = await requireUserId()
  const { data, error } = await supabase
    .from('counsel_reports')
    .insert({
      student_id: params.studentId,
      title: params.title,
      method: params.method,
      counsel_date: params.counselDate,
      source_text: params.sourceText,
      result: { sections: params.sections },
      created_by: userId,
    })
    .select('id')
    .single()
  if (error) throw error
  await logActivity({
    studentId: params.studentId,
    type: 'counsel_report',
    summary: params.title,
  })
  return data.id as string
}

// 기존 보고서 편집 저장: 제목·섹션 교체 + 최종 수정 일시 갱신
export async function updateCounselReport(params: {
  id: string
  title: string
  counselDate: string | null
  sections: CounselReportSection[]
}): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('counsel_reports')
    .update({
      title: params.title,
      counsel_date: params.counselDate,
      result: { sections: params.sections },
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
  if (error) throw error
}

export async function createKakaoAnalysis(params: {
  studentId: string
  sourceText: string
  sourceHash: string
  result: KakaoAnalysisResult
}): Promise<string> {
  const supabase = getSupabase()
  const userId = await requireUserId()
  const { data, error } = await supabase
    .from('kakao_analyses')
    .insert({
      student_id: params.studentId,
      source_text: params.sourceText,
      source_hash: params.sourceHash,
      result: params.result,
      created_by: userId,
    })
    .select('id')
    .single()
  if (error) throw error
  await logActivity({
    studentId: params.studentId,
    type: 'kakao_analysis',
    summary: '카카오톡 대화 분석',
  })
  return data.id as string
}

export async function createMonthlyReport(params: {
  studentId: string
  title: string
  method: CounselReportMethod
  targetMonth: string
  sourceText: string
  sections: CounselReportSection[]
}): Promise<string> {
  const supabase = getSupabase()
  const userId = await requireUserId()
  const { data, error } = await supabase
    .from('monthly_reports')
    .insert({
      student_id: params.studentId,
      title: params.title,
      method: params.method,
      target_month: params.targetMonth,
      source_text: params.sourceText,
      result: { sections: params.sections },
      created_by: userId,
    })
    .select('id')
    .single()
  if (error) throw error
  await logActivity({
    studentId: params.studentId,
    type: 'report_generated',
    summary: params.title,
  })
  return data.id as string
}

export async function updateMonthlyReport(params: {
  id: string
  title: string
  sections: CounselReportSection[]
}): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('monthly_reports')
    .update({
      title: params.title,
      result: { sections: params.sections },
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
  if (error) throw error
}

// 수정 저장: result 교체. 상태는 유지한다(확정본도 수정 허용)
export async function updateAiReportResult(
  table: AiReportTable,
  id: string,
  result: Record<string, unknown>,
): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from(table)
    .update({ result, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function finalizeAiReport(
  table: AiReportTable,
  id: string,
  studentId: string,
): Promise<void> {
  const supabase = getSupabase()
  const now = new Date().toISOString()
  const { error } = await supabase
    .from(table)
    .update({ status: 'final', finalized_at: now, updated_at: now })
    .eq('id', id)
  if (error) throw error
  await logActivity({
    studentId,
    type: REPORT_ACTIVITY_TYPE[table],
    summary: `${REPORT_LABEL[table]} 확정`,
  })
}

// 재생성: 저장된 원문으로 AI를 다시 돌린 결과로 교체하고 초안으로 되돌린다 (§7 재실행)
export async function regenerateAiReportResult(
  table: AiReportTable,
  id: string,
  studentId: string,
  result: Record<string, unknown>,
): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from(table)
    .update({
      result,
      status: 'draft',
      finalized_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
  await logActivity({
    studentId,
    type: REPORT_ACTIVITY_TYPE[table],
    summary: `${REPORT_LABEL[table]} 재생성`,
  })
}

// 카카오 완전 중복 감지 (§6.8 프로토타입 수준: 원문 해시 동일 여부만)
export async function findKakaoAnalysisByHash(
  studentId: string,
  sourceHash: string,
): Promise<KakaoAnalysis | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('kakao_analyses')
    .select('*')
    .eq('student_id', studentId)
    .eq('source_hash', sourceHash)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return ((data ?? [])[0] ?? null) as KakaoAnalysis | null
}
