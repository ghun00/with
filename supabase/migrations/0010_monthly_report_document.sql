-- 상담·월간 보고서 UI 수정안 (editReport.md 4차): 월간 보고서를 상담보고서와 동일한
-- 공통 Report Modal(자유 편집 문서)로 통일한다. monthly_reports를 문서 모델로 전환:
--   title  : 보고서 제목 ("{대상연월} 월간보고서")
--   method : 작성 방식 (현재는 AI 생성만 존재하므로 기본 'ai')
--   result : { "sections": [ { "name": 소제목, "content": 본문 } ] }

alter table public.monthly_reports
  add column title text not null default '월간보고서',
  add column method text not null default 'ai' check (method in ('manual', 'ai'));

-- 기존 고정 7개 목차 데이터를 섹션 문서로 변환 (이미 sections 형태인 행은 건너뜀)
update public.monthly_reports
set
  title = to_char(to_date(target_month || '-01', 'YYYY-MM-DD'), 'YYYY"년" FMMM"월"') || ' 월간보고서',
  result = jsonb_build_object('sections', jsonb_build_array(
    jsonb_build_object('name', '이번 달 활동 요약', 'content', coalesce(result->>'activity_summary', '')),
    jsonb_build_object('name', '주요 성과', 'content', coalesce(result->>'achievements', '')),
    jsonb_build_object('name', '상담 및 소통 내용', 'content', coalesce(result->>'communication', '')),
    jsonb_build_object('name', 'To Do 수행 현황', 'content', coalesce(result->>'todo_progress', '')),
    jsonb_build_object('name', '보완 필요 사항', 'content', coalesce(result->>'improvements', '')),
    jsonb_build_object('name', '다음 달 계획', 'content', coalesce(result->>'next_month_plan', '')),
    jsonb_build_object('name', '컨설턴트 의견', 'content', coalesce(result->>'consultant_opinion', ''))
  ))
where not (result ? 'sections');
