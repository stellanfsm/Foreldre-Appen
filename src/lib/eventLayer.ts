import type { Event } from '../types'

export function isForegroundEvent(e: Event): boolean {
  return e.metadata?.calendarLayer !== 'background'
}

export function filterForegroundEvents(events: Event[]): Event[] {
  return events.filter(isForegroundEvent)
}

/** True if this event is marked as all-day (lives in the all-day row, not the hourly grid). */
export function isAllDayEvent(e: Event): boolean {
  /** Kun eksplisitt boolean true — unngår at JSON/arv (f.eks. strengen "false") feilaktig blir heldag. */
  return e.metadata?.isAllDay === true
}

/**
 * Returns the effective end date (YYYY-MM-DD) for a multi-day/all-day event.
 * Falls back to anchorDate when no endDate is set (single-day all-day event).
 */
export function getEventEndDate(e: Event, anchorDate: string): string {
  return (e.metadata?.endDate as string | undefined) ?? anchorDate
}

/** Foreground timed events only — go into the hourly timeline grid. */
export function filterTimedEvents(events: Event[]): Event[] {
  return events.filter((e) => !isAllDayEvent(e))
}

/** All-day / multi-day foreground events — go into the AllDayRow above the timeline. */
export function filterAllDayEvents(events: Event[]): Event[] {
  return events.filter(isAllDayEvent)
}
