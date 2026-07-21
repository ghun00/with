# 상담보고서 직접 작성 템플릿 — 소제목별 placeholder 설계

## 배경 / 문제

`ReportEditorModal.tsx`의 `COUNSEL_TEMPLATE_SECTIONS`(상담보고서 "직접 작성" 시 채워지는 기본 템플릿)는 현재 두 가지 문제가 있다.

1. `상담 목적`/`학생 현황`/`다음 상담 계획` 3개 섹션은 `content: ''`로, `sectionsToMarkdown()`이 빈 body를 버리기 때문에 실제 Markdown에는 소제목만 연달아 나오고 그 사이에 문단(paragraph) 노드가 전혀 생성되지 않는다. 즉 무엇을 적어야 할지 알려주는 안내가 전혀 없고, 클릭해서 바로 입력을 시작할 빈 공간조차 없다(Enter를 쳐야 문단이 생김).
2. `주요 논의`/`결정 사항`/`학생 To Do`/`컨설턴트 To Do` 4개 섹션은 `'- '` 또는 `'- [ ] '`가 미리 실제 텍스트로 채워져 있어, 안내가 아니라 "이미 입력된 것처럼 보이는 빈 마커"로 보인다.

목표: 7개 섹션 모두 진입 시 실제 마커(`-`, `[]`) 없이, 소제목마다 다른 안내 문구를 회색 placeholder로 보여준다. 사용자가 타이핑을 시작하면 placeholder는 사라지고, 목록/체크리스트가 필요하면 기존 Markdown 단축키(`-`, `[]`)를 직접 입력해서 만든다.

적용 범위는 **상담보고서 직접 작성(새 작성)** 한정이다. AI 생성 결과, 월간보고서, 이미 저장된(view 모드) 보고서는 대상이 아니다.

## 변경 사항

### 1. 템플릿 데이터 — 마커 제거

`ReportEditorModal.tsx`의 `COUNSEL_TEMPLATE_SECTIONS`에서 4개 섹션의 `'- '`/`'- [ ] '` 시드를 제거하고 7개 섹션 모두 `content: ''`로 통일한다.

```ts
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

`COUNSEL_TEMPLATE_MARKDOWN`(= `sectionsToMarkdown(COUNSEL_TEMPLATE_SECTIONS)`)은 그 결과로 7개 소제목만 연달아 있는 Markdown 문자열이 된다(빈 body는 계속 버려짐 — 의도된 동작, 저장 시에도 어차피 빈 섹션은 내용이 없는 게 맞으므로 문제 없음).

### 2. 소제목별 안내 문구 맵 (신규)

`ReportEditorModal.tsx`에 `COUNSEL_SECTION_PLACEHOLDERS: Record<string, string>` 상수를 추가한다. 마크다운 단축키 힌트는 넣지 않고 무엇을 적어야 하는지만 안내한다.

```ts
const COUNSEL_SECTION_PLACEHOLDERS: Record<string, string> = {
  '상담 목적': '이번 상담의 목적을 입력하세요.',
  '주요 논의': '상담에서 논의한 내용을 입력하세요.',
  '학생 현황': '학생의 현재 상황을 입력하세요.',
  '결정 사항': '상담을 통해 결정된 사항을 입력하세요.',
  '학생 To Do': '학생이 할 일을 입력하세요.',
  '컨설턴트 To Do': '컨설턴트가 할 일을 입력하세요.',
  '다음 상담 계획': '다음 상담 계획을 입력하세요.',
}
```

### 3. 헤딩 뒤 빈 문단 삽입 (새 헬퍼)

문제 1을 해결하기 위해, 신선한(저장 전) 상담보고서 직접 작성 초안을 로드한 직후에만 실행되는 헬퍼를 추가한다.

- 조건: `draft.kind === 'counsel' && draft.method === 'manual' && !draft.reportId`
- 동작: `editor.commands.setContent(draft.markdown, { emitUpdate: false })` 직후, ProseMirror 최상위 노드를 순회하며 `heading` 노드 뒤에 다른 블록(문단/리스트 등)이 바로 오지 않는 경우(다음이 또 다른 heading이거나 문서의 끝인 경우) 그 위치에 빈 `paragraph` 노드를 삽입한다.
- 삽입은 위치가 밀리지 않도록 뒤에서부터(역순으)로 처리한 뒤 단일 트랜잭션으로 `dispatch`한다.
- `emitUpdate`가 걸리지 않도록 다른 `setContent` 호출들과 동일하게 처리해 `dirty` 상태를 잘못 세우지 않는다.

결과적으로 이 문서에는 "## 소제목" 다음에 항상 빈 문단이 하나씩 존재하게 되고, 그 빈 문단이 placeholder를 표시할 자리가 된다.

### 4. Placeholder 확장 설정 변경

기존 (`ReportEditorModal.tsx:107`):
```ts
Placeholder.configure({ placeholder: 'Markdown 문법(#, -, 1., [], >, ---)으로 내용을 입력하세요.' }),
```

변경 후:
```ts
Placeholder.configure({
  showOnlyCurrent: false,
  placeholder: ({ editor, node, pos }) => {
    if (node.type.name === 'paragraph') {
      const headingName = findPrecedingHeadingText(editor.state.doc, pos)
      const custom = headingName && COUNSEL_SECTION_PLACEHOLDERS[headingName]
      if (custom) return custom
    }
    return 'Markdown 문법(#, -, 1., [], >, ---)으로 내용을 입력하세요.'
  },
}),
```

`findPrecedingHeadingText(doc, pos)`는 최상위 노드들을 앞에서부터 훑어 `pos` 바로 앞에 오는 `heading` 노드의 텍스트를 반환하는 작은 유틸(같은 파일 내 지역 함수로 충분).

**부수 효과 (사용자 승인됨):** `showOnlyCurrent: false`는 에디터 인스턴스 전체에 적용되는 설정이라, 상담보고서 직접 작성 템플릿 외의 다른 맥락(월간보고서, AI 초안 등)에서도 커서 위치와 무관하게 비어있는 모든 문단에 공통 안내 문구가 동시에 표시된다. 이는 기존보다 더 친절해지는 방향이라 회귀로 보지 않는다.

## 영향받지 않는 것

- AI 생성 상담보고서 초안 (`counselResultToSections`) — 섹션이 이미 실제 내용으로 채워지므로 이 로직의 대상이 아니고, 헬퍼 실행 조건(`method === 'manual'`)에도 걸리지 않는다.
- 월간보고서 — 애초에 "직접 작성" 템플릿이 없다(AI 생성 전용).
- 이미 저장된 보고서를 열람/재편집하는 경우 — `!draft.reportId` 조건으로 제외.

## 테스트 관점

이 저장소에는 별도 테스트 러너가 없으므로 (`npm run build`가 유일한 자동 검증) 수동으로 확인한다:
1. 학생 상세 → 상담보고서 탭 → "상담보고서 작성" 클릭.
2. 7개 소제목 아래 각각 다른 안내 문구가 회색으로 보이는지, 실제 `-`/`[]` 문자가 찍혀 있지 않은지 확인.
3. 아무 섹션이나 클릭해 타이핑하면 placeholder가 사라지고, `-` 또는 `[] `를 입력하면 기존처럼 리스트/체크리스트로 변환되는지 확인.
4. 저장 후 다시 열람(view) 모드로 봤을 때 빈 섹션이 예전처럼 헤딩만 있고 깨지지 않는지 확인.
5. AI 생성 상담보고서, 월간보고서 흐름에 회귀가 없는지 간단히 확인.
