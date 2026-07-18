import { describe, expect, it } from 'vitest'
import type {
  SchoolWeekAdjustEndOverride,
  SchoolWeekAdjustStartOverride,
  SchoolWeekDayOverrideActivityKind,
  SchoolWeekOverlay,
  SchoolWeekReplaceDayOverride,
} from '../../types'
import {
  getSchoolWeekDayOverride,
  removeSchoolWeekDayOverride,
  upsertSchoolWeekDayOverride,
} from '../schoolWeekDayOverrides'

// ---- Små fixture-buildere ----

const baseMeta = {
  date: '2026-06-18',
  title: null,
  reason: null,
  confidence: 0.9,
  sourceProposalId: 'sb-1',
  sourceDayId: 'd-1',
  sourceTitle: 'Uke 25',
  originalSourceType: 'school_activity_plan',
  reviewStatus: 'ready' as const,
  reviewMessages: [] as string[],
}

const replaceDay = (over: Partial<SchoolWeekReplaceDayOverride> = {}): SchoolWeekReplaceDayOverride => ({
  ...baseMeta,
  operation: 'replace_day',
  activityKind: 'exam_day',
  effectiveStart: null,
  effectiveEnd: null,
  ...over,
})

const adjustStart = (over: Partial<SchoolWeekAdjustStartOverride> = {}): SchoolWeekAdjustStartOverride => ({
  ...baseMeta,
  operation: 'adjust_start',
  effectiveStart: '10:00',
  ...over,
})

const adjustEnd = (over: Partial<SchoolWeekAdjustEndOverride> = {}): SchoolWeekAdjustEndOverride => ({
  ...baseMeta,
  operation: 'adjust_end',
  effectiveEnd: '12:00',
  ...over,
})

/** Overlay med dailyActions (som skal bevares uendret) + valgfrie dayOverrides. */
const makeOverlay = (dayOverrides?: SchoolWeekOverlay['dayOverrides']): SchoolWeekOverlay => ({
  id: 'ov-1',
  weekYear: 2026,
  weekNumber: 25,
  dailyActions: {
    0: { action: 'enrich_existing_school_block', subjectUpdates: [{ subjectKey: 'matematikk' }] },
  },
  ...(dayOverrides ? { dayOverrides } : {}),
})

// ---------------------------------------------------------------------------

describe('SchoolWeekDayOverride — bakoverkompatibilitet', () => {
  it('overlay uten dayOverrides fungerer uendret; dailyActions bevart', () => {
    const overlay = makeOverlay()
    expect('dayOverrides' in overlay).toBe(false) // ingen unødvendig tomt felt
    expect(getSchoolWeekDayOverride(overlay, 3)).toBeUndefined()
    expect(overlay.dailyActions[0]).toBeTruthy()
  })

  it('upsert på tom overlay introduserer dayOverrides KUN for den dagen, bevarer dailyActions', () => {
    const overlay = makeOverlay()
    const next = upsertSchoolWeekDayOverride(overlay, 3, replaceDay())
    expect(next.dayOverrides).toEqual({ 3: replaceDay() })
    expect(next.dailyActions).toBe(overlay.dailyActions) // dailyActions urørt (samme referanse)
    expect('dayOverrides' in overlay).toBe(false) // input uendret
  })
})

describe('SchoolWeekDayOverride — replace_day', () => {
  it('free_day lagres med title/date/null start-slutt/source/confidence/review', () => {
    const fri: SchoolWeekReplaceDayOverride = replaceDay({
      activityKind: 'free_day',
      title: 'Påskefri',
      date: '2026-04-02',
      effectiveStart: null,
      effectiveEnd: null,
      confidence: 0.95,
      reviewStatus: 'ready',
    })
    const ov = upsertSchoolWeekDayOverride(makeOverlay(), 3, fri)
    const got = getSchoolWeekDayOverride(ov, 3) as SchoolWeekReplaceDayOverride
    expect(got.operation).toBe('replace_day')
    expect(got.activityKind).toBe('free_day')
    expect(got.title).toBe('Påskefri')
    expect(got.effectiveStart).toBeNull()
    expect(got.effectiveEnd).toBeNull()
    expect(got.sourceProposalId).toBe('sb-1')
    expect(got.confidence).toBe(0.95)
  })

  it('heldagsprøve lagres med eksplisitt start og slutt', () => {
    const prove = replaceDay({ activityKind: 'exam_day', effectiveStart: '09:00', effectiveEnd: '13:00' })
    const got = getSchoolWeekDayOverride(upsertSchoolWeekDayOverride(makeOverlay(), 3, prove), 3) as SchoolWeekReplaceDayOverride
    expect(got.effectiveStart).toBe('09:00')
    expect(got.effectiveEnd).toBe('13:00')
  })

  it('alle activityKind godtas', () => {
    const kinds: SchoolWeekDayOverrideActivityKind[] = ['exam_day', 'trip_day', 'activity_day', 'free_day', 'other']
    for (const activityKind of kinds) {
      const got = getSchoolWeekDayOverride(upsertSchoolWeekDayOverride(makeOverlay(), 2, replaceDay({ activityKind })), 2) as SchoolWeekReplaceDayOverride
      expect(got.activityKind).toBe(activityKind)
    }
  })

  it('replace_day for mandag erstatter KUN mandagens entry — andre dager urørt', () => {
    const withTue = upsertSchoolWeekDayOverride(makeOverlay(), 1, adjustStart())
    const next = upsertSchoolWeekDayOverride(withTue, 0, replaceDay({ title: 'Mandagsprøve' }))
    expect((getSchoolWeekDayOverride(next, 0) as SchoolWeekReplaceDayOverride).title).toBe('Mandagsprøve')
    expect(getSchoolWeekDayOverride(next, 1)).toEqual(adjustStart()) // tirsdag uendret
  })
})

describe('SchoolWeekDayOverride — adjust_start / adjust_end', () => {
  it('adjust_start krever eksplisitt effectiveStart; ingen konstruert slutt', () => {
    const got = getSchoolWeekDayOverride(upsertSchoolWeekDayOverride(makeOverlay(), 4, adjustStart({ effectiveStart: '10:30' })), 4) as SchoolWeekAdjustStartOverride
    expect(got.operation).toBe('adjust_start')
    expect(got.effectiveStart).toBe('10:30')
    expect('effectiveEnd' in got).toBe(false) // ingen konstruert slutt
  })

  it('adjust_end krever eksplisitt effectiveEnd; ingen konstruert start', () => {
    const got = getSchoolWeekDayOverride(upsertSchoolWeekDayOverride(makeOverlay(), 4, adjustEnd({ effectiveEnd: '11:45' })), 4) as SchoolWeekAdjustEndOverride
    expect(got.operation).toBe('adjust_end')
    expect(got.effectiveEnd).toBe('11:45')
    expect('effectiveStart' in got).toBe(false) // ingen konstruert start
  })

  it('overstyring bevarer ordinære overlay-data (dailyActions + uke-id)', () => {
    const ov = upsertSchoolWeekDayOverride(makeOverlay(), 2, adjustStart())
    expect(ov.dailyActions[0]).toBeTruthy()
    expect(ov.weekYear).toBe(2026)
    expect(ov.weekNumber).toBe(25)
  })
})

describe('SchoolWeekDayOverride — immutable helpers', () => {
  it('upsert muterer ikke originalobjektet', () => {
    const overlay = makeOverlay({ 1: adjustStart() })
    const snapshot = JSON.parse(JSON.stringify(overlay))
    upsertSchoolWeekDayOverride(overlay, 0, replaceDay())
    expect(overlay).toEqual(snapshot) // input uendret
  })

  it('upsert bevarer andre ukedager', () => {
    const overlay = makeOverlay({ 1: adjustStart(), 2: adjustEnd() })
    const next = upsertSchoolWeekDayOverride(overlay, 0, replaceDay())
    expect(Object.keys(next.dayOverrides!).sort()).toEqual(['0', '1', '2'])
  })

  it('upsert på dag som ALLEREDE har override ERSTATTER den — gammel er borte, andre dager + original uendret', () => {
    // Mandag(0)=adjust_start, tirsdag(1)=adjust_end.
    const overlay = makeOverlay({ 0: adjustStart(), 1: adjustEnd() })
    const snapshot = JSON.parse(JSON.stringify(overlay))
    const fri = replaceDay({ operation: 'replace_day', activityKind: 'free_day', title: 'Fridag' })
    const next = upsertSchoolWeekDayOverride(overlay, 0, fri)
    // Mandag er nå replace_day/free_day:
    const mon = getSchoolWeekDayOverride(next, 0) as SchoolWeekReplaceDayOverride
    expect(mon.operation).toBe('replace_day')
    expect(mon.activityKind).toBe('free_day')
    // Gammel adjust_start for mandag er BORTE (ikke beholdt/flettet):
    expect('effectiveStart' in mon && mon.operation !== 'replace_day').toBe(false)
    expect(mon).toEqual(fri)
    // Tirsdag uendret; originalen uendret:
    expect(getSchoolWeekDayOverride(next, 1)).toEqual(adjustEnd())
    expect(overlay).toEqual(snapshot)
  })

  it('remove fjerner bare valgt dag, bevarer resten', () => {
    const overlay = makeOverlay({ 0: replaceDay(), 1: adjustStart(), 2: adjustEnd() })
    const next = removeSchoolWeekDayOverride(overlay, 1)
    expect(Object.keys(next.dayOverrides!).sort()).toEqual(['0', '2'])
    expect(getSchoolWeekDayOverride(next, 1)).toBeUndefined()
  })

  it('remove av SISTE entry utelater dayOverrides HELT (undefined, ikke {})', () => {
    const overlay = makeOverlay({ 3: replaceDay() })
    const next = removeSchoolWeekDayOverride(overlay, 3)
    expect('dayOverrides' in next).toBe(false)
    expect(next.dayOverrides).toBeUndefined()
    expect(next.dailyActions[0]).toBeTruthy() // resten bevart
  })

  it('remove muterer ikke originalobjektet', () => {
    const overlay = makeOverlay({ 0: replaceDay(), 1: adjustStart() })
    const snapshot = JSON.parse(JSON.stringify(overlay))
    removeSchoolWeekDayOverride(overlay, 0)
    expect(overlay).toEqual(snapshot)
  })

  it('remove på ukedag uten entry er en no-op (returnerer uendret)', () => {
    const overlay = makeOverlay({ 0: replaceDay() })
    expect(removeSchoolWeekDayOverride(overlay, 4)).toEqual(overlay)
  })

  it('get returnerer riktig dag og påvirker ikke state', () => {
    const overlay = makeOverlay({ 2: adjustEnd() })
    expect(getSchoolWeekDayOverride(overlay, 2)).toEqual(adjustEnd())
    expect(getSchoolWeekDayOverride(overlay, 0)).toBeUndefined()
    expect(Object.keys(overlay.dayOverrides!)).toEqual(['2']) // uendret
  })
})
