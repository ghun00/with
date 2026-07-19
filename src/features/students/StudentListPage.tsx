import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchStudents } from '@/services/students'
import { useGroup } from '@/features/group/GroupProvider'
import { StudentFormModal } from './StudentFormModal'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Toolbar } from '@/components/ui/Toolbar'
import { Chip } from '@/components/ui/Chip'
import { Table, THead, Th, Tr, Td } from '@/components/ui/Table'
import { Badge, STUDENT_STATUS_TONE } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatRelative } from '@/lib/format'
import { STUDENT_STATUS_LABEL, type StudentListItem, type StudentStatus } from '@/types'

export function StudentListPage() {
  const navigate = useNavigate()
  const { current, isOwner } = useGroup()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StudentStatus | ''>('')
  const [consultantFilter, setConsultantFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)

  const groupId = current!.group.id

  const { data: students, isLoading } = useQuery({
    queryKey: ['students', groupId],
    queryFn: () => fetchStudents(groupId),
  })

  const consultants = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of students ?? []) {
      for (const a of s.assignments) {
        if (a.profile) map.set(a.user_id, a.profile.name)
      }
    }
    return [...map.entries()]
  }, [students])

  const filtered = useMemo(() => {
    return (students ?? []).filter((s) => {
      const q = search.trim().toLowerCase()
      if (q && !s.name.toLowerCase().includes(q) && !s.school.toLowerCase().includes(q)) return false
      if (statusFilter && s.status !== statusFilter) return false
      if (consultantFilter && !s.assignments.some((a) => a.user_id === consultantFilter)) return false
      return true
    })
  }, [students, search, statusFilter, consultantFilter])

  const activeFilterCount = (statusFilter ? 1 : 0) + (consultantFilter ? 1 : 0)

  const primaryOf = (s: StudentListItem) => s.assignments.find((a) => a.role === 'primary')
  const cosOf = (s: StudentListItem) => s.assignments.filter((a) => a.role === 'co')

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <PageHeader
        title="학생"
        description={isOwner ? '그룹의 전체 학생을 관리합니다.' : '담당 중인 학생 목록입니다.'}
        cta={isOwner ? <Button onClick={() => setFormOpen(true)}>학생 등록</Button> : undefined}
      />

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="이름, 학교 검색"
        activeFilterCount={activeFilterCount}
        onReset={() => {
          setStatusFilter('')
          setConsultantFilter('')
        }}
      >
        {(Object.entries(STUDENT_STATUS_LABEL) as [StudentStatus, string][]).map(([value, label]) => (
          <Chip
            key={value}
            selected={statusFilter === value}
            onClick={() => setStatusFilter(statusFilter === value ? '' : value)}
          >
            {label}
          </Chip>
        ))}
        {consultants.length > 1 && <div className="mx-1 h-4 w-px bg-line" />}
        {consultants.length > 1 &&
          consultants.map(([id, name]) => (
            <Chip
              key={id}
              selected={consultantFilter === id}
              onClick={() => setConsultantFilter(consultantFilter === id ? '' : id)}
            >
              {name}
            </Chip>
          ))}
      </Toolbar>

      {isLoading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={students?.length ? '조건에 맞는 학생이 없습니다.' : '등록된 학생이 없습니다.'}
          description={
            students?.length
              ? '검색어나 필터를 변경해보세요.'
              : isOwner
                ? '첫 학생을 등록하고 관리를 시작하세요.'
                : '대표 관리자가 학생을 배정하면 여기에 표시됩니다.'
          }
          action={
            isOwner && !students?.length ? (
              <Button onClick={() => setFormOpen(true)}>학생 등록</Button>
            ) : undefined
          }
        />
      ) : (
        <Table>
          <THead>
            <Th>학생</Th>
            <Th>학교·학년</Th>
            <Th>상태</Th>
            <Th>주 담당</Th>
            <Th>공동 담당</Th>
            <Th>최근 관리</Th>
            <Th align="right">진행 중인 활동</Th>
          </THead>
          <tbody>
            {filtered.map((s) => {
              const primary = primaryOf(s)
              const cos = cosOf(s)
              return (
                <Tr key={s.id} onClick={() => navigate(`/students/${s.id}`)}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={s.name} />
                      <span className="font-medium">{s.name}</span>
                    </div>
                  </Td>
                  <Td muted>
                    {s.school} {s.grade}
                  </Td>
                  <Td>
                    <Badge tone={STUDENT_STATUS_TONE[s.status]}>{STUDENT_STATUS_LABEL[s.status]}</Badge>
                  </Td>
                  <Td muted>{primary?.profile?.name ?? '-'}</Td>
                  <Td muted>
                    {cos.length ? cos.map((a) => a.profile?.name).filter(Boolean).join(', ') : '-'}
                  </Td>
                  <Td muted>{formatRelative(s.lastActivityAt)}</Td>
                  <Td align="right">
                    {s.activeActivityCount > 0 ? (
                      <Badge tone="accent">{s.activeActivityCount}</Badge>
                    ) : (
                      <span className="text-fg-disabled">0</span>
                    )}
                  </Td>
                </Tr>
              )
            })}
          </tbody>
        </Table>
      )}

      <StudentFormModal open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  )
}
