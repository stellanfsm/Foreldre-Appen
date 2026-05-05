/**
 * Schedule helpers: filter events, compute gaps, day summary, week indicators.
 * Filters preserve time structure (events stay at true time positions).
 */

import type { Event, PersonId, DaySummary, GapInfo, WeekDayMeta } from '../types'
import {
  parseTime,
  TIMELINE_START_HOUR,
  TIMELINE_END_HOUR,
  PIXELS_PER_HOUR,
} from './time'
import {
  weekDateKeysMondayStartOslo,
  todayKeyOslo,
} from './osloCalendar'

const DAY_START_MIN = TIMELINE_START_HOUR * 60
const DAY_END_MIN = TIMELINE_END_HOUR * 60

export function getEventParticipantIds(e: Event): PersonId[] {
  // Primary storage is `event.personId` (legacy). Multi-person lives in metadata.
  const fromMetadata = (e.metadata as any)?.participants
  if (Array.isArray(fromMetadata) && fromMetadata.length > 0) {
    return fromMetadata.filter((x): x is PersonId => typeof x === 'string')
  }
  return e.personId ? [e.personId] : []
}

/** Default gap label threshold: only show label for gaps >= 45 min. */
export const GAP_LABEL_THRESHOLD_MINUTES = 45

function hasPositiveDuration(e: Event): boolean {
  const start = parseTime(e.start)
  const end = parseTime(e.end)
  return Number.isFinite(start) && Number.isFinite(end) && end > start
}

function isRenderableEvent(e: Event): boolean {
  // Timed foreground blocks without person (f.eks. dokumentimport) skal fortsatt vises.
  return hasPositiveDuration(e)
}

/** Filter events by selected person IDs and drop invalid/zero-length ones. Empty or "all" = show everyone. */
export function calculateVisibleEvents(
  events: Event[],
  selectedPersonIds: PersonId[]
): Event[] {
  const valid = events.filter(isRenderableEvent)
  if (selectedPersonIds.length === 0) return valid
  const set = new Set(selectedPersonIds)
  return valid.filter((e) => getEventParticipantIds(e).some((id) => set.has(id)))
}

/** Merge overlapping [start, end] intervals (minutes from midnight). */
function mergeIntervals(events: Event[]): [number, number][] {
  const intervals: [number, number][] = events.map((e) => [
    parseTime(e.start),
    parseTime(e.end),
  ])
  intervals.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const [s, end] of intervals) {
    const last = merged[merged.length - 1]
    if (last && s <= last[1]) {
      last[1] = Math.max(last[1], end)
    } else {
      merged.push([s, end])
    }
  }
  return merged
}

/** Compute gaps (free time) not covered by any event within day window. */
export function calculateGaps(
  events: Event[],
  pixelsPerHour: number = PIXELS_PER_HOUR,
  thresholdMinutes: number = GAP_LABEL_THRESHOLD_MINUTES
): GapInfo[] {
  const merged = mergeIntervals(events)
  const gaps: GapInfo[] = []
  let prevEnd = DAY_START_MIN
  for (const [s, end] of merged) {
    const gapStart = Math.max(prevEnd, DAY_START_MIN)
    const gapEnd = Math.min(s, DAY_END_MIN)
    if (gapEnd > gapStart) {
      const durationMinutes = gapEnd - gapStart
      if (durationMinutes >= thresholdMinutes) {
        const startMinFromDay = gapStart - DAY_START_MIN
        const endMinFromDay = gapEnd - DAY_START_MIN
        gaps.push({
          startMinutes: startMinFromDay,
          endMinutes: endMinFromDay,
          durationMinutes,
          topPx: (startMinFromDay / 60) * pixelsPerHour,
          heightPx: (durationMinutes / 60) * pixelsPerHour,
        })
      }
    }
    prevEnd = Math.max(prevEnd, end)
  }
  if (DAY_END_MIN > prevEnd) {
    const durationMinutes = DAY_END_MIN - prevEnd
    if (durationMinutes >= thresholdMinutes) {
      const startMinFromDay = prevEnd - DAY_START_MIN
      gaps.push({
        startMinutes: startMinFromDay,
        endMinutes: (DAY_END_MIN - DAY_START_MIN),
        durationMinutes,
        topPx: (startMinFromDay / 60) * pixelsPerHour,
        heightPx: (durationMinutes / 60) * pixelsPerHour,
      })
    }
  }
  return gaps
}

/** Format gap label: "1h free", "1h 30m free". */
export function formatGapLabel(durationMinutes: number): string {
  if (durationMinutes < 60) return `${durationMinutes} min ledig`
  const h = Math.floor(durationMinutes / 60)
  const m = durationMinutes % 60
  if (m === 0) return `${h} t ledig`
  return `${h} t ${m} min ledig`
}

export function buildDaySummary(
  events: Event[],
  _date: string,
  nowMinutes?: number,
  busyEventsForFreeTime?: Event[]
): DaySummary {
  const sorted = [...events].sort((a, b) => parseTime(a.start) - parseTime(b.start))
  const busySorted = [...(busyEventsForFreeTime ?? events)].sort((a, b) => parseTime(a.start) - parseTime(b.start))
  let freeTimeMinutes = 0
  let prevEnd = DAY_START_MIN
  for (const e of busySorted) {
    const s = parseTime(e.start)
    const end = parseTime(e.end)
    if (s > prevEnd && s >= DAY_START_MIN && end <= DAY_END_MIN) {
      freeTimeMinutes += s - prevEnd
    }
    prevEnd = Math.max(prevEnd, end)
  }
  if (DAY_END_MIN > prevEnd) freeTimeMinutes += DAY_END_MIN - prevEnd

  let nextEvent: Event | null = null
  let minutesUntilNext: number | null = null
  if (nowMinutes != null) {
    for (const e of sorted) {
      const s = parseTime(e.start)
      if (s >= nowMinutes) {
        nextEvent = e
        minutesUntilNext = s - nowMinutes
        break
      }
    }
  }

  return {
    activityCount: events.length,
    freeTimeMinutes,
    nextEvent,
    minutesUntilNext,
  }
}

/** Get week day metas for the 7 days containing the given date (Mon–Sun). */
export function getWeekIndicators(
  centerDateKey: string,
  getEventsForDate: (date: string) => Event[]
): WeekDayMeta[] {
  const out: WeekDayMeta[] = []
  const abbrs = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør']
  for (const dateKey of weekDateKeysMondayStartOslo(centerDateKey)) {
    const d = new Date(dateKey + 'T12:00:00')
    const events = getEventsForDate(dateKey)
    const personIdsWithEvents = [...new Set(events.flatMap((e) => getEventParticipantIds(e)))]
    out.push({
      date: dateKey,
      dayLabel: abbrs[d.getDay()],
      dayAbbr: abbrs[d.getDay()].slice(0, 3),
      personIdsWithEvents,
    })
  }
  return out
}

/** Current time in minutes from midnight (for "now" line and next-up). */
export function getNowMinutes(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

/** Check if date string is today (local). */
export function isToday(date: string): boolean {
  const today = todayKeyOslo()
  return date === today
}
