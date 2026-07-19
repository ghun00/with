import { useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

interface Props {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

/* fx 모달 구조: 타이틀 영역 / 콘텐츠 / 푸터(CTA) */
export function Modal({ open, title, onClose, children, footer, wide }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-fg/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`relative flex max-h-[90vh] w-full flex-col rounded-modal bg-surface shadow-float ${wide ? 'max-w-2xl' : 'max-w-md'}`}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-4">
              <h2 className="text-heading">{title}</h2>
              <button
                onClick={onClose}
                className="rounded-field p-1 text-fg-tertiary transition-colors hover:bg-sunken hover:text-fg"
                aria-label="닫기"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-1">{children}</div>
            {footer && <div className="flex justify-end gap-2 px-6 pt-4 pb-5">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
