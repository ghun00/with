import { getSupabase } from '@/lib/supabase'
import type { Group, GroupMember, Invitation, Student } from '@/types'

export interface Membership {
  group: Group
  role: 'owner' | 'member'
}

export async function fetchMyMemberships(): Promise<Membership[]> {
  const supabase = getSupabase()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return []
  const { data, error } = await supabase
    .from('group_members')
    .select('role, group:groups(*)')
    .eq('user_id', auth.user.id)
  if (error) throw error
  return (data ?? [])
    .filter((row) => row.group)
    .map((row) => ({
      group: row.group as unknown as Group,
      role: row.role as 'owner' | 'member',
    }))
}

export async function createGroup(name: string): Promise<string> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('create_group', { group_name: name })
  if (error) throw error
  return data as string
}

export async function updateGroupName(groupId: string, name: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('groups').update({ name }).eq('id', groupId)
  if (error) throw error
}

export async function acceptInvitation(token: string): Promise<string> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('accept_invitation', { invite_token: token })
  if (error) throw error
  return data as string
}

export async function fetchGroupMembers(groupId: string): Promise<GroupMember[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('group_members')
    .select('*, profile:profiles(id, name, avatar_url)')
    .eq('group_id', groupId)
    .order('created_at')
  if (error) throw error
  return (data ?? []) as GroupMember[]
}

export async function createInvitation(groupId: string, invitedEmail?: string): Promise<Invitation> {
  const supabase = getSupabase()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('로그인이 필요합니다.')
  const { data, error } = await supabase
    .from('invitations')
    .insert({
      group_id: groupId,
      invited_email: invitedEmail || null,
      created_by: auth.user.id,
    })
    .select()
    .single()
  if (error) throw error
  return data as Invitation
}

export async function fetchPendingInvitations(groupId: string): Promise<Invitation[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Invitation[]
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('invitations')
    .update({ status: 'revoked' })
    .eq('id', invitationId)
  if (error) throw error
}

export async function removeMember(groupId: string, userId: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function fetchMemberStudents(groupId: string, userId: string): Promise<Student[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('student_assignments')
    .select('role, student:students(*)')
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? [])
    .map((row) => row.student as unknown as Student)
    .filter((s) => s && s.group_id === groupId && !s.deleted_at)
}
