import { getSupabase } from '@/lib/supabase'
import { logActivity } from '@/services/activities'
import {
  STUDENT_ACTIVITY_STATUS_LABEL,
  type StudentActivity,
  type StudentActivityCategory,
  type StudentActivityHistoryEvent,
  type StudentActivityHistoryEventType,
  type StudentActivitySubtask,
  type StudentActivityStatus,
} from '@/types'

async function logActivityHistory(params: {
  activityId: string
  eventType: StudentActivityHistoryEventType
  summary: string
  oldValue?: Record<string, unknown>
  newValue?: Record<string, unknown>
}): Promise<void> {
  const supabase = getSupabase()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('로그인이 필요합니다.')
  const { error } = await supabase.from('student_activity_history').insert({
    activity_id: params.activityId,
    event_type: params.eventType,
    actor_id: auth.user.id,
    summary: params.summary,
    old_value: params.oldValue ?? null,
    new_value: params.newValue ?? null,
  })
  if (error) throw error
}

export async function fetchStudentActivities(studentId: string): Promise<
  (StudentActivity & { subtasks: { id: string; is_done: boolean }[] })[]
> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('student_activities')
    .select('*, subtasks:student_activity_subtasks(id, is_done)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as (StudentActivity & { subtasks: { id: string; is_done: boolean }[] })[]
}

export async function fetchStudentActivity(activityId: string): Promise<StudentActivity | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('student_activities')
    .select('*')
    .eq('id', activityId)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as StudentActivity | null
}

export async function fetchActivitySubtasks(activityId: string): Promise<StudentActivitySubtask[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('student_activity_subtasks')
    .select('*')
    .eq('activity_id', activityId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as StudentActivitySubtask[]
}

export async function fetchActivityHistory(activityId: string): Promise<StudentActivityHistoryEvent[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('student_activity_history')
    .select('*, actor:profiles(id, name, avatar_url)')
    .eq('activity_id', activityId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []) as StudentActivityHistoryEvent[]
}

export async function createStudentActivity(params: {
  studentId: string
  name: string
  status: StudentActivityStatus
  category: StudentActivityCategory
  dueDate: string | null
  detail: string
}): Promise<string> {
  const supabase = getSupabase()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('로그인이 필요합니다.')
  const { data, error } = await supabase
    .from('student_activities')
    .insert({
      student_id: params.studentId,
      name: params.name,
      status: params.status,
      category: params.category,
      due_date: params.dueDate,
      detail: params.detail,
      created_by: auth.user.id,
    })
    .select('id')
    .single()
  if (error) throw error

  const activityId = data.id as string
  await logActivityHistory({ activityId, eventType: 'created', summary: params.name })
  await logActivity({ studentId: params.studentId, type: 'activity_created', summary: params.name })
  return activityId
}

export async function updateActivityStatus(
  activity: StudentActivity,
  status: StudentActivityStatus,
): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('student_activities')
    .update({
      status,
      updated_at: new Date().toISOString(),
      completed_at: status === 'completed' ? new Date().toISOString() : null,
    })
    .eq('id', activity.id)
  if (error) throw error

  const summary = `${STUDENT_ACTIVITY_STATUS_LABEL[activity.status]} → ${STUDENT_ACTIVITY_STATUS_LABEL[status]}`
  await logActivityHistory({
    activityId: activity.id,
    eventType: status === 'completed' ? 'completed' : 'status_changed',
    summary,
    oldValue: { status: activity.status },
    newValue: { status },
  })
  await logActivity({
    studentId: activity.student_id,
    type: status === 'completed' ? 'activity_completed' : 'activity_status_changed',
    summary: `${activity.name} → ${STUDENT_ACTIVITY_STATUS_LABEL[status]}`,
  })
}

export async function updateActivityName(activity: StudentActivity, name: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('student_activities')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', activity.id)
  if (error) throw error
  await logActivityHistory({
    activityId: activity.id,
    eventType: 'name_edited',
    summary: `${activity.name} → ${name}`,
    oldValue: { name: activity.name },
    newValue: { name },
  })
}

export async function updateActivityCategory(
  activity: StudentActivity,
  category: StudentActivityCategory,
): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('student_activities')
    .update({ category, updated_at: new Date().toISOString() })
    .eq('id', activity.id)
  if (error) throw error
  await logActivityHistory({
    activityId: activity.id,
    eventType: 'category_changed',
    summary: `${activity.category} → ${category}`,
    oldValue: { category: activity.category },
    newValue: { category },
  })
}

export async function updateActivityDueDate(
  activity: StudentActivity,
  dueDate: string | null,
): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('student_activities')
    .update({ due_date: dueDate, updated_at: new Date().toISOString() })
    .eq('id', activity.id)
  if (error) throw error
  await logActivityHistory({
    activityId: activity.id,
    eventType: 'due_date_changed',
    summary: `마감일 ${dueDate ?? '없음'}`,
    oldValue: { due_date: activity.due_date },
    newValue: { due_date: dueDate },
  })
}

export async function updateActivityDetail(activity: StudentActivity, detail: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('student_activities')
    .update({ detail, updated_at: new Date().toISOString() })
    .eq('id', activity.id)
  if (error) throw error
  const preview = detail.length > 60 ? `${detail.slice(0, 60)}…` : detail
  await logActivityHistory({ activityId: activity.id, eventType: 'detail_edited', summary: preview })
}

export async function deleteStudentActivity(activityId: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('student_activities').delete().eq('id', activityId)
  if (error) throw error
}

export async function addSubtask(activityId: string, title: string, position: number): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('student_activity_subtasks').insert({
    activity_id: activityId,
    title,
    position,
  })
  if (error) throw error
  await logActivityHistory({ activityId, eventType: 'subtask_added', summary: title })
}

export async function toggleSubtask(subtask: StudentActivitySubtask): Promise<void> {
  const supabase = getSupabase()
  const nextDone = !subtask.is_done
  const { error } = await supabase
    .from('student_activity_subtasks')
    .update({ is_done: nextDone, updated_at: new Date().toISOString() })
    .eq('id', subtask.id)
  if (error) throw error
  await logActivityHistory({
    activityId: subtask.activity_id,
    eventType: nextDone ? 'subtask_completed' : 'subtask_reopened',
    summary: subtask.title,
  })
}

export async function deleteSubtask(subtask: StudentActivitySubtask): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('student_activity_subtasks').delete().eq('id', subtask.id)
  if (error) throw error
  await logActivityHistory({ activityId: subtask.activity_id, eventType: 'subtask_deleted', summary: subtask.title })
}
