import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createCounselReport,
  createMonthlyReport,
  formatTargetMonth,
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

// 상담보고서/월간 보고서가 공유하는 Report Modal 문서 (editReport.md 4차 §7)
export type ReportKind = 'counsel' | 'monthly'

// 모달에 들어오는 문서: 기존 보고서(reportId 있음) 또는 미저장 신규 초안
export interface ReportEditorDraft {
  kind: ReportKind
  reportId?: string
  title: string
  method: CounselReportMethod
  counselDate?: string | null // 상담보고서 전용
  targetMonth?: string // 월간 보고서 전용 (YYYY-MM)
  authorName?: string
  sections: CounselReportSection[]
  sourceText: string
}

// 상담보고서 직접 작성 기본 템플릿 — 섹션별 기본 형식 포함 (editReport.md 3차 §3·§4)
export const COUNSEL_TEMPLATE_SECTIONS: CounselReportSection[] = [
  { name: '상담 목적', content: '' },
  { name: '주요 논의', content: '- ' },
  { name: '학생 현황', content: '' },
  { name: '결정 사항', content: '- ' },
  { name: '학생 To Do', content: '- [ ] ' },
  { name: '컨설턴트 To Do', content: '- [ ] ' },
  { name: '다음 상담 계획', content: '' },
]

const SECTION_PLACEHOLDER: Record<string, string> = {
  '상담 목적': '이번 상담의 목적을 입력해주세요.',
  '주요 논의': '학생과 논의한 주요 내용을 입력해주세요.',
  '학생 현황': '현재 활동 및 준비 상황을 입력해주세요.',
  '결정 사항': '상담을 통해 결정된 내용을 입력해주세요.',
  '학생 To Do': '학생이 수행해야 할 항목을 입력해주세요.',
  '컨설턴트 To Do': '컨설턴트가 수행해야 할 항목을 입력해주세요.',
  '다음 상담 계획': '다음 상담 일정과 확인할 내용을 입력해주세요.',
}

// 단일 문서형 에디터의 블록: 소제목 / 본문 문단 / 글머리 기호 / 체크리스트
type BlockType = 'heading' | 'text' | 'bullet' | 'check'

interface Block {
  key: string
  type: BlockType
  text: string
  checked?: boolean
}

const BLOCK_TYPE_LABEL: Record<BlockType, string> = {
  text: '본문',
  heading: '소제목',
  bullet: '글머리 기호',
  check: '체크리스트',
}

function newBlock(type: BlockType, text = '', checked = false): Block {
  return { key: crypto.randomUUID(), type, text, checked }
}

// 섹션 content의 라인 마커('- ', '- [ ] ')를 블록으로 해석한다
function contentToBlocks(content: string): Block[] {
  const blocks: Block[] = []
  let textBuf: string[] = []
  const flush = () => {
    if (textBuf.length) {
      blocks.push(newBlock('text', textBuf.join('\n')))
      textBuf = []
    }
  }
  for (const line of content.split('\n')) {
    const check = line.match(/^- \[([ xX])\] ?(.*)$/)
    if (check) {
      flush()
      blocks.push(newBlock('check', check[2], check[1] !== ' '))
      continue
    }
    const bullet = line.match(/^- (.*)$/)
    if (bullet) {
      flush()
      blocks.push(newBlock('bullet', bullet[1]))
      continue
    }
    textBuf.push(line)
  }
  flush()
  return blocks
}

function sectionsToBlocks(sections: CounselReportSection[]): Block[] {
  const blocks: Block[] = []
  for (const s of sections) {
    if (s.name) blocks.push(newBlock('heading', s.name))
    blocks.push(...contentToBlocks(s.content))
  }
  if (blocks.length === 0) blocks.push(newBlock('text'))
  return blocks
}

function blockToLines(b: Block): string[] {
  if (b.type === 'bullet') return b.text.trim() ? [`- ${b.text}`] : []
  if (b.type === 'check') return b.text.trim() ? [`- [${b.checked ? 'x' : ' '}] ${b.text}`] : []
  return b.text.split('\n')
}

function blocksToSections(blocks: Block[]): CounselReportSection[] {
  const sections: { name: string; lines: string[] }[] = []
  let current: { name: string; lines: string[] } | null = null
  for (const b of blocks) {
    if (b.type === 'heading') {
      if (current) sections.push(current)
      current = { name: b.text.trim(), lines: [] }
    } else {
      if (!current) current = { name: '', lines: [] }
      current.lines.push(...blockToLines(b))
    }
  }
  if (current) sections.push(current)
  return sections
    .map((s) => ({ name: s.name, content: s.lines.join('\n').replace(/\n+$/, '') }))
    .filter((s) => s.name || s.content.trim())
}

// 블록 위쪽에서 가장 가까운 소제목 기준으로 입력 목적에 맞는 placeholder를 고른다
function placeholderFor(blocks: Block[], index: number): string {
  for (let i = index - 1; i >= 0; i--) {
    if (blocks[i].type === 'heading') {
      return SECTION_PLACEHOLDER[blocks[i].text.trim()] ?? '내용을 입력하세요.'
    }
  }
  return '내용을 입력하세요.'
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

function HandleIcon() {
  return (
    <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
      {[2, 7, 12].map((cy) => (
        <g key={cy}>
          <circle cx="3.5" cy={cy} r="1.3" />
          <circle cx="8.5" cy={cy} r="1.3" />
        </g>
      ))}
    </svg>
  )
}

// GPT Canvas형 문서 작업 공간: 고정 헤더(제목+기능) + 본문 스크롤 + 열람/편집 상태.
// 저장된 보고서는 열람 상태로 열리고, 편집 버튼으로 수정 상태에 진입한다 (editReport.md 4차)
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
  const [blocks, setBlocks] = useState<Block[]>([])
  const [dirty, setDirty] = useState(false)
  const [copied, setCopied] = useState(false)
  const [menuKey, setMenuKey] = useState<string | null>(null)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const blockRefs = useRef(new Map<string, HTMLTextAreaElement | HTMLInputElement>())
  const snapshotRef = useRef<{ title: string; counselDate: string; blocks: Block[] } | null>(null)
  const copiedTimer = useRef<number>()

  const reportId = draft?.reportId ?? savedId
  const authorName = draft?.authorName ?? profile?.name ?? '-'

  useEffect(() => {
    if (!draft) return
    setTitle(draft.title)
    setCounselDate(draft.counselDate ?? '')
    setBlocks(sectionsToBlocks(draft.sections))
    setMode(draft.reportId ? 'view' : 'edit')
    setSavedId(null)
    // 신규 초안(직접 작성/AI 생성)은 아직 저장 전이므로 닫기 시 확인이 필요하다
    setDirty(!draft.reportId)
    setCopied(false)
    setMenuKey(null)
    setFocusKey(null)
  }, [draft])

  useEffect(() => () => window.clearTimeout(copiedTimer.current), [])

  // 블록 추가/전환 직후 해당 블록으로 포커스 이동
  useEffect(() => {
    if (!focusKey) return
    const el = blockRefs.current.get(focusKey)
    if (el) {
      el.focus()
      const len = el.value.length
      el.setSelectionRange(len, len)
    }
    setFocusKey(null)
  }, [focusKey, blocks])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error('no draft')
      const payload = { title: title.trim(), sections: blocksToSections(blocks) }
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
    snapshotRef.current = { title, counselDate, blocks }
    setMode('edit')
  }

  const cancelEditing = () => {
    if (snapshotRef.current) {
      setTitle(snapshotRef.current.title)
      setCounselDate(snapshotRef.current.counselDate)
      setBlocks(snapshotRef.current.blocks)
    }
    setDirty(false)
    setMenuKey(null)
    setMode('view')
  }

  useEffect(() => {
    if (!draft) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (menuKey) setMenuKey(null)
        else tryClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const touch = () => setDirty(true)

  const updateBlock = (key: string, patch: Partial<Block>) => {
    setBlocks((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)))
    touch()
  }

  const insertBlockAfter = (index: number, type: BlockType) => {
    const block = newBlock(type)
    setBlocks((prev) => {
      const next = [...prev]
      next.splice(index + 1, 0, block)
      return next
    })
    setFocusKey(block.key)
    touch()
  }

  const removeBlock = (index: number) => {
    setBlocks((prev) => (prev.length <= 1 ? [newBlock('text')] : prev.filter((_, i) => i !== index)))
    setMenuKey(null)
    touch()
  }

  const moveBlock = (index: number, dir: -1 | 1) => {
    setBlocks((prev) => {
      const target = index + dir
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    touch()
  }

  // 형식 변경: 여러 줄 본문을 목록형으로 바꾸면 줄 단위 항목으로 분할한다
  const convertBlock = (index: number, type: BlockType) => {
    setBlocks((prev) => {
      const block = prev[index]
      if (!block || block.type === type) return prev
      const next = [...prev]
      if (type === 'heading') {
        next[index] = { ...block, type, text: block.text.replace(/\n/g, ' ') }
      } else if ((type === 'bullet' || type === 'check') && block.text.includes('\n')) {
        const items = block.text.split('\n').map((line) => newBlock(type, line))
        next.splice(index, 1, ...items)
      } else {
        next[index] = { ...block, type }
      }
      return next
    })
    setMenuKey(null)
    touch()
  }

  const handleListKeyDown = (index: number, block: Block) => (e: React.KeyboardEvent) => {
    // 한글 등 IME 조합 중 Enter로 글자를 확정하면 브라우저가 keydown(Enter)을
    // 조합 확정용과 실제 입력용으로 두 번 보낼 수 있다 — 조합 중에는 무시한다.
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') {
      e.preventDefault()
      // 빈 항목에서 Enter: 목록을 끝내고 일반 문단으로 전환
      if (!block.text.trim()) convertBlock(index, 'text')
      else insertBlockAfter(index, block.type)
    }
    if (e.key === 'Backspace' && block.text === '' && blocks.length > 1) {
      e.preventDefault()
      const prevKey = blocks[index - 1]?.key
      removeBlock(index)
      if (prevKey) setFocusKey(prevKey)
    }
  }

  // 문단 높이를 내용에 맞게 자동 조절 (wrap된 긴 줄도 잘리지 않도록 scrollHeight 기준)
  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  const setBlockRef = (key: string) => (el: HTMLTextAreaElement | HTMLInputElement | null) => {
    if (el) {
      blockRefs.current.set(key, el)
      if (el instanceof HTMLTextAreaElement) autoResize(el)
    } else {
      blockRefs.current.delete(key)
    }
  }

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

  const bodyPlainText = () =>
    blocks
      .map((b) => {
        if (b.type === 'heading') return `\n■ ${b.text}`
        if (b.type === 'bullet') return `• ${b.text}`
        if (b.type === 'check') return `${b.checked ? '☑' : '☐'} ${b.text}`
        return b.text
      })
      .join('\n')

  const handleCopy = async () => {
    await navigator.clipboard.writeText(`${title}\n${metaText()}\n${bodyPlainText()}`)
    setCopied(true)
    window.clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopied(false), 1500)
  }

  // PDF 다운로드: 보고서 전용 인쇄 스타일(@media print)로 출력하고,
  // 파일명은 document.title을 통해 "{일자}_{학생명}_{보고서종류}"로 지정한다
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

  const editing = mode === 'edit'
  const headingClass = (index: number) =>
    `${index === 0 ? '' : 'mt-8'} mb-1 w-full text-[19px] font-semibold text-fg`

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
            {/* 고정 헤더: 제목(좌) + 기능(우)을 한 행에 통합 (editReport.md 4차 §1·§2) */}
            <div className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3">
              {editing ? (
                <input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value)
                    touch()
                  }}
                  placeholder="보고서 제목"
                  className="min-w-0 flex-1 bg-transparent text-heading text-fg outline-none placeholder:text-fg-disabled"
                />
              ) : (
                <h2 className="min-w-0 flex-1 truncate text-heading text-fg">{title}</h2>
              )}
              <div className="flex shrink-0 items-center gap-2">
                {editing ? (
                  <>
                    {dirty && (
                      <span className="text-caption text-fg-tertiary max-sm:hidden">
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
                      onClick={handlePdf}
                      title="PDF 다운로드"
                      className="rounded-field p-1.5 text-fg-tertiary transition-colors hover:bg-sunken hover:text-fg"
                      aria-label="PDF 다운로드"
                    >
                      <DownloadIcon />
                    </button>
                    <Button variant="secondary" size="sm" onClick={startEditing}>
                      편집
                    </Button>
                  </>
                )}
                <button
                  onClick={tryClose}
                  className="ml-1 rounded-field p-1 text-fg-tertiary transition-colors hover:bg-sunken hover:text-fg"
                  aria-label="닫기"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            {/* 본문 스크롤 영역 — 제목이 헤더로 이동해 기본정보부터 시작 */}
            <div className="report-scroll flex-1 overflow-y-auto px-10 py-7 max-sm:px-5">
              <div className="print-area mx-auto max-w-2xl">
                {/* 인쇄 전용 제목 (화면에서는 헤더에 표시) */}
                <h1 className="mb-4 hidden text-[24px] leading-8 font-bold text-fg print:block">
                  {title}
                </h1>

                {/* 보고서 기본정보 — 최대 두 줄 (editReport.md 4차 §3) */}
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
                            touch()
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

                <div className="mt-4">
                  {blocks.map((block, index) => (
                    <div key={block.key} className="group relative">
                      {editing && (
                        <>
                          {/* 블록 핸들: hover/선택 시에만 노출 */}
                          <button
                            onClick={() => setMenuKey(menuKey === block.key ? null : block.key)}
                            className={`absolute top-1 -left-7 rounded-field p-0.5 text-fg-tertiary transition-opacity hover:bg-sunken hover:text-fg ${menuKey === block.key ? 'opacity-100' : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'}`}
                            aria-label="블록 메뉴"
                          >
                            <HandleIcon />
                          </button>
                          {menuKey === block.key && (
                            <>
                              <div className="fixed inset-0 z-20" onClick={() => setMenuKey(null)} />
                              <div className="absolute top-6 -left-7 z-30 w-36 rounded-card border border-line bg-surface py-1 shadow-float">
                                {(Object.keys(BLOCK_TYPE_LABEL) as BlockType[]).map((type) => (
                                  <button
                                    key={type}
                                    onClick={() => convertBlock(index, type)}
                                    className={`block w-full px-3 py-1.5 text-left text-label transition-colors hover:bg-sunken ${block.type === type ? 'font-semibold text-fg' : 'text-fg-secondary'}`}
                                  >
                                    {BLOCK_TYPE_LABEL[type]}
                                  </button>
                                ))}
                                <div className="my-1 border-t border-line/60" />
                                <button
                                  onClick={() => {
                                    moveBlock(index, -1)
                                    setMenuKey(null)
                                  }}
                                  disabled={index === 0}
                                  className="block w-full px-3 py-1.5 text-left text-label text-fg-secondary transition-colors hover:bg-sunken disabled:opacity-30"
                                >
                                  위로 이동
                                </button>
                                <button
                                  onClick={() => {
                                    moveBlock(index, 1)
                                    setMenuKey(null)
                                  }}
                                  disabled={index === blocks.length - 1}
                                  className="block w-full px-3 py-1.5 text-left text-label text-fg-secondary transition-colors hover:bg-sunken disabled:opacity-30"
                                >
                                  아래로 이동
                                </button>
                                <button
                                  onClick={() => removeBlock(index)}
                                  className="block w-full px-3 py-1.5 text-left text-label text-danger transition-colors hover:bg-danger-soft"
                                >
                                  삭제
                                </button>
                              </div>
                            </>
                          )}
                        </>
                      )}

                      {block.type === 'heading' &&
                        (editing ? (
                          <input
                            ref={setBlockRef(block.key)}
                            value={block.text}
                            onChange={(e) => updateBlock(block.key, { text: e.target.value })}
                            onKeyDown={(e) => {
                              // IME 조합 확정 Enter는 무시 (한글 입력 시 이중 실행 방지)
                              if (e.nativeEvent.isComposing) return
                              // Enter: 소제목 아래에 새 문단을 만들고 바로 본문 작성
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                insertBlockAfter(index, 'text')
                              }
                            }}
                            placeholder="소제목"
                            className={`${headingClass(index)} bg-transparent outline-none placeholder:text-fg-disabled`}
                          />
                        ) : (
                          <h3 className={headingClass(index)}>{block.text}</h3>
                        ))}

                      {block.type === 'text' &&
                        (editing ? (
                          <textarea
                            ref={setBlockRef(block.key)}
                            value={block.text}
                            onChange={(e) => {
                              updateBlock(block.key, { text: e.target.value })
                              autoResize(e.currentTarget)
                            }}
                            onKeyDown={(e) => {
                              // IME 조합 확정 Enter는 무시 (한글 입력 시 이중 실행 방지)
                              if (e.nativeEvent.isComposing) return
                              // 빈 문단에서 Backspace: 문단을 지우고 이전 블록으로 포커스 이동
                              if (e.key === 'Backspace' && block.text === '' && blocks.length > 1) {
                                e.preventDefault()
                                const prevKey = blocks[index - 1]?.key
                                removeBlock(index)
                                if (prevKey) setFocusKey(prevKey)
                              }
                            }}
                            placeholder={placeholderFor(blocks, index)}
                            rows={1}
                            className="block w-full resize-none overflow-hidden bg-transparent py-0.5 text-[15px] leading-[1.7] text-fg outline-none placeholder:text-fg-disabled"
                          />
                        ) : (
                          <p className="py-0.5 text-[15px] leading-[1.7] whitespace-pre-wrap text-fg">
                            {block.text}
                          </p>
                        ))}

                      {(block.type === 'bullet' || block.type === 'check') && (
                        <div className="doc-item flex items-start gap-2.5 py-1">
                          {block.type === 'bullet' ? (
                            <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-fg-secondary" />
                          ) : (
                            <input
                              type="checkbox"
                              checked={Boolean(block.checked)}
                              disabled={!editing}
                              onChange={(e) => updateBlock(block.key, { checked: e.target.checked })}
                              className="mt-1.5 h-4 w-4 shrink-0 accent-accent-500"
                            />
                          )}
                          {editing ? (
                            <input
                              ref={setBlockRef(block.key)}
                              value={block.text}
                              onChange={(e) => updateBlock(block.key, { text: e.target.value })}
                              onKeyDown={handleListKeyDown(index, block)}
                              placeholder={placeholderFor(blocks, index)}
                              className={`min-w-0 flex-1 bg-transparent text-[15px] leading-[1.7] outline-none placeholder:text-fg-disabled ${block.checked ? 'text-fg-tertiary line-through' : 'text-fg'}`}
                            />
                          ) : (
                            <span
                              className={`min-w-0 flex-1 text-[15px] leading-[1.7] ${block.checked ? 'text-fg-tertiary line-through' : 'text-fg'}`}
                            >
                              {block.text}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {editing && (
                    <div className="mt-8 flex gap-2 border-t border-line/60 pt-4 opacity-60 transition-opacity hover:opacity-100">
                      <button
                        onClick={() => {
                          const block = newBlock('heading')
                          setBlocks((prev) => [...prev, block])
                          setFocusKey(block.key)
                          touch()
                        }}
                        className="rounded-field px-2 py-1 text-caption text-fg-tertiary transition-colors hover:bg-sunken hover:text-fg"
                      >
                        + 소제목
                      </button>
                      <button
                        onClick={() => {
                          const block = newBlock('text')
                          setBlocks((prev) => [...prev, block])
                          setFocusKey(block.key)
                          touch()
                        }}
                        className="rounded-field px-2 py-1 text-caption text-fg-tertiary transition-colors hover:bg-sunken hover:text-fg"
                      >
                        + 문단
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
