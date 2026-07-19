# WITH 디자인 시스템 — flex(fx) 스타일

기준: https://jihoonwrks.me/builds/flex-design-system + flex.team 제품 UI.
2·3차 화면 개발 시 이 문서를 기준으로 한다. 토큰 원본은 `src/index.css`의 `@theme`.

## 원칙

1. **뉴트럴 무채색 중심** — 흰 서피스, 진한 회색 텍스트. 위계는 색이 아니라 굵기·크기·명도로 표현한다.
2. **액센트 절제** — 액센트 블루는 주요 CTA, 선택 상태(칩), 링크에만 쓴다. 내비게이션 활성·탭 활성은 무채색 고대비로 처리한다.
3. **페이지 헤더당 단일 CTA** — `PageHeader`의 `cta` 슬롯은 하나만. 보조 액션은 `secondary` 슬롯에 secondary 버튼으로.
4. **컬러 배지는 상태 표현에만** — 관리 상태·To Do 상태 등. 분류(태그·유형)는 무채색 배지.

## 토큰

| 분류 | 토큰 (Tailwind 클래스) | 값 |
| --- | --- | --- |
| 페이지 배경 | `bg-page` | `#F7F8FA` |
| 서피스 | `bg-surface` | `#FFFFFF` |
| 눌린 배경(호버·트랙) | `bg-sunken` | `#F2F4F6` |
| 텍스트 기본 | `text-fg` | `#1A1C20` |
| 텍스트 보조 | `text-fg-secondary` | `#6B7280` |
| 텍스트 3차 | `text-fg-tertiary` | `#9CA1AB` |
| 텍스트 비활성 | `text-fg-disabled` | `#C4C9D0` |
| 보더 | `border-line` | `#E5E8EB` |
| 보더 강조 | `border-line-strong` | `#D1D6DB` |
| 액센트 | `accent-50…700` | 50 `#EEF3FF` / 100 `#DCE7FF` / 200 `#B8CDFF` / 400 `#5C85FF` / **500 `#3D6AFE`** / 600 `#2B54E8` / 700 `#1F41C4` |
| 성공 | `success` / `success-soft` | `#0E9F6E` / `#ECFDF5` |
| 경고 | `warning` / `warning-soft` | `#D97706` / `#FFFBEB` |
| 위험 | `danger` / `danger-soft` | `#EF4444` / `#FEF2F2` |

**타이포** (`text-display` 등으로 사용, 폰트: Pretendard Variable)

| 역할 | 크기/행간/굵기 | 용도 |
| --- | --- | --- |
| display | 24/32 · 700 | 로그인 등 대형 타이틀 |
| title | 20/28 · 600 | 페이지 타이틀 |
| heading | 16/24 · 600 | 모달 타이틀, 섹션 헤딩 |
| body | 14/22 · 400 | 기본 본문 (body 기본값) |
| label | 13/18 · 500 | 버튼, 폼 라벨, 칩 |
| caption | 12/16 · 400 | 메타 정보, 테이블 헤더 |

헤딩류(display/title/heading)는 letter-spacing `-0.01em`.

**형태**: radius — `rounded-field`(10px, 버튼·인풋) / `rounded-card`(12px) / `rounded-modal`(16px) / 칩 `rounded-full`. 섀도 — `shadow-card`(카드) / `shadow-float`(모달·드롭다운). 테이블 행 48px, 페이지 패딩 `px-8 py-8`, 본문 최대 폭 `max-w-6xl`(목록) / `max-w-3xl`(설정형).

## 컴포넌트 인벤토리 (`src/components/ui/`)

| 컴포넌트 | 용도 · 규칙 |
| --- | --- |
| `Button` | primary(액센트)/secondary/ghost/danger. 페이지당 primary는 가급적 1개 |
| `Input/Select/Textarea/Label` (`Field.tsx`) | 높이 40px, 포커스 링 `accent-100` |
| `Badge` | neutral(기본)/outline/accent/success/warning/danger. `STUDENT_STATUS_TONE`, `TODO_STATUS_TONE` 매핑 사용 |
| `Modal` | 타이틀/콘텐츠/푸터 구조. wide 옵션(2열 폼) |
| `PageHeader` | title + description + 단일 cta + secondary |
| `Toolbar` + `Chip` | 검색 필드(라운드) + 필터 칩 + "필터 n개 초기화". 셀렉트 대신 칩 우선 |
| `Tabs` | 언더라인 탭, 활성 = 무채색 고대비 |
| `ListItem` + `SectionHeader` | fx 리스트 패턴: leading/title·subtitle/trailing 슬롯 |
| `Table`(THead/Th/Tr/Td) | 목록 화면 공통. Td `muted`로 보조 텍스트 처리 |
| `SegmentedControl` | 소규모 보기 전환 (예: To Do 주체 필터) |
| `Avatar` / `Spinner` / `EmptyState` | 무채색 톤. EmptyState는 행동 유도 문구+action 슬롯 |

## 예외

- 카카오 로그인 버튼은 카카오 브랜드 가이드 색(`#FEE500`)을 유지한다.
