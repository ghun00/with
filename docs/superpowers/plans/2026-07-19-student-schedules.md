# 일정 관리(학생별 일정) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생 상세의 일정 탭에서 해당 학생의 일정을 등록·수정·삭제하고, 다가오는/지난 일정을 목록으로 보여주며 등록을 타임라인에 기록한다.

**Architecture:** 파일 관리와 동일한 3계층 패턴 — `student_schedules` 테이블(항상 학생 연결) + RLS(`can_access_student`), 서비스 계층(`src/services/schedules.ts`), 학생 상세의 `ScheduleTab`(폼은 `ScheduleFormModal`로 분리). 컴포넌트는 TanStack Query로만 서비스를 소비한다.

**Tech Stack:** React 19 + TypeScript strict, TanStack Query, Supabase (Postgres RLS), Tailwind v4, 기존 `src/components/ui/*`(Modal, Field, Button, Badge 등).

**Spec:** `docs/superpowers/specs/2026-07-19-student-schedules-design.md`

## Global Constraints

- 사용자 노출 문자열·코드 주석은 한국어.
- 검증 수단은 `npm run build`뿐 (tsc strict, `noUnusedLocals`/`noUnusedParameters` on — 테스트 인프라 없음, 레포 관례). 미사용 import/변수는 빌드 실패.
- 마이그레이션은 새 파일 `supabase/migrations/0012_student_schedules.sql`로만 추가 (기존 파일 수정 금지). 적용은 사용자가 Supabase SQL Editor에서 수동 실행.
- 모든 일정은 항상 학생에 연결 — `student_id`는 NOT NULL. 개인(비학생) 일정·전역 캘린더는 범위 밖.
- RLS 4개 정책 모두 `public.can_access_student(student_id)` 사용(상담보고서 `0007` 패턴). insert는 추가로 `created_by = auth.uid()`. 교차 서브쿼리 금지.
- 시작 일시(날짜+시각)는 필수, 종료 일시는 선택. 종료가 있으면 시작보다 뒤여야 함.
- 타임라인 기록은 생성 시에만, `logActivity`로 fire-and-forget (`schedule` 타입, 라벨 '일정' 이미 존재 — `ActivityType`/`ACTIVITY_TYPE_LABEL` 수정 금지).
- 편집/삭제는 담당 컨설턴트 누구나(프론트에서 별도 권한 게이트 없음 — RLS가 경계).
- `@/*` path alias 사용. 중립 톤 우선(카테고리성 Badge는 기본 톤). 기존 `Modal`/`Field`/`Button` 재사용.
- 커밋 메시지는 한국어 conventional-commit, 끝에 다음 트레일러:
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

---

### Task 1: DB 마이그레이션 (테이블 + RLS)

**Files:**
- Create: `supabase/migrations/0012_student_schedules.sql`

**Interfaces:**
- Produces: `public.student_schedules` 테이블(컬럼: `id`, `student_id`, `created_by`, `title`, `start_at`, `end_at`, `memo`, `created_at`, `updated_at`). Task 3의 서비스가 이 테이블·컬럼명을 그대로 사용.

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 3차: 학생별 일정 관리 (spec: docs/superpowers/specs/2026-07-19-student-schedules-design.md)
-- 모든 일정은 항상 학생에 연결된다(student_id NOT NULL). 개인 일정은 범위 밖.
-- start_at은 필수, end_at은 선택(없으면 단일 시점).

create table public.student_schedules (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  created_by uuid not null references public.profiles (id),
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz,               -- 선택 (없으면 단일 시점)
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index student_schedules_student_start_idx
  on public.student_schedules (student_id, start_at);

-- =========================================================
-- RLS: student_id가 직접 컬럼이므로 can_access_student만으로 충분
--      (상담보고서 0007과 동일 — 교차 서브쿼리 재귀 없음)
-- =========================================================
alter table public.student_schedules enable row level security;

create policy "student_schedules_select" on public.student_schedules
  for select to authenticated using (public.can_access_student(student_id));
create policy "student_schedules_insert" on public.student_schedules
  for insert to authenticated with check (
    public.can_access_student(student_id) and created_by = auth.uid()
  );
create policy "student_schedules_update" on public.student_schedules
  for update to authenticated using (public.can_access_student(student_id));
create policy "student_schedules_delete" on public.student_schedules
  for delete to authenticated using (public.can_access_student(student_id));
```

- [ ] **Step 2: 빌드 확인 (SQL은 tsc 대상이 아니므로 회귀 없음 확인용)**

Run: `npm run build`
Expected: 성공 (exit 0)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0012_student_schedules.sql
git commit -m "feat(schedule): student_schedules 테이블·RLS 마이그레이션 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 타입 + 날짜/시각 입력 유틸

**Files:**
- Modify: `src/types/index.ts` (`StudentSchedule` 인터페이스 추가 — `StudentActivity` 관련 인터페이스들 아래, `Profile` 뒤 아무 곳이나 도메인 인터페이스 영역)
- Modify: `src/lib/format.ts` (파일 끝에 두 유틸 추가)

**Interfaces:**
- Consumes: 기존 `Profile` 타입.
- Produces:
  - `StudentSchedule` 인터페이스 (Task 3·4·5가 사용)
  - `localInputsToISO(date: string, time: string): string`
  - `isoToLocalInputs(iso: string): { date: string; time: string }`

- [ ] **Step 1: `src/types/index.ts`에 `StudentSchedule` 인터페이스 추가**

기존 `Memo` 인터페이스 정의 뒤(또는 `StudentActivity` 계열 인터페이스 아래) 도메인 인터페이스 영역에 추가:

```ts
export interface StudentSchedule {
  id: string
  student_id: string
  created_by: string
  title: string
  start_at: string
  end_at: string | null
  memo: string | null
  created_at: string
  updated_at: string
  creator?: Profile
}
```

- [ ] **Step 2: `src/lib/format.ts` 파일 끝에 유틸 추가**

```ts
// date(YYYY-MM-DD) + time(HH:MM) 로컬 입력을 ISO 문자열로 합친다. time이 비면 자정 기준.
export function localInputsToISO(date: string, time: string): string {
  return new Date(`${date}T${time || '00:00'}`).toISOString()
}

// ISO 문자열을 date input / time input용 로컬 값으로 분리 (편집 시 폼 초기값)
export function isoToLocalInputs(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 성공 (export된 심볼은 아직 미사용이어도 `noUnusedLocals` 미적용)

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/lib/format.ts
git commit -m "feat(schedule): StudentSchedule 타입과 날짜/시각 입력 유틸 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 일정 서비스 계층

**Files:**
- Create: `src/services/schedules.ts`

**Interfaces:**
- Consumes: `getSupabase()` (`@/lib/supabase`), `logActivity` (`@/services/activities`), `StudentSchedule` (`@/types`).
- Produces (Task 4·5가 사용):
  - `ScheduleInput` 타입: `{ title: string; startAt: string; endAt: string | null; memo: string | null }`
  - `fetchStudentSchedules(studentId: string): Promise<StudentSchedule[]>`
  - `createStudentSchedule(studentId: string, input: ScheduleInput): Promise<void>`
  - `updateStudentSchedule(id: string, input: ScheduleInput): Promise<void>`
  - `deleteStudentSchedule(id: string): Promise<void>`

- [ ] **Step 1: `src/services/schedules.ts` 작성**

```ts
import { getSupabase } from '@/lib/supabase'
import { logActivity } from '@/services/activities'
import type { StudentSchedule } from '@/types'

export interface ScheduleInput {
  title: string
  startAt: string // ISO
  endAt: string | null // ISO 또는 null
  memo: string | null
}

// 공통 입력 검증 (제목·시작 필수, 종료가 있으면 시작보다 뒤)
function validate(input: ScheduleInput): void {
  if (!input.title) throw new Error('일정명을 입력하세요.')
  if (!input.startAt) throw new Error('시작 일시를 입력하세요.')
  if (input.endAt && new Date(input.endAt).getTime() <= new Date(input.startAt).getTime()) {
    throw new Error('종료 일시는 시작 일시보다 뒤여야 합니다.')
  }
}

export async function fetchStudentSchedules(studentId: string): Promise<StudentSchedule[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('student_schedules')
    .select('*, creator:profiles(id, name, avatar_url)')
    .eq('student_id', studentId)
    .order('start_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as StudentSchedule[]
}

export async function createStudentSchedule(studentId: string, input: ScheduleInput): Promise<void> {
  validate(input)
  const supabase = getSupabase()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('로그인이 필요합니다.')
  const { error } = await supabase.from('student_schedules').insert({
    student_id: studentId,
    created_by: auth.user.id,
    title: input.title,
    start_at: input.startAt,
    end_at: input.endAt,
    memo: input.memo,
  })
  if (error) throw error
  await logActivity({ studentId, type: 'schedule', summary: input.title })
}

export async function updateStudentSchedule(id: string, input: ScheduleInput): Promise<void> {
  validate(input)
  const supabase = getSupabase()
  const { error } = await supabase
    .from('student_schedules')
    .update({
      title: input.title,
      start_at: input.startAt,
      end_at: input.endAt,
      memo: input.memo,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteStudentSchedule(id: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('student_schedules').delete().eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 3: Commit**

```bash
git add src/services/schedules.ts
git commit -m "feat(schedule): 일정 조회·생성·수정·삭제 서비스 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 일정 등록/수정 모달

**Files:**
- Create: `src/features/student-detail/ScheduleFormModal.tsx`

**Interfaces:**
- Consumes: Task 2의 `StudentSchedule`·`localInputsToISO`·`isoToLocalInputs`, Task 3의 `ScheduleInput`·`createStudentSchedule`·`updateStudentSchedule`, 기존 `Modal`/`Button`/`Input`/`Label`/`Textarea`(`@/components/ui/*`), TanStack Query.
- Produces: `ScheduleFormModal({ open, onClose, studentId, editing, onSaved })` 컴포넌트.
  - `editing: StudentSchedule | null` — null이면 등록, 값이 있으면 수정.
  - `onSaved: () => void` — 저장 성공 시 호출(부모가 목록·타임라인 무효화).

- [ ] **Step 1: `src/features/student-detail/ScheduleFormModal.tsx` 작성**

```tsx
import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  createStudentSchedule,
  updateStudentSchedule,
  type ScheduleInput,
} from '@/services/schedules'
import { localInputsToISO, isoToLocalInputs } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Input, Label, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import type { StudentSchedule } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  studentId: string
  editing: StudentSchedule | null
  onSaved: () => void
}

export function ScheduleFormModal({ open, onClose, studentId, editing, onSaved }: Props) {
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [memo, setMemo] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // 모달이 열릴 때 editing 값으로 초기화(등록이면 비움)
  useEffect(() => {
    if (!open) return
    setErrorMessage(null)
    if (editing) {
      const s = isoToLocalInputs(editing.start_at)
      setTitle(editing.title)
      setStartDate(s.date)
      setStartTime(s.time)
      if (editing.end_at) {
        const e = isoToLocalInputs(editing.end_at)
        setEndDate(e.date)
        setEndTime(e.time)
      } else {
        setEndDate('')
        setEndTime('')
      }
      setMemo(editing.memo ?? '')
    } else {
      setTitle('')
      setStartDate('')
      setStartTime('')
      setEndDate('')
      setEndTime('')
      setMemo('')
    }
  }, [open, editing])

  const buildInput = (): ScheduleInput => ({
    title: title.trim(),
    startAt: localInputsToISO(startDate, startTime),
    endAt: endDate ? localInputsToISO(endDate, endTime) : null,
    memo: memo.trim() || null,
  })

  const mutation = useMutation({
    mutationFn: () =>
      editing
        ? updateStudentSchedule(editing.id, buildInput())
        : createStudentSchedule(studentId, buildInput()),
    onSuccess: () => {
      onSaved()
      onClose()
    },
    onError: (err) => setErrorMessage(err instanceof Error ? err.message : '저장에 실패했습니다.'),
  })

  // 시작 날짜·시각·제목이 있어야 저장 활성화 (종료<시작 등 정밀 검증은 서비스가 담당)
  const valid = title.trim() && startDate && startTime

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? '일정 수정' : '일정 추가'}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            취소
          </Button>
          <Button size="sm" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? '저장 중...' : '저장'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label required>일정명</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 3월 정기 상담" />
        </div>
        <div>
          <Label required>시작 일시</Label>
          <div className="flex gap-2">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>종료 일시 (선택)</Label>
          <div className="flex gap-2">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>메모</Label>
          <Textarea rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </div>
        {errorMessage && <p className="text-caption text-danger">{errorMessage}</p>}
      </div>
    </Modal>
  )
}
```

주의: `Input`/`Label`/`Textarea`의 실제 시그니처는 `src/components/ui/Field.tsx`에 있다 — `Label`은 `{ children, required? }`, `Input`은 표준 `input` props를 그대로 받는다(확인 완료). `Modal`은 `{ open, title, onClose, children, footer }`를 받고 ESC/배경 클릭 닫힘·애니메이션을 자체 처리한다.

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 3: Commit**

```bash
git add src/features/student-detail/ScheduleFormModal.tsx
git commit -m "feat(schedule): 일정 등록·수정 모달 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 일정 탭 + 라우팅 연결

**Files:**
- Create: `src/features/student-detail/ScheduleTab.tsx`
- Modify: `src/features/student-detail/StudentDetailPage.tsx` — import 추가 + `schedule` 탭 분기(123행 `<PlaceholderTab label="일정" phase="3차" />`) 교체. `PlaceholderTab`은 이 교체 후 다른 탭에서 쓰이지 않으므로 **import도 함께 제거**(미사용 import는 빌드 실패).

**Interfaces:**
- Consumes: Task 3의 `fetchStudentSchedules`·`deleteStudentSchedule`, Task 4의 `ScheduleFormModal`, Task 2의 `StudentSchedule`, 기존 `formatDateTime`·`Button`·`Spinner`·`EmptyState`·`StaggerList`/`StaggerItem`.
- Produces: `ScheduleTab({ studentId }: { studentId: string })`.

- [ ] **Step 1: `src/features/student-detail/ScheduleTab.tsx` 작성**

```tsx
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteStudentSchedule, fetchStudentSchedules } from '@/services/schedules'
import { ScheduleFormModal } from './ScheduleFormModal'
import { formatDateTime } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { StaggerList, StaggerItem } from '@/components/motion'
import type { StudentSchedule } from '@/types'

// 종료가 없으면 시작만, 있으면 시작 ~ 종료
function formatPeriod(s: StudentSchedule): string {
  if (!s.end_at) return formatDateTime(s.start_at)
  return `${formatDateTime(s.start_at)} ~ ${formatDateTime(s.end_at)}`
}

export function ScheduleTab({ studentId }: { studentId: string }) {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<StudentSchedule | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data: schedules, isLoading } = useQuery({
    queryKey: ['schedules', studentId],
    queryFn: () => fetchStudentSchedules(studentId),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['schedules', studentId] })
    void queryClient.invalidateQueries({ queryKey: ['activities', studentId] })
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteStudentSchedule(id),
    onSuccess: () => {
      setErrorMessage(null)
      invalidate()
    },
    onError: () => setErrorMessage('일정 삭제에 실패했습니다.'),
  })

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }
  const openEdit = (s: StudentSchedule) => {
    setEditing(s)
    setModalOpen(true)
  }

  // 서비스는 start_at 오름차순으로 준다. end_at(없으면 start_at) 기준으로 다가오는/지난 분리.
  const now = Date.now()
  const refTime = (s: StudentSchedule) => new Date(s.end_at ?? s.start_at).getTime()
  const upcoming = (schedules ?? []).filter((s) => refTime(s) >= now)
  const past = (schedules ?? []).filter((s) => refTime(s) < now).reverse()

  const renderItem = (s: StudentSchedule) => (
    <StaggerItem key={s.id}>
      <div className="flex items-start justify-between rounded-card border border-line bg-surface p-4 shadow-card">
        <div className="min-w-0">
          <p className="text-body font-medium text-fg">{s.title}</p>
          <p className="mt-0.5 text-caption text-fg-tertiary">{formatPeriod(s)}</p>
          {s.memo && <p className="mt-1 whitespace-pre-wrap text-caption text-fg-secondary">{s.memo}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            className="rounded-field px-2 py-1 text-caption text-fg-tertiary transition-colors hover:bg-sunken hover:text-fg"
            onClick={() => openEdit(s)}
          >
            수정
          </button>
          <button
            className="rounded-field px-2 py-1 text-caption text-fg-tertiary transition-colors hover:bg-danger-soft hover:text-danger"
            onClick={() => {
              if (window.confirm(`'${s.title}' 일정을 삭제할까요?`)) deleteMutation.mutate(s.id)
            }}
          >
            삭제
          </button>
        </div>
      </div>
    </StaggerItem>
  )

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={openCreate}>
          일정 추가
        </Button>
      </div>

      {errorMessage && <p className="text-caption text-danger">{errorMessage}</p>}

      {isLoading ? (
        <Spinner />
      ) : !schedules?.length ? (
        <EmptyState title="등록된 일정이 없습니다." description="상담·활동 일정을 추가해보세요." />
      ) : (
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 text-label font-medium text-fg-secondary">다가오는 일정</h3>
            {upcoming.length ? (
              <StaggerList className="space-y-3">{upcoming.map(renderItem)}</StaggerList>
            ) : (
              <p className="text-caption text-fg-tertiary">다가오는 일정이 없습니다.</p>
            )}
          </section>
          {past.length > 0 && (
            <section>
              <h3 className="mb-2 text-label font-medium text-fg-secondary">지난 일정</h3>
              <StaggerList className="space-y-3">{past.map(renderItem)}</StaggerList>
            </section>
          )}
        </div>
      )}

      <ScheduleFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        studentId={studentId}
        editing={editing}
        onSaved={invalidate}
      />
    </div>
  )
}
```

주의: 색/토큰 클래스(`text-fg-secondary`, `bg-danger-soft` 등)는 기존 탭들(`MemoTab`, `FilesTab`)에서 쓰는 것과 동일하다. `StaggerList`/`StaggerItem`은 `src/components/motion/index.tsx`에서 export되며 둘 다 `className`을 받는다(확인 완료).

- [ ] **Step 2: `StudentDetailPage.tsx` 수정**

import에서 `PlaceholderTab`을 제거하고 `ScheduleTab`을 추가:

```tsx
// 삭제: import { PlaceholderTab } from './PlaceholderTab'
import { ScheduleTab } from './ScheduleTab'
```

`schedule` 탭 분기 교체 — 변경 전:

```tsx
{tab === 'schedule' && <PlaceholderTab label="일정" phase="3차" />}
```

변경 후:

```tsx
{tab === 'schedule' && <ScheduleTab studentId={student.id} />}
```

확인: `schedule`이 마지막 `PlaceholderTab` 사용처다(파일 탭은 이미 `FilesTab`으로 교체됨). 교체 후 `PlaceholderTab` import가 남아 있으면 `noUnusedLocals`로 빌드 실패하므로 반드시 import도 지운다. (`src/features/student-detail/PlaceholderTab.tsx` 파일 자체는 삭제하지 않는다 — 다른 곳에서 참조될 수 있고 이번 범위 밖.)

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 성공 (미사용 import 에러 없음)

- [ ] **Step 4: 수동 검증 (0012 마이그레이션 적용 후, dev 서버)**

Run: `npm run dev`

1. 학생 상세 → 일정 탭: 빈 상태 문구 확인
2. "일정 추가" → 제목·시작(오늘 이후 날짜)·시각 입력, 저장 → 다가오는 일정에 표시(기간 포맷 확인)
3. 종료 일시를 시작보다 앞으로 넣고 저장 → "종료 일시는 시작 일시보다 뒤여야 합니다." 인라인 에러
4. 과거 날짜 일정 등록 → 지난 일정 섹션에 표시
5. 수정 → 모달에 기존 값 채워짐, 변경 후 저장 반영
6. 삭제 → confirm 후 목록에서 제거
7. 타임라인 탭 → '일정' 타입으로 등록 기록 확인(수정/삭제는 미기록)
8. (가능하면) member 계정으로 미담당 학생 접근 시 일정 조회/등록 차단(RLS) 확인

- [ ] **Step 5: Commit**

```bash
git add src/features/student-detail/ScheduleTab.tsx src/features/student-detail/StudentDetailPage.tsx
git commit -m "feat(schedule): 학생 상세 일정 탭 구현 (등록·수정·삭제, 다가오는/지난 분리)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 완료 기준

- 5개 태스크 전부 커밋됨, `npm run build` 통과
- Task 5 Step 4의 수동 검증 시나리오 전부 통과
- 스펙의 "범위 제외" 항목(개인 일정, 전역 캘린더, 그리드 뷰, 외부 연동, 알림, 반복, 종일 토글)은 구현하지 않음

## Self-Review 메모

- 스펙 커버리지: 테이블/RLS(Task 1), 타입·시간 유틸(Task 2), 서비스 CRUD+검증+타임라인(Task 3), 폼 모달(Task 4), 에이전트 목록+수정/삭제+라우팅(Task 5) — 스펙 각 절이 태스크에 매핑됨.
- 타입 일관성: `ScheduleInput`(startAt/endAt/memo)·`StudentSchedule`(start_at/end_at/memo) 명칭이 Task 3~5에서 일치. `localInputsToISO`/`isoToLocalInputs`는 Task 2에서 정의되고 Task 4에서만 사용.
- `schedule` ActivityType와 '일정' 라벨은 기존에 존재 → types 변경 없음(Global Constraints에 명시).
