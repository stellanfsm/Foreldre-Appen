import { supabase } from './supabaseClient'
import type {
  PortalEventPayload,
  PortalImportProposalBundle,
  PortalImportProvenance,
  PortalProposalItem,
  PortalSchoolProfileProposal,
  PortalSchoolWeekOverlayProposal,
  PortalSecondaryImportCandidate,
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
import { normalizeTaskIntent } from './taskIntent'
import { normalizeImportTime, rawEventTimeInput } from './tankestromImportTime'

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

/** Kalender-person fra analyse: null/undefined/tom/ugyldig type → tom streng (ikke kast). */
function asEventPersonId(raw: unknown): string {
  if (raw === undefined || raw === null) return ''
  if (typeof raw !== 'string') return ''
  return raw.trim()
}

function mergeTankestromEventTopLevelIntoMetadata(
  metadata: Record<string, unknown>,
  raw: Record<string, unknown>
): void {
  const pms = raw.personMatchStatus
  if (typeof pms === 'string' && pms.trim()) {
    metadata.personMatchStatus = pms.trim()
  }
  const dep = raw.documentExtractedPersonName
  if (typeof dep === 'string' && dep.trim()) {
    metadata.documentExtractedPersonName = dep.trim()
  }
  const sk = raw.sourceKind
  if (typeof sk === 'string' && sk.trim()) {
    metadata.sourceKind = sk.trim()
  }
  if (typeof raw.requiresPerson === 'boolean') {
    metadata.requiresPerson = raw.requiresPerson
  }
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
  const startRaw = rawEventTimeInput(raw.start)
  const endRaw = rawEventTimeInput(raw.end)
  const startTime = startRaw !== undefined ? normalizeImportTime(startRaw) : null
  const endTime = endRaw !== undefined ? normalizeImportTime(endRaw) : null

  const personId = asEventPersonId(raw.personId)
  const title = asString(raw.title, 'event.title')
  const out: PortalEventPayload = {
    date,
    personId,
    title,
    start: startTime ?? '',
    end: endTime ?? '',
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
  const meta: Record<string, unknown> =
    raw.metadata !== undefined && raw.metadata !== null
      ? isRecord(raw.metadata)
        ? { ...raw.metadata }
        : (() => {
            throw new Error('Ugyldig svar: event.metadata')
          })()
      : {}
  mergeTankestromEventTopLevelIntoMetadata(meta, raw)

  if (startTime !== null && endTime !== null) {
    delete meta.requiresManualTimeReview
    delete meta.startTimeSource
    delete meta.endTimeSource
    delete meta.inferredEndTime
  } else {
    if (startTime === null) {
      meta.startTimeSource = 'missing_or_unreadable'
    }
    if (endTime === null) {
      meta.inferredEndTime = false
      meta.endTimeSource = 'missing_or_unreadable'
    }
    meta.requiresManualTimeReview = true
  }

  if (Object.keys(meta).length > 0) out.metadata = meta
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
  const meta = isRecord(raw.metadata) ? raw.metadata : null
  const tiRaw = raw.taskIntent ?? meta?.taskIntent
  const ti = normalizeTaskIntent(tiRaw)
  if (ti) out.taskIntent = ti
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
  const evRaw = raw.event
  if (!isRecord(evRaw)) {
    throw new Error(`Forslag #${index + 1}: event må være et objekt`)
  }
  const mergedEvent: Record<string, unknown> = { ...evRaw }
  for (const k of ['personMatchStatus', 'documentExtractedPersonName', 'sourceKind', 'requiresPerson'] as const) {
    if (mergedEvent[k] === undefined && k in raw) {
      mergedEvent[k] = raw[k]
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
    event: parseEventPayload(mergedEvent),
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

/** Gjenkjenner analyse-«bundle» før schemaVersion er injisert eller etter JSON-unwrap. */
function looksLikeImportBundlePayload(r: Record<string, unknown>): boolean {
  if (isRecord(r.provenance)) return true
  if (Array.isArray(r.items)) return true
  if (r.schoolWeekOverlayProposal != null) return true
  if (readTopLevelSchoolProfilePayload(r) !== undefined) return true
  return false
}

const TANKESTROM_ANALYZE_WRAP_KEYS = [
  'bundle',
  'result',
  'data',
  'payload',
  'output',
  'importProposal',
  'proposalBundle',
  'response',
  'body',
  'content',
] as const

/**
 * Pakker ut vanlige API-konvolutter. Støtter også kjeder av enkelt-nøkkel-objekter
 * (f.eks. { importProposal: { … } }) som ellers ikke matcher `looksLikeImportBundlePayload` på rot.
 */
function unwrapTankestromAnalyzeJson(json: unknown): unknown {
  let cur: unknown = json
  for (let depth = 0; depth < 10; depth++) {
    if (!isRecord(cur)) return cur
    if (looksLikeImportBundlePayload(cur)) return cur

    let next: Record<string, unknown> | undefined
    for (const k of TANKESTROM_ANALYZE_WRAP_KEYS) {
      const v = cur[k]
      if (isRecord(v) && looksLikeImportBundlePayload(v)) {
        next = v
        break
      }
    }
    if (!next) {
      const keys = Object.keys(cur)
      if (keys.length === 1) {
        const only = cur[keys[0]!]
        if (isRecord(only)) next = only
      }
    }
    if (!next) return cur
    cur = next
  }
  return cur
}

function summarizeTankestromJsonShape(x: unknown, maxKeys = 14): unknown {
  if (x === null) return 'null'
  if (!isRecord(x)) return typeof x
  const keys = Object.keys(x).sort()
  const out: Record<string, unknown> = { keys: keys.slice(0, maxKeys) }
  for (const k of keys.slice(0, maxKeys)) {
    const v = x[k]
    if (v === null) out[k] = 'null'
    else if (Array.isArray(v)) out[k] = `array(${v.length})`
    else if (isRecord(v)) out[k] = { keys: Object.keys(v).sort().slice(0, 12) }
    else out[k] = typeof v
  }
  return out
}

/**
 * Gjør HTTP-svar fra analyse-API kompatibelt med `parsePortalImportProposalBundle`.
 * Tekstmodus (JSON body) returneres ofte uten `schemaVersion` eller innpakket i `data` / `result`.
 */
export function normalizeTankestromAnalyzeHttpJson(json: unknown): unknown {
  const unwrapped = unwrapTankestromAnalyzeJson(json)
  if (!isRecord(unwrapped)) return unwrapped
  let r: Record<string, unknown> = { ...unwrapped }
  if (!Array.isArray(r.items) && Array.isArray(r.proposals)) {
    const { proposals, ...rest } = r
    r = { ...rest, items: proposals as unknown[] }
  }
  const sv = r.schemaVersion
  if (sv === '1.0.0') return r
  if (sv !== undefined && sv !== null && String(sv).trim() !== '') return r
  if (!looksLikeImportBundlePayload(r)) return r
  return { ...r, schemaVersion: '1.0.0' }
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
  const secondaryCandidates = parseSecondaryCandidatesField(data)
  return { schemaVersion: '1.0.0', provenance, items, schoolWeekOverlayProposal, secondaryCandidates }
}

function tryParseSecondaryImportCandidate(raw: unknown, index: number): PortalSecondaryImportCandidate | null {
  if (!isRecord(raw)) return null
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  if (title.length < 4 || title.length > 220) return null
  const candidateId =
    typeof raw.candidateId === 'string' && raw.candidateId.trim().length > 0
      ? raw.candidateId.trim()
      : typeof raw.id === 'string' && raw.id.trim().length > 0
        ? raw.id.trim()
        : `api-secondary-${index}`
  const confRaw = raw.confidence
  const conf =
    typeof confRaw === 'number' && Number.isFinite(confRaw)
      ? confRaw
      : typeof confRaw === 'string' && confRaw.trim() !== ''
        ? Number(confRaw)
        : NaN
  const confidence = Number.isFinite(conf) ? conf : 0.48
  if (confidence < 0.22 || confidence > 0.94) return null
  const skRaw = raw.suggestedKind
  const suggestedKind = skRaw === 'task' || skRaw === 'event' ? skRaw : 'event'
  const date = typeof raw.date === 'string' && isDateKey(raw.date) ? raw.date : undefined
  const notes = typeof raw.notes === 'string' ? raw.notes.trim().slice(0, 2000) : undefined
  const summary = typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 500) : undefined
  const sourceProposalId =
    typeof raw.sourceProposalId === 'string' && raw.sourceProposalId.trim().length > 0
      ? raw.sourceProposalId.trim()
      : undefined
  return {
    candidateId,
    title,
    confidence,
    suggestedKind,
    date,
    notes,
    summary,
    sourceProposalId,
  }
}

function parseSecondaryCandidatesField(data: Record<string, unknown>): PortalSecondaryImportCandidate[] | undefined {
  const raw = data.secondaryCandidates ?? data.maybeRelevant ?? data.maybeRelevantCandidates
  if (!Array.isArray(raw)) return undefined
  const out: PortalSecondaryImportCandidate[] = []
  for (let i = 0; i < raw.length; i++) {
    const c = tryParseSecondaryImportCandidate(raw[i], i)
    if (c) out.push(c)
  }
  return out.length > 0 ? out.slice(0, 12) : undefined
}

type AnalyzePayload =
  | { kind: 'file'; file: File }
  | { kind: 'text'; text: string }

/**
 * Bygger brukervennlig feilmelding fra Tankestrøm-analyse (HTTP-feil eller payload.ok === false).
 * Leser strukturert `fileErrors` når API returnerer JSON selv ved 4xx/5xx.
 */
export function getTankestromAnalyzeErrorMessage(httpStatus: number, responseText: string, payload: unknown): string {
  const fileErrors =
    isRecord(payload) && Array.isArray(payload.fileErrors)
      ? payload.fileErrors.filter((x): x is Record<string, unknown> => isRecord(x))
      : []
  const fileError = fileErrors[0]

  const message =
    (fileError && typeof fileError.message === 'string' && fileError.message.trim()) ||
    (isRecord(payload) && typeof payload.message === 'string' && payload.message.trim()) ||
    (isRecord(payload) && typeof payload.error === 'string' && payload.error.trim()) ||
    `Serverfeil (${httpStatus})`

  let debugMessage =
    (fileError && typeof fileError.debugMessage === 'string' && fileError.debugMessage.trim()) ||
    (isRecord(payload) && typeof payload.debugMessage === 'string' && payload.debugMessage.trim()) ||
    ''

  const stage = fileError && typeof fileError.stage === 'string' ? fileError.stage.trim() : ''
  if (!debugMessage && stage) {
    debugMessage = `Fase: ${stage}`
  }

  if (fileErrors.length > 1) {
    const extra = fileErrors
      .slice(1)
      .map((fe, i) => {
        const fn = typeof fe.fileName === 'string' ? fe.fileName.trim() : `fil ${i + 2}`
        const m = typeof fe.message === 'string' ? fe.message.trim() : ''
        return m ? `${fn}: ${m}` : fn
      })
      .filter(Boolean)
      .join(' · ')
    if (extra) {
      debugMessage = debugMessage ? `${debugMessage} · ${extra}` : extra
    }
  }

  if (!debugMessage) {
    const raw = responseText.trim()
    debugMessage = raw ? raw.slice(0, 500) : 'Tomt svar fra server'
  }

  return `${message}\n\nDetalj: ${debugMessage}`
}

function throwTankestromAnalyzeFailure(httpStatus: number, responseText: string, payload: unknown): never {
  console.error('[Tankestrom analyze failed]', {
    status: httpStatus,
    responseText,
    payload,
  })
  throw new Error(getTankestromAnalyzeErrorMessage(httpStatus, responseText, payload))
}

async function analyzeWithTankestrom(analyzePayload: AnalyzePayload): Promise<PortalImportProposalBundle> {
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
  if (analyzePayload.kind === 'file') {
    const form = new FormData()
    form.append('file', analyzePayload.file)
    body = form
  } else {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify({ text: analyzePayload.text })
  }

  const analyzeUrl = url
  console.info('[Tankestrom endpoint]', analyzeUrl)

  let res: Response
  try {
    res = await fetch(analyzeUrl, {
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
        `Kunne ikke kontakte Tankestrøm-analyse (${analyzeUrl}). Sjekk at URL er riktig, at tjenesten er oppe, og at CORS/HTTPS tillater kall fra denne appen.`
      )
    }
    throw err instanceof Error ? err : new Error('Kunne ikke kontakte Tankestrøm-analyse.')
  }

  console.info('[Tankestrom response headers]', {
    status: res.status,
    service: res.headers.get('X-Tankestrom-Service'),
    version: res.headers.get('X-Tankestrom-Version'),
    wrapper: res.headers.get('X-Tankestrom-Analyze-Wrapper'),
    contentType: res.headers.get('content-type'),
  })

  const responseText = await res.text()
  let responseJson: unknown = null
  try {
    responseJson = responseText ? JSON.parse(responseText) : null
  } catch {
    responseJson = null
  }

  console.info('[Tankestrom raw response]', {
    status: res.status,
    responseText,
    payload: responseJson,
  })

  const failedPayload = isRecord(responseJson) && responseJson.ok === false

  if (!res.ok || failedPayload) {
    if (failedPayload) {
      console.error('[Tankestrom analyze] ok:false payload', responseJson)
    }
    throwTankestromAnalyzeFailure(res.status, responseText, responseJson)
  }

  if (!responseJson) {
    throw new Error(
      `Kunne ikke lese svar fra Tankestrøm. Rå respons: ${responseText.trim().slice(0, 500)}`
    )
  }

  const json = responseJson

  const dbgText =
    analyzePayload.kind === 'text' &&
    (import.meta.env.DEV || import.meta.env.VITE_DEBUG_SCHOOL_IMPORT === 'true')

  const normalized = normalizeTankestromAnalyzeHttpJson(json)

  if (dbgText) {
    console.debug('[tankestrom text analyze]', {
      tankestrom_text_request_shape: { method: 'POST', contentType: 'application/json', bodyFields: ['text'] },
      tankestrom_text_response_shape: summarizeTankestromJsonShape(json),
      tankestrom_text_response_raw_snippet: responseText.trim().slice(0, 800).replace(/\s+/g, ' '),
      tankestrom_text_schema_version_received: isRecord(json) ? json.schemaVersion : undefined,
      tankestrom_text_normalized_schema_version: isRecord(normalized) ? normalized.schemaVersion : undefined,
      tankestrom_text_normalized_shape: summarizeTankestromJsonShape(normalized),
    })
  }

  try {
    return parsePortalImportProposalBundle(normalized)
  } catch (e) {
    const failMsg = e instanceof Error ? e.message : String(e)
    if (analyzePayload.kind === 'text') {
      console.warn('[tankestrom text analyze] bundle parse failed', {
        tankestrom_text_bundle_parse_failed_reason: failMsg,
        tankestrom_text_response_top_keys: isRecord(json) ? Object.keys(json).sort() : null,
        tankestrom_text_normalized_top_keys: isRecord(normalized) ? Object.keys(normalized).sort() : null,
        tankestrom_text_normalized_looks_like_bundle:
          isRecord(normalized) && looksLikeImportBundlePayload(normalized),
        tankestrom_text_response_shape: summarizeTankestromJsonShape(json),
        tankestrom_text_normalized_shape: summarizeTankestromJsonShape(normalized),
        tankestrom_text_response_raw_snippet: responseText.trim().slice(0, 800).replace(/\s+/g, ' '),
      })
    }
    if (dbgText) {
      console.debug('[tankestrom text analyze]', {
        tankestrom_text_bundle_parse_failed_reason: failMsg,
      })
    }
    throw e
  }
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
  const secondaryById = new Map<string, PortalSecondaryImportCandidate>()
  for (const b of bundles) {
    for (const c of b.secondaryCandidates ?? []) {
      if (!secondaryById.has(c.candidateId)) secondaryById.set(c.candidateId, c)
    }
  }
  const secondaryMerged =
    secondaryById.size > 0 ? [...secondaryById.values()].slice(0, 12) : undefined
  return {
    schemaVersion: '1.0.0',
    provenance: {
      ...base,
      importRunId: newBatchImportRunId(),
      sourceType: `${base.sourceType} · ${bundles.length} filer`,
    },
    items,
    schoolWeekOverlayProposal: overlay,
    secondaryCandidates: secondaryMerged,
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
