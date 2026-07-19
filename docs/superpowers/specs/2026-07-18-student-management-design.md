# 학종 컨설턴트 학생 관리 서비스 — 1차 구현 계획

> 상태: 사용자 승인 완료(2026-07-18), 구현 시작 단계

## Context

`prd.md`에 정의된 학생부종합전형 컨설턴트용 학생 관리 SaaS를 그린필드로 구축한다. 여러 채널(카카오톡, 전화, 문서)에 분산된 학생 관리 기록을 통합하고, AI로 상담보고서·주간/월간 보고서 작성을 지원하는 것이 목표다.

사용자 결정 사항:
- **스택**: Supabase(인증·DB·스토리지) + React SPA
- **AI**: 호출 인터페이스는 실제 구조로 설계하되 초기엔 목업 응답. 이후 API 키만 연결하면 실제 연동
- **진행 순서**: 핵심 축부터 단계적. **이 계획은 1차 범위만 상세히 다룬다**
  - 1차: 카카오 로그인 · 그룹/멤버 · 학생 관리 · 학생 상세(요약/메모/To Do/타임라인)
  - 2차: 상담보고서 AI · 카카오톡 분석 AI
  - 3차: 일정 · 파일 · 주간 요약 · 월간 보고서(PDF)
- **로그인**: 카카오 로그인 (Supabase Auth Kakao OAuth provider)

## 기술 스택

- Vite + React 18 + TypeScript
- Tailwind CSS + shadcn/ui 스타일 컴포넌트 (레퍼런스: flex.team — 깔끔한 HR SaaS 룩, PC 우선 반응형)
- React Router (SPA 라우팅)
- TanStack Query (서버 상태)
- `@supabase/supabase-js` (Auth·DB·Storage)
- Supabase CLI 마이그레이션 (`supabase/migrations/*.sql`)

## 프로젝트 구조

```
with/
├── prd.md
├── supabase/
│   └── migrations/          # SQL 스키마 + RLS 정책
├── src/
│   ├── lib/supabase.ts      # 클라이언트 초기화
│   ├── services/            # 데이터 접근 계층 (students.ts, groups.ts, todos.ts, memos.ts, timeline.ts)
│   ├── services/ai/         # AI 인터페이스 + mock 구현 (2차 대비 구조만)
│   ├── features/            # 도메인별 화면·컴포넌트 (auth/, group/, students/, student-detail/)
│   ├── components/ui/       # 공용 UI (버튼, 테이블, 모달, 탭, 배지 등)
│   ├── routes/              # 라우트 정의 + 레이아웃 (사이드바 셸)
│   └── types/               # DB Row 타입, 도메인 타입
└── .env.local               # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (사용자 제공)
```

## DB 스키마 (1차)

- `profiles` — auth.users 1:1 (name, avatar_url). 가입 시 트리거로 자동 생성
- `groups` — id, name, owner_id
- `group_members` — group_id, user_id, role(`owner`|`member`)
- `invitations` — group_id, token, invited_email(선택), status. **초대는 링크 방식**: 카카오 계정은 이메일이 없을 수 있어, 대표가 초대 링크를 생성·전달하고 수락 시 멤버로 합류
- `students` — group_id, name, school, grade, student_phone, parent_phone, status(`active`|`paused`|`ended`), created_by, deleted_at(**소프트 삭제**), created_at/updated_at
- `student_assignments` — student_id, user_id, role(`primary`|`co`)
- `memos` — student_id, author_id, content, tag(상담/활동/진학/특이사항/학부모/기타), 타임스탬프
- `todos` — student_id, title, assignee_type(`student`|`consultant`), due_date, status(`pending`|`in_progress`|`done`), source(`manual`|`counsel_ai`|`kakao_ai`), created_by
- `activities` — student_id, type, actor_id, summary, ref(jsonb), created_at → 타임라인 피드. 메모/To Do/학생정보 변경 시 서비스 계층에서 함께 기록

**RLS 정책 (PRD 4.2 권한표 반영)**
- 대표(owner): 그룹 내 전체 학생 열람·등록·삭제, 담당자 변경, 멤버 초대
- 일반 멤버: 자신이 주/공동 담당자인 학생만 열람·수정. 공동 담당자 초대는 가능
- 담당자 없는 학생은 대표만 접근

## 화면 (1차)

1. **로그인** — 카카오 로그인 버튼 단일 화면
2. **온보딩** — 소속 그룹 없으면: 그룹 생성(대표가 됨) 또는 초대 링크로 합류
3. **앱 셸** — flex 스타일 좌측 사이드바(학생, 설정) + 상단 그룹/프로필
4. **학생 목록** — 테이블: 이름, 학교·학년, 관리 상태 배지, 주 담당, 공동 담당, 최근 관리일, 미완료 To Do 수. 이름/학교/담당자/상태 검색·필터. 등록·삭제는 대표만
5. **학생 등록/수정** — 모달 폼 (필수: 이름·학교·학년·학생/학부모 연락처, 담당자 지정)
6. **학생 상세** — 탭: 요약 / 타임라인 / 메모 / To Do (+ 2·3차 탭은 자리만: 상담보고서, 카카오톡 분석, 일정, 월간 보고서, 파일)
   - 요약: 기본 정보, 담당자, 진행 중 To Do, 최근 활동
   - 타임라인: 최신순, 유형 배지, 유형별 필터
   - 메모: 태그 선택, 작성자·일시 표시, 수정·삭제
   - To Do: 수행 주체(학생/컨설턴트) 구분, 상태 변경, 마감일
7. **그룹 설정** — 그룹 정보 수정, 멤버 목록·초대 링크 생성, 멤버별 담당 학생 확인 (대표 전용)

## AI 서비스 계층 (구조만, 1차)

`src/services/ai/index.ts`에 인터페이스 정의:
- `generateCounselReport(rawText)` / `analyzeKakaoChat(rawText)` / `generateWeeklySummary(...)` 등
- 1차에는 `mock.ts` 구현만 연결. 이후 Supabase Edge Function + Claude API 구현으로 교체 가능한 구조

## 구현 순서

1. Vite + React + TS + Tailwind 스캐폴딩, 공용 UI 컴포넌트, 앱 셸
2. Supabase 마이그레이션 작성 (스키마 + RLS + profiles 트리거)
3. 카카오 로그인 + 온보딩(그룹 생성/초대 수락)
4. 학생 CRUD + 목록(검색·필터) + 담당자 지정
5. 학생 상세: 요약 → 메모 → To Do → 타임라인
6. 그룹 설정(멤버·초대)

## 사용자 준비 사항 (구현 중 안내)

- Supabase 프로젝트 생성 → URL·anon key를 `.env.local`에 설정
- 카카오 개발자 앱 생성 → REST API 키·시크릿을 Supabase Auth의 Kakao provider에 등록, Redirect URI 설정
- 위 준비 전에도 UI·로직 개발은 진행 가능 (마지막에 연결·검증)

## 검증

- `npm run dev`로 구동 후 실제 플로우 주행: 카카오 로그인 → 그룹 생성 → 학생 등록 → 메모/To Do 작성 → 타임라인 반영 확인
- 권한 검증: 일반 멤버 계정으로 비담당 학생 접근 불가 확인 (RLS)
- 단계별 superpowers TDD/verification 스킬 적용, 완료 시 스펙 문서를 `docs/superpowers/specs/`에 저장
