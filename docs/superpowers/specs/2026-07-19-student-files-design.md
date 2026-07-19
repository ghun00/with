# 파일 관리(학생별 파일 업로드) 설계

- 날짜: 2026-07-19
- 근거: prd.md §6.4 (파일 관리), §6.10 (활동 타임라인 — "파일 업로드" 노출)
- 단계: 3차 1번째 서브프로젝트 (파일 → 일정 → 주간 요약 → AI 연동 순)

## 목적

학생 상세 화면에서 학생별 파일(생기부 PDF, 활동·상담 자료 등)을 업로드하고 목록으로 확인·열람·다운로드·삭제한다. 이후 단계에서 보고서 생성 참고 데이터로 활용할 수 있도록 메타데이터를 DB에 남긴다.

## 확정된 정책 (prd에서 미정이던 부분)

- **파일 유형 표시**: 별도 분류(카테고리) 입력 없음. 확장자 기반 형식(PDF/이미지/문서/엑셀)만 자동 표시.
- **허용 형식**: `pdf`, `jpg`, `jpeg`, `png`, `webp`, `docx`, `hwp`, `hwpx`, `txt`, `xlsx`
- **용량 제한**: 파일당 20MB. 클라이언트 검증 + 버킷 `file_size_limit` 이중화.
- **삭제 권한**: 업로더 본인 또는 그룹 owner (메모 패턴과 동일). 파일명 변경(update)은 요구사항에 없으므로 미지원.
- **타임라인**: 업로드만 `file_uploaded` 타입으로 기록(기존 `ActivityType`·라벨 재사용). 삭제는 기록하지 않음.

## 저장 방식 (선택한 접근)

**비공개 Storage 버킷 + Signed URL.** 공개 버킷은 URL 유출 시 민감 자료(생기부)가 노출되어 배제. Edge Function 프록시는 4차 인프라를 선행 요구하므로 배제.

- 버킷: `student-files` (private, `file_size_limit` 20MB)
- 객체 경로: `{student_id}/{uuid}` — 원본 파일명은 경로에 넣지 않고 DB `name` 컬럼에만 보관(한글·특수문자 경로 문제 회피, 충돌 없음)
- 열람/다운로드 모두 `createSignedUrl`로 발급한 만료 URL 사용

## DB — `supabase/migrations/0011_student_files.sql`

```sql
create table public.student_files (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  uploader_id uuid not null references public.profiles (id),
  name text not null,          -- 원본 파일명
  storage_path text not null unique,
  size bigint not null,
  mime_type text not null,
  created_at timestamptz not null default now()
);
create index student_files_student_created_idx
  on public.student_files (student_id, created_at desc);
```

RLS (메모 패턴 그대로):

- `select`: `can_access_student(student_id)`
- `insert`: `can_access_student(student_id) and uploader_id = auth.uid()`
- `delete`: `can_access_student(student_id) and (uploader_id = auth.uid() or 그룹 owner)`
- `update` 정책 없음

`storage.objects` 정책 (버킷 `student-files` 한정): 경로 첫 세그먼트가 student_id이므로 `can_access_student((storage.foldername(name))[1]::uuid)`로 select/insert/delete 검사. 크로스 테이블 서브쿼리 없이 기존 helper 함수만 사용 — RLS 재귀 패턴 준수.

## 서비스 — `src/services/files.ts`

- `fetchStudentFiles(studentId): Promise<StudentFile[]>` — 최신순
- `uploadStudentFile(studentId, file)`:
  1. 확장자·용량 클라이언트 검증 (실패 시 한국어 메시지로 throw)
  2. Storage 업로드 (`{student_id}/{uuid}`)
  3. `student_files` insert — 실패 시 업로드한 객체 best-effort 삭제 후 throw
  4. `logActivity('file_uploaded')` fire-and-forget (기존 패턴: 실패는 console만)
- `deleteStudentFile(file)` — DB row 삭제 후 storage 객체 삭제(객체 삭제 실패는 console 경고만 — row가 진실 원장)
- `getStudentFileUrl(file): Promise<string>` — signed URL (만료 60초, 열람·다운로드 공용)

`StudentFile` 타입과 형식 라벨 맵은 `src/types/index.ts`에 추가.

## UI — `src/features/student-detail/FilesTab.tsx`

`StudentDetailPage`의 `files` 탭 `PlaceholderTab`을 교체.

- 상단: 업로드 버튼(secondary Button + hidden file input). 업로드 중 Spinner/비활성화.
- 목록: 파일명 · 형식 Badge(중립 톤 — 분류가 아니라 형식이므로 색 없음) · 용량 · 등록자 · 등록일 · 행 액션(열람/다운로드/삭제)
- 열람: signed URL 새 탭. 다운로드: signed URL(`download` 옵션)로 저장. 삭제: confirm 후 진행.
- 빈 상태: `EmptyState`. 조회/변경은 TanStack Query (`useQuery` + `useMutation` + invalidate).
- 애니메이션: 목록 최초 로드는 기존 `StaggerList` 패턴, 그 외 추가 애니메이션 없음.

## 에러 처리

- 허용되지 않는 형식/20MB 초과: 업로드 전에 차단, 인라인 한국어 에러 메시지
- 업로드/삭제 실패: 기존 탭들과 동일하게 에러 메시지 노출, 목록 상태 불변
- storage-DB 정합성: insert 실패 시 객체 정리, 객체 삭제 실패 시 무시(고아 객체는 허용 — 목록엔 안 보임)

## 검증

자동 테스트 없음(레포 관례). `npm run build` 통과 + dev 서버에서 업로드→목록→열람→다운로드→삭제→타임라인 기록 수동 확인. member 계정으로 미담당 학생 접근 차단(RLS) 확인.

## 범위 제외

- 파일 카테고리 분류, 파일명 변경, 드래그 앤 드롭, 미리보기 뷰어, 보고서 생성 시 파일 내용 활용(후속 단계)
