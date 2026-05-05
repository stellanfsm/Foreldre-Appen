import { forwardRef } from 'react'

export type SynkaButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon'
export type SynkaButtonSize = 'sm' | 'md' | 'lg'

export interface SynkaButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: SynkaButtonVariant
  size?: SynkaButtonSize
  /** Shows loading dots and disables the button */
  loading?: boolean
}

const base = 'font-semibold text-[14px] leading-none transition-all duration-120 focus:outline-none focus:ring-2 focus:ring-offset-2 touch-manipulation select-none'

const variants: Record<SynkaButtonVariant, string> = {
  primary:
    'bg-primary-600 text-white border border-transparent hover:bg-primary-700 active:bg-primary-800 active:shadow-press focus:ring-primary-500 disabled:bg-[#b9cdc1] disabled:text-white',
  secondary:
    'bg-transparent text-primary-700 border border-primary-700 hover:bg-primary-50 active:bg-primary-100 active:shadow-press focus:ring-primary-500 disabled:text-[#b9cdc1] disabled:border-[#d2dcd5] disabled:bg-transparent',
  ghost:
    'bg-transparent text-primary-700 border border-transparent hover:bg-primary-50 active:bg-primary-100 focus:ring-primary-500 disabled:text-[#b9cdc1] disabled:bg-transparent',
  danger:
    'bg-semantic-red-500 text-white border border-transparent hover:bg-semantic-red-600 active:bg-semantic-red-700 active:shadow-press focus:ring-semantic-red-500 disabled:bg-[#f3c4c2] disabled:text-white',
  icon:
    'bg-primary-600 text-white border border-transparent hover:bg-primary-700 active:bg-primary-800 active:shadow-press focus:ring-primary-500 disabled:bg-[#b9cdc1] disabled:text-white',
}

const sizes: Record<SynkaButtonSize, string> = {
  sm: 'h-9 px-4 text-[13px]',
  md: 'h-10 px-[18px] py-[11px]', // Exact padding from design assets
  lg: 'h-12 px-6 text-[15px]',
}

const iconSizes: Record<SynkaButtonSize, string> = {
  sm: 'w-9 h-9',
  md: 'w-10 h-10', // Standard icon button size from design assets
  lg: 'w-12 h-12',
}

// Loading dots animation component
const LoadingDots = () => (
  <span className="inline-flex gap-1 items-center">
    <span className="w-1 h-1 rounded-full bg-current opacity-40 animate-bounce" style={{ animationDelay: '0ms' }}></span>
    <span className="w-1 h-1 rounded-full bg-current opacity-40 animate-bounce" style={{ animationDelay: '120ms' }}></span>
    <span className="w-1 h-1 rounded-full bg-current opacity-40 animate-bounce" style={{ animationDelay: '240ms' }}></span>
  </span>
)

export const SynkaButton = forwardRef<HTMLButtonElement, SynkaButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      className = '',
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const isIcon = variant === 'icon'
    const baseClasses = isIcon 
      ? `${base} ${variants[variant]} ${iconSizes[size]} rounded-md flex items-center justify-center`
      : `${base} ${variants[variant]} ${sizes[size]} rounded-md inline-flex items-center justify-center gap-2`

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled || loading}
        className={`${baseClasses} ${className}`.trim()}
        {...props}
      >
        {loading ? (
          <LoadingDots />
        ) : (
          children
        )}
      </button>
    )
  },
)
SynkaButton.displayName = 'SynkaButton'

// Add the animation styles to index.css
export const synkaButtonStyles = `
  @keyframes bounce {
    0%, 80%, 100% {
      transform: translateY(0);
      opacity: 0.35;
    }
    40% {
      transform: translateY(-2px);
      opacity: 1;
    }
  }
  
  .duration-120 {
    transition-duration: 120ms;
  }
`
