# 상담·월간 보고서 PDF 다운로드 재구현 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ReportEditorModal`의 PDF 다운로드를 `window.print()` 의존에서 클라이언트 측 벡터 PDF 생성(`pdfmake` + Noto Sans KR 임베딩)으로 교체해, PC 브라우저에서 인쇄 미리보기가 빈 화면으로 뜨는 버그를 원천적으로 없앤다.

**Architecture:** 에디터의 `editor.getJSON()`(ProseMirror JSON)을 재귀 변환해 pdfmake `content` 트리를 만들고, `pdfMake.createPdf(docDefinition).download(filename)`으로 즉시 파일을 저장한다. `pdfmake` 본체와 한글 폰트 데이터는 동적 `import()`로 분리해 메인 번들에 영향을 주지 않는다.

**Tech Stack:** `pdfmake` ^0.3.11 (런타임 의존성), `@types/pdfmake` ^0.3.3 (devDependency), `@fontsource/noto-sans-kr` ^5.3.0 (devDependency, 폰트 원본 소스 — 런타임에는 사용하지 않고 1회성 생성 스크립트에서만 사용). 기존 스택(React 18 + TS + Vite, Tiptap)은 그대로.

## Global Constraints

- 새 UI 텍스트/주석은 한국어로 작성한다 (프로젝트 전역 컨벤션).
- `@/*` 경로 별칭을 상대 경로 대신 사용한다 (`vite.config.ts`/`tsconfig.app.json` 설정됨).
- 이 저장소에는 테스트 러너가 없다 — `npm run build`(`tsc -b && vite build`, strict mode + `noUnusedLocals`/`noUnusedParameters`)가 유일한 자동 검증 수단이다. 각 태스크의 "테스트" 단계는 이 명령으로 대체한다.
- 서비스 계층 함수는 `src/services/*`에 두는 기존 레이어링을 따른다.
- pdfmake의 `TDocumentDefinitions`/`Content`/`Column` 등 타입은 `pdfmake/interfaces`에서, 런타임 함수(`createPdf`/`addVirtualFileSystem`/`addFonts`)는 `pdfmake/build/pdfmake`에서 **named export**로 가져온다(default export 아님 — `@types/pdfmake` 0.3.x 기준으로 실측 검증 완료).

---

### Task 1: Noto Sans KR 폰트를 pdfmake VFS 데이터로 생성

**Files:**
- Create: `scripts/generate-pdf-fonts.mjs`
- Create (생성 스크립트 실행 결과, 커밋 대상): `src/services/pdf/notoSansKrVfs.generated.ts`
- Modify: `package.json` (dependencies에 `pdfmake`, devDependencies에 `@types/pdfmake`, `@fontsource/noto-sans-kr` 추가)

**Interfaces:**
- Produces: `notoSansKrVfs: Record<string, string>` — key는 `'NotoSansKR-Regular.woff2'` / `'NotoSansKR-Bold.woff2'`, value는 해당 폰트 파일의 base64 문자열. Task 2가 이 export를 그대로 가져다 쓴다.

- [ ] **Step 1: 의존성 설치**

```bash
npm install pdfmake
npm install -D @types/pdfmake @fontsource/noto-sans-kr
```

- [ ] **Step 2: 폰트 생성 스크립트 작성**

`scripts/generate-pdf-fonts.mjs`:

```js
// Noto Sans KR(Regular/Bold) woff2를 base64로 인코딩해 pdfmake VFS 모듈로 저장한다.
// @fontsource/noto-sans-kr 버전을 올릴 때만 다시 실행하면 된다: node scripts/generate-pdf-fonts.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const rootDir = path.dirname(fileURLToPath(import.meta.url)) + '/..'
const fontsDir = path.join(rootDir, 'node_modules', '@fontsource', 'noto-sans-kr', 'files')
const outDir = path.join(rootDir, 'src', 'services', 'pdf')
const outFile = path.join(outDir, 'notoSansKrVfs.generated.ts')

// vfs 안에서 쓸 파일명 -> @fontsource 패키지 안의 실제 소스 파일명
const FILES = {
  'NotoSansKR-Regular.woff2': 'noto-sans-kr-korean-400-normal.woff2',
  'NotoSansKR-Bold.woff2': 'noto-sans-kr-korean-700-normal.woff2',
}

const entries = Object.entries(FILES).map(([vfsName, sourceName]) => {
  const bytes = readFileSync(path.join(fontsDir, sourceName))
  return [vfsName, bytes.toString('base64')]
})

const body = entries.map(([name, base64]) => `  '${name}': '${base64}',`).join('\n')
const output = `// 이 파일은 scripts/generate-pdf-fonts.mjs 로 생성된다. 직접 수정하지 말 것.
export const notoSansKrVfs: Record<string, string> = {
${body}
}
`

mkdirSync(outDir, { recursive: true })
writeFileSync(outFile, output)
console.log(`generated ${path.relative(rootDir, outFile)} (${entries.map(([n, b]) => `${n}: ${b.length} chars`).join(', ')})`)
```

- [ ] **Step 3: 스크립트 실행해 생성 파일 커밋 대상 만들기**

Run: `node scripts/generate-pdf-fonts.mjs`
Expected: `generated src/services/pdf/notoSansKrVfs.generated.ts (NotoSansKR-Regular.woff2: 722488 chars, NotoSansKR-Bold.woff2: 745592 chars)` 형태의 로그와 함께 파일이 생성됨 (base64 글자 수는 위와 정확히 일치해야 함 — `@fontsource/noto-sans-kr`가 5.3.0 기준으로 실측한 값).

- [ ] **Step 4: 타입체크로 생성 파일 검증**

Run: `npm run build`
Expected: 에러 없이 통과 (아직 `notoSansKrVfs`를 사용하는 코드가 없으므로 `noUnusedLocals` 등과 무관하게 통과해야 함).

- [ ] **Step 5: 커밋**

```bash
git add package.json package-lock.json scripts/generate-pdf-fonts.mjs src/services/pdf/notoSansKrVfs.generated.ts
git commit -m "build: pdfmake 도입 및 Noto Sans KR VFS 폰트 데이터 생성"
```

---

### Task 2: PDF 생성 서비스 모듈 작성

**Files:**
- Create: `src/services/pdf/reportPdf.ts`

**Interfaces:**
- Consumes: `notoSansKrVfs` (Task 1, `src/services/pdf/notoSansKrVfs.generated.ts`)
- Produces:
  - `export interface ReportPdfMeta { studentLine: string; periodLabel: string; periodValue: string; authorName: string; methodLabel: string }`
  - `export interface GenerateReportPdfInput { title: string; meta: ReportPdfMeta; doc: JSONContent; filename: string }`
  - `export function generateReportPdf(input: GenerateReportPdfInput): Promise<void>`
  - Task 3가 `await import('@/services/pdf/reportPdf')` 후 이 함수를 호출한다.

- [ ] **Step 1: 모듈 작성**

`src/services/pdf/reportPdf.ts`:

```ts
import type { JSONContent } from '@tiptap/core'
import { addFonts, addVirtualFileSystem, createPdf } from 'pdfmake/build/pdfmake'
import type { Column, Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import { notoSansKrVfs } from './notoSansKrVfs.generated'

const FONT_FAMILY = 'NotoSansKR'
// A4(595.28pt) 기준 좌우 여백 45pt(≈16mm)를 뺀 본문 폭 — 구분선(horizontalRule) 길이에 사용
const CONTENT_WIDTH = 505

let fontsRegistered = false

function ensureFontsRegistered() {
  if (fontsRegistered) return
  addVirtualFileSystem(notoSansKrVfs)
  // Noto Sans KR은 별도 이탤릭 웨이트가 없어 italics/bolditalics도 각각 Regular/Bold로 대체한다.
  addFonts({
    [FONT_FAMILY]: {
      normal: 'NotoSansKR-Regular.woff2',
      bold: 'NotoSansKR-Bold.woff2',
      italics: 'NotoSansKR-Regular.woff2',
      bolditalics: 'NotoSansKR-Bold.woff2',
    },
  })
  fontsRegistered = true
}

interface InlineStyle {
  bold?: boolean
  italics?: boolean
  decoration?: 'lineThrough'
  color?: string
}

// text/hardBreak 인라인 노드를 pdfmake의 인라인 텍스트 배열로 변환한다.
function pmInlineToPdfText(nodes: JSONContent[] | undefined): Content[] {
  if (!nodes || nodes.length === 0) return [{ text: '' }]
  return nodes.map((node): Content => {
    if (node.type === 'hardBreak') return { text: '\n' }
    const style: InlineStyle = {}
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') style.bold = true
      else if (mark.type === 'italic') style.italics = true
      else if (mark.type === 'strike') style.decoration = 'lineThrough'
      else if (mark.type === 'code') style.color = '#6b7280'
    }
    return { text: node.text ?? '', ...style }
  })
}

const HEADING_FONT_SIZE: Record<number, number> = { 1: 20, 2: 16, 3: 14 }

// 블록 레벨 ProseMirror 노드 하나를 pdfmake content 하나로 변환한다.
function pmBlockToPdfContent(node: JSONContent): Content {
  switch (node.type) {
    case 'paragraph':
      return { text: pmInlineToPdfText(node.content), margin: [0, 0, 0, 8] }
    case 'heading': {
      const level = (node.attrs?.level as number) ?? 1
      return {
        text: pmInlineToPdfText(node.content),
        fontSize: HEADING_FONT_SIZE[level] ?? 12,
        bold: true,
        margin: [0, level === 1 ? 14 : 10, 0, 6],
      }
    }
    case 'blockquote':
      return {
        stack: (node.content ?? []).map(pmBlockToPdfContent),
        margin: [10, 4, 0, 8],
        color: '#6b7280',
        italics: true,
      }
    case 'horizontalRule':
      return {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 1, lineColor: '#e5e8eb' }],
        margin: [0, 10, 0, 10],
      }
    case 'bulletList':
      return { ul: (node.content ?? []).map(pmListItemToPdfContent), margin: [0, 0, 0, 8] }
    case 'orderedList':
      return { ol: (node.content ?? []).map(pmListItemToPdfContent), margin: [0, 0, 0, 8] }
    case 'taskList':
      return { stack: (node.content ?? []).map(pmTaskItemToPdfContent), margin: [0, 0, 0, 8] }
    case 'codeBlock':
      return {
        text: (node.content ?? []).map((n) => n.text ?? '').join(''),
        color: '#6b7280',
        margin: [0, 4, 0, 8],
      }
    default:
      // 지원하지 않는 노드라도 텍스트만이라도 보존해 내용이 조용히 사라지지 않게 한다.
      return { text: node.text ?? '', margin: [0, 0, 0, 8] }
  }
}

function pmListItemToPdfContent(node: JSONContent): Content {
  const mapped = (node.content ?? []).map(pmBlockToPdfContent)
  return { stack: mapped.length > 0 ? mapped : [{ text: '' }], unbreakable: true }
}

// 체크박스는 폰트 글리프 대신 canvas 사각형(+체크 시 체크마크)으로 직접 그려 폰트 커버리지에 의존하지 않는다.
function pmTaskItemToPdfContent(node: JSONContent): Content {
  const checked = Boolean(node.attrs?.checked)
  const body = (node.content ?? []).map(pmBlockToPdfContent)
  const checkbox: Column = {
    canvas: [
      { type: 'rect', x: 0, y: 1, w: 9, h: 9, r: 2, lineWidth: 1, lineColor: '#9ca1ab' },
      ...(checked
        ? ([
            { type: 'line', x1: 1.5, y1: 5.5, x2: 4, y2: 8, lineWidth: 1.2, lineColor: '#3d6afe' },
            { type: 'line', x1: 4, y1: 8, x2: 8, y2: 2, lineWidth: 1.2, lineColor: '#3d6afe' },
          ] as const)
        : []),
    ],
    width: 12,
  }
  return {
    columnGap: 6,
    unbreakable: true,
    columns: [
      checkbox,
      {
        stack: body.length > 0 ? body : [{ text: '' }],
        color: checked ? '#9ca1ab' : undefined,
        decoration: checked ? 'lineThrough' : undefined,
      },
    ],
  }
}

export interface ReportPdfMeta {
  studentLine: string
  periodLabel: string
  periodValue: string
  authorName: string
  methodLabel: string
}

export interface GenerateReportPdfInput {
  title: string
  meta: ReportPdfMeta
  doc: JSONContent
  filename: string
}

// 파일시스템에 쓸 수 없는 문자를 제거해 다운로드 파일명으로 안전하게 만든다.
function sanitizeFilename(name: string): string {
  const cleaned = name.trim().replace(/[/\\:*?"<>|]/g, '').trim()
  return cleaned.length > 0 ? cleaned : '보고서'
}

export async function generateReportPdf(input: GenerateReportPdfInput): Promise<void> {
  ensureFontsRegistered()
  const body = (input.doc.content ?? []).map(pmBlockToPdfContent)
  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [45, 45, 45, 45],
    defaultStyle: { font: FONT_FAMILY, fontSize: 10.5, lineHeight: 1.4 },
    content: [
      { text: input.title, fontSize: 19, bold: true, margin: [0, 0, 0, 10] },
      { text: input.meta.studentLine, fontSize: 10.5, bold: true, margin: [0, 0, 0, 2] },
      {
        text: `${input.meta.periodLabel} ${input.meta.periodValue}   |   담당 컨설턴트 ${input.meta.authorName}   |   ${input.meta.methodLabel}`,
        fontSize: 9,
        color: '#6b7280',
        margin: [0, 0, 0, 14],
      },
      ...body,
    ],
  }
  await createPdf(docDefinition).download(`${sanitizeFilename(input.filename)}.pdf`)
}
```

- [ ] **Step 2: 타입체크**

Run: `npm run build`
Expected: 에러 없이 통과. (`pdfmake/build/pdfmake`·`pdfmake/interfaces` 서브패스 타입은 `@types/pdfmake` 0.3.x에 포함되어 있음을 별도 스캐폴딩 프로젝트에서 실측 검증함 — ambient 타입 선언 불필요.)

- [ ] **Step 3: 커밋**

```bash
git add src/services/pdf/reportPdf.ts
git commit -m "feat: ProseMirror 문서를 pdfmake 콘텐츠로 변환하는 PDF 생성 서비스 추가"
```

---

### Task 3: `ReportEditorModal`을 새 PDF 생성 함수로 연결

**Files:**
- Modify: `src/features/student-detail/ReportEditorModal.tsx:310-323` (handlePdf 교체)
- Modify: `src/features/student-detail/ReportEditorModal.tsx:385-392` (PDF 버튼 로딩 상태)
- Modify: `src/features/student-detail/ReportEditorModal.tsx:459-463` 부근 (에러 메시지 추가)

**Interfaces:**
- Consumes: `generateReportPdf`, `GenerateReportPdfInput` (Task 2, `@/services/pdf/reportPdf`)

- [ ] **Step 1: `handlePdf`를 동적 import 기반 비동기 함수로 교체**

`src/features/student-detail/ReportEditorModal.tsx:310-323`의 기존 코드:

```tsx
  // PDF 다운로드: 보고서 전용 인쇄 스타일(@media print)로 출력하고,
  // 파일명은 document.title을 통해 "{일자}_{학생명}_{보고서종류}"로 지정한다 (editReport.md §8)
  const handlePdf = () => {
    const base =
      draft?.kind === 'monthly'
        ? `${draft.targetMonth ? formatTargetMonth(draft.targetMonth) : ''}_${student.name}_월간보고서`
        : `${counselDate ? formatDate(counselDate) : formatDate(new Date())}_${student.name}_상담보고서`
    const prev = document.title
    document.title = base
    window.print()
    window.setTimeout(() => {
      document.title = prev
    }, 500)
  }
```

를 다음으로 교체:

```tsx
  // PDF 다운로드: pdfmake로 직접 벡터 PDF를 생성해 즉시 다운로드한다(브라우저 인쇄창을 거치지 않음).
  // 파일명은 보고서 제목 그대로 사용한다.
  const [pdfState, setPdfState] = useState<'idle' | 'generating' | 'error'>('idle')

  const handlePdf = async () => {
    if (!draft || pdfState === 'generating') return
    setPdfState('generating')
    try {
      const { generateReportPdf } = await import('@/services/pdf/reportPdf')
      await generateReportPdf({
        title,
        meta: {
          studentLine: `${student.name} · ${student.school} ${student.grade}`.trim(),
          periodLabel,
          periodValue,
          authorName,
          methodLabel: COUNSEL_REPORT_METHOD_LABEL[draft.method],
        },
        doc: editor?.getJSON() ?? { type: 'doc', content: [] },
        filename: title,
      })
      setPdfState('idle')
    } catch (error) {
      console.error(error)
      setPdfState('error')
    }
  }
```

(이 코드는 `periodLabel`/`periodValue`/`authorName`이 이미 계산되어 있는 지점, 즉 기존 `handlePdf` 정의와 같은 위치에 그대로 넣으면 된다 — `authorName`은 142행, `periodLabel`/`periodValue`는 269~277행에서 이미 선언되어 스코프 안에 있다.)

- [ ] **Step 2: PDF 버튼에 로딩 상태 반영**

`src/features/student-detail/ReportEditorModal.tsx:385-392`의 기존 코드:

```tsx
                  <button
                    onClick={handlePdf}
                    title="PDF 다운로드"
                    className="rounded-field p-1.5 text-fg-tertiary transition-colors hover:bg-sunken hover:text-fg"
                    aria-label="PDF 다운로드"
                  >
                    <DownloadIcon />
                  </button>
```

를 다음으로 교체:

```tsx
                  <button
                    onClick={() => void handlePdf()}
                    disabled={pdfState === 'generating'}
                    title="PDF 다운로드"
                    className="rounded-field p-1.5 text-fg-tertiary transition-colors hover:bg-sunken hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="PDF 다운로드"
                  >
                    {pdfState === 'generating' ? (
                      <span className="block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-fg" />
                    ) : (
                      <DownloadIcon />
                    )}
                  </button>
```

- [ ] **Step 3: PDF 생성 실패 시 에러 메시지 노출**

`src/features/student-detail/ReportEditorModal.tsx`의 기존 저장 에러 메시지 블록(459~463행) 바로 다음에 추가:

```tsx
                {saveMutation.isError && (
                  <p className="mt-3 rounded-field bg-danger-soft px-3 py-2 text-body text-danger">
                    저장에 실패했습니다. 다시 시도해 주세요.
                  </p>
                )}
                {pdfState === 'error' && (
                  <p className="mt-3 rounded-field bg-danger-soft px-3 py-2 text-body text-danger">
                    PDF 생성에 실패했습니다. 다시 시도해 주세요.
                  </p>
                )}
```

- [ ] **Step 4: 더 이상 쓰지 않는 import 정리**

`formatDate`/`formatTargetMonth`가 이 파일의 다른 곳(예: `periodValue` 계산, 269~277행)에서도 쓰이는지 확인한다. `formatDate`는 269~277행 `periodValue` 계산에서 계속 쓰이므로 import를 유지해야 한다. `formatTargetMonth`도 `periodValue`(272행)에서 계속 쓰인다. 즉 이번 변경으로 제거해야 할 import는 없다 — `handlePdf` 안에서만 쓰던 것이 아니라 파일 전역에서 공유되는 함수이기 때문이다. (이 스텝은 실제 삭제 작업이 아니라 확인 스텝이다. `npm run build`의 `noUnusedLocals`가 최종 확인 역할을 한다.)

- [ ] **Step 5: 타입체크**

Run: `npm run build`
Expected: 에러 없이 통과.

- [ ] **Step 6: 커밋**

```bash
git add src/features/student-detail/ReportEditorModal.tsx
git commit -m "feat: 상담·월간 보고서 PDF 다운로드를 window.print() 대신 pdfmake 생성으로 교체"
```

---

### Task 4: 더 이상 쓰지 않는 인쇄 CSS·클래스 정리

**Files:**
- Modify: `src/index.css:88-140` (삭제)
- Modify: `src/features/student-detail/ReportEditorModal.tsx:412` (`print-area` 클래스 제거)

**Interfaces:** 없음(정리 작업, 다른 태스크가 이 변경에 의존하지 않음)

- [ ] **Step 1: `src/index.css`에서 인쇄 전용 블록 삭제**

`src/index.css:88-140`(아래 전체 블록, `@page`부터 마지막 `}`까지)를 삭제한다:

```css
/* 보고서 PDF 다운로드: Report Modal의 문서(.print-area)만 A4 인쇄 스타일로 출력한다.
   화면 캡처가 아닌 인쇄 전용 레이아웃 — 헤더 버튼/블록 핸들/모달 배경·그림자는 제외된다. */
@page {
  size: A4;
  margin: 16mm;
}

@media print {
  body {
    background: #fff;
  }
  body:has(.print-area) * {
    visibility: hidden;
  }
  .print-area,
  .print-area * {
    visibility: visible;
  }
  /* 모달의 고정 높이·스크롤이 여러 페이지 출력을 잘라내지 않도록 해제 */
  .report-overlay {
    position: static !important;
    padding: 0 !important;
  }
  .report-panel {
    position: static !important;
    height: auto !important;
    max-height: none !important;
    box-shadow: none !important;
    transform: none !important;
  }
  .report-scroll {
    overflow: visible !important;
    height: auto !important;
    padding: 0 !important;
  }
  .print-area {
    position: absolute;
    inset: 0 auto auto 0;
    width: 100%;
  }
  /* 소제목이 다음 본문과 다른 페이지로 분리되지 않도록 하고, 목록 항목은 중간에서 자르지 않는다 */
  .print-area :is(h1, h2, h3) {
    break-after: avoid;
  }
  .print-area li {
    break-inside: avoid;
  }
  /* 체크리스트 완료·미완료 색상이 인쇄에도 유지되도록 한다 */
  .print-area input[type='checkbox'] {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
```

삭제 후 `body { ... }` 규칙(83~86행) 바로 다음 줄이 `/* 노션형 Markdown WYSIWYG 본문 스타일 ... */`(기존 142행) 주석으로 바로 이어져야 한다.

- [ ] **Step 2: `ReportEditorModal.tsx`에서 `print-area` 클래스명 제거**

`src/features/student-detail/ReportEditorModal.tsx:412`의:

```tsx
              <div className="print-area mx-auto max-w-2xl">
```

를:

```tsx
              <div className="mx-auto max-w-2xl">
```

로 교체. (더 이상 인쇄 CSS가 이 클래스를 참조하지 않으므로 이름만 있는 죽은 클래스를 남기지 않는다.)

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 통과.

- [ ] **Step 4: 커밋**

```bash
git add src/index.css src/features/student-detail/ReportEditorModal.tsx
git commit -m "chore: window.print() 제거에 따라 더 이상 쓰지 않는 인쇄 CSS·클래스 정리"
```

---

### Task 5: 브라우저에서 실제 동작 검증

**Files:** 없음(코드 변경 없음, 수동 검증만)

**Interfaces:** 없음

이 저장소는 테스트 러너가 없고, 실제 Supabase 백엔드에 연결된 상태에서만 보고서 CRUD가 동작한다(`.env.local`에 `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` 설정 필요 — 없으면 `SetupNotice`만 뜬다). 아래는 실제로 구성된 개발 환경에서 수행한다.

- [ ] **Step 1: 개발 서버 기동**

Run: `npm run dev`

- [ ] **Step 2: 상담보고서로 전 노드 타입 검증**

브라우저에서 학생 상세 → 상담보고서 탭 → 새 보고서(직접 작성)를 열고, 본문에 다음을 모두 포함해 작성한다: H1/H2/H3 제목, 순서 없는 목록, 순서 있는 목록, 체크리스트(완료 항목 1개 + 미완료 항목 1개 포함), 인용문(`>`), 구분선(`---`), **굵게**/*기울임* 텍스트. 저장 후 열람 모드에서 PDF 다운로드 버튼을 클릭한다.

Expected:
- 클릭 시 버튼에 스피너가 잠깐 표시된 후 인쇄 대화상자 없이 파일이 바로 다운로드된다.
- 다운로드된 파일명이 보고서 제목과 정확히 일치한다(`.pdf` 확장자 포함).
- PDF를 열어 한글이 깨지지 않고 표시되며, PDF 뷰어에서 텍스트를 드래그 선택/검색할 수 있다(이미지가 아닌 텍스트임을 확인).
- 체크리스트의 완료 항목은 체크된 사각형 + 취소선, 미완료 항목은 빈 사각형으로 보인다.
- 목록 항목이 페이지 경계에서 중간에 잘리지 않는다(내용이 길어 페이지가 넘어가는 경우).

- [ ] **Step 3: 월간보고서에서도 동일 동작 확인**

월간 보고서 탭에서도 보고서를 하나 만들어 PDF 다운로드를 실행하고, 파일명이 보고서 제목과 일치하는지, 메타 정보 줄(대상 기간/담당 컨설턴트/작성 방식)이 올바르게 보이는지 확인한다.

- [ ] **Step 4: 실패 경로 확인(선택)**

개발자 도구에서 일시적으로 네트워크를 차단하거나 `generateReportPdf`에 강제로 예외를 던지게 한 뒤 PDF 버튼을 눌러, 에러 메시지(`PDF 생성에 실패했습니다...`)가 노출되고 버튼이 다시 클릭 가능한 상태로 돌아오는지 확인한다. 확인 후 임시 변경은 되돌린다.
