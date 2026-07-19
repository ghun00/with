import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react'

const base =
  'w-full rounded-field border border-line bg-surface px-3 text-body text-fg placeholder:text-fg-tertiary transition-colors hover:border-line-strong focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100 disabled:bg-sunken disabled:text-fg-disabled'

export function Label({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-label text-fg-secondary">
      {children}
      {required && <span className="ml-0.5 text-danger">*</span>}
    </label>
  )
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${base} h-10 ${className}`} {...props} />
}

const chevron = `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239CA1AB' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`

export function Select({ className = '', style, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`${base} h-10 appearance-none bg-no-repeat pr-9 ${className}`}
      style={{
        backgroundImage: chevron,
        backgroundPosition: 'right 12px center',
        backgroundSize: '16px 16px',
        ...style,
      }}
      {...props}
    />
  )
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${base} py-2.5 ${className}`} {...props} />
}
