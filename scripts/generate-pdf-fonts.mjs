// Noto Sans KR(Regular/Bold)을 pdfmake VFS 모듈로 저장한다.
// @fontsource/noto-sans-kr은 woff2만 배포하는데, pdfkit의 폰트 서브셋팅이 woff2 소스에서
// 글리프 outline을 깨뜨리는 문제가 있어(실측: 렌더된 PDF에서 한글 대부분이 비어 보임)
// wawoff2로 ttf(sfnt)로 복원한 뒤 임베드한다 — pdfmake 공식 예제도 전부 ttf를 쓴다.
// @fontsource/noto-sans-kr 버전을 올릴 때만 다시 실행하면 된다: node scripts/generate-pdf-fonts.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { decompress } from 'wawoff2'

const rootDir = path.dirname(fileURLToPath(import.meta.url)) + '/..'
const fontsDir = path.join(rootDir, 'node_modules', '@fontsource', 'noto-sans-kr', 'files')
const outDir = path.join(rootDir, 'src', 'services', 'pdf')
const outFile = path.join(outDir, 'notoSansKrVfs.generated.ts')

// vfs 안에서 쓸 파일명 -> @fontsource 패키지 안의 실제 소스 파일명(woff2)
const FILES = {
  'NotoSansKR-Regular.ttf': 'noto-sans-kr-korean-400-normal.woff2',
  'NotoSansKR-Bold.ttf': 'noto-sans-kr-korean-700-normal.woff2',
}

// wawoff2의 WASM 디코더가 내부 스크래치 메모리를 재사용하는 것으로 보여, 두 호출을
// Promise.all로 동시에 실행하면 결과가 서로 뒤섞인다(실측). 반드시 순차 실행할 것.
const entries = []
for (const [vfsName, sourceName] of Object.entries(FILES)) {
  const woff2Bytes = readFileSync(path.join(fontsDir, sourceName))
  const ttfBytes = await decompress(woff2Bytes)
  entries.push([vfsName, Buffer.from(ttfBytes).toString('base64')])
}

const body = entries.map(([name, base64]) => `  '${name}': '${base64}',`).join('\n')
const output = `// 이 파일은 scripts/generate-pdf-fonts.mjs 로 생성된다. 직접 수정하지 말 것.
export const notoSansKrVfs: Record<string, string> = {
${body}
}
`

mkdirSync(outDir, { recursive: true })
writeFileSync(outFile, output)
console.log(`generated ${path.relative(rootDir, outFile)} (${entries.map(([n, b]) => `${n}: ${b.length} chars`).join(', ')})`)
