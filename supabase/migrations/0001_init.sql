-- WITH 학생 관리 서비스 — 1차 스키마
-- profiles / groups / group_members / invitations / students / student_assignments / memos / todos / activities

-- =========================================================
-- 프로필: auth.users 1:1, 가입 시 트리거로 자동 생성
-- =========================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'preferred_username',
      ''
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================
-- 그룹 / 멤버 / 초대
-- =========================================================
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  invited_email text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

-- =========================================================
-- 학생 / 담당자
-- =========================================================
create table public.students (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null,
  school text not null default '',
  grade text not null default '',
  student_phone text not null default '',
  parent_phone text not null default '',
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.student_assignments (
  student_id uuid not null references public.students (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('primary', 'co')),
  created_at timestamptz not null default now(),
  primary key (student_id, user_id)
);

-- =========================================================
-- 메모 / To Do / 활동 타임라인
-- =========================================================
create table public.memos (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  content text not null,
  tag text not null default '기타' check (tag in ('상담', '활동', '진학', '특이사항', '학부모', '기타')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.todos (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  title text not null,
  assignee_type text not null check (assignee_type in ('student', 'consultant')),
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  source text not null default 'manual' check (source in ('manual', 'counsel_ai', 'kakao_ai')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  type text not null,
  actor_id uuid not null references public.profiles (id),
  summary text not null default '',
  ref jsonb,
  created_at timestamptz not null default now()
);

create index activities_student_created_idx on public.activities (student_id, created_at desc);
create index todos_student_status_idx on public.todos (student_id, status);
create index memos_student_created_idx on public.memos (student_id, created_at desc);
create index students_group_idx on public.students (group_id);

-- =========================================================
-- RLS 헬퍼 (security definer로 정책 재귀 방지)
-- =========================================================
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

create or replace function public.is_group_owner(gid uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid() and role = 'owner'
  );
$$;

-- 학생 접근: 그룹 대표이거나 주/공동 담당자
create or replace function public.can_access_student(sid uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.students s
    where s.id = sid
      and s.deleted_at is null
      and (
        public.is_group_owner(s.group_id)
        or exists (
          select 1 from public.student_assignments sa
          where sa.student_id = s.id and sa.user_id = auth.uid()
        )
      )
  );
$$;

-- =========================================================
-- RPC: 그룹 생성 (그룹 + owner 멤버십을 원자적으로 생성)
-- =========================================================
create or replace function public.create_group(group_name text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  gid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- 초기 정책: 계정당 그룹 1개
  if exists (select 1 from public.groups where owner_id = auth.uid()) then
    raise exception 'group_limit_reached';
  end if;

  insert into public.groups (name, owner_id)
  values (group_name, auth.uid())
  returning id into gid;

  insert into public.group_members (group_id, user_id, role)
  values (gid, auth.uid(), 'owner');

  return gid;
end;
$$;

-- =========================================================
-- RPC: 초대 수락 (토큰 검증 후 멤버로 합류)
-- =========================================================
create or replace function public.accept_invitation(invite_token text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  inv record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into inv
  from public.invitations
  where token = invite_token and status = 'pending';

  if not found then
    raise exception 'invalid_invitation';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (inv.group_id, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;

  update public.invitations
  set status = 'accepted'
  where id = inv.id;

  return inv.group_id;
end;
$$;

-- =========================================================
-- RLS 정책
-- =========================================================
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.invitations enable row level security;
alter table public.students enable row level security;
alter table public.student_assignments enable row level security;
alter table public.memos enable row level security;
alter table public.todos enable row level security;
alter table public.activities enable row level security;

-- 프로필: 로그인 사용자는 프로필(이름·아바타) 조회 가능, 본인만 수정
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid());

-- 그룹: 멤버만 조회, 대표만 수정
create policy "groups_select_member" on public.groups
  for select to authenticated using (public.is_group_member(id));
create policy "groups_update_owner" on public.groups
  for update to authenticated using (public.is_group_owner(id));

-- 그룹 멤버: 멤버 목록은 그룹 멤버만 조회, 대표만 제거
create policy "group_members_select" on public.group_members
  for select to authenticated using (public.is_group_member(group_id));
create policy "group_members_delete_owner" on public.group_members
  for delete to authenticated using (public.is_group_owner(group_id) and user_id <> auth.uid());

-- 초대: 대표만 생성·조회·취소
create policy "invitations_select_owner" on public.invitations
  for select to authenticated using (public.is_group_owner(group_id));
create policy "invitations_insert_owner" on public.invitations
  for insert to authenticated with check (public.is_group_owner(group_id) and created_by = auth.uid());
create policy "invitations_update_owner" on public.invitations
  for update to authenticated using (public.is_group_owner(group_id));

-- 학생: 대표는 전체, 멤버는 담당 학생만. 등록·삭제는 대표만
create policy "students_select" on public.students
  for select to authenticated using (
    deleted_at is null
    and (
      public.is_group_owner(group_id)
      or exists (
        select 1 from public.student_assignments sa
        where sa.student_id = id and sa.user_id = auth.uid()
      )
    )
  );
create policy "students_insert_owner" on public.students
  for insert to authenticated with check (public.is_group_owner(group_id) and created_by = auth.uid());
create policy "students_update" on public.students
  for update to authenticated using (
    public.is_group_owner(group_id)
    or exists (
      select 1 from public.student_assignments sa
      where sa.student_id = id and sa.user_id = auth.uid()
    )
  );

-- 담당자 지정: 대표는 자유롭게, 일반 멤버는 자신의 담당 학생에 공동 담당자 추가만 가능
create policy "assignments_select" on public.student_assignments
  for select to authenticated using (
    exists (
      select 1 from public.students s
      where s.id = student_id and public.is_group_member(s.group_id)
    )
  );
create policy "assignments_insert" on public.student_assignments
  for insert to authenticated with check (
    exists (select 1 from public.students s where s.id = student_id and public.is_group_owner(s.group_id))
    or (role = 'co' and public.can_access_student(student_id))
  );
create policy "assignments_delete" on public.student_assignments
  for delete to authenticated using (
    exists (select 1 from public.students s where s.id = student_id and public.is_group_owner(s.group_id))
  );

-- 메모: 담당자·대표 조회/작성, 수정·삭제는 작성자 또는 대표
create policy "memos_select" on public.memos
  for select to authenticated using (public.can_access_student(student_id));
create policy "memos_insert" on public.memos
  for insert to authenticated with check (public.can_access_student(student_id) and author_id = auth.uid());
create policy "memos_update" on public.memos
  for update to authenticated using (
    public.can_access_student(student_id)
    and (author_id = auth.uid() or exists (
      select 1 from public.students s where s.id = student_id and public.is_group_owner(s.group_id)
    ))
  );
create policy "memos_delete" on public.memos
  for delete to authenticated using (
    public.can_access_student(student_id)
    and (author_id = auth.uid() or exists (
      select 1 from public.students s where s.id = student_id and public.is_group_owner(s.group_id)
    ))
  );

-- To Do: 담당자·대표 전체 관리 가능
create policy "todos_select" on public.todos
  for select to authenticated using (public.can_access_student(student_id));
create policy "todos_insert" on public.todos
  for insert to authenticated with check (public.can_access_student(student_id) and created_by = auth.uid());
create policy "todos_update" on public.todos
  for update to authenticated using (public.can_access_student(student_id));
create policy "todos_delete" on public.todos
  for delete to authenticated using (public.can_access_student(student_id));

-- 활동 타임라인: 담당자·대표 조회, 기록은 접근 가능한 사용자만
create policy "activities_select" on public.activities
  for select to authenticated using (public.can_access_student(student_id));
create policy "activities_insert" on public.activities
  for insert to authenticated with check (public.can_access_student(student_id) and actor_id = auth.uid());
