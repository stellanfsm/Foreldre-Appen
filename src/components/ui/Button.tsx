import { forwardRef } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'neutral' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Stretch to fill parent width (default true for md/lg, false for sm) */
  fullWidth?: boolean
  /** Shows a spinner and disables the button */
  loading?: boolean
}

const base =
  'font-semibold text-[14px] leading-none transition-all duration-120 focus:outline-none focus:ring-2 focus:ring-offset-2 touch-manipulation select-none'

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-primary-600 text-neutral-100 border border-transparent hover:bg-primary-700 active:bg-primary-800 active:shadow-press focus:ring-primary-500 disabled:bg-[#b9cdc1] disabled:text-neutral-100',
  secondary:
    'bg-transparent text-primary-700 border border-primary-700 hover:bg-primary-50 active:bg-primary-100 active:shadow-press focus:ring-primary-500 disabled:text-[#b9cdc1] disabled:border-[#d2dcd5] disabled:bg-transparent',
  danger:
    'bg-semantic-red-500 text-neutral-100 border border-transparent hover:bg-semantic-red-600 active:bg-semantic-red-700 active:shadow-press focus:ring-semantic-red-500 disabled:bg-[#f3c4c2] disabled:text-neutral-100',
  neutral:
    'bg-neutral-200 text-neutral-600 hover:bg-neutral-300 active:bg-neutral-400 focus:ring-neutral-300',
  ghost:
    'bg-transparent text-primary-700 border border-transparent hover:bg-primary-50 active:bg-primary-100 focus:ring-primary-500 disabled:text-[#b9cdc1] disabled:bg-transparent',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-[13px] rounded-md',
  md: 'h-10 px-[18px] py-[11px] text-[14px] rounded-md', // Exact padding from design assets
  lg: 'h-12 px-6 text-[15px] rounded-md',
}

const defaultWidth: Record<ButtonSize, boolean> = {
  sm: false,
  md: true,
  lg: true,
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      fullWidth,
      loading = false,
      className = '',
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const isFullWidth = fullWidth ?? defaultWidth[size]
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled || loading}
        className={`${base} ${variants[variant]} ${sizes[size]} ${isFullWidth ? 'w-full' : ''} ${className}`.trim()}
        {...props}
      >
        {loading ? (
          <span className="inline-flex gap-1 items-center">
            <span className="w-1 h-1 rounded-full bg-current opacity-40 animate-bounce" style={{ animationDelay: '0ms' }}></span>
            <span className="w-1 h-1 rounded-full bg-current opacity-40 animate-bounce" style={{ animationDelay: '120ms' }}></span>
            <span className="w-1 h-1 rounded-full bg-current opacity-40 animate-bounce" style={{ animationDelay: '240ms' }}></span>
          </span>
        ) : (
          children
        )}
      </button>
    )
  },
)
Button.displayName = 'Button'
