import type { ReactNode } from 'react'

/* fx 검색·필터 툴바: 검색 필드 + 필터 칩 + 필터 수·초기화 */
export function Toolbar({
  search,
  onSearchChange,
  searchPlaceholder = '검색',
  children,
  activeFilterCount = 0,
  onReset,
}: {
  search: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  children?: ReactNode
  activeFilterCount?: number
  onReset?: () => void
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative">
        <svg
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-tertiary"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4-4" strokeLinecap="round" />
        </svg>
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-8 w-56 rounded-full border border-line bg-surface pr-3 pl-8 text-label text-fg placeholder:text-fg-tertiary transition-colors hover:border-line-strong focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
        />
      </div>
      <div className="mx-1 h-4 w-px bg-line" />
      {children}
      {activeFilterCount > 0 && onReset && (
        <button
          onClick={onReset}
          className="ml-1 inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-label text-fg-tertiary transition-colors hover:bg-sunken hover:text-fg"
        >
          필터 {activeFilterCount}개 초기화
        </button>
      )}
    </div>
  )
}
