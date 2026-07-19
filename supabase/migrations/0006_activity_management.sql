-- 활동 관리(Activity Management): 기존 To Do 기능을 대체한다.
-- 학생/컨설턴트 담당 구분을 없애고, 활동 상태(진행 예정/진행 중/활동 완료), 분류,
-- 세부 내용, Sub-task, 변경 이력을 갖는 문서형 활동 엔티티로 전환한다.

-- =========================================================
-- 0. 기존 To Do 제거 (운영 데이터 없음, 마이그레이션 없이 삭제)
-- =========================================================
drop policy if exists "todos_select" on public.todos;
drop policy if exists "todos_insert" on public.todos;
drop policy if exists "todos_update" on public.todos;
drop policy if exists "todos_delete" on public.todos;
drop table if exists public.todos cascade;  -- todos_student_status_idx도 함께 제거됨

-- =========================================================
-- 1. 활동 본체: student_activities
--    (전역 감사 타임라인인 public.activities와는 별개 테이블)
-- =========================================================
create table public.student_activities (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  name text not null,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'completed')),
  category text not null check (category in ('세특', '창체', '독서', '행특', '기타')),
  due_date date,
  detail text not null default '',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index student_activities_student_status_idx
  on public.student_activities (student_id, status);

-- =========================================================
-- 2. Sub-task 목록: student_activity_subtasks
-- =========================================================
create table public.student_activity_subtasks (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.student_activities (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index student_activity_subtasks_activity_idx
  on public.student_activity_subtasks (activity_id, position);

-- =========================================================
-- 3. 활동별 변경 이력: student_activity_history
--    (활동 상세 화면 전용 append-only 이력. 전역 activities 타임라인과는 별개)
-- =========================================================
create table public.student_activity_history (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.student_activities (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  event_type text not null check (event_type in (
    'created', 'status_changed', 'completed',
    'name_edited', 'category_changed', 'due_date_changed', 'detail_edited',
    'subtask_added', 'subtask_completed', 'subtask_reopened', 'subtask_deleted'
  )),
  actor_id uuid not null references public.profiles (id),
  summary text not null default '',
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index student_activity_history_activity_created_idx
  on public.student_activity_history (activity_id, created_at desc);

-- =========================================================
-- 4. 자식 테이블 student_id 자동 채움 트리거
--    RLS WITH CHECK보다 먼저 실행되므로 can_access_student(student_id)가
--    올바른 값을 참조할 수 있다.
-- =========================================================
create or replace function public.sync_activity_child_student_id()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  select student_id into new.student_id
  from public.student_activities
  where id = new.activity_id;

  if new.student_id is null then
    raise exception 'invalid activity_id';
  end if;

  return new;
end;
$$;

create trigger student_activity_subtasks_set_student_id
  before insert on public.student_activity_subtasks
  for each row execute function public.sync_activity_child_student_id();

create trigger student_activity_history_set_student_id
  before insert on public.student_activity_history
  for each row execute function public.sync_activity_child_student_id();

-- =========================================================
-- 5. RLS: can_access_student 헬퍼 재사용 (todos와 동일한 권한 모델)
-- =========================================================
alter table public.student_activities enable row level security;
alter table public.student_activity_subtasks enable row level security;
alter table public.student_activity_history enable row level security;

-- 활동 본체: 담당자·대표 전체 관리 가능
create policy "student_activities_select" on public.student_activities
  for select to authenticated using (public.can_access_student(student_id));
create policy "student_activities_insert" on public.student_activities
  for insert to authenticated with check (public.can_access_student(student_id) and created_by = auth.uid());
create policy "student_activities_update" on public.student_activities
  for update to authenticated using (public.can_access_student(student_id));
create policy "student_activities_delete" on public.student_activities
  for delete to authenticated using (public.can_access_student(student_id));

-- Sub-task: 담당자·대표 전체 관리 가능
create policy "student_activity_subtasks_select" on public.student_activity_subtasks
  for select to authenticated using (public.can_access_student(student_id));
create policy "student_activity_subtasks_insert" on public.student_activity_subtasks
  for insert to authenticated with check (public.can_access_student(student_id));
create policy "student_activity_subtasks_update" on public.student_activity_subtasks
  for update to authenticated using (public.can_access_student(student_id));
create policy "student_activity_subtasks_delete" on public.student_activity_subtasks
  for delete to authenticated using (public.can_access_student(student_id));

-- 변경 이력: 조회·기록만 가능 (append-only, update/delete 정책 없음)
create policy "student_activity_history_select" on public.student_activity_history
  for select to authenticated using (public.can_access_student(student_id));
create policy "student_activity_history_insert" on public.student_activity_history
  for insert to authenticated with check (public.can_access_student(student_id) and actor_id = auth.uid());
