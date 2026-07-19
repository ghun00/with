-- INSERT ... RETURNING 시 RLS 위반 수정
-- 0004의 students_select 정책은 can_access_student(id)로 학생 행을 재조회하는데,
-- INSERT의 RETURNING 단계에서는 같은 문장에서 막 삽입된 행이 함수 내부 쿼리에 보이지 않아
-- 정책이 false가 된다. 행 컬럼(group_id)을 직접 참조하도록 바꿔 해결한다.

create or replace function public.is_assigned_to_student(sid uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.student_assignments
    where student_id = sid and user_id = auth.uid()
  );
$$;

drop policy "students_select" on public.students;
create policy "students_select" on public.students
  for select to authenticated using (
    deleted_at is null
    and (
      public.is_group_owner(group_id)
      or public.is_assigned_to_student(id)
    )
  );

drop policy "students_update" on public.students;
create policy "students_update" on public.students
  for update to authenticated using (
    public.is_group_owner(group_id)
    or public.is_assigned_to_student(id)
  );
