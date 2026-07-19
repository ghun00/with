import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!client) {
    if (!url || !anonKey) {
      throw new Error(
        'Supabase 환경 변수가 설정되지 않았습니다. .env.local에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY를 설정하세요.',
      )
    }
    client = createClient(url, anonKey)
  }
  return client
}
