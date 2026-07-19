import { getSupabase } from '@/lib/supabase'
import { logActivity } from '@/services/activities'
import type { StudentFile } from '@/types'

const BUCKET = 'student-files'

export const ALLOWED_FILE_EXTENSIONS = [
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'docx',
  'hwp',
  'hwpx',
  'txt',
  'xlsx',
]

export const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB (버킷 file_size_limit와 동일)

// file input의 accept 속성용
export const FILE_ACCEPT = ALLOWED_FILE_EXTENSIONS.map((ext) => `.${ext}`).join(',')

function extensionOf(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx === -1 ? '' : name.slice(idx + 1).toLowerCase()
}

// 목록에 표시할 형식 라벨 (확장자 기반 자동 판별 — 별도 분류 입력 없음)
export function getFileKind(name: string): string {
  const ext = extensionOf(name)
  if (ext === 'pdf') return 'PDF'
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return '이미지'
  if (['docx', 'hwp', 'hwpx', 'txt'].includes(ext)) return '문서'
  if (ext === 'xlsx') return '엑셀'
  return '기타'
}

export async function fetchStudentFiles(studentId: string): Promise<StudentFile[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('student_files')
    .select('*, uploader:profiles(id, name, avatar_url)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as StudentFile[]
}

export async function uploadStudentFile(studentId: string, file: File): Promise<void> {
  const ext = extensionOf(file.name)
  if (!ALLOWED_FILE_EXTENSIONS.includes(ext)) {
    throw new Error(`지원하지 않는 파일 형식입니다. (${ALLOWED_FILE_EXTENSIONS.join(', ')})`)
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('파일은 20MB 이하만 업로드할 수 있습니다.')
  }

  const supabase = getSupabase()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('로그인이 필요합니다.')

  // 원본 파일명은 경로에 넣지 않는다 (한글·특수문자 경로 문제 회피) — name 컬럼에만 보관
  const storagePath = `${studentId}/${crypto.randomUUID()}`
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: file.type || 'application/octet-stream',
  })
  if (uploadError) throw uploadError

  const { error: insertError } = await supabase.from('student_files').insert({
    student_id: studentId,
    uploader_id: auth.user.id,
    name: file.name,
    storage_path: storagePath,
    size: file.size,
    mime_type: file.type || 'application/octet-stream',
  })
  if (insertError) {
    // 메타데이터 저장 실패 시 고아 객체 정리 (실패해도 무시 — 목록엔 노출되지 않음)
    await supabase.storage.from(BUCKET).remove([storagePath])
    throw insertError
  }

  await logActivity({
    studentId,
    type: 'file_uploaded',
    summary: file.name,
    ref: { storage_path: storagePath },
  })
}

export async function deleteStudentFile(file: StudentFile): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('student_files').delete().eq('id', file.id)
  if (error) throw error
  // row가 진실 원장 — 객체 삭제 실패는 콘솔에만 남긴다
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([file.storage_path])
  if (storageError) console.error('storage object delete failed:', storageError.message)
}

export async function getStudentFileUrl(file: StudentFile, download = false): Promise<string> {
  const supabase = getSupabase()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(file.storage_path, 60, download ? { download: file.name } : undefined)
  if (error) throw error
  return data.signedUrl
}
