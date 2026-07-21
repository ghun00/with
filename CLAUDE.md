# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

WITH — a SaaS for 학종(school record-based admissions) consultants to manage students. UI text, DB content, and comments are in Korean; keep new user-facing strings and code comments in Korean to match. Full requirements: `prd.md` — but two later specs supersede parts of it:

- `changeToActivityManage.md` supersedes prd.md §6.6 (To Do 관리) — the To Do feature was replaced by 활동 관리.
- `editReport.md` supersedes prd.md §6.7 (상담보고서) and §6.12 (월간 보고서). The current spec ("보고서 모달 UI 및 Markdown 에디터 수정안") is a **Notion-style Markdown WYSIWYG editor** (Tiptap/ProseMirror) shared by both report types inside one Canvas-style modal (`ReportEditorModal.tsx`): title lives in the document body as H1 (top bar holds only 복사/PDF/편집/닫기, or 저장/취소/닫기 while editing), the body is one Markdown document with live-formatting shortcuts (`#`/`##`/`###`, `-`/`1.`/`[]`, `>`, `---`, `**bold**`, `*italic*`), direct authoring primary / AI assist secondary, 열람↔편집 states, PDF export. The 초안/확정(draft/final) flow from prd §7 was dropped for both report types' UI (DB columns remain) but still applies to 카카오톡 분석.
- `editAIReport.md` further refines `editReport.md` for the AI generation side of `counsel_report` only (not kakao/monthly): the 8 fixed top-level sections stay fixed, but the narrative fields are now LLM-structured Markdown with dynamic `### ` subheadings when content has multiple topics — restructuring for scannability, never summarizing away detail. See the "AI features" section below for the implementation.

Design system: `docs/superpowers/specs/2026-07-18-design-system.md`. README's roadmap says 월간 보고서 is 3차, but it was pulled forward and built in 2차. Of README's remaining 3차 items, 파일 관리(`0011`)와 일정 관리(`0012`)는 이미 구현 완료 — 주간 요약만 남아 있다.

## Commands

```bash
npm run dev      # vite dev server
npm run build     # tsc -b && vite build (type-check is part of the build — no separate typecheck script)
npm run preview   # preview production build
```

There is no lint, format, or test script/config in this repo. `npm run build` is the only automated correctness check available (TypeScript strict mode, `noUnusedLocals`/`noUnusedParameters` are on).

To run against a real backend, copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Without these, `App.tsx` renders `SetupNotice` instead of the app (checked via `isSupabaseConfigured` in `src/lib/supabase.ts`).

## Architecture

**Layering**: `src/services/*` is the only layer that talks to Supabase (`getSupabase()` from `src/lib/supabase.ts`). Feature components under `src/features/*` call services directly or through TanStack Query (`useQuery`/`useMutation`); there is no separate hooks/store layer. `src/types/index.ts` holds all shared domain types plus label maps (e.g. `STUDENT_STATUS_LABEL`) for rendering enum values in Korean. (One deliberate exception: `types/index.ts` type-imports AI result payload shapes from `@/services/ai` — the AI contract is the single source of those shapes.)

**Auth/group context**: `AuthProvider` (`src/features/auth/AuthProvider.tsx`) wraps Supabase session + `profiles` row. `GroupProvider` (`src/features/group/GroupProvider.tsx`) wraps group memberships, persists the active group id to `localStorage` (`with.currentGroupId`) since a user can belong to multiple groups. Both are required context — `useAuth()`/`useGroup()` throw if called outside their provider. `AppLayout` (`src/routes/AppLayout.tsx`) is the route guard: redirects to `/login` if no session, `/onboarding` if no group membership.

**Permission model** is enforced at the DB layer via Postgres RLS, not in the frontend — see `supabase/migrations/0001_init.sql`. Two roles per group: `owner` (full CRUD on all students, manage members/invitations) and `member` (read/write only students they're assigned to as `primary` or `co` in `student_assignments`; can add co-assignees to their own students but not remove). When adding a new table or query, the RLS policy is the actual authorization mechanism — don't assume frontend checks are sufficient.

RLS policies use `security definer` helper functions (`is_group_member`, `is_group_owner`, `can_access_student`, etc.) rather than plain subqueries between `students` and `student_assignments`, because cross-table subqueries between those two tables caused infinite RLS recursion — see migrations `0004_fix_rls_recursion.sql` and `0005_fix_insert_returning.sql` for the specific failure modes (recursion, and RLS re-evaluating a row not yet visible during `INSERT ... RETURNING`). Tables that carry `student_id` directly (e.g. `counsel_reports`, `kakao_analyses`, `monthly_reports` in `0007`) just call `can_access_student(student_id)` in all four policies. Follow these patterns for any new policy that needs to reference another RLS-protected table.

Migrations are plain numbered SQL files in `supabase/migrations/`, applied by hand via the Supabase SQL Editor (no CLI/migration tool wired up). New schema changes should be added as a new `NNNN_description.sql` file, not by editing earlier files.

**Two "activity" concepts — don't confuse them**:
- `activities` (table) / `src/services/activities.ts` is the global per-student audit timeline (타임라인 tab). Mutating actions (create student, add memo, create a report, etc.) call `logActivity()` to append to it. Logging failures are swallowed (console-only) so they never block the primary mutation — follow this fire-and-forget pattern for new timeline-producing actions.
- `student_activities` (+ `student_activity_subtasks`, `student_activity_history`) / `src/services/studentActivities.ts` is the 활동 관리 feature: a document-like entity per student with status (진행 예정/진행 중/활동 완료), category, due date, detail body, and sub-tasks (UI text says "세부 작업"; code identifiers remain `subtask`). Its per-activity change history goes to `student_activity_history` via `logActivityHistory()`, which — unlike `logActivity()` — **throws on failure**. History recording is intentionally kept while the history UI is hidden: `fetchActivityHistory()` currently has no caller — this is deliberate (per product decision), not dead code; don't remove the logging or the fetch function. Only feature-level milestones additionally go to the global timeline; content/subtask edits are history-only.
- Child tables (`student_activity_subtasks`, `student_activity_history`) denormalize `student_id` so RLS can call `can_access_student(student_id)` without cross-table subqueries; a `BEFORE INSERT` trigger (`sync_activity_child_student_id`) fills it from the parent row — clients never send it. Reuse this pattern for future child tables of RLS-protected parents.
- 카카오톡 분석's extracted to-dos (`student_todos`/`consultant_todos` on `KakaoAnalysisResult`) get reviewed and selectively registered as 활동 관리 items via `TodoRegisterModal.tsx` (`KakaoAnalysisDetail.tsx`) — the component name predates the prd §6.6 → 활동관리 rename and was kept as-is; it calls `createStudentActivity()`, not a `todos` table.

## Invitations & onboarding

Group invites (`invitations` table, `0001_init.sql`) are consumed via `/invite/:token` (`InvitePage.tsx`), which accepts immediately if a session exists, or bounces to `/login?redirect=/invite/:token` — Kakao OAuth's `redirectTo` is expected to carry that path back after login so `InvitePage` runs again with a fresh session. That OAuth round-trip only works if the exact path is allow-listed in Supabase's Redirect URLs config, which isn't guaranteed, so `InvitePage` also writes the token to `localStorage` (`with.pendingInviteToken`) as a fallback before bouncing to `/login`; `OnboardingPage.tsx` checks that key on mount and auto-joins the group before ever rendering its "create a group" form, so a broken redirect doesn't strand a new user thinking they need to create their own group. Both pages share the accept-and-route logic via `useAcceptInvite()` (`src/features/invite/useAcceptInvite.ts`), which also absorbs the harmless multi-tab race where the same token gets accepted twice (re-checks membership instead of surfacing a false "invalid invitation" error).

## Files (3차 — 학생별 파일 관리, `0011_student_files.sql`)

`src/services/files.ts` + `src/features/student-detail/FilesTab.tsx` (파일 탭). Unlike other features, this one is backed by a private Supabase **Storage bucket** (`student-files`, 20MB limit) in addition to a metadata table — `student_files` holds `name`/`storage_path`/`size`/`mime_type` only; the object itself lives at `{student_id}/{uuid}` in the bucket, never the original filename (avoids Korean/special-char path issues). Access is via short-lived signed URLs (`getStudentFileUrl`, 60s TTL, `download` option for the 다운로드 vs 열람 distinction). The bucket has no `allowed_mime_types` restriction — hwp/hwpx don't get a consistent browser-reported MIME type — so the extension whitelist (`ALLOWED_FILE_EXTENSIONS`) is enforced client-side instead. RLS is duplicated on both `student_files` (table, `can_access_student`) and `storage.objects` (bucket, same helper applied to `(storage.foldername(name))[1]` as the student id) since Storage API calls bypass table policies entirely. Delete is owner-or-uploader on both; the table row is the source of truth for the visible list, so `deleteStudentFile()` deletes the row first and only logs (doesn't throw on) a failed storage-object cleanup.

## Schedules (3차 — 학생별 일정 관리, `0012_student_schedules.sql`)

`src/services/schedules.ts` + `ScheduleTab.tsx`/`ScheduleFormModal.tsx` (일정 tab). Every row belongs to exactly one student (`student_id not null`) — there's no personal/unscoped calendar, matching the product's student-centric scope. `start_at` is required; `end_at` is optional (absent means a single point-in-time event, not a range). RLS follows the same direct-`student_id` pattern as `counsel_reports`/`monthly_reports` (`can_access_student(student_id)` on all four policies, no cross-table subquery). Creating a schedule also calls `logActivity()` to append to the global timeline — same fire-and-forget pattern as the other timeline-producing actions above.

## AI features (4차 — 실제 LLM 연동)

`src/services/ai/index.ts`의 `AiService` 계약을 통해서만 호출한다 — **호출부가 아닌 `getAiService()`/`real.ts`/`mock.ts`만 수정**. 실제 구현은 단일 Edge Function `supabase/functions/ai-generate/`(task 라우팅: `counsel_report`/`kakao_analysis`/`monthly_report`)를 호출하며, 서버는 사용자 JWT로 학생 컨텍스트를 조회(RLS 적용)해 프롬프트에 주입하고 생성 패스 → 별도 검증 패스를 거쳐 `warnings[]` 포함 결과를 만든다. **생성은 비동기 잡으로 처리된다(아래 "비동기 잡 모델")** — `AiService` 계약은 `startJob`/`fetchActiveJob`/`markJobConsumed`이고, 탭은 `useAiJob` 훅으로 소비한다. `VITE_USE_MOCK_AI=true`면 mock으로 동작(함수 미배포 환경의 UI 개발용 — 인메모리 잡 스토어). Edge Function 배포는 Supabase CLI(`supabase functions deploy ai-generate`), API 키는 `supabase secrets set ANTHROPIC_API_KEY=...`. 설계 근거와 파이프라인 상세: `docs/superpowers/specs/2026-07-20-ai-integration-design.md`. 보고서 저장(`aiReports.ts`)·블록 에디터·PDF·카카오 dedup은 `ai-reports` 스킬 참조.

**성능 제약 & 2-패스 모델 배분 (중요 — 건드리기 전에 읽을 것):** Edge Function은 **150초 wall-clock 한도**가 있고 초과 시 게이트웨이가 `546 WORKER_RESOURCE_LIMIT`로 죽여 브라우저엔 "Failed to load"로 뜬다(이 실패는 `real.ts`의 한국어 에러 매핑을 타지 못한다). 그래서 모델을 나눠 쓴다 — 생성 패스는 `claude-sonnet-5`, **검증 패스는 `claude-haiku-4-5`**(`claude.ts`의 `MODEL`/`VERIFY_MODEL`; `callClaudeJson`의 optional `model`로 지정). 검증 모델은 `verify.ts`를 3개 task가 공유하므로 한 번 바꾸면 전부에 적용된다.

**속도 튜닝 (2026-07, 위 실측을 개선):** 두 가지로 생성 시간을 줄였다. (1) **검증 패스는 문서 전체가 아니라 `{ warnings, corrections }`만 출력**한다(`verify.ts`의 `verifySchema`) — corrections는 생성 스키마와 동일 필드지만 전부 optional이라 **고친 필드만** 담고, 서버가 `{ ...generated, ...corrections }`로 병합해 자동 교정은 유지하되 출력 토큰을 문서 1벌 → 수정분으로 줄인다(검증 모델이 멀쩡한 필드를 건드릴 위험도 제거). (2) **생성 패스 effort를 `low`로 낮춘다**(`claude.ts`의 `GEN_EFFORT`, `callClaudeJson`의 optional `effort` → 생성 호출에만 전달) — `claude-sonnet-5`는 `thinking` 미지정 시 adaptive가 effort `high`로 켜져 상담 추출·재배치엔 과했다. **주의: `effort`는 Haiku 4.5(검증 모델)에서 400이므로 검증 호출엔 절대 넘기지 말 것**(verify는 미지정 유지). 백스톱으로 **원문 길이 상한 12,000자**를 둔다 — 프론트 `MAX_AI_SOURCE_LENGTH`(`services/ai/constants.ts` — `index.ts`↔`real.ts` 순환 참조를 피하려 의존성 없는 별도 모듈에 둠)가 생성 버튼을 막고, 서버 `MAX_RAW_TEXT_LENGTH`(`http.ts`)가 Claude 호출 전 `input_too_long`(413)으로 즉시 반환한다. 여유가 ~30초뿐이라 25분+ 초장문은 여전히 한계 근접(Supabase Pro면 wall-clock 400초). 새 task를 추가할 때도 이 2-패스 + 모델 배분 + 길이 가드 패턴을 따를 것.

**비동기 잡 모델 (중요 — 건드리기 전에 읽을 것):** 위 150초 문제는 생성을 **서버측 `ai_jobs` 잡**으로 분리해 완화했다(마이그레이션 `0013`). `ai-generate`가 잡을 INSERT하고 `{ job_id }`를 202로 즉시 반환한 뒤 `EdgeRuntime.waitUntil`로 2-패스를 백그라운드 처리하며 단계마다 `stage`(context/generating/verifying)를 갱신한다(`jobs.ts`, `tasks/*`의 `onStage` 콜백). 그래서 브라우저는 더 이상 연결을 붙들지 않고 — 546/"Failed to load"는 주 경로에서 사라진다 — 클라가 `ai_jobs`를 폴링한다(`useAiJob` 훅, 2.5초). **잡 상태 쓰기는 service_role**(백그라운드가 ~120초 뒤 끝나 user JWT 만료 대비), **컨텍스트 읽기는 user JWT**(RLS 유지). `(student_id, task)` 부분 unique 인덱스로 활성 잡 1개(중복 차단), 시작 전 `reapStaleJobs`(~160초 초과 running을 실패 처리)로 wall-clock에 죽은 잡을 정리한다 — 클라도 동일 임계로 stale을 실패 취급. **INSERT 충돌(수렴) 시 백그라운드 처리를 중복으로 띄우지 않도록** `insertJob`이 `created` 플래그를 돌려주니 유지할 것. 완료는 "해당 탭 복귀" 모델 — 같은 학생·탭에서 succeeded 감지 시 결과를 편집기/상세로 자동 오픈 후 `consumed_at` 표시(복귀 재오픈 방지). **카카오는 신규 생성과 상세 재분석이 같은 `kakao_analysis` task를 공유**하므로 완료 처리를 `input.analysis_id` 유무로 분기(`applyKakaoJobResult`)하고, 잡 소유는 `KakaoAnalysisTab` 한 곳에 둔다(목록/상세 동시 마운트 시 `useAiJob` 중복 실행 방지 — 상세엔 상태를 props로 내림). `SUPABASE_SERVICE_ROLE_KEY`는 Supabase 런타임이 자동 주입하므로 별도 시크릿 설정은 불필요(`ANTHROPIC_API_KEY`만 설정). 다음 라운드 후보: 스트리밍, Supabase Pro.

**상담보고서 Markdown 구조 (`counselReport.ts`, `editAIReport.md`):** `counsel_report`의 서술형 필드(`discussion`/`student_status`/`decisions`/`next_plan`/`summary`)는 고정 값이 아니라, LLM이 필요할 때만 `### ` 동적 소제목 + 문단/목록으로 구조화한 Markdown 문자열이다 — 내용을 축약하는 게 아니라 재배치하는 것이라는 가드레일이 프롬프트에 명시돼 있다. `decisions`는 (다른 필드와 달리) `string[]`이 아니라 `string`이므로, 바꿀 때는 `src/services/ai/index.ts`의 동형 타입도 함께 고칠 것. 프론트 `sectionsToMarkdown()`(`src/services/aiReports.ts`)이 8개 고정 필드를 `## `(H2)로 감싸 한 문서로 합치는데, 이는 Tiptap이 `heading: { levels: [1,2,3] }`로 H3까지만 허용하기 때문에 고정 섹션=H2/LLM 동적 소제목=H3의 여백을 만들기 위해서다. 그래서 `markdownToSections()`는 값을 아무 헤딩 레벨(`#{1,6}`)에서나 자르지 않고 **문서에서 처음 등장하는 헤딩 레벨을 그 문서의 섹션 경계로 삼아** 파싱한다 — 신규 문서(H2 최상위)와 기존 저장본(구버전 H3 최상위)을 데이터 마이그레이션 없이 함께 지원하려는 설계이므로, 이 함수를 고칠 땐 이 로직을 유지할 것. `verify.ts`의 `VERIFY_RULES`에도 "생성 결과의 Markdown 구조는 유지, 내용만 교정"이라는 규칙이 있다(3개 task 공유).

## Animation

framer-motion is the app's animation system. `App.tsx` wraps everything in `<MotionConfig reducedMotion="user">`, and `src/index.css` has a global `prefers-reduced-motion` clamp for CSS transitions — new animations must degrade under reduced motion (use `useReducedMotion()` for anything beyond opacity).

Reusable primitives are in `src/components/motion/index.tsx` (`FadeIn`, `StaggerList`/`StaggerItem`) — prefer them over ad-hoc `motion.*` usage. Established patterns: `Modal` handles enter/exit via `AnimatePresence` (all modals get it for free); tab content in `StudentDetailPage` re-fades via `<FadeIn key={tab}>`; AI generation shows `AiGeneratingIndicator` (pulse dots + cycling stage messages + shimmer skeleton) and reveals results with `StaggerList`. Hover states stay plain CSS `transition-colors`.

## Design system

Tokens live in `src/index.css` under `@theme` (Tailwind v4 CSS-first config). Full rules (accent usage, CTA placement, badge tone conventions) and component inventory: `docs/superpowers/specs/2026-07-18-design-system.md`.

Exception: `ReportEditorModal` (the shared 상담·월간 보고서 editor) intentionally uses a borderless title input and arbitrary px type sizes instead of Field components — that's spec'd editor styling, not a pattern to copy elsewhere. Its Markdown document body is rendered by Tiptap and styled via the `.report-doc .tiptap …` block at the bottom of `src/index.css` (utilities can't reach Tiptap's internal nodes) — the print rules there (`@media print`, `.print-area`) also live-depend on that markup, so keep them in sync when changing editor output.

## Path alias

`@/*` maps to `src/*` (configured in both `vite.config.ts` and `tsconfig.app.json`) — use it instead of relative imports across feature boundaries.
