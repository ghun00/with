import type { ReactNode } from 'react'

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-line bg-surface py-16 text-center">
      <p className="text-body font-medium text-fg">{title}</p>
      {description && <p className="text-body text-fg-tertiary">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
