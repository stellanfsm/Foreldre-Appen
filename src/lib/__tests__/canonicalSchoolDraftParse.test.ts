import { describe, expect, it } from 'vitest'
import { parsePortalImportProposalBundle } from '../tankestromApi'

// Minimal gyldig overlay tilfredsstiller bundle-guarden (items ELLER overlay må finnes).
const overlay = () => ({
  proposalId: 'ov-1',
  kind: 'school_week_overlay',
  schemaVersion: '1.0.0',
  confidence: 0.9,
  originalSourceType: 'school_activity_plan',
  weeklySummary: [],
  dailyActions: {},
})

const provenance = {
  sourceSystem: 'tankestrom',
  sourceType: 'school_activity_plan',
  generatedAt: '2026-06-15T10:00:00Z',
  importRunId: 'run-1',
}

/** Bundle-wrapper med et canonical draft (eller vilkårlig verdi) på toppnivå. */
function bundleWith(canonical: unknown) {
  return {
    schemaVersion: '1.0.0',
    provenance,
    schoolWeekOverlayProposal: overlay(),
    canonicalSchoolContentDraft: canonical,
  }
}

const canonItem = (over: Record<string, unknown> = {}) => ({
  sourceId: 's-1',
  itemId: 'it-1',
  sourceRef: null,
  placement: 'subject',
  contentType: 'lesson',
  action: 'enrich',
  subject: 'Matematikk',
  subjectKey: 'matematikk',
  customLabel: null,
  start: '10:35',
  end: '11:35',
  audienceEntries: [],
  sections: {},
  sourceText: 'Forberedelsesdag',
  evidence: null,
  confidence: 0.9,
  reviewFlags: [],
  ...over,
})

const canonDay = (over: Record<string, unknown> = {}) => ({
  dayId: 'd-1',
  date: null,
  weekdayIndex: '1',
  dayLabel: null,
  dayOperation: { op: 'none' },
  dayResolution: 'enrich_only',
  subjectItems: [canonItem()],
  audienceItems: [],
  generalDayMessages: [],
  confidence: 0.9,
  evidence: null,
  reviewFlags: [],
  ...over,
})

const draft = (over: Record<string, unknown> = {}) => ({
  schemaVersion: '1.0.0',
  sourceTitle: 'Ukeplan uke 25',
  originalSourceType: 'school_activity_plan',
  personId: 'stellan',
  personMatchStatus: 'matched',
  classCode: '2STC',
  days: [canonDay()],
  structureStatus: 'complete',
  reviewFlags: [],
  ...over,
})

describe('canonicalSchoolContentDraft — tolerant parsing', () => {
  it('parses et gyldig draft og eksponeres på bundelen', () => {
    const b = parsePortalImportProposalBundle(bundleWith(draft()))
    expect(b.canonicalSchoolContentDraft).toBeTruthy()
    const c = b.canonicalSchoolContentDraft!
    expect(c.days).toHaveLength(1)
    expect(c.days[0]!.subjectItems[0]!.subjectKey).toBe('matematikk')
    expect(c.personMatchStatus).toBe('matched')
  })

  it('A. canonical-only bundle (uten items/overlay/schoolBlock) er gyldig', () => {
    const b = parsePortalImportProposalBundle({
      schemaVersion: '1.0.0',
      provenance,
      canonicalSchoolContentDraft: draft(),
    })
    expect(b.canonicalSchoolContentDraft).toBeTruthy()
    expect(b.items).toHaveLength(0)
    expect(b.schoolWeekOverlayProposal).toBeUndefined()
  })

  it('canonical-only med UGYLDIG draft (ingen dager) → kaster (ingen kunstig gyldig bundle)', () => {
    expect(() =>
      parsePortalImportProposalBundle({ schemaVersion: '1.0.0', provenance, canonicalSchoolContentDraft: draft({ days: [] }) })
    ).toThrow()
  })

  it('fallback: fravær → undefined (schoolBlock/overlay uendret)', () => {
    const b = parsePortalImportProposalBundle({ schemaVersion: '1.0.0', provenance, schoolWeekOverlayProposal: overlay() })
    expect(b.canonicalSchoolContentDraft).toBeUndefined()
    expect(b.schoolWeekOverlayProposal).toBeTruthy()
  })

  it('fallback: ukjent schemaVersion → undefined', () => {
    const b = parsePortalImportProposalBundle(bundleWith(draft({ schemaVersion: '2.0.0' })))
    expect(b.canonicalSchoolContentDraft).toBeUndefined()
  })

  it('fallback: ingen dager → undefined', () => {
    const b = parsePortalImportProposalBundle(bundleWith(draft({ days: [] })))
    expect(b.canonicalSchoolContentDraft).toBeUndefined()
  })

  it('fallback: days ikke en liste → undefined', () => {
    const b = parsePortalImportProposalBundle(bundleWith(draft({ days: 'nope' })))
    expect(b.canonicalSchoolContentDraft).toBeUndefined()
  })

  it('tolererer ukjente additive felt (ignoreres), beholder gyldig draft', () => {
    const b = parsePortalImportProposalBundle(bundleWith(draft({ futureField: { x: 1 }, days: [canonDay({ newDayField: true })] })))
    expect(b.canonicalSchoolContentDraft).toBeTruthy()
    expect(b.canonicalSchoolContentDraft!.days).toHaveLength(1)
  })

  it('dropper ugyldige enkelt-items men beholder resten av dagen', () => {
    const b = parsePortalImportProposalBundle(
      bundleWith(draft({ days: [canonDay({ subjectItems: [canonItem(), 'ugyldig', 42] })] }))
    )
    const items = b.canonicalSchoolContentDraft!.days[0]!.subjectItems
    expect(items).toHaveLength(1)
    expect(items[0]!.itemId).toBe('it-1')
  })

  it('degraderer ugyldig dayOperation til {op:none} (ikke kast)', () => {
    const b = parsePortalImportProposalBundle(bundleWith(draft({ days: [canonDay({ dayOperation: { op: 'tull' } })] })))
    expect(b.canonicalSchoolContentDraft!.days[0]!.dayOperation.op).toBe('none')
  })

  it('degraderer ugyldig contentType til message, ugyldig placement til fallback', () => {
    const b = parsePortalImportProposalBundle(
      bundleWith(draft({ days: [canonDay({ subjectItems: [canonItem({ contentType: 'xxx', placement: 'yyy' })] })] }))
    )
    const item = b.canonicalSchoolContentDraft!.days[0]!.subjectItems[0]!
    expect(item.contentType).toBe('message')
    expect(item.placement).toBe('subject') // fallback = arrayens plassering
  })

  it('gir stabil itemId når feltet mangler (ingen kast)', () => {
    const raw = canonItem()
    delete (raw as Record<string, unknown>).itemId
    const b = parsePortalImportProposalBundle(bundleWith(draft({ days: [canonDay({ subjectItems: [raw] })] })))
    expect(b.canonicalSchoolContentDraft!.days[0]!.subjectItems[0]!.itemId).toBe('canon-item-subject-0')
  })
})
