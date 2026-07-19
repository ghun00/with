import type { AiService } from './index'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// 실제 LLM 연동 전까지 화면·저장 흐름 검증용 목업 응답
export const mockAiService: AiService = {
  async generateCounselReport(rawText: string) {
    await delay(1200)
    return {
      counsel_date: new Date().toISOString().slice(0, 10),
      purpose: '확인 필요',
      discussion: rawText.slice(0, 200) || '확인 필요',
      student_status: '확인 필요',
      decisions: ['확인 필요'],
      student_todos: ['(목업) 자기소개서 초안 작성'],
      consultant_todos: ['(목업) 학교 활동 자료 검토'],
      next_plan: '확인 필요',
      summary: '(목업) 상담 요약이 여기에 생성됩니다. AI 연동 후 실제 내용으로 대체됩니다.',
    }
  },

  async analyzeKakaoChat(rawText: string) {
    await delay(1200)
    return {
      daily_highlights: [
        { date: new Date().toISOString().slice(0, 10), summary: rawText.slice(0, 100) || '확인 필요' },
      ],
      requests: ['(목업) 추출된 요청 사항'],
      decisions: ['확인 필요'],
      student_todos: ['(목업) 수행평가 준비'],
      consultant_todos: ['(목업) 학부모 상담 일정 조율'],
      issues: ['확인 필요'],
      risk_signals: [],
    }
  },

  async generateWeeklySummary() {
    await delay(1200)
    return '(목업) 주간 요약이 여기에 생성됩니다.'
  },

  async generateMonthlyReport(context: string) {
    await delay(1200)
    return {
      activity_summary: context.slice(0, 200) || '확인 필요',
      achievements: '(목업) 주요 성과가 여기에 생성됩니다.',
      communication: '(목업) 상담 및 소통 내용이 여기에 생성됩니다.',
      todo_progress: '확인 필요',
      improvements: '확인 필요',
      next_month_plan: '(목업) 다음 달 계획이 여기에 생성됩니다.',
      consultant_opinion: '(목업) 컨설턴트 의견이 여기에 생성됩니다. AI 연동 후 실제 내용으로 대체됩니다.',
    }
  },
}
