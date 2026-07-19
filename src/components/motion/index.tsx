import { motion, useReducedMotion, type Variants } from 'framer-motion'
import type { ReactNode } from 'react'

// 공용 모션 프리미티브 — 모두 useReducedMotion을 반영한다.
// (App의 MotionConfig reducedMotion="user"와 함께 동작 줄이기 설정을 이중으로 존중)

export function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduced ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}

// AI 결과 리빌 등 섹션 순차 등장용. StaggerItem을 자식으로 사용한다.
export function StaggerList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={staggerContainer} initial="hidden" animate="show">
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion()
  const item: Variants = {
    hidden: { opacity: 0, y: reduced ? 0 : 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
  }
  return (
    <motion.div className={className} variants={item}>
      {children}
    </motion.div>
  )
}
