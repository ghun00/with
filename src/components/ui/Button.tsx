import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent-500 text-white hover:bg-accent-600 active:bg-accent-700 disabled:bg-accent-200',
  secondary:
    'bg-surface text-fg border border-line hover:bg-sunken active:bg-line disabled:text-fg-disabled',
  ghost: 'text-fg-secondary hover:bg-sunken hover:text-fg disabled:text-fg-disabled',
  danger: 'bg-surface text-danger border border-line hover:border-danger/40 hover:bg-danger-soft disabled:text-fg-disabled',
}

const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-label',
  md: 'h-10 px-4 text-label',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-field font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 disabled:cursor-not-allowed ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...props}
    />
  )
}
