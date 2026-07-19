import { getSupabase } from '@/lib/supabase'
import { logActivity } from '@/services/activities'
import type { Memo, MemoTag } from '@/types'

export async function fetchMemos(studentId: string): Promise<Memo[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('memos')
    .select('*, author:profiles(id, name, avatar_url)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Memo[]
}

export async function createMemo(studentId: string, content: string, tag: MemoTag): Promise<void> {
  const supabase = getSupabase()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('로그인이 필요합니다.')
  const { error } = await supabase.from('memos').insert({
    student_id: studentId,
    author_id: auth.user.id,
    content,
    tag,
  })
  if (error) throw error
  const preview = content.length > 30 ? `${content.slice(0, 30)}…` : content
  await logActivity({ studentId, type: 'memo_created', summary: `[${tag}] ${preview}` })
}

export async function updateMemo(memoId: string, content: string, tag: MemoTag): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('memos')
    .update({ content, tag, updated_at: new Date().toISOString() })
    .eq('id', memoId)
  if (error) throw error
}

export async function deleteMemo(memoId: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('memos').delete().eq('id', memoId)
  if (error) throw error
}
