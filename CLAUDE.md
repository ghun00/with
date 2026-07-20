# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

WITH — a SaaS for 학종(school record-based admissions) consultants to manage students. UI text, DB content, and comments are in Korean; keep new user-facing strings and code comments in Korean to match. Full requirements: `prd.md` — but two later specs supersede parts of it:

- `changeToActivityManage.md` supersedes prd.md §6.6 (To Do 관리) — the To Do feature was replaced by 활동 관리.
- `editReport.md` supersedes prd.md §6.7 (상담보고서) and §6.12 (월간 보고서). The current spec ("보고서 모달 UI 및 Markdown 에디터 수정안") is a **Notion-style Markdown WYSIWYG editor** (Tiptap/ProseMirror) shared by both report types inside one Canvas-style modal (`ReportEditorModal.tsx`): title lives in the document body as H1 (top bar holds only 복사/PDF/편집/닫기, or 저장/취소/닫기 while editing), the body is one Markdown document with live-formatting shortcuts (`#`/`##`/`###`, `-`/`1.`/`[]`, `>`, `---`, `**bold**`, `*italic*`), direct authoring primary / AI assist secondary, 열람↔편집 states, PDF export. The 초안/확정(draft/final) flow from prd §7 was dropped for both report types' UI (DB columns remain) but still applies to 카카오톡 분석.

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

`src/services/ai/index.ts`의 `AiService` 계약을 통해서만 호출한다 — **호출부가 아닌 `getAiService()`/`real.ts`만 수정**. 실제 구현은 단일 Edge Function `supabase/functions/ai-generate/`(task 라우팅: `counsel_report`/`kakao_analysis`/`monthly_report`)를 호출하며, 서버는 사용자 JWT로 학생 컨텍스트를 조회(RLS 적용)해 프롬프트에 주입하고 생성 패스 → 별도 검증 패스를 거쳐 `warnings[]` 포함 결과를 반환한다. `VITE_USE_MOCK_AI=true`면 mock으로 동작(함수 미배포 환경의 UI 개발용). Edge Function 배포는 Supabase CLI(`supabase functions deploy ai-generate`), API 키는 `supabase secrets set ANTHROPIC_API_KEY=...`. 설계 근거와 파이프라인 상세: `docs/superpowers/specs/2026-07-20-ai-integration-design.md`. 보고서 저장(`aiReports.ts`)·블록 에디터·PDF·카카오 dedup은 `ai-reports` 스킬 참조.

**성능 제약 & 2-패스 모델 배분 (중요 — 건드리기 전에 읽을 것):** Edge Function은 **150초 wall-clock 한도**가 있고 초과 시 게이트웨이가 `546 WORKER_RESOURCE_LIMIT`로 죽여 브라우저엔 "Failed to load"로 뜬다(이 실패는 `real.ts`의 한국어 에러 매핑을 타지 못한다). 그래서 모델을 나눠 쓴다 — 생성 패스는 `claude-sonnet-5`, **검증 패스는 `claude-haiku-4-5`**(`claude.ts`의 `MODEL`/`VERIFY_MODEL`; `callClaudeJson`의 optional `model`로 지정). 검증 패스는 원문+생성 JSON을 받아 문서 전체를 다시 쓰므로 생성보다 느려, 둘 다 Sonnet이면 긴 원문에서 합계가 150초를 넘는다(실측: 15분 상담 ~1만 자에서 Sonnet 검증 시 152초 실패 → Haiku 검증으로 ~120초). 검증 모델은 `verify.ts`를 3개 task가 공유하므로 한 번 바꾸면 전부에 적용된다. 백스톱으로 **원문 길이 상한 12,000자**를 둔다 — 프론트 `MAX_AI_SOURCE_LENGTH`(`services/ai/constants.ts` — `index.ts`↔`real.ts` 순환 참조를 피하려 의존성 없는 별도 모듈에 둠)가 생성 버튼을 막고, 서버 `MAX_RAW_TEXT_LENGTH`(`http.ts`)가 Claude 호출 전 `input_too_long`(413)으로 즉시 반환한다. 여유가 ~30초뿐이라 25분+ 초장문은 여전히 한계 근접 → 요청 분리/백그라운드+폴링이 향후 과제(Supabase Pro면 wall-clock 400초). 새 task를 추가할 때도 이 2-패스 + 모델 배분 + 길이 가드 패턴을 따를 것.

## Animation

framer-motion is the app's animation system. `App.tsx` wraps everything in `<MotionConfig reducedMotion="user">`, and `src/index.css` has a global `prefers-reduced-motion` clamp for CSS transitions — new animations must degrade under reduced motion (use `useReducedMotion()` for anything beyond opacity).

Reusable primitives are in `src/components/motion/index.tsx` (`FadeIn`, `StaggerList`/`StaggerItem`) — prefer them over ad-hoc `motion.*` usage. Established patterns: `Modal` handles enter/exit via `AnimatePresence` (all modals get it for free); tab content in `StudentDetailPage` re-fades via `<FadeIn key={tab}>`; AI generation shows `AiGeneratingIndicator` (pulse dots + cycling stage messages + shimmer skeleton) and reveals results with `StaggerList`. Hover states stay plain CSS `transition-colors`.

## Design system

Tokens live in `src/index.css` under `@theme` (Tailwind v4 CSS-first config). Full rules (accent usage, CTA placement, badge tone conventions) and component inventory: `docs/superpowers/specs/2026-07-18-design-system.md`.

Exception: `ReportEditorModal` (the shared 상담·월간 보고서 editor) intentionally uses a borderless title input and arbitrary px type sizes instead of Field components — that's spec'd editor styling, not a pattern to copy elsewhere. Its Markdown document body is rendered by Tiptap and styled via the `.report-doc .tiptap …` block at the bottom of `src/index.css` (utilities can't reach Tiptap's internal nodes) — the print rules there (`@media print`, `.print-area`) also live-depend on that markup, so keep them in sync when changing editor output.

## Path alias

`@/*` maps to `src/*` (configured in both `vite.config.ts` and `tsconfig.app.json`) — use it instead of relative imports across feature boundaries.
