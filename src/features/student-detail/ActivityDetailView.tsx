import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addSubtask,
  deleteSubtask,
  fetchActivitySubtasks,
  fetchStudentActivity,
  toggleSubtask,
  updateActivityCategory,
  updateActivityDetail,
  updateActivityDueDate,
  updateActivityName,
  updateActivityStatus,
} from '@/services/studentActivities'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Field'
import { Dropdown } from '@/components/ui/Dropdown'
import { Badge, STUDENT_ACTIVITY_STATUS_TONE } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import {
  STUDENT_ACTIVITY_CATEGORY_LABEL,
  STUDENT_ACTIVITY_STATUS_LABEL,
  type StudentActivityCategory,
  type StudentActivitySubtask,
  type StudentActivityStatus,
} from '@/types'

export function ActivityDetailView({
  activityId,
  studentId,
  onBack,
}: {
  activityId: string
  studentId: string
  onBack: () => void
}) {
  const queryClient = useQueryClient()
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [editingDetail, setEditingDetail] = useState(false)
  const [detailDraft, setDetailDraft] = useState('')
  const [subtaskTitle, setSubtaskTitle] = useState('')

  const { data: activity, isLoading } = useQuery({
    queryKey: ['studentActivity', activityId],
    queryFn: () => fetchStudentActivity(activityId),
  })
  const { data: subtasks = [] } = useQuery({
    queryKey: ['activitySubtasks', activityId],
    queryFn: () => fetchActivitySubtasks(activityId),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['studentActivity', activityId] })
    void queryClient.invalidateQueries({ queryKey: ['activitySubtasks', activityId] })
    void queryClient.invalidateQueries({ queryKey: ['studentActivities', studentId] })
    void queryClient.invalidateQueries({ queryKey: ['activities', studentId] })
    void queryClient.invalidateQueries({ queryKey: ['students'] })
  }

  const statusMutation = useMutation({
    mutationFn: (status: StudentActivityStatus) => updateActivityStatus(activity!, status),
    onSuccess: invalidate,
  })
  const categoryMutation = useMutation({
    mutationFn: (category: StudentActivityCategory) => updateActivityCategory(activity!, category),
    onSuccess: invalidate,
  })
  const dueDateMutation = useMutation({
    mutationFn: (dueDate: string | null) => updateActivityDueDate(activity!, dueDate),
    onSuccess: invalidate,
  })
  const nameMutation = useMutation({
    mutationFn: () => updateActivityName(activity!, nameDraft.trim()),
    onSuccess: () => {
      setEditingName(false)
      invalidate()
    },
  })
  const detailMutation = useMutation({
    mutationFn: () => updateActivityDetail(activity!, detailDraft.trim()),
    onSuccess: () => {
      setEditingDetail(false)
      invalidate()
    },
  })
  const addSubtaskMutation = useMutation({
    mutationFn: () => addSubtask(activityId, subtaskTitle.trim(), subtasks.length),
    onSuccess: () => {
      setSubtaskTitle('')
      invalidate()
    },
  })
  const toggleSubtaskMutation = useMutation({
    mutationFn: (subtask: StudentActivitySubtask) => toggleSubtask(subtask),
    onSuccess: invalidate,
  })
  const deleteSubtaskMutation = useMutation({
    mutationFn: (subtask: StudentActivitySubtask) => deleteSubtask(subtask),
    onSuccess: invalidate,
  })

  if (isLoading) return <Spinner />
  if (!activity) return null

  const overdue =
    activity.due_date && activity.status !== 'completed' && activity.due_date < new Date().toISOString().slice(0, 10)
  const doneCount = subtasks.filter((s) => s.is_done).length

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="text-body text-fg-tertiary transition-colors hover:text-fg"
      >
        ← 활동 목록
      </button>

      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="mb-4 flex items-start justify-between gap-4">
          {editingName ? (
            <div className="flex flex-1 items-center gap-2">
              <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className="flex-1" />
              <Button variant="secondary" size="sm" onClick={() => setEditingName(false)}>
                취소
              </Button>
              <Button
                size="sm"
                disabled={!nameDraft.trim() || nameMutation.isPending}
                onClick={() => nameMutation.mutate()}
              >
                저장
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="text-heading">{activity.name}</h2>
              <button
                className="rounded-field px-2 py-1 text-caption text-fg-tertiary transition-colors hover:bg-sunken hover:text-fg"
                onClick={() => {
                  setNameDraft(activity.name)
                  setEditingName(true)
                }}
              >
                수정
              </button>
            </div>
          )}
          {activity.status !== 'completed' && (
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate('completed')}
            >
              활동 완료로 표시
            </Button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1.5 block text-label text-fg-secondary">현재 상태</label>
            <Dropdown<StudentActivityStatus>
              options={Object.entries(STUDENT_ACTIVITY_STATUS_LABEL).map(([value, label]) => ({
                value: value as StudentActivityStatus,
                label,
              }))}
              value={activity.status}
              onChange={(v) => statusMutation.mutate(v)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-label text-fg-secondary">활동 분류</label>
            <Dropdown<StudentActivityCategory>
              options={Object.entries(STUDENT_ACTIVITY_CATEGORY_LABEL).map(([value, label]) => ({
                value: value as StudentActivityCategory,
                label,
              }))}
              value={activity.category}
              onChange={(v) => categoryMutation.mutate(v)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-label text-fg-secondary">마감일</label>
            <Input
              type="date"
              value={activity.due_date ?? ''}
              onChange={(e) => dueDateMutation.mutate(e.target.value || null)}
            />
            {overdue && <p className="mt-1 text-caption font-medium text-danger">마감일이 지났습니다.</p>}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Badge tone={STUDENT_ACTIVITY_STATUS_TONE[activity.status]}>
            {STUDENT_ACTIVITY_STATUS_LABEL[activity.status]}
          </Badge>
          {activity.due_date && (
            <span className="text-caption text-fg-tertiary">마감 {formatDate(activity.due_date)}</span>
          )}
        </div>
      </div>

      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-label font-semibold text-fg-secondary">활동 세부 내용</h3>
          {!editingDetail && (
            <button
              className="rounded-field px-2 py-1 text-caption text-fg-tertiary transition-colors hover:bg-sunken hover:text-fg"
              onClick={() => {
                setDetailDraft(activity.detail)
                setEditingDetail(true)
              }}
            >
              수정
            </button>
          )}
        </div>
        {editingDetail ? (
          <div>
            <Textarea rows={8} value={detailDraft} onChange={(e) => setDetailDraft(e.target.value)} />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditingDetail(false)}>
                취소
              </Button>
              <Button size="sm" disabled={detailMutation.isPending} onClick={() => detailMutation.mutate()}>
                저장
              </Button>
            </div>
          </div>
        ) : activity.detail ? (
          <p className="whitespace-pre-wrap text-body text-fg">{activity.detail}</p>
        ) : (
          <p className="text-body text-fg-tertiary">아직 작성된 세부 내용이 없습니다.</p>
        )}
      </div>

      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-label font-semibold text-fg-secondary">세부 작업 목록</h3>
          {subtasks.length > 0 && (
            <span className="text-caption text-fg-tertiary">
              완료 {doneCount}/{subtasks.length}
            </span>
          )}
        </div>
        <ul className="mb-3 space-y-1">
          {subtasks.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-field px-1 py-1.5">
              <input
                type="checkbox"
                checked={s.is_done}
                onChange={() => toggleSubtaskMutation.mutate(s)}
                className="rounded border-line-strong text-accent-500 focus:ring-accent-500"
              />
              <span
                className={`flex-1 text-body ${s.is_done ? 'text-fg-disabled line-through' : 'text-fg'}`}
              >
                {s.title}
              </span>
              <button
                className="shrink-0 rounded-field p-1.5 text-fg-disabled transition-colors hover:bg-danger-soft hover:text-danger"
                onClick={() => deleteSubtaskMutation.mutate(s)}
                aria-label="삭제"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path
                    d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </li>
          ))}
          {subtasks.length === 0 && <p className="px-1 py-1.5 text-body text-fg-tertiary">등록된 세부 작업이 없습니다.</p>}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (subtaskTitle.trim()) addSubtaskMutation.mutate()
          }}
        >
          <Input
            value={subtaskTitle}
            onChange={(e) => setSubtaskTitle(e.target.value)}
            placeholder="세부 작업 추가"
            className="flex-1"
          />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={!subtaskTitle.trim() || addSubtaskMutation.isPending}
          >
            추가
          </Button>
        </form>
      </div>

    </div>
  )
}
