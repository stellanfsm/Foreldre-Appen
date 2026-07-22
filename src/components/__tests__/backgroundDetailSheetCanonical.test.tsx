// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach } from 'vitest'
import type { Person, SchoolWeekOverlay } from '../../types'
import type {
  CanonicalSchoolContentDraft,
  CanonicalSchoolContentItem,
  CanonicalSchoolDay,
  SchoolBlockDayOperation,
} from '../../lib/canonicalSchoolTypes'
import { buildBackgroundEventsForDate } from '../../lib/backgroundEvents'
import { ensureNorwegianHolidaysLoaded } from '../../lib/norwegianSchoolCalendar'
import { getISOWeek, getISOWeekYear } from '../../lib/isoWeek'

// useFamily leverer personen (med lagret canonical overlay) til sheeten.
let mockPeople: Person[] = []
vi.mock('../../context/FamilyContext', () => ({
  useFamily: () => ({ people: mockPeople, updatePerson: vi.fn() }),
}))

import { BackgroundDetailSheet } from '../BackgroundDetailSheet'

// 2026-06-16 = tirsdag (weekday 1).
const TUESDAY = '2026-06-16'
const dt = new Date(`${TUESDAY}T12:00:00`)
const WEEK = { weekYear: getISOWeekYear(dt), weekNumber: getISOWeek(dt) }

beforeAll(async () => {
  await ensureNorwegianHolidaysLoaded()
})
afterEach(() => {
  cleanup()
  mockPeople = []
})

let n = 0
function item(over: Partial<CanonicalSchoolContentItem> = {}): CanonicalSchoolContentItem {
  n += 1
  return {
    sourceId: `s${n}`, itemId: `it${n}`, sourceRef: null, placement: 'subject', contentType: 'lesson',
    action: 'enrich', subject: null, subjectKey: null, customLabel: null, start: null, end: null,
    audienceEntries: [], sections: null, sourceText: null, evidence: null, confidence: 0.9, reviewFlags: [],
    ...over,
  }
}

function tuesdayDraft(op: SchoolBlockDayOperation, over: Partial<CanonicalSchoolDay> = {}): CanonicalSchoolContentDraft {
  const day: CanonicalSchoolDay = {
    dayId: 'd1', date: TUESDAY, weekdayIndex: '1', dayLabel: null, dayOperation: op,
    dayResolution: 'enrich_only', subjectItems: [], audienceItems: [], generalDayMessages: [],
    confidence: 0.9, evidence: null, reviewFlags: [], ...over,
  }
  return {
    schemaVersion: '1.0.0', sourceTitle: 'Ukeplan', originalSourceType: 'school_activity_plan',
    personId: 'c1', personMatchStatus: 'matched', classCode: '2STC', days: [day],
    structureStatus: 'complete', reviewFlags: [],
  }
}

function childWith(draft: CanonicalSchoolContentDraft): Person {
  const overlay: SchoolWeekOverlay = {
    id: `canonical-${WEEK.weekYear}-w${WEEK.weekNumber}`,
    weekYear: WEEK.weekYear,
    weekNumber: WEEK.weekNumber,
    dailyActions: {},
    canonicalSchoolContentDraft: draft,
  }
  return {
    id: 'c1', name: 'Ida', colorTint: '#eef2ff', colorAccent: '#4f46e5', memberKind: 'child',
    school: {
      gradeBand: '8-10',
      weekdays: {
        1: {
          useSimpleDay: false,
          lessons: [
            { subjectKey: 'matematikk', start: '10:35', end: '11:35' },
            { subjectKey: 'norsk', start: '12:00', end: '13:00' },
          ],
        },
      },
      weekOverlays: [overlay],
    },
  }
}

/** Bygger skoleeventet via readback og rendrer sheeten. */
function renderCanonicalSheet(draft: CanonicalSchoolContentDraft) {
  const person = childWith(draft)
  mockPeople = [person]
  const events = buildBackgroundEventsForDate(TUESDAY, [person], [])
  const schoolEvent = events.find((e) => e.metadata?.backgroundKind === 'school')!
  render(
    <BackgroundDetailSheet
      event={schoolEvent}
      date={TUESDAY}
      foregroundEvents={[]}
      dayEvents={[]}
      dayTasks={[]}
      onClose={() => undefined}
    />
  )
  return schoolEvent
}

const NONE: SchoolBlockDayOperation = { op: 'none' }

describe('BackgroundDetailSheet — canonical readback (save→readback→UI)', () => {
  it('Del 8: subject-item vises under Matematikk, general message under «Ellers denne dagen», ingen duplikat', () => {
    const draft = tuesdayDraft(NONE, {
      subjectItems: [item({ subjectKey: 'matematikk', start: '10:35', end: '11:35', sourceText: 'Forberedelsesdag til heldagsprøve i matematikk' })],
      generalDayMessages: [item({ placement: 'day', sourceText: 'Ta med kalkulator' })],
    })
    renderCanonicalSheet(draft)

    expect(screen.getByText('Forberedelsesdag til heldagsprøve i matematikk')).toBeTruthy()
    expect(screen.getByText('Ta med kalkulator')).toBeTruthy()
    expect(screen.getByText('Ellers denne dagen')).toBeTruthy()
    // Subject-teksten vises ÉN gang (ikke også under «Ellers denne dagen»).
    expect(screen.getAllByText('Forberedelsesdag til heldagsprøve i matematikk')).toHaveLength(1)
  })

  it('Del 9 (fredagsform på tirsdag): Norsk under Norsk, Tysk som egen faggruppe, general én gang, ingen slug, ingen oppfunne fag', () => {
    const draft = tuesdayDraft(NONE, {
      subjectItems: [
        item({ subjectKey: 'norsk', sourceText: 'Nyromantikken og «Ringen»' }),
        item({ subjectKey: 'tysk', subject: 'Tysk', sourceText: 'Beskrive et kunstverk på tysk' }),
      ],
      generalDayMessages: [item({ placement: 'day', sourceText: 'Husk basisboka' })],
    })
    renderCanonicalSheet(draft)

    expect(screen.getByText('Nyromantikken og «Ringen»')).toBeTruthy()
    expect(screen.getByText('Beskrive et kunstverk på tysk')).toBeTruthy()
    expect(screen.getByText('Tysk')).toBeTruthy() // egen faggruppe (fag finnes ikke i timeplanen)
    expect(screen.getAllByText('Husk basisboka')).toHaveLength(1)
    expect(screen.queryByText(/matematikk|norsk|tysk-/)).toBeNull() // ingen subjectKey-slug
    expect(screen.queryByText(/Spansk|Fransk/)).toBeNull() // ingen oppfunne fag
  })

  it('Del 10 replace_day: ordinære fag skjult, erstatningsblokk + effektiv tid synlig', () => {
    const op: SchoolBlockDayOperation = { op: 'replace_day', activityKind: 'other', effectiveStart: '09:00', effectiveEnd: '12:00', reason: 'Siste skoledag med opplegg', confidence: 0.9 }
    const draft = tuesdayDraft(op, { subjectItems: [item({ subjectKey: 'norsk', subject: 'Norsk', sourceText: 'Prosjekt' })] })
    renderCanonicalSheet(draft)

    expect(screen.getByText('Siste skoledag med opplegg')).toBeTruthy()
    expect(screen.getByText('09:00–12:00')).toBeTruthy()
    // Ordinær matematikk-økt (10:35–11:35) vises ikke som timeplanrad.
    expect(screen.queryByText('10:35–11:35')).toBeNull()
  })

  it('Del 10 adjust_start: skoleblokken trimmes til effektiv start i renderet innhold', () => {
    const op: SchoolBlockDayOperation = { op: 'adjust_start', effectiveStart: '12:00', reason: null, confidence: 0.9 }
    renderCanonicalSheet(tuesdayDraft(op))
    // matematikk 10:35–11:35 slutter før 12:00 → skjult; norsk 12:00–13:00 beholdt.
    expect(screen.getByText('12:00–13:00')).toBeTruthy()
    expect(screen.queryByText('10:35–11:35')).toBeNull()
    expect(screen.getByText('Oppmøte kl. 12:00')).toBeTruthy()
  })

  it('Del 10 adjust_end: senere økter trimmes bort', () => {
    const op: SchoolBlockDayOperation = { op: 'adjust_end', effectiveEnd: '11:35', reason: null, confidence: 0.9 }
    renderCanonicalSheet(tuesdayDraft(op))
    expect(screen.getByText('10:35–11:35')).toBeTruthy()
    expect(screen.queryByText('12:00–13:00')).toBeNull()
    expect(screen.getByText('Slutt kl. 11:35')).toBeTruthy()
  })

  it('Del 11 ugyldig lagret snapshot: ingen krasj, normal skoleblokk (fallback)', () => {
    const person = childWith(tuesdayDraft(NONE))
    // Korrupt snapshot i lagret overlay.
    person.school!.weekOverlays![0]!.canonicalSchoolContentDraft = { schemaVersion: '1.0.0', days: 'ugyldig' } as never
    mockPeople = [person]
    const events = buildBackgroundEventsForDate(TUESDAY, [person], [])
    const schoolEvent = events.find((e) => e.metadata?.backgroundKind === 'school')!
    // Ingen canonical-metadata → normal skoleblokk.
    expect((schoolEvent.metadata as Record<string, unknown>).schoolCanonicalDay).toBeUndefined()
    render(
      <BackgroundDetailSheet event={schoolEvent} date={TUESDAY} foregroundEvents={[]} dayEvents={[]} dayTasks={[]} onClose={() => undefined} />
    )
    expect(screen.getByText('Ida')).toBeTruthy() // rendrer uten krasj
    expect(screen.getByText('Timeplan')).toBeTruthy()
  })
})

describe('serialiserbar metadata (Del 7)', () => {
  it('schoolCanonicalDay er ren JSON (ingen Map/Set/funksjoner)', () => {
    const draft = tuesdayDraft(NONE, {
      subjectItems: [item({ subjectKey: 'matematikk', start: '10:35', end: '11:35', sourceText: 'X' })],
      generalDayMessages: [item({ placement: 'day', sourceText: 'Y' })],
    })
    const person = childWith(draft)
    const events = buildBackgroundEventsForDate(TUESDAY, [person], [])
    const meta = events.find((e) => e.metadata?.backgroundKind === 'school')!.metadata as Record<string, unknown>
    const planDay = meta.schoolCanonicalDay
    // JSON-roundtrip uten tap = ingen Map/Set/funksjoner/klasseinstanser.
    expect(JSON.parse(JSON.stringify(planDay))).toEqual(planDay)
  })
})
