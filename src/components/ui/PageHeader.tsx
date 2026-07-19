import type { ReactNode } from 'react'

/* fx 규칙: 페이지 헤더의 CTA는 하나만. 보조 액션은 secondary로 곁에 둔다 */
export function PageHeader({
  title,
  description,
  cta,
  secondary,
}: {
  title: string
  description?: string
  cta?: ReactNode
  secondary?: ReactNode
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-title">{title}</h1>
        {description && <p className="mt-1 text-body text-fg-secondary">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {secondary}
        {cta}
      </div>
    </div>
  )
}
