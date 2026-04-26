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
import { sheetPanel, sheetHandle, sheetHandleBar, sheetDetailBody, typSectionCap, btnRowAction } from '../lib/ui'
import { useFamily } from '../context/FamilyContext'
import { dateKeyToWeekdayMon0 } from '../lib/weekday'
import { subjectLabelForKey } from '../data/norwegianSubjects'
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

type OverlaySectionKey =
  | 'iTimen'
  | 'lekse'
  | 'huskTaMed'
  | 'proveVurdering'
  | 'ressurser'
  | 'ekstraBeskjed'

const OVERLAY_SECTION_LABELS: Record<OverlaySectionKey, string> = {
  iTimen: 'I timen',
  lekse: 'Lekse',
  huskTaMed: 'Husk / ta med',
  proveVurdering: 'Prøve / vurdering',
  ressurser: 'Ressurser',
  ekstraBeskjed: 'Ekstra beskjed',
}

const OVERLAY_SECTION_KEYS: OverlaySectionKey[] = [
  'iTimen',
  'lekse',
  'huskTaMed',
  'proveVurdering',
  'ressurser',
  'ekstraBeskjed',
]

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

function overlayUpdatesForLesson(
  lesson: SchoolLessonSlot | undefined,
  updates: SchoolWeekOverlaySubjectUpdate[]
): Array<{ update: SchoolWeekOverlaySubjectUpdate; updateIndex: number }> {
  if (!lesson) return []
  const lessonCustom = (lesson.customLabel ?? lesson.lessonSubcategory ?? '')
    .trim()
    .toLocaleLowerCase('nb-NO')
  return updates
    .map((u, idx) => ({ update: u, updateIndex: idx }))
    .filter(({ update: u }) => {
      if (u.subjectKey !== lesson.subjectKey) return false
      const custom = (u.customLabel ?? '').trim().toLocaleLowerCase('nb-NO')
      if (!custom || !lessonCustom) return true
      return custom === lessonCustom
    })
}

function overlaySubjectUpdatesUnmatchedByLessons(
  updates: SchoolWeekOverlaySubjectUpdate[],
  lessons: SchoolLessonSlot[]
): SchoolWeekOverlaySubjectUpdate[] {
  if (lessons.length === 0) return updates
  return updates.filter(
    (u) => !lessons.some((L) => overlayUpdatesForLesson(L, [u]).length > 0)
  )
}

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

function sectionsForReadOnly(
  sections: Record<string, string[]> | undefined
): Array<{ key: OverlaySectionKey; lines: string[] }> {
  const out: Array<{ key: OverlaySectionKey; lines: string[] }> = []
  for (const key of OVERLAY_SECTION_KEYS) {
    const lines = (sections?.[key] ?? []).filter((line) => line.trim().length > 0)
    if (lines.length > 0) out.push({ key, lines })
  }
  return out
}

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

function buildSchoolRows(person: Person, dateKey: string): TimeRowWithLesson[] {
  const school = person.school
  if (!school) return []
  const plan = getSchoolDayPlan(person, dateKey)
  if (!plan?.lessons?.length || plan.useSimpleDay) {
    return [{ start: plan?.schoolStart ?? '08:15', end: plan?.schoolEnd ?? '14:30', label: 'Skole' }]
  }
  const lessons = [...plan.lessons].sort((a, b) => a.start.localeCompare(b.start))
  return lessons.map((L) => ({
    start: L.start,
    end: L.end,
    label: subjectLabelForKey(school.gradeBand, L.subjectKey, L.customLabel, L.lessonSubcategory),
    lesson: L,
  }))
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
  const isSchool = event.metadata?.backgroundKind === 'school'
  const schoolDayOverride = isSchool ? extractSchoolDayOverride(event) : null
  const isReplaceDay = schoolDayOverride?.mode === 'replace_day'
  const isAdjustDay = schoolDayOverride?.mode === 'adjust_day'
  const title = !isSchool
    ? 'Arbeidsblokk'
    : isReplaceDay
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

  const relevantForeground = foregroundEvents.sort((a, b) => a.start.localeCompare(b.start))

  const schoolPlan = isSchool ? getSchoolDayPlan(person, date) : undefined
  const weekOverlayDayAction = isSchool ? normalizeOverlayDayAction(event) : null
  const weekOverlayMeta = isSchool ? normalizeOverlayMeta(event) : null
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
    weekOverlayDayAction?.subjectUpdates?.length && overlayLessonSlots.length > 0
      ? overlaySubjectUpdatesUnmatchedByLessons(weekOverlayDayAction.subjectUpdates, overlayLessonSlots)
      : weekOverlayDayAction?.subjectUpdates ?? []

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
          <div className={sheetHandle}>
            <div className={sheetHandleBar} aria-hidden />
          </div>
          <div className={sheetDetailBody}>
            <p className={typSectionCap}>{title}</p>
            <h2 className="mt-1 text-[20px] font-bold text-zinc-900 leading-tight">{person.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-body-sm text-zinc-600">{formatTimeRange(event.start, event.end)}</p>
              {schoolDayOverride ? (
                <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-800">
                  {schoolDayOverrideKindLabel(schoolDayOverride.kind)}
                </span>
              ) : null}
            </div>
            {isSchool && weekOverlaySummaryLines.length > 0 ? (
              <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50/60 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-900">Ukeoppsummering</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-indigo-950">
                  {weekOverlaySummaryLines.map((line, idx) => (
                    <li key={`${line}-${idx}`}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-4 space-y-2">
              {rows.map((r, idx) => {
                const conflicts = relevantForeground.filter((ev) => overlaps(r.start, r.end, ev.start, ev.end))
                const rowItems = r.lesson ? schoolItemsByLesson.get(r.lesson) ?? [] : []
                return (
                  <div key={`${r.start}-${r.end}-${idx}`} className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-body-sm font-semibold text-zinc-900">{r.label}</p>
                      <p className="text-caption text-zinc-500">{formatTimeRange(r.start, r.end)}</p>
                    </div>
                    {rowItems.length > 0 ? (
                      <ul className="mt-2 space-y-1.5">
                        {rowItems.map(({ event: sev, ctx }) => (
                          <li
                            key={sev.id}
                            className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5"
                          >
                            <span
                              className={`mt-0.5 inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${schoolItemTypeChipClass(ctx.itemType)}`}
                            >
                              {schoolItemTypeLabel(ctx.itemType)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[12px] font-semibold text-zinc-900">{sev.title}</p>
                              {sev.notes?.trim() ? (
                                <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-500">
                                  {sev.notes.trim()}
                                </p>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {isSchool && weekOverlayDayAction?.subjectUpdates?.length ? (
                      <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50/70 p-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-900">Uke-overlay</p>
                        {overlayUpdatesForLesson(r.lesson, weekOverlayDayAction.subjectUpdates).length > 0 ? (
                          <ul className="mt-1 space-y-1">
                            {overlayUpdatesForLesson(r.lesson, weekOverlayDayAction.subjectUpdates).map(
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
                                  <li key={itemKey} className="rounded-md border border-indigo-200 bg-white/85 px-2 py-1.5 text-[11px] text-indigo-950">
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
                                                  <li key={`${key}-${i}`}>{line}</li>
                                                ))}
                                              </ul>
                                            </li>
                                          ))}
                                        </ul>
                                      ) : (
                                        <p className="mt-1 text-[11px] text-indigo-900/80">Ingen seksjoner registrert.</p>
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
                                              className="w-full rounded border border-indigo-200 bg-white px-2 py-1 text-[11px] text-zinc-900"
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
                                          <p className="text-[10px] text-rose-700">{overlaySaveError}</p>
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
                        ) : (
                          <p className="mt-1 text-[11px] text-indigo-900/80">Ingen fagspesifikke tillegg for denne raden.</p>
                        )}
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
                            <div key={c.id} className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[12px] font-semibold text-amber-900">
                                  {COPY.conflicts.collidesWith}: {c.title} ({formatTimeRange(c.start, c.end)})
                                </p>
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                  {severityLabel}
                                </span>
                              </div>
                              <p className="mt-1 text-[11px] text-amber-800">
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
                                <p className="mt-2 text-[11px] text-amber-800">
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
                        className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5"
                      >
                        <span
                          className={`mt-0.5 inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${schoolItemTypeChipClass(ctx.itemType)}`}
                        >
                          {schoolItemTypeLabel(ctx.itemType)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-[12px] font-semibold text-zinc-900">{sev.title}</p>
                            {subjectLabel ? (
                              <span className="shrink-0 text-[11px] font-medium text-zinc-500">
                                {subjectLabel}
                              </span>
                            ) : null}
                          </div>
                          {sev.notes?.trim() ? (
                            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-500">
                              {sev.notes.trim()}
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
                <p className={typSectionCap}>Uke-overlay (ikke koblet til spesifikk time)</p>
                <ul className="mt-2 space-y-1.5">
                  {weekOverlayUnplacedUpdates.map((u, idx) => (
                    <li key={`${u.subjectKey}-${idx}`} className="rounded-lg border border-indigo-200 bg-indigo-50/70 px-2.5 py-1.5">
                      <p className="text-[12px] font-semibold text-indigo-950">
                        {u.customLabel ? `${u.customLabel} (${u.subjectKey})` : u.subjectKey}
                      </p>
                    </li>
                  ))}
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
                        className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5"
                      >
                        <span
                          className={`mt-0.5 inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded border ${done ? 'border-emerald-400 bg-emerald-100 text-emerald-700' : 'border-zinc-300 bg-white text-transparent'}`}
                          aria-hidden
                        >
                          {done ? '✓' : ''}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-[12px] font-semibold ${done ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>
                            {t.title}
                          </p>
                          {t.dueTime ? (
                            <p className="mt-0.5 text-[11px] font-medium text-amber-700">Frist {t.dueTime}</p>
                          ) : null}
                          {t.notes?.trim() ? (
                            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-500">
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
