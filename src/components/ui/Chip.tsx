import type { ReactNode } from 'react'

/* fx 필터 칩: 무채색 기본, 선택 시에만 액센트 */
export function Chip({
  selected,
  onClick,
  children,
}: {
  selected?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`inline-flex h-8 items-center gap-1 rounded-full border px-3 text-label transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 ${
        selected
          ? 'border-accent-200 bg-accent-50 text-accent-600'
          : 'border-line bg-surface text-fg-secondary hover:border-line-strong hover:text-fg'
      }`}
    >
      {children}
      {selected && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
        </svg>
      )}
    </button>
  )
}
