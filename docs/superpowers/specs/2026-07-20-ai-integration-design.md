# 4차 AI 연동 설계 — mock AiService → Supabase Edge Function + Claude API

작성일: 2026-07-20

## 배경과 목표

2차에서 AI 기능(상담보고서 생성·카카오톡 분석·월간 보고서)의 UI와 저장 흐름은 완성됐고, LLM 호출만 `mockAiService`로 대체돼 있다. 4차의 목표는 이 mock을 실제 Claude API 파이프라인으로 교체하는 것이다.

핵심 제약: `src/services/ai/index.ts`의 `AiService` 계약을 통해서만 호출부(4곳)가 접근하므로, **`getAiService()`가 반환하는 구현만 교체**하고 계약 변경은 최소화한다.

단순 프롬프트 1회 호출로는 품질이 부족하다는 것이 사전 검증에서 확인됐다(스크립트→문서 변환 실험, 2026-07-19). 실패 패턴은 생성이 아니라 **검증·정규화 부재**에서 나온다:

1. 인물·용어 오인식이 요약 레이어까지 전파 (화자 명칭 혼재 포함)
2. 대화 중 번복된 결정이 번복 전 상태로 기록
3. 미정 사항이 확정 톤으로 승격
4. 수치·날짜 충돌 미검출

따라서 파이프라인은 **용어(인물) 컨텍스트 주입 + 생성 패스 + 별도 검증 패스**의 2-패스 구조로 설계한다.

## 확정된 결정

| 항목 | 결정 |
|---|---|
| 범위 | 기존 3개 기능만 (상담보고서 생성 · 카카오톡 분석 · 월간 보고서). 주간 요약은 UI가 생길 때 task 추가 |
| 서버 구조 | 단일 Edge Function `ai-generate` + task 라우팅 |
| 월간 보고서 컨텍스트 | 서버 조립 (클라이언트 조립 코드 제거) |
| 모델 | `claude-sonnet-5` (생성·검증 패스 동일 모델) |
| 파이프라인 | 학생 컨텍스트 주입 → 생성 패스(structured outputs) → 검증 패스(별도 호출) → warnings 포함 반환 |

## 전체 아키텍처

```
React 컴포넌트 (기존 탭들)
  └─ getAiService() ──► realAiService (src/services/ai/real.ts, 신규)
        └─ supabase.functions.invoke('ai-generate', { body: { task, ... } })
              └─ Edge Function: supabase/functions/ai-generate/ (Deno, 신규)
                    ├─ JWT 검증 (verify_jwt 기본값; supabase-js가 세션 토큰 자동 첨부)
                    ├─ task 라우팅: counsel_report | kakao_analysis | monthly_report
                    ├─ [1] 학생 컨텍스트 조회 (사용자 JWT로 Supabase 조회 → RLS 적용)
                    ├─ [2] 생성 패스: Claude structured outputs → 기존 결과 스키마
                    ├─ [3] 검증 패스: 별도 Claude 호출 → 수정본 + warnings[]
                    └─ 응답: 결과 JSON (warnings 포함)
```

- `ANTHROPIC_API_KEY`는 Edge Function 시크릿에만 존재. 브라우저에 노출되지 않는다.
- mock은 유지하고 `VITE_USE_MOCK_AI=true`일 때만 `getAiService()`가 mock을 반환한다 (함수 미배포 상태의 로컬 UI 개발용).

## Edge Function `ai-generate`

### 파일 구조

```
supabase/functions/ai-generate/
  index.ts          # 진입점: 인증 → 요청 파싱 → task 라우팅 → 에러 포맷 통일
  claude.ts         # Anthropic SDK 클라이언트 (npm: 스펙), 생성/검증 공통 호출 헬퍼
  studentContext.ts # 학생 컨텍스트(용어사전) 조회·조립
  verify.ts         # 검증 패스 공통 로직 (프롬프트 + 스키마 래핑)
  tasks/
    counselReport.ts   # task별 프롬프트 + JSON 스키마 + 요청 조립
    kakaoAnalysis.ts
    monthlyReport.ts   # + 해당 월 메모·활동·상담보고서 컨텍스트 조회
```

### 요청/응답 계약

요청 (task별):

```jsonc
{ "task": "counsel_report",  "student_id": "...", "raw_text": "..." }
{ "task": "kakao_analysis",  "student_id": "...", "raw_text": "..." }
{ "task": "monthly_report",  "student_id": "...", "target_month": "2026-07" }
```

성공 응답: task별 결과 JSON (`CounselReportResult` / `KakaoAnalysisResult` / `MonthlyReportResult`와 1:1, `warnings` 필드 포함).

에러 응답: `{ "error": { "code": "...", "message": "..." } }`
— code: `unauthorized` | `student_not_found`(접근 불가 포함) | `invalid_request` | `rate_limited` | `overloaded` | `ai_error`

### [1] 학생 컨텍스트(용어사전) 주입

모든 task에서 Edge Function이 **사용자 JWT로** 다음을 조회해 시스템 프롬프트에 고정 주입한다 (RLS가 접근 권한을 그대로 강제하며, 조회 결과가 없으면 `student_not_found`로 응답):

- 학생: 이름 · 학교 · 학년 · 상태
- 담당 컨설턴트: `student_assignments` → `profiles` 이름 목록 (primary/co 구분)

이 컨텍스트가 인물 지칭 정규화의 기준점이 된다 (예: 카카오톡 대화명 ↔ 학생/컨설턴트 매핑, 보고서 내 명칭 통일). 사전 검증에서 확인된 오류 유형 1(인물·용어 혼재)의 주 대응책이다.

### [2] 생성 패스

- 모델 `claude-sonnet-5`, **structured outputs**(`output_config.format` + JSON 스키마)로 각 task의 기존 결과 인터페이스와 1:1 일치하는 스키마를 강제한다. 파싱 실패·필드 누락이 구조적으로 불가능하다.
- adaptive thinking 기본값, `max_tokens` 16000, 비스트리밍 (Edge Function이 완성 JSON을 받아 반환).
- 시스템 프롬프트 공통 지침 (한국어):
  - 역할: 학종 컨설턴트 보조. 보고서는 학부모 열람 가능 수준의 격식.
  - 원문에 근거 없는 항목은 추측하지 말고 `"확인 필요"`로 기록.
  - 대화 후반에 번복·수정된 결정은 **최종 상태만** 기록.
  - "예정/검토 중/미정" 표현은 확정 톤으로 바꾸지 않는다.
  - 날짜는 원문에서 추출하고, 불명확하면 요청일 기준.

### [3] 검증 패스 (별도 호출)

생성과 검증을 한 호출에 합치지 않는다. 검증 패스는 **원문 + 생성 결과 JSON**을 입력으로 받아 오직 검증만 수행한다:

- 원문에 근거 없는 문장 → 삭제 또는 `"확인 필요"` 치환 + 경고
- 미정 사항이 확정 톤으로 서술됐는지 → 확신도 복원 + 경고
- 번복된 결정이 번복 전 상태로 남았는지 → 최종 상태로 수정 + 경고
- 같은 대상에 대한 수치·날짜 충돌 → 플래그 + 경고
- 인물 지칭이 학생 컨텍스트와 어긋나는지 → 정규화 + 경고

출력: **동일 스키마의 수정본 + `warnings: string[]`** (structured outputs로 강제). 경고는 버리지 않고 결과와 함께 클라이언트로 반환한다.

### 프롬프트 관리

task별 시스템 프롬프트와 JSON 스키마는 Edge Function 내 상수로 관리한다 (DB 관리·버저닝은 범위 외). 프롬프트 수정 시에는 저장해 둔 실제 샘플 입력(상담 메모·카카오 내보내기)으로 생성 결과를 회귀 확인한다.

### 월간 보고서 컨텍스트 (서버 조립)

`monthly_report` task는 학생 컨텍스트에 더해, 대상 월의 다음 데이터를 사용자 JWT로 조회해 컨텍스트를 조립한다 (기존 클라이언트 조립 로직과 동일 범위):

- 해당 월 메모, 활동 관리 항목(상태·세부 작업 포함), 확정·저장된 상담보고서

## 클라이언트 변경

### AiService 계약 변경 (3건)

```ts
generateCounselReport(input: { studentId: string; rawText: string }): Promise<CounselReportResult>
analyzeKakaoChat(input: { studentId: string; rawText: string }): Promise<KakaoAnalysisResult>
generateMonthlyReport(input: { studentId: string; targetMonth: string }): Promise<MonthlyReportResult>
```

- 호출부 4곳(`CounselReportTab`, `KakaoAnalysisTab`, `KakaoAnalysisDetail`, `MonthlyReportTab`) 모두 학생 상세 하위라 `studentId`를 이미 갖고 있다 — 인자 형태만 수정.
- `MonthlyReportTab`의 클라이언트 컨텍스트 조립 코드는 제거 (서버로 이동).
- `generateWeeklySummary`는 계약 유지, real 구현은 "아직 지원되지 않습니다" 에러 스텁.
- mock도 새 시그니처에 맞춰 수정 (동작은 기존 목업 응답 유지).

### 결과 인터페이스: `warnings` 필드 추가

`CounselReportResult` / `KakaoAnalysisResult` / `MonthlyReportResult`에 `warnings?: string[]` 옵션 필드를 추가한다.

- **상담·월간 보고서**: `counselResultToSections()` / `monthlyResultToSections()`가 warnings를 문서 마지막에 "⚠ 검토 필요 사항" 섹션으로 붙인다. 사용자가 검토 후 블록 에디터에서 삭제할 수 있다. 별도 UI 변경 없음.
- **카카오톡 분석**: `KakaoAnalysisDetail`에 경고 리스트 표시 영역을 추가한다 (warnings가 있을 때만).
- `warnings`는 jsonb `result` 컬럼에 그대로 저장되므로 DB 마이그레이션은 없다.

### 변경 없는 것

- 카카오톡 SHA-256 dedup (생성 전 클라이언트 검사) — 현행 유지
- `AiGeneratingIndicator` 생성 중 UX — 현행 유지 (실제 지연 20~90초에서 단계 메시지가 제 역할)
- 생성 중 이탈 시 결과 유실 — 알려진 한계로 유지
- 기존 결과 필드명·타입 — 동결 (`counselResultToSections()` 등 매핑 코드 무수정)

## 에러 처리

- Edge Function이 모든 에러를 `{ error: { code, message } }`로 통일. Claude API의 429/529는 각각 `rate_limited`/`overloaded`로 매핑.
- `real.ts`가 code → 한국어 사용자 메시지로 변환해 throw. 기존 탭들의 에러 표시 UI가 그대로 받는다. (예: `rate_limited` → "요청이 많아 잠시 후 다시 시도해 주세요.")

## 비용·지연

- 2-패스 구조로 호출당 비용·지연이 단일 호출 대비 약 2배. Sonnet 5 기준 건당 수십 원 수준으로 수용 가능하다고 판단.
- 검증 패스는 출력이 수정본 위주라 `max_tokens` 동일, 필요 시 `effort: "medium"`으로 낮춰 조정 여지.
- Edge Function 실행 시간 한도(플랜별 wall clock) 내에서 2-패스가 완료되는지 배포 후 실측한다. 초과가 관측되면 검증 패스 effort 하향 → 그래도 초과 시 패스 분리(함수 2회 호출)로 대응.

## 배포·시크릿

- Edge Function 배포에 **Supabase CLI** 도입 (`supabase functions deploy ai-generate`) — 이 레포에 처음 추가되는 도구.
- `supabase secrets set ANTHROPIC_API_KEY=...`로 키 등록.
- 로컬 테스트: `supabase functions serve` + `supabase/functions/.env` (git ignore).

## 검증 계획

1. `npm run build` (타입 체크 — 유일한 자동 검증)
2. Edge Function 스모크 테스트: `supabase functions serve` 상태에서 task 3종 curl 호출
3. 실제 플로우 수동 검증:
   - 상담보고서: 실제 상담 메모로 생성 → 편집기 로드 → 경고 섹션 확인 → 저장
   - 카카오톡: 실제 내보내기 텍스트로 분석 → 초안 저장 → 확정 → 재생성 → 경고 표시 확인
   - 월간 보고서: 메모·활동이 있는 학생으로 생성 → 섹션 매핑·서버 컨텍스트 반영 확인
4. 실패 모드 재현 확인: 번복 결정·미정 사항이 포함된 샘플 입력으로 검증 패스가 경고를 내는지 확인

## 비동기 잡 모델 (후속, 2026-07-20)

동기 호출(브라우저 fetch가 2-패스 완료까지 연결 유지)의 4가지 문제 — 지연·가짜 진행표시·이탈 시 유실·150초 초과 실패("Failed to load") — 를 해결하기 위해 생성을 서버측 `ai_jobs` 잡으로 분리했다. 설계 결정과 구현 위치:

- **데이터**: `ai_jobs`(마이그레이션 `0013`) — `status`(queued/running/succeeded/failed)·`stage`(context/generating/verifying/done)·`input`(원문 보존)·`result`·`error_*`·`consumed_at`. `(student_id, task)` 부분 unique 인덱스로 활성 잡 1개(중복 차단). RLS는 `can_access_student` 직접 패턴.
- **서버**: `ai-generate`가 잡을 INSERT하고 `{ job_id }`를 즉시 202로 반환한 뒤, `EdgeRuntime.waitUntil`로 2-패스를 백그라운드 처리하며 단계마다 `stage`를 갱신한다(`jobs.ts`, `tasks/*`의 `onStage` 콜백). **상태 쓰기는 service_role**(JWT 만료 대비), **컨텍스트 읽기는 user JWT**(RLS 유지). 시작 전 오래된 활성 잡을 실패로 정리(`reapStaleJobs`, ~160초). 일시오류(429/529)는 `callClaudeJson`에서 백오프 재시도.
- **클라이언트**: `AiService`를 잡 계약(`startJob`/`fetchActiveJob`/`markJobConsumed`)으로 재정의. `useAiJob` 훅이 폴링(2.5초, TanStack Query `refetchInterval`)·마운트 복구·완료(succeeded 감지 → `onSucceeded` 1회 → consumed)·stale 판정을 캡슐화한다. 3개 탭(+카카오 상세 재분석)이 사용.
- **가시성**: "해당 탭 복귀" — 같은 학생·탭으로 돌아오면 진행/완료/실패를 복구. 완료 시 결과를 편집기/상세로 자동 오픈. 크로스-앱 인디케이터·다중 잡 UI는 범위 외.
- **카카오 create vs regenerate**: 같은 `kakao_analysis` task를 공유하므로 완료 처리를 `input.analysis_id` 유무로 분기(`applyKakaoJobResult`) — 어느 화면이 떠 있든 일관 동작. 잡 소유는 `KakaoAnalysisTab` 한 곳(목록/상세 동시 마운트 시 중복 실행 방지).

**속도 라운드 (2026-07-21, 완료):** 실제 생성 시간을 줄였다. (1) **검증 패스 필드 패치** — 문서 전체 재출력 → `{ warnings, corrections }`(생성 스키마 동일 필드 전부 optional, 고친 필드만), 서버가 `{...generated, ...corrections}` 병합. `verify.ts`의 `verifySchema`/`verifyResult`, 3개 task 공유. 자동 교정 유지 + 검증 출력 급감. (2) **생성 effort `low`** — `claude-sonnet-5`는 `thinking` 미지정 시 adaptive가 effort `high`로 켜지던 것을 `GEN_EFFORT='low'`(`claude.ts`)로 낮춤, `callClaudeJson`의 optional `effort`로 생성 호출에만 전달(검증 Haiku는 effort 400이라 미지정 유지).

**다음 라운드 후보**: 생성 스트리밍(체감 지연), Supabase Pro(wall-clock 400초). 외부 인프라(AWS/NCP)는 AI 지연을 줄이지 못해(Anthropic은 어디서든 US 호출) 현 규모에선 불필요.

## 범위 외 (향후 확장)

- **주간 요약**: UI 구현 시 `weekly_summary` task 추가
- **결정 상태머신**: decision별 `supersedes` 추적 + 별도 reduce 판정 — 상담 회차가 쌓이는 시점에 검토
- **회차 간 누적 결정 로그**: 학생 단위로 "지난 상담 대비 무엇이 바뀌었나" 뷰
- **사용자 편집형 용어사전**: 그룹/학생 단위 용어사전 테이블 (현재는 DB 기존 데이터에서 자동 조립)
- **품질 골든셋**: 실 데이터 확보 후 액션아이템 재현율·결정 정확도·수치 정합성 자동 채점
