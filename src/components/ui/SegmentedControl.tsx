/* fx 세그먼티드 컨트롤: 옅은 트랙 위 흰 서피스 선택 세그먼트 */
export function SegmentedControl<K extends string>({
  items,
  value,
  onChange,
}: {
  items: readonly { key: K; label: string }[]
  value: K
  onChange: (key: K) => void
}) {
  return (
    <div role="radiogroup" className="inline-flex h-8 items-center gap-0.5 rounded-field bg-sunken p-0.5">
      {items.map((item) => (
        <button
          key={item.key}
          role="radio"
          aria-checked={value === item.key}
          onClick={() => onChange(item.key)}
          className={`h-7 rounded-[8px] px-3 text-label transition-colors focus-visible:outline-2 focus-visible:outline-accent-500 ${
            value === item.key
              ? 'bg-surface font-semibold text-fg shadow-card'
              : 'text-fg-secondary hover:text-fg'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
