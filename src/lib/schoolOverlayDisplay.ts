import type {
  ChildSchoolDayPlan,
  NorwegianGradeBand,
  SchoolLessonSlot,
  SchoolWeekOverlayDayAction,
} from '../types'
import { subjectLabelForKey } from '../data/norwegianSubjects'
import {
  overlaySubjectUpdatesUnmatchedByLessons,
  overlayUpdatesForLesson,
} from './schoolWeekOverlayLessonMatch'

/**
 * Delte, rene hjelpere for visning av uke-overlay under fag — brukes av BÅDE kalenderens
 * BackgroundDetailSheet og import-previewen (SchoolLessonOverlayRows), så visningen holdes
 * i synk. Ingen JSX, ingen edit/persist.
 */

export type OverlaySectionKey =
  | 'iTimen'
  | 'lekse'
  | 'huskTaMed'
  | 'proveVurdering'
  | 'ressurser'
  | 'ekstraBeskjed'

export const OVERLAY_SECTION_LABELS: Record<OverlaySectionKey, string> = {
  iTimen: 'I timen',
  lekse: 'Lekse',
  huskTaMed: 'Husk / ta med',
  proveVurdering: 'Prøve / vurdering',
  ressurser: 'Ressurser',
  ekstraBeskjed: 'Ekstra beskjed',
}

export const OVERLAY_SECTION_KEYS: OverlaySectionKey[] = [
  'iTimen',
  'lekse',
  'huskTaMed',
  'proveVurdering',
  'ressurser',
  'ekstraBeskjed',
]

/** Seksjoner (I timen / Lekse / …) med ikke-tomme linjer, i fast rekkefølge, for read-only-visning. */
export function sectionsForReadOnly(
  sections: Record<string, string[]> | undefined
): Array<{ key: OverlaySectionKey; lines: string[] }> {
  const out: Array<{ key: OverlaySectionKey; lines: string[] }> = []
  for (const key of OVERLAY_SECTION_KEYS) {
    const lines = (sections?.[key] ?? []).filter((line) => line.trim().length > 0)
    if (lines.length > 0) out.push({ key, lines })
  }
  return out
}

/** Én skole-time-rad (start/slutt/etikett) + valgfri lesson-referanse for overlay-matching. */
export type SchoolTimeRow = {
  start: string
  end: string
  label: string
  lesson?: SchoolLessonSlot
}

/**
 * Bygger skole-time-rader fra en dagsplan — uttrekk av kjernen i BackgroundDetailSheet.buildSchoolRows,
 * uavhengig av person/dateKey så previewen kan bruke den mot barnets lagrede timeplan (weekdays[wd]).
 * useSimpleDay / ingen lessons → én «Skole»-rad uten lesson (som kalenderen).
 */
export function buildSchoolRowsForPlan(
  gradeBand: NorwegianGradeBand,
  plan: ChildSchoolDayPlan | undefined
): SchoolTimeRow[] {
  if (!plan?.lessons?.length || plan.useSimpleDay) {
    return [{ start: plan?.schoolStart ?? '08:15', end: plan?.schoolEnd ?? '14:30', label: 'Skole' }]
  }
  const lessons = [...plan.lessons].sort((a, b) => a.start.localeCompare(b.start))
  return lessons.map((L) => ({
    start: L.start,
    end: L.end,
    label: subjectLabelForKey(gradeBand, L.subjectKey, L.customLabel, L.lessonSubcategory),
    lesson: L,
  }))
}

/**
 * Flate, synlige tekstlinjer fra en uke-overlay-dagshandling — NØYAKTIG de innholdslinjene
 * legacy-previewen (SchoolLessonOverlayRows) ville vist for barnet, men UTEN fag-header/subjectKey/
 * slug og UTEN seksjonsoverskrifter. Gjenbruker samme matchsemantikk (overlayUpdatesForLesson +
 * overlaySubjectUpdatesUnmatchedByLessons), så den nye schoolBlock-previewen og legacy-previewen
 * deler ÉN sannhet for hva som er barnerelevant. Deduplisert stabilt; muterer aldri input; ingen React.
 *
 * `isReplaceDay`: speiler legacy — ved erstatningsdag vises alle updates flatt; ellers matches de
 * per lagret time (+ unmatched til slutt), akkurat som import-previewen.
 */
export function extractVisibleOverlayLinesForDay(args: {
  action: SchoolWeekOverlayDayAction
  lessons: SchoolLessonSlot[]
  isReplaceDay?: boolean
}): string[] {
  const { action, lessons, isReplaceDay = false } = args
  const updates = action.subjectUpdates ?? []
  const ordered = isReplaceDay
    ? updates
    : [
        ...lessons.flatMap((L) => overlayUpdatesForLesson(L, updates).map((m) => m.update)),
        ...overlaySubjectUpdatesUnmatchedByLessons(updates, lessons),
      ]
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of ordered) {
    for (const { lines } of sectionsForReadOnly(u.sections)) {
      for (const line of lines) {
        const text = line.trim()
        const norm = text.toLowerCase().replace(/\s+/g, ' ')
        if (!norm || seen.has(norm)) continue
        seen.add(norm)
        out.push(text)
      }
    }
  }
  return out
}
