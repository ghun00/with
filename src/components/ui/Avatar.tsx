/* fx 원칙에 따라 아바타도 무채색 톤 위주, 식별용 미묘한 색 변화만 준다 */
const COLORS = [
  'bg-sunken text-fg-secondary',
  'bg-accent-50 text-accent-600',
  'bg-success-soft text-success',
  'bg-warning-soft text-warning',
  'bg-line text-fg-secondary',
]

function colorFor(name: string) {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return COLORS[hash % COLORS.length]
}

export function Avatar({ name, url, size = 'md' }: { name: string; url?: string | null; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-caption'
  if (url) {
    return <img src={url} alt={name} className={`${cls} rounded-full object-cover`} />
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${cls} ${colorFor(name || '?')}`}
    >
      {(name || '?').slice(0, 1)}
    </span>
  )
}
