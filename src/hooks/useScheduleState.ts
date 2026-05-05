import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import type {
  PersonId,
  Event,
  DaySummary,
  WeekDayMeta,
  TimelineLayoutItem,
  GapInfo,
} from '../types'
import {
  calculateVisibleEvents,
  calculateGaps,
  buildDaySummary,
  getWeekIndicators,
  getNowMinutes,
  isToday,
  getEventParticipantIds,
} from '../lib/schedule'
import { layoutTimelineWithOverlapGroups } from '../lib/overlaps'
import { PIXELS_PER_HOUR, shiftTime } from '../lib/time'
import { useAuth } from '../context/AuthContext'
import { useEffectiveUserId } from '../context/EffectiveUserIdContext'
import { formatScheduleLoadError } from '../lib/supabaseErrors'
import {
  fetchEventsForDateRangeFromCalendar,
  createEventForDate,
  insertRecurringEventsKeepOwner,
  updateEvent as updateEventApi,
  deleteEvent as deleteEventApi,
  updateEventsByGroup,
  deleteEventsByGroup,
  deleteAllEventsOwnerOnly,
} from '../lib/eventsApi'
import { useFamily } from '../context/FamilyContext'
import { buildBackgroundEventsForDate } from '../lib/backgroundEvents'
import {
  filterForegroundEvents,
  isAllDayEvent,
  getEventEndDate,
  filterTimedEvents,
  filterAllDayEvents,
  isForegroundEvent,
} from '../lib/eventLayer'
import {
  addCalendarDaysOslo,
  getRecurrenceOccurrenceDatesOslo,
  todayKeyOslo,
  weekDateKeysMondayStartOslo,
} from '../lib/osloCalendar'
import { useMobileRefreshTriggers, useRealtimeRefresh } from '../features/sync/useRefreshTriggers'

/** Week timeline uses a tighter scale so the strip fits on screen without feeling crammed. */
export const WEEK_TIMELINE_PIXELS_PER_HOUR = 56

export interface WeekDayLayout {
  date: string
  dayLabel: string
  dayAbbr: string
  personIdsWithEvents: PersonId[]
  /** Timed foreground events — rendered in the hourly timeline / list. */
  events: Event[]
  /** All-day / multi-day foreground events — rendered in the AllDayRow, NOT in the timeline. */
  allDayEvents: Event[]
  layoutItems: TimelineLayoutItem[]
  backgroundLayoutItems: TimelineLayoutItem[]
  gaps: GapInfo[]
}

function normalizeBackgroundColumns(
  items: TimelineLayoutItem[],
  people: { id: PersonId }[]
): TimelineLayoutItem[] {
  const personOrder = new Map<string, number>()
  people.forEach((p, idx) => personOrder.set(p.id, idx))

  const columnKey = (pid: string | null) => (pid && pid.trim()) || '__none__'
  const uniquePersonIds = Array.from(new Set(items.map((i) => columnKey(i.block.personId)))).sort((a, b) => {
    const ai = personOrder.get(a) ?? Number.MAX_SAFE_INTEGER
    const bi = personOrder.get(b) ?? Number.MAX_SAFE_INTEGER
    if (ai !== bi) return ai - bi
    return a.localeCompare(b)
  })

  const personToColumn = new Map<string, number>()
  uniquePersonIds.forEach((pid, idx) => personToColumn.set(pid, idx))
  const totalColumns = Math.max(1, uniquePersonIds.length)

  return items.map((item) => {
    const columnIndex = personToColumn.get(columnKey(item.block.personId)) ?? 0
    return {
      ...item,
      block: {
        ...item.block,
        columnIndex,
        totalColumns,
      },
    }
  })
}

function getTodayKey(): string {
  return todayKeyOslo()
}

function addDays(dateKey: string, delta: number): string {
  return addCalendarDaysOslo(dateKey, delta)
}

function isOvernightEvent(e: Event): boolean {
  return e.end <= e.start
}

/** Returns the 7 date keys (YYYY-MM-DD) for the week (Mon–Sun) containing the given date. */
function getWeekDateKeys(centerDateKey: string): string[] {
  return weekDateKeysMondayStartOslo(centerDateKey)
}

/** Returns date keys from startDate through endDate (inclusive), spaced by intervalDays. */
export function getRecurrenceOccurrenceDates(startDate: string, endDate: string, intervalDays: number): string[] {
  return getRecurrenceOccurrenceDatesOslo(startDate, endDate, intervalDays)
}

export function useScheduleState() {
  const { user } = useAuth()
  const { effectiveUserId, isLinked } = useEffectiveUserId()
  const { people } = useFamily()
  const [selectedDate, setSelectedDate] = useState(getTodayKey)
  const [selectedPersonIds, setSelectedPersonIds] = useState<PersonId[]>([])
  const [pixelsPerHour, setPixelsPerHour] = useState(PIXELS_PER_HOUR)
  const [selectedEvent, setSelectedEvent] = useState<{ event: Event; date: string } | null>(null)
  const [showListView, setShowListView] = useState(false)
  const [userEventsByDate, setUserEventsByDate] = useState<Record<string, Event[]>>({})
  const [weekEventsLoading, setWeekEventsLoading] = useState(false)
  const [loadedWeekKeys, setLoadedWeekKeys] = useState<Set<string>>(new Set())
  const [refreshKey, setRefreshKey] = useState(0)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const refreshDebounceRef = useRef<number | null>(null)
  const weekFetchInFlightRef = useRef(false)
  const weekFetchRequestIdRef = useRef(0)

  const queueRefresh = useCallback(() => {
    if (refreshDebounceRef.current != null) return
    refreshDebounceRef.current = window.setTimeout(() => {
      refreshDebounceRef.current = null
      setRefreshKey((k) => k + 1)
    }, 350)
  }, [])

  useEffect(() => {
    if (!user) {
      setWeekEventsLoading(false)
      return
    }
    const weekKeys = getWeekDateKeys(selectedDate)
    const weekKey = weekKeys[0]

    if (loadedWeekKeys.has(weekKey)) return

    if (weekFetchInFlightRef.current) return
    weekFetchInFlightRef.current = true
    const requestId = ++weekFetchRequestIdRef.current
    setWeekEventsLoading(true)
    ;(async () => {
      try {
        const startDate = weekKeys[0]
        const endDate = weekKeys[weekKeys.length - 1]
        const { byDate, error } = await fetchEventsForDateRangeFromCalendar(startDate, endDate)
        if (requestId !== weekFetchRequestIdRef.current) return
        if (error) {
          setScheduleError(formatScheduleLoadError(error))
          return
        }
        setScheduleError(null)

        setUserEventsByDate((prev) => {
          const next = { ...prev }
          for (const key of weekKeys) {
            next[key] = byDate[key] ?? []
          }
          return next
        })
        setLoadedWeekKeys((prev) => new Set([...prev, weekKey]))
      } finally {
        weekFetchInFlightRef.current = false
        setWeekEventsLoading(false)
      }
    })()
  }, [user, selectedDate, loadedWeekKeys])

  useEffect(() => {
    setLoadedWeekKeys(new Set())
    setUserEventsByDate({})
    setScheduleError(null)
  }, [effectiveUserId])

  // Keep the open event detail panel in sync with the live event store.
  // When a realtime refresh or a partner edit updates userEventsByDate, the event
  // snapshot inside selectedEvent would otherwise become stale.
  // When the event is deleted by the partner, close the sheet so the user is not
  // left staring at a ghost event (which would throw on any edit attempt).
  useEffect(() => {
    if (!selectedEvent) return
    const targetId = selectedEvent.event.id

    for (const [date, events] of Object.entries(userEventsByDate)) {
      const latest = events.find((e) => e.id === targetId)
      if (latest) {
        if (latest !== selectedEvent.event) {
          setSelectedEvent({ event: latest, date })
        }
        return
      }
    }

    // Event not found in any loaded date.
    // Only close the sheet if the event's original date has already been fetched
    // (confirms the event was deleted, not merely that the date isn't loaded yet).
    const dateIsLoaded = selectedEvent.date in userEventsByDate
    if (dateIsLoaded) {
      setSelectedEvent(null)
    }
  }, [userEventsByDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Silent refresh trigger (no loading skeleton/flicker).
  useEffect(() => {
    if (!user) return
    const weekKeys = getWeekDateKeys(selectedDate)
    const startDate = weekKeys[0]
    const endDate = weekKeys[weekKeys.length - 1]

    if (weekFetchInFlightRef.current) return
    weekFetchInFlightRef.current = true
    const requestId = ++weekFetchRequestIdRef.current
    ;(async () => {
      try {
        const { byDate, error } = await fetchEventsForDateRangeFromCalendar(startDate, endDate)
        if (requestId !== weekFetchRequestIdRef.current) return
        if (error) {
          setScheduleError(formatScheduleLoadError(error))
          return
        }
        setScheduleError(null)
        setUserEventsByDate((prev) => {
          const next = { ...prev }
          for (const key of weekKeys) {
            next[key] = byDate[key] ?? []
          }
          return next
        })
      } catch {
        // ignore transient refresh errors
      } finally {
        weekFetchInFlightRef.current = false
      }
    })()
  }, [refreshKey, selectedDate, user?.id])

  // Mobile/PWA fallback refresh: focus/pageshow + visibility change + polling.
  // includeVisibilityChange ensures iOS PWA foreground transitions trigger a refresh
  // even when the focus event is not reliably fired.
  useMobileRefreshTriggers({
    enabled: Boolean(user && effectiveUserId),
    onRefresh: queueRefresh,
    includeVisibilityChange: true,
  })

  // Live updates: silently refresh current week when events change.
  useRealtimeRefresh({
    enabled: Boolean(user && effectiveUserId),
    channelName: `realtime-events-${effectiveUserId ?? 'none'}`,
    table: 'events',
    filter: `user_id=eq.${effectiveUserId ?? ''}`,
    onRefresh: queueRefresh,
  })

  useEffect(
    () => () => {
      if (refreshDebounceRef.current != null) {
        window.clearTimeout(refreshDebounceRef.current)
      }
    },
    []
  )

  function getAllEventsForDate(date: string): Event[] {
    const own = userEventsByDate[date] ?? []
    const prevDate = addDays(date, -1)
    const prev = userEventsByDate[prevDate] ?? []

    const out: Event[] = []
    const seenIds = new Set<string>()

    for (const e of own) {
      seenIds.add(e.id)
      if (isAllDayEvent(e)) {
        out.push(e)
      } else if (isOvernightEvent(e)) {
        out.push({ ...e, end: '23:59' })
      } else {
        out.push(e)
      }
    }

    for (const e of prev) {
      if (seenIds.has(e.id)) continue
      if (isAllDayEvent(e)) continue
      if (!isOvernightEvent(e)) continue
      seenIds.add(e.id)
      out.push({ ...e, start: '00:00', end: e.end })
    }

    // Project multi-day all-day events anchored on earlier dates onto this date.
    // Attach __anchorDate so delete/edit operations resolve the correct DB row.
    for (const [anchorDate, anchorEvents] of Object.entries(userEventsByDate)) {
      if (anchorDate >= date) continue
      for (const e of anchorEvents) {
        if (seenIds.has(e.id)) continue
        if (!isAllDayEvent(e)) continue
        const endDate = getEventEndDate(e, anchorDate)
        if (endDate >= date) {
          seenIds.add(e.id)
          out.push({ ...e, metadata: { ...e.metadata, __anchorDate: anchorDate } })
        }
      }
    }

    return out
  }

  /** Visible events for any date (respects person filter) — used e.g. by month dots. */
  const getVisibleEventsForDate = useCallback(
    (date: string) => calculateVisibleEvents(getAllEventsForDate(date), selectedPersonIds),
    [userEventsByDate, selectedPersonIds]
  )

  /**
   * Unike forgrunnshendelser med DB-ankerdato (for import-matching mot eksisterende kalender).
   */
  const getAnchoredForegroundEventsForMatching = useCallback((): { event: Event; anchorDate: string }[] => {
    const out: { event: Event; anchorDate: string }[] = []
    const seen = new Set<string>()
    for (const [anchorDate, list] of Object.entries(userEventsByDate)) {
      for (const e of list) {
        if (!isForegroundEvent(e)) continue
        if (seen.has(e.id)) continue
        seen.add(e.id)
        out.push({ event: e, anchorDate })
      }
    }
    return out
  }, [userEventsByDate])

  /** Load events for an arbitrary date range (e.g. full month in month view) into cache. */
  const prefetchEventsForDateRange = useCallback(
    async (startDate: string, endDate: string) => {
      if (!user) return
      const { byDate, error } = await fetchEventsForDateRangeFromCalendar(startDate, endDate)
      if (error) {
        setScheduleError(formatScheduleLoadError(error))
        return
      }
      setScheduleError(null)
      setUserEventsByDate((prev) => {
        const next = { ...prev }
        for (const [k, v] of Object.entries(byDate)) {
          next[k] = v
        }
        return next
      })
    },
    [user]
  )

  async function addEvent(date: string, input: Omit<Event, 'id'>) {
    if (!user) {
      const id = `local-${date}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const ev: Event = { id, ...input }
      setUserEventsByDate((prev) => {
        const existing = prev[date] ?? []
        return { ...prev, [date]: [...existing, ev] }
      })
      return
    }

    const created = await createEventForDate(effectiveUserId!, date, input)
    if (!created) {
      throw new Error(
        'Could not save event. Check the browser console and that the events table has columns: start, end, notes, location.'
      )
    }

    setUserEventsByDate((prev) => {
      const existing = prev[date] ?? []
      return { ...prev, [date]: [...existing, created] }
    })
  }

  async function addRecurring(
    startDate: string,
    endDate: string,
    intervalDays: number,
    input: Omit<Event, 'id'>
  ) {
    if (!user) throw new Error('Must be signed in to add events')
    const dates = getRecurrenceOccurrenceDates(startDate, endDate, intervalDays)
    if (dates.length === 0) throw new Error('End date must be on or after start date')
    const recurrenceGroupId =
      input.recurrenceGroupId ?? (typeof crypto !== 'undefined' ? crypto.randomUUID() : undefined)
    const created = await insertRecurringEventsKeepOwner(startDate, endDate, intervalDays, {
      ...input,
      recurrenceGroupId,
    })
    if (!created) throw new Error('Could not save recurring events')
    setUserEventsByDate((prev) => {
      const next = { ...prev }
      for (const { date: d, event: ev } of created) {
        const existing = next[d] ?? []
        next[d] = [...existing, ev]
      }
      return next
    })
  }

  async function updateEvent(
    date: string,
    eventId: string,
    updates: Partial<Pick<Event, 'personId' | 'title' | 'start' | 'end' | 'notes' | 'location' | 'reminderMinutes' | 'metadata'>>,
    newDate?: string
  ) {
    if (!user) throw new Error('Must be signed in to edit events')
    const updated = await updateEventApi(effectiveUserId!, eventId, updates, newDate)
    if (!updated) throw new Error('Could not update event')

    // Always use the server-returned row so concurrent partner edits are not clobbered.
    setUserEventsByDate((prev) => {
      const next = { ...prev }
      if (newDate && newDate !== date) {
        next[date] = (prev[date] ?? []).filter((e) => e.id !== eventId)
        // Also remove from target date in case a realtime insert already landed it there,
        // then add the authoritative server row.
        next[newDate] = [...(prev[newDate] ?? []).filter((e) => e.id !== eventId), updated]
      } else {
        const list = prev[date] ?? []
        next[date] = list.map((e) => (e.id === eventId ? updated : e))
      }
      return next
    })
  }

  async function deleteEvent(date: string, eventId: string) {
    if (!user) throw new Error('Must be signed in to delete events')
    const ok = await deleteEventApi(effectiveUserId!, eventId)
    if (!ok) throw new Error('Could not delete event')
    setUserEventsByDate((prev) => {
      const list = (prev[date] ?? []).filter((e) => e.id !== eventId)
      return { ...prev, [date]: list }
    })
  }

  async function updateAllInSeries(
    groupId: string,
    updates: Partial<Pick<Event, 'personId' | 'title' | 'start' | 'end' | 'notes' | 'location' | 'reminderMinutes'>>
  ) {
    if (!user) throw new Error('Must be signed in to edit events')
    const ok = await updateEventsByGroup(effectiveUserId!, groupId, updates)
    if (!ok) throw new Error('Could not update series')
    setUserEventsByDate((prev) => {
      const next = { ...prev }
      for (const dateKey of Object.keys(next)) {
        next[dateKey] = next[dateKey].map((e) =>
          e.recurrenceGroupId === groupId ? { ...e, ...updates } : e
        )
      }
      return next
    })
  }

  async function rescheduleByDelta(date: string, eventId: string, deltaMinutes: number) {
    if (eventId.startsWith('bg-')) return
    const dayEvents = userEventsByDate[date] ?? []
    const ev = dayEvents.find((e) => e.id === eventId)
    if (!ev) return
    const newStart = shiftTime(ev.start, deltaMinutes)
    const newEnd = shiftTime(ev.end, deltaMinutes)
    await updateEvent(date, eventId, { start: newStart, end: newEnd })
  }

  async function deleteAllInSeries(groupId: string) {
    if (!user) throw new Error('Must be signed in to delete events')
    const ok = await deleteEventsByGroup(effectiveUserId!, groupId)
    if (!ok) throw new Error('Could not delete series')
    setUserEventsByDate((prev) => {
      const next = { ...prev }
      for (const dateKey of Object.keys(next)) {
        next[dateKey] = next[dateKey].filter((e) => e.recurrenceGroupId !== groupId)
      }
      return next
    })
  }

  function purgePersonEvents(personId: string) {
    setUserEventsByDate((prev) => {
      const next = { ...prev }
      for (const dateKey of Object.keys(next)) {
        next[dateKey] = next[dateKey].filter((e) => e.personId !== personId)
      }
      return next
    })
  }

  async function clearAllEvents() {
    if (isLinked) {
      throw new Error('Kun eieren av kalenderen kan slette alle hendelser.')
    }
    if (user) {
      // Uses a SECURITY DEFINER RPC that rejects linked users at the DB level,
      // so even a client bypass cannot bulk-delete another family's events.
      const ok = await deleteAllEventsOwnerOnly()
      if (!ok) throw new Error('Could not clear events')
    }
    setUserEventsByDate({})
    setLoadedWeekKeys(new Set())
  }

  const weekDays = useMemo(() => {
    return getWeekIndicators(selectedDate, (date) => userEventsByDate[date] ?? [])
  }, [selectedDate, userEventsByDate])

  const weekLayoutData = useMemo((): WeekDayLayout[] => {
    return weekDays.map((day: WeekDayMeta) => {
      const dayEvents = getAllEventsForDate(day.date)
      const visible = calculateVisibleEvents(dayEvents, selectedPersonIds)
      const foreground = filterForegroundEvents(visible)
      const timed = filterTimedEvents(foreground)
      const allDay = filterAllDayEvents(foreground)
      const background = buildBackgroundEventsForDate(day.date, people, selectedPersonIds, dayEvents)
      const busyForGaps = [...timed, ...background]
      const layoutItems = layoutTimelineWithOverlapGroups(timed, WEEK_TIMELINE_PIXELS_PER_HOUR)
      const backgroundLayoutItems = normalizeBackgroundColumns(
        layoutTimelineWithOverlapGroups(
          background,
          WEEK_TIMELINE_PIXELS_PER_HOUR
        ),
        people
      )
      const gaps = calculateGaps(busyForGaps, WEEK_TIMELINE_PIXELS_PER_HOUR)
      const visiblePersonIds: PersonId[] = [...new Set(timed.flatMap((e) => getEventParticipantIds(e)))]
      return {
        date: day.date,
        dayLabel: day.dayLabel,
        dayAbbr: day.dayAbbr,
        personIdsWithEvents: visiblePersonIds,
        events: timed,
        allDayEvents: allDay,
        layoutItems,
        backgroundLayoutItems,
        gaps,
      }
    })
  }, [weekDays, selectedPersonIds, people, userEventsByDate])

  const dayEvents = useMemo(() => getAllEventsForDate(selectedDate), [selectedDate, userEventsByDate])
  const osloTodayDateKey = useMemo(() => todayKeyOslo(), [refreshKey, userEventsByDate])
  const reminderEvents = useMemo(
    () => filterForegroundEvents(getAllEventsForDate(osloTodayDateKey)),
    [osloTodayDateKey, userEventsByDate]
  )

  const weekDateKeys = useMemo(() => getWeekDateKeys(selectedDate), [selectedDate])
  const hasRawEventsInWeek = useMemo(
    () => weekDateKeys.some((d) => (userEventsByDate[d] ?? []).length > 0),
    [weekDateKeys, userEventsByDate]
  )
  const visibleStoredEvents = useMemo(
    () => calculateVisibleEvents(dayEvents, selectedPersonIds),
    [dayEvents, selectedPersonIds]
  )

  const foregroundEvents = useMemo(
    () => filterForegroundEvents(visibleStoredEvents),
    [visibleStoredEvents]
  )

  const foregroundTimedEvents = useMemo(
    () => filterTimedEvents(foregroundEvents),
    [foregroundEvents]
  )

  const allDayEventsForDay = useMemo(
    () => filterAllDayEvents(foregroundEvents),
    [foregroundEvents]
  )

  const backgroundEvents = useMemo(
    () => buildBackgroundEventsForDate(selectedDate, people, selectedPersonIds, dayEvents),
    [selectedDate, people, selectedPersonIds, dayEvents]
  )
  const busyEventsForGaps = useMemo(
    () => [...foregroundTimedEvents, ...backgroundEvents],
    [foregroundTimedEvents, backgroundEvents]
  )

  const layoutItems = useMemo(
    () => layoutTimelineWithOverlapGroups(foregroundTimedEvents, pixelsPerHour),
    [foregroundTimedEvents, pixelsPerHour]
  )

  const backgroundLayoutItems = useMemo(
    () => normalizeBackgroundColumns(layoutTimelineWithOverlapGroups(backgroundEvents, pixelsPerHour), people),
    [backgroundEvents, pixelsPerHour, people]
  )

  const gaps = useMemo(
    () => calculateGaps(busyEventsForGaps, pixelsPerHour),
    [busyEventsForGaps, pixelsPerHour]
  )

  const daySummary = useMemo((): DaySummary => {
    const now = isToday(selectedDate) ? getNowMinutes() : undefined
    return buildDaySummary(foregroundTimedEvents, selectedDate, now, busyEventsForGaps)
  }, [foregroundTimedEvents, selectedDate, busyEventsForGaps])

  return {
    selectedDate,
    setSelectedDate,
    selectedPersonIds,
    setSelectedPersonIds,
    pixelsPerHour,
    setPixelsPerHour,
    selectedEvent,
    setSelectedEvent,
    showListView,
    setShowListView,
    weekDays,
    weekLayoutData,
    visibleEvents: foregroundEvents,
    allDayEventsForDay,
    layoutItems,
    backgroundLayoutItems,
    gaps,
    daySummary,
    addEvent,
    updateEvent,
    deleteEvent,
    updateAllInSeries,
    deleteAllInSeries,
    rescheduleByDelta,
    purgePersonEvents,
    weekEventsLoading,
    addRecurring,
    clearAllEvents,
    scheduleError,
    clearScheduleError: () => setScheduleError(null),
    dayEvents,
    reminderEvents,
    osloTodayDateKey,
    hasRawEventsInWeek,
    getVisibleEventsForDate,
    prefetchEventsForDateRange,
    getAnchoredForegroundEventsForMatching,
  }
}
