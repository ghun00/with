import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { useGroup } from '@/features/group/GroupProvider'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'

const NAV_ITEMS = [
  {
    to: '/students',
    label: '학생',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" strokeLinecap="round" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: '설정',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
]

export function AppLayout() {
  const { session, profile, loading, signOut } = useAuth()
  const { memberships, current, loading: groupLoading, setCurrentGroupId } = useGroup()
  const location = useLocation()

  if (loading || groupLoading) return <Spinner className="h-screen" />
  if (!session) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />
  }
  if (!current) return <Navigate to="/onboarding" replace />

  return (
    <div className="flex h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-fg text-label font-bold text-surface">
            W
          </div>
          {memberships.length > 1 ? (
            <select
              value={current.group.id}
              onChange={(e) => setCurrentGroupId(e.target.value)}
              className="min-w-0 flex-1 truncate rounded-field border-0 bg-transparent text-body font-semibold focus:ring-0"
            >
              {memberships.map((m) => (
                <option key={m.group.id} value={m.group.id}>
                  {m.group.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="truncate text-body font-semibold">{current.group.name}</span>
          )}
        </div>

        <nav className="flex-1 space-y-0.5 px-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-field px-3 py-2 text-body font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent-500 ${
                  isActive ? 'bg-sunken font-semibold text-fg' : 'text-fg-secondary hover:bg-sunken/60 hover:text-fg'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line p-4">
          <div className="flex items-center gap-2.5">
            <Avatar name={profile?.name ?? ''} url={profile?.avatar_url} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-medium">{profile?.name || '이름 없음'}</p>
              <p className="text-caption text-fg-tertiary">
                {current.role === 'owner' ? '대표 관리자' : '컨설턴트'}
              </p>
            </div>
            <button
              onClick={() => void signOut()}
              className="rounded-field p-1.5 text-fg-tertiary transition-colors hover:bg-sunken hover:text-fg"
              title="로그아웃"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
