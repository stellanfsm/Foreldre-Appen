import { useRef, useCallback, useState, useEffect, useLayoutEffect } from 'react'
import { motion, useAnimation, useReducedMotion } from 'framer-motion'
import type { DragReschedulePayload, EventLayoutBlock, PersonId } from '../types'
import { useFamily } from '../context/FamilyContext'
import { formatTimeRange, shiftTime } from '../lib/time'
import { getEventParticipantIds } from '../lib/schedule'
import { blockEntranceDelay, springSnappy } from '../lib/motion'

interface ActivityBlockProps {
  block: EventLayoutBlock
  onSelect: () => void
  onDragReschedule?: (eventId: string, payload: DragReschedulePayload) => void | Promise<void>
  pixelsPerHour?: number
  /** Stagger order when the day timeline first appears */
  staggerIndex?: number
}

const DRAG_THRESHOLD_PX = 4
const SNAP_MINUTES = 5

export function ActivityBlock({
  block,
  onSelect,
  onDragReschedule,
  pixelsPerHour = 80,
  staggerIndex = 0,
}: ActivityBlockProps) {
  const { people } = useFamily()
  const reducedMotion = useReducedMotion() ?? false
  const controls = useAnimation()
  const primaryPersonFallback =
    people.find((p) => p.id === block.personId) ?? {
    id: 'ukjent',
    name: 'Ukjent',
    colorTint: '#e5e7eb',
    colorAccent: '#71717a',
  }

  const participantIds = getEventParticipantIds(block)

  const participants = participantIds
    .map((id) => people.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p)

  const primaryPerson = participants[0] ?? primaryPersonFallback

  const transport = (block.metadata as any)?.transport as
    | { dropoffBy?: PersonId; pickupBy?: PersonId }
    | undefined
  const dropoffPerson = transport?.dropoffBy
    ? people.find((p) => p.id === transport.dropoffBy) ?? null
    : null
  const pickupPerson = transport?.pickupBy
    ? people.find((p) => p.id === transport.pickupBy) ?? null
    : null

  const widthPercent = block.totalColumns > 1 ? 100 / block.totalColumns : 100
  const leftPercent = block.totalColumns > 1 ? (block.columnIndex / block.totalColumns) * 100 : 0
  const rawHeight = block.heightPx
  const compactThresholdPx = 44
  /** Below this, stacked title+time is cramped — use a single horizontal row instead */
  const stackedShortThresholdPx = 58
  const tallThresholdPx = 72
  /** Not enough vertical space for a readable title line + padding → show color only */
  const blankBelowPx = 18
  /** Enough for one title line, not for title + time in one row */
  const titleOnlyBelowPx = 32
  const isCompact = rawHeight < compactThresholdPx
  const isMedium = !isCompact && rawHeight < tallThresholdPx
  const useShortRow = isCompact || (isMedium && rawHeight < stackedShortThresholdPx)
  const showBlank = rawHeight < blankBelowPx
  const showTitleOnly = !showBlank && rawHeight < titleOnlyBelowPx
  /** Title + time on one row needs more height than title alone */
  const showTitleAndTime = useShortRow && !showBlank && !showTitleOnly
  const visualHeight = rawHeight

  const [dragOffsetY, setDragOffsetY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isPendingCommit, setIsPendingCommit] = useState(false)
  const dragStartRef = useRef<{ y: number; pointerId: number } | null>(null)
  const didDragRef = useRef(false)
  const dragHandleActiveRef = useRef(false)
  const suppressNextSelectRef = useRef(false)

  useEffect(() => {
    return () => {
      dragStartRef.current = null
      didDragRef.current = false
      dragHandleActiveRef.current = false
    }
  }, [])

  useLayoutEffect(() => {
    if (reducedMotion) {
      void controls.set({ opacity: 1, scale: 1 })
      return
    }
    void controls.set({ opacity: 0, scale: 0.96 })
    void controls.start({
      opacity: 1,
      scale: 1,
      transition: { ...springSnappy, delay: blockEntranceDelay(staggerIndex, reducedMotion) },
    })
  }, [block.id, staggerIndex, reducedMotion, controls])

  const handleDragHandlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!onDragReschedule) return
    suppressNextSelectRef.current = true
    setIsPendingCommit(false)
    setDragOffsetY(0)
    dragStartRef.current = { y: e.clientY, pointerId: e.pointerId }
    didDragRef.current = false
    dragHandleActiveRef.current = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
    e.stopPropagation()
  }, [onDragReschedule])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (
      !dragStartRef.current ||
      !dragHandleActiveRef.current ||
      dragStartRef.current.pointerId !== e.pointerId
    ) {
      return
    }
    const dy = e.clientY - dragStartRef.current.y
    if (!isDragging && Math.abs(dy) > DRAG_THRESHOLD_PX) {
      setIsDragging(true)
      didDragRef.current = true
    }
    if (isDragging || Math.abs(dy) > DRAG_THRESHOLD_PX) {
      setDragOffsetY(dy)
    }
    // On touch devices, prevent scroll while dragging.
    e.preventDefault()
  }, [isDragging])

  const handlePointerUp = useCallback(async (e: React.PointerEvent) => {
    if (
      !dragStartRef.current ||
      !dragHandleActiveRef.current ||
      dragStartRef.current.pointerId !== e.pointerId
    ) {
      return
    }
    const wasDragging = didDragRef.current

    if (wasDragging && onDragReschedule) {
      const dy = e.clientY - dragStartRef.current.y
      const rawMinutes = (dy / pixelsPerHour) * 60
      const snapped = Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES
      if (snapped !== 0) {
        // Keep the visual offset so the block stays where the user dropped it.
        setDragOffsetY(() => {
          // Snap the visual offset to the same step as the minutes, for consistency.
          const snappedPx = (snapped / 60) * pixelsPerHour
          return snappedPx
        })
        setIsPendingCommit(true)
        try {
          const payload: DragReschedulePayload = {
            prevStart: block.start,
            prevEnd: block.end,
            nextStart: shiftTime(block.start, snapped),
            nextEnd: shiftTime(block.end, snapped),
          }
          await Promise.resolve(onDragReschedule(block.id, payload))
        } finally {
          setIsPendingCommit(false)
          setDragOffsetY(0)
          if (!reducedMotion) {
            void controls.start({
              scale: [1, 1.03, 1],
              transition: { duration: 0.28, times: [0, 0.45, 1], ease: 'easeOut' },
            })
          }
        }
      } else {
        setDragOffsetY(0)
      }
    } else {
      setDragOffsetY(0)
    }

    dragStartRef.current = null
    dragHandleActiveRef.current = false
    setIsDragging(false)
    e.stopPropagation()
  }, [onDragReschedule, pixelsPerHour, block.id, block.start, block.end, reducedMotion, controls])

  return (
    <motion.div
      initial={false}
      animate={controls}
      className={`absolute z-[2] flex min-w-0 overflow-hidden rounded-block text-left shadow-card touch-manipulation transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-2 ${
        showBlank
          ? 'p-0'
          : showTitleOnly
            ? 'px-2 py-0.5'
            : useShortRow
              ? isCompact
                ? 'px-2 py-1'
                : 'px-2.5 py-1.5'
              : 'px-3 py-2'
      } ${isDragging ? 'z-50 cursor-grabbing opacity-90 shadow-card' : 'cursor-pointer'}`}
      style={{
        top: block.topPx + dragOffsetY,
        height: visualHeight,
        width: `${widthPercent}%`,
        left: `${leftPercent}%`,
        boxSizing: 'border-box',
        backgroundColor: primaryPerson.colorTint,
        borderLeftWidth: 0,
        borderLeftColor: 'transparent',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={() => {
        if (suppressNextSelectRef.current) {
          suppressNextSelectRef.current = false
          return
        }
        onSelect()
      }}
      onContextMenu={(e) => e.preventDefault()}
      whileTap={isDragging ? undefined : { scale: 0.98 }}
      aria-label={`${primaryPerson.name}, ${block.title}, ${formatTimeRange(block.start, block.end)}`}
    >
      {/* Segmented left stripe showing all participants */}
      {participants.length > 0 && (
        <div
          className="pointer-events-none absolute left-0 top-0 bottom-0 w-[6px] overflow-hidden rounded-l-block"
          aria-hidden
        >
          <div className="flex h-full w-full">
            {participants.map((p) => (
              <div key={p.id} className="flex-1" style={{ backgroundColor: p.colorAccent }} />
            ))}
          </div>
        </div>
      )}
      {/* Shimmer sweep when commit is pending: a bright band slides left → right */}
      {isPendingCommit && (
        <motion.div
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-block z-10"
          aria-hidden
        >
          <motion.div
            className="absolute top-0 bottom-0 w-[70%]"
            initial={{ x: '-100%' }}
            animate={{ x: '170%' }}
            transition={{ duration: 0.55, ease: 'easeIn' }}
            style={{
              background: 'linear-gradient(95deg, transparent 0%, transparent 25%, rgba(255,255,255,0.85) 50%, transparent 75%, transparent 100%)',
            }}
          />
        </motion.div>
      )}
      {!showBlank && (dropoffPerson || pickupPerson) && (
        <>
          {dropoffPerson && (
            <div
              className="pointer-events-none absolute left-[6px] right-0 top-0 h-[4px]"
              style={{ backgroundColor: dropoffPerson.colorAccent, opacity: 0.72 }}
              aria-hidden
            />
          )}
          {pickupPerson && (
            <div
              className="pointer-events-none absolute bottom-0 left-[6px] right-0 h-[4px]"
              style={{ backgroundColor: pickupPerson.colorAccent, opacity: 0.72 }}
              aria-hidden
            />
          )}
        </>
      )}
      <span className="flex min-h-0 min-w-0 flex-1 flex-col items-start justify-start gap-0 overflow-hidden pointer-events-none select-none">
        {!showBlank && !isCompact && participants.length > 1 && (
          <div className="mb-1 flex items-center gap-1.5">
            {participants.slice(0, 4).map((p) => (
              <span
                key={p.id}
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: p.colorAccent }}
                aria-hidden
              />
            ))}
            {participants.length > 4 && (
              <span className="rounded-full bg-white/70 px-1 text-[10px] font-semibold text-neutral-500">
                +{participants.length - 4}
              </span>
            )}
          </div>
        )}
        {showBlank ? null : showTitleOnly ? (
          <span className="flex min-h-0 min-w-0 flex-1 items-center gap-1.5 overflow-hidden pr-7">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: primaryPerson.colorAccent }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-caption font-semibold leading-tight tracking-tight text-neutral-600">
              {block.title}
            </span>
          </span>
        ) : useShortRow && showTitleAndTime ? (
          <span className="flex min-h-0 min-w-0 flex-1 items-center gap-1.5 overflow-hidden pr-7">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: primaryPerson.colorAccent }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-caption font-semibold leading-normal tracking-tight text-neutral-600">
              {block.title}
            </span>
            <span className="shrink-0 text-right text-[10px] font-medium tabular-nums leading-none text-neutral-500">
              {formatTimeRange(block.start, block.end)}
              {participants.length > 1 ? ` ·${participants.length}` : ''}
            </span>
          </span>
        ) : isMedium ? (
          <>
            <span className="min-w-0 max-w-full truncate text-body-sm font-semibold leading-tight text-neutral-600">
              {block.title}
            </span>
            <span className="mt-0.5 min-w-0 max-w-full truncate whitespace-nowrap text-caption tabular-nums text-neutral-400">
              {formatTimeRange(block.start, block.end)}
            </span>
          </>
        ) : (
          <>
            <span
              className="shrink-0 text-caption font-semibold uppercase tracking-wider"
              style={{ color: primaryPerson.colorAccent }}
            >
              {primaryPerson.name}
            </span>
            <span className="mt-0.5 min-w-0 max-w-full truncate text-subheading font-semibold leading-snug text-neutral-600">
              {block.title}
            </span>
            <span className="mt-0.5 min-w-0 max-w-full truncate whitespace-nowrap text-caption tabular-nums text-neutral-400">
              {formatTimeRange(block.start, block.end)}
            </span>
          </>
        )}
      </span>
      {onDragReschedule && !showBlank && (
        <button
          type="button"
          aria-label="Flytt hendelse"
          title="Flytt hendelse"
          className={`absolute inline-flex items-center justify-center rounded-full border border-white/40 bg-white/45 text-neutral-500 backdrop-blur-sm transition hover:bg-white/75 ${
            useShortRow || showTitleOnly ? 'right-1 top-1/2 h-5 w-5 -translate-y-1/2' : 'bottom-1.5 right-1.5 h-6 w-6'
          }`}
          style={{
            touchAction: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none',
            WebkitTouchCallout: 'none',
          }}
          onPointerDown={handleDragHandlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onContextMenu={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
        >
          <svg className={useShortRow || showTitleOnly ? 'h-3 w-3' : 'h-3.5 w-3.5'} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h8M8 12h8M8 18h8" />
          </svg>
        </button>
      )}
    </motion.div>
  )
}
