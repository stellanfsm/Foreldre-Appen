import { describe, expect, it } from 'vitest'
import type { Event, Person, SchoolDayOverride } from '../../types'
import { buildBackgroundEventsForDate } from '../backgroundEvents'

// 2026-04-20 = mandag (Mon = weekday 0 i WeekdayMonFri).
const MONDAY = '2026-04-20'
const SATURDAY = '2026-04-25'

function makeChild(overrides: Partial<Person> = {}): Person {
  return {
    id: 'c1',
    name: 'Ida',
    colorTint: '#eef2ff',
    colorAccent: '#4f46e5',
    memberKind: 'child',
    school: {
      gradeBand: '5-7',
      weekdays: {
        0: {
          useSimpleDay: false,
          schoolStart: '08:30',
          schoolEnd: '14:00',
          lessons: [
            { subjectKey: 'matematikk', start: '08:30', end: '09:15' },
            { subjectKey: 'norsk', start: '09:30', end: '10:15' },
            { subjectKey: 'kroppsøving', start: '10:30', end: '11:15' },
          ],
        },
      },
    },
    ...overrides,
  }
}

function makeOverrideEvent(id: string, personId: string, override: SchoolDayOverride, extra: Partial<Event> = {}): Event {
  return {
    id,
    personId,
    title: extra.title ?? 'Spesialdag',
    start: extra.start ?? '09:00',
    end: extra.end ?? '10:00',
    metadata: { schoolDayOverride: override, ...(extra.metadata ?? {}) },
    ...(extra.notes ? { notes: extra.notes } : {}),
  }
}

describe('buildBackgroundEventsForDate — override-logikk', () => {
  it('ingen dayEvents → oppfører seg som før (en skoleblokk)', () => {
    const out = buildBackgroundEventsForDate(MONDAY, [makeChild()], [])
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Skole')
    expect(out[0].metadata?.backgroundSubkind).toBe('school_day')
    expect(out[0].start).toBe('08:30')
    expect(out[0].end).toBe('11:15')
  })

  it('hide_day fjerner skoleblokken for barnet', () => {
    const child = makeChild()
    const ev = makeOverrideEvent('e-fri', child.id, { mode: 'hide_day', kind: 'free_day' })
    const out = buildBackgroundEventsForDate(MONDAY, [child], [], [ev])
    expect(out).toHaveLength(0)
  })

  it('replace_day erstatter skoleblokk med override-label', () => {
    const child = makeChild()
    const ev = makeOverrideEvent('e-exam', child.id, {
      mode: 'replace_day',
      kind: 'exam_day',
      label: 'Heldagsprøve matematikk',
    })
    const out = buildBackgroundEventsForDate(MONDAY, [child], [], [ev])
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Heldagsprøve matematikk')
    expect(out[0].metadata?.backgroundSubkind).toBe('school_day_override')
    // Fallback-tider = dagens skoletidsvindu
    expect(out[0].start).toBe('08:30')
    expect(out[0].end).toBe('11:15')
  })

  it('replace_day bruker egne tider når de er satt', () => {
    const child = makeChild()
    const ev = makeOverrideEvent('e-trip', child.id, {
      mode: 'replace_day',
      kind: 'trip_day',
      label: 'Skidag',
      schoolStart: '09:00',
      schoolEnd: '15:00',
    })
    const out = buildBackgroundEventsForDate(MONDAY, [child], [], [ev])
    expect(out[0].title).toBe('Skidag')
    expect(out[0].start).toBe('09:00')
    expect(out[0].end).toBe('15:00')
  })

  it('adjust_day justerer skoleblokkens start/slutt men beholder "Skole"', () => {
    const child = makeChild()
    const ev = makeOverrideEvent('e-delay', child.id, {
      mode: 'adjust_day',
      kind: 'delayed_start',
      schoolStart: '10:30',
    })
    const out = buildBackgroundEventsForDate(MONDAY, [child], [], [ev])
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Skole')
    expect(out[0].metadata?.backgroundSubkind).toBe('school_day')
    expect(out[0].start).toBe('10:30')
    expect(out[0].end).toBe('11:15')
  })

  it('replace_day vinner over hide_day og adjust_day på samme dag', () => {
    const child = makeChild()
    const evAdjust = makeOverrideEvent('a', child.id, { mode: 'adjust_day', kind: 'delayed_start', schoolStart: '10:00' })
    const evHide = makeOverrideEvent('b', child.id, { mode: 'hide_day', kind: 'free_day' })
    const evReplace = makeOverrideEvent('c', child.id, { mode: 'replace_day', kind: 'activity_day', label: 'Idrettsdag' })
    const out = buildBackgroundEventsForDate(MONDAY, [child], [], [evAdjust, evHide, evReplace])
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Idrettsdag')
    expect(out[0].metadata?.backgroundSubkind).toBe('school_day_override')
  })

  it('override på et annet barn påvirker ikke dette barnet', () => {
    const ida = makeChild({ id: 'c1', name: 'Ida' })
    const eva = makeChild({ id: 'c2', name: 'Eva' })
    const evOther = makeOverrideEvent('e1', 'c2', { mode: 'hide_day', kind: 'free_day' })
    const out = buildBackgroundEventsForDate(MONDAY, [ida, eva], [], [evOther])
    const idaBlocks = out.filter((b) => b.personId === 'c1')
    const evaBlocks = out.filter((b) => b.personId === 'c2')
    expect(idaBlocks).toHaveLength(1)
    expect(idaBlocks[0].title).toBe('Skole')
    expect(evaBlocks).toHaveLength(0)
  })

  it('lørdag returnerer ingen blokker uavhengig av override', () => {
    const child = makeChild()
    const ev = makeOverrideEvent('e', child.id, { mode: 'replace_day', kind: 'exam_day', label: 'Test' })
    expect(buildBackgroundEventsForDate(SATURDAY, [child], [], [ev])).toEqual([])
  })

  it('adjust_day med ugyldig range faller tilbake til normal skoleblokk', () => {
    const child = makeChild()
    const ev = makeOverrideEvent('e', child.id, {
      mode: 'adjust_day',
      kind: 'delayed_start',
      schoolStart: '14:00',
      schoolEnd: '09:00',
    })
    const out = buildBackgroundEventsForDate(MONDAY, [child], [], [ev])
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Skole')
    expect(out[0].start).toBe('08:30')
    expect(out[0].end).toBe('11:15')
  })

  it('ignorerer syntetiske bakgrunns-events som kilde til override', () => {
    const child = makeChild()
    const syntheticBg: Event = {
      id: 'bg-school-c1-...',
      personId: child.id,
      title: 'Skole',
      start: '08:30',
      end: '11:15',
      metadata: {
        calendarLayer: 'background',
        backgroundKind: 'school',
        schoolDayOverride: { mode: 'hide_day', kind: 'free_day' },
      },
    }
    const out = buildBackgroundEventsForDate(MONDAY, [child], [], [syntheticBg])
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Skole')
  })

  it('school week overlay: remove_school_block skjuler skole den aktuelle uka', () => {
    const child = makeChild({
      school: {
        ...makeChild().school!,
        weekOverlays: [
          {
            id: 'ov-1',
            weekYear: 2026,
            weekNumber: 17,
            dailyActions: {
              0: { action: 'remove_school_block', subjectUpdates: [] },
            },
          },
        ],
      },
    })
    const out = buildBackgroundEventsForDate(MONDAY, [child], [])
    expect(out).toHaveLength(0)
  })

  it('school week overlay: replace_school_block gir spesialtittel', () => {
    const child = makeChild({
      school: {
        ...makeChild().school!,
        weekOverlays: [
          {
            id: 'ov-2',
            weekYear: 2026,
            weekNumber: 17,
            dailyActions: {
              0: {
                action: 'replace_school_block',
                summary: 'Heldagsprøve matematikk',
                subjectUpdates: [{ subjectKey: 'matematikk' }],
              },
            },
          },
        ],
      },
    })
    const out = buildBackgroundEventsForDate(MONDAY, [child], [])
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Heldagsprøve matematikk')
    expect(out[0].metadata?.backgroundSubkind).toBe('school_day_override')
  })

  it('school week overlay: enrich_existing_school_block beholder tittel "Skole"', () => {
    const child = makeChild({
      school: {
        ...makeChild().school!,
        weekOverlays: [
          {
            id: 'ov-3',
            weekYear: 2026,
            weekNumber: 17,
            dailyActions: {
              0: {
                action: 'enrich_existing_school_block',
                summary: 'Tyskprøve',
                subjectUpdates: [{ subjectKey: 'fremmedspråk', customLabel: 'Tysk' }],
              },
            },
          },
        ],
      },
    })
    const out = buildBackgroundEventsForDate(MONDAY, [child], [])
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Skole')
    const day = out[0].metadata?.schoolWeekOverlayDay as { action?: string } | undefined
    expect(day?.action).toBe('enrich_existing_school_block')
  })
})
