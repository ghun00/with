import { getSupabase } from '@/lib/supabase'
import type { Activity, ActivityType } from '@/types'

export async function logActivity(params: {
  studentId: string
  type: ActivityType
  summary: string
  ref?: Record<string, unknown>
}): Promise<void> {
  const supabase = getSupabase()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return
  const { error } = await supabase.from('activities').insert({
    student_id: params.studentId,
    type: params.type,
    actor_id: auth.user.id,
    summary: params.summary,
    ref: params.ref ?? null,
  })
  // 타임라인 기록 실패가 본 작업을 막지 않도록 콘솔에만 남긴다
  if (error) console.error('activity log failed:', error.message)
}

export async function fetchActivities(studentId: string, type?: ActivityType): Promise<Activity[]> {
  const supabase = getSupabase()
  let query = supabase
    .from('activities')
    .select('*, actor:profiles(id, name, avatar_url)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (type) query = query.eq('type', type)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Activity[]
}
