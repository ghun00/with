-- 3차: 학생별 일정 관리 (spec: docs/superpowers/specs/2026-07-19-student-schedules-design.md)
-- 모든 일정은 항상 학생에 연결된다(student_id NOT NULL). 개인 일정은 범위 밖.
-- start_at은 필수, end_at은 선택(없으면 단일 시점).

create table public.student_schedules (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  created_by uuid not null references public.profiles (id),
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz,               -- 선택 (없으면 단일 시점)
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index student_schedules_student_start_idx
  on public.student_schedules (student_id, start_at);

-- =========================================================
-- RLS: student_id가 직접 컬럼이므로 can_access_student만으로 충분
--      (상담보고서 0007과 동일 — 교차 서브쿼리 재귀 없음)
-- =========================================================
alter table public.student_schedules enable row level security;

create policy "student_schedules_select" on public.student_schedules
  for select to authenticated using (public.can_access_student(student_id));
create policy "student_schedules_insert" on public.student_schedules
  for insert to authenticated with check (
    public.can_access_student(student_id) and created_by = auth.uid()
  );
create policy "student_schedules_update" on public.student_schedules
  for update to authenticated using (public.can_access_student(student_id));
create policy "student_schedules_delete" on public.student_schedules
  for delete to authenticated using (public.can_access_student(student_id));
