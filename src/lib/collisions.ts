import type { Event } from '../types'
import { parseTime } from './time'
import { getEventParticipantIds } from './schedule'

export function hasTimeOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return parseTime(aStart) < parseTime(bEnd) && parseTime(aEnd) > parseTime(bStart)
}

export function isResolvableBackgroundCollision(backgroundEvent: Event): boolean {
  return backgroundEvent.metadata?.backgroundKind !== 'school'
}

export function overlapsSameParticipant(backgroundEvent: Event, foregroundEvent: Event): boolean {
  if (!hasTimeOverlap(backgroundEvent.start, backgroundEvent.end, foregroundEvent.start, foregroundEvent.end)) {
    return false
  }
  const bgPid = backgroundEvent.personId
  if (!bgPid) return false
  return getEventParticipantIds(foregroundEvent).includes(bgPid)
}

export function countResolvableCollisions(backgroundEvents: Event[], foregroundEvents: Event[]): number {
  return backgroundEvents.reduce((count, bg) => {
    if (!isResolvableBackgroundCollision(bg)) return count
    const hasCollision = foregroundEvents.some((fg) => overlapsSameParticipant(bg, fg))
    return hasCollision ? count + 1 : count
  }, 0)
}
