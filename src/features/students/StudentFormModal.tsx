import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchGroupMembers } from '@/services/groups'
import { createStudent, updateStudent, type StudentInput } from '@/services/students'
import { useGroup } from '@/features/group/GroupProvider'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Field'
import { Dropdown } from '@/components/ui/Dropdown'
import { Modal } from '@/components/ui/Modal'
import { formatPhoneInput } from '@/lib/format'
import { STUDENT_STATUS_LABEL, type StudentListItem, type StudentStatus } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  student?: StudentListItem | null
}

const EMPTY: StudentInput = {
  name: '',
  school: '',
  grade: '',
  student_phone: '',
  parent_phone: '',
  status: 'active',
  primaryConsultantId: null,
  coConsultantIds: [],
}

export function StudentFormModal({ open, onClose, student }: Props) {
  const { current, isOwner } = useGroup()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<StudentInput>(EMPTY)

  const groupId = current?.group.id

  useEffect(() => {
    if (!open) return
    if (student) {
      setForm({
        name: student.name,
        school: student.school,
        grade: student.grade,
        student_phone: student.student_phone,
        parent_phone: student.parent_phone,
        status: student.status,
        primaryConsultantId:
          student.assignments.find((a) => a.role === 'primary')?.user_id ?? null,
        coConsultantIds: student.assignments.filter((a) => a.role === 'co').map((a) => a.user_id),
      })
    } else {
      setForm(EMPTY)
    }
  }, [open, student])

  const { data: members = [] } = useQuery({
    queryKey: ['groupMembers', groupId],
    queryFn: () => fetchGroupMembers(groupId!),
    enabled: open && Boolean(groupId),
  })

  const mutation = useMutation({
    mutationFn: async () => {
      if (student) {
        await updateStudent(student.id, form)
      } else {
        await createStudent(groupId!, form)
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['students'] })
      void queryClient.invalidateQueries({ queryKey: ['student', student?.id] })
      void queryClient.invalidateQueries({ queryKey: ['activities', student?.id] })
      onClose()
    },
  })

  const set = <K extends keyof StudentInput>(key: K, value: StudentInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const valid =
    form.name.trim() &&
    form.school.trim() &&
    form.grade.trim() &&
    form.student_phone.trim() &&
    form.parent_phone.trim()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={student ? '학생 정보 수정' : '학생 등록'}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? '저장 중...' : student ? '저장' : '등록'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label required>이름</Label>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="홍길동" />
        </div>
        <div>
          <Label required>학교</Label>
          <Input value={form.school} onChange={(e) => set('school', e.target.value)} placeholder="OO고등학교" />
        </div>
        <div>
          <Label required>학년</Label>
          <Dropdown
            options={['1학년', '2학년', '3학년', 'N수'].map((g) => ({ value: g, label: g }))}
            value={form.grade || null}
            onChange={(v) => set('grade', v)}
          />
        </div>
        <div>
          <Label>관리 상태</Label>
          <Dropdown<StudentStatus>
            options={Object.entries(STUDENT_STATUS_LABEL).map(([value, label]) => ({
              value: value as StudentStatus,
              label,
            }))}
            value={form.status}
            onChange={(v) => set('status', v)}
          />
        </div>
        <div>
          <Label required>학생 연락처</Label>
          <Input
            type="tel"
            inputMode="numeric"
            value={form.student_phone}
            onChange={(e) => set('student_phone', formatPhoneInput(e.target.value))}
            placeholder="010-0000-0000"
          />
        </div>
        <div>
          <Label required>학부모 연락처</Label>
          <Input
            type="tel"
            inputMode="numeric"
            value={form.parent_phone}
            onChange={(e) => set('parent_phone', formatPhoneInput(e.target.value))}
            placeholder="010-0000-0000"
          />
        </div>
        <div>
          <Label>주 담당 컨설턴트</Label>
          <Dropdown
            options={members.map((m) => ({ value: m.user_id, label: m.profile?.name || '이름 없음' }))}
            value={form.primaryConsultantId}
            onChange={(id) => {
              setForm((prev) => ({
                ...prev,
                primaryConsultantId: id,
                coConsultantIds: prev.coConsultantIds.filter((c) => c !== id),
              }))
            }}
            placeholder="미지정"
            disabled={!isOwner}
          />
          {!isOwner && <p className="mt-1 text-caption text-fg-tertiary">주 담당자 변경은 대표 관리자만 가능합니다.</p>}
        </div>
        <div>
          <Label>공동 담당 컨설턴트</Label>
          <div className="max-h-32 space-y-1.5 overflow-y-auto rounded-field border border-line p-3">
            {members
              .filter((m) => m.user_id !== form.primaryConsultantId)
              .map((m) => (
                <label key={m.user_id} className="flex items-center gap-2 text-body">
                  <input
                    type="checkbox"
                    className="rounded border-line-strong text-accent-500 focus:ring-accent-500"
                    checked={form.coConsultantIds.includes(m.user_id)}
                    onChange={(e) =>
                      set(
                        'coConsultantIds',
                        e.target.checked
                          ? [...form.coConsultantIds, m.user_id]
                          : form.coConsultantIds.filter((id) => id !== m.user_id),
                      )
                    }
                  />
                  {m.profile?.name || '이름 없음'}
                </label>
              ))}
            {members.length === 0 && <p className="text-caption text-fg-tertiary">멤버가 없습니다.</p>}
          </div>
        </div>
      </div>
      {mutation.isError && (
        <p className="mt-4 text-body text-danger">저장에 실패했습니다: {mutation.error.message}</p>
      )}
    </Modal>
  )
}
