import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Field'
import { MAX_AI_SOURCE_LENGTH } from '@/services/ai'

// AI 원문 입력 카드: 직접 붙여넣기 + TXT 파일 업로드 (prd §6.7 원문 등록)
export function AiSourceInput({
  value,
  onChange,
  placeholder,
  disabled,
  maxLength = MAX_AI_SOURCE_LENGTH,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  maxLength?: number
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileError, setFileError] = useState('')
  const over = value.length > maxLength

  const handleFile = (file: File | undefined) => {
    setFileError('')
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.txt')) {
      setFileError('TXT 파일만 업로드할 수 있습니다.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      if (!text.trim()) {
        setFileError('빈 파일입니다. 내용이 있는 파일을 업로드해 주세요.')
        return
      }
      onChange(text)
    }
    reader.onerror = () => setFileError('파일을 읽지 못했습니다. 다시 시도해 주세요.')
    reader.readAsText(file)
  }

  return (
    <div>
      <Textarea
        rows={8}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
          >
            TXT 파일 업로드
          </Button>
          {fileError && <span className="text-caption text-danger">{fileError}</span>}
        </div>
        <span className={`text-caption ${over ? 'text-danger' : 'text-fg-tertiary'}`}>
          {value.length.toLocaleString()} / {maxLength.toLocaleString()}자
        </span>
      </div>
      {over && (
        <p className="mt-2 rounded-field bg-danger-soft px-3 py-2 text-caption text-danger">
          원문이 최대 길이를 넘었습니다. 약 {(value.length - maxLength).toLocaleString()}자를 줄이거나
          내용을 나눠서 등록해 주세요.
        </p>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".txt,text/plain"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}
