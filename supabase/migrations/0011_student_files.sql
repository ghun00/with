-- 3차: 학생별 파일 관리 (spec: docs/superpowers/specs/2026-07-19-student-files-design.md)
-- 비공개 버킷 + signed URL 방식. 객체 경로는 {student_id}/{uuid} 고정 —
-- 원본 파일명은 경로에 넣지 않고 name 컬럼에만 보관한다(한글·특수문자 경로 문제 회피).

-- =========================================================
-- 1. 메타데이터 테이블
-- =========================================================
create table public.student_files (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  uploader_id uuid not null references public.profiles (id),
  name text not null,                        -- 원본 파일명
  storage_path text not null unique,         -- student-files 버킷 내 경로 ({student_id}/{uuid})
  size bigint not null,
  mime_type text not null,
  created_at timestamptz not null default now()
);

create index student_files_student_created_idx
  on public.student_files (student_id, created_at desc);

-- =========================================================
-- 2. RLS: 메모 패턴 (select/insert는 담당자, delete는 업로더 본인 또는 그룹 owner)
--    파일명 변경 요구사항이 없어 update 정책은 두지 않는다.
-- =========================================================
alter table public.student_files enable row level security;

create policy "student_files_select" on public.student_files
  for select to authenticated using (public.can_access_student(student_id));
create policy "student_files_insert" on public.student_files
  for insert to authenticated with check (
    public.can_access_student(student_id) and uploader_id = auth.uid()
  );
create policy "student_files_delete" on public.student_files
  for delete to authenticated using (
    public.can_access_student(student_id)
    and (uploader_id = auth.uid() or exists (
      select 1 from public.students s
      where s.id = student_id and public.is_group_owner(s.group_id)
    ))
  );

-- =========================================================
-- 3. Storage 버킷 (비공개, 20MB)
--    allowed_mime_types는 두지 않는다 — hwp/hwpx는 브라우저가 MIME을
--    일관되게 주지 않아(빈 문자열 포함) 버킷 수준 제한이 업로드를 막을 수 있다.
--    확장자 검증은 클라이언트(src/services/files.ts)에서 수행.
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('student-files', 'student-files', false, 20971520)
on conflict (id) do nothing;

-- =========================================================
-- 4. Storage RLS: 경로 첫 세그먼트가 student_id이므로
--    can_access_student()만으로 검사 (교차 서브쿼리 없음 — 0004 재귀 패턴 준수)
-- =========================================================
create policy "student_files_storage_select" on storage.objects
  for select to authenticated using (
    bucket_id = 'student-files'
    and public.can_access_student(((storage.foldername(name))[1])::uuid)
  );
create policy "student_files_storage_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'student-files'
    and public.can_access_student(((storage.foldername(name))[1])::uuid)
  );
create policy "student_files_storage_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'student-files'
    and public.can_access_student(((storage.foldername(name))[1])::uuid)
  );
