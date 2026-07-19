/* fx 언더라인 탭: 고대비 무채색 — 활성 탭은 진한 텍스트 + 진한 언더라인 */
export interface TabItem<K extends string = string> {
  key: K
  label: string
}

export function Tabs<K extends string>({
  items,
  value,
  onChange,
}: {
  items: readonly TabItem<K>[]
  value: K
  onChange: (key: K) => void
}) {
  return (
    <div role="tablist" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {items.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-body font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent-500 ${
            value === t.key
              ? 'border-fg text-fg'
              : 'border-transparent text-fg-tertiary hover:text-fg-secondary'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
