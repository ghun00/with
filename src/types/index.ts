import type { KakaoAnalysisResult, MonthlyReportResult } from '@/services/ai'

export type MemberRole = 'owner' | 'member'
export type StudentStatus = 'active' | 'paused' | 'ended'
export type AssignmentRole = 'primary' | 'co'
export type MemoTag = '상담' | '활동' | '진학' | '특이사항' | '학부모' | '기타'
export type StudentActivityStatus = 'planned' | 'in_progress' | 'completed'
export type StudentActivityCategory = '세특' | '창체' | '독서' | '행특' | '기타'
export type StudentActivityHistoryEventType =
  | 'created'
  | 'status_changed'
  | 'completed'
  | 'name_edited'
  | 'category_changed'
  | 'due_date_changed'
  | 'detail_edited'
  | 'subtask_added'
  | 'subtask_completed'
  | 'subtask_reopened'
  | 'subtask_deleted'
export type ActivityType =
  | 'student_created'
  | 'student_updated'
  | 'memo_created'
  | 'activity_created'
  | 'activity_status_changed'
  | 'activity_completed'
  | 'counsel_report'
  | 'kakao_analysis'
  | 'schedule'
  | 'file_uploaded'
  | 'report_generated'

export const MEMO_TAGS: MemoTag[] = ['상담', '활동', '진학', '특이사항', '학부모', '기타']

export const STUDENT_STATUS_LABEL: Record<StudentStatus, string> = {
  active: '관리 중',
  paused: '일시 중단',
  ended: '종료',
}

export const STUDENT_ACTIVITY_STATUS_LABEL: Record<StudentActivityStatus, string> = {
  planned: '진행 예정',
  in_progress: '진행 중',
  completed: '활동 완료',
}

export const STUDENT_ACTIVITY_CATEGORY_LABEL: Record<StudentActivityCategory, string> = {
  세특: '세특',
  창체: '창체(자율·동아리·진로)',
  독서: '독서',
  행특: '행특',
  기타: '기타',
}

export const STUDENT_ACTIVITY_HISTORY_EVENT_LABEL: Record<StudentActivityHistoryEventType, string> = {
  created: '활동 등록',
  status_changed: '상태 변경',
  completed: '활동 완료',
  name_edited: '활동명 수정',
  category_changed: '분류 변경',
  due_date_changed: '마감일 변경',
  detail_edited: '세부 내용 수정',
  subtask_added: '세부 작업 추가',
  subtask_completed: '세부 작업 완료',
  subtask_reopened: '세부 작업 재개',
  subtask_deleted: '세부 작업 삭제',
}

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  student_created: '학생 등록',
  student_updated: '정보 수정',
  memo_created: '메모',
  activity_created: '활동 등록',
  activity_status_changed: '활동 상태 변경',
  activity_completed: '활동 완료',
  counsel_report: '상담보고서',
  kakao_analysis: '카카오톡 분석',
  schedule: '일정',
  file_uploaded: '파일',
  report_generated: '보고서',
}

export interface Profile {
  id: string
  name: string
  avatar_url: string | null
}

export interface Group {
  id: string
  name: string
  owner_id: string
  created_at: string
}

export interface GroupMember {
  group_id: string
  user_id: string
  role: MemberRole
  created_at: string
  profile?: Profile
}

export interface Invitation {
  id: string
  group_id: string
  token: string
  invited_email: string | null
  status: 'pending' | 'accepted' | 'revoked'
  created_at: string
}

export interface StudentAssignment {
  student_id: string
  user_id: string
  role: AssignmentRole
  profile?: Profile
}

export interface Student {
  id: string
  group_id: string
  name: string
  school: string
  grade: string
  student_phone: string
  parent_phone: string
  status: StudentStatus
  created_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  assignments?: StudentAssignment[]
}

export interface StudentListItem extends Student {
  assignments: StudentAssignment[]
  activeActivityCount: number
  lastActivityAt: string | null
}

export interface Memo {
  id: string
  student_id: string
  author_id: string
  content: string
  tag: MemoTag
  created_at: string
  updated_at: string
  author?: Profile
}

export interface StudentActivity {
  id: string
  student_id: string
  name: string
  status: StudentActivityStatus
  category: StudentActivityCategory
  due_date: string | null
  detail: string
  created_by: string
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface StudentActivitySubtask {
  id: string
  activity_id: string
  student_id: string
  title: string
  is_done: boolean
  position: number
  created_at: string
  updated_at: string
}

export interface StudentActivityHistoryEvent {
  id: string
  activity_id: string
  student_id: string
  event_type: StudentActivityHistoryEventType
  actor_id: string
  summary: string
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  created_at: string
  actor?: Profile
}

// AI 보고서 공통 상태 (prd §7: 생성 즉시 초안 저장 → 수정 → 확정)
export type AiReportStatus = 'draft' | 'final'

export const AI_REPORT_STATUS_LABEL: Record<AiReportStatus, string> = {
  draft: '초안',
  final: '확정',
}

// 상담보고서 작성 방식 (editReport.md: 직접 작성이 기본, AI 생성은 보조)
export type CounselReportMethod = 'manual' | 'ai'

export const COUNSEL_REPORT_METHOD_LABEL: Record<CounselReportMethod, string> = {
  manual: '직접 작성',
  ai: 'AI 생성',
}

// 상담보고서는 노션 템플릿처럼 자유 편집 가능한 섹션 문서 구조
export interface CounselReportSection {
  name: string
  content: string
}

export interface CounselReport {
  id: string
  student_id: string
  title: string
  method: CounselReportMethod
  counsel_date: string | null
  source_text: string
  result: { sections: CounselReportSection[] }
  status: AiReportStatus
  created_by: string
  created_at: string
  updated_at: string
  finalized_at: string | null
  author?: Profile
}

export interface KakaoAnalysis {
  id: string
  student_id: string
  source_text: string
  source_hash: string
  result: KakaoAnalysisResult
  status: AiReportStatus
  created_by: string
  created_at: string
  updated_at: string
  finalized_at: string | null
}

export interface MonthlyReport {
  id: string
  student_id: string
  target_month: string // YYYY-MM
  source_text: string
  result: MonthlyReportResult
  status: AiReportStatus
  created_by: string
  created_at: string
  updated_at: string
  finalized_at: string | null
}

// 월간 보고서 목차 순서·라벨 (렌더링/복사/인쇄에서 공용, prd §6.12)
export const MONTHLY_REPORT_SECTIONS: { key: keyof MonthlyReportResult; label: string }[] = [
  { key: 'activity_summary', label: '이번 달 활동 요약' },
  { key: 'achievements', label: '주요 성과' },
  { key: 'communication', label: '상담 및 소통 내용' },
  { key: 'todo_progress', label: 'To Do 수행 현황' },
  { key: 'improvements', label: '보완 필요 사항' },
  { key: 'next_month_plan', label: '다음 달 계획' },
  { key: 'consultant_opinion', label: '컨설턴트 의견' },
]

export interface Activity {
  id: string
  student_id: string
  type: ActivityType
  actor_id: string
  summary: string
  ref: Record<string, unknown> | null
  created_at: string
  actor?: Profile
}
