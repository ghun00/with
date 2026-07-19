import { getSupabase } from '@/lib/supabase'
import { logActivity } from '@/services/activities'
import type { StudentSchedule } from '@/types'

export interface ScheduleInput {
  title: string
  startAt: string // ISO
  endAt: string | null // ISO 또는 null
  memo: string | null
}

// 공통 입력 검증 (제목·시작 필수, 종료가 있으면 시작보다 뒤)
function validate(input: ScheduleInput): void {
  if (!input.title) throw new Error('일정명을 입력하세요.')
  if (!input.startAt) throw new Error('시작 일시를 입력하세요.')
  if (input.endAt && new Date(input.endAt).getTime() <= new Date(input.startAt).getTime()) {
    throw new Error('종료 일시는 시작 일시보다 뒤여야 합니다.')
  }
}

export async function fetchStudentSchedules(studentId: string): Promise<StudentSchedule[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('student_schedules')
    .select('*, creator:profiles(id, name, avatar_url)')
    .eq('student_id', studentId)
    .order('start_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as StudentSchedule[]
}

export async function createStudentSchedule(studentId: string, input: ScheduleInput): Promise<void> {
  validate(input)
  const supabase = getSupabase()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('로그인이 필요합니다.')
  const { error } = await supabase.from('student_schedules').insert({
    student_id: studentId,
    created_by: auth.user.id,
    title: input.title,
    start_at: input.startAt,
    end_at: input.endAt,
    memo: input.memo,
  })
  if (error) throw error
  await logActivity({ studentId, type: 'schedule', summary: input.title })
}

export async function updateStudentSchedule(id: string, input: ScheduleInput): Promise<void> {
  validate(input)
  const supabase = getSupabase()
  const { error } = await supabase
    .from('student_schedules')
    .update({
      title: input.title,
      start_at: input.startAt,
      end_at: input.endAt,
      memo: input.memo,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteStudentSchedule(id: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('student_schedules').delete().eq('id', id)
  if (error) throw error
}
