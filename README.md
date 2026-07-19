# WITH — 학종 컨설턴트 학생 관리 서비스

학생부종합전형 컨설턴트를 위한 학생 관리 SaaS. 상세 요구사항은 [prd.md](./prd.md) 참고.

## 기술 스택

- React 18 + TypeScript + Vite
- Tailwind CSS v4
- React Router / TanStack Query
- Supabase (인증 · PostgreSQL · RLS · Storage)
- 로그인: 카카오 OAuth (Supabase Auth Kakao provider)

## 시작하기

```bash
npm install
npm run dev
```

Supabase 연결 전에는 앱 실행 시 설정 안내 화면이 표시됩니다.

### 1. Supabase 프로젝트 설정

1. [Supabase](https://supabase.com/dashboard)에서 새 프로젝트를 생성합니다.
2. SQL Editor에서 `supabase/migrations/0001_init.sql` 내용을 실행합니다.
3. Project Settings → API에서 URL과 anon key를 확인합니다.

### 2. 카카오 로그인 설정

1. [카카오 개발자](https://developers.kakao.com)에서 애플리케이션을 생성합니다.
2. 카카오 로그인 활성화 후 Redirect URI에 Supabase 콜백 주소를 등록합니다.
   - `https://<프로젝트>.supabase.co/auth/v1/callback`
3. 동의항목에서 **닉네임(profile_nickname)**, **프로필 사진(profile_image)**,
   **카카오계정 이메일(account_email)**을 설정합니다.
   - account_email은 카카오 비즈니스 인증이 완료된 앱에서만 설정할 수 있습니다. Supabase의
     카카오 로그인은 이메일 스코프를 기본으로 요청하므로 반드시 동의항목에 포함해야 합니다.
4. Supabase Dashboard → Authentication → Providers → Kakao를 활성화하고
   카카오 앱의 REST API 키(Client ID)와 Client Secret을 입력합니다.

### 3. 환경 변수

```bash
cp .env.example .env.local
# VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 입력 후 dev 서버 재시작
```

## 개발 단계

- **1차 (현재)**: 카카오 로그인, 그룹/멤버(초대 링크), 학생 관리, 학생 상세(요약·타임라인·메모·To Do)
- **2차**: 상담보고서 AI 생성, 카카오톡 대화 분석 — `src/services/ai/`의 목업을 Edge Function + Claude API로 교체
- **3차**: 일정, 파일, 주간 요약, 월간 보고서(PDF)

## 프로젝트 구조

```
supabase/migrations/   # DB 스키마 + RLS 정책 + RPC (create_group, accept_invitation)
src/lib/               # supabase 클라이언트, 포맷 유틸
src/services/          # 데이터 접근 계층 (students, groups, memos, todos, activities)
src/services/ai/       # AI 인터페이스 (1차는 mock 구현)
src/features/          # 도메인별 화면 (auth, group, onboarding, invite, students, student-detail, settings)
src/components/ui/     # 공용 UI 컴포넌트
src/routes/            # 앱 셸(사이드바 레이아웃), 설정 안내
```

## 권한 모델

- **대표 관리자(owner)**: 그룹 내 전체 학생 열람/등록/삭제, 담당자 변경, 멤버 초대·제외
- **일반 멤버**: 자신이 주/공동 담당자인 학생만 열람·수정, 공동 담당자 추가 가능
- DB 수준에서 Supabase RLS로 강제됩니다 (`supabase/migrations/0001_init.sql`).
# with
