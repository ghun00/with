// 월간 보고서 task — 서버에서 대상 월 컨텍스트 조립 → 생성 패스 → 검증 패스 (스펙 §월간 보고서 컨텍스트)
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { AiError } from '../http.ts'
import { COMMON_RULES, callClaudeJson } from '../claude.ts'
import { buildStudentContext } from '../studentContext.ts'
import { verifyResult } from '../verify.ts'

// 프론트 MonthlyReportResult(src/services/ai/index.ts) 본문 7개 목차와 1:1 — 필드 변경 금지
interface MonthlyReportResult {
  activity_summary: string
  achievements: string
  communication: string
  todo_progress: string
  improvements: string
  next_month_plan: string
  consultant_opinion: string
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'activity_summary',
    'achievements',
    'communication',
    'todo_progress',
    'improvements',
    'next_month_plan',
    'consultant_opinion',
  ],
  properties: {
    activity_summary: { type: 'string', description: '이번 달 활동 요약' },
    achievements: { type: 'string', description: '주요 성과' },
    communication: { type: 'string', description: '상담 및 소통 내용' },
    todo_progress: { type: 'string', description: 'To Do(활동) 수행 현황' },
    improvements: { type: 'string', description: '보완이 필요한 사항' },
    next_month_plan: { type: 'string', description: '다음 달 계획' },
    consultant_opinion: { type: 'string', description: '컨설턴트 의견 (전문가 관점의 총평)' },
  },
}

const SYSTEM = `너는 학생부종합전형(학종) 컨설팅 회사의 보고서 보조 작성자다. 한 달간의 활동·메모·상담 기록을 바탕으로 학부모에게 전달할 월간 보고서 초안을 작성한다. 기록에 없는 성과를 만들어내지 않는다.

${COMMON_RULES}`

const ACTIVITY_STATUS_LABEL: Record<string, string> = {
  planned: '진행 예정',
  in_progress: '진행 중',
  completed: '활동 완료',
}

interface CounselReportRow {
  title: string
  counsel_date: string | null
  created_at: string
  result: { sections?: { name: string; content: string }[] }
}

// 대상 월의 메모/활동/상담보고서를 텍스트로 합친다 (기존 클라이언트 buildMonthlyContext와 동일 규칙)
async function buildMonthlyContext(
  supabase: SupabaseClient,
  studentId: string,
  targetMonth: string,
  note: string,
): Promise<string> {
  const [memosRes, activitiesRes, reportsRes] = await Promise.all([
    supabase
      .from('memos')
      .select('content, tag, created_at')
      .eq('student_id', studentId)
      .order('created_at'),
    supabase
      .from('student_activities')
      .select('name, status, due_date, completed_at, created_at')
      .eq('student_id', studentId)
      .order('created_at'),
    supabase
      .from('counsel_reports')
      .select('title, counsel_date, created_at, result')
      .eq('student_id', studentId)
      .order('created_at'),
  ])
  for (const res of [memosRes, activitiesRes, reportsRes]) {
    if (res.error) {
      console.error('[ai-generate] monthly context query failed', res.error)
      throw new AiError('ai_error', '월간 보고서 컨텍스트 조회에 실패했습니다.')
    }
  }

  const inMonth = (value: string | null | undefined) => Boolean(value?.startsWith(targetMonth))
  const lines: string[] = [`대상 월: ${targetMonth}`]

  const monthActivities = (activitiesRes.data ?? []).filter(
    (a) => inMonth(a.created_at) || inMonth(a.completed_at) || inMonth(a.due_date),
  )
  if (monthActivities.length) {
    lines.push('\n[활동]')
    for (const a of monthActivities) {
      lines.push(`- ${a.name} (${ACTIVITY_STATUS_LABEL[a.status] ?? a.status})`)
    }
  }

  const monthMemos = (memosRes.data ?? []).filter((m) => inMonth(m.created_at))
  if (monthMemos.length) {
    lines.push('\n[메모]')
    for (const m of monthMemos) lines.push(`- [${m.tag}] ${m.content}`)
  }

  const monthReports = ((reportsRes.data ?? []) as CounselReportRow[]).filter(
    (r) => inMonth(r.created_at) || inMonth(r.counsel_date),
  )
  if (monthReports.length) {
    lines.push('\n[상담보고서]')
    for (const r of monthReports) {
      const summary =
        r.result.sections?.find((s) => s.name === '1Page Documentation')?.content.trim() ?? ''
      lines.push(`- ${r.title}${summary ? `: ${summary}` : ''}`)
    }
  }

  if (note) {
    lines.push('\n[참고 사항]')
    lines.push(note)
  }

  return lines.join('\n')
}

export async function runMonthlyReport(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<MonthlyReportResult & { warnings: string[]; source_context: string }> {
  const studentId = typeof body.student_id === 'string' ? body.student_id : ''
  const targetMonth = typeof body.target_month === 'string' ? body.target_month : ''
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  if (!studentId || !/^\d{4}-\d{2}$/.test(targetMonth))
    throw new AiError('invalid_request', 'student_id와 target_month(YYYY-MM)가 필요합니다.')

  const studentContext = await buildStudentContext(supabase, studentId)
  const context = await buildMonthlyContext(supabase, studentId, targetMonth, note)

  const generated = await callClaudeJson<MonthlyReportResult>({
    system: `${SYSTEM}\n\n${studentContext}`,
    userText: `[이번 달 기록]\n${context}`,
    schema: SCHEMA,
  })

  const verified = await verifyResult({
    taskLabel: '월간 보고서',
    studentContext,
    sourceText: context,
    generated,
    schema: SCHEMA,
  })

  return { ...verified, source_context: context }
}
