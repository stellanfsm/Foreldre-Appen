import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { springSnappy } from '../lib/motion'
import { SHORT_TOUR_STEPS, EXTRA_TOUR_STEPS, loadOnboarding, saveOnboarding, type OnboardingState } from '../lib/onboarding'
import { logEvent } from '../lib/appLogger'
import { useAuth } from '../context/AuthContext'

interface OnboardingTourProps {
  onComplete: () => void
}

/** Padding around the spotlight ring (px) */
const RING_PAD = 8
/** Distance of the hint card from the top of the viewport when placed at top (px) */
const CARD_TOP_OFFSET = 16
/** Distance of the hint card from the bottom of the viewport — must clear the 72 px BottomNav (px) */
const CARD_BOTTOM_OFFSET = 88
/** Screen-height fraction above which a ring is considered "in the lower half" (0–1) */
const LOWER_HALF_THRESHOLD = 0.52
/** Estimated card height used to vertically center the card (px) */
const CARD_ESTIMATED_HEIGHT = 272

/**
 * Measures the bounding rect of a DOM element by ID.
 * Retries via requestAnimationFrame (up to ~25 frames ≈ 400 ms) so elements
 * that are freshly mounted (e.g. after a tab navigation) are reliably found.
 */
function useRingRect(targetId: string | null) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null)

  useEffect(() => {
    if (!targetId) {
      setRect(null)
      return
    }
    let rafId: number
    let attempts = 0
    const MAX_ATTEMPTS = 25

    function measure() {
      const el = document.getElementById(targetId!)
      if (el) {
        const r = el.getBoundingClientRect()
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
      } else if (attempts++ < MAX_ATTEMPTS) {
        rafId = requestAnimationFrame(measure)
      } else {
        setRect(null)
      }
    }
    rafId = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(rafId)
  }, [targetId])

  return rect
}

export function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const [state, setState] = useState<OnboardingState>(() => loadOnboarding(userId))
  const [showExtraTips, setShowExtraTips] = useState(false)

  const tourSteps = showExtraTips ? [...SHORT_TOUR_STEPS, ...EXTRA_TOUR_STEPS] : SHORT_TOUR_STEPS
  const currentStepIndex = Math.min(state.tourStep, tourSteps.length - 1)

  const step = tourSteps[currentStepIndex]
  const isLast = currentStepIndex >= tourSteps.length - 1
  const ringRect = useRingRect(step.targetId)

  useEffect(() => {
    logEvent('onboarding_started', { totalSteps: SHORT_TOUR_STEPS.length })
  }, [])

  useEffect(() => {
    logEvent('onboarding_step_shown', { stepId: step.id, stepIndex: currentStepIndex })
  }, [step.id, currentStepIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  const enableExtraTips = useCallback(() => {
    setShowExtraTips(true)
    logEvent('onboarding_expand_requested', { atStep: currentStepIndex, stepId: step.id })
  }, [currentStepIndex, step.id])

  const advance = useCallback(() => {
    if (isLast) {
      logEvent('onboarding_completed', { totalSteps: tourSteps.length, includesExtraTips: showExtraTips })
      const next: OnboardingState = { ...state, tourCompleted: true }
      saveOnboarding(next, userId)
      onComplete()
      return
    }
    const next: OnboardingState = { ...state, tourStep: currentStepIndex + 1 }
    setState(next)
    saveOnboarding(next, userId)
  }, [state, currentStepIndex, isLast, onComplete, showExtraTips, tourSteps.length, userId])

  const skip = useCallback(() => {
    logEvent('onboarding_exited', { atStep: currentStepIndex, stepId: step.id, includesExtraTips: showExtraTips })
    const next: OnboardingState = { ...state, tourCompleted: true }
    saveOnboarding(next, userId)
    onComplete()
  }, [state, currentStepIndex, showExtraTips, step.id, onComplete, userId])

  /**
   * Card placement priority:
   * 1. Explicit step.cardPlacement — evaluated on first render, no flash.
   * 2. Measurement heuristic — ring center below LOWER_HALF_THRESHOLD → top.
   * 3. Default — bottom (card sits above BottomNav).
   */
  const ringCenterY = ringRect ? ringRect.top + ringRect.height / 2 : 0
  const screenH = typeof window !== 'undefined' ? window.innerHeight : 800
  const cardCenter = step.cardPlacement === 'center'
  const cardAtTop =
    cardCenter
      ? false
      : step.cardPlacement === 'top'
        ? true
        : step.cardPlacement === 'bottom'
          ? false
          : ringRect !== null && ringCenterY > screenH * LOWER_HALF_THRESHOLD
  const cardCenterTop = Math.max(CARD_TOP_OFFSET, Math.round((screenH - CARD_ESTIMATED_HEIGHT) / 2))
  const cardPosition = cardCenter
    ? { top: cardCenterTop }
    : cardAtTop
      ? { top: CARD_TOP_OFFSET }
      : { bottom: CARD_BOTTOM_OFFSET }

  return (
    <>
      {/* Transparent click-blocker — prevents interaction with the app during the tour */}
      <div className="fixed inset-0 z-[90] pointer-events-auto" aria-hidden />

      {/* Spotlight ring.
          The outer box-shadow (9999 px spread) creates the full-screen dim effect.
          Inside the ring bounds the element shows through at its natural brightness.
          Separate from the click-blocker so its pointer-events-none keeps the ring visual-only. */}
      {ringRect ? (
        <div
          className="pointer-events-none fixed z-[91] rounded-xl"
          style={{
            top: ringRect.top - RING_PAD,
            left: ringRect.left - RING_PAD,
            width: ringRect.width + RING_PAD * 2,
            height: ringRect.height + RING_PAD * 2,
            boxShadow:
              '0 0 0 9999px rgba(0,0,0,0.45), 0 0 0 3px rgba(29,90,63,1), 0 0 0 7px rgba(29,90,63,0.35)',
          }}
          aria-hidden
        />
      ) : (
        /* No target element — fall back to a plain full-screen dim */
        <div className="pointer-events-none fixed inset-0 z-[91] bg-black/45" aria-hidden />
      )}

      {/* Demo block — shown on move-blocks step so users have a concrete block to look at */}
      {step.id === 'move-blocks' && ringRect && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[92]"
          style={{
            top: ringRect.top + 20,
            left: ringRect.left + 16,
            width: Math.min(ringRect.width - 32, 260),
            height: 64,
          }}
        >
          <div
            className="relative h-full overflow-hidden rounded-xl px-3 py-2 shadow-card"
            style={{ backgroundColor: 'rgb(233 241 236)', borderLeft: '6px solid rgb(29 90 63)' }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgb(29 90 63)' }}>Eksempel</p>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[13px] font-semibold text-neutral-600">Fotball trening</p>
              <p className="shrink-0 text-[11px] tabular-nums text-neutral-400">15:00–16:30</p>
            </div>
            {/* Drag handle */}
            <div className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-white/50 bg-white/70 shadow-sm">
              <svg className="h-3.5 w-3.5 text-neutral-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h8M8 12h8M8 18h8" />
              </svg>
            </div>
            {/* Pulse ring to draw attention to the drag handle */}
            <div
              className="absolute bottom-0.5 right-0.5 h-8 w-8 animate-ping rounded-full opacity-25"
              style={{ backgroundColor: 'rgb(29 90 63)' }}
            />
          </div>
        </div>
      )}

      {/* Hint card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          className="fixed inset-x-4 z-[93] rounded-xl bg-neutral-100 p-5 shadow-2xl"
          style={cardPosition}
          initial={{ y: cardCenter ? 0 : cardAtTop ? -16 : 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: cardCenter ? 0 : cardAtTop ? -8 : 8, opacity: 0 }}
          transition={springSnappy}
          role="dialog"
          aria-label={step.title}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-primary-600">
              {currentStepIndex + 1} / {tourSteps.length}
            </span>
            <button
              type="button"
              onClick={skip}
              className="text-[12px] text-neutral-400 hover:text-neutral-600"
            >
              Hopp over
            </button>
          </div>

          <h3 className="mt-2 text-[16px] font-semibold text-neutral-600">{step.title}</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">{step.body}</p>

          {!showExtraTips && (
            <button
              type="button"
              onClick={enableExtraTips}
              className="mt-3 w-full rounded-lg border border-neutral-200 bg-neutral-100 py-2 text-[13px] font-medium text-neutral-600 transition hover:bg-neutral-50 active:translate-y-px"
            >
              Lær mer (ekstra tips)
            </button>
          )}

          <button
            type="button"
            onClick={advance}
            className="mt-3 w-full rounded-lg bg-primary-600 py-2.5 text-[14px] font-semibold text-neutral-100 shadow-card transition hover:bg-primary-700 active:translate-y-px"
          >
            {isLast ? 'Ferdig! 🎉' : 'Neste →'}
          </button>

          {/* Step progress dots */}
          <div className="mt-3 flex justify-center gap-1.5">
            {tourSteps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === currentStepIndex ? 'w-5 bg-primary-600' : 'w-1.5 bg-neutral-200'
                }`}
              />
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  )
}
