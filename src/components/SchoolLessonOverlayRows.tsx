import type { SchoolLessonSlot, SchoolWeekOverlayDayAction, SchoolWeekOverlaySubjectUpdate } from '../types'
import {
  overlaySubjectUpdatesUnmatchedByLessons,
  overlayUpdatesForLesson,
} from '../lib/schoolWeekOverlayLessonMatch'
import { OVERLAY_SECTION_LABELS, sectionsForReadOnly } from '../lib/schoolOverlayDisplay'
import { ClassHighlightedText } from '../features/tankestrom/classHighlight'

/**
 * READ-ONLY-visning av uke-overlay under fag — for import-previewen. Deler matcheren
 * (schoolWeekOverlayLessonMatch) + seksjons-hjelperne (schoolOverlayDisplay) med kalenderens
 * BackgroundDetailSheet, så previewen viser NØYAKTIG det brukeren får etter import. Ingen edit,
 * ingen event/context/persist — rene presentasjons-komponenter.
 */

/**
 * Én overlay-linje: fag-etikett + seksjoner (I timen / Lekse / …). Ingen Rediger-knapp.
 * `childClassCode` (valgfri): klassekode-utheving + segment-demping på seksjonslinjene
 * (samme mode="spans" som event-notatene) — uten kode / uten klassekoder i teksten er
 * ClassHighlightedText no-op og teksten uendret.
 */
export function OverlayUpdateReadOnly({
  update,
  childClassCode,
}: {
  update: SchoolWeekOverlaySubjectUpdate
  childClassCode?: string
}) {
  const readOnlySections = sectionsForReadOnly(update.sections)
  return (
    <li className="rounded-md border border-indigo-200 bg-white/85 px-2 py-1.5 text-caption text-indigo-950">
      <p className="font-medium">
        {update.customLabel ? `${update.customLabel} (${update.subjectKey})` : update.subjectKey}
      </p>
      {readOnlySections.length > 0 ? (
        <ul className="mt-1 space-y-1">
          {readOnlySections.map(({ key, lines }) => (
            <li key={key}>
              <p className="font-medium text-indigo-900">{OVERLAY_SECTION_LABELS[key]}</p>
              <ul className="list-disc pl-4 text-indigo-900">
                {lines.map((line, i) => (
                  <li key={`${key}-${i}`}>
                    <ClassHighlightedText
                      text={line}
                      fallback={line}
                      childClassCode={childClassCode}
                      mode="spans"
                    />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-caption text-indigo-900/80">Ingen seksjoner registrert.</p>
      )}
    </li>
  )
}

/**
 * «Uke-overlay»-boksen READ-ONLY for én lesson-rad. enrich → per-fag-matchede linjer
 * (overlayUpdatesForLesson); replace → alle linjer flatt (som kalenderens erstatningsdag).
 */
export function LessonOverlayBoxReadOnly({
  lesson,
  overlayDayAction,
  isReplaceDay = false,
  childClassCode,
}: {
  lesson: SchoolLessonSlot | undefined
  overlayDayAction: SchoolWeekOverlayDayAction
  isReplaceDay?: boolean
  childClassCode?: string
}) {
  if (!overlayDayAction.subjectUpdates?.length) return null
  const matched = isReplaceDay
    ? overlayDayAction.subjectUpdates.map((update, updateIndex) => ({ update, updateIndex }))
    : overlayUpdatesForLesson(lesson, overlayDayAction.subjectUpdates)
  // Punkt 5: ingen «Uke-overlay»-header, og ingen boks når raden mangler matchende innhold —
  // rader uten relevans viser ingenting (renere enn en tom-tilstands-tekst).
  if (matched.length === 0) return null
  return (
    <div className="mt-2 rounded-md border border-indigo-200 bg-indigo-50/70 p-2">
      <ul className="space-y-1">
        {matched.map(({ update, updateIndex }) => (
          <OverlayUpdateReadOnly
            key={`${updateIndex}-${update.subjectKey}`}
            update={update}
            childClassCode={childClassCode}
          />
        ))}
      </ul>
    </div>
  )
}

/** Overlay-linjer som ikke matcher noen lesson-rad — «ikke koblet til spesifikk time». */
export function OverlayUnmatchedFallback({
  lessons,
  overlayDayAction,
  childClassCode,
}: {
  lessons: SchoolLessonSlot[]
  overlayDayAction: SchoolWeekOverlayDayAction
  childClassCode?: string
}) {
  const unplaced = overlaySubjectUpdatesUnmatchedByLessons(overlayDayAction.subjectUpdates, lessons)
  if (unplaced.length === 0) return null
  return (
    <div className="mt-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-900">
        Ellers denne dagen
      </p>
      <ul className="mt-1 space-y-1.5">
        {unplaced.map((u, idx) => (
          <OverlayUpdateReadOnly key={`${u.subjectKey}-${idx}`} update={u} childClassCode={childClassCode} />
        ))}
      </ul>
    </div>
  )
}
