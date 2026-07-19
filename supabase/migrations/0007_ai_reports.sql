-- AI 생성 보고서 3종: 상담보고서 / 카카오톡 분석 / 월간 보고서 (2차)
-- 공통 정책(prd §7): 원문(source_text)과 AI 결과(result)를 분리 보관,
-- 생성 즉시 자동 저장(초안 draft), 수정 후 확정(final) 가능.
-- AI 호출 자체는 아직 목업(src/services/ai/mock.ts)이며, 저장·수정·확정 흐름만 실제 동작한다.

-- =========================================================
-- 1. 상담보고서: counsel_reports
-- =========================================================
create table public.counsel_reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  source_text text not null,                 -- 상담 원문 (붙여넣기 또는 TXT 업로드)
  result jsonb not null,                     -- CounselReportResult (수정본 반영)
  status text not null default 'draft' check (status in ('draft', 'final')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz
);

create index counsel_reports_student_created_idx
  on public.counsel_reports (student_id, created_at desc);

-- =========================================================
-- 2. 카카오톡 분석: kakao_analyses
-- =========================================================
create table public.kakao_analyses (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  source_text text not null,                 -- 대화 내보내기 원문
  source_hash text not null,                 -- 원문 SHA-256 (완전 중복 감지용, 부분 중복은 추후)
  result jsonb not null,                     -- KakaoAnalysisResult
  status text not null default 'draft' check (status in ('draft', 'final')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz
);

create index kakao_analyses_student_created_idx
  on public.kakao_analyses (student_id, created_at desc);
create index kakao_analyses_student_hash_idx
  on public.kakao_analyses (student_id, source_hash);

-- =========================================================
-- 3. 월간 보고서: monthly_reports
--    같은 달 재생성은 기존 행 갱신으로 처리(§9 경고 후 덮어쓰기).
--    버전 정책이 미확정이라 unique 제약은 두지 않고 UI에서 안내한다.
-- =========================================================
create table public.monthly_reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  target_month text not null check (target_month ~ '^\d{4}-\d{2}$'),  -- 대상 월 (YYYY-MM)
  source_text text not null,                 -- 생성에 사용한 컨텍스트 원문 스냅샷
  result jsonb not null,                     -- MonthlyReportResult (7개 목차 섹션)
  status text not null default 'draft' check (status in ('draft', 'final')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz
);

create index monthly_reports_student_month_idx
  on public.monthly_reports (student_id, target_month);

-- =========================================================
-- 4. RLS: can_access_student 헬퍼 재사용 (student_activities와 동일한 권한 모델)
--    student_id가 자기 행의 직접 컬럼이므로 교차 서브쿼리 재귀(0004) 및
--    INSERT ... RETURNING 가시성 문제(0005)가 발생하지 않는다.
-- =========================================================
alter table public.counsel_reports enable row level security;
alter table public.kakao_analyses enable row level security;
alter table public.monthly_reports enable row level security;

create policy "counsel_reports_select" on public.counsel_reports
  for select to authenticated using (public.can_access_student(student_id));
create policy "counsel_reports_insert" on public.counsel_reports
  for insert to authenticated with check (public.can_access_student(student_id) and created_by = auth.uid());
create policy "counsel_reports_update" on public.counsel_reports
  for update to authenticated using (public.can_access_student(student_id));
create policy "counsel_reports_delete" on public.counsel_reports
  for delete to authenticated using (public.can_access_student(student_id));

create policy "kakao_analyses_select" on public.kakao_analyses
  for select to authenticated using (public.can_access_student(student_id));
create policy "kakao_analyses_insert" on public.kakao_analyses
  for insert to authenticated with check (public.can_access_student(student_id) and created_by = auth.uid());
create policy "kakao_analyses_update" on public.kakao_analyses
  for update to authenticated using (public.can_access_student(student_id));
create policy "kakao_analyses_delete" on public.kakao_analyses
  for delete to authenticated using (public.can_access_student(student_id));

create policy "monthly_reports_select" on public.monthly_reports
  for select to authenticated using (public.can_access_student(student_id));
create policy "monthly_reports_insert" on public.monthly_reports
  for insert to authenticated with check (public.can_access_student(student_id) and created_by = auth.uid());
create policy "monthly_reports_update" on public.monthly_reports
  for update to authenticated using (public.can_access_student(student_id));
create policy "monthly_reports_delete" on public.monthly_reports
  for delete to authenticated using (public.can_access_student(student_id));
