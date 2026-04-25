import { supabase } from './supabaseClient'
import type {
  PortalEventPayload,
  PortalImportProposalBundle,
  PortalImportProvenance,
  PortalProposalItem,
  PortalSchoolProfileProposal,
  PortalSchoolWeekOverlayProposal,
  PortalSourceSystem,
  PortalTaskProposal,
  SchoolWeekOverlayDailyAction,
} from '../features/tankestrom/types'
import type {
  ChildSchoolDayPlan,
  ChildSchoolProfile,
  NorwegianGradeBand,
  SchoolLessonSlot,
  SchoolWeekOverlayAction,
  SchoolWeekOverlaySubjectUpdate,
  WeekdayMonFri,
} from '../types'
import { resolveSubjectKey } from './schoolContext'

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function isUuidLike(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

function isDateKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function isHm(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
}

function newBatchImportRunId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

const NORWEGIAN_GRADE_BANDS = new Set<NorwegianGradeBand>(['1-4', '5-7', '8-10', 'vg1', 'vg2', 'vg3'])

function parseHmRequired(x: unknown, fieldPath: string): string {
  const s = asString(x, fieldPath)
  if (!isHm(s)) throw new Error(`Ugyldig svar: ${fieldPath} må være HH:mm`)
  return s
}

function parseHmOptional(x: unknown, fieldPath: string): string | undefined {
  if (x === undefined || x === null) return undefined
  return parseHmRequired(x, fieldPath)
}

function firstLessonDisplayString(raw: Record<string, unknown>): string | undefined {
  for (const k of ['customLabel', 'label', 'displayLabel', 'subjectLabel'] as const) {
    const v = asOptionalString(raw[k])
    if (v !== undefined) return v
  }
  return undefined
}

function parseLessonSlot(raw: unknown, idx: number, wdLabel: string): SchoolLessonSlot {
  if (!isRecord(raw)) throw new Error(`Ugyldig svar: weekdays[${wdLabel}].lessons[${idx}]`)
  const rawSubjectKey = asString(raw.subjectKey, `weekdays[${wdLabel}].lessons[${idx}].subjectKey`)
  const resolved = resolveSubjectKey(rawSubjectKey)
  const subjectKey = resolved.subjectKey ?? rawSubjectKey.trim()
  const start = parseHmRequired(raw.start, `weekdays[${wdLabel}].lessons[${idx}].start`)
  const end = parseHmRequired(raw.end, `weekdays[${wdLabel}].lessons[${idx}].end`)
  const customLabel = firstLessonDisplayString(raw)
  const subRaw =
    asOptionalString(raw.lessonSubcategory) ??
    asOptionalString(raw.subcategory) ??
    asOptionalString(raw.track) ??
    asOptionalString(raw.selectedTrack)
  const out: SchoolLessonSlot = { subjectKey, start, end }
  if (customLabel !== undefined) out.customLabel = customLabel
  if (subRaw !== undefined && subRaw.trim()) out.lessonSubcategory = subRaw.trim()
  return out
}

function parseDayPlan(raw: unknown, wdLabel: string): ChildSchoolDayPlan {
  if (!isRecord(raw)) throw new Error(`Ugyldig svar: weekdays[${wdLabel}]`)
  const useSimple = raw.useSimpleDay
  if (useSimple !== true && useSimple !== false) {
    throw new Error(`Ugyldig svar: weekdays[${wdLabel}].useSimpleDay må være true eller false`)
  }
  if (useSimple === true) {
    const plan: ChildSchoolDayPlan = { useSimpleDay: true }
    const ss = parseHmOptional(raw.schoolStart, `weekdays[${wdLabel}].schoolStart`)
    const se = parseHmOptional(raw.schoolEnd, `weekdays[${wdLabel}].schoolEnd`)
    if (ss !== undefined) plan.schoolStart = ss
    if (se !== undefined) plan.schoolEnd = se
    return plan
  }
  if (!Array.isArray(raw.lessons) || raw.lessons.length === 0) {
    throw new Error(
      `Ugyldig svar: weekdays[${wdLabel}].lessons må være en ikke-tom liste når useSimpleDay er false`
    )
  }
  const lessons = raw.lessons.map((L: unknown, i: number) => parseLessonSlot(L, i, wdLabel))
  return { useSimpleDay: false, lessons }
}

/**
 * Validerer og parser `ChildSchoolProfile` fra Tankestrøm-JSON.
 * Eksportert for enhetstester.
 */
export function parseChildSchoolProfile(raw: unknown, ctx: string): ChildSchoolProfile {
  if (!isRecord(raw)) throw new Error(`Ugyldig svar: ${ctx} må være et objekt`)
  const gradeBand = asString(raw.gradeBand, `${ctx}.gradeBand`) as NorwegianGradeBand
  if (!NORWEGIAN_GRADE_BANDS.has(gradeBand)) {
    throw new Error(`Ugyldig svar: ${ctx}.gradeBand må være 1-4, 5-7, 8-10, vg1, vg2 eller vg3`)
  }
  const weekdays: Partial<Record<WeekdayMonFri, ChildSchoolDayPlan>> = {}
  if (raw.weekdays !== undefined && raw.weekdays !== null) {
    if (!isRecord(raw.weekdays)) throw new Error(`Ugyldig svar: ${ctx}.weekdays må være et objekt`)
    for (const key of Object.keys(raw.weekdays)) {
      const n = Number(key)
      if (!Number.isInteger(n) || n < 0 || n > 4) {
        throw new Error(`Ugyldig svar: ${ctx}.weekdays — ukedag "${key}" er ugyldig (bruk 0–4, man–fre)`)
      }
      weekdays[n as WeekdayMonFri] = parseDayPlan((raw.weekdays as Record<string, unknown>)[key], key)
    }
  }
  return { gradeBand, weekdays }
}

function assertBundleItemKindsCoherent(items: PortalProposalItem[]): void {
  const hasSchool = items.some((i) => i.kind === 'school_profile')
  const hasCalendar = items.some((i) => i.kind === 'event' || i.kind === 'task')
  if (hasSchool && hasCalendar) {
    throw new Error(
      'Ugyldig svar: timeplan (school_profile) kan ikke kombineres med hendelser eller gjøremål i samme svar.'
    )
  }
}

function parseTopLevelSchoolProfileToItem(
  raw: unknown,
  _provenance: PortalImportProvenance
): PortalSchoolProfileProposal {
  if (!isRecord(raw)) throw new Error('Ugyldig svar: schoolProfile må være et objekt')
  const hasNestedProfile = isRecord(raw.profile) && typeof raw.profile.gradeBand === 'string'
  let profilePayload: unknown
  let suggestedPersonId: string | undefined
  let proposalId: string
  let sourceId: string
  let originalSourceType: string
  let confidence: number
  let externalRef: string | undefined
  let calendarOwnerUserId: string | undefined

  if (hasNestedProfile) {
    profilePayload = raw.profile
    suggestedPersonId = asOptionalString(raw.suggestedPersonId)
    const pid = asOptionalString(raw.proposalId)
    proposalId = pid && isUuidLike(pid) ? pid : newBatchImportRunId()
    sourceId = asOptionalString(raw.sourceId) ?? 'tankestrom-school-profile'
    originalSourceType = asOptionalString(raw.originalSourceType) ?? 'school_timetable'
    if (raw.confidence !== undefined && raw.confidence !== null) {
      confidence = asNumber01(raw.confidence, 'schoolProfile.confidence')
    } else {
      confidence = 1
    }
    externalRef = asOptionalString(raw.externalRef)
    calendarOwnerUserId = asOptionalString(raw.calendarOwnerUserId)
  } else {
    profilePayload = raw
    proposalId = newBatchImportRunId()
    sourceId = 'tankestrom-school-profile'
    originalSourceType = 'school_timetable'
    confidence = 1
    suggestedPersonId = asOptionalString(raw.suggestedPersonId)
    externalRef = asOptionalString(raw.externalRef)
    calendarOwnerUserId = asOptionalString(raw.calendarOwnerUserId)
  }

  const schoolProfile = parseChildSchoolProfile(profilePayload, 'schoolProfile')
  return {
    proposalId,
    kind: 'school_profile',
    sourceId,
    originalSourceType,
    confidence,
    externalRef,
    calendarOwnerUserId,
    schoolProfile,
    suggestedPersonId,
  }
}

function asString(x: unknown, field: string): string {
  if (typeof x !== 'string' || !x.trim()) throw new Error(`Ugyldig svar: mangler eller tom streng for ${field}`)
  return x.trim()
}

function asOptionalString(x: unknown): string | undefined {
  if (x === undefined || x === null) return undefined
  if (typeof x !== 'string') return undefined
  const t = x.trim()
  return t.length ? t : undefined
}

function asNumber01(x: unknown, field: string): number {
  if (typeof x !== 'number' || Number.isNaN(x)) throw new Error(`Ugyldig svar: ${field} må være et tall`)
  if (x < 0 || x > 1) throw new Error(`Ugyldig svar: ${field} må være mellom 0 og 1`)
  return x
}

function parseProvenance(raw: unknown): PortalImportProposalBundle['provenance'] {
  if (!isRecord(raw)) throw new Error('Ugyldig svar: provenance mangler')
  const sourceSystem = asString(raw.sourceSystem, 'provenance.sourceSystem') as PortalSourceSystem
  if (!['tankestrom', 'mail_organizer', 'other'].includes(sourceSystem)) {
    throw new Error('Ugyldig svar: provenance.sourceSystem')
  }
  return {
    sourceSystem,
    sourceType: asString(raw.sourceType, 'provenance.sourceType'),
    generatorVersion: asOptionalString(raw.generatorVersion),
    generatedAt: asString(raw.generatedAt, 'provenance.generatedAt'),
    importRunId: asString(raw.importRunId, 'provenance.importRunId'),
  }
}

/** Tekst fra ukjente felttyper (streng eller liste av strenger). */
function optionalTextFromUnknown(x: unknown): string | undefined {
  if (x === undefined || x === null) return undefined
  if (typeof x === 'string') {
    const t = x.trim()
    return t.length ? t : undefined
  }
  if (Array.isArray(x)) {
    const parts = x
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter((s) => s.length > 0)
    return parts.length ? parts.join('\n') : undefined
  }
  return undefined
}

function dedupeNoteBlocks(blocks: string[]): string[] {
  return blocks.filter((line, idx, arr) => {
    const n = line.trim().toLocaleLowerCase('nb-NO')
    return arr.findIndex((x) => x.trim().toLocaleLowerCase('nb-NO') === n) === idx
  })
}

const TASK_DETAIL_FIELD_KEYS = [
  'notes',
  'description',
  'details',
  'detailText',
  'body',
  'content',
  'instruction',
  'instructions',
  'homework',
  'homeworkText',
  'assignment',
  'assignmentText',
  'taskDescription',
  'message',
  'summary',
] as const

const TASK_METADATA_TEXT_KEYS = ['sourceExcerpt', 'aiRationale', 'rationale', 'sourceText'] as const
const TASK_METADATA_EXTRA_KEYS = [
  'homework',
  'instructions',
  'details',
  'description',
  'assignment',
] as const

function collectTaskDetailTextBlocks(raw: Record<string, unknown>): string[] {
  const out: string[] = []
  for (const k of TASK_DETAIL_FIELD_KEYS) {
    const v = optionalTextFromUnknown(raw[k])
    if (v) out.push(v)
  }
  if (raw.metadata !== undefined && raw.metadata !== null && isRecord(raw.metadata)) {
    const meta = raw.metadata
    for (const k of TASK_METADATA_TEXT_KEYS) {
      const v = optionalTextFromUnknown(meta[k])
      if (v) out.push(v)
    }
    for (const k of TASK_METADATA_EXTRA_KEYS) {
      const v = optionalTextFromUnknown(meta[k])
      if (v) out.push(v)
    }
  }
  return dedupeNoteBlocks(out)
}

function parseEventPayload(raw: unknown): PortalEventPayload {
  if (!isRecord(raw)) throw new Error('Ugyldig svar: event-payload mangler')
  const date = asString(raw.date, 'event.date')
  if (!isDateKey(date)) throw new Error('Ugyldig svar: event.date må være YYYY-MM-DD')
  const start = asString(raw.start, 'event.start')
  const end = asString(raw.end, 'event.end')
  if (!isHm(start) || !isHm(end)) throw new Error('Ugyldig svar: start/slutt må være HH:mm')
  const personId = asString(raw.personId, 'event.personId')
  const title = asString(raw.title, 'event.title')
  const out: PortalEventPayload = {
    date,
    personId,
    title,
    start,
    end,
  }
  const notes = asOptionalString(raw.notes)
  if (notes !== undefined) out.notes = notes
  const location = asOptionalString(raw.location)
  if (location !== undefined) out.location = location
  if (raw.reminderMinutes !== undefined && raw.reminderMinutes !== null) {
    if (typeof raw.reminderMinutes !== 'number' || !Number.isInteger(raw.reminderMinutes)) {
      throw new Error('Ugyldig svar: reminderMinutes')
    }
    out.reminderMinutes = raw.reminderMinutes
  }
  const rg = asOptionalString(raw.recurrenceGroupId)
  if (rg !== undefined) out.recurrenceGroupId = rg
  if (raw.metadata !== undefined && raw.metadata !== null) {
    if (!isRecord(raw.metadata)) throw new Error('Ugyldig svar: event.metadata')
    out.metadata = { ...raw.metadata }
  }
  return out
}

function parseTaskPayload(raw: unknown): PortalTaskProposal['task'] {
  if (!isRecord(raw)) throw new Error('Ugyldig svar: task-payload mangler')
  const date = asString(raw.date, 'task.date')
  if (!isDateKey(date)) throw new Error('Ugyldig svar: task.date må være YYYY-MM-DD')
  const title = asString(raw.title, 'task.title')
  const out: PortalTaskProposal['task'] = { date, title }
  const detailBlocks = collectTaskDetailTextBlocks(raw)
  if (detailBlocks.length > 0) {
    out.notes = detailBlocks.join('\n\n')
  }
  if (import.meta.env.DEV || import.meta.env.VITE_DEBUG_SCHOOL_IMPORT === 'true') {
    console.debug('[tankestrom parse task payload]', {
      taskProposalRawFields: Object.keys(raw).sort(),
      metadataFieldKeys:
        raw.metadata !== undefined && raw.metadata !== null && isRecord(raw.metadata)
          ? Object.keys(raw.metadata).sort()
          : [],
      parsedTaskNotes: out.notes,
    })
  }
  const due = asOptionalString(raw.dueTime)
  if (due !== undefined) {
    if (!isHm(due)) throw new Error('Ugyldig svar: task.dueTime må være HH:mm')
    out.dueTime = due
  }
  const assign = asOptionalString(raw.assignedToPersonId)
  if (assign !== undefined) out.assignedToPersonId = assign
  const child = asOptionalString(raw.childPersonId)
  if (child !== undefined) out.childPersonId = child
  if (raw.showInMonthView !== undefined && raw.showInMonthView !== null) {
    if (typeof raw.showInMonthView !== 'boolean') throw new Error('Ugyldig svar: task.showInMonthView')
    out.showInMonthView = raw.showInMonthView
  }
  return out
}

function parseStringArray(raw: unknown, fieldPath: string): string[] {
  if (!Array.isArray(raw)) throw new Error(`Ugyldig svar: ${fieldPath} må være en liste`)
  return raw
    .map((v, idx) => {
      if (typeof v !== 'string') throw new Error(`Ugyldig svar: ${fieldPath}[${idx}] må være tekst`)
      return v.trim()
    })
    .filter((v) => v.length > 0)
}

function parseOverlaySections(raw: unknown, fieldPath: string): Record<string, string[]> | undefined {
  if (raw == null) return undefined
  if (!isRecord(raw)) throw new Error(`Ugyldig svar: ${fieldPath} må være et objekt`)
  const out: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(raw)) {
    out[key] = parseStringArray(value, `${fieldPath}.${key}`)
  }
  return out
}

function parseOverlaySubjectUpdate(raw: unknown, fieldPath: string): SchoolWeekOverlaySubjectUpdate {
  if (!isRecord(raw)) throw new Error(`Ugyldig svar: ${fieldPath} må være et objekt`)
  const out: SchoolWeekOverlaySubjectUpdate = {
    subjectKey: asString(raw.subjectKey, `${fieldPath}.subjectKey`),
  }
  const customLabel = asOptionalString(raw.customLabel)
  if (customLabel !== undefined) out.customLabel = customLabel
  const sections = parseOverlaySections(raw.sections, `${fieldPath}.sections`)
  if (sections) out.sections = sections
  return out
}

function parseOverlayAction(raw: unknown, fieldPath: string): SchoolWeekOverlayAction {
  const action = asString(raw, fieldPath)
  if (
    action !== 'replace_school_block' &&
    action !== 'remove_school_block' &&
    action !== 'enrich_existing_school_block' &&
    action !== 'none'
  ) {
    throw new Error(`Ugyldig svar: ${fieldPath} har ukjent action "${action}"`)
  }
  return action
}

function parseOverlayDailyAction(raw: unknown, fieldPath: string): SchoolWeekOverlayDailyAction {
  if (!isRecord(raw)) throw new Error(`Ugyldig svar: ${fieldPath} må være et objekt`)
  const action = parseOverlayAction(raw.action, `${fieldPath}.action`)
  const reason = asOptionalString(raw.reason)
  const summary = asOptionalString(raw.summary)
  const updatesRaw = raw.subjectUpdates
  if (!Array.isArray(updatesRaw)) {
    throw new Error(`Ugyldig svar: ${fieldPath}.subjectUpdates må være en liste`)
  }
  const subjectUpdates = updatesRaw.map((entry, idx) =>
    parseOverlaySubjectUpdate(entry, `${fieldPath}.subjectUpdates[${idx}]`)
  )
  return { action, reason, summary, subjectUpdates }
}

function parseTopLevelSchoolWeekOverlayProposal(raw: unknown): PortalSchoolWeekOverlayProposal {
  if (!isRecord(raw)) throw new Error('Ugyldig svar: schoolWeekOverlayProposal må være et objekt')
  const proposalId = asString(raw.proposalId, 'schoolWeekOverlayProposal.proposalId')
  const kind = asString(raw.kind, 'schoolWeekOverlayProposal.kind')
  if (kind !== 'school_week_overlay') {
    throw new Error(`Ugyldig svar: schoolWeekOverlayProposal.kind må være "school_week_overlay"`)
  }
  const schemaVersion = asString(raw.schemaVersion, 'schoolWeekOverlayProposal.schemaVersion')
  if (schemaVersion !== '1.0.0') {
    throw new Error(`Ugyldig svar: schoolWeekOverlayProposal.schemaVersion må være "1.0.0"`)
  }
  const confidence = asNumber01(raw.confidence, 'schoolWeekOverlayProposal.confidence')
  const originalSourceType = asString(raw.originalSourceType, 'schoolWeekOverlayProposal.originalSourceType')
  const weeklySummary = raw.weeklySummary == null ? [] : parseStringArray(raw.weeklySummary, 'schoolWeekOverlayProposal.weeklySummary')
  const out: PortalSchoolWeekOverlayProposal = {
    proposalId,
    kind: 'school_week_overlay',
    schemaVersion: '1.0.0',
    confidence,
    originalSourceType,
    weeklySummary,
    dailyActions: {},
  }
  const sourceTitle = asOptionalString(raw.sourceTitle)
  if (sourceTitle !== undefined) out.sourceTitle = sourceTitle
  if (raw.weekNumber != null) {
    if (typeof raw.weekNumber !== 'number' || !Number.isInteger(raw.weekNumber) || raw.weekNumber < 1 || raw.weekNumber > 53) {
      throw new Error('Ugyldig svar: schoolWeekOverlayProposal.weekNumber må være heltall 1–53')
    }
    out.weekNumber = raw.weekNumber
  }
  const classLabel = asOptionalString(raw.classLabel)
  if (classLabel !== undefined) out.classLabel = classLabel
  if (raw.languageTrack != null) {
    if (!isRecord(raw.languageTrack)) throw new Error('Ugyldig svar: schoolWeekOverlayProposal.languageTrack')
    out.languageTrack = {
      resolvedTrack: asOptionalString(raw.languageTrack.resolvedTrack),
      confidence:
        raw.languageTrack.confidence == null
          ? undefined
          : asNumber01(raw.languageTrack.confidence, 'schoolWeekOverlayProposal.languageTrack.confidence'),
      reason: asOptionalString(raw.languageTrack.reason),
    }
  }
  if (raw.profileMatch != null) {
    if (!isRecord(raw.profileMatch)) throw new Error('Ugyldig svar: schoolWeekOverlayProposal.profileMatch')
    out.profileMatch = {
      confidence:
        raw.profileMatch.confidence == null
          ? undefined
          : asNumber01(raw.profileMatch.confidence, 'schoolWeekOverlayProposal.profileMatch.confidence'),
      reason: asOptionalString(raw.profileMatch.reason),
    }
  }
  if (raw.dailyActions != null) {
    if (!isRecord(raw.dailyActions)) throw new Error('Ugyldig svar: schoolWeekOverlayProposal.dailyActions må være et objekt')
    const parsed: Partial<Record<number, SchoolWeekOverlayDailyAction>> = {}
    for (const [dayKey, value] of Object.entries(raw.dailyActions)) {
      const day = Number(dayKey)
      if (!Number.isInteger(day) || day < 0 || day > 6) {
        throw new Error(`Ugyldig svar: schoolWeekOverlayProposal.dailyActions["${dayKey}"] må være ukedag 0–6`)
      }
      parsed[day] = parseOverlayDailyAction(value, `schoolWeekOverlayProposal.dailyActions["${dayKey}"]`)
    }
    out.dailyActions = parsed
  }
  return out
}

/** Parser ett forslag til event, task eller school_profile. */
function tryParseProposalItem(raw: unknown, index: number): PortalProposalItem {
  if (!isRecord(raw)) throw new Error(`Forslag #${index + 1}: mangler felter`)
  const proposalId = asString(raw.proposalId, 'proposalId')
  if (!isUuidLike(proposalId)) throw new Error(`Forslag #${index + 1}: proposalId må være en UUID`)
  const kindRaw = asString(raw.kind, 'kind')
  if (kindRaw !== 'event' && kindRaw !== 'task' && kindRaw !== 'school_profile') {
    throw new Error(`Forslag #${index + 1}: ukjent kind "${kindRaw}"`)
  }
  const sourceId = asString(raw.sourceId, 'sourceId')
  const originalSourceType = asString(raw.originalSourceType, 'originalSourceType')
  const confidence = asNumber01(raw.confidence, 'confidence')
  const externalRef = asOptionalString(raw.externalRef)
  const calendarOwnerUserId = asOptionalString(raw.calendarOwnerUserId)
  if (kindRaw === 'school_profile') {
    const spRaw = raw.schoolProfile ?? raw.profile
    if (spRaw === undefined || spRaw === null) {
      throw new Error(`Forslag #${index + 1}: school_profile mangler schoolProfile (eller profile)`)
    }
    const schoolProfile = parseChildSchoolProfile(spRaw, `forslag #${index + 1}.schoolProfile`)
    const suggestedPersonId = asOptionalString(raw.suggestedPersonId)
    return {
      proposalId,
      kind: 'school_profile',
      sourceId,
      originalSourceType,
      confidence,
      externalRef,
      calendarOwnerUserId,
      schoolProfile,
      suggestedPersonId,
    }
  }
  if (kindRaw === 'task') {
    if (!isRecord(raw.task)) {
      throw new Error(`Forslag #${index + 1}: task må være et objekt`)
    }
    const mergedTask: Record<string, unknown> = { ...raw.task }
    const liftFromItemKeys = [...TASK_DETAIL_FIELD_KEYS] as readonly string[]
    for (const k of liftFromItemKeys) {
      if (mergedTask[k] === undefined && k in raw) {
        mergedTask[k] = raw[k]
      }
    }
    return {
      proposalId,
      kind: 'task',
      sourceId,
      originalSourceType,
      confidence,
      externalRef,
      calendarOwnerUserId,
      task: parseTaskPayload(mergedTask),
    }
  }
  return {
    proposalId,
    kind: 'event',
    sourceId,
    originalSourceType,
    confidence,
    externalRef,
    calendarOwnerUserId,
    event: parseEventPayload(raw.event),
  }
}

/**
 * Toppnivå timeplan når `items` er tom.
 * Prioritet: `schoolProfile` (bakoverkompat) → `schoolProfileProposal` (Tankestrøm).
 */
function readTopLevelSchoolProfilePayload(data: Record<string, unknown>): unknown | undefined {
  if (data.schoolProfile != null && data.schoolProfile !== undefined) {
    return data.schoolProfile
  }
  if (data.schoolProfileProposal != null && data.schoolProfileProposal !== undefined) {
    return data.schoolProfileProposal
  }
  return undefined
}

/**
 * Validerer og parser JSON fra analyse-backend til typet bundle.
 */
export function parsePortalImportProposalBundle(data: unknown): PortalImportProposalBundle {
  if (!isRecord(data)) throw new Error('Ugyldig svar: forventet JSON-objekt')
  if (data.schemaVersion !== '1.0.0') {
    throw new Error(`Ustøttet schemaVersion: ${String(data.schemaVersion)}`)
  }
  const provenance = parseProvenance(data.provenance)
  const items: PortalProposalItem[] = []
  if (Array.isArray(data.items)) {
    for (let i = 0; i < data.items.length; i++) {
      try {
        items.push(tryParseProposalItem(data.items[i], i))
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Ukjent feil'
        throw new Error(msg.startsWith('Forslag #') ? msg : `Forslag #${i + 1}: ${msg}`)
      }
    }
  }

  /** Tankestrøm bruker `schoolProfileProposal`; eldre klienter brukte `schoolProfile`. Begge støttes. */
  const topLevelSchoolPayload = readTopLevelSchoolProfilePayload(data)
  if (items.length === 0 && topLevelSchoolPayload !== undefined) {
    items.push(parseTopLevelSchoolProfileToItem(topLevelSchoolPayload, provenance))
  }

  const schoolWeekOverlayProposal =
    data.schoolWeekOverlayProposal == null ? undefined : parseTopLevelSchoolWeekOverlayProposal(data.schoolWeekOverlayProposal)

  if (items.length === 0 && !schoolWeekOverlayProposal) {
    throw new Error(
      'Ugyldig svar: items må inneholde minst ett forslag, eller toppnivåfeltet schoolProfile / schoolProfileProposal / schoolWeekOverlayProposal må være satt'
    )
  }
  assertBundleItemKindsCoherent(items)
  return { schemaVersion: '1.0.0', provenance, items, schoolWeekOverlayProposal }
}

type AnalyzePayload =
  | { kind: 'file'; file: File }
  | { kind: 'text'; text: string }

async function analyzeWithTankestrom(payload: AnalyzePayload): Promise<PortalImportProposalBundle> {
  const urlRaw = import.meta.env.VITE_TANKESTROM_ANALYZE_URL
  const url = typeof urlRaw === 'string' ? urlRaw.trim() : ''
  if (!url) {
    throw new Error(
      'Tankestrøm er ikke konfigurert. Sett miljøvariabelen VITE_TANKESTROM_ANALYZE_URL til analyse-API-ets URL.'
    )
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) {
    throw new Error('Du må være innlogget for å analysere dokumenter.')
  }

  let body: BodyInit
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (payload.kind === 'file') {
    const form = new FormData()
    form.append('file', payload.file)
    body = form
  } else {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify({ text: payload.text })
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (
      msg.toLowerCase().includes('failed to fetch') ||
      msg.toLowerCase().includes('networkerror') ||
      msg.toLowerCase().includes('network request failed')
    ) {
      throw new Error(
        `Kunne ikke kontakte Tankestrøm-analyse (${url}). Sjekk at URL er riktig, at tjenesten er oppe, og at CORS/HTTPS tillater kall fra denne appen.`
      )
    }
    throw err instanceof Error ? err : new Error('Kunne ikke kontakte Tankestrøm-analyse.')
  }

  const text = await res.text()
  let json: unknown
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    throw new Error(res.ok ? 'Ugyldig JSON fra server' : `Serverfeil (${res.status}): kunne ikke lese svar`)
  }

  if (!res.ok) {
    const detail =
      isRecord(json) && typeof json.error === 'string'
        ? json.error
        : isRecord(json) && typeof json.message === 'string'
          ? json.message
          : text.slice(0, 200)
    throw new Error(`Analyse feilet (${res.status}): ${detail}`)
  }

  return parsePortalImportProposalBundle(json)
}

/**
 * Slår sammen flere analyse-svar (én POST per fil) til én bundle for import-steget.
 * Ny `importRunId` knytter hele batchen til én import-økt.
 */
export function mergePortalImportProposalBundles(bundles: PortalImportProposalBundle[]): PortalImportProposalBundle {
  if (bundles.length === 0) {
    throw new Error('Ingen analyseresultater å slå sammen.')
  }
  if (bundles.length === 1) {
    return bundles[0]!
  }
  const items = bundles.flatMap((b) => b.items)
  const overlay = bundles.map((b) => b.schoolWeekOverlayProposal).find((p) => p != null)
  assertBundleItemKindsCoherent(items)
  const base = bundles[0]!.provenance
  return {
    schemaVersion: '1.0.0',
    provenance: {
      ...base,
      importRunId: newBatchImportRunId(),
      sourceType: `${base.sourceType} · ${bundles.length} filer`,
    },
    items,
    schoolWeekOverlayProposal: overlay,
  }
}

/**
 * Laster opp fil til analyse-backend og returnerer typet forslagspakke.
 * Krever VITE_TANKESTROM_ANALYZE_URL og innlogget Supabase-session.
 */
export async function analyzeDocumentWithTankestrom(file: File): Promise<PortalImportProposalBundle> {
  return analyzeWithTankestrom({ kind: 'file', file })
}

/** Analyse av ren tekst (MVP) med samme backend-endepunkt og svarformat. */
export async function analyzeTextWithTankestrom(text: string): Promise<PortalImportProposalBundle> {
  const normalized = text.trim()
  if (!normalized) throw new Error('Skriv inn tekst før du analyserer.')
  return analyzeWithTankestrom({ kind: 'text', text: normalized })
}
