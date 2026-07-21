// AI 생성 잡 추적 훅 — 마운트 복구 + 폴링 + 완료/실패 표면화를 캡슐화한다.
// 탭은 이 훅으로 진행/완료/실패 상태만 소비하고, 완료 처리(onSucceeded)만 주입한다.
import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getAiService, type AiJob, type AiTask, type StartJobInput } from '@/services/ai'

// 서버가 wall-clock에 죽어 상태를 못 남긴 잡을 실패로 간주하는 임계 (서버 reap과 동일 개념)
const STALE_MS = 160_000
const POLL_MS = 2500

function isActive(job: AiJob | null | undefined): boolean {
  return !!job && (job.status === 'queued' || job.status === 'running')
}

function isStale(job: AiJob): boolean {
  return Date.now() - new Date(job.updated_at).getTime() > STALE_MS
}

export interface UseAiJob {
  isRunning: boolean
  stage: AiJob['stage']
  /** 미소비 실패 잡 (재시도 UI용) */
  failedJob: AiJob | null
  start: (input: StartJobInput) => void
  isStarting: boolean
  startError: Error | null
  dismiss: (jobId: string) => void
}

export function useAiJob(params: {
  studentId: string
  task: AiTask
  onSucceeded: (job: AiJob) => void | Promise<void>
}): UseAiJob {
  const queryClient = useQueryClient()
  const queryKey = ['aiJob', params.studentId, params.task] as const
  const consumedRef = useRef<Set<string>>(new Set())
  const onSucceededRef = useRef(params.onSucceeded)
  onSucceededRef.current = params.onSucceeded

  const { data: job } = useQuery({
    queryKey,
    queryFn: () => getAiService().fetchActiveJob(params.studentId, params.task),
    refetchInterval: (query) => (isActive(query.state.data) ? POLL_MS : false),
  })

  // 완료 감지 → onSucceeded 1회 실행 후 consumed 처리 (복귀 시 재오픈 방지)
  useEffect(() => {
    if (!job || job.status !== 'succeeded' || job.consumed_at) return
    if (consumedRef.current.has(job.id)) return
    consumedRef.current.add(job.id)
    void (async () => {
      try {
        await onSucceededRef.current(job)
      } finally {
        await getAiService().markJobConsumed(job.id)
        void queryClient.invalidateQueries({ queryKey })
      }
    })()
  }, [job, queryClient, queryKey])

  const startMutation = useMutation({
    mutationFn: (input: StartJobInput) => getAiService().startJob(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const consumeMutation = useMutation({
    mutationFn: (jobId: string) => getAiService().markJobConsumed(jobId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const running = isActive(job) && !(job ? isStale(job) : false)

  // running인데 stale이면 실패로 취급해 표면화
  const staleFailed =
    job && isActive(job) && isStale(job)
      ? {
          ...job,
          status: 'failed' as const,
          error_message:
            job.error_message ?? '생성이 시간 내에 끝나지 않았습니다. 다시 시도해 주세요.',
        }
      : null
  const failedJob =
    staleFailed ?? (job && job.status === 'failed' && !job.consumed_at ? job : null)

  return {
    isRunning: running,
    stage: running ? (job?.stage ?? null) : null,
    failedJob,
    start: (input) => startMutation.mutate(input),
    isStarting: startMutation.isPending,
    startError: startMutation.error as Error | null,
    dismiss: (jobId) => consumeMutation.mutate(jobId),
  }
}
