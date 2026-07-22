// Pretendard(Regular/Bold)을 pdfmake VFS 모듈로 저장한다.
// 앱 UI 폰트(Pretendard)와 PDF 폰트를 일치시키기 위해 사용하며, 부수적으로 Noto Sans KR의
// 'korean' 서브셋 웹폰트가 빠뜨렸던 화살표(→ 등) 글리프도 Pretendard 정적 빌드엔 포함돼 있어
// 함께 해결된다(fontkit으로 실측 확인: U+2190~U+27A1 대다수 존재).
// pretendard 패키지는 이미 압축 해제된 정적 otf를 배포하므로 별도 디코딩 없이 base64만 하면 된다.
// pretendard 버전을 올릴 때만 다시 실행하면 된다: node scripts/generate-pdf-fonts.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const rootDir = path.dirname(fileURLToPath(import.meta.url)) + '/..'
const fontsDir = path.join(rootDir, 'node_modules', 'pretendard', 'dist', 'public', 'static')
const outDir = path.join(rootDir, 'src', 'services', 'pdf')
const outFile = path.join(outDir, 'pretendardVfs.generated.ts')

// vfs 안에서 쓸 파일명 -> pretendard 패키지 안의 실제 소스 파일명(otf)
const FILES = {
  'Pretendard-Regular.otf': 'Pretendard-Regular.otf',
  'Pretendard-Bold.otf': 'Pretendard-Bold.otf',
}

const entries = Object.entries(FILES).map(([vfsName, sourceName]) => {
  const bytes = readFileSync(path.join(fontsDir, sourceName))
  return [vfsName, bytes.toString('base64')]
})

const body = entries.map(([name, base64]) => `  '${name}': '${base64}',`).join('\n')
const output = `// 이 파일은 scripts/generate-pdf-fonts.mjs 로 생성된다. 직접 수정하지 말 것.
export const pretendardVfs: Record<string, string> = {
${body}
}
`

mkdirSync(outDir, { recursive: true })
writeFileSync(outFile, output)
console.log(`generated ${path.relative(rootDir, outFile)} (${entries.map(([n, b]) => `${n}: ${b.length} chars`).join(', ')})`)
