import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import { isSupabaseConfigured } from '@/lib/supabase'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { GroupProvider } from '@/features/group/GroupProvider'
import { LoginPage } from '@/features/auth/LoginPage'
import { OnboardingPage } from '@/features/onboarding/OnboardingPage'
import { InvitePage } from '@/features/invite/InvitePage'
import { StudentListPage } from '@/features/students/StudentListPage'
import { StudentDetailPage } from '@/features/student-detail/StudentDetailPage'
import { GroupSettingsPage } from '@/features/settings/GroupSettingsPage'
import { AppLayout } from '@/routes/AppLayout'
import { SetupNotice } from '@/routes/SetupNotice'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

export default function App() {
  if (!isSupabaseConfigured) return <SetupNotice />

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
      <AuthProvider>
        <GroupProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route path="/invite/:token" element={<InvitePage />} />
              <Route element={<AppLayout />}>
                <Route index element={<Navigate to="/students" replace />} />
                <Route path="/students" element={<StudentListPage />} />
                <Route path="/students/:id" element={<StudentDetailPage />} />
                <Route path="/settings" element={<GroupSettingsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </GroupProvider>
      </AuthProvider>
      </MotionConfig>
    </QueryClientProvider>
  )
}
