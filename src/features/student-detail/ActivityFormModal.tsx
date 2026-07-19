import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createStudentActivity } from '@/services/studentActivities'
import { Button } from '@/components/ui/Button'
import { Input, Label, Textarea } from '@/components/ui/Field'
import { Dropdown } from '@/components/ui/Dropdown'
import { Modal } from '@/components/ui/Modal'
import {
  STUDENT_ACTIVITY_CATEGORY_LABEL,
  STUDENT_ACTIVITY_STATUS_LABEL,
  type StudentActivityCategory,
  type StudentActivityStatus,
} from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  studentId: string
  onCreated: (activityId: string) => void
}

export function ActivityFormModal({ open, onClose, studentId, onCreated }: Props) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [status, setStatus] = useState<StudentActivityStatus>('planned')
  const [category, setCategory] = useState<StudentActivityCategory | null>(null)
  const [dueDate, setDueDate] = useState('')
  const [detail, setDetail] = useState('')

  const reset = () => {
    setName('')
    setStatus('planned')
    setCategory(null)
    setDueDate('')
    setDetail('')
  }

  const mutation = useMutation({
    mutationFn: () =>
      createStudentActivity({
        studentId,
        name: name.trim(),
        status,
        category: category!,
        dueDate: dueDate || null,
        detail: detail.trim(),
      }),
    onSuccess: (newId) => {
      void queryClient.invalidateQueries({ queryKey: ['studentActivities', studentId] })
      void queryClient.invalidateQueries({ queryKey: ['activities', studentId] })
      void queryClient.invalidateQueries({ queryKey: ['students'] })
      reset()
      onCreated(newId)
      onClose()
    },
  })

  const valid = name.trim() && category

  return (
    <Modal
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title="활동 생성"
      wide
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              reset()
              onClose()
            }}
          >
            취소
          </Button>
          <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? '등록 중...' : '등록'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label required>활동명</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 자율활동 보고서 작성" />
        </div>
        <div>
          <Label>현재 상태</Label>
          <Dropdown<StudentActivityStatus>
            options={Object.entries(STUDENT_ACTIVITY_STATUS_LABEL).map(([value, label]) => ({
              value: value as StudentActivityStatus,
              label,
            }))}
            value={status}
            onChange={setStatus}
          />
        </div>
        <div>
          <Label required>활동 분류</Label>
          <Dropdown<StudentActivityCategory>
            options={Object.entries(STUDENT_ACTIVITY_CATEGORY_LABEL).map(([value, label]) => ({
              value: value as StudentActivityCategory,
              label,
            }))}
            value={category}
            onChange={setCategory}
          />
        </div>
        <div>
          <Label>마감일</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="col-span-2">
          <Label>활동 세부 내용</Label>
          <Textarea
            rows={6}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="활동 세부 내용을 입력하세요"
          />
        </div>
      </div>
      {mutation.isError && (
        <p className="mt-4 text-body text-danger">등록에 실패했습니다: {mutation.error.message}</p>
      )}
    </Modal>
  )
}
