import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { hasSeenHint, markHintSeen } from '../lib/onboarding'

interface OnboardingHintProps {
  hintId: string
  children: React.ReactNode
  /** ms before auto-dismiss; default 5000 */
  autoDismissMs?: number
}

/**
 * Contextual one-time hint toast. Shows once per hintId, then never again.
 * Renders at the bottom of the screen above BottomNav.
 */
export function OnboardingHint({ hintId, children, autoDismissMs = 5000 }: OnboardingHintProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!hasSeenHint(hintId)) {
      markHintSeen(hintId)
      setVisible(true)
      const t = setTimeout(() => setVisible(false), autoDismissMs)
      return () => clearTimeout(t)
    }
  }, [hintId, autoDismissMs])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 8, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-x-4 z-[80] flex items-start gap-3 rounded-xl bg-zinc-900 px-4 py-3 shadow-2xl"
          style={{ bottom: 84 }}
          onClick={() => setVisible(false)}
          role="status"
          aria-live="polite"
        >
          <svg
            className="mt-0.5 h-4 w-4 shrink-0 text-brandTeal"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
            />
          </svg>
          <p className="flex-1 text-[13px] leading-relaxed text-white/90">{children}</p>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setVisible(false) }}
            className="shrink-0 text-zinc-500 hover:text-zinc-300"
            aria-label="Lukk"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
