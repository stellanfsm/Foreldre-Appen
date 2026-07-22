import type {
  CanonicalSchoolContentDraft,
  CanonicalSchoolContentItem,
  CanonicalSchoolContentPlacement,
  CanonicalSchoolDay,
  SchoolBlockActivityKind,
  SchoolBlockContentType,
  SchoolBlockDayOperation,
  SchoolBlockElementAction,
  SchoolBlockReviewCode,
  SchoolBlockReviewFlag,
  SchoolBlockSections,
  SchoolBlockStructureStatus,
  SchoolBlockWeekdayIndex,
} from './canonicalSchoolTypes'

/**
 * ÉN delt, tolerant runtime-parser for `canonicalSchoolContentDraft`. Brukes for BÅDE
 * portalbundelen (analyse-respons) OG lagret JSONB-snapshot ved readback — så snapshotet aldri
 * konsumeres kun på grunnlag av TypeScript-typen. Ren, React-fri, ingen parallell validator.
 *
 * Tolerant: ukjente additive felt ignoreres; ugyldige enkelt-items/dager degraderes lokalt.
 * Returnerer `undefined` ved strukturell svikt (ikke objekt / feil schemaVersion / ingen dager) →
 * kaller aldri planbyggeren på ugyldige data (kontrollert fallback hos konsumenten).
 * Aldri regex/fraseparsing av skoleinnhold.
 */

const PLACEMENTS = new Set<CanonicalSchoolContentPlacement>(['subject', 'audience', 'day'])
const CONTENT_TYPES = new Set<SchoolBlockContentType>([
  'lesson', 'homework', 'assessment', 'reminder', 'resource', 'message', 'alternative_program',
])
const ELEMENT_ACTIONS = new Set<SchoolBlockElementAction>(['enrich', 'replace_range'])
const ACTIVITY_KINDS = new Set<SchoolBlockActivityKind>([
  'exam_day', 'trip_day', 'activity_day', 'free_day', 'other',
])
const REVIEW_CODES = new Set<SchoolBlockReviewCode>([
  'missing_time', 'ambiguous_subject', 'child_class_unresolved',
  'unrecognized_activity', 'conflicting_actions', 'low_confidence',
])
const WEEKDAYS = new Set<SchoolBlockWeekdayIndex>(['0', '1', '2', '3', '4'])
const STRUCTURE_STATUS = new Set<SchoolBlockStructureStatus>(['complete', 'review_required'])
const SECTION_KEYS = [
  'iTimen', 'lekse', 'husk', 'proveVurdering', 'ressurser', 'ekstraBeskjed', 'descriptionLines',
] as const

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
/** Formatsjekk YYYY-MM-DD (kun på et strukturert dato-felt — ikke fritekst-innhold). */
function isIsoDateKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}
function canonStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}
function canonNullStr(v: unknown): string | null {
  return typeof v === 'string' ? v.trim() : null
}
function canonNum(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
function canonEnum<T>(v: unknown, set: Set<T>, fallback: T): T {
  return typeof v === 'string' && set.has(v as T) ? (v as T) : fallback
}

/** Tolerant dagsoperasjon: gyldig op eller degradering til {op:'none'} (aldri kast). */
function parseDayOperation(raw: unknown): SchoolBlockDayOperation {
  if (!isRecord(raw)) return { op: 'none' }
  const op = raw.op
  if (op === 'replace_day') {
    return {
      op: 'replace_day',
      activityKind: canonEnum(raw.activityKind, ACTIVITY_KINDS, 'other'),
      effectiveStart: canonNullStr(raw.effectiveStart),
      effectiveEnd: canonNullStr(raw.effectiveEnd),
      reason: canonNullStr(raw.reason),
      confidence: canonNum(raw.confidence),
    }
  }
  if (op === 'adjust_start') {
    const s = canonNullStr(raw.effectiveStart)
    if (!s) return { op: 'none' } // krever eksplisitt start; ellers degrade
    return { op: 'adjust_start', effectiveStart: s, reason: canonNullStr(raw.reason), confidence: canonNum(raw.confidence) }
  }
  if (op === 'adjust_end') {
    const e = canonNullStr(raw.effectiveEnd)
    if (!e) return { op: 'none' }
    return { op: 'adjust_end', effectiveEnd: e, reason: canonNullStr(raw.reason), confidence: canonNum(raw.confidence) }
  }
  return { op: 'none' }
}

function parseReviewFlag(raw: unknown): SchoolBlockReviewFlag | null {
  if (!isRecord(raw)) return null
  if (typeof raw.code !== 'string' || !REVIEW_CODES.has(raw.code as SchoolBlockReviewCode)) return null
  const scope: SchoolBlockReviewFlag['scope'] = {}
  if (isRecord(raw.scope)) {
    if (typeof raw.scope.dayId === 'string') scope.dayId = raw.scope.dayId
    if (typeof raw.scope.itemId === 'string') scope.itemId = raw.scope.itemId
    if (typeof raw.scope.audienceEntryId === 'string') scope.audienceEntryId = raw.scope.audienceEntryId
  }
  return { code: raw.code as SchoolBlockReviewCode, message: canonStr(raw.message), scope }
}
function parseReviewFlags(x: unknown): SchoolBlockReviewFlag[] {
  if (!Array.isArray(x)) return []
  const out: SchoolBlockReviewFlag[] = []
  for (const r of x) {
    const f = parseReviewFlag(r)
    if (f) out.push(f)
  }
  return out
}

function parseSections(raw: unknown): SchoolBlockSections | null {
  if (!isRecord(raw)) return null
  const out: SchoolBlockSections = {}
  let any = false
  for (const key of SECTION_KEYS) {
    const v = raw[key]
    if (Array.isArray(v)) {
      const lines = v.filter((s): s is string => typeof s === 'string').map((s) => s.trim())
      if (lines.length > 0) {
        out[key] = lines
        any = true
      }
    }
  }
  return any ? out : null
}

function parseContentItem(raw: unknown, fallbackPlacement: CanonicalSchoolContentPlacement, index: number): CanonicalSchoolContentItem | null {
  if (!isRecord(raw)) return null
  const itemId = canonStr(raw.itemId) || `canon-item-${fallbackPlacement}-${index}`
  return {
    sourceId: canonStr(raw.sourceId) || itemId,
    itemId,
    sourceRef: canonNullStr(raw.sourceRef),
    placement: canonEnum(raw.placement, PLACEMENTS, fallbackPlacement),
    contentType: canonEnum(raw.contentType, CONTENT_TYPES, 'message'),
    action: canonEnum(raw.action, ELEMENT_ACTIONS, 'enrich'),
    subject: canonNullStr(raw.subject),
    subjectKey: canonNullStr(raw.subjectKey),
    customLabel: canonNullStr(raw.customLabel),
    start: canonNullStr(raw.start),
    end: canonNullStr(raw.end),
    audienceEntries: Array.isArray(raw.audienceEntries) ? raw.audienceEntries : [],
    sections: parseSections(raw.sections),
    sourceText: canonNullStr(raw.sourceText),
    evidence: canonNullStr(raw.evidence),
    confidence: canonNum(raw.confidence),
    reviewFlags: parseReviewFlags(raw.reviewFlags),
  }
}

function parseItemList(x: unknown, placement: CanonicalSchoolContentPlacement): CanonicalSchoolContentItem[] {
  if (!Array.isArray(x)) return []
  const out: CanonicalSchoolContentItem[] = []
  x.forEach((raw, i) => {
    const item = parseContentItem(raw, placement, i)
    if (item) out.push(item)
  })
  return out
}

function parseDay(raw: unknown, index: number): CanonicalSchoolDay | null {
  if (!isRecord(raw)) return null
  return {
    dayId: canonStr(raw.dayId) || `canon-day-${index}`,
    date: typeof raw.date === 'string' && isIsoDateKey(raw.date) ? raw.date : null,
    weekdayIndex: canonEnum<SchoolBlockWeekdayIndex | null>(raw.weekdayIndex, WEEKDAYS, null),
    dayLabel: canonNullStr(raw.dayLabel),
    dayOperation: parseDayOperation(raw.dayOperation),
    dayResolution: canonStr(raw.dayResolution) || 'enrich_only',
    subjectItems: parseItemList(raw.subjectItems, 'subject'),
    audienceItems: parseItemList(raw.audienceItems, 'audience'),
    generalDayMessages: parseItemList(raw.generalDayMessages, 'day'),
    confidence: canonNum(raw.confidence),
    evidence: canonNullStr(raw.evidence),
    reviewFlags: parseReviewFlags(raw.reviewFlags),
  }
}

/**
 * Tolerant, atomisk-trygg parser. `undefined` når feltet mangler, har ukjent schemaVersion, ikke
 * er et objekt, eller ikke har noen (gyldige) dager. Brukes både for portalbundelen og lagret
 * JSONB-snapshot.
 */
export function parseCanonicalSchoolContentDraft(value: unknown): CanonicalSchoolContentDraft | undefined {
  if (!isRecord(value)) return undefined
  if (value.schemaVersion !== '1.0.0') return undefined
  if (!Array.isArray(value.days)) return undefined
  const days: CanonicalSchoolDay[] = []
  value.days.forEach((d, i) => {
    const day = parseDay(d, i)
    if (day) days.push(day)
  })
  if (days.length === 0) return undefined
  return {
    schemaVersion: '1.0.0',
    sourceTitle: canonStr(value.sourceTitle),
    originalSourceType: canonStr(value.originalSourceType),
    personId: canonNullStr(value.personId),
    personMatchStatus: canonStr(value.personMatchStatus) || 'not_specified',
    classCode: canonNullStr(value.classCode),
    days,
    structureStatus: canonEnum(value.structureStatus, STRUCTURE_STATUS, 'complete'),
    reviewFlags: parseReviewFlags(value.reviewFlags),
  }
}
