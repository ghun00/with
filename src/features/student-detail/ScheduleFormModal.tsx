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
