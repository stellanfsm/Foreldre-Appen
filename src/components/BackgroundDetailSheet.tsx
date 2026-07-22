import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type {
  ChildSchoolDayPlan,
  Event,
  Person,
  SchoolContext,
  SchoolLessonSlot,
  SchoolWeekOverlayDayAction,
  SchoolWeekOverlaySubjectUpdate,
  Task,
  WeekdayMonFri,
} from '../types'
import { springDialog } from '../lib/motion'
import { CanonicalSchoolDayContent } from './CanonicalSchoolDayContent'
import type { CanonicalPlanDay } from '../lib/canonicalSchoolImportPlan'
import { sheetPanel, sheetHandle, sheetDetailBody, typSectionCap, btnRowAction } from '../lib/ui'
import { useFamily } from '../context/FamilyContext'
import { dateKeyToWeekdayMon0 } from '../lib/weekday'
import { formatTimeRange, parseTime } from '../lib/time'
import { getEventParticipantIds } from '../lib/schedule'
import { COPY } from '../lib/norwegianCopy'
import { hasTimeOverlap } from '../lib/collisions'
import {
  extractSchoolContext,
  extractSchoolDayOverride,
  matchLessonForSchoolContext,
  schoolContextSubjectLabel,
  schoolDayOverrideKindLabel,
  schoolItemTypeChipClass,
  schoolItemTypeLabel,
} from '../lib/schoolContext'
import {
  overlaySubjectUpdatesUnmatchedByLessons,
  overlayUpdatesForLesson,
} from '../lib/schoolWeekOverlayLessonMatch'
import { ClassHighlightedText } from '../features/tankestrom/classHighlight'
import {
  OVERLAY_SECTION_KEYS,
  OVERLAY_SECTION_LABELS,
  buildSchoolRowsForPlan,
  sectionsForReadOnly,
  type OverlaySectionKey,
} from '../lib/schoolOverlayDisplay'

interface BackgroundDetailSheetProps {
  event: Event | null
  date: string
  /** Foreground-events for dagen (brukt til konflikt-varsler, som før). */
  foregroundEvents: Event[]
  /** Alle events for dagen — leses for å plukke ut school-contexts (kan være samme liste som foregroundEvents). */
  dayEvents?: Event[]
  /** Tasks for dagen — filtreres på barnet i sheet-en. */
  dayTasks?: Task[]
  onResolveConflict?: (input: {
    rowLabel: string
    rowStart: string
    rowEnd: string
    conflictEventId: string
    conflictTitle: string
    severity: 'soft' | 'hard'
    decision: 'prioritize_background' | 'prioritize_foreground' | 'clarify_later'
  }) => void | Promise<void>
  onClose: () => void
}

interface SchoolItemEntry {
  event: Event
  ctx: SchoolContext
}

// OverlaySectionKey + OVERLAY_SECTION_LABELS/_KEYS er flyttet til ../lib/schoolOverlayDisplay
// (delt med import-previewen). Importert øverst.

function normalizeOverlayDayAction(event: Event): SchoolWeekOverlayDayAction | null {
  const raw = event.metadata?.schoolWeekOverlayDay
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const candidate = raw as Partial<SchoolWeekOverlayDayAction>
  if (
    candidate.action !== 'replace_school_block' &&
    candidate.action !== 'remove_school_block' &&
    candidate.action !== 'enrich_existing_school_block' &&
    candidate.action !== 'none'
  ) {
    return null
  }
  const updates = Array.isArray(candidate.subjectUpdates)
    ? candidate.subjectUpdates.filter((u): u is SchoolWeekOverlaySubjectUpdate => !!u && typeof u === 'object')
    : []
  return {
    action: candidate.action,
    reason: candidate.reason,
    summary: candidate.summary,
    subjectUpdates: updates,
  }
}

function normalizeOverlayMeta(event: Event): { overlayId: string; weekYear: number; weekNumber: number; dayIndex: number } | null {
  const raw = event.metadata?.schoolWeekOverlayMeta
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const candidate = raw as Partial<{ overlayId: string; weekYear: number; weekNumber: number; dayIndex: number }>
  if (!candidate.overlayId || typeof candidate.overlayId !== 'string') return null
  if (
    typeof candidate.weekYear !== 'number' ||
    typeof candidate.weekNumber !== 'number' ||
    typeof candidate.dayIndex !== 'number'
  ) {
    return null
  }
  return {
    overlayId: candidate.overlayId,
    weekYear: candidate.weekYear,
    weekNumber: candidate.weekNumber,
    dayIndex: candidate.dayIndex,
  }
}

// overlayUpdatesForLesson + overlaySubjectUpdatesUnmatchedByLessons er flyttet til
// ../lib/schoolWeekOverlayLessonMatch (Fiks 2: subjectKey-normalisering, testbar rent).

function normalizeSectionsForEdit(
  sections: Record<string, string[]> | undefined
): Partial<Record<OverlaySectionKey, string>> {
  const out: Partial<Record<OverlaySectionKey, string>> = {}
  for (const key of OVERLAY_SECTION_KEYS) {
    const lines = sections?.[key] ?? []
    if (lines.length > 0) out[key] = lines.join('\n')
  }
  return out
}

function splitSectionTextToLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function sectionKeysWithData(sections: Partial<Record<OverlaySectionKey, string>>): OverlaySectionKey[] {
  return OVERLAY_SECTION_KEYS.filter((k) => (sections[k] ?? '').trim().length > 0)
}

function sectionKeysMissing(sections: Partial<Record<OverlaySectionKey, string>>): OverlaySectionKey[] {
  const shown = new Set(sectionKeysWithData(sections))
  return OVERLAY_SECTION_KEYS.filter((k) => !shown.has(k))
}

// sectionsForReadOnly er flyttet til ../lib/schoolOverlayDisplay (delt med import-previewen). Importert øverst.

function updateOverlaySectionsOnPerson(
  person: Person,
  overlayMeta: { overlayId: string; weekYear: number; weekNumber: number; dayIndex: number },
  subjectUpdateIndex: number,
  sections: Partial<Record<OverlaySectionKey, string>>
): Person['school'] | null {
  const school = person.school
  if (!school?.weekOverlays?.length) return null
  const nextOverlays = school.weekOverlays.map((overlay) => {
    if (overlay.id !== overlayMeta.overlayId) return overlay
    if (overlay.weekYear !== overlayMeta.weekYear || overlay.weekNumber !== overlayMeta.weekNumber) return overlay
    const dayAction = overlay.dailyActions[overlayMeta.dayIndex]
    if (!dayAction) return overlay
    const nextSubjectUpdates = dayAction.subjectUpdates.map((u, idx) => {
      if (idx !== subjectUpdateIndex) return u
      const mappedSections: Record<string, string[]> = {}
      for (const sectionKey of OVERLAY_SECTION_KEYS) {
        const text = sections[sectionKey] ?? ''
        const lines = splitSectionTextToLines(text)
        if (lines.length > 0) mappedSections[sectionKey] = lines
      }
      return {
        ...u,
        sections: Object.keys(mappedSections).length > 0 ? mappedSections : undefined,
      }
    })
    return {
      ...overlay,
      dailyActions: {
        ...overlay.dailyActions,
        [overlayMeta.dayIndex]: {
          ...dayAction,
          subjectUpdates: nextSubjectUpdates,
        },
      },
    }
  })
  return { ...school, weekOverlays: nextOverlays }
}

type TimeRow = {
  start: string
  end: string
  label: string
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return hasTimeOverlap(aStart, aEnd, bStart, bEnd)
}

function toTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(minutes, 23 * 60 + 59))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function buildAlternativeSlots(rowStart: string, rowEnd: string, conflictStart: string, conflictEnd: string): string[] {
  const rowDuration = Math.max(15, parseTime(rowEnd) - parseTime(rowStart))
  const beforeEnd = parseTime(conflictStart)
  const beforeStart = beforeEnd - rowDuration
  const afterStart = parseTime(conflictEnd)
  const afterEnd = afterStart + rowDuration
  return [`${toTime(beforeStart)}-${toTime(beforeEnd)}`, `${toTime(afterStart)}-${toTime(afterEnd)}`]
}

type TimeRowWithLesson = TimeRow & { lesson?: SchoolLessonSlot }

function getSchoolDayPlan(person: Person, dateKey: string): ChildSchoolDayPlan | undefined {
  if (!person.school) return undefined
  const mon0 = dateKeyToWeekdayMon0(dateKey)
  if (mon0 > 4) return undefined
  const wd = mon0 as WeekdayMonFri
  return person.school.weekdays[wd]
}

/**
 * Leser den serialiserbare `CanonicalPlanDay` fra skoleeventets metadata (skrevet av
 * backgroundEvents fra det RUNTIME-validerte lagrede snapshotet). Lett strukturguard — canonical
 * er da autoritativt for skoleblokken; legacy timeplan/overlay rendres ikke parallelt.
 */
function readCanonicalPlanDay(event: Event): CanonicalPlanDay | null {
  const raw = (event.metadata as Record<string, unknown> | undefined)?.schoolCanonicalDay
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Partial<CanonicalPlanDay>
  if (typeof d.op !== 'string') return null
  if (
    !Array.isArray(d.timetable) ||
    !Array.isArray(d.unplacedSubjectGroups) ||
    !Array.isArray(d.audienceItems) ||
    !Array.isArray(d.generalMessages)
  ) {
    return null
  }
  return raw as CanonicalPlanDay
}

function buildSchoolRows(person: Person, dateKey: string): TimeRowWithLesson[] {
  const school = person.school
  if (!school) return []
  // Deler rad-byggingen med import-previewen via buildSchoolRowsForPlan (ren refaktor, samme oppførsel).
  return buildSchoolRowsForPlan(school.gradeBand, getSchoolDayPlan(person, dateKey))
}

/**
 * Fordel school-events på lesson-rader.
 *
 * Returnerer:
 *  - `byLesson`: map fra lesson-referanse → liste med entries som hører hjemme der
 *  - `unmatched`: school-events uten lesson-match (vises i "Fag for dagen")
 */
function splitSchoolItemsByLesson(
  items: SchoolItemEntry[],
  plan: ChildSchoolDayPlan | undefined
): { byLesson: Map<SchoolLessonSlot, SchoolItemEntry[]>; unmatched: SchoolItemEntry[] } {
  const byLesson = new Map<SchoolLessonSlot, SchoolItemEntry[]>()
  const unmatched: SchoolItemEntry[] = []
  for (const it of items) {
    const lesson = matchLessonForSchoolContext(plan, it.ctx)
    if (!lesson) {
      unmatched.push(it)
      continue
    }
    const bucket = byLesson.get(lesson)
    if (bucket) bucket.push(it)
    else byLesson.set(lesson, [it])
  }
  return { byLesson, unmatched }
}

export function BackgroundDetailSheet({
  event,
  date,
  foregroundEvents,
  dayEvents,
  dayTasks,
  onResolveConflict,
  onClose,
}: BackgroundDetailSheetProps) {
  const { people, updatePerson } = useFamily()
  if (!event) return null

  const person = people.find((p) => p.id === event.personId)
  if (!person) return null
  // Klassekode-utheving i skole-item-notater: blokken tilhører ETT barn → entydig kode.
  const childClassCode = person.relevanceProfile?.school?.classCode
  const isSchool = event.metadata?.backgroundKind === 'school'
  // ADDITIVT: canonical-snapshot (readback) er autoritativt for skoleblokken når det finnes.
  const canonicalDay = isSchool ? readCanonicalPlanDay(event) : null
  const weekOverlayDayAction = isSchool ? normalizeOverlayDayAction(event) : null
  const weekOverlayMeta = isSchool ? normalizeOverlayMeta(event) : null
  const schoolDayOverride = isSchool ? extractSchoolDayOverride(event) : null
  const isOverlayReplaceDay = weekOverlayDayAction?.action === 'replace_school_block'
  const isReplaceDay = schoolDayOverride?.mode === 'replace_day' || isOverlayReplaceDay
  const isAdjustDay = schoolDayOverride?.mode === 'adjust_day'
  const title = !isSchool
    ? 'Arbeidsblokk'
    : isReplaceDay || canonicalDay?.op === 'replace_day'
      ? 'Spesialdag'
      : 'Timeplan'

  let rows: TimeRowWithLesson[]
  if (!isSchool) {
    rows = [{ start: event.start, end: event.end, label: 'Arbeid' }]
  } else if (isReplaceDay) {
    rows = [
      {
        start: event.start,
        end: event.end,
        label: schoolDayOverride?.label ?? event.title ?? 'Hele skoledagen',
      },
    ]
  } else {
    const allRows = buildSchoolRows(person, date)
    rows = isAdjustDay
      ? allRows.filter((r) => r.end > event.start && r.start < event.end)
      : allRows
    if (rows.length === 0) {
      rows = [{ start: event.start, end: event.end, label: 'Skole' }]
    }
  }
  // Canonical er autoritativt: legacy timeplan-rader rendres ikke (CanonicalSchoolDayContent
  // viser sin egen timeplan + fag-items etter dayOperation). Ingen parallell tolkning.
  if (canonicalDay) rows = []

  const relevantForeground = foregroundEvents.sort((a, b) => a.start.localeCompare(b.start))

  const schoolPlan = isSchool ? getSchoolDayPlan(person, date) : undefined
  const weekOverlaySummaryLines = useMemo(() => {
    if (!person.school?.weekOverlays?.length || !weekOverlayMeta) return []
    const overlay = person.school.weekOverlays.find(
      (w) =>
        w.id === weekOverlayMeta.overlayId &&
        w.weekYear === weekOverlayMeta.weekYear &&
        w.weekNumber === weekOverlayMeta.weekNumber
    )
    return (overlay?.weeklySummary ?? []).filter((line) => line.trim().length > 0).slice(0, 3)
  }, [person.school?.weekOverlays, weekOverlayMeta])
  const [editingOverlayKey, setEditingOverlayKey] = useState<string | null>(null)
  const [overlayDraftSections, setOverlayDraftSections] = useState<Partial<Record<OverlaySectionKey, string>>>({})
  const [overlaySaveError, setOverlaySaveError] = useState<string | null>(null)
  const [overlaySaving, setOverlaySaving] = useState(false)
  const schoolItems: SchoolItemEntry[] = isSchool
    ? (dayEvents ?? foregroundEvents)
        .filter((ev) => ev.personId === person.id)
        .reduce<SchoolItemEntry[]>((acc, ev) => {
          const ctx = extractSchoolContext(ev)
          if (ctx) acc.push({ event: ev, ctx })
          return acc
        }, [])
    : []
  const { byLesson: schoolItemsByLesson, unmatched: schoolItemsUnmatched } = splitSchoolItemsByLesson(
    schoolItems,
    schoolPlan
  )
  const childTasks: Task[] = isSchool
    ? (dayTasks ?? [])
        .filter(
          (t) =>
            (t.childPersonId === person.id || t.assignedToPersonId === person.id) && t.date === date
        )
        .sort((a, b) => (a.dueTime ?? '').localeCompare(b.dueTime ?? ''))
    : []

  const overlayLessonSlots: SchoolLessonSlot[] =
    isSchool && !isReplaceDay
      ? rows.map((r) => r.lesson).filter((L): L is SchoolLessonSlot => !!L)
      : []
  const weekOverlayUnplacedUpdates =
    isReplaceDay
      ? []
      : (
    weekOverlayDayAction?.subjectUpdates?.length && overlayLessonSlots.length > 0
      ? overlaySubjectUpdatesUnmatchedByLessons(weekOverlayDayAction.subjectUpdates, overlayLessonSlots)
      : weekOverlayDayAction?.subjectUpdates ?? []
        )
  if ((import.meta.env.DEV || import.meta.env.VITE_DEBUG_SCHOOL_IMPORT === 'true') && isSchool && isReplaceDay) {
    console.debug('[detail sheet replace]', {
      detailSheetReplaceModeEnabled: true,
      detailSheetLessonRowsSuppressed: true,
      detailSheetReplaceTitle: event.title,
      detailSheetReplaceSectionsCount: weekOverlayDayAction?.subjectUpdates?.length ?? 0,
    })
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-30 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-0 z-40 flex items-end justify-center px-3">
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={springDialog}
          className={sheetPanel}
          role="dialog"
          aria-modal="true"
          aria-label="Detaljer skole og jobb"
        >
          <div className={sheetHandle} />
          <div className={sheetDetailBody}>
            <p className={typSectionCap}>{title}</p>
            <h2 className="mt-1 text-[20px] font-bold text-zinc-900 leading-tight">{person.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-body-sm text-zinc-600">{formatTimeRange(event.start, event.end)}</p>
              {schoolDayOverride ? (
                <span className="inline-flex items-center rounded-pill border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-800">
                  {schoolDayOverrideKindLabel(schoolDayOverride.kind)}
                </span>
              ) : null}
            </div>
            {isSchool && !canonicalDay && weekOverlaySummaryLines.length > 0 ? (
              <div className="mt-2 rounded-md border border-indigo-200 bg-indigo-50/60 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-900">Ukeoppsummering</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-caption text-indigo-950">
                  {weekOverlaySummaryLines.map((line, idx) => (
                    <li key={`${line}-${idx}`}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Canonical readback: samme delte renderer som import-previewen. */}
            {canonicalDay ? (
              <div className="mt-4">
                <CanonicalSchoolDayContent day={canonicalDay} />
              </div>
            ) : null}

            <div className="mt-4 space-y-2">
              {rows.map((r, idx) => {
                const conflicts = relevantForeground.filter((ev) => overlaps(r.start, r.end, ev.start, ev.end))
                const rowItems = r.lesson ? schoolItemsByLesson.get(r.lesson) ?? [] : []
                return (
                  <div key={`${r.start}-${r.end}-${idx}`} className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-body-sm font-semibold text-zinc-900">{r.label}</p>
                      <p className="text-caption text-zinc-500">{formatTimeRange(r.start, r.end)}</p>
                    </div>
                    {r.lesson && (r.lesson.room || r.lesson.teacher) ? (
                      <p className="mt-0.5 text-caption text-zinc-500">
                        {[
                          r.lesson.room ? `Rom ${r.lesson.room}` : null,
                          r.lesson.teacher ? `Lærer ${r.lesson.teacher}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    ) : null}
                    {rowItems.length > 0 ? (
                      <ul className="mt-2 space-y-1.5">
                        {rowItems.map(({ event: sev, ctx }) => (
                          <li
                            key={sev.id}
                            className="flex items-start gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5"
                          >
                            <span
                              className={`mt-0.5 inline-flex shrink-0 items-center rounded-pill border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${schoolItemTypeChipClass(ctx.itemType)}`}
                            >
                              {schoolItemTypeLabel(ctx.itemType)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-caption font-semibold text-zinc-900">{sev.title}</p>
                              {sev.notes?.trim() ? (
                                <p className="mt-0.5 line-clamp-2 text-caption leading-snug text-zinc-500">
                                  <ClassHighlightedText
                                    text={sev.notes.trim()}
                                    fallback={sev.notes.trim()}
                                    childClassCode={childClassCode}
                                    mode="spans"
                                  />
                                </p>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {/* Punkt 5: ingen «Uke-overlay»-header per rad, og boksen rendres KUN når raden
                        faktisk har matchende innhold — rader uten relevans viser ingenting. */}
                    {isSchool &&
                    weekOverlayDayAction?.subjectUpdates?.length &&
                    (isReplaceDay
                      ? weekOverlayDayAction.subjectUpdates.length > 0
                      : overlayUpdatesForLesson(r.lesson, weekOverlayDayAction.subjectUpdates).length > 0) ? (
                      <div className="mt-2 rounded-md border border-indigo-200 bg-indigo-50/70 p-2">
                        <ul className="space-y-1">
                            {(isReplaceDay
                              ? weekOverlayDayAction.subjectUpdates.map((update, updateIndex) => ({ update, updateIndex }))
                              : overlayUpdatesForLesson(r.lesson, weekOverlayDayAction.subjectUpdates)
                            ).map(
                              ({ update, updateIndex }) => {
                                const itemKey = `${idx}-${updateIndex}-${update.subjectKey}`
                                const inEdit = editingOverlayKey === itemKey
                                const draft =
                                  inEdit && Object.keys(overlayDraftSections).length > 0
                                    ? overlayDraftSections
                                    : normalizeSectionsForEdit(update.sections)
                                const shownSections = sectionKeysWithData(draft)
                                const readOnlySections = sectionsForReadOnly(update.sections)
                                const missing = sectionKeysMissing(draft)
                                return (
                                  <li key={itemKey} className="rounded-md border border-indigo-200 bg-white/85 px-2 py-1.5 text-caption text-indigo-950">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="font-medium">
                                        {update.customLabel ? `${update.customLabel} (${update.subjectKey})` : update.subjectKey}
                                      </p>
                                      {!inEdit ? (
                                        <button
                                          type="button"
                                          className="rounded border border-indigo-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-indigo-900"
                                          onClick={() => {
                                            setEditingOverlayKey(itemKey)
                                            setOverlayDraftSections(normalizeSectionsForEdit(update.sections))
                                            setOverlaySaveError(null)
                                          }}
                                        >
                                          Rediger
                                        </button>
                                      ) : null}
                                    </div>
                                    {!inEdit ? (
                                      readOnlySections.length > 0 ? (
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
                                      )
                                    ) : (
                                      <div className="mt-1.5 space-y-1.5">
                                        {shownSections.map((key) => (
                                          <label key={key} className="block">
                                            <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-indigo-900">
                                              {OVERLAY_SECTION_LABELS[key]}
                                            </span>
                                            <textarea
                                              rows={2}
                                              value={draft[key] ?? ''}
                                              onChange={(e) =>
                                                setOverlayDraftSections((prev) => ({ ...prev, [key]: e.target.value }))
                                              }
                                              className="w-full rounded border border-indigo-200 bg-white px-2 py-1 text-caption text-zinc-900"
                                            />
                                          </label>
                                        ))}
                                        {missing.length > 0 ? (
                                          <button
                                            type="button"
                                            className="rounded border border-indigo-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-indigo-900"
                                            onClick={() =>
                                              setOverlayDraftSections((prev) => ({ ...prev, [missing[0]!]: '' }))
                                            }
                                          >
                                            + Legg til felt: {OVERLAY_SECTION_LABELS[missing[0]!]}
                                          </button>
                                        ) : null}
                                        {overlaySaveError ? (
                                          <p className="text-[10px] text-synkaCoral">{overlaySaveError}</p>
                                        ) : null}
                                        <div className="flex gap-1.5">
                                          <button
                                            type="button"
                                            className="rounded border border-indigo-300 bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white disabled:opacity-60"
                                            disabled={overlaySaving}
                                            onClick={async () => {
                                              if (!weekOverlayMeta) {
                                                setOverlaySaveError('Mangler uke-overlay metadata for lagring.')
                                                return
                                              }
                                              const nextSchool = updateOverlaySectionsOnPerson(
                                                person,
                                                weekOverlayMeta,
                                                updateIndex,
                                                draft
                                              )
                                              if (!nextSchool) {
                                                setOverlaySaveError('Fant ikke riktig uke-overlay på barnet.')
                                                return
                                              }
                                              setOverlaySaving(true)
                                              setOverlaySaveError(null)
                                              try {
                                                await updatePerson(person.id, { school: nextSchool })
                                                setEditingOverlayKey(null)
                                              } catch (e) {
                                                setOverlaySaveError(
                                                  e instanceof Error ? e.message : 'Kunne ikke lagre uke-overlay.'
                                                )
                                              } finally {
                                                setOverlaySaving(false)
                                              }
                                            }}
                                          >
                                            Lagre
                                          </button>
                                          <button
                                            type="button"
                                            className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-zinc-700"
                                            onClick={() => {
                                              setEditingOverlayKey(null)
                                              setOverlayDraftSections({})
                                              setOverlaySaveError(null)
                                            }}
                                          >
                                            Avbryt
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </li>
                                )
                              }
                            )}
                          </ul>
                      </div>
                    ) : null}
                    {conflicts.length > 0 ? (
                      <div className="mt-2 space-y-1.5">
                        {conflicts.map((c) => {
                          const needsResolution = !isSchool && getEventParticipantIds(c).includes(person.id)
                          const severity: 'soft' | 'hard' = needsResolution ? 'hard' : 'soft'
                          const severityLabel = severity === 'hard' ? COPY.status.needsClarification : COPY.conflicts.note
                          const alternatives = buildAlternativeSlots(r.start, r.end, c.start, c.end)
                          return (
                            <div key={c.id} className="rounded-md border border-synkaYellow/30 bg-synkaYellow/8 p-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-caption font-semibold text-synkaNavy/80">
                                  {COPY.conflicts.collidesWith}: {c.title} ({formatTimeRange(c.start, c.end)})
                                </p>
                                <span className="rounded-pill bg-synkaYellow/15 px-2 py-0.5 text-[10px] font-semibold text-synkaNavy/70">
                                  {severityLabel}
                                </span>
                              </div>
                              <p className="mt-1 text-caption text-synkaNavy/70">
                                {COPY.conflicts.suggestion}: {alternatives[0]} eller {alternatives[1]}
                              </p>
                              {needsResolution ? (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onResolveConflict?.({
                                        rowLabel: r.label,
                                        rowStart: r.start,
                                        rowEnd: r.end,
                                        conflictEventId: c.id,
                                        conflictTitle: c.title,
                                        severity,
                                        decision: 'prioritize_background',
                                      })
                                    }
                                    className={btnRowAction}
                                  >
                                    Prioriter {r.label.toLowerCase()}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onResolveConflict?.({
                                        rowLabel: r.label,
                                        rowStart: r.start,
                                        rowEnd: r.end,
                                        conflictEventId: c.id,
                                        conflictTitle: c.title,
                                        severity,
                                        decision: 'prioritize_foreground',
                                      })
                                    }
                                    className={btnRowAction}
                                  >
                                    {COPY.actions.prioritizeActivity}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onResolveConflict?.({
                                        rowLabel: r.label,
                                        rowStart: r.start,
                                        rowEnd: r.end,
                                        conflictEventId: c.id,
                                        conflictTitle: c.title,
                                        severity,
                                        decision: 'clarify_later',
                                      })
                                    }
                                    className={btnRowAction}
                                  >
                                    {COPY.actions.clarifyLater}
                                  </button>
                                </div>
                              ) : (
                                <p className="mt-2 text-caption text-synkaNavy/70">
                                  Skole + avtale regnes som planlagt og trenger ikke avklaring.
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="mt-2 text-caption text-zinc-400">{COPY.conflicts.noCollisions}</p>
                    )}
                  </div>
                )
              })}
            </div>

            {isSchool && schoolItemsUnmatched.length > 0 ? (
              <div className="mt-4">
                <p className={typSectionCap}>Fag for dagen</p>
                <ul className="mt-2 space-y-1.5">
                  {schoolItemsUnmatched.map(({ event: sev, ctx }) => {
                    const subjectLabel = schoolContextSubjectLabel(person.school?.gradeBand, ctx)
                    return (
                      <li
                        key={sev.id}
                        className="flex items-start gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5"
                      >
                        <span
                          className={`mt-0.5 inline-flex shrink-0 items-center rounded-pill border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${schoolItemTypeChipClass(ctx.itemType)}`}
                        >
                          {schoolItemTypeLabel(ctx.itemType)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-caption font-semibold text-zinc-900">{sev.title}</p>
                            {subjectLabel ? (
                              <span className="shrink-0 text-caption font-medium text-zinc-500">
                                {subjectLabel}
                              </span>
                            ) : null}
                          </div>
                          {sev.notes?.trim() ? (
                            <p className="mt-0.5 line-clamp-2 text-caption leading-snug text-zinc-500">
                              <ClassHighlightedText
                                text={sev.notes.trim()}
                                fallback={sev.notes.trim()}
                                childClassCode={childClassCode}
                                mode="spans"
                              />
                            </p>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
            {isSchool && weekOverlayUnplacedUpdates.length > 0 ? (
              <div className="mt-4">
                <p className={typSectionCap}>Ellers denne dagen</p>
                <ul className="mt-2 space-y-1.5">
                  {weekOverlayUnplacedUpdates.map((u, idx) => {
                    // Fiks 2b: vis også seksjons-innholdet (lekse/beskjed osv.), ikke bare fag-etiketten,
                    // så 'other'-innhold og umatchede fag ikke forsvinner stille i fallback-seksjonen.
                    const readOnlySections = sectionsForReadOnly(u.sections)
                    return (
                      <li key={`${u.subjectKey}-${idx}`} className="rounded-md border border-indigo-200 bg-indigo-50/70 px-2.5 py-1.5">
                        <p className="text-caption font-semibold text-indigo-950">
                          {u.customLabel ? `${u.customLabel} (${u.subjectKey})` : u.subjectKey}
                        </p>
                        {readOnlySections.length > 0 ? (
                          <ul className="mt-1 space-y-1">
                            {readOnlySections.map(({ key, lines }) => (
                              <li key={key}>
                                <p className="font-medium text-indigo-900">{OVERLAY_SECTION_LABELS[key]}</p>
                                <ul className="list-disc pl-4 text-indigo-900">
                                  {lines.map((line, i) => (
                                    <li key={i}>
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
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}

            {isSchool && childTasks.length > 0 ? (
              <div className="mt-4">
                <p className={typSectionCap}>Gjøremål for skoledagen</p>
                <ul className="mt-2 space-y-1.5">
                  {childTasks.map((t) => {
                    const done = !!t.completedAt
                    return (
                      <li
                        key={t.id}
                        className="flex items-start gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5"
                      >
                        <span
                          className={`mt-0.5 inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded border ${done ? 'border-emerald-400 bg-emerald-100 text-emerald-700' : 'border-zinc-300 bg-white text-transparent'}`}
                          aria-hidden
                        >
                          {done ? (
                            <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <polyline points="1.5,5 4,8 8.5,2" />
                            </svg>
                          ) : null}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-caption font-semibold ${done ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>
                            {t.title}
                          </p>
                          {t.dueTime ? (
                            <p className="mt-0.5 text-caption font-medium text-synkaNavy/70">Frist {t.dueTime}</p>
                          ) : null}
                          {t.notes?.trim() ? (
                            <p className="mt-0.5 line-clamp-2 text-caption leading-snug text-zinc-500">
                              {t.notes.trim()}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        </motion.div>
      </div>
    </>
  )
}
