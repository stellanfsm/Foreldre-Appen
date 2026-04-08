import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { springSnappy } from '../lib/motion'
import { TOUR_STEPS, loadOnboarding, saveOnboarding, type OnboardingState } from '../lib/onboarding'

interface OnboardingTourProps {
  onComplete: () => void
}

const RING_PAD = 8

function useRingRect(targetId: string | null) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null)

  useEffect(() => {
    if (!targetId) {
      setRect(null)
      return
    }
    let raf: number
    function measure() {
      const el = document.getElementById(targetId!)
      if (el) {
        const r = el.getBoundingClientRect()
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
      } else {
        setRect(null)
      }
    }
    raf = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(raf)
  }, [targetId])

  return rect
}

export function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const [state, setState] = useState<OnboardingState>(() => loadOnboarding())

  const step = TOUR_STEPS[state.tourStep] ?? TOUR_STEPS[TOUR_STEPS.length - 1]
  const isLast = state.tourStep >= TOUR_STEPS.length - 1
  const ringRect = useRingRect(step.targetId)

  const advance = useCallback(() => {
    if (isLast) {
      const next: OnboardingState = { ...state, tourCompleted: true }
      saveOnboarding(next)
      onComplete()
      return
    }
    const next: OnboardingState = { ...state, tourStep: state.tourStep + 1 }
    setState(next)
    saveOnboarding(next)
  }, [state, isLast, onComplete])

  const skip = useCallback(() => {
    const next: OnboardingState = { ...state, tourCompleted: true }
    saveOnboarding(next)
    onComplete()
  }, [state, onComplete])

  return (
    <>
      {/* Dim backdrop — intercepts taps so the app doesn't react during the tour */}
      <div className="fixed inset-0 z-[90] bg-black/25 pointer-events-auto" aria-hidden />

      {/* Spotlight ring around target element */}
      {ringRect && (
        <div
          className="pointer-events-none fixed z-[91] rounded-xl"
          style={{
            top: ringRect.top - RING_PAD,
            left: ringRect.left - RING_PAD,
            width: ringRect.width + RING_PAD * 2,
            height: ringRect.height + RING_PAD * 2,
            boxShadow:
              '0 0 0 3px rgba(59,207,197,1), 0 0 0 7px rgba(59,207,197,0.35)',
          }}
          aria-hidden
        />
      )}

      {/* Hint card — sits above BottomNav (72px) */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          className="fixed inset-x-4 z-[92] rounded-2xl bg-white p-5 shadow-2xl"
          style={{ bottom: 84 }}
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 8, opacity: 0 }}
          transition={springSnappy}
          role="dialog"
          aria-label={step.title}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-brandTeal">
              {state.tourStep + 1} / {TOUR_STEPS.length}
            </span>
            <button
              type="button"
              onClick={skip}
              className="text-[12px] text-zinc-400 hover:text-zinc-600"
            >
              Hopp over
            </button>
          </div>

          <h3 className="mt-2 text-[16px] font-semibold text-zinc-900">{step.title}</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-600">{step.body}</p>

          <button
            type="button"
            onClick={advance}
            className="mt-4 w-full rounded-xl bg-brandTeal py-2.5 text-[14px] font-semibold text-white shadow-planner transition hover:brightness-95 active:translate-y-px"
          >
            {isLast ? 'Ferdig! 🎉' : 'Neste →'}
          </button>

          {/* Step progress dots */}
          <div className="mt-3 flex justify-center gap-1.5">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === state.tourStep ? 'w-5 bg-brandTeal' : 'w-1.5 bg-zinc-200'
                }`}
              />
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  )
}
