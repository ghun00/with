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
import {
  createCounselReport,
  createMonthlyReport,
  formatTargetMonth,
  sectionsToMarkdown,
  updateCounselReport,
  updateMonthlyReport,
} from '@/services/aiReports'
import { useAuth } from '@/features/auth/AuthProvider'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import {
  COUNSEL_REPORT_METHOD_LABEL,
  type CounselReportMethod,
  type CounselReportSection,
  type Student,
} from '@/types'

// 상담보고서/월간 보고서가 공유하는 Report Modal 문서 (editReport.md §7)
export type ReportKind = 'counsel' | 'monthly'

// 모달에 들어오는 문서: 기존 보고서(reportId 있음) 또는 미저장 신규 초안.
// 본문은 Markdown 한 덩어리로 관리한다 (editReport.md 핵심 적용 방향).
export interface ReportEditorDraft {
  kind: ReportKind
  reportId?: string
  title: string
  method: CounselReportMethod
  counselDate?: string | null // 상담보고서 전용
  targetMonth?: string // 월간 보고서 전용 (YYYY-MM)
  authorName?: string
  markdown: string
  sourceText: string
}

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

// 신규 상담보고서 진입 시 에디터에 채우는 기본 Markdown
export const COUNSEL_TEMPLATE_MARKDOWN = sectionsToMarkdown(COUNSEL_TEMPLATE_SECTIONS)

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

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" strokeLinecap="round" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 4v11m0 0 4-4m-4 4-4-4M4 19h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// GPT Canvas형 문서 작업 공간: 상단 바(문서 조작만) + 본문 스크롤(제목·기본정보·Markdown 문서) + 열람/편집 상태.
// 저장된 보고서는 열람 상태로 열리고, 편집 버튼으로 노션형 Markdown WYSIWYG 편집에 진입한다 (editReport.md)
export function ReportEditorModal({
  draft,
  student,
  onClose,
}: {
  draft: ReportEditorDraft | null
  student: Student
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const [mode, setMode] = useState<'view' | 'edit'>('edit')
  const [savedId, setSavedId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [counselDate, setCounselDate] = useState<string>('')
  const [dirty, setDirty] = useState(false)
  const [copied, setCopied] = useState(false)
  const snapshotRef = useRef<{ title: string; counselDate: string; markdown: string } | null>(null)
  const copiedTimer = useRef<number>()

  const reportId = draft?.reportId ?? savedId
  const authorName = draft?.authorName ?? profile?.name ?? '-'

  // 빈 문단·소제목에서 안내 문구를 노출하되 저장 데이터에는 포함하지 않는다 (editReport.md §5)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: false }),
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
      Markdown.configure({ html: false, tightLists: true, transformPastedText: true }),
    ],
    content: '',
    editable: false,
    editorProps: { attributes: { class: 'tiptap' } },
    onUpdate: () => setDirty(true),
  })

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
    setPdfState('idle')
  }, [draft, editor])

  useEffect(() => {
    editor?.setEditable(mode === 'edit', false)
  }, [editor, mode])

  useEffect(() => () => window.clearTimeout(copiedTimer.current), [])

  // tiptap-markdown이 editor.storage에 주입하는 markdown 직렬화기 (Storage 타입에 미포함)
  const getMarkdown = () => {
    const storage = editor?.storage as { markdown?: { getMarkdown(): string } } | undefined
    return storage?.markdown?.getMarkdown() ?? ''
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error('no draft')
      const payload = { title: title.trim(), markdown: getMarkdown() }
      if (draft.kind === 'monthly') {
        if (reportId) {
          await updateMonthlyReport({ id: reportId, ...payload })
          return reportId
        }
        return createMonthlyReport({
          studentId: student.id,
          method: draft.method,
          targetMonth: draft.targetMonth ?? '',
          sourceText: draft.sourceText,
          ...payload,
        })
      }
      if (reportId) {
        await updateCounselReport({ id: reportId, counselDate: counselDate || null, ...payload })
        return reportId
      }
      return createCounselReport({
        studentId: student.id,
        method: draft.method,
        counselDate: counselDate || null,
        sourceText: draft.sourceText,
        ...payload,
      })
    },
    onSuccess: (id) => {
      setSavedId(id)
      const listKey = draft?.kind === 'monthly' ? 'monthlyReports' : 'counselReports'
      void queryClient.invalidateQueries({ queryKey: [listKey, student.id] })
      void queryClient.invalidateQueries({ queryKey: ['activities', student.id] })
      setDirty(false)
      // 저장 후에는 보고서 형태로 열람하는 상태로 전환한다
      setMode('view')
    },
  })

  const tryClose = () => {
    if (dirty && !window.confirm('저장하지 않은 변경 사항이 있습니다. 닫을까요?')) return
    onClose()
  }

  const startEditing = () => {
    snapshotRef.current = { title, counselDate, markdown: getMarkdown() }
    setMode('edit')
  }

  const cancelEditing = () => {
    if (snapshotRef.current) {
      setTitle(snapshotRef.current.title)
      setCounselDate(snapshotRef.current.counselDate)
      editor?.commands.setContent(snapshotRef.current.markdown, { emitUpdate: false })
    }
    setDirty(false)
    setMode('view')
  }

  useEffect(() => {
    if (!draft) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') tryClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const periodLabel = draft?.kind === 'monthly' ? '대상 기간' : '상담 일시'
  const periodValue =
    draft?.kind === 'monthly'
      ? draft.targetMonth
        ? formatTargetMonth(draft.targetMonth)
        : '-'
      : counselDate
        ? formatDate(counselDate)
        : '-'

  const metaText = () =>
    [
      `${student.name} · ${student.school} ${student.grade}`.trim(),
      `${periodLabel} ${periodValue}  |  담당 컨설턴트 ${authorName}  |  ${COUNSEL_REPORT_METHOD_LABEL[draft?.method ?? 'manual']}`,
    ].join('\n')

  // 복사: 서식 있는 텍스트(text/html)와 Markdown 원문(text/plain)을 함께 처리하고,
  // 미지원 환경에서는 일반 텍스트로 복사한다 (editReport.md §7)
  const handleCopy = async () => {
    const markdown = getMarkdown()
    const plain = `${title}\n${metaText()}\n\n${markdown}`
    const html = `<h1>${title}</h1><p>${metaText().replace(/\n/g, '<br>')}</p>${editor?.getHTML() ?? ''}`
    try {
      if (navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
          }),
        ])
      } else {
        await navigator.clipboard.writeText(plain)
      }
    } catch {
      await navigator.clipboard.writeText(plain)
    }
    setCopied(true)
    window.clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopied(false), 1500)
  }

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

  const editing = mode === 'edit'

  return (
    <AnimatePresence>
      {draft && (
        <div className="report-overlay fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-0">
          <motion.div
            className="absolute inset-0 bg-fg/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={tryClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title || '보고서'}
            className="report-panel relative flex h-[93vh] w-full max-w-3xl flex-col rounded-modal bg-surface shadow-float max-sm:h-dvh max-sm:max-w-none max-sm:rounded-none"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {/* 고정 상단 바: 문서 조작 기능만 우측 정렬 (editReport.md §1) */}
            <div className="flex shrink-0 items-center justify-end gap-2 border-b border-line px-5 py-3">
              {editing ? (
                <>
                  {dirty && (
                    <span className="mr-1 text-caption text-fg-tertiary max-sm:hidden">
                      저장되지 않은 변경 사항
                    </span>
                  )}
                  {reportId && (
                    <Button variant="secondary" size="sm" onClick={cancelEditing}>
                      취소
                    </Button>
                  )}
                  <Button
                    size="sm"
                    disabled={!title.trim() || saveMutation.isPending}
                    onClick={() => saveMutation.mutate()}
                  >
                    {saveMutation.isPending ? '저장 중...' : '저장'}
                  </Button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => void handleCopy()}
                    title={copied ? '복사됨' : '복사'}
                    className="rounded-field p-1.5 text-fg-tertiary transition-colors hover:bg-sunken hover:text-fg"
                    aria-label="복사"
                  >
                    {copied ? (
                      <span className="text-caption font-medium text-fg">복사됨</span>
                    ) : (
                      <CopyIcon />
                    )}
                  </button>
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
                  <Button variant="secondary" size="sm" onClick={startEditing}>
                    편집
                  </Button>
                </>
              )}
              <button
                onClick={tryClose}
                title="닫기"
                className="ml-1 rounded-field p-1 text-fg-tertiary transition-colors hover:bg-sunken hover:text-fg"
                aria-label="닫기"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* 본문 스크롤 영역 — 제목·기본정보·Markdown 문서가 하나의 문서로 이어진다 */}
            <div className="report-scroll flex-1 overflow-y-auto px-10 py-7 max-sm:px-5">
              <div className="mx-auto max-w-2xl">
                {/* 보고서 제목 — 본문 최상위 H1 (editReport.md §2) */}
                {editing ? (
                  <input
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value)
                      setDirty(true)
                    }}
                    placeholder="보고서 제목"
                    className="mb-3 w-full bg-transparent text-[26px] leading-tight font-bold text-fg outline-none placeholder:text-fg-disabled"
                  />
                ) : (
                  <h1 className="mb-3 text-[26px] leading-tight font-bold text-fg">{title}</h1>
                )}

                {/* 보고서 기본정보 — 제목 하단 보조 정보, 구분선으로 콘텐츠와 분리 (editReport.md §2) */}
                <div className="border-b border-line/60 pb-4">
                  <p className="text-[15px] font-medium text-fg">
                    {student.name} · {student.school} {student.grade}
                  </p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-fg-secondary">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-fg-tertiary">{periodLabel}</span>
                      {editing && draft.kind === 'counsel' ? (
                        <input
                          type="date"
                          value={counselDate}
                          onChange={(e) => {
                            setCounselDate(e.target.value)
                            setDirty(true)
                          }}
                          className="rounded-field border border-line bg-surface px-2 py-0.5 text-[13px] text-fg-secondary transition-colors hover:border-line-strong focus:border-accent-500 focus:outline-none"
                        />
                      ) : (
                        <span>{periodValue}</span>
                      )}
                    </span>
                    <span className="text-line-strong">|</span>
                    <span>
                      <span className="text-fg-tertiary">담당 컨설턴트</span> {authorName}
                    </span>
                    <span className="text-line-strong">|</span>
                    <span>{COUNSEL_REPORT_METHOD_LABEL[draft.method]}</span>
                  </p>
                </div>

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

                {/* 노션형 Markdown WYSIWYG 본문 — 열람/편집 모두 변환된 결과를 표시 (editReport.md §3·§4) */}
                <EditorContent editor={editor} className="report-doc mt-5" />
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
