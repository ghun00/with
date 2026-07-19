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
