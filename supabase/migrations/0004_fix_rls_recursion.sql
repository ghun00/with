-- RLS 상호 재귀 수정
-- students 정책이 student_assignments를, student_assignments 정책이 students를
-- 일반 서브쿼리로 참조하면 서로의 RLS가 재귀 평가되어 500(infinite recursion)이 발생한다.
-- 교차 참조를 모두 security definer 헬퍼로 대체한다.

create or replace function public.student_group_id(sid uuid)
returns uuid
language sql stable
security definer set search_path = public
as $$
  select group_id from public.students where id = sid;
$$;

-- 학생: 조회·수정 정책을 can_access_student(정의자 권한)로 단순화
drop policy "students_select" on public.students;
create policy "students_select" on public.students
  for select to authenticated using (
    deleted_at is null and public.can_access_student(id)
  );

drop policy "students_update" on public.students;
create policy "students_update" on public.students
  for update to authenticated using (public.can_access_student(id));

-- 담당자 지정: students 서브쿼리를 헬퍼로 대체
drop policy "assignments_select" on public.student_assignments;
create policy "assignments_select" on public.student_assignments
  for select to authenticated using (
    public.is_group_member(public.student_group_id(student_id))
  );

drop policy "assignments_insert" on public.student_assignments;
create policy "assignments_insert" on public.student_assignments
  for insert to authenticated with check (
    public.is_group_owner(public.student_group_id(student_id))
    or (role = 'co' and public.can_access_student(student_id))
  );

drop policy "assignments_delete" on public.student_assignments;
create policy "assignments_delete" on public.student_assignments
  for delete to authenticated using (
    public.is_group_owner(public.student_group_id(student_id))
  );

-- 메모: 대표 확인 서브쿼리를 헬퍼로 대체
drop policy "memos_update" on public.memos;
create policy "memos_update" on public.memos
  for update to authenticated using (
    public.can_access_student(student_id)
    and (author_id = auth.uid() or public.is_group_owner(public.student_group_id(student_id)))
  );

drop policy "memos_delete" on public.memos;
create policy "memos_delete" on public.memos
  for delete to authenticated using (
    public.can_access_student(student_id)
    and (author_id = auth.uid() or public.is_group_owner(public.student_group_id(student_id)))
  );
