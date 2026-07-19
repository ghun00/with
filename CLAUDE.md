# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

WITH — a SaaS for 학종(school record-based admissions) consultants to manage students. UI text, DB content, and comments are in Korean; keep new user-facing strings and code comments in Korean to match. Full requirements: `prd.md` — but two later specs supersede parts of it:

- `changeToActivityManage.md` supersedes prd.md §6.6 (To Do 관리) — the To Do feature was replaced by 활동 관리.
- `editReport.md` supersedes prd.md §6.7 (상담보고서) and §6.12 (월간 보고서) — four revisions in one file; the final state is the **4차 수정안** ("상담·월간 보고서 UI 수정안"): a single-document block editor shared by both report types inside one Canvas-style modal (`ReportEditorModal.tsx`), direct authoring primary / AI assist secondary, 열람↔편집 states, PDF export. The 초안/확정(draft/final) flow from prd §7 was dropped for both report types' UI (DB columns remain) but still applies to 카카오톡 분석.

Design system: `docs/superpowers/specs/2026-07-18-design-system.md`. README's roadmap says 월간 보고서 is 3차, but it was pulled forward and built in 2차.

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

## Files (3차 — 학생별 파일 관리, `0011_student_files.sql`)

`src/services/files.ts` + `src/features/student-detail/FilesTab.tsx` (파일 탭). Unlike other features, this one is backed by a private Supabase **Storage bucket** (`student-files`, 20MB limit) in addition to a metadata table — `student_files` holds `name`/`storage_path`/`size`/`mime_type` only; the object itself lives at `{student_id}/{uuid}` in the bucket, never the original filename (avoids Korean/special-char path issues). Access is via short-lived signed URLs (`getStudentFileUrl`, 60s TTL, `download` option for the 다운로드 vs 열람 distinction). The bucket has no `allowed_mime_types` restriction — hwp/hwpx don't get a consistent browser-reported MIME type — so the extension whitelist (`ALLOWED_FILE_EXTENSIONS`) is enforced client-side instead. RLS is duplicated on both `student_files` (table, `can_access_student`) and `storage.objects` (bucket, same helper applied to `(storage.foldername(name))[1]` as the student id) since Storage API calls bypass table policies entirely. Delete is owner-or-uploader on both; the table row is the source of truth for the visible list, so `deleteStudentFile()` deletes the row first and only logs (doesn't throw on) a failed storage-object cleanup.

## AI features (2차 — UI real, LLM mocked)

`src/services/ai/index.ts` defines the `AiService` contract; `getAiService()` returns a mock today and will swap to a Supabase Edge Function + Claude API — **change `getAiService()` only, never the call sites**. For report persistence (`aiReports.ts`), the shared `ReportEditorModal` block editor, PDF export, and 카카오톡 분석 dedup/lifecycle specifics, see the `ai-reports` skill.

## Animation

framer-motion is the app's animation system. `App.tsx` wraps everything in `<MotionConfig reducedMotion="user">`, and `src/index.css` has a global `prefers-reduced-motion` clamp for CSS transitions — new animations must degrade under reduced motion (use `useReducedMotion()` for anything beyond opacity).

Reusable primitives are in `src/components/motion/index.tsx` (`FadeIn`, `StaggerList`/`StaggerItem`) — prefer them over ad-hoc `motion.*` usage. Established patterns: `Modal` handles enter/exit via `AnimatePresence` (all modals get it for free); tab content in `StudentDetailPage` re-fades via `<FadeIn key={tab}>`; AI generation shows `AiGeneratingIndicator` (pulse dots + cycling stage messages + shimmer skeleton) and reveals results with `StaggerList`. Hover states stay plain CSS `transition-colors`.

## Design system

Tokens live in `src/index.css` under `@theme` (Tailwind v4 CSS-first config). Full rules (accent usage, CTA placement, badge tone conventions) and component inventory: `docs/superpowers/specs/2026-07-18-design-system.md`.

Exception: `CounselReportEditorModal` intentionally uses borderless inputs and arbitrary px type sizes (26/19/15px per editReport.md 3차) instead of Field components — that's spec'd editor styling, not a pattern to copy elsewhere.

## Path alias

`@/*` maps to `src/*` (configured in both `vite.config.ts` and `tsconfig.app.json`) — use it instead of relative imports across feature boundaries.
