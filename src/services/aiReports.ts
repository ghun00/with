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
  AiJob,
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

// 검증 패스 경고를 문서 하단 섹션으로 변환 — 사용자가 검토 후 에디터에서 삭제한다
function warningsSection(warnings?: string[]): CounselReportSection[] {
  if (!warnings?.length) return []
  return [{ name: '⚠ 검토 필요 사항', content: warnings.map((w) => `- ${w}`).join('\n') }]
}

// AI 결과(고정 필드)를 편집 문서의 섹션 배열로 변환한다 — AI 계약은 그대로 두고 UI 진입 시점에 변환.
// 상담 일시는 보고서 기본정보(counsel_date)로 이동했으므로 섹션에서 제외한다.
// discussion/student_status/decisions/next_plan/summary는 AI가 이미 Markdown(필요 시 `### ` 소제목 포함)으로
// 채워 반환하므로 그대로 사용한다. student_todos/consultant_todos만 체크리스트 마커로 직렬화한다 (editAIReport.md).
export function counselResultToSections(result: CounselReportResult): CounselReportSection[] {
  return [
    { name: '상담 목적', content: result.purpose },
    { name: '주요 논의', content: result.discussion },
    { name: '학생 현황', content: result.student_status },
    { name: '결정 사항', content: result.decisions },
    { name: '학생 To Do', content: result.student_todos.map((t) => `- [ ] ${t}`).join('\n') },
    {
      name: '컨설턴트 To Do',
      content: result.consultant_todos.map((t) => `- [ ] ${t}`).join('\n'),
    },
    { name: '다음 상담 계획', content: result.next_plan },
    { name: '1Page Documentation', content: result.summary },
    ...warningsSection(result.warnings),
  ]
}

// 항목명으로 섹션 본문 조회 (목록 표시·월간 보고서 컨텍스트 조립용)
export function counselSectionContent(report: CounselReport, name: string): string {
  return report.result.sections.find((s) => s.name === name)?.content.trim() ?? ''
}

// 섹션 배열 → Markdown 문서. 최상위 섹션 소제목은 `## `로, content의 `### ` 동적 소제목·`- `/`- [ ] ` 마커는
// 유효 Markdown 그대로 유지한다. AI 결과·기본 템플릿·기존 저장본을 편집기 진입 시 Markdown으로 변환할 때 사용한다.
export function sectionsToMarkdown(sections: CounselReportSection[]): string {
  return sections
    .map((s) => {
      const parts: string[] = []
      if (s.name) parts.push(`## ${s.name}`)
      const body = s.content.replace(/\n+$/, '')
      if (body) parts.push(body)
      return parts.join('\n\n')
    })
    .filter((block) => block.length > 0)
    .join('\n\n')
}

// Markdown 문서 → 섹션 배열(하위호환 인덱스). 문서에서 처음 등장하는 헤딩 레벨을 그 문서의 섹션 경계로 삼는다
// (신규 문서는 `## `, 구버전 문서는 `### `가 최상위이므로 마이그레이션 없이 둘 다 지원). 그보다 깊은 헤딩
// (예: 필드 내부의 동적 `### ` 소제목)은 경계로 취급하지 않고 부모 섹션의 content에 그대로 포함시킨다.
// 월간 컨텍스트 조립(ai-generate/tasks/monthlyReport.ts)이 이 인덱스를 읽으므로 저장 시 함께 기록한다.
export function markdownToSections(markdown: string): CounselReportSection[] {
  const firstHeading = markdown.match(/^(#{1,6})\s+/m)
  const boundaryLevel = firstHeading ? firstHeading[1].length : 2
  const boundaryRe = new RegExp(`^#{${boundaryLevel}}\\s+(.*)$`)
  const sections: CounselReportSection[] = []
  let current: { name: string; lines: string[] } | null = null
  const flush = () => {
    if (!current) return
    const content = current.lines.join('\n').replace(/^\n+|\n+$/g, '')
    if (current.name || content.trim()) sections.push({ name: current.name, content })
    current = null
  }
  for (const line of markdown.split('\n')) {
    const heading = line.match(boundaryRe)
    if (heading) {
      flush()
      current = { name: heading[1].trim(), lines: [] }
    } else {
      if (!current) current = { name: '', lines: [] }
      current.lines.push(line)
    }
  }
  flush()
  return sections
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
  return [
    ...MONTHLY_REPORT_SECTIONS.map(({ key, label }) => ({ name: label, content: result[key] })),
    ...warningsSection(result.warnings),
  ]
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
  markdown: string
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
      result: { markdown: params.markdown, sections: markdownToSections(params.markdown) },
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
  markdown: string
}): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('counsel_reports')
    .update({
      title: params.title,
      counsel_date: params.counselDate,
      result: { markdown: params.markdown, sections: markdownToSections(params.markdown) },
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

// 카카오 분석 잡 완료 처리 — 의도(input.analysis_id 유무)로 저장 방식을 결정한다.
// 이렇게 하면 완료 시점에 어느 화면(목록 탭/상세)이 떠 있든 동일하게 동작해,
// 생성 잡을 재생성으로 잘못 저장하거나 그 반대가 되는 일이 없다.
// createdId를 돌려주며(신규 생성 시), 재생성이면 null.
export async function applyKakaoJobResult(
  job: AiJob,
  studentId: string,
): Promise<{ createdId: string | null }> {
  const result = job.result as KakaoAnalysisResult
  const analysisId = typeof job.input.analysis_id === 'string' ? job.input.analysis_id : null
  if (analysisId) {
    await regenerateAiReportResult('kakao_analyses', analysisId, studentId, { ...result })
    return { createdId: null }
  }
  const createdId = await createKakaoAnalysis({
    studentId,
    sourceText: String(job.input.raw_text ?? ''),
    sourceHash: String(job.input.source_hash ?? ''),
    result,
  })
  return { createdId }
}

export async function createMonthlyReport(params: {
  studentId: string
  title: string
  method: CounselReportMethod
  targetMonth: string
  sourceText: string
  markdown: string
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
      result: { markdown: params.markdown, sections: markdownToSections(params.markdown) },
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
  markdown: string
}): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('monthly_reports')
    .update({
      title: params.title,
      result: { markdown: params.markdown, sections: markdownToSections(params.markdown) },
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
