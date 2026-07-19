import type { ReactNode } from 'react'
import type { AiReportStatus, StudentActivityStatus, StudentStatus } from '@/types'

/* fx 원칙: 무채색 우선. 컬러 배경은 상태(진행/성공/경고)를 나타낼 때만 subtle하게 사용 */
type Tone = 'neutral' | 'outline' | 'accent' | 'success' | 'warning' | 'danger'

const TONE: Record<Tone, string> = {
  neutral: 'bg-sunken text-fg-secondary',
  outline: 'border border-line text-fg-secondary',
  accent: 'bg-accent-50 text-accent-600',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-caption font-medium ${TONE[tone]}`}
    >
      {children}
    </span>
  )
}

export const STUDENT_STATUS_TONE: Record<StudentStatus, Tone> = {
  active: 'success',
  paused: 'warning',
  ended: 'neutral',
}

export const STUDENT_ACTIVITY_STATUS_TONE: Record<StudentActivityStatus, Tone> = {
  planned: 'neutral',
  in_progress: 'accent',
  completed: 'success',
}

export const AI_REPORT_STATUS_TONE: Record<AiReportStatus, Tone> = {
  draft: 'neutral',
  final: 'success',
}
