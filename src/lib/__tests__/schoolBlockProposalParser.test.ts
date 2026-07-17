import { describe, expect, it } from 'vitest'
import { parsePortalImportProposalBundle } from '../tankestromApi'

// ---- Små fixture-buildere (unngår store gjentatte objekter) ----

const provenance = {
  sourceSystem: 'tankestrom',
  sourceType: 'school_activity_plan',
  generatedAt: '2026-06-15T10:00:00Z',
  importRunId: 'run-1',
}

/** Minimal gyldig overlay — brukes for å tilfredsstille bundle-guarden OG teste sameksistens/fallback. */
const overlay = () => ({
  proposalId: 'ov-1',
  kind: 'school_week_overlay',
  schemaVersion: '1.0.0',
  confidence: 0.9,
  originalSourceType: 'school_activity_plan',
  weeklySummary: [],
  dailyActions: {},
})

const audienceEntry = (over: Record<string, unknown> = {}) => ({
  audienceEntryId: 'ae-1',
  classCodes: ['2STA', '2STC', '2STE'],
  pulje: 'Pulje 1',
  start: '10:00',
  end: '11:00',
  room: '332-50',
  teacher: 'Lærer X',
  isChildAudience: true,
  ...over,
})

const contentItem = (over: Record<string, unknown> = {}) => ({
  itemId: 'it-1',
  title: 'Rådgiveropplegg',
  contentType: 'message',
  action: 'enrich',
  subject: null,
  subjectKey: null,
  customLabel: null,
  audienceScope: 'per_audience',
  commonSchedule: null,
  audienceEntries: [audienceEntry()],
  resolvedChildAudience: {
    audienceEntryId: 'ae-1',
    start: '10:00',
    end: '11:00',
    room: '332-50',
    teacher: 'Lærer X',
  },
  sections: { descriptionLines: ['Møt i auditoriet'] },
  activityKind: null,
  evidence: null,
  sourceText: null,
  confidence: 0.8,
  reviewFlags: [],
  ...over,
})

const day = (over: Record<string, unknown> = {}) => ({
  dayId: 'd-1',
  date: '2026-06-18',
  weekdayIndex: '3',
  dayLabel: 'Torsdag',
  blockTitle: null,
  dayOperation: { op: 'none' },
  dayResolution: 'enrich_only',
  contentItems: [contentItem()],
  confidence: 0.85,
  evidence: null,
  reviewFlags: [],
  ...over,
})

const schoolBlock = (over: Record<string, unknown> = {}) => ({
  proposalId: '11111111-2222-4333-8444-555566667777',
  kind: 'school_block',
  schemaVersion: '1.0.0',
  sourceTitle: 'Uke 25 – 2ST',
  originalSourceType: 'school_activity_plan',
  confidence: 0.9,
  personId: 'child-1',
  personMatchStatus: 'matched',
  classCode: '2STC',
  weekNumber: 25,
  days: [day()],
  structureStatus: 'complete',
  reviewFlags: [],
  ...over,
})

/** Full bundle med provenance + overlay + (evt.) schoolBlockProposal. */
const bundle = (over: Record<string, unknown> = {}) => ({
  schemaVersion: '1.0.0',
  provenance,
  items: [],
  schoolWeekOverlayProposal: overlay(),
  schoolBlockProposal: schoolBlock(),
  ...over,
})

const parseSB = (over: Record<string, unknown> = {}) =>
  parsePortalImportProposalBundle(bundle(over)).schoolBlockProposal

// ---------------------------------------------------------------------------

describe('schoolBlockProposal — gyldig proposal beholdes', () => {
  it('full gyldig proposal parses og legges på bundelen', () => {
    const b = parsePortalImportProposalBundle(bundle())
    expect(b.schoolBlockProposal).toBeDefined()
    expect(b.schoolBlockProposal!.kind).toBe('school_block')
    expect(b.schoolBlockProposal!.classCode).toBe('2STC')
    expect(b.schoolBlockProposal!.days).toHaveLength(1)
    // Overlay beholdes samtidig:
    expect(b.schoolWeekOverlayProposal).toBeDefined()
  })

  it('personId:null og classCode:null godtas', () => {
    const sb = parseSB({ schoolBlockProposal: schoolBlock({ personId: null, classCode: null }) })
    expect(sb!.personId).toBeNull()
    expect(sb!.classCode).toBeNull()
  })

  it('weekNumber kan mangle eller være null', () => {
    const { weekNumber: _drop, ...noWeek } = schoolBlock() as Record<string, unknown>
    expect(parseSB({ schoolBlockProposal: noWeek })!.weekNumber).toBeUndefined()
    expect(parseSB({ schoolBlockProposal: schoolBlock({ weekNumber: null }) })!.weekNumber).toBeNull()
  })

  it('days:[] godtas', () => {
    expect(parseSB({ schoolBlockProposal: schoolBlock({ days: [] }) })!.days).toEqual([])
  })

  it('weekdayIndex 0–4 og null godtas', () => {
    for (const wd of ['0', '1', '2', '3', '4', null]) {
      const sb = parseSB({ schoolBlockProposal: schoolBlock({ days: [day({ weekdayIndex: wd })] }) })
      expect(sb!.days[0]!.weekdayIndex).toBe(wd)
    }
  })

  it('isChildAudience godtar true | false | null', () => {
    for (const v of [true, false, null]) {
      const sb = parseSB({
        schoolBlockProposal: schoolBlock({
          days: [day({ contentItems: [contentItem({ audienceEntries: [audienceEntry({ isChildAudience: v })] })] })],
        }),
      })
      expect(sb!.days[0]!.contentItems[0]!.audienceEntries[0]!.isChildAudience).toBe(v)
    }
  })

  it('resolvedChildAudience godtas UTEN classCodes/pulje/isChildAudience', () => {
    const rca = { audienceEntryId: null, start: null, end: null, room: null, teacher: null }
    const sb = parseSB({
      schoolBlockProposal: schoolBlock({ days: [day({ contentItems: [contentItem({ resolvedChildAudience: rca })] })] }),
    })
    const parsed = sb!.days[0]!.contentItems[0]!.resolvedChildAudience!
    expect(parsed.audienceEntryId).toBeNull()
    expect('classCodes' in parsed).toBe(false)
    expect('isChildAudience' in parsed).toBe(false)
  })

  it('reviewFlags parses som objekter (ikke string[])', () => {
    const flag = { code: 'low_confidence', message: 'Usikker', scope: { dayId: 'd-1' } }
    const sb = parseSB({ schoolBlockProposal: schoolBlock({ reviewFlags: [flag] }) })
    expect(sb!.reviewFlags[0]).toEqual(flag)
  })

  it('alle dayOperation-varianter parses (none/replace_day/adjust_start/adjust_end)', () => {
    const ops = [
      { op: 'none' },
      { op: 'replace_day', activityKind: 'exam_day', effectiveStart: '09:00', effectiveEnd: '13:00', reason: 'Eksamen', confidence: 0.9 },
      { op: 'adjust_start', effectiveStart: '10:00', reason: null, confidence: 0.7 },
      { op: 'adjust_end', effectiveEnd: '12:00', reason: null, confidence: 0.7 },
    ]
    for (const dayOperation of ops) {
      const sb = parseSB({ schoolBlockProposal: schoolBlock({ days: [day({ dayOperation })] }) })
      expect(sb!.days[0]!.dayOperation).toEqual(dayOperation)
    }
  })
})

describe('schoolBlockProposal — fraværende felt', () => {
  it('gammel bundle uten feltet: schoolBlockProposal er undefined, resten uendret', () => {
    const { schoolBlockProposal: _drop, ...noSB } = bundle() as Record<string, unknown>
    const b = parsePortalImportProposalBundle(noSB)
    expect(b.schoolBlockProposal).toBeUndefined()
    expect(b.schoolWeekOverlayProposal).toBeDefined()
  })

  it('schoolBlockProposal: null → undefined', () => {
    expect(parseSB({ schoolBlockProposal: null })).toBeUndefined()
  })
})

describe('schoolBlockProposal — atomisk forkasting + overlay-fallback', () => {
  // For hver ugyldig variant: schoolBlockProposal undefined, overlay + resten beholdt.
  const invalid: Array<[string, Record<string, unknown>]> = [
    ['feil kind', schoolBlock({ kind: 'not_school_block' })],
    ['feil schemaVersion', schoolBlock({ schemaVersion: '2.0.0' })],
    ['manglende obligatorisk felt (sourceTitle)', (() => { const s = schoolBlock() as Record<string, unknown>; delete s.sourceTitle; return s })()],
    ['ukjent structureStatus', schoolBlock({ structureStatus: 'weird' })],
    ['ukjent contentType', schoolBlock({ days: [day({ contentItems: [contentItem({ contentType: 'nope' })] })] })],
    ['ukjent action', schoolBlock({ days: [day({ contentItems: [contentItem({ action: 'delete_all' })] })] })],
    ['ukjent audienceScope', schoolBlock({ days: [day({ contentItems: [contentItem({ audienceScope: 'everyone' })] })] })],
    ['ukjent review-code', schoolBlock({ reviewFlags: [{ code: 'nope', message: 'x', scope: {} }] })],
    ['weekdayIndex 0 som number', schoolBlock({ days: [day({ weekdayIndex: 0 })] })],
    ["weekdayIndex '5'", schoolBlock({ days: [day({ weekdayIndex: '5' })] })],
    ['ugyldig dato', schoolBlock({ days: [day({ date: '18-06-2026' })] })],
    ['classCode i stedet for classCodes', schoolBlock({ days: [day({ contentItems: [contentItem({ audienceEntries: [{ ...audienceEntry(), classCodes: undefined, classCode: '2STC' }] })] })] })],
    ["isChildAudience: 'true' som string", schoolBlock({ days: [day({ contentItems: [contentItem({ audienceEntries: [audienceEntry({ isChildAudience: 'true' })] })] })] })],
    ['ugyldig nested content-item (mangler itemId)', schoolBlock({ days: [day({ contentItems: [(() => { const c = contentItem() as Record<string, unknown>; delete c.itemId; return c })()] })] })],
    ['ugyldig nested day (mangler dayId)', schoolBlock({ days: [(() => { const d = day() as Record<string, unknown>; delete d.dayId; return d })()] })],
    ['reviewFlags som string[]', schoolBlock({ reviewFlags: ['low_confidence'] })],
    ['replace_day uten activityKind', schoolBlock({ days: [day({ dayOperation: { op: 'replace_day', effectiveStart: null, effectiveEnd: null, reason: null, confidence: 0.5 } })] })],
    ['ukjent dayOperation.op', schoolBlock({ days: [day({ dayOperation: { op: 'teleport' } })] })],
  ]

  for (const [name, sb] of invalid) {
    it(`forkaster ATOMISK (${name}) → undefined, overlay + items beholdes`, () => {
      const b = parsePortalImportProposalBundle(bundle({ schoolBlockProposal: sb }))
      expect(b.schoolBlockProposal).toBeUndefined()
      expect(b.schoolWeekOverlayProposal).toBeDefined() // overlay-fallback intakt
      expect(b.schemaVersion).toBe('1.0.0')
      expect(b.provenance).toBeDefined()
    })
  }
})

describe('schoolBlockProposal — kontraktnøyaktighet', () => {
  it('audienceEntry beholder alle classCodes', () => {
    const sb = parseSB()
    expect(sb!.days[0]!.contentItems[0]!.audienceEntries[0]!.classCodes).toEqual(['2STA', '2STC', '2STE'])
  })

  it('resolvedChildAudience.audienceEntryId kan være null', () => {
    const sb = parseSB({
      schoolBlockProposal: schoolBlock({
        days: [day({ contentItems: [contentItem({ resolvedChildAudience: { audienceEntryId: null, start: null, end: null, room: null, teacher: null } })] })],
      }),
    })
    expect(sb!.days[0]!.contentItems[0]!.resolvedChildAudience!.audienceEntryId).toBeNull()
  })

  it('subjectCandidates er valgfritt (utelates når fraværende)', () => {
    expect(parseSB()!.days[0]!.contentItems[0]!.subjectCandidates).toBeUndefined()
    const withCand = parseSB({
      schoolBlockProposal: schoolBlock({
        days: [day({ contentItems: [contentItem({ subjectCandidates: [{ subjectKey: 'matematikk', subject: 'Matematikk', weight: 1 }] })] })],
      }),
    })
    expect(withCand!.days[0]!.contentItems[0]!.subjectCandidates).toHaveLength(1)
  })

  it('languageTrack er valgfritt', () => {
    expect(parseSB()!.languageTrack).toBeUndefined()
    const withLt = parseSB({ schoolBlockProposal: schoolBlock({ languageTrack: { resolvedTrack: 'Tysk', confidence: 0.9, reason: 'valgt' } }) })
    expect(withLt!.languageTrack!.resolvedTrack).toBe('Tysk')
  })

  it('ukjente toppnivåfelt påvirker ikke eksisterende parsing', () => {
    const b = parsePortalImportProposalBundle(bundle({ heltNyttFelt: { a: 1 }, annetUkjent: 'x' }))
    expect(b.schoolBlockProposal).toBeDefined()
    expect(b.schoolWeekOverlayProposal).toBeDefined()
    expect('heltNyttFelt' in b).toBe(false) // whitelist dropper ukjente
  })
})

describe('schoolBlockProposal — obligatoriske nullable-felt krever eksplisitt property', () => {
  const omit = (obj: Record<string, unknown>, key: string) => {
    const c = { ...obj }
    delete c[key]
    return c
  }
  // Full common-schedule / resolved-child-audience objekt for å teste manglende INDRE felt.
  const csFull = { start: '10:00', end: '11:00', room: 'A', teacher: 'T' }
  const rcaFull = { audienceEntryId: 'ae-1', start: '10:00', end: '11:00', room: 'A', teacher: 'T' }
  const ltFull = { resolvedTrack: 'Tysk', confidence: 0.9, reason: 'valgt' }
  // Plasser RÅ item/entry direkte (IKKE gjennom builderen — den ville re-lagt utelatte felt fra defaults).
  const blockWithItems = (items: unknown[]) => schoolBlock({ days: [day({ contentItems: items })] })
  const blockWithEntries = (entries: unknown[]) => blockWithItems([contentItem({ audienceEntries: entries })])

  // Hvert felt: MANGLENDE property → hele schoolBlockProposal forkastes atomisk.
  const missing: Array<[string, Record<string, unknown>]> = [
    ['personId', omit(schoolBlock(), 'personId')],
    ['classCode', omit(schoolBlock(), 'classCode')],
    ['day.date', schoolBlock({ days: [omit(day(), 'date')] })],
    ['day.weekdayIndex', schoolBlock({ days: [omit(day(), 'weekdayIndex')] })],
    ['day.dayLabel', schoolBlock({ days: [omit(day(), 'dayLabel')] })],
    ['day.blockTitle', schoolBlock({ days: [omit(day(), 'blockTitle')] })],
    ['contentItem.subject', blockWithItems([omit(contentItem(), 'subject')])],
    ['contentItem.commonSchedule', blockWithItems([omit(contentItem(), 'commonSchedule')])],
    ['contentItem.resolvedChildAudience', blockWithItems([omit(contentItem(), 'resolvedChildAudience')])],
    ['contentItem.activityKind', blockWithItems([omit(contentItem(), 'activityKind')])],
    ['audienceEntry.pulje', blockWithEntries([omit(audienceEntry(), 'pulje')])],
    ['audienceEntry.isChildAudience', blockWithEntries([omit(audienceEntry(), 'isChildAudience')])],
    ['commonSchedule.start (objekt finnes)', blockWithItems([contentItem({ commonSchedule: omit(csFull, 'start') })])],
    ['resolvedChildAudience.start (objekt finnes)', blockWithItems([contentItem({ resolvedChildAudience: omit(rcaFull, 'start') })])],
    ['languageTrack.resolvedTrack (objekt finnes)', schoolBlock({ languageTrack: omit(ltFull, 'resolvedTrack') })],
  ]

  for (const [name, sb] of missing) {
    it(`manglende ${name} → forkaster atomisk, overlay beholdes`, () => {
      const b = parsePortalImportProposalBundle(bundle({ schoolBlockProposal: sb }))
      expect(b.schoolBlockProposal).toBeUndefined()
      expect(b.schoolWeekOverlayProposal).toBeDefined()
      expect(b.provenance).toBeDefined()
    })
  }

  it('samme felt med eksplisitt null godtas (representativt utvalg)', () => {
    const sb = schoolBlock({
      personId: null,
      classCode: null,
      days: [
        day({
          date: null,
          weekdayIndex: null,
          dayLabel: null,
          blockTitle: null,
          contentItems: [
            contentItem({
              subject: null,
              commonSchedule: null,
              resolvedChildAudience: null,
              activityKind: null,
              audienceEntries: [audienceEntry({ pulje: null, isChildAudience: null })],
            }),
          ],
        }),
      ],
    })
    const parsed = parseSB({ schoolBlockProposal: sb })
    expect(parsed).toBeDefined()
    expect(parsed!.personId).toBeNull()
    expect(parsed!.days[0]!.contentItems[0]!.commonSchedule).toBeNull()
    expect(parsed!.days[0]!.contentItems[0]!.audienceEntries[0]!.isChildAudience).toBeNull()
  })

  it('slettet property OG eksplisitt undefined forkaster begge (toppnivå personId)', () => {
    expect(parseSB({ schoolBlockProposal: omit(schoolBlock(), 'personId') })).toBeUndefined()
    expect(parseSB({ schoolBlockProposal: schoolBlock({ personId: undefined }) })).toBeUndefined()
  })

  it('slettet property OG eksplisitt undefined forkaster begge (nested audienceEntry.pulje)', () => {
    expect(parseSB({ schoolBlockProposal: blockWithEntries([omit(audienceEntry(), 'pulje')]) })).toBeUndefined()
    expect(parseSB({ schoolBlockProposal: blockWithEntries([audienceEntry({ pulje: undefined })]) })).toBeUndefined()
  })
})
