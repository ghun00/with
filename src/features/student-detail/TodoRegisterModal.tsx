import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createStudentActivity } from '@/services/studentActivities'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/Field'
import { Dropdown } from '@/components/ui/Dropdown'
import { Modal } from '@/components/ui/Modal'
import {
  STUDENT_ACTIVITY_CATEGORY_LABEL,
  type StudentActivityCategory,
} from '@/types'

// AI가 추출한 To Do를 검토 후 선택 등록한다 (prd §6.6: 자동 등록 금지, 확인 후 선택 등록).
// 선택 항목은 활동 관리에 '진행 예정' 상태의 활동으로 생성된다.
export function TodoRegisterModal({
  open,
  onClose,
  studentId,
  studentTodos,
  consultantTodos,
}: {
  open: boolean
  onClose: () => void
  studentId: string
  studentTodos: string[]
  consultantTodos: string[]
}) {
  const queryClient = useQueryClient()
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [category, setCategory] = useState<StudentActivityCategory>('기타')

  useEffect(() => {
    if (open) {
      setChecked(new Set())
      setCategory('기타')
    }
  }, [open])

  const toggle = (key: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectedNames = [
    ...studentTodos.filter((_, i) => checked.has(`s-${i}`)),
    ...consultantTodos.filter((_, i) => checked.has(`c-${i}`)),
  ]

  const registerMutation = useMutation({
    mutationFn: async () => {
      // 활동별 이력·타임라인 로깅이 기존 생성 경로로 수행되도록 순차 호출한다
      for (const name of selectedNames) {
        await createStudentActivity({
          studentId,
          name,
          status: 'planned',
          category,
          dueDate: null,
          detail: '',
        })
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['studentActivities', studentId] })
      void queryClient.invalidateQueries({ queryKey: ['activities', studentId] })
      onClose()
    },
  })

  const renderList = (title: string, items: string[], prefix: 's' | 'c') => (
    <div>
      <Label>{title}</Label>
      {items.length === 0 ? (
        <p className="py-1 text-body text-fg-tertiary">추출된 항목이 없습니다.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item, i) => {
            const key = `${prefix}-${i}`
            return (
              <li key={key}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-field px-2 py-1.5 transition-colors hover:bg-sunken">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-accent-500"
                    checked={checked.has(key)}
                    onChange={() => toggle(key)}
                  />
                  <span className="text-body text-fg">{item}</span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="To Do 활동 등록"
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={registerMutation.isPending}>
            취소
          </Button>
          <Button
            disabled={selectedNames.length === 0 || registerMutation.isPending}
            onClick={() => registerMutation.mutate()}
          >
            {registerMutation.isPending
              ? '등록 중...'
              : `${selectedNames.length}개 등록`}
          </Button>
        </>
      }
    >
      <div className="space-y-5 pb-4">
        <p className="text-body text-fg-secondary">
          선택한 항목이 활동 관리에 <strong className="font-medium text-fg">진행 예정</strong> 상태로
          등록됩니다. 등록할 항목만 선택해 주세요.
        </p>
        {registerMutation.isError && (
          <p className="rounded-field bg-danger-soft px-3 py-2 text-body text-danger">
            등록에 실패했습니다. 다시 시도해 주세요.
          </p>
        )}
        {renderList('학생 To Do', studentTodos, 's')}
        {renderList('컨설턴트 To Do', consultantTodos, 'c')}
        <div>
          <Label>활동 분류</Label>
          <Dropdown<StudentActivityCategory>
            options={(Object.keys(STUDENT_ACTIVITY_CATEGORY_LABEL) as StudentActivityCategory[]).map((c) => ({
              value: c,
              label: STUDENT_ACTIVITY_CATEGORY_LABEL[c],
            }))}
            value={category}
            onChange={setCategory}
            className="w-56"
          />
        </div>
      </div>
    </Modal>
  )
}
