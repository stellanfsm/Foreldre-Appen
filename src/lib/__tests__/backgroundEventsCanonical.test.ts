import { beforeAll, describe, expect, it } from 'vitest'
import type { Person, SchoolWeekOverlay } from '../../types'
import type {
  CanonicalSchoolContentDraft,
  CanonicalSchoolContentItem,
  CanonicalSchoolDay,
  SchoolBlockDayOperation,
} from '../canonicalSchoolTypes'
import { buildBackgroundEventsForDate } from '../backgroundEvents'
import { ensureNorwegianHolidaysLoaded } from '../norwegianSchoolCalendar'
import { getISOWeek, getISOWeekYear } from '../isoWeek'

// 2026-04-20 = mandag (weekday 0). Uke/år hentes via de samme ISO-helperne kalenderen bruker.
const MONDAY = '2026-04-20'
const dt = new Date(`${MONDAY}T12:00:00`)
const WEEK = { weekYear: getISOWeekYear(dt), weekNumber: getISOWeek(dt) }

beforeAll(async () => {
  await ensureNorwegianHolidaysLoaded()
})

function child(): Person {
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
          lessons: [
            { subjectKey: 'matematikk', start: '08:30', end: '09:15' },
            { subjectKey: 'norsk', start: '09:30', end: '10:15' },
            { subjectKey: 'kroppsoving', start: '10:30', end: '11:15' },
          ],
        },
      },
    },
  }
}

let itemN = 0
function item(over: Partial<CanonicalSchoolContentItem> = {}): CanonicalSchoolContentItem {
  itemN += 1
  return {
    sourceId: `s${itemN}`,
    itemId: `it${itemN}`,
    sourceRef: null,
    placement: 'subject',
    contentType: 'lesson',
    action: 'enrich',
    subject: null,
    subjectKey: null,
    customLabel: null,
    start: null,
    end: null,
    audienceEntries: [],
    sections: null,
    sourceText: null,
    evidence: null,
    confidence: 0.9,
    reviewFlags: [],
    ...over,
  }
}

function mondayDraft(op: SchoolBlockDayOperation, over: Partial<CanonicalSchoolDay> = {}): CanonicalSchoolContentDraft {
  const day: CanonicalSchoolDay = {
    dayId: 'd0',
    date: MONDAY,
    weekdayIndex: '0',
    dayLabel: null,
    dayOperation: op,
    dayResolution: 'enrich_only',
    subjectItems: [],
    audienceItems: [],
    generalDayMessages: [],
    confidence: 0.9,
    evidence: null,
    reviewFlags: [],
    ...over,
  }
  return {
    schemaVersion: '1.0.0',
    sourceTitle: 'Ukeplan',
    originalSourceType: 'school_activity_plan',
    personId: 'c1',
    personMatchStatus: 'matched',
    classCode: '5A',
    days: [day],
    structureStatus: 'complete',
    reviewFlags: [],
  }
}

function withCanonicalOverlay(draft: CanonicalSchoolContentDraft, extra: Partial<SchoolWeekOverlay> = {}): Person {
  const c = child()
  const overlay: SchoolWeekOverlay = {
    id: `canonical-${WEEK.weekYear}-w${WEEK.weekNumber}`,
    weekYear: WEEK.weekYear,
    weekNumber: WEEK.weekNumber,
    dailyActions: {},
    canonicalSchoolContentDraft: draft,
    ...extra,
  }
  c.school!.weekOverlays = [overlay]
  return c
}

const NONE: SchoolBlockDayOperation = { op: 'none' }

describe('backgroundEvents — canonical readback (samme plan som preview)', () => {
  it('none: normal skoleblokk fra lagret timeplan; subject-item plassert under riktig økt i planen', () => {
    const draft = mondayDraft(NONE, {
      subjectItems: [item({ subjectKey: 'matematikk', start: '08:30', end: '09:15', sourceText: 'Prøve i morgen' })],
    })
    const out = buildBackgroundEventsForDate(MONDAY, [withCanonicalOverlay(draft)], [])
    expect(out).toHaveLength(1)
    expect(out[0]!.title).toBe('Skole')
    expect(out[0]!.start).toBe('08:30')
    expect(out[0]!.end).toBe('11:15')
    const planDay = (out[0]!.metadata as Record<string, unknown>).schoolCanonicalDay as {
      timetable: Array<{ label: string; items: Array<{ lines: string[] }> }>
    }
    const mathRow = planDay.timetable.find((r) => r.items.length > 0)!
    expect(mathRow.items[0]!.lines).toEqual(['Prøve i morgen'])
  })

  it('replace_day: ordinær timeplan skjult; én erstatningsblokk med reason + effektive tider', () => {
    const op: SchoolBlockDayOperation = { op: 'replace_day', activityKind: 'other', effectiveStart: '09:00', effectiveEnd: '12:00', reason: 'Siste skoledag', confidence: 0.9 }
    const out = buildBackgroundEventsForDate(MONDAY, [withCanonicalOverlay(mondayDraft(op))], [])
    expect(out).toHaveLength(1)
    expect(out[0]!.title).toBe('Siste skoledag')
    expect(out[0]!.start).toBe('09:00')
    expect(out[0]!.end).toBe('12:00')
    expect((out[0]!.metadata as Record<string, unknown>).backgroundSubkind).toBe('school_day_override')
  })

  it('adjust_start: skoleblokken starter ved effektiv tid (trimmet timeplan)', () => {
    const op: SchoolBlockDayOperation = { op: 'adjust_start', effectiveStart: '10:00', reason: null, confidence: 0.9 }
    const out = buildBackgroundEventsForDate(MONDAY, [withCanonicalOverlay(mondayDraft(op))], [])
    expect(out).toHaveLength(1)
    expect(out[0]!.start).toBe('10:00')
    expect(out[0]!.end).toBe('11:15')
  })

  it('adjust_end: skoleblokken slutter ved effektiv tid', () => {
    const op: SchoolBlockDayOperation = { op: 'adjust_end', effectiveEnd: '09:15', reason: null, confidence: 0.9 }
    const out = buildBackgroundEventsForDate(MONDAY, [withCanonicalOverlay(mondayDraft(op))], [])
    expect(out).toHaveLength(1)
    expect(out[0]!.start).toBe('08:30')
    expect(out[0]!.end).toBe('09:15')
  })

  it('canonical vinner over legacy dailyActions for samme uke (ingen parallell tolkning)', () => {
    const p = withCanonicalOverlay(mondayDraft(NONE), {
      dailyActions: { 0: { action: 'remove_school_block', subjectUpdates: [] } },
    })
    const out = buildBackgroundEventsForDate(MONDAY, [p], [])
    // Hadde legacy blitt tolket ville remove_school_block gitt 0 blokker; canonical gir normal blokk.
    expect(out).toHaveLength(1)
    expect(out[0]!.title).toBe('Skole')
  })

  it('ukedag uten canonical dag → normal skoleblokk (fall gjennom, ingen krasj)', () => {
    // Draften har bare mandag; be om samme mandag men fjern dagen → ingen plandag for wd.
    const draft = mondayDraft(NONE)
    draft.days = [] // ingen dager → hasValidSchoolBlockDays ville vært false, men overlay lagret likevel
    const p = withCanonicalOverlay(draft)
    const out = buildBackgroundEventsForDate(MONDAY, [p], [])
    expect(out).toHaveLength(1)
    expect(out[0]!.title).toBe('Skole') // normal blokk
  })
})
