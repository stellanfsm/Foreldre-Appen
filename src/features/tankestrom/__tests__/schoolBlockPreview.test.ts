import { describe, expect, it } from 'vitest'
import type { Person, SchoolLessonSlot } from '../../../types'
import type {
  PortalSchoolWeekOverlayProposal,
  SchoolBlockContentItem,
  SchoolBlockDay,
  SchoolBlockDayOperation,
  SchoolBlockProposal,
  SchoolBlockWeekdayIndex,
  SchoolWeekOverlayDailyAction,
} from '../types'
import { buildSchoolBlockPreviewDays, hasValidSchoolBlockDays } from '../schoolBlockPreview'

// ---- Generelle fixtures ----

const lessons = (slots: SchoolLessonSlot[]) => slots

/** Barn med lagret timeplan for gitte ukedager (mandag=0 … fredag=4). */
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

function contentItem(over: Partial<SchoolBlockContentItem> = {}): SchoolBlockContentItem {
  return {
    itemId: 'item-1',
    title: '',
    contentType: 'message',
    action: 'enrich',
    subject: null,
    subjectKey: null,
    customLabel: null,
    audienceScope: 'common',
    commonSchedule: null,
    audienceEntries: [],
    resolvedChildAudience: null,
    sections: {},
    activityKind: null,
    evidence: null,
    sourceText: null,
    confidence: 0.9,
    reviewFlags: [],
    ...over,
  }
}

function day(
  weekdayIndex: SchoolBlockWeekdayIndex | null,
  dayOperation: SchoolBlockDayOperation,
  contentItems: SchoolBlockContentItem[] = []
): SchoolBlockDay {
  return {
    dayId: `d-${weekdayIndex}`,
    date: null,
    weekdayIndex,
    dayLabel: null,
    blockTitle: null,
    dayOperation,
    dayResolution: 'enrich_only',
    contentItems,
    confidence: 0.9,
    evidence: null,
    reviewFlags: [],
  }
}

function proposal(days: SchoolBlockDay[]): SchoolBlockProposal {
  return {
    proposalId: 'sb-1',
    kind: 'school_block',
    schemaVersion: '1.0.0',
    sourceTitle: 'Ukeplan',
    originalSourceType: 'pasted_text',
    confidence: 0.9,
    personId: null,
    personMatchStatus: 'not_specified',
    classCode: null,
    days,
    structureStatus: 'complete',
    reviewFlags: [],
  }
}

/** Overlay-proposal med én dagshandling (barnerelevant, allerede filtrert tekst). */
function overlay(
  weekday: number,
  action: SchoolWeekOverlayDailyAction
): PortalSchoolWeekOverlayProposal {
  return {
    proposalId: 'ov-1',
    kind: 'school_week_overlay',
    schemaVersion: '1.0.0',
    confidence: 0.9,
    originalSourceType: 'pasted_text',
    weeklySummary: ['Uke 25'],
    dailyActions: { [weekday]: action },
  }
}

/** Kort wrapper — schoolBlock alltid autoritativ; overlay valgfri tekstfallback. */
function build(
  days: SchoolBlockDay[],
  child: Person | undefined,
  overlayProposal?: PortalSchoolWeekOverlayProposal
) {
  return buildSchoolBlockPreviewDays({ proposal: proposal(days), overlayProposal, child })
}

const NONE: SchoolBlockDayOperation = { op: 'none' }

const wedLessons: SchoolLessonSlot[] = [
  { subjectKey: 'naturfag', start: '08:15', end: '09:15' },
  { subjectKey: 'norsk', start: '09:20', end: '10:20' },
  { subjectKey: 'samfunnsfag', start: '10:35', end: '11:35' },
  { subjectKey: 'matematikk', start: '12:00', end: '13:00' },
]

// ---------------------------------------------------------------------------

describe('hasValidSchoolBlockDays', () => {
  it('true når minst én dag har gyldig ukedag', () => {
    expect(hasValidSchoolBlockDays(proposal([day('0', NONE)]))).toBe(true)
  })
  it('false når ingen dager (stub) eller kun ugyldig ukedag', () => {
    expect(hasValidSchoolBlockDays(proposal([]))).toBe(false)
    expect(hasValidSchoolBlockDays(proposal([day(null, NONE)]))).toBe(false)
    expect(hasValidSchoolBlockDays(undefined)).toBe(false)
  })
})

describe('dagsoperasjon: op none', () => {
  it('beholder ordinære lessons uendret', () => {
    const child = makeChild({ 0: lessons([{ subjectKey: 'matematikk', start: '08:15', end: '09:15' }]) })
    const [mon] = build([day('0', NONE)], child)
    expect(mon.op).toBe('none')
    expect(mon.lessons.map((l) => `${l.start}-${l.end}`)).toEqual(['08:15-09:15'])
    expect(mon.note).toBeNull()
    expect(mon.replacement).toBeNull()
  })
})

describe('dagsoperasjon: adjust_start', () => {
  const op: SchoolBlockDayOperation = { op: 'adjust_start', effectiveStart: '10:30', reason: null, confidence: 0.9 }

  it('skjuler lessons som slutter før/ved effectiveStart; beholder senere', () => {
    const child = makeChild({ 2: wedLessons })
    const [wed] = build([day('2', op)], child)
    expect(wed.lessons.map((l) => `${l.start}-${l.end}`)).toEqual(['10:35-11:35', '12:00-13:00'])
    expect(wed.note).toBe('Oppmøte kl. 10:30')
  })

  it('klipper en lesson som går over effectiveStart, uten å mutere originalen', () => {
    const spanning: SchoolLessonSlot[] = [{ subjectKey: 'norsk', start: '10:00', end: '11:00' }]
    const child = makeChild({ 2: spanning })
    const [wed] = build([day('2', op)], child)
    expect(wed.lessons.map((l) => `${l.start}-${l.end}`)).toEqual(['10:30-11:00'])
    expect(spanning[0]!.start).toBe('10:00')
    expect(child.school!.weekdays[2]!.lessons![0]!.start).toBe('10:00')
  })

  it('bruker reason som dagsmerknad når den finnes', () => {
    const withReason: SchoolBlockDayOperation = { op: 'adjust_start', effectiveStart: '10:30', reason: 'Senere oppstart', confidence: 0.9 }
    const child = makeChild({ 2: wedLessons })
    const [wed] = build([day('2', withReason)], child)
    expect(wed.note).toBe('Senere oppstart')
  })
})

describe('dagsoperasjon: adjust_end', () => {
  const op: SchoolBlockDayOperation = { op: 'adjust_end', effectiveEnd: '13:15', reason: null, confidence: 0.9 }

  it('skjuler lessons som starter ved/etter effectiveEnd; beholder tidligere', () => {
    const child = makeChild({
      3: lessons([
        { subjectKey: 'norsk', start: '08:15', end: '09:15' },
        { subjectKey: 'matematikk', start: '13:15', end: '14:15' },
        { subjectKey: 'gym', start: '13:30', end: '14:30' },
      ]),
    })
    const [thu] = build([day('3', op)], child)
    expect(thu.lessons.map((l) => `${l.start}-${l.end}`)).toEqual(['08:15-09:15'])
    expect(thu.note).toBe('Slutt kl. 13:15')
  })

  it('klipper en lesson som går over sluttiden uten mutasjon', () => {
    const spanning: SchoolLessonSlot[] = [{ subjectKey: 'norsk', start: '13:00', end: '14:00' }]
    const child = makeChild({ 3: spanning })
    const [thu] = build([day('3', op)], child)
    expect(thu.lessons.map((l) => `${l.start}-${l.end}`)).toEqual(['13:00-13:15'])
    expect(spanning[0]!.end).toBe('14:00')
  })
})

describe('dagsoperasjon: replace_day', () => {
  const op: SchoolBlockDayOperation = {
    op: 'replace_day',
    activityKind: 'other',
    effectiveStart: '09:00',
    effectiveEnd: '12:00',
    reason: 'Siste skoledag med opplegg',
    confidence: 0.9,
  }

  it('skjuler alle ordinære lessons og viser effektiv start/slutt', () => {
    const child = makeChild({
      4: lessons([
        { subjectKey: 'kunst', start: '08:15', end: '09:15' },
        { subjectKey: 'krle', start: '09:20', end: '10:20' },
      ]),
    })
    const [fri] = build([day('4', op)], child)
    expect(fri.op).toBe('replace_day')
    expect(fri.lessons).toEqual([])
    expect(fri.replacement).toEqual({ title: 'Siste skoledag med opplegg', start: '09:00', end: '12:00' })
  })

  it('faller tilbake til activityKind-etikett når reason mangler', () => {
    const free: SchoolBlockDayOperation = { op: 'replace_day', activityKind: 'free_day', effectiveStart: null, effectiveEnd: null, reason: null, confidence: 0.9 }
    const child = makeChild({ 0: lessons([{ subjectKey: 'matematikk', start: '08:15', end: '09:15' }]) })
    const [mon] = build([day('0', free)], child)
    expect(mon.replacement).toEqual({ title: 'Fri', start: null, end: null })
    expect(mon.lessons).toEqual([])
  })
})

// ---- Tekstkildeprioritet (A / B / C) ----

describe('tekstkilde A: schoolBlock med løst child-audience vinner', () => {
  it('resolvedChildAudience prioriteres over bred section/sourceText; overlay ignoreres', () => {
    const item = contentItem({
      title: 'Bokinnlevering',
      audienceScope: 'per_audience',
      resolvedChildAudience: { audienceEntryId: 'x', start: '10:30', end: '11:00', room: null, teacher: null },
      sections: { ekstraBeskjed: ['2STA, 2STB, 2STC leverer bok'] }, // bred all-class
      sourceText: '2STA, 2STB, 2STC leverer bok',
    })
    const child = makeChild({ 0: lessons([]) })
    const ov = overlay(0, { action: 'enrich_existing_school_block', subjectUpdates: [{ subjectKey: 'norsk', sections: { lekse: ['OVERLAY-TEKST'] } }] })
    const [mon] = build([day('0', NONE, [item])], child, ov)
    expect(mon.contentLines).toEqual(['Bokinnlevering · 10:30–11:00'])
    expect(mon.contentLines.join(' ')).not.toContain('2STA')
    expect(mon.contentLines.join(' ')).not.toContain('OVERLAY-TEKST')
  })

  it('resolvedChildAudience uten tid/rom/lærer → tittel, ikke bred sourceText', () => {
    const item = contentItem({
      title: 'Klasseavslutning',
      audienceScope: 'per_audience',
      resolvedChildAudience: { audienceEntryId: 'x', start: null, end: null, room: null, teacher: null },
      sourceText: '2STA, 2STB og 2STC har avslutning',
    })
    const child = makeChild({ 1: lessons([]) })
    const [tue] = build([day('1', NONE, [item])], child)
    expect(tue.contentLines).toEqual(['Klasseavslutning'])
    expect(tue.contentLines.join(' ')).not.toContain('2STA')
  })
})

describe('tekstkilde B: overlay-tekst som barnerelevant fallback (mandag-form)', () => {
  it('bred common descriptionLine (alle klasser) + overlay 2STC → viser bare overlay-linjen', () => {
    // SchoolBlock: common tekst med hele klasselisten, ingen løst audience.
    const item = contentItem({
      audienceScope: 'common',
      resolvedChildAudience: null,
      sections: { descriptionLines: ['2STA, 2STB, 2STC, 2STD: bokinnlevering'] },
    })
    // Overlay har allerede barnerelevant linje.
    const ov = overlay(0, { action: 'enrich_existing_school_block', subjectUpdates: [{ subjectKey: 'norsk', sections: { ekstraBeskjed: ['2STC 10.30–11.00'] } }] })
    const child = makeChild({ 0: lessons([]) })
    const [mon] = build([day('0', NONE, [item])], child, ov)
    expect(mon.contentLines).toEqual(['2STC 10.30–11.00'])
    expect(mon.contentLines.join(' ')).not.toContain('2STA')
    expect(mon.contentLines.join(' ')).not.toContain('2STD')
  })

  it('torsdag-form: schoolBlock common har Pulje 1 + Pulje 2; overlay har bare Pulje 1', () => {
    const item = contentItem({
      audienceScope: 'common',
      resolvedChildAudience: null,
      sections: { descriptionLines: ['Pulje 1 møter 09:00, Pulje 2 møter 10:00'] },
    })
    const ov = overlay(3, {
      action: 'enrich_existing_school_block',
      subjectUpdates: [{ subjectKey: 'norsk', sections: { ekstraBeskjed: ['Pulje 1 møter 09:00'] } }],
    })
    const child = makeChild({ 3: lessons([]) })
    const [thu] = build([day('3', NONE, [item])], child, ov)
    expect(thu.contentLines).toEqual(['Pulje 1 møter 09:00'])
    expect(thu.contentLines.join(' ')).not.toContain('Pulje 2')
  })

  it('overlay-fallback fjerner seksjonsoverskrift + subjectKey/slug (flat liste)', () => {
    const item = contentItem({ audienceScope: 'common', resolvedChildAudience: null, sections: { descriptionLines: ['alle klasser'] } })
    const ov = overlay(0, { action: 'enrich_existing_school_block', subjectUpdates: [{ subjectKey: 'norsk', customLabel: 'Norsk', sections: { lekse: ['Les s. 10'] } }] })
    const child = makeChild({ 0: lessons([]) })
    const [mon] = build([day('0', NONE, [item])], child, ov)
    expect(mon.contentLines).toEqual(['Les s. 10'])
    expect(mon.contentLines.join(' ')).not.toContain('Lekse') // ingen seksjonsoverskrift
    expect(mon.contentLines.join(' ')).not.toContain('norsk') // ingen subjectKey/slug
  })
})

describe('tekstkilde C: schoolBlock common når verken løst audience eller overlay', () => {
  it('viser common-teksten én gang (kaster ikke informasjon)', () => {
    const item = contentItem({ audienceScope: 'common', resolvedChildAudience: null, sourceText: 'Fellesbeskjed til trinnet' })
    const child = makeChild({ 0: lessons([]) })
    const [mon] = build([day('0', NONE, [item])], child)
    expect(mon.contentLines).toEqual(['Fellesbeskjed til trinnet'])
  })

  it('ingen brukbar overlay (remove/none) → faller til common schoolBlock', () => {
    const item = contentItem({ audienceScope: 'common', resolvedChildAudience: null, sourceText: 'Common tekst' })
    const ov = overlay(0, { action: 'remove_school_block', subjectUpdates: [] })
    const child = makeChild({ 0: lessons([]) })
    const [mon] = build([day('0', NONE, [item])], child, ov)
    expect(mon.contentLines).toEqual(['Common tekst'])
  })
})

describe('overlay overstyrer aldri dagsoperasjonen', () => {
  it('adjust_start: overlay leverer tekst, men tidlige lessons skjules likevel', () => {
    const op: SchoolBlockDayOperation = { op: 'adjust_start', effectiveStart: '10:30', reason: null, confidence: 0.9 }
    const item = contentItem({ audienceScope: 'common', resolvedChildAudience: null, sourceText: 'alle klasser' })
    const ov = overlay(2, { action: 'enrich_existing_school_block', subjectUpdates: [{ subjectKey: 'norsk', sections: { ekstraBeskjed: ['Oppmøte gjelder 2STC'] } }] })
    const child = makeChild({ 2: wedLessons })
    const [wed] = build([day('2', op, [item])], child, ov)
    // Operasjon fra schoolBlock: tidlige timer skjult.
    expect(wed.lessons.map((l) => `${l.start}-${l.end}`)).toEqual(['10:35-11:35', '12:00-13:00'])
    // Tekst fra overlay-fallback.
    expect(wed.contentLines).toEqual(['Oppmøte gjelder 2STC'])
  })

  it('replace_day: overlay leverer tekst, men alle lessons skjules og erstatningsblokk vises', () => {
    const op: SchoolBlockDayOperation = { op: 'replace_day', activityKind: 'other', effectiveStart: '09:00', effectiveEnd: '12:00', reason: 'Opplegg', confidence: 0.9 }
    const item = contentItem({ audienceScope: 'common', resolvedChildAudience: null, sourceText: 'alle klasser' })
    const ov = overlay(4, { action: 'replace_school_block', subjectUpdates: [{ subjectKey: 'norsk', sections: { ekstraBeskjed: ['2STC møter 09:00'] } }] })
    const child = makeChild({ 4: lessons([{ subjectKey: 'kunst', start: '08:15', end: '09:15' }]) })
    const [fri] = build([day('4', op, [item])], child, ov)
    expect(fri.lessons).toEqual([])
    expect(fri.replacement).toEqual({ title: 'Opplegg', start: '09:00', end: '12:00' })
    expect(fri.contentLines).toEqual(['2STC møter 09:00'])
  })
})

describe('content item-rendering (schoolBlock)', () => {
  it('prioriterer strukturerte sections over sourceText/title (uten løst audience)', () => {
    const item = contentItem({ sections: { iTimen: ['Kap. 4'] }, sourceText: 'rå tekst', title: 'Tittel' })
    const child = makeChild({ 0: lessons([]) })
    const [mon] = build([day('0', NONE, [item])], child)
    expect(mon.contentLines).toEqual(['Kap. 4'])
  })

  it('viser ingen slug / subjectKey', () => {
    const item = contentItem({ subjectKey: '2stc-10-30-11-00', title: '2STC 10.30–11.00', sourceText: null })
    const child = makeChild({ 0: lessons([]) })
    const [mon] = build([day('0', NONE, [item])], child)
    expect(mon.contentLines).toEqual(['2STC 10.30–11.00'])
    expect(mon.contentLines.join(' ')).not.toContain('2stc-10-30-11-00')
    expect(mon.contentLines.join(' ')).not.toContain('(')
  })
})

describe('deduplisering', () => {
  it('dedupliserer identisk normalisert tekst innen samme dag', () => {
    const child = makeChild({ 0: lessons([]) })
    const days = build(
      [
        day('0', NONE, [
          contentItem({ itemId: 'a', sourceText: 'Bokinnlevering' }),
          contentItem({ itemId: 'b', sourceText: '  bokinnlevering  ' }),
        ]),
      ],
      child
    )
    expect(days[0]!.contentLines).toEqual(['Bokinnlevering'])
  })

  it('beholder samme tekst på forskjellige dager', () => {
    const child = makeChild({ 0: lessons([]), 1: lessons([]) })
    const days = build(
      [
        day('0', NONE, [contentItem({ itemId: 'a', sourceText: 'Prøve' })]),
        day('1', NONE, [contentItem({ itemId: 'b', sourceText: 'Prøve' })]),
      ],
      child
    )
    expect(days[0]!.contentLines).toEqual(['Prøve'])
    expect(days[1]!.contentLines).toEqual(['Prøve'])
  })
})

describe('dager, sortering og immutabilitet', () => {
  it('tar kun med gyldige ukedager, sortert mandag→fredag', () => {
    const child = makeChild({ 0: lessons([]), 4: lessons([]) })
    const days = build([day('4', NONE), day(null, NONE), day('0', NONE)], child)
    expect(days.map((d) => d.weekday)).toEqual([0, 4])
    expect(days.map((d) => d.dayLabel)).toEqual(['Mandag', 'Fredag'])
  })

  it('muterer ikke input-proposalet', () => {
    const child = makeChild({ 2: wedLessons })
    const p = proposal([day('2', { op: 'adjust_start', effectiveStart: '10:30', reason: null, confidence: 0.9 })])
    const snapshot = JSON.parse(JSON.stringify(p))
    buildSchoolBlockPreviewDays({ proposal: p, child })
    expect(p).toEqual(snapshot)
  })
})
