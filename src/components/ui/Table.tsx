import type { ReactNode } from 'react'

/* fx 테이블: 48px 행, 옅은 헤더, hover 시 subtle 배경 */
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card">
      <table className="w-full text-body">{children}</table>
    </div>
  )
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-line text-left">{children}</tr>
    </thead>
  )
}

export function Th({ children, align = 'left' }: { children?: ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-4 py-3 text-caption font-medium text-fg-tertiary ${align === 'right' ? 'text-right' : ''}`}>
      {children}
    </th>
  )
}

export function Tr({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={`h-12 border-b border-line/60 last:border-0 ${onClick ? 'cursor-pointer transition-colors hover:bg-sunken/60' : ''}`}
    >
      {children}
    </tr>
  )
}

export function Td({
  children,
  align = 'left',
  muted,
}: {
  children?: ReactNode
  align?: 'left' | 'right'
  muted?: boolean
}) {
  return (
    <td className={`px-4 py-2.5 ${align === 'right' ? 'text-right' : ''} ${muted ? 'text-fg-secondary' : ''}`}>
      {children}
    </td>
  )
}
