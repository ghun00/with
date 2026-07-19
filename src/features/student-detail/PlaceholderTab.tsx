import { EmptyState } from '@/components/ui/EmptyState'

export function PlaceholderTab({ label, phase }: { label: string; phase: string }) {
  return (
    <EmptyState
      title={`${label} 기능은 ${phase} 개발에서 제공됩니다.`}
      description="현재는 학생 관리 핵심 기능(요약·타임라인·메모·To Do)을 사용할 수 있습니다."
    />
  )
}
