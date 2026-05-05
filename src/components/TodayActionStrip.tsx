import type { Event } from '../types'
import { formatTimeRange } from '../lib/time'
import { useFamily } from '../context/FamilyContext'
import { formatParticipantNamesLine } from '../lib/eventParticipants'
import { COPY } from '../lib/norwegianCopy'
import { useState } from 'react'

interface TodayActionStripProps {
  nextEvent: Event | null
  minutesUntilNext: number | null
  nextEventHasConflict: boolean
  laterConflictCount: number
  moveActionLabel: string
  onDismiss: () => void
  onOpenNext: () => void
  onMarkDone: () => void
  onConfirmNext: () => void
  onDelayNext: () => void
  onMoveNext: () => void
}

function statusLabel(minutesUntilNext: number | null): string {
  if (minutesUntilNext == null) return COPY.status.laterToday
  if (minutesUntilNext <= 5) return COPY.status.now
  if (minutesUntilNext <= 120) return COPY.status.next
  return COPY.status.laterToday
}

export function TodayActionStrip({
  nextEvent,
  minutesUntilNext,
  nextEventHasConflict,
  laterConflictCount,
  moveActionLabel,
  onDismiss,
  onOpenNext,
  onMarkDone,
  onConfirmNext,
  onDelayNext,
  onMoveNext,
}: TodayActionStripProps) {
  const { people } = useFamily()
  const showAction = Boolean(nextEvent)
  const who = nextEvent ? formatParticipantNamesLine(nextEvent, people) : ''
  const [showConflictHelp, setShowConflictHelp] = useState(false)

  return (
    <div className="mx-4 mt-2 rounded-card border border-neutral-200 bg-neutral-100 px-3.5 py-3 shadow-card md:px-4 md:py-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 md:text-[12px]">I dag</p>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <span className="rounded-full bg-primary-100 px-2.5 py-1 text-[11px] font-semibold text-primary-700">
            {statusLabel(minutesUntilNext)}
          </span>
          {nextEventHasConflict && (
            <div className="relative">
              <div className="flex items-center gap-1">
                <span className="rounded-full bg-accent-sun-tint px-2.5 py-1 text-[11px] font-semibold text-neutral-600">
                  {COPY.status.needsClarification}
                </span>
                <button
                  type="button"
                  onClick={() => setShowConflictHelp((v) => !v)}
                  aria-label="Hva betyr dette?"
                  className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-accent-sun-tint bg-neutral-100 text-[11px] font-semibold text-neutral-600"
                >
                  i
                </button>
              </div>
              {showConflictHelp && (
                <p className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-accent-sun-tint bg-neutral-100 px-2.5 py-2 text-[11px] font-medium leading-snug text-neutral-600 shadow-card">
                  {COPY.conflicts.badgeHelp}
                </p>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Skjul neste hendelse"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-neutral-300 text-neutral-400 transition hover:bg-neutral-200 hover:text-neutral-600"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      </div>
      {showAction ? (
        <>
          <button
            type="button"
            onClick={onOpenNext}
            className="mt-1 block w-full cursor-pointer text-left"
          >
            <p className="text-[14px] font-semibold text-neutral-600 md:text-[15px]">{nextEvent?.title}</p>
            <p className="mt-0.5 text-[12px] text-neutral-500 md:text-[13px]">
              {formatTimeRange(nextEvent!.start, nextEvent!.end)}
              {who !== 'Ukjent' ? ` · ${who}` : ''}
            </p>
          </button>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={onMarkDone}
              className="min-h-9 cursor-pointer rounded-full bg-primary-700 px-3 py-1.5 text-[12px] font-semibold text-neutral-100 transition hover:bg-primary-800"
            >
              {COPY.actions.done}
            </button>
            <button
              type="button"
              onClick={onConfirmNext}
              className="min-h-9 cursor-pointer rounded-full bg-primary-600 px-3 py-1.5 text-[12px] font-semibold text-neutral-100 transition hover:bg-primary-700"
            >
              {COPY.actions.confirm}
            </button>
            <button
              type="button"
              onClick={onDelayNext}
              className="min-h-9 cursor-pointer rounded-full border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-[12px] font-medium text-neutral-600 transition hover:bg-neutral-200"
            >
              {COPY.actions.postpone15}
            </button>
            <button
              type="button"
              onClick={onMoveNext}
              className="min-h-9 cursor-pointer rounded-full border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-[12px] font-medium text-neutral-600 transition hover:bg-neutral-200"
            >
              {moveActionLabel}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-neutral-500 md:text-[12px]">
            Flytt til i morgen flytter fra i dag {nextEvent!.start} til i morgen {nextEvent!.start}.
          </p>
          {!nextEventHasConflict && laterConflictCount > 0 && (
            <p className="mt-2 text-[11px] font-medium text-accent-sun-main">
              {laterConflictCount === 1
                ? COPY.conflicts.laterTodayOne
                : `${laterConflictCount} ${COPY.conflicts.laterTodayManySuffix}`}
            </p>
          )}
        </>
      ) : (
        <p className="mt-1 text-[12px] text-neutral-500">Ingen neste hendelse akkurat nå.</p>
      )}
    </div>
  )
}
