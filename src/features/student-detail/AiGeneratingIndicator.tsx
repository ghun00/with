import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Spinner } from '@/components/ui/Spinner'
import type { AiJobStage } from '@/services/ai'

// 잡 stage → 사용자 문구. 3개 task 공용이라 중립적으로 표현한다.
const STAGE_LABEL: Record<AiJobStage, string> = {
  context: '학생 맥락을 준비하고 있습니다…',
  generating: 'AI가 초안을 작성하고 있습니다…',
  verifying: '생성 결과를 검증하고 있습니다…',
  done: '마무리하고 있습니다…',
}

// AI 생성 중 연출: 단계 메시지 + 시머 스켈레톤.
// stage가 오면 실제 서버 단계를 보여준다 (미지정 시 messages 순환으로 폴백).
// 경과 시간은 일부러 표시하지 않는다 — 지연을 수치로 각인시키지 않기 위함.
// 동작 줄이기 설정 시 정적 Spinner + 고정 문구로 대체한다.
export function AiGeneratingIndicator({
  messages = [],
  stage = null,
}: {
  messages?: string[]
  stage?: AiJobStage | null
}) {
  const reduced = useReducedMotion()
  const [index, setIndex] = useState(0)

  const cycling = !stage && messages.length > 0
  useEffect(() => {
    if (reduced || !cycling || messages.length <= 1) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % messages.length), 700)
    return () => clearInterval(timer)
  }, [reduced, cycling, messages.length])

  const label = stage ? STAGE_LABEL[stage] : (messages[index] ?? 'AI가 생성하고 있습니다…')

  if (reduced) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-10 shadow-card">
        <Spinner />
        <p className="text-body text-fg-secondary">{label}</p>
      </div>
    )
  }

  return (
    <div className="rounded-card border border-line bg-surface px-6 py-8 shadow-card">
      <div className="mb-6 flex items-center justify-center gap-2.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-2 w-2 rounded-full bg-accent-500"
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.85, 1.1, 0.85] }}
            transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.18, ease: 'easeInOut' }}
          />
        ))}
      </div>
      <div className="mb-6 flex h-6 items-center justify-center overflow-hidden text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={label}
            className="text-body font-medium text-fg-secondary"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            {label}
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="mx-auto max-w-md space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            className="h-3.5 rounded-full bg-sunken"
            style={{ width: `${100 - i * 14}%` }}
            animate={{ opacity: [0.45, 1, 0.45] }}
            transition={{ repeat: Infinity, duration: 1.4, delay: i * 0.15, ease: 'easeInOut' }}
          />
        ))}
      </div>
    </div>
  )
}
