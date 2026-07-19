# 4차 AI 연동 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** mock `AiService`를 Supabase Edge Function(`ai-generate`) + Claude API 2-패스 파이프라인(생성 → 검증)으로 교체한다.

**Architecture:** 클라이언트는 `getAiService()`를 통해서만 AI를 호출하고, 실제 구현(`real.ts`)은 단일 Edge Function `ai-generate`를 `supabase.functions.invoke`로 호출한다. Edge Function은 사용자 JWT로 학생 컨텍스트를 조회(RLS 적용)해 프롬프트에 주입하고, 생성 패스(structured outputs)와 별도 검증 패스를 거쳐 `warnings[]`가 포함된 결과를 반환한다. 스펙: `docs/superpowers/specs/2026-07-20-ai-integration-design.md`.

**Tech Stack:** React + TanStack Query(기존), Supabase Edge Functions(Deno), `npm:@anthropic-ai/sdk`, `npm:@supabase/supabase-js@2`, Supabase CLI(신규 도입).

## Global Constraints

- 사용자 표시 문자열과 코드 주석은 **한국어** (CLAUDE.md)
- TypeScript strict + `noUnusedLocals`/`noUnusedParameters` — 안 쓰는 import를 남기면 빌드 실패
- 자동 검증은 `npm run build` 하나뿐 (lint/test 없음). Edge Function은 배포 + curl/앱 수동 검증
- 경로는 `@/*` alias 사용 (feature 경계 넘는 import)
- 모델은 **`claude-sonnet-5` 고정**. `temperature`/`top_p`/`top_k`/`thinking` 파라미터를 보내지 않는다 (Sonnet 5는 비기본 샘플링 파라미터에 400, thinking은 생략 시 adaptive)
- 기존 AI 결과 필드명·타입은 동결. 이번에 추가하는 것은 `warnings?: string[]`(3종 공통)와 `source_context?: string`(월간)뿐
- Edge Function 응답: 성공 = 결과 JSON 그대로, 실패 = `{ "error": { "code", "message" } }` (code: `unauthorized` | `student_not_found` | `invalid_request` | `rate_limited` | `overloaded` | `ai_error`)
- 커밋 메시지 형식은 기존 히스토리를 따른다: `feat(scope): 한국어 요약`

## 사전 준비물 (Task 3부터 필요)

- Supabase 프로젝트 ref (`.env.local`의 `VITE_SUPABASE_URL`에서 `https://<PROJECT_REF>.supabase.co`)
- Anthropic API 키
- 앱 로그인 가능한 계정 + 학생 데이터 1건 이상 (curl 테스트용)

---

### Task 1: AiService 계약 변경 (인터페이스 + mock + 호출부 4곳)

계약을 새 시그니처(객체 입력 + `studentId`)로 바꾸고, mock과 호출부 4곳을 맞춘다. 이 Task가 끝나면 앱은 여전히 mock으로 완전히 동작한다.

**Files:**
- Modify: `src/services/ai/index.ts`
- Modify: `src/services/ai/mock.ts`
- Modify: `src/types/index.ts:286-294` (MONTHLY_REPORT_SECTIONS 키 타입)
- Modify: `src/features/student-detail/CounselReportTab.tsx:68`
- Modify: `src/features/student-detail/KakaoAnalysisTab.tsx:41-46`
- Modify: `src/features/student-detail/KakaoAnalysisDetail.tsx:111-117`
- Modify: `src/features/student-detail/MonthlyReportTab.tsx` (buildMonthlyContext 제거)

**Interfaces (Produces — 이후 모든 Task가 의존):**

```ts
export interface CounselReportInput { studentId: string; rawText: string }
export interface KakaoAnalysisInput { studentId: string; rawText: string }
export interface MonthlyReportInput { studentId: string; targetMonth: string; note?: string }

export interface AiService {
  generateCounselReport(input: CounselReportInput): Promise<CounselReportResult>
  analyzeKakaoChat(input: KakaoAnalysisInput): Promise<KakaoAnalysisResult>
  generateWeeklySummary(context: string): Promise<string>
  generateMonthlyReport(input: MonthlyReportInput): Promise<MonthlyReportResult>
}
```

결과 타입 3종에 `warnings?: string[]` 추가, `MonthlyReportResult`에 `source_context?: string` 추가.

- [ ] **Step 1: `src/services/ai/index.ts` 전체 교체**

```ts
// AI 서비스 인터페이스 — 실제 구현은 Supabase Edge Function(ai-generate) 호출로 동작한다.
// VITE_USE_MOCK_AI=true일 때만 mock을 사용한다 (함수 미배포 환경의 UI 개발용).
import { mockAiService } from './mock'

export interface CounselReportResult {
  counsel_date: string
  purpose: string
  discussion: string
  student_status: string
  decisions: string[]
  student_todos: string[]
  consultant_todos: string[]
  next_plan: string
  summary: string
  warnings?: string[] // 검증 패스 경고 — 문서 하단 '⚠ 검토 필요 사항'으로 노출
}

export interface KakaoAnalysisResult {
  daily_highlights: { date: string; summary: string }[]
  requests: string[]
  decisions: string[]
  student_todos: string[]
  consultant_todos: string[]
  issues: string[]
  risk_signals: string[]
  warnings?: string[]
}

// 월간 보고서 기본 목차 7개 섹션 (prd §6.12)
export interface MonthlyReportResult {
  activity_summary: string      // 이번 달 활동 요약
  achievements: string          // 주요 성과
  communication: string         // 상담 및 소통 내용
  todo_progress: string         // To Do 수행 현황
  improvements: string          // 보완 필요 사항
  next_month_plan: string       // 다음 달 계획
  consultant_opinion: string    // 컨설턴트 의견
  warnings?: string[]
  source_context?: string       // 서버가 조립한 컨텍스트 원문 — source_text 스냅샷 저장용
}

export interface CounselReportInput {
  studentId: string
  rawText: string
}

export interface KakaoAnalysisInput {
  studentId: string
  rawText: string
}

export interface MonthlyReportInput {
  studentId: string
  targetMonth: string
  note?: string
}

export interface AiService {
  generateCounselReport(input: CounselReportInput): Promise<CounselReportResult>
  analyzeKakaoChat(input: KakaoAnalysisInput): Promise<KakaoAnalysisResult>
  generateWeeklySummary(context: string): Promise<string>
  generateMonthlyReport(input: MonthlyReportInput): Promise<MonthlyReportResult>
}

export function getAiService(): AiService {
  return mockAiService
}
```

(주의: `getAiService()`의 real 전환은 Task 7에서. 여기서는 mock 유지.)

- [ ] **Step 2: `src/services/ai/mock.ts` 전체 교체**

```ts
import type { AiService } from './index'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const MOCK_WARNINGS = ['(목업) 검증 경고 예시입니다. 실제 연동 시 검증 패스 결과로 대체됩니다.']

// 실제 LLM 연동 전까지 화면·저장 흐름 검증용 목업 응답
export const mockAiService: AiService = {
  async generateCounselReport({ rawText }) {
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
      warnings: MOCK_WARNINGS,
    }
  },

  async analyzeKakaoChat({ rawText }) {
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
      warnings: MOCK_WARNINGS,
    }
  },

  async generateWeeklySummary() {
    await delay(1200)
    return '(목업) 주간 요약이 여기에 생성됩니다.'
  },

  async generateMonthlyReport({ targetMonth, note }) {
    await delay(1200)
    return {
      activity_summary: `(목업) ${targetMonth} 활동 요약이 여기에 생성됩니다.`,
      achievements: '(목업) 주요 성과가 여기에 생성됩니다.',
      communication: '(목업) 상담 및 소통 내용이 여기에 생성됩니다.',
      todo_progress: '확인 필요',
      improvements: '확인 필요',
      next_month_plan: '(목업) 다음 달 계획이 여기에 생성됩니다.',
      consultant_opinion: '(목업) 컨설턴트 의견이 여기에 생성됩니다. AI 연동 후 실제 내용으로 대체됩니다.',
      warnings: MOCK_WARNINGS,
      source_context: `대상 월: ${targetMonth}${note ? `\n\n[참고 사항]\n${note}` : ''}`,
    }
  },
}
```

- [ ] **Step 3: `src/types/index.ts`의 MONTHLY_REPORT_SECTIONS 키 타입 좁히기**

`MonthlyReportResult`에 옵션 필드가 생기면서 `keyof MonthlyReportResult`가 `string | string[] | undefined` 값을 포함하게 되므로, 섹션 키를 명시적 유니온으로 좁힌다. 기존 코드(286행 근처):

```ts
export const MONTHLY_REPORT_SECTIONS: { key: keyof MonthlyReportResult; label: string }[] = [
```

를 다음으로 교체 (배열 내용 7개는 그대로 유지):

```ts
// 월간 보고서 본문 7개 목차의 키 — warnings/source_context 등 부가 필드는 제외
export type MonthlyReportSectionKey =
  | 'activity_summary'
  | 'achievements'
  | 'communication'
  | 'todo_progress'
  | 'improvements'
  | 'next_month_plan'
  | 'consultant_opinion'

export const MONTHLY_REPORT_SECTIONS: { key: MonthlyReportSectionKey; label: string }[] = [
```

- [ ] **Step 4: 호출부 4곳 수정**

`src/features/student-detail/CounselReportTab.tsx` (68행):

```ts
// 변경 전
mutationFn: () => getAiService().generateCounselReport(sourceText.trim()),
// 변경 후
mutationFn: () =>
  getAiService().generateCounselReport({ studentId: student.id, rawText: sourceText.trim() }),
```

`src/features/student-detail/KakaoAnalysisTab.tsx` (44행):

```ts
// 변경 전
const result = await getAiService().analyzeKakaoChat(text)
// 변경 후
const result = await getAiService().analyzeKakaoChat({ studentId, rawText: text })
```

`src/features/student-detail/KakaoAnalysisDetail.tsx` (113행):

```ts
// 변경 전
const result = await getAiService().analyzeKakaoChat(analysis.source_text)
// 변경 후
const result = await getAiService().analyzeKakaoChat({ studentId, rawText: analysis.source_text })
```

`src/features/student-detail/MonthlyReportTab.tsx`:
1. `buildMonthlyContext` 함수(44-91행)와 그 주석(42-43행)을 통째로 삭제
2. 이제 안 쓰는 import 제거: `counselSectionContent`, `fetchCounselReports`(aiReports), `fetchMemos`(memos), `fetchStudentActivities`(studentActivities), `STUDENT_ACTIVITY_STATUS_LABEL`(types) — `fetchMonthlyReports`, `formatTargetMonth`, `monthlyResultToSections`는 계속 사용
3. generateMutation 교체 (119-138행):

```ts
// AI 생성은 저장하지 않고 결과가 입력된 편집 상태의 Report Modal을 연다 — 검토·수정 후 저장 (editReport.md 4차 §8)
// 컨텍스트 조립은 Edge Function이 수행하고 source_context로 돌려준다 (source_text 스냅샷 유지)
const generateMutation = useMutation({
  mutationFn: () =>
    getAiService().generateMonthlyReport({
      studentId: student.id,
      targetMonth,
      note: note.trim() || undefined,
    }),
  onSuccess: (result) => {
    setEditorDraft({
      kind: 'monthly',
      title: `${formatTargetMonth(targetMonth)} 월간보고서`,
      method: 'ai',
      targetMonth,
      sections: monthlyResultToSections(result),
      sourceText: result.source_context ?? '',
    })
    setCreating(false)
    setNote('')
    setExisting(null)
  },
})
```

- [ ] **Step 5: 빌드로 검증**

Run: `npm run build`
Expected: 에러 없이 성공 (unused import가 남으면 여기서 잡힌다)

- [ ] **Step 6: mock 동작 확인 (선택이지만 권장)**

Run: `npm run dev` 후 학생 상세 → 상담보고서/카카오톡/월간 탭에서 AI 생성 1회씩 — mock 결과가 이전과 동일하게 뜨는지 확인.

- [ ] **Step 7: Commit**

```bash
git add src/services/ai/index.ts src/services/ai/mock.ts src/types/index.ts \
  src/features/student-detail/CounselReportTab.tsx src/features/student-detail/KakaoAnalysisTab.tsx \
  src/features/student-detail/KakaoAnalysisDetail.tsx src/features/student-detail/MonthlyReportTab.tsx
git commit -m "refactor(ai): AiService 계약을 studentId 포함 객체 입력으로 변경

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 검증 경고(warnings) 노출

보고서류는 문서 하단 "⚠ 검토 필요 사항" 섹션으로, 카카오 분석은 상세 화면 경고 카드로 노출한다.

**Files:**
- Modify: `src/services/aiReports.ts:53-67` (counselResultToSections), `:97-99` (monthlyResultToSections)
- Modify: `src/features/student-detail/KakaoAnalysisDetail.tsx` (경고 카드 추가)

**Interfaces:**
- Consumes: Task 1의 `warnings?: string[]`
- Produces: `counselResultToSections`/`monthlyResultToSections`는 warnings가 있으면 마지막에 `{ name: '⚠ 검토 필요 사항', content }` 섹션을 붙인다 (시그니처 불변)

- [ ] **Step 1: `src/services/aiReports.ts`의 매퍼 2곳 수정**

`counselResultToSections` 위에 헬퍼 추가:

```ts
// 검증 패스 경고를 문서 하단 섹션으로 변환 — 사용자가 검토 후 에디터에서 삭제한다
function warningsSection(warnings?: string[]): CounselReportSection[] {
  if (!warnings?.length) return []
  return [{ name: '⚠ 검토 필요 사항', content: warnings.map((w) => `- ${w}`).join('\n') }]
}
```

`counselResultToSections`의 return 배열 마지막에 스프레드 추가:

```ts
export function counselResultToSections(result: CounselReportResult): CounselReportSection[] {
  return [
    { name: '상담 목적', content: result.purpose },
    { name: '주요 논의', content: result.discussion },
    { name: '학생 현황', content: result.student_status },
    { name: '결정 사항', content: result.decisions.map((d) => `- ${d}`).join('\n') },
    { name: '학생 To Do', content: result.student_todos.map((t) => `- [ ] ${t}`).join('\n') },
    {
      name: '컨설턴트 To Do',
      content: result.consultant_todos.map((t) => `- [ ] ${t}`).join('\n'),
    },
    { name: '다음 상담 계획', content: result.next_plan },
    { name: '1Page Documentation', content: result.summary },
    ...warningsSection(result.warnings),
  ]
}
```

`monthlyResultToSections`도 동일하게:

```ts
// AI 월간 보고서 결과(고정 7개 목차)를 편집 문서의 섹션 배열로 변환한다
export function monthlyResultToSections(result: MonthlyReportResult): CounselReportSection[] {
  return [
    ...MONTHLY_REPORT_SECTIONS.map(({ key, label }) => ({ name: label, content: result[key] })),
    ...warningsSection(result.warnings),
  ]
}
```

- [ ] **Step 2: `KakaoAnalysisDetail.tsx`에 경고 카드 추가**

상태 Badge 줄(`<div className="flex items-center gap-2">...`)과 에러 문단 사이, 열람 모드에서만 표시:

```tsx
{!editing && Boolean(analysis.result.warnings?.length) && (
  <div className="rounded-card border border-warning/30 bg-warning-soft p-4">
    <h3 className="mb-1.5 text-label font-semibold text-warning">⚠ 검토 필요 사항</h3>
    <ul className="list-disc space-y-1 pl-5">
      {analysis.result.warnings?.map((w, i) => (
        <li key={i} className="text-body text-warning">
          {w}
        </li>
      ))}
    </ul>
  </div>
)}
```

참고: 수정 폼은 warnings를 다루지 않으므로 **수정 저장 시 warnings가 결과에서 제거된다** — 의도된 동작(검토를 마쳤다는 의미). 재분석 시에는 새 warnings가 다시 채워진다.

- [ ] **Step 3: 빌드 + mock으로 UI 확인**

Run: `npm run build` → 성공.
Run: `npm run dev` → 상담보고서 AI 생성: 에디터 마지막에 "⚠ 검토 필요 사항" 섹션 확인. 카카오 분석 생성: 상세 상단에 경고 카드 확인 (mock이 `MOCK_WARNINGS`를 반환하므로 보임).

- [ ] **Step 4: Commit**

```bash
git add src/services/aiReports.ts src/features/student-detail/KakaoAnalysisDetail.tsx
git commit -m "feat(ai): 검증 경고를 보고서 섹션·카카오 경고 카드로 노출

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Supabase CLI 준비 + Edge Function 스캐폴드

인증·라우팅·에러 포맷·CORS까지 갖춘 함수 골격을 만들어 배포하고 curl로 스모크 테스트한다. task 3종은 "미구현" 응답.

**Files:**
- Create: `supabase/functions/ai-generate/http.ts`
- Create: `supabase/functions/ai-generate/index.ts`
- Create: `supabase/config.toml` (`supabase init`이 생성)

**Interfaces (Produces):**
- `AiError(code, message)` 클래스, `AiErrorCode` 유니온, `corsHeaders`, `jsonResponse(body, status?)`, `errorResponse(aiError)` — 이후 모든 서버 Task가 사용
- 라우터 계약: 각 task 모듈은 `run*(supabase: SupabaseClient, body: Record<string, unknown>): Promise<결과 객체>`를 export

- [ ] **Step 1: Supabase CLI 설치·로그인·링크**

```bash
brew list supabase &>/dev/null || brew install supabase/tap/supabase
supabase login                       # 브라우저 인증 (사용자가 직접)
cd "/Volumes/Dean's SSD/project/with"
supabase init                        # supabase/config.toml 생성 — 기존 migrations는 그대로
supabase link --project-ref <PROJECT_REF>
supabase secrets set ANTHROPIC_API_KEY=<Anthropic API 키>   # Task 4부터 사용
```

Expected: `supabase link` 성공 메시지. `<PROJECT_REF>`는 `.env.local`의 `VITE_SUPABASE_URL` 서브도메인.

- [ ] **Step 2: `supabase/functions/ai-generate/http.ts` 작성**

```ts
// 공통 HTTP 유틸 — 에러 코드 체계와 CORS (스펙 §에러 처리)
export type AiErrorCode =
  | 'unauthorized'
  | 'student_not_found'
  | 'invalid_request'
  | 'rate_limited'
  | 'overloaded'
  | 'ai_error'

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message: string,
  ) {
    super(message)
  }
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ERROR_STATUS: Record<AiErrorCode, number> = {
  unauthorized: 401,
  student_not_found: 404,
  invalid_request: 400,
  rate_limited: 429,
  overloaded: 503,
  ai_error: 500,
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function errorResponse(error: AiError): Response {
  return jsonResponse({ error: { code: error.code, message: error.message } }, ERROR_STATUS[error.code])
}
```

- [ ] **Step 3: `supabase/functions/ai-generate/index.ts` 작성 (스캐폴드)**

```ts
// ai-generate: AI 생성 단일 진입점 — task 라우팅
// 스펙: docs/superpowers/specs/2026-07-20-ai-integration-design.md
import { createClient } from 'npm:@supabase/supabase-js@2'
import { AiError, corsHeaders, errorResponse } from './http.ts'

const KNOWN_TASKS = ['counsel_report', 'kakao_analysis', 'monthly_report']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    if (req.method !== 'POST') throw new AiError('invalid_request', 'POST 요청만 지원합니다.')

    // 사용자 JWT를 그대로 실어 Supabase 클라이언트 생성 — 모든 DB 조회에 RLS가 적용된다
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new AiError('unauthorized', '로그인이 필요합니다.')

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) throw new AiError('invalid_request', '요청 본문이 올바르지 않습니다.')

    if (!KNOWN_TASKS.includes(String(body.task)))
      throw new AiError('invalid_request', `알 수 없는 task입니다: ${String(body.task)}`)

    // Task 4~6에서 각 task 실행으로 교체된다
    throw new AiError('invalid_request', '아직 구현되지 않은 task입니다.')
  } catch (e) {
    if (e instanceof AiError) return errorResponse(e)
    console.error('[ai-generate] unexpected error', e)
    return errorResponse(new AiError('ai_error', 'AI 생성 중 오류가 발생했습니다.'))
  }
})
```

- [ ] **Step 4: 배포**

```bash
supabase functions deploy ai-generate
```

Expected: 배포 성공 로그.

- [ ] **Step 5: curl 스모크 테스트**

```bash
REF=<PROJECT_REF>
ANON=<VITE_SUPABASE_ANON_KEY 값>

# (a) Authorization 없음 → Supabase 게이트웨이가 401 반환
curl -s -X POST "https://$REF.supabase.co/functions/v1/ai-generate" \
  -H "Content-Type: application/json" -d '{"task":"counsel_report"}'
# 예상: {"code":401,"message":"Missing authorization header"} 형태의 게이트웨이 응답

# (b) anon 키 (서명 유효, 사용자 아님) → 자체 unauthorized
curl -s -X POST "https://$REF.supabase.co/functions/v1/ai-generate" \
  -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" -d '{"task":"counsel_report"}'
# 예상: {"error":{"code":"unauthorized","message":"로그인이 필요합니다."}}
```

사용자 JWT 확보 (이후 Task의 curl 테스트에 계속 사용): `npm run dev`로 앱 로그인 후 브라우저 콘솔에서

```js
JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.endsWith('-auth-token')))).access_token
```

```bash
JWT=<위에서 복사한 access_token>
# (c) 유효 사용자 + 알 수 없는 task
curl -s -X POST "https://$REF.supabase.co/functions/v1/ai-generate" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" -d '{"task":"x"}'
# 예상: {"error":{"code":"invalid_request","message":"알 수 없는 task입니다: x"}}
# (d) 유효 사용자 + 미구현 task
curl -s -X POST "https://$REF.supabase.co/functions/v1/ai-generate" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" -d '{"task":"counsel_report"}'
# 예상: {"error":{"code":"invalid_request","message":"아직 구현되지 않은 task입니다."}}
```

- [ ] **Step 6: Commit** (config.toml에 시크릿이 없는지 확인 후)

```bash
git add supabase/config.toml supabase/functions/ai-generate/http.ts supabase/functions/ai-generate/index.ts
git commit -m "feat(ai): ai-generate Edge Function 스캐폴드 (인증·라우팅·에러 포맷)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Claude 헬퍼 + 학생 컨텍스트 + 검증 패스 + 상담보고서 task

2-패스 파이프라인의 공통 부품을 만들고 첫 task(상담보고서)를 끝까지 연결해 배포·검증한다.

**Files:**
- Create: `supabase/functions/ai-generate/claude.ts`
- Create: `supabase/functions/ai-generate/studentContext.ts`
- Create: `supabase/functions/ai-generate/verify.ts`
- Create: `supabase/functions/ai-generate/tasks/counselReport.ts`
- Modify: `supabase/functions/ai-generate/index.ts` (라우팅 연결)

**Interfaces:**
- Consumes: Task 3의 `AiError`, `jsonResponse`
- Produces:
  - `callClaudeJson<T>(params: { system: string; userText: string; schema: Record<string, unknown> }): Promise<T>`
  - `COMMON_RULES: string` (생성 공통 지침)
  - `buildStudentContext(supabase: SupabaseClient, studentId: string): Promise<string>` — `[학생 정보]` 블록 텍스트
  - `withWarnings(schema)` / `verifyResult<T>(params: { taskLabel; studentContext; sourceText; generated: T; schema }): Promise<T & { warnings: string[] }>`
  - `runCounselReport(supabase, body): Promise<CounselReportResult+warnings>`

- [ ] **Step 1: `claude.ts` 작성**

```ts
// Claude API 공통 호출 — 생성·검증 패스 모두 structured outputs로 스키마를 강제한다
import Anthropic from 'npm:@anthropic-ai/sdk'
import { AiError } from './http.ts'

export const MODEL = 'claude-sonnet-5'

// 생성 패스 공통 지침 (스펙 §생성 패스). 검증 패스 지침은 verify.ts에 별도.
export const COMMON_RULES = `- 원문에 근거 없는 내용은 추측하지 말고 "확인 필요"로 기록한다.
- 대화 후반에 번복·수정된 결정은 최종 상태만 기록한다.
- "예정", "검토 중", "미정"인 사안을 확정된 것처럼 서술하지 않는다.
- 날짜·수치는 원문에서 그대로 가져오고, 특정할 수 없으면 "확인 필요"로 둔다.
- 인물은 [학생 정보]의 이름으로 일관되게 지칭한다.
- 모든 출력은 한국어로 작성한다.`

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (!client) {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new AiError('ai_error', 'ANTHROPIC_API_KEY가 설정되지 않았습니다.')
    client = new Anthropic({ apiKey })
  }
  return client
}

export async function callClaudeJson<T>(params: {
  system: string
  userText: string
  schema: Record<string, unknown>
}): Promise<T> {
  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: params.system,
      messages: [{ role: 'user', content: params.userText }],
      output_config: { format: { type: 'json_schema', schema: params.schema } },
    })
    if (response.stop_reason === 'refusal')
      throw new AiError('ai_error', 'AI가 요청 처리를 거부했습니다. 입력 내용을 확인해 주세요.')
    if (response.stop_reason === 'max_tokens')
      throw new AiError('ai_error', '입력이 너무 길어 AI 응답이 잘렸습니다. 원문을 나눠서 시도해 주세요.')
    const block = response.content.find((b) => b.type === 'text')
    if (!block || block.type !== 'text') throw new AiError('ai_error', 'AI 응답이 비어 있습니다.')
    return JSON.parse(block.text) as T
  } catch (e) {
    if (e instanceof AiError) throw e
    if (e instanceof Anthropic.RateLimitError)
      throw new AiError('rate_limited', '요청이 많아 잠시 후 다시 시도해 주세요.')
    if (e instanceof Anthropic.APIError && e.status === 529)
      throw new AiError('overloaded', 'AI 서비스가 혼잡합니다. 잠시 후 다시 시도해 주세요.')
    console.error('[ai-generate] claude error', e)
    throw new AiError('ai_error', 'AI 호출에 실패했습니다.')
  }
}
```

- [ ] **Step 2: `studentContext.ts` 작성**

```ts
// 학생 컨텍스트(용어사전) 조립 — 인물 지칭 정규화의 기준점 (스펙 §[1])
// 사용자 JWT 클라이언트로 조회하므로 RLS가 접근 권한을 그대로 강제한다.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { AiError } from './http.ts'

const STATUS_LABEL: Record<string, string> = { active: '관리 중', paused: '일시 중단', ended: '종료' }
const ROLE_LABEL: Record<string, string> = { primary: '주담당', co: '부담당' }

interface StudentRow {
  name: string
  school: string
  grade: string
  status: string
  student_assignments: { role: string; profiles: { name: string } | null }[]
}

export async function buildStudentContext(
  supabase: SupabaseClient,
  studentId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('students')
    .select('name, school, grade, status, student_assignments(role, profiles(name))')
    .eq('id', studentId)
    .maybeSingle()
  if (error) {
    console.error('[ai-generate] student query failed', error)
    throw new AiError('ai_error', '학생 정보 조회에 실패했습니다.')
  }
  if (!data) throw new AiError('student_not_found', '학생을 찾을 수 없거나 접근 권한이 없습니다.')

  const student = data as unknown as StudentRow
  const consultants = (student.student_assignments ?? [])
    .map((a) => (a.profiles?.name ? `${a.profiles.name}(${ROLE_LABEL[a.role] ?? a.role})` : null))
    .filter(Boolean)
    .join(', ')

  return [
    '[학생 정보]',
    `- 이름: ${student.name}`,
    student.school && `- 학교: ${student.school}`,
    student.grade && `- 학년: ${student.grade}`,
    `- 관리 상태: ${STATUS_LABEL[student.status] ?? student.status}`,
    consultants && `- 담당 컨설턴트: ${consultants}`,
  ]
    .filter(Boolean)
    .join('\n')
}
```

- [ ] **Step 3: `verify.ts` 작성**

```ts
// 검증 패스 — 생성 결과를 원문과 대조하는 별도 호출 (스펙 §[3])
// "요약하고 검증도 해줘"를 한 호출에 합치지 않는다.
import { callClaudeJson } from './claude.ts'

const VERIFY_RULES = `너는 AI가 생성한 결과물을 원문과 대조해 검증하는 검수자다. 새로운 내용을 창작하지 말고 아래 항목만 검사해, 수정된 결과와 경고 목록을 출력한다.
1. 원문에 근거 없는 내용 → "확인 필요"로 바꾸고 경고에 기록
2. 원문에서 "예정/검토 중/미정"인 사안이 확정된 것처럼 서술된 부분 → 미정 표현으로 되돌리고 경고에 기록
3. 원문 후반에 번복·수정된 결정이 이전 상태로 기록된 부분 → 최종 상태로 고치고 경고에 기록
4. 수치·날짜가 원문과 다르거나 서로 충돌하는 부분 → 원문 기준으로 고치고 경고에 기록
5. 학생·컨설턴트 등 인물 지칭이 [학생 정보]와 다르게 표기된 부분 → 통일하고 경고에 기록
문제없는 항목은 그대로 유지한다. 경고는 "무엇을 왜 고쳤는지"를 한 문장씩 한국어로 쓴다. 고칠 것이 없으면 warnings는 빈 배열로 둔다.`

interface ObjectSchema {
  type: string
  additionalProperties: boolean
  required: string[]
  properties: Record<string, unknown>
}

// 생성 스키마에 warnings 필드를 추가한 검증용 스키마를 만든다
export function withWarnings(schema: ObjectSchema): Record<string, unknown> {
  return {
    ...schema,
    required: [...schema.required, 'warnings'],
    properties: {
      ...schema.properties,
      warnings: {
        type: 'array',
        items: { type: 'string' },
        description: '검증에서 수정하거나 확인이 필요하다고 판단한 사항 목록. 없으면 빈 배열.',
      },
    },
  }
}

export async function verifyResult<T>(params: {
  taskLabel: string
  studentContext: string
  sourceText: string
  generated: T
  schema: ObjectSchema
}): Promise<T & { warnings: string[] }> {
  return callClaudeJson<T & { warnings: string[] }>({
    system: `${VERIFY_RULES}\n\n${params.studentContext}`,
    userText: `[원문]\n${params.sourceText}\n\n[검증 대상: ${params.taskLabel} 생성 결과 JSON]\n${JSON.stringify(params.generated, null, 2)}`,
    schema: withWarnings(params.schema),
  })
}
```

- [ ] **Step 4: `tasks/counselReport.ts` 작성**

```ts
// 상담보고서 생성 task — 학생 컨텍스트 주입 → 생성 패스 → 검증 패스
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { AiError } from '../http.ts'
import { COMMON_RULES, callClaudeJson } from '../claude.ts'
import { buildStudentContext } from '../studentContext.ts'
import { verifyResult } from '../verify.ts'

// 프론트 CounselReportResult(src/services/ai/index.ts)와 1:1 — 필드 변경 금지
interface CounselReportResult {
  counsel_date: string
  purpose: string
  discussion: string
  student_status: string
  decisions: string[]
  student_todos: string[]
  consultant_todos: string[]
  next_plan: string
  summary: string
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'counsel_date',
    'purpose',
    'discussion',
    'student_status',
    'decisions',
    'student_todos',
    'consultant_todos',
    'next_plan',
    'summary',
  ],
  properties: {
    counsel_date: {
      type: 'string',
      description: '상담이 진행된 날짜 (YYYY-MM-DD). 원문에서 특정할 수 없으면 빈 문자열.',
    },
    purpose: { type: 'string', description: '이번 상담의 목적' },
    discussion: { type: 'string', description: '주요 논의 내용 (서술형, 시간 순)' },
    student_status: { type: 'string', description: '학생의 현재 학업·활동·심리 상태' },
    decisions: { type: 'array', items: { type: 'string' }, description: '상담에서 확정된 최종 결정 사항' },
    student_todos: { type: 'array', items: { type: 'string' }, description: '학생이 해야 할 일' },
    consultant_todos: { type: 'array', items: { type: 'string' }, description: '컨설턴트가 해야 할 일' },
    next_plan: { type: 'string', description: '다음 상담 계획' },
    summary: {
      type: 'string',
      description: '상담 전체를 한 페이지 분량으로 정리한 서술형 요약 (1Page Documentation)',
    },
  },
}

const SYSTEM = `너는 학생부종합전형(학종) 컨설팅 회사의 보고서 보조 작성자다. 컨설턴트와 학생(또는 학부모) 간 상담 원문을 읽고, 학부모가 열람해도 좋은 격식 있는 상담보고서 초안을 작성한다.

${COMMON_RULES}`

export async function runCounselReport(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<CounselReportResult & { warnings: string[] }> {
  const studentId = typeof body.student_id === 'string' ? body.student_id : ''
  const rawText = typeof body.raw_text === 'string' ? body.raw_text.trim() : ''
  if (!studentId || !rawText)
    throw new AiError('invalid_request', 'student_id와 raw_text가 필요합니다.')

  const studentContext = await buildStudentContext(supabase, studentId)

  const generated = await callClaudeJson<CounselReportResult>({
    system: `${SYSTEM}\n\n${studentContext}`,
    userText: `[상담 원문]\n${rawText}`,
    schema: SCHEMA,
  })

  return verifyResult({
    taskLabel: '상담보고서',
    studentContext,
    sourceText: rawText,
    generated,
    schema: SCHEMA,
  })
}
```

- [ ] **Step 5: `index.ts` 라우팅 연결**

import 추가:

```ts
import { jsonResponse } from './http.ts'   // 기존 import 라인에 병합
import { runCounselReport } from './tasks/counselReport.ts'
```

`KNOWN_TASKS` 검사 + "아직 구현되지 않은 task" throw 부분을 switch로 교체 (`KNOWN_TASKS` 상수는 삭제):

```ts
switch (body.task) {
  case 'counsel_report':
    return jsonResponse(await runCounselReport(supabase, body))
  case 'kakao_analysis':
  case 'monthly_report':
    throw new AiError('invalid_request', '아직 구현되지 않은 task입니다.')
  default:
    throw new AiError('invalid_request', `알 수 없는 task입니다: ${String(body.task)}`)
}
```

- [ ] **Step 6: 배포 + curl 검증 (검증 패스가 실제로 작동하는지 포함)**

```bash
supabase functions deploy ai-generate
```

학생 ID 확보: 앱의 학생 상세 URL(`/students/<uuid>`)에서 복사.

```bash
curl -s -X POST "https://$REF.supabase.co/functions/v1/ai-generate" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"task":"counsel_report","student_id":"<학생 UUID>","raw_text":"3월 12일 상담. 동아리는 처음에 화학 동아리로 하기로 했으나 상담 말미에 생명과학 동아리로 바꾸는 것으로 최종 결정했다. 자소서 초안은 4월 중 작성 예정이며 아직 확정된 일정은 없다. 다음 상담은 3월 26일."}'
```

Expected:
- 9개 필드 + `warnings` 배열이 있는 JSON
- `decisions`에 화학이 아닌 **생명과학 동아리**가 최종 상태로 기록
- 자소서 일정이 확정 톤이 아닌 "예정/미정"으로 유지
- 잘못된 student_id로 재요청 시 `{"error":{"code":"student_not_found",...}}`

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/ai-generate
git commit -m "feat(ai): 2-패스 파이프라인 공통 모듈 + 상담보고서 task

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 카카오톡 분석 task

**Files:**
- Create: `supabase/functions/ai-generate/tasks/kakaoAnalysis.ts`
- Modify: `supabase/functions/ai-generate/index.ts` (case 연결)

**Interfaces:**
- Consumes: Task 4의 `callClaudeJson`, `COMMON_RULES`, `buildStudentContext`, `verifyResult`
- Produces: `runKakaoAnalysis(supabase, body): Promise<KakaoAnalysisResult+warnings>`

- [ ] **Step 1: `tasks/kakaoAnalysis.ts` 작성**

```ts
// 카카오톡 분석 task — 학생 컨텍스트 주입 → 생성 패스 → 검증 패스
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { AiError } from '../http.ts'
import { COMMON_RULES, callClaudeJson } from '../claude.ts'
import { buildStudentContext } from '../studentContext.ts'
import { verifyResult } from '../verify.ts'

// 프론트 KakaoAnalysisResult(src/services/ai/index.ts)와 1:1 — 필드 변경 금지
interface KakaoAnalysisResult {
  daily_highlights: { date: string; summary: string }[]
  requests: string[]
  decisions: string[]
  student_todos: string[]
  consultant_todos: string[]
  issues: string[]
  risk_signals: string[]
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'daily_highlights',
    'requests',
    'decisions',
    'student_todos',
    'consultant_todos',
    'issues',
    'risk_signals',
  ],
  properties: {
    daily_highlights: {
      type: 'array',
      description: '날짜별 주요 대화 요약. 대화가 있었던 날짜마다 1개 항목.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'summary'],
        properties: {
          date: { type: 'string', description: '대화 날짜 (YYYY-MM-DD). 특정 불가하면 빈 문자열.' },
          summary: { type: 'string', description: '그날 대화의 핵심 요약 (1~2문장)' },
        },
      },
    },
    requests: { type: 'array', items: { type: 'string' }, description: '학생·학부모의 요청 사항' },
    decisions: { type: 'array', items: { type: 'string' }, description: '대화에서 확정된 최종 결정 사항' },
    student_todos: { type: 'array', items: { type: 'string' }, description: '학생이 해야 할 일' },
    consultant_todos: { type: 'array', items: { type: 'string' }, description: '컨설턴트가 해야 할 일' },
    issues: { type: 'array', items: { type: 'string' }, description: '주의가 필요한 중요 이슈' },
    risk_signals: {
      type: 'array',
      items: { type: 'string' },
      description: '학생의 감정 변화·위험 신호 (스트레스, 갈등, 무기력 등). 근거가 있는 것만.',
    },
  },
}

const SYSTEM = `너는 학생부종합전형(학종) 컨설팅 회사의 상담 기록 분석가다. 카카오톡 대화 내보내기 원문을 읽고 컨설턴트가 챙겨야 할 정보를 추출한다. 대화명은 [학생 정보]의 인물과 대조해 학생/학부모/컨설턴트를 구분한다.

${COMMON_RULES}`

export async function runKakaoAnalysis(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<KakaoAnalysisResult & { warnings: string[] }> {
  const studentId = typeof body.student_id === 'string' ? body.student_id : ''
  const rawText = typeof body.raw_text === 'string' ? body.raw_text.trim() : ''
  if (!studentId || !rawText)
    throw new AiError('invalid_request', 'student_id와 raw_text가 필요합니다.')

  const studentContext = await buildStudentContext(supabase, studentId)

  const generated = await callClaudeJson<KakaoAnalysisResult>({
    system: `${SYSTEM}\n\n${studentContext}`,
    userText: `[카카오톡 대화 원문]\n${rawText}`,
    schema: SCHEMA,
  })

  return verifyResult({
    taskLabel: '카카오톡 분석',
    studentContext,
    sourceText: rawText,
    generated,
    schema: SCHEMA,
  })
}
```

- [ ] **Step 2: `index.ts`에 case 연결**

```ts
import { runKakaoAnalysis } from './tasks/kakaoAnalysis.ts'
```

switch에서 `case 'kakao_analysis':`를 분리:

```ts
case 'kakao_analysis':
  return jsonResponse(await runKakaoAnalysis(supabase, body))
case 'monthly_report':
  throw new AiError('invalid_request', '아직 구현되지 않은 task입니다.')
```

- [ ] **Step 3: 배포 + curl 검증**

```bash
supabase functions deploy ai-generate
curl -s -X POST "https://$REF.supabase.co/functions/v1/ai-generate" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"task":"kakao_analysis","student_id":"<학생 UUID>","raw_text":"2026년 7월 1일 화요일\n[엄마] 오후 2:10 선생님 다음주 상담 가능할까요?\n[컨설턴트] 오후 2:15 네 화요일 4시 어떠세요?\n[엄마] 오후 2:20 화요일은 학원이 있어서요 수요일로 부탁드려요\n[컨설턴트] 오후 2:21 네 수요일 4시로 확정할게요\n[엄마] 오후 9:40 아이가 요즘 성적 때문에 많이 힘들어해요"}'
```

Expected: `daily_highlights` 1건(7월 1일), `decisions`에 화요일이 아닌 **수요일 4시** 상담, `risk_signals`에 성적 스트레스 관련 항목, `warnings` 배열 존재.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/ai-generate
git commit -m "feat(ai): 카카오톡 분석 task 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 월간 보고서 task (서버 컨텍스트 조립)

**Files:**
- Create: `supabase/functions/ai-generate/tasks/monthlyReport.ts`
- Modify: `supabase/functions/ai-generate/index.ts` (case 연결)

**Interfaces:**
- Consumes: Task 4 공통 모듈
- Produces: `runMonthlyReport(supabase, body): Promise<MonthlyReportResult + warnings + source_context>` — `source_context`는 서버가 조립한 컨텍스트 원문 (클라이언트가 source_text 스냅샷으로 저장)

- [ ] **Step 1: `tasks/monthlyReport.ts` 작성**

컨텍스트 조립 규칙은 기존 클라이언트 `buildMonthlyContext`(Task 1에서 삭제된 코드)와 동일하다: 대상 월(YYYY-MM 접두 일치)의 활동·메모·상담보고서를 텍스트로 합친다.

```ts
// 월간 보고서 task — 서버에서 대상 월 컨텍스트 조립 → 생성 패스 → 검증 패스 (스펙 §월간 보고서 컨텍스트)
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { AiError } from '../http.ts'
import { COMMON_RULES, callClaudeJson } from '../claude.ts'
import { buildStudentContext } from '../studentContext.ts'
import { verifyResult } from '../verify.ts'

// 프론트 MonthlyReportResult(src/services/ai/index.ts) 본문 7개 목차와 1:1 — 필드 변경 금지
interface MonthlyReportResult {
  activity_summary: string
  achievements: string
  communication: string
  todo_progress: string
  improvements: string
  next_month_plan: string
  consultant_opinion: string
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'activity_summary',
    'achievements',
    'communication',
    'todo_progress',
    'improvements',
    'next_month_plan',
    'consultant_opinion',
  ],
  properties: {
    activity_summary: { type: 'string', description: '이번 달 활동 요약' },
    achievements: { type: 'string', description: '주요 성과' },
    communication: { type: 'string', description: '상담 및 소통 내용' },
    todo_progress: { type: 'string', description: 'To Do(활동) 수행 현황' },
    improvements: { type: 'string', description: '보완이 필요한 사항' },
    next_month_plan: { type: 'string', description: '다음 달 계획' },
    consultant_opinion: { type: 'string', description: '컨설턴트 의견 (전문가 관점의 총평)' },
  },
}

const SYSTEM = `너는 학생부종합전형(학종) 컨설팅 회사의 보고서 보조 작성자다. 한 달간의 활동·메모·상담 기록을 바탕으로 학부모에게 전달할 월간 보고서 초안을 작성한다. 기록에 없는 성과를 만들어내지 않는다.

${COMMON_RULES}`

const ACTIVITY_STATUS_LABEL: Record<string, string> = {
  planned: '진행 예정',
  in_progress: '진행 중',
  completed: '활동 완료',
}

interface CounselReportRow {
  title: string
  counsel_date: string | null
  created_at: string
  result: { sections?: { name: string; content: string }[] }
}

// 대상 월의 메모/활동/상담보고서를 텍스트로 합친다 (기존 클라이언트 buildMonthlyContext와 동일 규칙)
async function buildMonthlyContext(
  supabase: SupabaseClient,
  studentId: string,
  targetMonth: string,
  note: string,
): Promise<string> {
  const [memosRes, activitiesRes, reportsRes] = await Promise.all([
    supabase
      .from('memos')
      .select('content, tag, created_at')
      .eq('student_id', studentId)
      .order('created_at'),
    supabase
      .from('student_activities')
      .select('name, status, due_date, completed_at, created_at')
      .eq('student_id', studentId),
    supabase
      .from('counsel_reports')
      .select('title, counsel_date, created_at, result')
      .eq('student_id', studentId),
  ])
  for (const res of [memosRes, activitiesRes, reportsRes]) {
    if (res.error) {
      console.error('[ai-generate] monthly context query failed', res.error)
      throw new AiError('ai_error', '월간 보고서 컨텍스트 조회에 실패했습니다.')
    }
  }

  const inMonth = (value: string | null | undefined) => Boolean(value?.startsWith(targetMonth))
  const lines: string[] = [`대상 월: ${targetMonth}`]

  const monthActivities = (activitiesRes.data ?? []).filter(
    (a) => inMonth(a.created_at) || inMonth(a.completed_at) || inMonth(a.due_date),
  )
  if (monthActivities.length) {
    lines.push('\n[활동]')
    for (const a of monthActivities) {
      lines.push(`- ${a.name} (${ACTIVITY_STATUS_LABEL[a.status] ?? a.status})`)
    }
  }

  const monthMemos = (memosRes.data ?? []).filter((m) => inMonth(m.created_at))
  if (monthMemos.length) {
    lines.push('\n[메모]')
    for (const m of monthMemos) lines.push(`- [${m.tag}] ${m.content}`)
  }

  const monthReports = ((reportsRes.data ?? []) as CounselReportRow[]).filter(
    (r) => inMonth(r.created_at) || inMonth(r.counsel_date),
  )
  if (monthReports.length) {
    lines.push('\n[상담보고서]')
    for (const r of monthReports) {
      const summary =
        r.result.sections?.find((s) => s.name === '1Page Documentation')?.content.trim() ?? ''
      lines.push(`- ${r.title}${summary ? `: ${summary}` : ''}`)
    }
  }

  if (note) {
    lines.push('\n[참고 사항]')
    lines.push(note)
  }

  return lines.join('\n')
}

export async function runMonthlyReport(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<MonthlyReportResult & { warnings: string[]; source_context: string }> {
  const studentId = typeof body.student_id === 'string' ? body.student_id : ''
  const targetMonth = typeof body.target_month === 'string' ? body.target_month : ''
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  if (!studentId || !/^\d{4}-\d{2}$/.test(targetMonth))
    throw new AiError('invalid_request', 'student_id와 target_month(YYYY-MM)가 필요합니다.')

  const studentContext = await buildStudentContext(supabase, studentId)
  const context = await buildMonthlyContext(supabase, studentId, targetMonth, note)

  const generated = await callClaudeJson<MonthlyReportResult>({
    system: `${SYSTEM}\n\n${studentContext}`,
    userText: `[이번 달 기록]\n${context}`,
    schema: SCHEMA,
  })

  const verified = await verifyResult({
    taskLabel: '월간 보고서',
    studentContext,
    sourceText: context,
    generated,
    schema: SCHEMA,
  })

  return { ...verified, source_context: context }
}
```

- [ ] **Step 2: `index.ts`에 case 연결**

```ts
import { runMonthlyReport } from './tasks/monthlyReport.ts'
```

```ts
case 'monthly_report':
  return jsonResponse(await runMonthlyReport(supabase, body))
```

("아직 구현되지 않은 task" throw 라인은 이 시점에 삭제된다.)

- [ ] **Step 3: 배포 + curl 검증**

```bash
supabase functions deploy ai-generate
curl -s -X POST "https://$REF.supabase.co/functions/v1/ai-generate" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"task":"monthly_report","student_id":"<메모·활동이 있는 학생 UUID>","target_month":"2026-07","note":"7월 말 모의고사 대비 강조"}'
```

Expected: 7개 목차 + `warnings` + `source_context`(조회된 활동/메모/상담보고서가 포함된 텍스트). `target_month: "2026-7"`처럼 형식이 틀리면 `invalid_request`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/ai-generate
git commit -m "feat(ai): 월간 보고서 task 추가 (서버 컨텍스트 조립)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: real 서비스 어댑터 + getAiService 전환 + 앱 E2E 검증

**Files:**
- Create: `src/services/ai/real.ts`
- Modify: `src/services/ai/index.ts` (getAiService 전환)
- Modify: `.env.example` (VITE_USE_MOCK_AI 안내)

**Interfaces:**
- Consumes: Task 1 계약, Task 3~6의 Edge Function 요청/응답 계약
- Produces: `realAiService: AiService`

- [ ] **Step 1: `src/services/ai/real.ts` 작성**

```ts
// 실제 AI 서비스 — Supabase Edge Function(ai-generate)을 호출한다.
// 서버 에러 코드({ error: { code, message } })를 한국어 사용자 메시지로 변환해 throw한다.
import { FunctionsHttpError } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'
import type {
  AiService,
  CounselReportResult,
  KakaoAnalysisResult,
  MonthlyReportResult,
} from './index'

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
  student_not_found: '학생을 찾을 수 없거나 접근 권한이 없습니다.',
  invalid_request: '요청이 올바르지 않습니다. 입력 내용을 확인해 주세요.',
  rate_limited: '요청이 많아 잠시 후 다시 시도해 주세요.',
  overloaded: 'AI 서비스가 혼잡합니다. 잠시 후 다시 시도해 주세요.',
  ai_error: 'AI 생성에 실패했습니다. 다시 시도해 주세요.',
}

async function invokeAi<T>(body: Record<string, unknown>): Promise<T> {
  const supabase = getSupabase()
  const { data, error } = await supabase.functions.invoke('ai-generate', { body })
  if (error) {
    let code = 'ai_error'
    let serverMessage: string | undefined
    if (error instanceof FunctionsHttpError) {
      const payload = (await error.context.json().catch(() => null)) as {
        error?: { code?: string; message?: string }
      } | null
      code = payload?.error?.code ?? 'ai_error'
      serverMessage = payload?.error?.message
    }
    throw new Error(ERROR_MESSAGES[code] ?? serverMessage ?? ERROR_MESSAGES.ai_error)
  }
  return data as T
}

export const realAiService: AiService = {
  generateCounselReport: (input) =>
    invokeAi<CounselReportResult>({
      task: 'counsel_report',
      student_id: input.studentId,
      raw_text: input.rawText,
    }),

  analyzeKakaoChat: (input) =>
    invokeAi<KakaoAnalysisResult>({
      task: 'kakao_analysis',
      student_id: input.studentId,
      raw_text: input.rawText,
    }),

  // 주간 요약은 UI와 함께 4차 이후 task로 추가된다 (스펙 §범위 외)
  generateWeeklySummary: () => {
    return Promise.reject(new Error('주간 요약은 아직 지원되지 않습니다.'))
  },

  generateMonthlyReport: (input) =>
    invokeAi<MonthlyReportResult>({
      task: 'monthly_report',
      student_id: input.studentId,
      target_month: input.targetMonth,
      note: input.note,
    }),
}
```

- [ ] **Step 2: `src/services/ai/index.ts`의 getAiService 전환**

파일 하단의 `getAiService`를 교체하고 import 추가:

```ts
import { realAiService } from './real'
```

```ts
// VITE_USE_MOCK_AI=true → mock (Edge Function 미배포 환경의 UI 개발용)
const USE_MOCK = import.meta.env.VITE_USE_MOCK_AI === 'true'

export function getAiService(): AiService {
  return USE_MOCK ? mockAiService : realAiService
}
```

- [ ] **Step 3: `.env.example`에 안내 추가**

```
# true면 AI 기능이 목업으로 동작합니다 (ai-generate Edge Function 미배포 환경의 UI 개발용)
VITE_USE_MOCK_AI=
```

- [ ] **Step 4: 빌드**

Run: `npm run build`
Expected: 성공

- [ ] **Step 5: 앱 E2E 수동 검증 (실제 LLM 경유)**

`npm run dev` (`.env.local`에 `VITE_USE_MOCK_AI` 미설정 상태):

1. **상담보고서**: AI 생성 → 번복·미정이 섞인 원문 입력 → 에디터가 열리고, 결정 사항이 최종 상태로, 마지막에 "⚠ 검토 필요 사항" 섹션 → 저장 → 목록에서 다시 열어 확인
2. **카카오톡 분석**: 분석 → 상세에 경고 카드 표시 → 확정 → 재분석(초안 복귀 + 새 경고) 확인
3. **월간 보고서**: 메모·활동이 있는 학생·월로 생성 → 7개 목차에 실제 기록 반영 확인 → 저장 후 "대화 원문(source_text)"에 서버 조립 컨텍스트가 저장됐는지 확인
4. **에러 경로**: 로그아웃 직전 세션으로 생성 시도 등은 생략 가능 — 최소한 잘못된 입력(빈 원문은 UI에서 막힘)이 아닌 서버 에러 시 danger 문구가 뜨는지 확인

- [ ] **Step 6: Commit**

```bash
git add src/services/ai/real.ts src/services/ai/index.ts .env.example
git commit -m "feat(ai): getAiService를 Edge Function 기반 실제 구현으로 전환

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: 문서 갱신

**Files:**
- Modify: `CLAUDE.md` (AI features 섹션)
- Modify: `.claude/skills/ai-reports/SKILL.md` (mock 서술 갱신)

**Interfaces:** 없음 (문서만)

- [ ] **Step 1: `CLAUDE.md`의 "AI features (2차 — UI real, LLM mocked)" 섹션 갱신**

섹션 제목과 본문을 실제 상태로 교체:

```markdown
## AI features (4차 — 실제 LLM 연동)

`src/services/ai/index.ts`의 `AiService` 계약을 통해서만 호출한다 — **호출부가 아닌 `getAiService()`/`real.ts`만 수정**. 실제 구현은 단일 Edge Function `supabase/functions/ai-generate/`(task 라우팅: `counsel_report`/`kakao_analysis`/`monthly_report`)를 호출하며, 서버는 사용자 JWT로 학생 컨텍스트를 조회(RLS 적용)해 프롬프트에 주입하고 생성 패스(claude-sonnet-5 + structured outputs) → 별도 검증 패스를 거쳐 `warnings[]` 포함 결과를 반환한다. `VITE_USE_MOCK_AI=true`면 mock으로 동작(함수 미배포 환경의 UI 개발용). Edge Function 배포는 Supabase CLI(`supabase functions deploy ai-generate`), API 키는 `supabase secrets set ANTHROPIC_API_KEY=...`. 설계 근거와 파이프라인 상세: `docs/superpowers/specs/2026-07-20-ai-integration-design.md`. 보고서 저장(`aiReports.ts`)·블록 에디터·PDF·카카오 dedup은 `ai-reports` 스킬 참조.
```

- [ ] **Step 2: `.claude/skills/ai-reports/SKILL.md`의 mock 관련 서술 갱신**

첫 문단의 "`getAiService()` currently returns `mockAiService`..." 부분을 현재 상태로 교체: real 서비스가 기본, mock은 `VITE_USE_MOCK_AI=true`일 때만. `generateWeeklySummary`는 real에서 미지원 에러 스텁이라는 점, 결과에 `warnings`가 포함되며 보고서류는 "⚠ 검토 필요 사항" 섹션으로 변환된다는 점, 월간 보고서 컨텍스트 조립이 서버로 이동했다는 점(클라이언트 `buildMonthlyContext` 삭제됨)을 반영한다.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md .claude/skills/ai-reports/SKILL.md
git commit -m "docs: AI 연동 완료 상태로 CLAUDE.md·ai-reports 스킬 갱신

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 주의사항 (전 Task 공통)

- **CLAUDE.md의 다른 변경 사항과 섞지 말 것**: 작업 트리에 이미 `editReport.md`, `index.html`, `img_reportRefer.png` 등 이 작업과 무관한 변경이 있다. 커밋은 위에 명시된 파일만 `git add` 한다.
- **Edge Function 코드에서 프론트 타입을 import하지 않는다**: Deno 함수는 별도 컴파일 단위다. task 모듈마다 로컬 interface를 두고 "프론트와 1:1, 필드 변경 금지" 주석으로 계약을 표시한다.
- **Sonnet 5에 `temperature`/`thinking` 파라미터를 보내지 않는다** — 비기본 샘플링 파라미터는 400으로 거부된다.
- curl 테스트의 `$JWT`는 만료(기본 1시간)되면 브라우저에서 다시 복사한다.
