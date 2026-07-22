// -------------------------------------------------------------------------------------
// Nøytral, React-fri modul: ÉN definisjon av de delte skole-primitivene OG canonical
// skoleinnhold-kontrakten. Importeres av basetypene (src/types), Tankestrøm-parseren, den delte
// planbyggeren, persist og skole-/bakgrunnsvisningen — uten importsyklus og uten React.
// `src/features/tankestrom/types.ts` RE-EKSPORTERER disse, så eksisterende importer er uendret.
// Ingen parallelle canonical-typer.
// -------------------------------------------------------------------------------------

export type SchoolBlockWeekdayIndex = '0' | '1' | '2' | '3' | '4'

export type SchoolBlockStructureStatus = 'complete' | 'review_required'

export type SchoolBlockContentType =
  | 'lesson'
  | 'homework'
  | 'assessment'
  | 'reminder'
  | 'resource'
  | 'message'
  | 'alternative_program'

export type SchoolBlockElementAction = 'enrich' | 'replace_range'

export type SchoolBlockActivityKind =
  | 'exam_day'
  | 'trip_day'
  | 'activity_day'
  | 'free_day'
  | 'other'

export type SchoolBlockReviewCode =
  | 'missing_time'
  | 'ambiguous_subject'
  | 'child_class_unresolved'
  | 'unrecognized_activity'
  | 'conflicting_actions'
  | 'low_confidence'

export interface SchoolBlockReviewFlag {
  code: SchoolBlockReviewCode
  message: string
  scope: {
    dayId?: string
    itemId?: string
    audienceEntryId?: string
  }
}

export type SchoolBlockDayOperation =
  | { op: 'none' }
  | {
      op: 'replace_day'
      activityKind: SchoolBlockActivityKind
      effectiveStart: string | null
      effectiveEnd: string | null
      reason: string | null
      confidence: number
    }
  | {
      op: 'adjust_start'
      effectiveStart: string
      reason: string | null
      confidence: number
    }
  | {
      op: 'adjust_end'
      effectiveEnd: string
      reason: string | null
      confidence: number
    }

export interface SchoolBlockSections {
  iTimen?: string[]
  lekse?: string[]
  husk?: string[]
  proveVurdering?: string[]
  ressurser?: string[]
  ekstraBeskjed?: string[]
  descriptionLines?: string[]
}

// -------------------------------------------------------------------------------------
// canonicalSchoolContentDraft — Tankestrømmens additive, ALLEREDE fag-/child-scopede
// skoleinnhold. Autoritativt for både preview og persist. Serialiserbar → lagres additivt
// som snapshot på `SchoolWeekOverlay.canonicalSchoolContentDraft` (JSONB, ingen migrasjon).
// -------------------------------------------------------------------------------------

export type CanonicalSchoolContentPlacement = 'subject' | 'audience' | 'day'

export interface CanonicalSchoolContentItem {
  sourceId: string
  itemId: string
  sourceRef: string | null
  placement: CanonicalSchoolContentPlacement
  contentType: SchoolBlockContentType
  action: SchoolBlockElementAction
  subject: string | null
  subjectKey: string | null
  customLabel: string | null
  start: string | null
  end: string | null
  /** Allerede løst av backend — frontend re-matcher ALDRI audience. Tolerert som ukjent form. */
  audienceEntries: unknown[]
  /** Strukturerte seksjoner når backend leverer dem; ellers null. */
  sections: SchoolBlockSections | null
  sourceText: string | null
  evidence: string | null
  confidence: number
  reviewFlags: SchoolBlockReviewFlag[]
}

export interface CanonicalSchoolDay {
  dayId: string
  date: string | null
  weekdayIndex: SchoolBlockWeekdayIndex | null
  dayLabel: string | null
  dayOperation: SchoolBlockDayOperation
  dayResolution: string
  subjectItems: CanonicalSchoolContentItem[]
  audienceItems: CanonicalSchoolContentItem[]
  generalDayMessages: CanonicalSchoolContentItem[]
  confidence: number
  evidence: string | null
  reviewFlags: SchoolBlockReviewFlag[]
}

export interface CanonicalSchoolContentDraft {
  schemaVersion: '1.0.0'
  sourceTitle: string
  originalSourceType: string
  personId: string | null
  personMatchStatus: string
  classCode: string | null
  days: CanonicalSchoolDay[]
  structureStatus: SchoolBlockStructureStatus
  reviewFlags: SchoolBlockReviewFlag[]
}

/**
 * Lagret snapshot av canonical draft på et `SchoolWeekOverlay`. Identisk kontrakt (allerede
 * JSON-serialiserbar) — ingen semantisk oversettelse, ingen tapte felt. Egen type-alias for
 * å gjøre intensjonen (persistert form) eksplisitt ved lesing.
 */
export type StoredCanonicalSchoolContentDraft = CanonicalSchoolContentDraft
