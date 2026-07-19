-- 상담보고서 3차 수정안: 상담 일시를 본문 섹션에서 보고서 기본정보(메타데이터)로 이동한다.
-- counsel_date 컬럼을 추가하고, 기존 '상담 일시' 섹션의 날짜를 추출해 이관한 뒤 섹션에서 제거한다.

alter table public.counsel_reports
  add column counsel_date date;

update public.counsel_reports r
set
  counsel_date = coalesce(
    (
      select to_date(
        replace(replace(substring(s->>'content' from '\d{4}[-./]\d{1,2}[-./]\d{1,2}'), '.', '-'), '/', '-'),
        'YYYY-MM-DD'
      )
      from jsonb_array_elements(r.result->'sections') s
      where s->>'name' = '상담 일시'
        and s->>'content' ~ '\d{4}[-./]\d{1,2}[-./]\d{1,2}'
      limit 1
    ),
    r.created_at::date
  ),
  result = jsonb_build_object(
    'sections',
    coalesce(
      (
        select jsonb_agg(s)
        from jsonb_array_elements(r.result->'sections') s
        where s->>'name' <> '상담 일시'
      ),
      '[]'::jsonb
    )
  );
