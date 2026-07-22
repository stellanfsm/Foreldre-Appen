import { describe, expect, it } from 'vitest'
import type { Person, SchoolLessonSlot } from '../../types'
import type {
  CanonicalSchoolContentDraft,
  CanonicalSchoolContentItem,
  CanonicalSchoolDay,
  SchoolBlockDayOperation,
  SchoolBlockWeekdayIndex,
} from '../canonicalSchoolTypes'
import { buildCanonicalSchoolImportPlan } from '../canonicalSchoolImportPlan'

// ---- Fixtures ----

function makeChild(weekdays: Partial<Record<0 | 1 | 2 | 3 | 4, SchoolLessonSlot[]>>): Person {
  return {
    id: 'child-1',
    name: 'Kari',
    colorTint: '#fff',
    colorAccent: '#000',
    memberKind: 'child',
    school: {
      gradeBand: '8-10',
      weekdays: Object.fromEntries(
        Object.entries(weekdays).map(([wd, ls]) => [wd, { useSimpleDay: false, lessons: ls }])
      ),
    },
  }
}

let itemCounter = 0
function item(over: Partial<CanonicalSchoolContentItem> = {}): CanonicalSchoolContentItem {
  itemCounter += 1
  return {
    sourceId: `s-${itemCounter}`,
    itemId: `it-${itemCounter}`,
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

const NONE: SchoolBlockDayOperation = { op: 'none' }

function day(
  weekdayIndex: SchoolBlockWeekdayIndex | null,
  over: Partial<CanonicalSchoolDay> = {}
): CanonicalSchoolDay {
  return {
    dayId: `d-${weekdayIndex}`,
    date: null,
    weekdayIndex,
    dayLabel: null,
    dayOperation: NONE,
    dayResolution: 'enrich_only',
    subjectItems: [],
    audienceItems: [],
    generalDayMessages: [],
    confidence: 0.9,
    evidence: null,
    reviewFlags: [],
    ...over,
  }
}

function draft(days: CanonicalSchoolDay[], over: Partial<CanonicalSchoolContentDraft> = {}): CanonicalSchoolContentDraft {
  return {
    schemaVersion: '1.0.0',
    sourceTitle: 'Ukeplan',
    originalSourceType: 'school_activity_plan',
    personId: 'child-1',
    personMatchStatus: 'matched',
    classCode: '2STC',
    days,
    structureStatus: 'complete',
    reviewFlags: [],
    ...over,
  }
}

const build = (days: CanonicalSchoolDay[], child: Person | undefined) =>
  buildCanonicalSchoolImportPlan({ draft: draft(days), child })

// ---------------------------------------------------------------------------

describe('B. eksakt økt (subjectKey + start/end)', () => {
  it('plasserer item under den matchende økten', () => {
    const child = makeChild({ 1: [{ subjectKey: 'matematikk', start: '10:35', end: '11:35' }] })
    const d = day('1', { subjectItems: [item({ subjectKey: 'matematikk', start: '10:35', end: '11:35', sourceText: 'Forberedelsesdag' })] })
    const [tue] = build([d], child).days
    const row = tue.timetable.find((r) => r.label.toLowerCase().includes('matematikk'))!
    expect(row.items.map((i) => i.lines).flat()).toEqual(['Forberedelsesdag'])
    expect(tue.unplacedSubjectGroups).toHaveLength(0)
    expect(tue.generalMessages).toHaveLength(0)
  })
})

describe('C. eksakt fag, én kandidat uten sikker tid', () => {
  it('plasserer under eneste matching fagøkt', () => {
    const child = makeChild({ 1: [{ subjectKey: 'matematikk', start: '10:35', end: '11:35' }] })
    const d = day('1', { subjectItems: [item({ subjectKey: 'matematikk', sourceText: 'Uten tid' })] })
    const [tue] = build([d], child).days
    const row = tue.timetable.find((r) => r.items.length > 0)!
    expect(row.label.toLowerCase()).toContain('matematikk')
    expect(row.items[0]!.lines).toEqual(['Uten tid'])
    expect(tue.unplacedSubjectGroups).toHaveLength(0)
  })
})

describe('D. flere like fagøkter → ingen gjetting', () => {
  it('legger item i egen faggruppe (beholder fag-label), ikke tilfeldig plassering', () => {
    const child = makeChild({
      1: [
        { subjectKey: 'matematikk', start: '08:15', end: '09:15' },
        { subjectKey: 'matematikk', start: '10:35', end: '11:35' },
      ],
    })
    const d = day('1', { subjectItems: [item({ subjectKey: 'matematikk', subject: 'Matematikk', sourceText: 'Flere økter' })] })
    const [tue] = build([d], child).days
    expect(tue.timetable.every((r) => r.items.length === 0)).toBe(true)
    expect(tue.unplacedSubjectGroups).toHaveLength(1)
    expect(tue.unplacedSubjectGroups[0]!.label).toBe('Matematikk')
    expect(tue.unplacedSubjectGroups[0]!.items[0]!.lines).toEqual(['Flere økter'])
  })
})

describe('A. fag som ikke finnes i timeplanen', () => {
  it('vises som egen faggruppe (ikke oppfunnet, ikke under general)', () => {
    const child = makeChild({ 4: [{ subjectKey: 'norsk', start: '08:15', end: '09:15' }] })
    const d = day('4', {
      subjectItems: [
        item({ subjectKey: 'norsk', sourceText: 'Nyromantikken' }),
        item({ subjectKey: 'tysk', subject: 'Tysk', sourceText: 'Paul Klee på tysk' }),
      ],
    })
    const [fri] = build([d], child).days
    // Norsk plasseres under norsk-økten; tysk finnes ikke → egen gruppe.
    const norskRow = fri.timetable.find((r) => r.items.length > 0)!
    expect(norskRow.items[0]!.lines).toEqual(['Nyromantikken'])
    expect(fri.unplacedSubjectGroups.map((g) => g.label)).toEqual(['Tysk'])
    expect(fri.generalMessages).toHaveLength(0)
  })
})

describe('E. general day messages', () => {
  it('vises én gang (deduplisert)', () => {
    const d = day('0', {
      generalDayMessages: [
        item({ placement: 'day', sourceText: 'Husk gymtøy' }),
        item({ placement: 'day', sourceText: '  husk gymtøy  ' }),
      ],
    })
    const [mon] = build([d], makeChild({ 0: [] })).days
    expect(mon.generalMessages.flatMap((i) => i.lines)).toEqual(['Husk gymtøy'])
  })
})

describe('F. audience items', () => {
  it('vises én gang, ingen ny klassematching (bruker backend-resolvert tekst)', () => {
    const d = day('3', {
      audienceItems: [item({ placement: 'audience', subject: 'Rådgivning', sourceText: '2STC møter 10:30' })],
    })
    const [thu] = build([d], makeChild({ 3: [] })).days
    expect(thu.audienceItems.flatMap((i) => i.lines)).toEqual(['2STC møter 10:30'])
  })
})

describe('G. replace_day', () => {
  it('skjuler ordinær timeplan; subject-items som faggrupper + erstatningsblokk', () => {
    const child = makeChild({ 4: [{ subjectKey: 'kunst', start: '08:15', end: '09:15' }] })
    const op: SchoolBlockDayOperation = { op: 'replace_day', activityKind: 'other', effectiveStart: '09:00', effectiveEnd: '12:00', reason: 'Opplegg', confidence: 0.9 }
    const d = day('4', { dayOperation: op, subjectItems: [item({ subjectKey: 'norsk', subject: 'Norsk', sourceText: 'Prosjekt' })] })
    const [fri] = build([d], child).days
    expect(fri.timetable).toHaveLength(0)
    expect(fri.replacement).toEqual({ title: 'Opplegg', start: '09:00', end: '12:00' })
    expect(fri.unplacedSubjectGroups[0]!.label).toBe('Norsk')
  })
})

describe('H. adjust_start / adjust_end', () => {
  it('adjust_start trimmer bort tidlige økter', () => {
    const child = makeChild({
      2: [
        { subjectKey: 'naturfag', start: '08:15', end: '09:15' },
        { subjectKey: 'samfunnsfag', start: '10:35', end: '11:35' },
      ],
    })
    const op: SchoolBlockDayOperation = { op: 'adjust_start', effectiveStart: '10:30', reason: null, confidence: 0.9 }
    const [wed] = build([day('2', { dayOperation: op })], child).days
    expect(wed.timetable.map((r) => `${r.start}-${r.end}`)).toEqual(['10:35-11:35'])
    expect(wed.note).toBe('Oppmøte kl. 10:30')
  })

  it('adjust_end trimmer bort sene økter og klipper overlappende', () => {
    const child = makeChild({ 3: [{ subjectKey: 'norsk', start: '13:00', end: '14:00' }] })
    const op: SchoolBlockDayOperation = { op: 'adjust_end', effectiveEnd: '13:15', reason: null, confidence: 0.9 }
    const [thu] = build([day('3', { dayOperation: op })], child).days
    expect(thu.timetable.map((r) => `${r.start}-${r.end}`)).toEqual(['13:00-13:15'])
    expect(thu.note).toBe('Slutt kl. 13:15')
  })
})

describe('I. plan-item bærer stabil identitet (preview/persist-paritet)', () => {
  it('itemId + sourceId bevares på det plasserte itemet', () => {
    const child = makeChild({ 1: [{ subjectKey: 'matematikk', start: '10:35', end: '11:35' }] })
    const d = day('1', { subjectItems: [item({ itemId: 'stable-1', sourceId: 'src-1', subjectKey: 'matematikk', sourceText: 'X' })] })
    const [tue] = build([d], child).days
    const placed = tue.timetable.flatMap((r) => r.items)[0]!
    expect(placed.itemId).toBe('stable-1')
    expect(placed.sourceId).toBe('src-1')
  })
})

describe('J. gjentatt/duplikat item', () => {
  it('samme itemId to ganger → vises én gang', () => {
    const child = makeChild({ 1: [{ subjectKey: 'matematikk', start: '10:35', end: '11:35' }] })
    const dup = item({ itemId: 'same', subjectKey: 'matematikk', sourceText: 'Én gang' })
    const d = day('1', { subjectItems: [dup, { ...dup }] })
    const [tue] = build([d], child).days
    const placed = tue.timetable.flatMap((r) => r.items)
    expect(placed).toHaveLength(1)
  })
})

describe('I/paritet. JSON-serialisert draft (readback) gir identisk plan', () => {
  it('plan(draft) === plan(JSON-roundtrip(draft)) — lagring taper ingenting semantisk', () => {
    const child = makeChild({
      1: [{ subjectKey: 'matematikk', start: '10:35', end: '11:35' }],
      4: [{ subjectKey: 'norsk', start: '08:15', end: '09:15' }],
    })
    const d = draft([
      day('1', { subjectItems: [item({ subjectKey: 'matematikk', start: '10:35', end: '11:35', sourceText: 'Forberedelse' })] }),
      day('4', {
        dayOperation: { op: 'replace_day', activityKind: 'other', effectiveStart: '09:00', effectiveEnd: '12:00', reason: 'Opplegg', confidence: 0.9 },
        subjectItems: [item({ subjectKey: 'norsk', subject: 'Norsk', sourceText: 'Prosjekt' })],
        generalDayMessages: [item({ placement: 'day', sourceText: 'Husk bok' })],
      }),
    ])
    const before = buildCanonicalSchoolImportPlan({ draft: d, child })
    const stored = JSON.parse(JSON.stringify(d)) as typeof d // simulerer JSONB-lagring/readback
    const after = buildCanonicalSchoolImportPlan({ draft: stored, child })
    expect(after).toEqual(before)
  })
})

describe('L. immutabilitet og determinisme', () => {
  it('muterer ikke input og gir identisk resultat', () => {
    const child = makeChild({ 2: [{ subjectKey: 'naturfag', start: '08:15', end: '09:15' }] })
    const op: SchoolBlockDayOperation = { op: 'adjust_start', effectiveStart: '09:00', reason: null, confidence: 0.9 }
    const d = draft([day('2', { dayOperation: op, subjectItems: [item({ subjectKey: 'naturfag', sourceText: 'X' })] })])
    const snapshot = JSON.parse(JSON.stringify(d))
    const a = buildCanonicalSchoolImportPlan({ draft: d, child })
    const b = buildCanonicalSchoolImportPlan({ draft: d, child })
    expect(d).toEqual(snapshot) // ingen mutasjon
    expect(a).toEqual(b) // deterministisk
    // Original lesson urørt:
    expect(child.school!.weekdays[2]!.lessons![0]!.start).toBe('08:15')
  })
})

describe('ingen slugs / subjectKey i SYNLIG output', () => {
  it('viser fag-label og linjer, aldri subjectKey-slug (som fortsatt bæres internt for persist)', () => {
    const child = makeChild({ 1: [{ subjectKey: 'matematikk', start: '10:35', end: '11:35' }] })
    const d = day('1', { subjectItems: [item({ subjectKey: 'matematikk', sourceText: 'Innhold' })] })
    const [tue] = build([d], child).days
    // Synlig = timetable-labels + item-linjer (IKKE interne felt som subjectKey).
    const visible = [
      ...tue.timetable.map((r) => r.label),
      ...tue.timetable.flatMap((r) => r.items.flatMap((i) => i.lines)),
      ...tue.unplacedSubjectGroups.map((g) => g.label),
    ].join(' ')
    expect(visible).not.toContain('matematikk') // ingen slug i synlig tekst
    // Men identiteten er bevart internt (persist trenger den):
    const placed = tue.timetable.flatMap((r) => r.items)[0]!
    expect(placed.subjectKey).toBe('matematikk')
  })
})
