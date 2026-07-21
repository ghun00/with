# 상담보고서 직접 작성 템플릿 Placeholder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상담보고서 "직접 작성" 새 템플릿의 7개 소제목 아래에 실제 `-`/`[]` 마커 없이 소제목별 안내 placeholder 문구를 보여준다.

**Architecture:** `ReportEditorModal.tsx`의 `COUNSEL_TEMPLATE_SECTIONS`를 전부 빈 content로 바꾸고, `sectionsToMarkdown()`이 빈 body를 버려 heading이 연달아 붙는 문제를 새 초안 로드 직후 빈 문단(paragraph) 삽입 헬퍼로 보완한다. Tiptap `Placeholder` 확장을 함수형으로 바꿔 문단 바로 앞의 heading 텍스트를 찾아 섹션별 문구를 반환하고, 매칭되지 않는 경우(월간보고서/AI 동적 소제목 등)는 기존 공통 문구로 폴백한다.

**Tech Stack:** React + TypeScript, Tiptap/ProseMirror (`@tiptap/react`, `@tiptap/pm`, `@tiptap/extension-placeholder`), `tiptap-markdown`.

## Global Constraints

- UI 문구는 한국어. 마크다운 단축키 힌트(`-`, `[]` 안내)는 넣지 않는다 — 섹션 내용 안내만.
- 적용 범위는 **상담보고서 직접 작성 새 작성**(`draft.kind === 'counsel' && draft.method === 'manual' && !draft.reportId`)뿐. AI 생성 초안, 월간보고서, 이미 저장된 보고서 열람/재편집은 이번 변경의 대상이 아니다(단, `Placeholder`의 `showOnlyCurrent: false` 전역 설정 변경은 그 외 맥락에도 공통 문구가 커서 위치와 무관하게 보이게 만드는 의도된 부수 효과 — 사용자 승인됨).
- 이 저장소에는 테스트 러너가 없다. `npm run build`(tsc -b && vite build)가 유일한 자동 검증이며, 기능 검증은 `npm run dev` + 브라우저 수동 확인으로 한다.
- 참고 설계 문서: `docs/superpowers/specs/2026-07-21-counsel-report-template-placeholder-design.md`.

---

### Task 1: 소제목별 placeholder 구현

**Files:**
- Modify: `src/features/student-detail/ReportEditorModal.tsx:1-114`

**Interfaces:**
- Consumes: 기존 `CounselReportSection`(`@/types`), `sectionsToMarkdown`(`@/services/aiReports`), `ReportEditorDraft`(같은 파일에 정의됨, 필드: `kind: 'counsel'|'monthly'`, `method: CounselReportMethod`, `reportId?: string`).
- Produces: `COUNSEL_TEMPLATE_SECTIONS`/`COUNSEL_TEMPLATE_MARKDOWN`(기존 export 유지, 값만 변경) — 다른 파일(`CounselReportTab.tsx`)이 `COUNSEL_TEMPLATE_MARKDOWN`을 그대로 import해 쓰므로 export 이름/타입은 바뀌지 않는다.

- [ ] **Step 1: import 추가 — `Editor` 타입과 ProseMirror `Node` 타입**

`src/features/student-detail/ReportEditorModal.tsx` 최상단 import 블록을 아래와 같이 바꾼다(기존 4번째 줄 `EditorContent, useEditor` import 다음에 두 줄 추가):

```ts
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
```

- [ ] **Step 2: 템플릿 섹션에서 `-`/`- [ ] ` 마커 제거**

기존(46-54번째 줄):
```ts
export const COUNSEL_TEMPLATE_SECTIONS: CounselReportSection[] = [
  { name: '상담 목적', content: '' },
  { name: '주요 논의', content: '- ' },
  { name: '학생 현황', content: '' },
  { name: '결정 사항', content: '- ' },
  { name: '학생 To Do', content: '- [ ] ' },
  { name: '컨설턴트 To Do', content: '- [ ] ' },
  { name: '다음 상담 계획', content: '' },
]
```

다음으로 교체:
```ts
// 상담보고서 직접 작성 기본 템플릿 — 실제 마커 대신 소제목별 placeholder만 보인다 (editReport.md §5)
export const COUNSEL_TEMPLATE_SECTIONS: CounselReportSection[] = [
  { name: '상담 목적', content: '' },
  { name: '주요 논의', content: '' },
  { name: '학생 현황', content: '' },
  { name: '결정 사항', content: '' },
  { name: '학생 To Do', content: '' },
  { name: '컨설턴트 To Do', content: '' },
  { name: '다음 상담 계획', content: '' },
]
```

- [ ] **Step 3: placeholder 맵과 heading 탐색/문단 삽입 헬퍼 추가**

`export const COUNSEL_TEMPLATE_MARKDOWN = sectionsToMarkdown(COUNSEL_TEMPLATE_SECTIONS)` 줄(57번째) 바로 다음에 추가:

```ts
// 상담보고서 직접 작성 템플릿의 소제목별 placeholder 안내 문구 (마크다운 단축키 힌트는 포함하지 않음)
const COUNSEL_SECTION_PLACEHOLDERS: Record<string, string> = {
  '상담 목적': '이번 상담의 목적을 입력하세요.',
  '주요 논의': '상담에서 논의한 내용을 입력하세요.',
  '학생 현황': '학생의 현재 상황을 입력하세요.',
  '결정 사항': '상담을 통해 결정된 사항을 입력하세요.',
  '학생 To Do': '학생이 할 일을 입력하세요.',
  '컨설턴트 To Do': '컨설턴트가 할 일을 입력하세요.',
  '다음 상담 계획': '다음 상담 계획을 입력하세요.',
}

const GENERIC_PLACEHOLDER = 'Markdown 문법(#, -, 1., [], >, ---)으로 내용을 입력하세요.'

// pos 바로 앞(문서상 이전)에 오는 최상위 heading 노드의 텍스트를 찾는다 — 없으면 null.
function findPrecedingHeadingText(doc: ProseMirrorNode, pos: number): string | null {
  let headingText: string | null = null
  doc.forEach((node, offset) => {
    if (offset >= pos) return
    if (node.type.name === 'heading') headingText = node.textContent
  })
  return headingText
}

// 최상위 heading 뒤에 문단이 없는 경우(다음이 또 다른 heading이거나 문서 끝) 빈 문단을 삽입해
// placeholder가 보일 자리를 만든다. sectionsToMarkdown()이 빈 body를 버려 heading끼리 붙기 때문.
function insertEmptyBodiesAfterHeadings(editor: Editor) {
  const positions: number[] = []
  let pendingHeadingEnd: number | null = null
  editor.state.doc.forEach((node, offset) => {
    const isHeading = node.type.name === 'heading'
    if (pendingHeadingEnd !== null && isHeading) positions.push(pendingHeadingEnd)
    pendingHeadingEnd = isHeading ? offset + node.nodeSize : null
  })
  if (pendingHeadingEnd !== null) positions.push(pendingHeadingEnd)

  // 뒤에서부터 삽입해야 앞쪽 위치가 밀리지 않는다
  ;[...positions].reverse().forEach((pos) => {
    editor.chain().insertContentAt(pos, { type: 'paragraph' }).run()
  })
}
```

- [ ] **Step 4: `Placeholder.configure(...)`를 함수형 placeholder로 교체**

기존(107번째 줄):
```ts
      Placeholder.configure({ placeholder: 'Markdown 문법(#, -, 1., [], >, ---)으로 내용을 입력하세요.' }),
```

다음으로 교체:
```ts
      Placeholder.configure({
        showOnlyCurrent: false,
        placeholder: ({ editor, node, pos }) => {
          if (node.type.name === 'paragraph') {
            const headingText = findPrecedingHeadingText(editor.state.doc, pos)
            const custom = headingText ? COUNSEL_SECTION_PLACEHOLDERS[headingText] : undefined
            if (custom) return custom
          }
          return GENERIC_PLACEHOLDER
        },
      }),
```

- [ ] **Step 5: 새 상담보고서 직접 작성 초안 로드 시 빈 문단 삽입 호출**

기존 `useEffect`(116-129번째 줄):
```ts
  useEffect(() => {
    if (!draft || !editor) return
    setTitle(draft.title)
    setCounselDate(draft.counselDate ?? '')
    // setContent/setEditable 모두 emitUpdate 기본값이 true(Tiptap 3)라 명시적으로 꺼야 onUpdate가 dirty를 잘못 세우지 않는다
    editor.commands.setContent(draft.markdown, { emitUpdate: false })
    // 신규 초안(직접 작성/AI 생성)은 저장 전이므로 편집 상태로 연다 (닫기 확인은 실제 변경 시에만 표시)
    const startEdit = !draft.reportId
    setMode(startEdit ? 'edit' : 'view')
    editor.setEditable(startEdit, false)
    setSavedId(null)
    setDirty(false)
    setCopied(false)
  }, [draft, editor])
```

다음으로 교체(추가된 두 줄만 새로 들어감, `setDirty(false)`가 뒤에 있어 이 삽입으로 인한 `onUpdate`의 `setDirty(true)`는 같은 렌더 사이클에서 덮어써진다):
```ts
  useEffect(() => {
    if (!draft || !editor) return
    setTitle(draft.title)
    setCounselDate(draft.counselDate ?? '')
    // setContent/setEditable 모두 emitUpdate 기본값이 true(Tiptap 3)라 명시적으로 꺼야 onUpdate가 dirty를 잘못 세우지 않는다
    editor.commands.setContent(draft.markdown, { emitUpdate: false })
    // 상담보고서 직접 작성 새 초안만: heading끼리 붙어 있는 자리에 placeholder용 빈 문단을 만든다
    if (draft.kind === 'counsel' && draft.method === 'manual' && !draft.reportId) {
      insertEmptyBodiesAfterHeadings(editor)
    }
    // 신규 초안(직접 작성/AI 생성)은 저장 전이므로 편집 상태로 연다 (닫기 확인은 실제 변경 시에만 표시)
    const startEdit = !draft.reportId
    setMode(startEdit ? 'edit' : 'view')
    editor.setEditable(startEdit, false)
    setSavedId(null)
    setDirty(false)
    setCopied(false)
  }, [draft, editor])
```

- [ ] **Step 6: 타입 체크**

Run: `npm run build`
Expected: 에러 없이 빌드 성공 (이 저장소는 `tsc -b && vite build`가 유일한 자동 검증).

- [ ] **Step 7: 수동 기능 확인 (테스트 러너가 없으므로 브라우저로 직접 확인)**

Run: `npm run dev` 후 브라우저에서:
1. 학생 상세 → 상담보고서 탭 → "상담보고서 작성" 클릭.
2. 7개 소제목(상담 목적/주요 논의/학생 현황/결정 사항/학생 To Do/컨설턴트 To Do/다음 상담 계획) 아래 각각 다른 회색 안내 문구가 보이는지 확인. 실제 `-`나 `[]` 문자가 찍혀 있지 않아야 한다.
3. 아무 섹션이나 클릭 후 타이핑하면 그 섹션의 placeholder만 사라지는지 확인.
4. `주요 논의`/`결정 사항` 섹션에서 `- `를 입력하면 여전히 불릿 목록으로 바뀌는지, `학생 To Do`/`컨설턴트 To Do`에서 `[] `를 입력하면 체크리스트로 바뀌는지 확인(마크다운 단축키 자체는 안 건드렸으므로 회귀 없어야 함).
5. 저장 후 다시 열람(view) 모드로 열었을 때 빈 섹션이 깨지지 않고 헤딩만 정상적으로 보이는지 확인.
6. AI로 상담보고서를 생성한 결과 초안, 그리고 월간보고서 "AI로 생성" 흐름을 열어 placeholder 문구가 여전히 기존 공통 문구(또는 이미 채워진 내용)로 정상 동작하는지 간단히 확인 — 이번 변경이 그 경로에 영향을 주면 안 된다.

Expected: 위 6가지 모두 기대대로 동작.

- [ ] **Step 8: 커밋**

```bash
git add src/features/student-detail/ReportEditorModal.tsx
git commit -m "feat(ai): 상담보고서 직접 작성 템플릿에 소제목별 placeholder 추가"
```
