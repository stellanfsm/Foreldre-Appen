import { describe, expect, it } from 'vitest'
import type { SchoolLessonSlot, SchoolWeekOverlaySubjectUpdate } from '../../types'
import {
  applyClientOrphanFallbackToSubjectUpdates,
  tryClientOrphanLineToLessonIndex,
} from '../schoolWeekOverlayEnrichRouting'

const BAND = '8-10' as const

function lessonsWed(): SchoolLessonSlot[] {
  return [
    { subjectKey: 'naturfag', start: '08:15', end: '09:00' },
    { subjectKey: 'norsk', start: '09:05', end: '09:50' },
    { subjectKey: 'samfunnsfag', start: '09:55', end: '10:40' },
    { subjectKey: 'tysk', start: '10:45', end: '11:30' },
  ]
}

describe('tryClientOrphanLineToLessonIndex', () => {
  const L = lessonsWed()

  it('sender mars-bad og badetøy til samfunnsfag når det er nøyaktig én samfunns-time', () => {
    expect(tryClientOrphanLineToLessonIndex('I timen: mars-bad!', BAND, L)?.idx).toBe(2)
    expect(tryClientOrphanLineToLessonIndex('Husk: badetøy, håndkle og mat.', BAND, L)?.idx).toBe(2)
    expect(tryClientOrphanLineToLessonIndex('Vi skal være tilbake til språktimen 12.25', BAND, L)?.idx).toBe(2)
  })

  it('sender tyskprøve-linjer til tysk når det er nøyaktig én tysk-time', () => {
    expect(tryClientOrphanLineToLessonIndex('Skriftlig tyskprøve.', BAND, L)?.idx).toBe(3)
    expect(tryClientOrphanLineToLessonIndex('Ha med blyant og viskelær til tyskprøven', BAND, L)?.idx).toBe(3)
  })

  it('returnerer null når signalet mangler', () => {
    expect(tryClientOrphanLineToLessonIndex('Generell beskjed uten fag', BAND, L)).toBeNull()
  })

  it('treffer én «naken» fremmedspråk-time ved sterkt tysk-signal', () => {
    const lessons: SchoolLessonSlot[] = [
      { subjectKey: 'naturfag', start: '08:15', end: '09:00' },
      { subjectKey: 'fremmedspråk', start: '10:45', end: '11:30' },
    ]
    expect(tryClientOrphanLineToLessonIndex('Ha med blyant og viskelær til tyskprøven', BAND, lessons)?.idx).toBe(1)
  })

  it('bruker ikke naken fremmedspråk-time uten sterkt tysk-signal', () => {
    const lessons: SchoolLessonSlot[] = [
      { subjectKey: 'naturfag', start: '08:15', end: '09:00' },
      { subjectKey: 'fremmedspråk', start: '10:45', end: '11:30' },
    ]
    expect(tryClientOrphanLineToLessonIndex('Ha med blyant og viskelær', BAND, lessons)).toBeNull()
  })
})

describe('applyClientOrphanFallbackToSubjectUpdates', () => {
  it('flytter fra other til samf og tysk', () => {
    const lessons = lessonsWed()
    const updates: SchoolWeekOverlaySubjectUpdate[] = [
      { subjectKey: 'samfunnsfag', sections: { iTimen: ['Kort merknad'] } },
      {
        subjectKey: 'other',
        sections: {
          iTimen: ['I timen: mars-bad!', 'Skriftlig tyskprøve.'],
          huskTaMed: ['Ha med blyant til tyskprøven'],
        },
      },
    ]
    const out = applyClientOrphanFallbackToSubjectUpdates(BAND, lessons, updates)
    const other = out.find((u) => u.subjectKey === 'other')
    expect(other).toBeUndefined()
    const samf = out.find((u) => u.subjectKey === 'samfunnsfag')
    const tysk = out.find((u) => u.subjectKey === 'tysk')
    expect(samf?.sections?.iTimen?.some((l) => l.includes('mars-bad'))).toBe(true)
    expect(tysk?.sections?.iTimen?.some((l) => l.includes('tyskprøve'))).toBe(true)
    expect(tysk?.sections?.huskTaMed?.some((l) => l.includes('blyant'))).toBe(true)
  })

  it('dropper admintekst fra other', () => {
    const lessons = lessonsWed()
    const updates: SchoolWeekOverlaySubjectUpdate[] = [
      {
        subjectKey: 'other',
        sections: { ekstraBeskjed: ['Fravær skal meldes til kontaktlærer.'] },
      },
    ]
    const out = applyClientOrphanFallbackToSubjectUpdates(BAND, lessons, updates)
    expect(out.some((u) => u.subjectKey === 'other')).toBe(false)
  })
})
