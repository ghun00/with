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
