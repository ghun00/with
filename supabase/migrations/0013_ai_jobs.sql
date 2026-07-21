-- AI 생성 비동기 잡: ai_jobs (4차 후속 — 생성 작업을 서버측 잡으로 분리)
-- 배경: 기존엔 브라우저 fetch가 Edge Function 연결을 붙든 채 2-패스(생성+검증)를 동기로
--   기다렸다. 이탈 시 결과 유실, 150초 초과 시 546 실패, 가짜 진행표시 문제가 있었다.
-- 이 테이블로 작업 상태를 서버에 보존하고 클라가 폴링한다 → 이탈 안전·실제 진행표시·실패 복구.
-- Edge Function이 EdgeRuntime.waitUntil로 백그라운드 처리하며 stage/status/result를 갱신한다.

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  task text not null check (task in ('counsel_report', 'kakao_analysis', 'monthly_report')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  stage text check (stage in ('context', 'generating', 'verifying', 'done')),  -- 진행 단계 키 (진행표시용)
  input jsonb not null,                      -- 요청 페이로드(raw_text/target_month/note 등) — 원문 보존·재시도 근거
  result jsonb,                              -- 성공 결과 (task별 Result, warnings 포함)
  error_code text,
  error_message text,
  consumed_at timestamptz,                   -- 결과를 편집기/상세로 열어 소비했는지 (복귀 시 재오픈 방지)
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()  -- 서버가 매 stage 갱신마다 명시 세팅 → stale 판정 기준
);

-- (student, task)당 활성 잡 1개 — 중복 생성 차단 (서버가 stale 정리 후 INSERT)
create unique index ai_jobs_active_uniq
  on public.ai_jobs (student_id, task)
  where status in ('queued', 'running');

-- 마운트 복구 시 미소비 최신 잡 조회용
create index ai_jobs_student_task_created_idx
  on public.ai_jobs (student_id, task, created_at desc);

-- =========================================================
-- RLS: counsel_reports(0007)와 동일한 직접 student_id 패턴.
--   상태/결과 쓰기는 Edge Function이 service_role(RLS 우회)로 수행하고,
--   클라는 select(폴링) + update(markConsumed)만 하므로 4개 정책이면 충분.
-- =========================================================
alter table public.ai_jobs enable row level security;

create policy "ai_jobs_select" on public.ai_jobs
  for select to authenticated using (public.can_access_student(student_id));
create policy "ai_jobs_insert" on public.ai_jobs
  for insert to authenticated with check (public.can_access_student(student_id) and created_by = auth.uid());
create policy "ai_jobs_update" on public.ai_jobs
  for update to authenticated using (public.can_access_student(student_id));
create policy "ai_jobs_delete" on public.ai_jobs
  for delete to authenticated using (public.can_access_student(student_id));
