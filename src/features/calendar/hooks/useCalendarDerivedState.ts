import { useEffect, useMemo, useRef, useState } from 'react'
import type { Event, DaySummary, TimelineLayoutItem } from '../../../types'
import type { WeekDayLayout } from '../../../hooks/useScheduleState'
import { countResolvableCollisions, hasTimeOverlap, isResolvableBackgroundCollision } from '../../../lib/collisions'
import { getEventParticipantIds, getNowMinutes, isToday } from '../../../lib/schedule'
import { parseTime } from '../../../lib/time'
import { logUxMetric } from '../../../lib/uxMetrics'

interface UseCalendarDerivedStateOptions {
  selectedDate: string
  visibleEvents: Event[]
  backgroundLayoutItems: TimelineLayoutItem[]
  weekLayoutData: WeekDayLayout[]
  daySummary: DaySummary
}

export function useCalendarDerivedState({
  selectedDate,
  visibleEvents,
  backgroundLayoutItems,
  weekLayoutData,
  daySummary,
}: UseCalendarDerivedStateOptions) {
  const [hideTodayActionStrip, setHideTodayActionStrip] = useState(false)
  const [showCompletedToday, setShowCompletedToday] = useState(false)
  const [showAllCompletedToday, setShowAllCompletedToday] = useState(false)
  const previousSelectedDateRef = useRef(selectedDate)

  const unresolvedConflictCount = useMemo(
    () => countResolvableCollisions(backgroundLayoutItems.map((i) => i.block), visibleEvents),
    [backgroundLayoutItems, visibleEvents]
  )

  const completedEvents = useMemo(
    () =>
      [...visibleEvents]
        .filter((event) => Boolean(event.metadata?.completedAt))
        .sort((a, b) => a.start.localeCompare(b.start)),
    [visibleEvents]
  )

  const visibleActionableEvents = useMemo(
    () =>
      [...visibleEvents]
        .filter((event) => !event.metadata?.completedAt)
        .sort((a, b) => a.start.localeCompare(b.start)),
    [visibleEvents]
  )

  const nextEvent = useMemo(() => {
    if (visibleActionableEvents.length === 0) return null
    if (!isToday(selectedDate)) return visibleActionableEvents[0]
    const now = getNowMinutes()
    return visibleActionableEvents.find((event) => parseTime(event.end) >= now) ?? null
  }, [selectedDate, visibleActionableEvents])

  const nextEventMinutesUntil = useMemo(() => {
    if (!nextEvent || !isToday(selectedDate)) return daySummary.minutesUntilNext
    return Math.max(0, parseTime(nextEvent.start) - getNowMinutes())
  }, [daySummary.minutesUntilNext, nextEvent, selectedDate])

  const nextEventParticipantIds = nextEvent ? getEventParticipantIds(nextEvent) : []

  const nextEventConflictCount = useMemo(
    () =>
      nextEvent
        ? backgroundLayoutItems.reduce((count, item) => {
            const backgroundEvent = item.block
            if (!isResolvableBackgroundCollision(backgroundEvent)) return count
            if (!hasTimeOverlap(backgroundEvent.start, backgroundEvent.end, nextEvent.start, nextEvent.end)) {
              return count
            }
            if (!backgroundEvent.personId || !nextEventParticipantIds.includes(backgroundEvent.personId))
              return count
            return count + 1
          }, 0)
        : 0,
    [backgroundLayoutItems, nextEvent, nextEventParticipantIds]
  )

  const weeklyCollisionCount = useMemo(
    () =>
      weekLayoutData.reduce((total, day) => {
        const dayCollisions = countResolvableCollisions(
          day.backgroundLayoutItems.map((item) => item.block),
          day.events
        )
        return total + dayCollisions
      }, 0),
    [weekLayoutData]
  )

  const weeklyActivityCount = useMemo(
    () => weekLayoutData.reduce((sum, day) => sum + day.events.length, 0),
    [weekLayoutData]
  )

  useEffect(() => {
    const previous = previousSelectedDateRef.current
    if (previous !== selectedDate && isToday(previous) && unresolvedConflictCount > 0) {
      logUxMetric('unresolved_conflicts_end_of_day', unresolvedConflictCount)
    }
    if (previous !== selectedDate && isToday(selectedDate)) {
      setHideTodayActionStrip(false)
    }
    previousSelectedDateRef.current = selectedDate
  }, [selectedDate, unresolvedConflictCount])

  useEffect(() => {
    if (completedEvents.length === 0 && showCompletedToday) {
      setShowCompletedToday(false)
    }
    if (completedEvents.length <= 5) {
      setShowAllCompletedToday(false)
    }
  }, [completedEvents.length, showCompletedToday])

  return {
    unresolvedConflictCount,
    completedEvents,
    visibleActionableEvents,
    nextEvent,
    nextEventMinutesUntil,
    nextEventHasConflict: nextEventConflictCount > 0,
    laterConflictCount: Math.max(0, unresolvedConflictCount - nextEventConflictCount),
    weeklyCollisionCount,
    weeklyActivityCount,
    hideTodayActionStrip,
    setHideTodayActionStrip,
    showCompletedToday,
    setShowCompletedToday,
    showAllCompletedToday,
    setShowAllCompletedToday,
  }
}
