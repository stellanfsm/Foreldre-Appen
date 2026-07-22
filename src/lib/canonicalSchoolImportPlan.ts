import type { Person, WeekdayMonFri } from '../types'
import { buildSchoolRowsForPlan } from './schoolOverlayDisplay'
import { normalizeSubjectKeyForMatch } from './schoolWeekOverlayLessonMatch'
import { subjectLabelForKey } from '../data/norwegianSubjects'
import type {
  CanonicalSchoolContentDraft,
  CanonicalSchoolContentItem,
  CanonicalSchoolDay,
  SchoolBlockContentType,
  SchoolBlockDayOperation,
} from './canonicalSchoolTypes'

/**
 * ÉN delt, ren frontendmodell for canonical skoleinnhold. Bygges én gang og brukes av BÅDE
 * preview og (senere) persist — så de aldri får uavhengige tolkninger. Canonical draft er
 * ALLEREDE fag-/child-scopet: frontend re-matcher aldri audience, analyserer aldri sourceText
 * for fag, og bruker aldri regex/fuzzy. Ren funksjon: ingen React/Supabase/nettverk/sideeffekter,
 * muterer aldri input, deterministisk.
 */

export type CanonicalPlanItem = {
  /** Stabil canonical identitet — brukes til dedupe (og persist-identitet). */
  itemId: string
  sourceId: string
  sourceRef: string | null
  placement: CanonicalSchoolContentItem['placement']
  contentType: SchoolBlockContentType
  subjectKey: string | null
  start: string | null
  end: string | null
  /** Backend-resolvert audience — bevares strukturelt, re-matches ALDRI. */
  audienceEntries: unknown[]
  /** Synlige tekstlinjer (sourceText primært, ellers strukturerte seksjoner). Ingen slugs. */
  lines: string[]
  reviewRequired: boolean
}

export type CanonicalPlanTimetableRow = {
  key: string
  label: string
  start: string
  end: string
  /** Canonical subject-items plassert under denne økten (eksakt økt / eneste kandidat). */
  items: CanonicalPlanItem[]
}

export type CanonicalPlanSubjectGroup = {
  /** Fag-etikett (aldri subjectKey/slug). */
  label: string
  items: CanonicalPlanItem[]
}

export type CanonicalPlanReplacement = {
  title: string
  start: string | null
  end: string | null
}

export type CanonicalPlanDay = {
  weekday: WeekdayMonFri | null
  dayLabel: string
  op: SchoolBlockDayOperation['op']
  /** Dagsmerknad ved adjust_*; null ellers. */
  note: string | null
  /** Transformert (trimmet) timeplan; tom ved replace_day eller ukjent ukedag. */
  timetable: CanonicalPlanTimetableRow[]
  /** Erstatningsblokk ved replace_day; null ellers. */
  replacement: CanonicalPlanReplacement | null
  /** Fag-items uten sikker økt (flere kandidater / ingen match / replace_day) — beholder fag-label. */
  unplacedSubjectGroups: CanonicalPlanSubjectGroup[]
  /** Audience-items (allerede child-scopet av backend) — hver vist én gang, full struktur bevart. */
  audienceItems: CanonicalPlanItem[]
  /** Generelle dagsbeskjeder — «Ellers denne dagen». */
  generalMessages: CanonicalPlanItem[]
  reviewRequired: boolean
}

export type CanonicalSchoolImportPlan = {
  personId: string | null
  structureStatus: CanonicalSchoolContentDraft['structureStatus']
  days: CanonicalPlanDay[]
}

const WEEKDAY_LABELS: Record<WeekdayMonFri, string> = {
  0: 'Mandag',
  1: 'Tirsdag',
  2: 'Onsdag',
  3: 'Torsdag',
  4: 'Fredag',
}

const ACTIVITY_KIND_LABELS: Record<string, string> = {
  exam_day: 'Heldagsprøve',
  trip_day: 'Turdag',
  activity_day: 'Aktivitetsdag',
  free_day: 'Fri',
  other: 'Eget opplegg',
}

function isWeekdayMonFri(idx: string | null): idx is '0' | '1' | '2' | '3' | '4' {
  return idx === '0' || idx === '1' || idx === '2' || idx === '3' || idx === '4'
}

function normalizeForDedupe(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Synlige linjer for ett canonical item: sourceText primært, ellers strukturerte seksjoner. Ingen slugs. */
function itemLines(item: CanonicalSchoolContentItem): string[] {
  const src = item.sourceText?.trim()
  if (src) return [src]
  if (item.sections) {
    const lines = Object.values(item.sections)
      .flat()
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter((s) => s.length > 0)
    if (lines.length > 0) return lines
  }
  return []
}

function itemReviewRequired(item: CanonicalSchoolContentItem): boolean {
  return item.reviewFlags.length > 0
}

function toPlanItem(item: CanonicalSchoolContentItem): CanonicalPlanItem {
  return {
    itemId: item.itemId,
    sourceId: item.sourceId,
    sourceRef: item.sourceRef,
    placement: item.placement,
    contentType: item.contentType,
    subjectKey: item.subjectKey,
    start: item.start,
    end: item.end,
    audienceEntries: item.audienceEntries,
    lines: itemLines(item),
    reviewRequired: itemReviewRequired(item),
  }
}

/**
 * Dedupliserte plan-items (identitet: itemId; deretter normalisert tekst per linje). Bevarer full
 * item-struktur (audienceEntries m.m.) — ikke bare tekstlinjer. Tomme items (ingen linjer) droppes.
 */
function collectItems(items: CanonicalSchoolContentItem[]): CanonicalPlanItem[] {
  const seenItems = new Set<string>()
  const seenText = new Set<string>()
  const out: CanonicalPlanItem[] = []
  for (const item of items) {
    if (seenItems.has(item.itemId)) continue
    seenItems.add(item.itemId)
    const lines = itemLines(item).filter((line) => {
      const norm = normalizeForDedupe(line)
      if (!norm || seenText.has(norm)) return false
      seenText.add(norm)
      return true
    })
    if (lines.length === 0) continue
    out.push({ ...toPlanItem(item), lines })
  }
  return out
}

type OrdinaryLesson = {
  key: string
  label: string
  /** Vist start/slutt (kan være trimmet av adjust_*). */
  start: string
  end: string
  /** Opprinnelig økt-tid (for eksakt-økt-matching) + subjectKey. */
  origStart: string
  origEnd: string
  subjectKey: string
}

type DayOpResult = {
  op: SchoolBlockDayOperation['op']
  note: string | null
  timetable: OrdinaryLesson[]
  replacement: CanonicalPlanReplacement | null
}

/** Bruker dagsoperasjonen på timeplanen. Rene kopier — muterer aldri input. «HH:MM» → leksikografisk. */
function applyDayOperation(lessons: OrdinaryLesson[], op: SchoolBlockDayOperation): DayOpResult {
  if (op.op === 'replace_day') {
    const title = op.reason?.trim() || ACTIVITY_KIND_LABELS[op.activityKind] || 'Eget opplegg'
    return { op: 'replace_day', note: null, timetable: [], replacement: { title, start: op.effectiveStart, end: op.effectiveEnd } }
  }
  if (op.op === 'adjust_start') {
    const t = op.effectiveStart
    const timetable = lessons.filter((L) => L.end > t).map((L) => (L.start < t ? { ...L, start: t } : { ...L }))
    return { op: 'adjust_start', note: op.reason?.trim() || `Oppmøte kl. ${t}`, timetable, replacement: null }
  }
  if (op.op === 'adjust_end') {
    const t = op.effectiveEnd
    const timetable = lessons.filter((L) => L.start < t).map((L) => (L.end > t ? { ...L, end: t } : { ...L }))
    return { op: 'adjust_end', note: op.reason?.trim() || `Slutt kl. ${t}`, timetable, replacement: null }
  }
  return { op: 'none', note: null, timetable: lessons.map((L) => ({ ...L })), replacement: null }
}

/** Fag-etikett for et subject-item uten slug: subject → customLabel → katalog-oppslag → «Fag». */
function subjectGroupLabel(item: CanonicalSchoolContentItem, gradeBand: Parameters<typeof subjectLabelForKey>[0]): string {
  const subject = item.subject?.trim()
  if (subject) return subject
  const custom = item.customLabel?.trim()
  if (custom) return custom
  if (item.subjectKey) return subjectLabelForKey(gradeBand, item.subjectKey, item.customLabel ?? undefined)
  return 'Fag'
}

/**
 * Plasserer canonical subject-items mot barnets (transformerte) timeplan:
 *  A) eksakt økt (subjectKey + start/end matcher én økt) → under den økten,
 *  B) eksakt fag + nøyaktig én kandidat (uten sikker tid) → under den økten,
 *  C) flere kandidater / ingen match → egen faggruppe (beholder fag-label), aldri gjett.
 * Ingen fuzzy, ingen customLabel-fritekstmatch når subjectKey finnes, aldri tid alene.
 */
function placeSubjectItems(
  subjectItems: CanonicalSchoolContentItem[],
  timetable: OrdinaryLesson[],
  gradeBand: Parameters<typeof subjectLabelForKey>[0]
): { rowItems: Map<string, CanonicalPlanItem[]>; unplaced: CanonicalPlanSubjectGroup[] } {
  const rowItems = new Map<string, CanonicalPlanItem[]>()
  const unplacedByLabel = new Map<string, CanonicalPlanItem[]>()
  const seen = new Set<string>()

  const pushRow = (key: string, item: CanonicalSchoolContentItem) => {
    const list = rowItems.get(key) ?? []
    list.push(toPlanItem(item))
    rowItems.set(key, list)
  }
  const pushUnplaced = (label: string, item: CanonicalSchoolContentItem) => {
    const list = unplacedByLabel.get(label) ?? []
    list.push(toPlanItem(item))
    unplacedByLabel.set(label, list)
  }

  for (const item of subjectItems) {
    if (seen.has(item.itemId)) continue
    seen.add(item.itemId)

    const label = subjectGroupLabel(item, gradeBand)
    if (!item.subjectKey) {
      pushUnplaced(label, item)
      continue
    }
    const itemKey = normalizeSubjectKeyForMatch(item.subjectKey)
    const candidates = timetable.filter((L) => normalizeSubjectKeyForMatch(L.subjectKey) === itemKey)

    if (candidates.length === 0) {
      pushUnplaced(label, item) // fag finnes ikke i timeplanen denne dagen
      continue
    }
    // A: eksakt økt (subjectKey + start/end).
    if (item.start && item.end) {
      const exact = candidates.filter((L) => L.origStart === item.start && L.origEnd === item.end)
      if (exact.length === 1) {
        pushRow(exact[0]!.key, item)
        continue
      }
    }
    // B: eksakt fag, nøyaktig én kandidat (uten sikker tid).
    if (candidates.length === 1) {
      pushRow(candidates[0]!.key, item)
      continue
    }
    // C: flere kandidater — ikke gjett; egen faggruppe med review beholdt.
    pushUnplaced(label, item)
  }

  const unplaced: CanonicalPlanSubjectGroup[] = [...unplacedByLabel.entries()].map(([label, items]) => ({ label, items }))
  return { rowItems, unplaced }
}

function dayReviewRequired(day: CanonicalSchoolDay): boolean {
  if (day.reviewFlags.length > 0) return true
  const all = [...day.subjectItems, ...day.audienceItems, ...day.generalDayMessages]
  return all.some((i) => i.reviewFlags.length > 0)
}

/**
 * Bygger den delte planen fra et canonical draft + barnets lagrede timeplan. Autoritativ for
 * dagsscope, dayOperation, subject-/audience-/general-items og reviewFlags. Barnets timeplan er
 * kun grunnlag for vanlige dager (trimmes/erstattes av dayOperation) og muteres aldri.
 */
export function buildCanonicalSchoolImportPlan(args: {
  draft: CanonicalSchoolContentDraft
  child: Person | undefined
}): CanonicalSchoolImportPlan {
  const { draft, child } = args
  const gradeBand = child?.school?.gradeBand ?? '8-10'
  const days: CanonicalPlanDay[] = []

  for (const day of draft.days) {
    const weekday = isWeekdayMonFri(day.weekdayIndex) ? (Number(day.weekdayIndex) as WeekdayMonFri) : null
    const dayLabel = day.dayLabel?.trim() || (weekday != null ? WEEKDAY_LABELS[weekday] : 'Dag')

    // Grunnlag: barnets timeplan (kun ved kjent ukedag).
    const rows = weekday != null ? buildSchoolRowsForPlan(gradeBand, child?.school?.weekdays?.[weekday]) : []
    const ordinary: OrdinaryLesson[] = rows.map((r, i) => ({
      key: `${r.start}-${r.end}-${i}`,
      label: r.label,
      start: r.start,
      end: r.end,
      origStart: r.start,
      origEnd: r.end,
      subjectKey: r.lesson?.subjectKey ?? '',
    }))

    const applied = applyDayOperation(ordinary, day.dayOperation)

    // Fag-plassering skjer mot den TRANSFORMERTE timeplanen (skjulte økter er ikke kandidater).
    const { rowItems, unplaced } =
      applied.op === 'replace_day'
        ? // replace_day: ingen timeplan → alle subject-items som egne faggrupper.
          {
            rowItems: new Map<string, CanonicalPlanItem[]>(),
            unplaced: buildSubjectGroupsFlat(day.subjectItems, gradeBand),
          }
        : placeSubjectItems(day.subjectItems, applied.timetable, gradeBand)

    const timetable: CanonicalPlanTimetableRow[] = applied.timetable.map((L) => ({
      key: L.key,
      label: L.label,
      start: L.start,
      end: L.end,
      items: rowItems.get(L.key) ?? [],
    }))

    days.push({
      weekday,
      dayLabel,
      op: applied.op,
      note: applied.note,
      timetable,
      replacement: applied.replacement,
      unplacedSubjectGroups: unplaced,
      audienceItems: collectItems(day.audienceItems),
      generalMessages: collectItems(day.generalDayMessages),
      reviewRequired: dayReviewRequired(day),
    })
  }

  return { personId: draft.personId, structureStatus: draft.structureStatus, days }
}

/** Alle subject-items som egne faggrupper (brukt ved replace_day: ingen timeplan å plassere mot). */
function buildSubjectGroupsFlat(
  subjectItems: CanonicalSchoolContentItem[],
  gradeBand: Parameters<typeof subjectLabelForKey>[0]
): CanonicalPlanSubjectGroup[] {
  const byLabel = new Map<string, CanonicalPlanItem[]>()
  const seen = new Set<string>()
  for (const item of subjectItems) {
    if (seen.has(item.itemId)) continue
    seen.add(item.itemId)
    const label = subjectGroupLabel(item, gradeBand)
    const list = byLabel.get(label) ?? []
    list.push(toPlanItem(item))
    byLabel.set(label, list)
  }
  return [...byLabel.entries()].map(([label, items]) => ({ label, items }))
}

/** true når draften har minst én dag (ellers → fallback til schoolBlock/overlay). */
export function hasCanonicalSchoolDays(draft: CanonicalSchoolContentDraft | undefined): boolean {
  return !!draft && draft.days.length > 0
}
