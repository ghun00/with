// 목업 AI 서비스 — 함수 미배포 환경의 UI 개발용 (VITE_USE_MOCK_AI=true).
// 실제 ai_jobs 테이블 대신 인메모리 잡 스토어로 동일 인터페이스를 충족한다.
// startJob은 잡을 running으로 만들고, 잠시 뒤 목업 결과로 succeeded 처리한다.
import type {
  AiJob,
  AiService,
  AiTask,
  CounselReportResult,
  KakaoAnalysisResult,
  MonthlyReportResult,
  StartJobInput,
} from './index'

const MOCK_WARNINGS = ['(목업) 검증 경고 예시입니다. 실제 연동 시 검증 패스 결과로 대체됩니다.']
const MOCK_DELAY = 1500

// 인메모리 잡 스토어 (세션 동안 유지)
const jobs = new Map<string, AiJob>()

function buildResult(input: StartJobInput): unknown {
  switch (input.task) {
    case 'counsel_report': {
      const result: CounselReportResult = {
        counsel_date: new Date().toISOString().slice(0, 10),
        purpose: '확인 필요',
        discussion: input.rawText.slice(0, 200) || '확인 필요',
        student_status: '확인 필요',
        decisions: '- 확인 필요',
        student_todos: ['(목업) 자기소개서 초안 작성'],
        consultant_todos: ['(목업) 학교 활동 자료 검토'],
        next_plan: '확인 필요',
        summary: '(목업) 상담 요약이 여기에 생성됩니다. AI 연동 후 실제 내용으로 대체됩니다.',
        warnings: MOCK_WARNINGS,
      }
      return result
    }
    case 'kakao_analysis': {
      const result: KakaoAnalysisResult = {
        daily_highlights: [
          { date: new Date().toISOString().slice(0, 10), summary: input.rawText.slice(0, 100) || '확인 필요' },
        ],
        requests: ['(목업) 추출된 요청 사항'],
        decisions: ['확인 필요'],
        student_todos: ['(목업) 수행평가 준비'],
        consultant_todos: ['(목업) 학부모 상담 일정 조율'],
        issues: ['확인 필요'],
        risk_signals: [],
        warnings: MOCK_WARNINGS,
      }
      return result
    }
    case 'monthly_report': {
      const result: MonthlyReportResult = {
        activity_summary: `(목업) ${input.targetMonth} 활동 요약이 여기에 생성됩니다.`,
        achievements: '(목업) 주요 성과가 여기에 생성됩니다.',
        communication: '(목업) 상담 및 소통 내용이 여기에 생성됩니다.',
        todo_progress: '확인 필요',
        improvements: '확인 필요',
        next_month_plan: '(목업) 다음 달 계획이 여기에 생성됩니다.',
        consultant_opinion: '(목업) 컨설턴트 의견이 여기에 생성됩니다. AI 연동 후 실제 내용으로 대체됩니다.',
        warnings: MOCK_WARNINGS,
        source_context: `대상 월: ${input.targetMonth}${input.note ? `\n\n[참고 사항]\n${input.note}` : ''}`,
      }
      return result
    }
  }
}

function inputPayload(input: StartJobInput): Record<string, unknown> {
  switch (input.task) {
    case 'counsel_report':
      return { student_id: input.studentId, raw_text: input.rawText }
    case 'kakao_analysis':
      return {
        student_id: input.studentId,
        raw_text: input.rawText,
        ...(input.sourceHash ? { source_hash: input.sourceHash } : {}),
        ...(input.analysisId ? { analysis_id: input.analysisId } : {}),
      }
    case 'monthly_report':
      return { student_id: input.studentId, target_month: input.targetMonth, ...(input.note ? { note: input.note } : {}) }
  }
}

export const mockAiService: AiService = {
  async startJob(input) {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const job: AiJob = {
      id,
      student_id: input.studentId,
      task: input.task,
      status: 'running',
      stage: 'generating',
      input: inputPayload(input),
      result: null,
      error_code: null,
      error_message: null,
      consumed_at: null,
      created_at: now,
      updated_at: now,
    }
    jobs.set(id, job)
    setTimeout(() => {
      const current = jobs.get(id)
      if (!current || current.consumed_at) return
      jobs.set(id, {
        ...current,
        status: 'succeeded',
        stage: 'done',
        result: buildResult(input),
        updated_at: new Date().toISOString(),
      })
    }, MOCK_DELAY)
    return id
  },

  async fetchActiveJob(studentId: string, task: AiTask) {
    const matches = [...jobs.values()]
      .filter((j) => j.student_id === studentId && j.task === task && !j.consumed_at)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
    return matches[0] ?? null
  },

  async markJobConsumed(jobId: string) {
    const job = jobs.get(jobId)
    if (job) jobs.set(jobId, { ...job, consumed_at: new Date().toISOString() })
  },
}
