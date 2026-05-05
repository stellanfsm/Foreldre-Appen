import type { ReactNode } from 'react'

type Variant = 'error' | 'success' | 'warning' | 'info'

const styles: Record<Variant, string> = {
  error:   'border-semantic-red-100 bg-semantic-red-50 text-semantic-red-700',
  success: 'border-accent-mint-tint bg-accent-mint-tint text-primary-700',
  warning: 'border-accent-sun-tint bg-accent-sun-tint text-neutral-600',
  info:    'border-neutral-200 bg-neutral-50 text-neutral-600',
}

export function AppNotice({
  variant,
  children,
  onDismiss,
  className = '',
}: {
  variant: Variant
  children: ReactNode
  onDismiss?: () => void
  className?: string
}) {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[13px] leading-snug ${styles[variant]} ${className}`}
    >
      <div className="min-w-0 flex-1 break-words">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-full p-1 text-current opacity-70 hover:opacity-100"
          aria-label="Lukk melding"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
