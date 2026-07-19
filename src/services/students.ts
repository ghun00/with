import { getSupabase } from '@/lib/supabase'
import { logActivity } from '@/services/activities'
import type { Student, StudentListItem, StudentStatus, AssignmentRole } from '@/types'

export interface StudentInput {
  name: string
  school: string
  grade: string
  student_phone: string
  parent_phone: string
  status: StudentStatus
  primaryConsultantId: string | null
  coConsultantIds: string[]
}

const LIST_SELECT = `
  *,
  assignments:student_assignments(student_id, user_id, role, profile:profiles(id, name, avatar_url)),
  student_activities(id, status),
  activities(created_at)
`

function toListItem(row: Record<string, unknown>): StudentListItem {
  const studentActivities = (row.student_activities ?? []) as { status: string }[]
  const activities = (row.activities ?? []) as { created_at: string }[]
  const lastActivityAt = activities.length
    ? activities.reduce((max, a) => (a.created_at > max ? a.created_at : max), activities[0].created_at)
    : null
  const { student_activities: _sa, activities: _a, ...rest } = row
  return {
    ...(rest as unknown as Student),
    assignments: (row.assignments ?? []) as StudentListItem['assignments'],
    activeActivityCount: studentActivities.filter((a) => a.status !== 'completed').length,
    lastActivityAt,
  }
}

export async function fetchStudents(groupId: string): Promise<StudentListItem[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('students')
    .select(LIST_SELECT)
    .eq('group_id', groupId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => toListItem(row as Record<string, unknown>))
}

export async function fetchStudent(studentId: string): Promise<StudentListItem | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('students')
    .select(LIST_SELECT)
    .eq('id', studentId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  return data ? toListItem(data as Record<string, unknown>) : null
}

async function syncAssignments(
  studentId: string,
  primaryConsultantId: string | null,
  coConsultantIds: string[],
) {
  const supabase = getSupabase()
  const desired = new Map<string, AssignmentRole>()
  if (primaryConsultantId) desired.set(primaryConsultantId, 'primary')
  for (const id of coConsultantIds) {
    if (!desired.has(id)) desired.set(id, 'co')
  }

  const { data: current, error } = await supabase
    .from('student_assignments')
    .select('user_id, role')
    .eq('student_id', studentId)
  if (error) throw error

  const currentMap = new Map((current ?? []).map((a) => [a.user_id as string, a.role as AssignmentRole]))

  const toRemove = [...currentMap.keys()].filter((id) => !desired.has(id))
  const toUpsert = [...desired.entries()].filter(([id, role]) => currentMap.get(id) !== role)

  if (toRemove.length) {
    const { error: delError } = await supabase
      .from('student_assignments')
      .delete()
      .eq('student_id', studentId)
      .in('user_id', toRemove)
    if (delError) throw delError
  }
  if (toUpsert.length) {
    const { error: upError } = await supabase.from('student_assignments').upsert(
      toUpsert.map(([userId, role]) => ({ student_id: studentId, user_id: userId, role })),
      { onConflict: 'student_id,user_id' },
    )
    if (upError) throw upError
  }
}

export async function createStudent(groupId: string, input: StudentInput): Promise<string> {
  const supabase = getSupabase()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('로그인이 필요합니다.')

  const { data, error } = await supabase
    .from('students')
    .insert({
      group_id: groupId,
      name: input.name,
      school: input.school,
      grade: input.grade,
      student_phone: input.student_phone,
      parent_phone: input.parent_phone,
      status: input.status,
      created_by: auth.user.id,
    })
    .select('id')
    .single()
  if (error) throw error

  const studentId = data.id as string
  await syncAssignments(studentId, input.primaryConsultantId, input.coConsultantIds)
  await logActivity({ studentId, type: 'student_created', summary: `${input.name} 학생 등록` })
  return studentId
}

export async function updateStudent(studentId: string, input: StudentInput): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('students')
    .update({
      name: input.name,
      school: input.school,
      grade: input.grade,
      student_phone: input.student_phone,
      parent_phone: input.parent_phone,
      status: input.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', studentId)
  if (error) throw error

  await syncAssignments(studentId, input.primaryConsultantId, input.coConsultantIds)
  await logActivity({ studentId, type: 'student_updated', summary: '학생 정보 수정' })
}

export async function softDeleteStudent(studentId: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('students')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', studentId)
  if (error) throw error
}
