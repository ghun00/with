export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '-'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '-'
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '-'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '-'
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${formatDate(d)} ${hh}:${mm}`
}

// 입력 중인 전화번호에 하이픈 자동 삽입 (02 지역번호, 010 휴대폰 모두 지원)
export function formatPhoneInput(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.startsWith('02')) {
    if (d.length < 3) return d
    if (d.length < 6) return `${d.slice(0, 2)}-${d.slice(2)}`
    if (d.length < 10) return `${d.slice(0, 2)}-${d.slice(2, d.length - 4)}-${d.slice(-4)}`
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`
  }
  if (d.length < 4) return d
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`
  if (d.length < 11) return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
}

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return '-'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '-'
  const diffMs = Date.now() - d.getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}일 전`
  return formatDate(d)
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
