# 일정 관리(학생별 일정) 설계

- 날짜: 2026-07-19
- 근거: prd.md §6.5 (일정 관리), §6.10 (활동 타임라인 — "학생 연결 일정" 노출)
- 단계: 3차 2번째 서브프로젝트 (파일 → **일정** → 주간 요약 → AI 연동)

## 목적

학생 상세 화면에서 해당 학생과 관련된 상담/활동 일정을 등록·목록·수정·삭제한다. 목록은 에이전트(다가오는 일정 우선) 형태로 제공한다.

## 확정된 정책 (prd에서 열려 있던 부분)

- **노출 위치**: 학생 상세의 일정 탭만. 전역 캘린더 페이지·사이드바 메뉴는 만들지 않는다.
- **개인(비학생) 일정 제외**: prd §6.5의 "컨설턴트 개인 일정"은 이번 범위에서 제외(추후 과제). 따라서 모든 일정은 항상 학생에 연결되며 `student_id`는 NOT NULL.
- **뷰 형태**: 월간 그리드가 아니라 목록(에이전트). 다가오는 일정을 기본 노출, 지난 일정은 별도 섹션.
- **시간 모델**: 시작 일시(날짜+시각) 필수, 종료 일시 선택. 종료가 없으면 시각 지정 없는 단일 시점으로 표시. 종일 토글·반복 일정은 없음.
- **편집/삭제 권한**: 담당 컨설턴트 누구나(주/공동 담당 모두). 메모의 작성자-본인/owner 제한이 아니라 상담보고서·활동과 같은 학생 단위 공유 콘텐츠 취급 → RLS는 `can_access_student(student_id)`만 검사.
- **타임라인**: 생성 시에만 `schedule` 타입으로 기록(메모·파일과 동일한 create-only). 수정/삭제는 미기록. `schedule` ActivityType와 라벨 '일정'은 이미 존재하므로 types 수정 불필요.

## DB — `supabase/migrations/0012_student_schedules.sql`

```sql
create table public.student_schedules (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  created_by uuid not null references public.profiles (id),
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz,               -- 선택 (없으면 단일 시점)
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index student_schedules_student_start_idx
  on public.student_schedules (student_id, start_at);
```

RLS (상담보고서 `0007` 패턴 — `student_id`가 직접 컬럼이라 교차 서브쿼리 재귀 없음):

- `select`: `can_access_student(student_id)`
- `insert`: `can_access_student(student_id) and created_by = auth.uid()`
- `update`: `can_access_student(student_id)`
- `delete`: `can_access_student(student_id)`

## 서비스 — `src/services/schedules.ts`

- `fetchStudentSchedules(studentId): Promise<StudentSchedule[]>` — `start_at` 오름차순, 생성자 조인(`created_by:profiles(...)`)
- `createStudentSchedule(studentId, input)`:
  - `input: { title, startAt, endAt, memo }` (endAt/memo는 빈 값이면 null)
  - insert 후 `logActivity({ studentId, type: 'schedule', summary: title })` fire-and-forget
- `updateStudentSchedule(id, input)` — `updated_at` 갱신
- `deleteStudentSchedule(id)`
- 입력 검증: 제목 필수, 시작 일시 필수. 종료가 있으면 시작 이후여야 함(아니면 한국어 메시지로 throw).

`StudentSchedule` 타입은 `src/types/index.ts`의 관련 인터페이스 근처에 추가:

```ts
export interface StudentSchedule {
  id: string
  student_id: string
  created_by: string
  title: string
  start_at: string
  end_at: string | null
  memo: string | null
  created_at: string
  updated_at: string
  creator?: Profile
}
```

## UI — `src/features/student-detail/ScheduleTab.tsx`

`StudentDetailPage`의 `schedule` 탭 `PlaceholderTab`을 교체(`PlaceholderTab` import는 다른 탭이 없으면 제거).

- 상단: "일정 추가" 버튼(secondary) → `Modal` 폼(일정명, 시작 date+time, 종료 date+time 선택, 메모). 저장 시 검증 실패는 인라인 한국어 에러.
- 목록(에이전트):
  - **다가오는 일정**: `end_at ?? start_at`이 현재 이후인 항목, 시작 일시 오름차순.
  - **지난 일정**: 그 외, 시작 일시 내림차순. 별도 섹션 제목으로 구분.
  - 각 항목: 일정명 · 기간(`formatDateTime(start)` ~ `formatDateTime(end)`; 종료 없으면 시작만) · 메모 미리보기 · 수정/삭제 액션.
- 편집: 같은 모달 재사용(초기값 채움). 삭제: `window.confirm` 후 진행.
- 조회/변경은 TanStack Query (`['schedules', studentId]`), 성공 시 `['schedules', studentId]`·`['activities', studentId]` 무효화.
- 빈 상태 `EmptyState`, 목록 최초 로드 `StaggerList`/`StaggerItem`.

날짜+시각 입력은 기존 `Field`의 `input[type=date]`+`input[type=time]` 두 개로 구성하고, 서비스에 넘기기 전 ISO 문자열로 합친다(로컬 → ISO). 종료 미입력 시 null.

## 에러 처리

- 제목/시작 누락, 종료<시작: 저장 전 인라인 차단.
- 생성/수정/삭제 실패: 에러 메시지 노출, 목록 상태 불변.
- 타임라인 기록 실패는 `logActivity` 관례대로 콘솔만(주 작업 불방해).

## 검증

자동 테스트 없음(레포 관례). `npm run build` 통과 + dev 서버에서 등록→목록(다가오는/지난 분리)→수정→삭제→타임라인 '일정' 기록 수동 확인. member 계정으로 미담당 학생 접근 차단(RLS) 확인. 0012 마이그레이션은 Supabase SQL Editor 수동 적용.

## 범위 제외

개인(비학생) 일정, 전역 캘린더 페이지·사이드바 메뉴, 월간/주간 그리드 뷰, 외부 캘린더 연동, 알림, 반복 일정, 종일 토글.
