import type { ReactNode } from 'react'

/* fx 핵심 리스트 패턴: 좌측 액세서리 / 타이틀·서브텍스트 / 우측 액세서리 슬롯 */
export function ListItem({
  leading,
  title,
  subtitle,
  trailing,
  onClick,
}: {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
}) {
  const content = (
    <>
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-body font-medium text-fg">{title}</div>
        {subtitle && <div className="truncate text-caption text-fg-tertiary">{subtitle}</div>}
      </div>
      {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}
    </>
  )

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-sunken/60 focus-visible:outline-2 focus-visible:outline-accent-500"
      >
        {content}
      </button>
    )
  }
  return <div className="flex items-center gap-3 px-5 py-3">{content}</div>
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 pt-5 pb-2">
      <h2 className="text-label font-semibold text-fg-secondary">{title}</h2>
      {action}
    </div>
  )
}
