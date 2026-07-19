# 파일 관리(학생별 파일 업로드) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생 상세의 파일 탭에서 학생별 파일을 업로드·목록·열람·다운로드·삭제하고, 업로드를 타임라인에 기록한다.

**Architecture:** 비공개 Supabase Storage 버킷(`student-files`, 경로 `{student_id}/{uuid}`) + `student_files` 메타데이터 테이블. RLS는 기존 `can_access_student()` helper만 사용(메모 패턴). 서비스 계층(`src/services/files.ts`)만 Supabase를 호출하고, `FilesTab`은 TanStack Query로 소비.

**Tech Stack:** React 19 + TypeScript strict, TanStack Query, Supabase (Postgres RLS + Storage), Tailwind v4, 기존 `src/components/ui/*`.

**Spec:** `docs/superpowers/specs/2026-07-19-student-files-design.md`

## Global Constraints

- 사용자 노출 문자열·코드 주석은 한국어.
- 검증 수단은 `npm run build`뿐 (tsc strict, `noUnusedLocals`/`noUnusedParameters` on — 테스트 인프라 없음, 레포 관례).
- 허용 확장자: `pdf`, `jpg`, `jpeg`, `png`, `webp`, `docx`, `hwp`, `hwpx`, `txt`, `xlsx` / 파일당 최대 20MB (20 * 1024 * 1024 bytes).
- 마이그레이션은 새 파일 `supabase/migrations/0011_student_files.sql`로 추가 (기존 파일 수정 금지). 적용은 사용자가 Supabase SQL Editor에서 수동으로 실행.
- 타임라인 기록은 fire-and-forget (`logActivity` — 실패는 console만). 기존 `ActivityType` `'file_uploaded'`와 라벨 `'파일'`을 재사용 (types 수정 불필요).
- `@/*` path alias 사용, 상대 경로 크로스-피처 import 금지.
- 새 UI는 중립 톤 우선 — 형식 Badge는 기본(neutral) 톤.

---

### Task 1: DB 마이그레이션 (테이블 + Storage 버킷 + RLS)

**Files:**
- Create: `supabase/migrations/0011_student_files.sql`

**Interfaces:**
- Produces: `public.student_files` 테이블(컬럼: `id`, `student_id`, `uploader_id`, `name`, `storage_path`, `size`, `mime_type`, `created_at`), 비공개 버킷 `student-files`(20MB 제한). Task 3의 서비스가 이 테이블·버킷 이름을 그대로 사용.

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 3차: 학생별 파일 관리 (spec: docs/superpowers/specs/2026-07-19-student-files-design.md)
-- 비공개 버킷 + signed URL 방식. 객체 경로는 {student_id}/{uuid} 고정 —
-- 원본 파일명은 경로에 넣지 않고 name 컬럼에만 보관한다(한글·특수문자 경로 문제 회피).

-- =========================================================
-- 1. 메타데이터 테이블
-- =========================================================
create table public.student_files (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  uploader_id uuid not null references public.profiles (id),
  name text not null,                        -- 원본 파일명
  storage_path text not null unique,         -- student-files 버킷 내 경로 ({student_id}/{uuid})
  size bigint not null,
  mime_type text not null,
  created_at timestamptz not null default now()
);

create index student_files_student_created_idx
  on public.student_files (student_id, created_at desc);

-- =========================================================
-- 2. RLS: 메모 패턴 (select/insert는 담당자, delete는 업로더 본인 또는 그룹 owner)
--    파일명 변경 요구사항이 없어 update 정책은 두지 않는다.
-- =========================================================
alter table public.student_files enable row level security;

create policy "student_files_select" on public.student_files
  for select to authenticated using (public.can_access_student(student_id));
create policy "student_files_insert" on public.student_files
  for insert to authenticated with check (
    public.can_access_student(student_id) and uploader_id = auth.uid()
  );
create policy "student_files_delete" on public.student_files
  for delete to authenticated using (
    public.can_access_student(student_id)
    and (uploader_id = auth.uid() or public.is_group_owner(public.student_group_id(student_id)))
  );

-- =========================================================
-- 3. Storage 버킷 (비공개, 20MB)
--    allowed_mime_types는 두지 않는다 — hwp/hwpx는 브라우저가 MIME을
--    일관되게 주지 않아(빈 문자열 포함) 버킷 수준 제한이 업로드를 막을 수 있다.
--    확장자 검증은 클라이언트(src/services/files.ts)에서 수행.
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('student-files', 'student-files', false, 20971520)
on conflict (id) do nothing;

-- =========================================================
-- 4. Storage RLS: 경로 첫 세그먼트가 student_id이므로
--    can_access_student()만으로 검사 (교차 서브쿼리 없음 — 0004 재귀 패턴 준수)
-- =========================================================
create policy "student_files_storage_select" on storage.objects
  for select to authenticated using (
    bucket_id = 'student-files'
    and public.can_access_student(((storage.foldername(name))[1])::uuid)
  );
create policy "student_files_storage_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'student-files'
    and public.can_access_student(((storage.foldername(name))[1])::uuid)
  );
create policy "student_files_storage_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'student-files'
    and (
      owner_id = auth.uid()::text
      or public.is_group_owner(public.student_group_id(((storage.foldername(name))[1])::uuid))
    )
  );
```

- [ ] **Step 2: 빌드 확인 (SQL은 tsc 대상이 아니므로 통과 확인용)**

Run: `npm run build`
Expected: 기존과 동일하게 성공 (exit 0)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0011_student_files.sql
git commit -m "feat(files): student_files 테이블·Storage 버킷·RLS 마이그레이션 추가"
```

- [ ] **Step 4: 사용자에게 수동 적용 요청**

세션에서 사용자에게 알림: Supabase SQL Editor에서 `0011_student_files.sql` 실행 필요 (레포 관례 — CLI 미연결). 이후 태스크는 적용 여부와 무관하게 진행 가능하나, Task 4의 수동 검증 전에는 반드시 적용돼 있어야 한다.

---

### Task 2: 타입 + 용량 포맷 유틸

**Files:**
- Modify: `src/types/index.ts` (Memo 인터페이스 아래에 StudentFile 추가)
- Modify: `src/lib/format.ts` (파일 끝에 formatFileSize 추가)

**Interfaces:**
- Consumes: 기존 `Profile` 타입.
- Produces: `StudentFile` 인터페이스, `formatFileSize(bytes: number): string`. Task 3·4가 사용.

- [ ] **Step 1: `src/types/index.ts`의 `Memo` 인터페이스 정의 바로 아래에 추가**

```ts
export interface StudentFile {
  id: string
  student_id: string
  uploader_id: string
  name: string
  storage_path: string
  size: number
  mime_type: string
  created_at: string
  uploader?: Profile
}
```

- [ ] **Step 2: `src/lib/format.ts` 파일 끝에 추가**

```ts
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 성공. (`noUnusedLocals`는 export된 심볼에는 적용되지 않으므로 아직 미사용이어도 통과)

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/lib/format.ts
git commit -m "feat(files): StudentFile 타입과 파일 용량 포맷 유틸 추가"
```

---

### Task 3: 파일 서비스 계층

**Files:**
- Create: `src/services/files.ts`

**Interfaces:**
- Consumes: `getSupabase()` (`@/lib/supabase`), `logActivity` (`@/services/activities`), `StudentFile` (`@/types`).
- Produces (Task 4가 사용):
  - `ALLOWED_FILE_EXTENSIONS: string[]`, `MAX_FILE_SIZE: number`, `FILE_ACCEPT: string`
  - `getFileKind(name: string): string` — 'PDF' | '이미지' | '문서' | '엑셀' | '기타'
  - `fetchStudentFiles(studentId: string): Promise<StudentFile[]>`
  - `uploadStudentFile(studentId: string, file: File): Promise<void>`
  - `deleteStudentFile(file: StudentFile): Promise<void>`
  - `getStudentFileUrl(file: StudentFile, download?: boolean): Promise<string>`

- [ ] **Step 1: `src/services/files.ts` 작성**

```ts
import { getSupabase } from '@/lib/supabase'
import { logActivity } from '@/services/activities'
import type { StudentFile } from '@/types'

const BUCKET = 'student-files'

export const ALLOWED_FILE_EXTENSIONS = [
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'docx',
  'hwp',
  'hwpx',
  'txt',
  'xlsx',
]

export const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB (버킷 file_size_limit와 동일)

// file input의 accept 속성용
export const FILE_ACCEPT = ALLOWED_FILE_EXTENSIONS.map((ext) => `.${ext}`).join(',')

function extensionOf(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx === -1 ? '' : name.slice(idx + 1).toLowerCase()
}

// 목록에 표시할 형식 라벨 (확장자 기반 자동 판별 — 별도 분류 입력 없음)
export function getFileKind(name: string): string {
  const ext = extensionOf(name)
  if (ext === 'pdf') return 'PDF'
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return '이미지'
  if (['docx', 'hwp', 'hwpx', 'txt'].includes(ext)) return '문서'
  if (ext === 'xlsx') return '엑셀'
  return '기타'
}

export async function fetchStudentFiles(studentId: string): Promise<StudentFile[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('student_files')
    .select('*, uploader:profiles(id, name, avatar_url)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as StudentFile[]
}

export async function uploadStudentFile(studentId: string, file: File): Promise<void> {
  const ext = extensionOf(file.name)
  if (!ALLOWED_FILE_EXTENSIONS.includes(ext)) {
    throw new Error(`지원하지 않는 파일 형식입니다. (${ALLOWED_FILE_EXTENSIONS.join(', ')})`)
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('파일은 20MB 이하만 업로드할 수 있습니다.')
  }

  const supabase = getSupabase()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('로그인이 필요합니다.')

  // 원본 파일명은 경로에 넣지 않는다 (한글·특수문자 경로 문제 회피) — name 컬럼에만 보관
  const storagePath = `${studentId}/${crypto.randomUUID()}`
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: file.type || 'application/octet-stream',
  })
  if (uploadError) throw uploadError

  const { error: insertError } = await supabase.from('student_files').insert({
    student_id: studentId,
    uploader_id: auth.user.id,
    name: file.name,
    storage_path: storagePath,
    size: file.size,
    mime_type: file.type || 'application/octet-stream',
  })
  if (insertError) {
    // 메타데이터 저장 실패 시 고아 객체 정리 (실패해도 무시 — 목록엔 노출되지 않음)
    await supabase.storage.from(BUCKET).remove([storagePath])
    throw insertError
  }

  await logActivity({
    studentId,
    type: 'file_uploaded',
    summary: file.name,
    ref: { storage_path: storagePath },
  })
}

export async function deleteStudentFile(file: StudentFile): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('student_files').delete().eq('id', file.id)
  if (error) throw error
  // row가 진실 원장 — 객체 삭제 실패는 콘솔에만 남긴다
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([file.storage_path])
  if (storageError) console.error('storage object delete failed:', storageError.message)
}

export async function getStudentFileUrl(file: StudentFile, download = false): Promise<string> {
  const supabase = getSupabase()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(file.storage_path, 60, download ? { download: file.name } : undefined)
  if (error) throw error
  return data.signedUrl
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 3: Commit**

```bash
git add src/services/files.ts
git commit -m "feat(files): 파일 업로드·조회·삭제·signed URL 서비스 추가"
```

---

### Task 4: FilesTab UI + 라우팅 연결

**Files:**
- Create: `src/features/student-detail/FilesTab.tsx`
- Modify: `src/routes/../features/student-detail/StudentDetailPage.tsx` — 정확한 경로 `src/features/student-detail/StudentDetailPage.tsx`의 `files` 탭 분기(124행 부근 `<PlaceholderTab label="파일" phase="3차" />`)를 교체

**Interfaces:**
- Consumes: Task 2의 `StudentFile`·`formatFileSize`, Task 3의 서비스 전부, 기존 `useAuth`/`useGroup`/`Button`/`Badge`/`Avatar`/`Spinner`/`EmptyState`/`StaggerList`/`StaggerItem`/`formatDateTime`.
- Produces: `FilesTab({ studentId }: { studentId: string })` 컴포넌트.

- [ ] **Step 1: `src/features/student-detail/FilesTab.tsx` 작성**

```tsx
import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FILE_ACCEPT,
  deleteStudentFile,
  fetchStudentFiles,
  getFileKind,
  getStudentFileUrl,
  uploadStudentFile,
} from '@/services/files'
import { useAuth } from '@/features/auth/AuthProvider'
import { useGroup } from '@/features/group/GroupProvider'
import { formatDateTime, formatFileSize } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { StaggerList, StaggerItem } from '@/components/motion'
import type { StudentFile } from '@/types'

export function FilesTab({ studentId }: { studentId: string }) {
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const { isOwner } = useGroup()
  const inputRef = useRef<HTMLInputElement>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data: files, isLoading } = useQuery({
    queryKey: ['studentFiles', studentId],
    queryFn: () => fetchStudentFiles(studentId),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['studentFiles', studentId] })
    void queryClient.invalidateQueries({ queryKey: ['activities', studentId] })
  }

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadStudentFile(studentId, file),
    onSuccess: () => {
      setErrorMessage(null)
      invalidate()
    },
    onError: (err) => setErrorMessage(err instanceof Error ? err.message : '업로드에 실패했습니다.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (file: StudentFile) => deleteStudentFile(file),
    onSuccess: () => {
      setErrorMessage(null)
      invalidate()
    },
    onError: () => setErrorMessage('파일 삭제에 실패했습니다.'),
  })

  const openFile = async (file: StudentFile, download: boolean) => {
    try {
      const url = await getStudentFileUrl(file, download)
      if (download) {
        // download 옵션이 붙은 signed URL은 Content-Disposition: attachment로 내려온다
        window.location.assign(url)
      } else {
        window.open(url, '_blank', 'noopener')
      }
    } catch {
      setErrorMessage(download ? '다운로드에 실패했습니다.' : '파일 열람에 실패했습니다.')
    }
  }

  const canDelete = (file: StudentFile) => isOwner || file.uploader_id === session?.user?.id

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-caption text-fg-tertiary">
          PDF·이미지·문서(docx/hwp/hwpx/txt)·엑셀, 파일당 20MB 이하
        </p>
        <Button
          variant="secondary"
          size="sm"
          disabled={uploadMutation.isPending}
          onClick={() => inputRef.current?.click()}
        >
          {uploadMutation.isPending ? '업로드 중...' : '파일 업로드'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={FILE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) uploadMutation.mutate(file)
            e.target.value = '' // 같은 파일 재선택 허용
          }}
        />
      </div>

      {errorMessage && <p className="text-caption text-danger">{errorMessage}</p>}

      {isLoading ? (
        <Spinner />
      ) : !files?.length ? (
        <EmptyState
          title="업로드된 파일이 없습니다."
          description="생기부, 활동 자료, 상담 자료 등을 올려보세요."
        />
      ) : (
        <StaggerList className="space-y-3">
          {files.map((file) => (
            <StaggerItem key={file.id}>
              <div className="flex items-center justify-between rounded-card border border-line bg-surface p-4 shadow-card">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge>{getFileKind(file.name)}</Badge>
                    <span className="truncate text-body font-medium text-fg">{file.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-caption text-fg-tertiary">
                    <Avatar name={file.uploader?.name ?? ''} url={file.uploader?.avatar_url} size="sm" />
                    {file.uploader?.name} · {formatDateTime(file.created_at)} · {formatFileSize(file.size)}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    className="rounded-field px-2 py-1 text-caption text-fg-tertiary transition-colors hover:bg-sunken hover:text-fg"
                    onClick={() => void openFile(file, false)}
                  >
                    열람
                  </button>
                  <button
                    className="rounded-field px-2 py-1 text-caption text-fg-tertiary transition-colors hover:bg-sunken hover:text-fg"
                    onClick={() => void openFile(file, true)}
                  >
                    다운로드
                  </button>
                  {canDelete(file) && (
                    <button
                      className="rounded-field px-2 py-1 text-caption text-fg-tertiary transition-colors hover:bg-danger-soft hover:text-danger"
                      onClick={() => {
                        if (window.confirm(`'${file.name}' 파일을 삭제할까요?`)) deleteMutation.mutate(file)
                      }}
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
            </StaggerItem>
          ))}
        </StaggerList>
      )}
    </div>
  )
}
```

(`StaggerList`/`StaggerItem`은 `src/components/motion/index.tsx`에 이 이름 그대로 export돼 있고 둘 다 `className`을 받는다 — 확인 완료.)

- [ ] **Step 2: `StudentDetailPage.tsx` 수정**

import 목록에 추가:

```tsx
import { FilesTab } from './FilesTab'
```

`files` 탭 분기 교체 — 변경 전:

```tsx
{tab === 'files' && <PlaceholderTab label="파일" phase="3차" />}
```

변경 후:

```tsx
{tab === 'files' && <FilesTab studentId={student.id} />}
```

`PlaceholderTab`이 `schedule` 탭에서 여전히 쓰이므로 import는 유지.

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 성공 (unused import 에러 없음)

- [ ] **Step 4: 수동 검증 (0011 마이그레이션 적용 후, dev 서버)**

Run: `npm run dev`

1. 학생 상세 → 파일 탭: 빈 상태 문구 확인
2. PDF 업로드 → 목록에 형식 뱃지 'PDF'·용량·등록자·등록일 표시
3. 열람 → 새 탭에서 PDF 렌더 / 다운로드 → 원본 파일명으로 저장
4. 21MB 파일 또는 `.zip` 선택 → 인라인 한국어 에러, 목록 불변
5. 삭제 → confirm 후 목록에서 제거
6. 타임라인 탭 → '파일' 타입으로 업로드 기록 확인 (삭제는 미기록)
7. (가능하면) member 계정으로 미담당 학생 접근 시 파일 조회/업로드 차단 확인

- [ ] **Step 5: Commit**

```bash
git add src/features/student-detail/FilesTab.tsx src/features/student-detail/StudentDetailPage.tsx
git commit -m "feat(files): 학생 상세 파일 탭 구현 (업로드·열람·다운로드·삭제)"
```

---

## 완료 기준

- 4개 태스크 전부 커밋됨, `npm run build` 통과
- Task 4 Step 4의 수동 검증 시나리오 전부 통과
- 스펙의 "범위 제외" 항목(카테고리, 파일명 변경, 드래그 앤 드롭, 미리보기, 보고서 활용)은 구현하지 않음
