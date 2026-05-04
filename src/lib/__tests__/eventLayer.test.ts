import { describe, expect, it } from 'vitest'
import type { Event } from '../../types'
import { isAllDayEvent } from '../eventLayer'

function ev(partial: Partial<Event> & Pick<Event, 'id' | 'personId' | 'title' | 'start' | 'end'>): Event {
  return { ...partial } as Event
}

describe('isAllDayEvent', () => {
  it('er true kun for eksplisitt boolean true', () => {
    expect(
      isAllDayEvent(
        ev({
          id: '1',
          personId: 'p',
          title: 'x',
          start: '00:00',
          end: '23:59',
          metadata: { isAllDay: true },
        })
      )
    ).toBe(true)
  })

  it('er false når isAllDay mangler', () => {
    expect(
      isAllDayEvent(
        ev({
          id: '1',
          personId: 'p',
          title: 'x',
          start: '17:45',
          end: '18:45',
        })
      )
    ).toBe(false)
  })

  it('er false for strengen "false" (tidligere !! ga feilaktig true)', () => {
    expect(
      isAllDayEvent(
        ev({
          id: '1',
          personId: 'p',
          title: 'x',
          start: '17:45',
          end: '18:45',
          metadata: { isAllDay: 'false' as unknown as boolean },
        })
      )
    ).toBe(false)
  })
})
