# 상담보고서·월간보고서 PDF 다운로드 재설계

## 배경

`ReportEditorModal`의 PDF 다운로드(`handlePdf`)는 현재 `window.print()`와 `@media print` CSS(`.print-area`만 보이게 하는 `body:has(.print-area) *` visibility 트릭)에 전적으로 의존한다. PC 브라우저에서 인쇄 대화상자는 뜨지만 미리보기 내용이 비어있는(여백만 보이는) 버그가 보고되었다 — 브라우저 네이티브 인쇄 경로에 기능을 통째로 위임하고 있어 원인 진단·수정이 어렵고, 앞으로도 브라우저/OS 조합에 따라 재발할 여지가 크다.

이 설계는 브라우저 인쇄 의존을 완전히 제거하고, 클라이언트에서 직접 벡터 PDF를 생성해 즉시 다운로드하는 방식으로 교체한다. 상담보고서와 월간보고서는 `ReportEditorModal`을 공유하므로 한 번의 구현으로 둘 다 적용된다.

## 목표 / 비목표

- **목표**: 텍스트 선택·검색이 가능한 벡터 PDF를 브라우저 인쇄창 없이 즉시 다운로드. 현재 `.print-area`가 보여주는 내용(제목, 학생/기간/담당컨설턴트 등 메타 정보, 본문 Markdown 문서)을 그대로 담는다.
- **비목표**: 기존 인쇄 CSS와의 픽셀 단위 동일성. 특히 "소제목이 다음 내용과 분리되지 않는다"(`break-after: avoid`)는 pdfmake에 직접 대응 기능이 없어 이번 범위에서는 재현하지 않는다.

## 아키텍처

- 새 모듈 `src/services/pdf/reportPdf.ts`가 `generateReportPdf(input): Promise<void>`를 export한다.
  - 입력: `{ title, meta: { studentLine, periodLabel, periodValue, authorLine, methodLabel } , doc: ProseMirror JSON, filename }` (정확한 meta 필드 구성은 구현 단계에서 현재 메타 정보 블록 JSX를 그대로 옮기며 확정)
  - 내부에서 `pdfmake`와 한글 폰트(Noto Sans KR Regular+Bold, base64 TTF를 담은 vfs 모듈)를 로드하고, `pdfMake.createPdf(docDefinition).download(filename)`으로 즉시 파일을 저장한다.
- `ReportEditorModal.tsx`의 `handlePdf`:
  - `window.print()` 호출과 `document.title` 스왑 로직을 제거한다.
  - async 함수가 되어 `await import('@/services/pdf/reportPdf')`로 동적 로딩한 뒤, 현재 `title`/메타 state/`editor.getJSON()`을 모아 `generateReportPdf(...)`를 호출한다.
  - **파일명은 보고서 title 그대로 사용**한다(`{title}.pdf`). 파일시스템에 쓸 수 없는 문자(`/ \ : * ? " < > |` 등)는 다운로드 전에 제거/치환한다.
  - 생성 중에는 PDF 버튼에 스피너 표시 + 비활성화(중복 클릭 방지). pdfmake·폰트 데이터는 동적 import이므로 첫 클릭 시 다운로드 지연이 있을 수 있어 로딩 피드백이 필요하다.
  - 생성 실패 시 한국어 에러 메시지를 노출한다(구체 UI 컴포넌트는 기존 앱의 에러 노출 패턴을 재사용 — 구현 계획 단계에서 확정).
- 번들 크기 관리: `pdfmake` 본체와 폰트 데이터는 메인 번들에 포함하지 않고 동적 import로 분리한다. Noto Sans KR 전체 글리프셋을 담아야 하므로(두 굵기 합산 대략 10MB대) 앱 초기 로드에는 영향이 없고, PDF 버튼을 처음 누를 때만 받아 브라우저 캐시에 남는다.

## 본문(Markdown 문서) → PDF 매핑

소스는 저장된 markdown 문자열을 재파싱하지 않고 **에디터의 `editor.getJSON()`(ProseMirror JSON)을 직접 사용**한다 — 편집 중인 문서를 그대로 반영하며 별도 markdown 파서 도입이 불필요하다.

`pmNodeToPdfContent(node)` 재귀 변환 함수가 다음 노드/마크를 pdfmake content로 매핑한다 (Tiptap 설정: `StarterKit.configure({ heading: { levels: [1,2,3] } })` + `TaskList`/`TaskItem`):

| ProseMirror 노드/마크 | pdfmake 매핑 |
|---|---|
| heading (1~3) | fontSize 단계별 텍스트, bold |
| paragraph | 일반 텍스트 블록 |
| bulletList / orderedList / listItem | `ul` / `ol`, 각 item은 `unbreakable: true` (항목 중간에서 페이지가 안 잘리게) |
| blockquote | 좌측 들여쓰기 + 옅은 색/이탤릭 |
| horizontalRule | `canvas`로 가로선 |
| taskList / taskItem | `canvas`로 작은 체크박스 사각형을 직접 그림(완료 시 체크마크) — 폰트 글리프 의존 안 함 |
| hardBreak | 줄바꿈 |
| bold / italic / strike / code (마크) | 해당 스타일 적용 |
| 기타(codeBlock 등 미지원 노드) | 모노스페이스 텍스트로 폴백 — 내용이 조용히 누락되지 않게 함 |

제목과 메타 정보(학생명/학교/학년, 상담일시 또는 대상 기간, 담당컨설턴트, 작성 방식)는 에디터 문서 밖의 별도 React state이므로, 본문 content 앞에 별도로 조립해 붙인다(현재 `.print-area`에서 제목/메타가 `<EditorContent>` 밖에 렌더링되는 구조와 동일).

페이지 설정은 A4, 여백 16mm로 현재 `@page` 규칙과 동일하게 유지한다.

## 정리(제거 대상)

- `ReportEditorModal.tsx`: `window.print()` 호출, `document.title` 스왑 로직.
- `src/index.css`: `@page`, `@media print` 블록 전체(`.print-area`, `.report-overlay`/`.report-panel`/`.report-scroll` 관련 print 규칙 포함) — 더 이상 실제 인쇄 경로로 쓰이지 않는 죽은 코드가 된다.
- `.print-area` 클래스 자체도 실사용처가 없다면 함께 정리한다.

## 적용 범위

상담보고서 + 월간보고서 둘 다. 같은 `ReportEditorModal`/`handlePdf`를 공유하므로 한 번의 구현으로 적용된다. 카카오톡 분석은 현재 PDF 기능이 없으므로 이번 범위에 포함하지 않는다.

## 검증 방법

테스트 스위트가 없는 저장소이므로:
1. `npm run build` (타입체크 포함)로 정적 검증.
2. 브라우저에서 실제로 상담보고서/월간보고서를 열어 PDF 다운로드를 실행하고:
   - 파일이 즉시 다운로드되는지(인쇄 대화상자 없이)
   - 파일명이 보고서 title로 저장되는지
   - 제목(1~3단계)·리스트(순서/비순서)·인용문·구분선·체크리스트(완료/미완료)·굵게/기울임이 포함된 문서로 PDF를 열어 레이아웃이 깨지지 않는지
   - 한글 텍스트가 임베드된 Noto Sans KR로 정상 렌더링되고, PDF 뷰어에서 텍스트 선택/검색이 되는지
   - 여러 페이지로 넘어가는 긴 문서에서 리스트 항목이 페이지 중간에서 잘리지 않는지
