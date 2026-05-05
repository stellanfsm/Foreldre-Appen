import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { inputBase, inputLabel, inputHint, inputError as inputErrorCls } from '../../lib/ui'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, className = '', id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
    const hasError = !!error
    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={inputId} className={inputLabel}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`${inputBase} ${hasError ? 'border-semantic-red-500 focus:border-semantic-red-600 focus:ring-semantic-red-500/15' : ''} ${className}`.trim()}
          aria-invalid={hasError || undefined}
          aria-describedby={
            hasError
              ? `${inputId}-error`
              : hint
                ? `${inputId}-hint`
                : undefined
          }
          {...props}
        />
        {hasError && (
          <p id={`${inputId}-error`} className={inputErrorCls} role="alert">
            {error}
          </p>
        )}
        {hint && !hasError && (
          <p id={`${inputId}-hint`} className={inputHint}>
            {hint}
          </p>
        )}
      </div>
    )
  },
)
Input.displayName = 'Input'

// ── Textarea variant ──────────────────────────────────────────────────────────

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
  autoResize?: boolean
  minRows?: number
  maxRows?: number
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    { label, hint, error, className = '', id, rows = 2, autoResize = false, minRows, maxRows, onInput, ...props },
    ref
  ) => {
    const textareaId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
    const hasError = !!error
    const innerRef = useRef<HTMLTextAreaElement | null>(null)
    useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement, [])

    const minRowsSafe = Math.max(1, minRows ?? rows)
    const maxRowsSafe = typeof maxRows === 'number' ? Math.max(minRowsSafe, maxRows) : null

    const resizeToContent = () => {
      const el = innerRef.current
      if (!el || !autoResize) return

      // Recalculate from natural content height each time.
      el.style.height = 'auto'

      const computed = window.getComputedStyle(el)
      const lineHeight = Number.parseFloat(computed.lineHeight)
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
        el.style.height = `${el.scrollHeight}px`
        el.style.overflowY = 'hidden'
        return
      }

      const borderTop = Number.parseFloat(computed.borderTopWidth) || 0
      const borderBottom = Number.parseFloat(computed.borderBottomWidth) || 0
      const baseBorder = borderTop + borderBottom
      const minHeight = lineHeight * minRowsSafe + baseBorder
      const maxHeight = maxRowsSafe ? lineHeight * maxRowsSafe + baseBorder : Number.POSITIVE_INFINITY
      const nextHeight = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight)

      el.style.height = `${nextHeight}px`
      el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
    }

    useEffect(() => {
      resizeToContent()
    }, [autoResize, minRowsSafe, maxRowsSafe, props.value])

    const base =
      'w-full rounded-md border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-body text-neutral-600 placeholder:text-neutral-400 outline-none resize-none transition-all duration-120 focus:border-primary-600 focus:bg-neutral-100 focus:ring-2 focus:ring-primary-600/15'
    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={textareaId} className={inputLabel}>
            {label}
          </label>
        )}
        <textarea
          ref={innerRef}
          id={textareaId}
          rows={rows}
          className={`${base} ${hasError ? 'border-semantic-red-500 focus:border-semantic-red-600 focus:ring-semantic-red-500/15' : ''} ${className}`.trim()}
          aria-invalid={hasError || undefined}
          aria-describedby={
            hasError
              ? `${textareaId}-error`
              : hint
                ? `${textareaId}-hint`
                : undefined
          }
          onInput={(e) => {
            resizeToContent()
            onInput?.(e)
          }}
          {...props}
        />
        {hasError && (
          <p id={`${textareaId}-error`} className={inputErrorCls} role="alert">
            {error}
          </p>
        )}
        {hint && !hasError && (
          <p id={`${textareaId}-hint`} className={inputHint}>
            {hint}
          </p>
        )}
      </div>
    )
  },
)
Textarea.displayName = 'Textarea'
