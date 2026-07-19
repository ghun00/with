-- 상담보고서 개편 (editReport.md): 직접 작성이 기본, AI 생성은 보조 수단.
-- 고정 9개 필드(CounselReportResult) 대신 자유 편집 문서 구조로 전환한다.
--   title  : 보고서 제목
--   method : 작성 방식 (manual 직접 작성 / ai AI 생성)
--   result : { "sections": [ { "name": 항목명, "content": 본문 } ] }
-- 직접 작성 보고서는 상담 원문이 없으므로 source_text 기본값을 빈 문자열로 둔다.

alter table public.counsel_reports
  add column title text not null default '상담보고서',
  add column method text not null default 'ai' check (method in ('manual', 'ai')),
  alter column source_text set default '';

-- 기존 고정 필드 데이터를 섹션 문서로 변환 (이미 sections 형태인 행은 건너뜀)
update public.counsel_reports
set
  title = trim(coalesce(result->>'counsel_date', '') || ' 상담보고서'),
  result = jsonb_build_object('sections', jsonb_build_array(
    jsonb_build_object('name', '상담 일시', 'content', coalesce(result->>'counsel_date', '')),
    jsonb_build_object('name', '상담 목적', 'content', coalesce(result->>'purpose', '')),
    jsonb_build_object('name', '주요 논의', 'content', coalesce(result->>'discussion', '')),
    jsonb_build_object('name', '학생 현황', 'content', coalesce(result->>'student_status', '')),
    jsonb_build_object('name', '결정 사항', 'content', coalesce(
      (select string_agg(v, E'\n') from jsonb_array_elements_text(result->'decisions') v), '')),
    jsonb_build_object('name', '학생 To Do', 'content', coalesce(
      (select string_agg(v, E'\n') from jsonb_array_elements_text(result->'student_todos') v), '')),
    jsonb_build_object('name', '컨설턴트 To Do', 'content', coalesce(
      (select string_agg(v, E'\n') from jsonb_array_elements_text(result->'consultant_todos') v), '')),
    jsonb_build_object('name', '다음 상담 계획', 'content', coalesce(result->>'next_plan', '')),
    jsonb_build_object('name', '1Page Documentation', 'content', coalesce(result->>'summary', ''))
  ))
where not (result ? 'sections');
