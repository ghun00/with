export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center py-12 ${className}`}>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-fg" />
    </div>
  )
}
