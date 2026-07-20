// 학생 컨텍스트(용어사전) 조립 — 인물 지칭 정규화의 기준점 (스펙 §[1])
// 사용자 JWT 클라이언트로 조회하므로 RLS가 접근 권한을 그대로 강제한다.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { AiError } from './http.ts'

const STATUS_LABEL: Record<string, string> = { active: '관리 중', paused: '일시 중단', ended: '종료' }
const ROLE_LABEL: Record<string, string> = { primary: '주담당', co: '부담당' }

interface StudentRow {
  name: string
  school: string
  grade: string
  status: string
  student_assignments: { role: string; profiles: { name: string } | null }[]
}

export async function buildStudentContext(
  supabase: SupabaseClient,
  studentId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('students')
    .select('name, school, grade, status, student_assignments(role, profiles(name))')
    .eq('id', studentId)
    .maybeSingle()
  if (error) {
    console.error('[ai-generate] student query failed', error)
    throw new AiError('ai_error', '학생 정보 조회에 실패했습니다.')
  }
  if (!data) throw new AiError('student_not_found', '학생을 찾을 수 없거나 접근 권한이 없습니다.')

  const student = data as unknown as StudentRow
  const consultants = (student.student_assignments ?? [])
    .map((a) => (a.profiles?.name ? `${a.profiles.name}(${ROLE_LABEL[a.role] ?? a.role})` : null))
    .filter(Boolean)
    .join(', ')

  return [
    '[학생 정보]',
    `- 이름: ${student.name}`,
    student.school && `- 학교: ${student.school}`,
    student.grade && `- 학년: ${student.grade}`,
    `- 관리 상태: ${STATUS_LABEL[student.status] ?? student.status}`,
    consultants && `- 담당 컨설턴트: ${consultants}`,
  ]
    .filter(Boolean)
    .join('\n')
}
