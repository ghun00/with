import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

export interface DropdownOption<T extends string = string> {
  value: T
  label: string
  disabled?: boolean
}

export interface DropdownProps<T extends string = string> {
  options: DropdownOption<T>[]
  value: T | null
  onChange: (value: T) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  className?: string
  triggerClassName?: string
  listClassName?: string
}

const triggerBase =
  'flex h-10 w-full items-center justify-between gap-2 rounded-field border border-line bg-surface px-3 text-left text-body transition-colors hover:border-line-strong focus-visible:border-accent-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-100 disabled:cursor-not-allowed disabled:bg-sunken disabled:text-fg-disabled'

function optionId(listboxId: string, index: number) {
  return `${listboxId}-option-${index}`
}

function firstEnabledIndex<T extends string>(options: DropdownOption<T>[]) {
  return options.findIndex((o) => !o.disabled)
}

function lastEnabledIndex<T extends string>(options: DropdownOption<T>[]) {
  for (let i = options.length - 1; i >= 0; i--) {
    if (!options[i].disabled) return i
  }
  return -1
}

function nextEnabledIndex<T extends string>(options: DropdownOption<T>[], from: number, dir: 1 | -1) {
  const count = options.length
  if (count === 0) return -1
  let i = from
  for (let step = 0; step < count; step++) {
    i = (i + dir + count) % count
    if (!options[i].disabled) return i
  }
  return from
}

// 셀렉트 전용 커스텀 드롭다운. 네이티브 폼 제출/required 검증에는 참여하지 않는 제어 컴포넌트.
export function Dropdown<T extends string = string>({
  options,
  value,
  onChange,
  placeholder = '선택',
  disabled,
  id,
  className = '',
  triggerClassName = '',
  listClassName = '',
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom')
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const reactId = useId()
  const listboxId = `${id ?? reactId}-listbox`

  const selectedIndex = options.findIndex((o) => o.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const spaceBelow = window.innerHeight - rect.bottom
    setPlacement(spaceBelow < 240 ? 'top' : 'bottom')
  }, [open])

  useEffect(() => {
    if (!open) return
    setHighlightIndex(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(options))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open || highlightIndex < 0) return
    const el = listRef.current?.children[highlightIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [open, highlightIndex])

  function commit(index: number) {
    const opt = options[index]
    if (!opt || opt.disabled) return
    onChange(opt.value)
    setOpen(false)
  }

  function onTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (open) setHighlightIndex((i) => nextEnabledIndex(options, i, 1))
        else setOpen(true)
        break
      case 'ArrowUp':
        e.preventDefault()
        if (open) setHighlightIndex((i) => nextEnabledIndex(options, i, -1))
        else setOpen(true)
        break
      case 'Home':
        if (open) {
          e.preventDefault()
          setHighlightIndex(firstEnabledIndex(options))
        }
        break
      case 'End':
        if (open) {
          e.preventDefault()
          setHighlightIndex(lastEnabledIndex(options))
        }
        break
      case 'Enter':
        if (open) {
          e.preventDefault()
          commit(highlightIndex)
        }
        break
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && highlightIndex >= 0 ? optionId(listboxId, highlightIndex) : undefined}
        className={`${triggerBase} ${triggerClassName}`}
      >
        <span className={`truncate ${selected ? 'text-fg' : 'text-fg-tertiary'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <motion.svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: reduced ? 0 : 0.15, ease: 'easeOut' }}
          className={`shrink-0 ${disabled ? 'text-fg-disabled' : 'text-fg-tertiary'}`}
        >
          <path d="m6 9 6 6 6-6" />
        </motion.svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={listRef}
            id={listboxId}
            role="listbox"
            className={`absolute right-0 left-0 z-30 max-h-64 overflow-y-auto rounded-card border border-line bg-surface py-1 shadow-float ${
              placement === 'bottom' ? 'top-[calc(100%+6px)]' : 'bottom-[calc(100%+6px)]'
            } ${listClassName}`}
            initial={{ opacity: 0, scale: reduced ? 1 : 0.98, y: reduced ? 0 : placement === 'bottom' ? -4 : 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: reduced ? 1 : 0.98, y: reduced ? 0 : placement === 'bottom' ? -4 : 4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            {options.map((opt, i) => (
              <button
                key={opt.value}
                type="button"
                id={optionId(listboxId, i)}
                role="option"
                aria-selected={opt.value === value}
                disabled={opt.disabled}
                onMouseEnter={() => setHighlightIndex(i)}
                onClick={() => commit(i)}
                className={`block w-full px-3 py-2 text-left text-label transition-colors disabled:cursor-not-allowed disabled:text-fg-disabled ${
                  i === highlightIndex ? 'bg-sunken' : ''
                } ${opt.value === value ? 'font-semibold text-fg' : 'text-fg-secondary'}`}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
