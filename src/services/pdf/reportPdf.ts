import type { JSONContent } from '@tiptap/core'
import pdfMake from 'pdfmake/build/pdfmake'
import type { Column, Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import { notoSansKrVfs } from './notoSansKrVfs.generated'

const FONT_FAMILY = 'NotoSansKR'
// A4(595.28pt) 기준 좌우 여백 45pt(≈16mm)를 뺀 본문 폭 — 구분선(horizontalRule) 길이에 사용
const CONTENT_WIDTH = 505

let fontsRegistered = false

function ensureFontsRegistered() {
  if (fontsRegistered) return
  pdfMake.addVirtualFileSystem(notoSansKrVfs)
  // Noto Sans KR은 별도 이탤릭 웨이트가 없어 italics/bolditalics도 각각 Regular/Bold로 대체한다.
  pdfMake.addFonts({
    [FONT_FAMILY]: {
      normal: 'NotoSansKR-Regular.ttf',
      bold: 'NotoSansKR-Bold.ttf',
      italics: 'NotoSansKR-Regular.ttf',
      bolditalics: 'NotoSansKR-Bold.ttf',
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
  await pdfMake.createPdf(docDefinition).download(`${sanitizeFilename(input.filename)}.pdf`)
}
