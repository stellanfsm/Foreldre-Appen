/**
 * Felles import-forslag (v1) — Tankestrøm / fremtidige kilder.
 * Portalen støtter kind: "event", "task" (gjøremål) og "school_profile" (fast timeplan → skoleprofil).
 */

import type { EmbeddedScheduleChildExportTimePolicy } from '../../lib/tankestromEmbeddedChildNotesPresentation'
import type {
  ChildSchoolProfile,
  SchoolWeekOverlayDayAction,
  TaskIntent,
} from '../../types'

export type PortalImportSchemaVersion = '1.0.0'

export type PortalSourceSystem = 'tankestrom' | 'mail_organizer' | 'other'

export interface PortalImportProvenance {
  sourceSystem: PortalSourceSystem
  sourceType: string
  generatorVersion?: string
  generatedAt: string
  importRunId: string
}

export interface PortalProposalItemBase {
  proposalId: string
  kind: 'event' | 'task' | 'school_profile'
  sourceId: string
  originalSourceType: string
  confidence: number
  externalRef?: string
  calendarOwnerUserId?: string
}

export interface PortalEventPayload {
  date: string
  /** Tom streng = ingen kjent person (dokumentimport, reise, …). */
  personId: string
  title: string
  start: string
  end: string
  notes?: string
  location?: string
  reminderMinutes?: number | null
  recurrenceGroupId?: string
  metadata?: Record<string, unknown>
}

export interface PortalEventProposal extends PortalProposalItemBase {
  kind: 'event'
  event: PortalEventPayload
}

export interface PortalTaskProposal extends PortalProposalItemBase {
  kind: 'task'
  task: {
    date: string
    title: string
    notes?: string
    dueTime?: string
    assignedToPersonId?: string
    childPersonId?: string
    /** Vei 1: serverens matchede barn for tasken (ny server bruker `personId`, ikke `childPersonId`). */
    personId?: string
    /** Vei 1: serverens barn-match-status (speiler event). Gammel server uten feltet → tolerant → not_specified. */
    personMatchStatus?: TankestromPersonMatchStatus
    showInMonthView?: boolean
    /** Fra analyse; klient kan overstyre i review. */
    taskIntent?: TaskIntent
  }
}

/** Fast ukes timeplan — skrives til `family_members.profile.school` etter brukergodkjenning. */
export interface PortalSchoolProfileProposal extends PortalProposalItemBase {
  kind: 'school_profile'
  schoolProfile: ChildSchoolProfile
  /** Forslag fra Tankestrøm; må være et barn i familien for å forhåndsvelges. */
  suggestedPersonId?: string
}

export type PortalProposalItem = PortalEventProposal | PortalTaskProposal | PortalSchoolProfileProposal

export interface SchoolWeekOverlayDailyAction extends SchoolWeekOverlayDayAction {}

export interface SchoolWeekOverlayLanguageTrack {
  resolvedTrack?: string
  confidence?: number
  reason?: string
}

export interface SchoolWeekOverlayProfileMatch {
  confidence?: number
  reason?: string
}

export interface PortalSchoolWeekOverlayProposal {
  proposalId: string
  kind: 'school_week_overlay'
  schemaVersion: PortalImportSchemaVersion
  confidence: number
  sourceTitle?: string
  originalSourceType: string
  weekNumber?: number
  classLabel?: string
  weeklySummary: string[]
  languageTrack?: SchoolWeekOverlayLanguageTrack
  profileMatch?: SchoolWeekOverlayProfileMatch
  dailyActions: Partial<Record<number, SchoolWeekOverlayDailyAction>>
}

/** Usikre «nesten»-forslag — vises i egen seksjon; kan løftes inn som hendelse/gjøremål. */
export type PortalSecondaryCandidateSuggestedKind = 'event' | 'task'

export interface PortalSecondaryImportCandidate {
  candidateId: string
  title: string
  summary?: string
  confidence: number
  suggestedKind: PortalSecondaryCandidateSuggestedKind
  date?: string
  notes?: string
  /** Når kandidaten kommer fra lav sikkerhet på et vanlig forslag */
  sourceProposalId?: string
}

// -------------------------------------------------------------------------------------
// schoolBlockProposal — additiv toppnivå-struktur fra `documentKind: "school"` (Vei 1).
// Kun wire-typer + parsing i dette steget; ingen preview/draft/persist.
// -------------------------------------------------------------------------------------

// De delte skole-primitivene OG canonical-kontrakten bor nå i den nøytrale, React-frie modulen
// `../../lib/canonicalSchoolTypes` (én definisjon, ingen importsyklus). De re-eksporteres her slik
// at alle eksisterende `import … from '.../features/tankestrom/types'`-stier er uendret.
import type {
  SchoolBlockActivityKind,
  SchoolBlockContentType,
  SchoolBlockDayOperation,
  SchoolBlockElementAction,
  SchoolBlockReviewFlag,
  SchoolBlockSections,
  SchoolBlockStructureStatus,
  SchoolBlockWeekdayIndex,
  CanonicalSchoolContentDraft,
} from '../../lib/canonicalSchoolTypes'
export type {
  SchoolBlockActivityKind,
  SchoolBlockContentType,
  SchoolBlockDayOperation,
  SchoolBlockElementAction,
  SchoolBlockReviewCode,
  SchoolBlockReviewFlag,
  SchoolBlockSections,
  SchoolBlockStructureStatus,
  SchoolBlockWeekdayIndex,
  CanonicalSchoolContentDraft,
  CanonicalSchoolDay,
  CanonicalSchoolContentItem,
  CanonicalSchoolContentPlacement,
  StoredCanonicalSchoolContentDraft,
} from '../../lib/canonicalSchoolTypes'

// Beholdt lokalt (kun schoolBlock-wire; ikke delt med canonical):
export type SchoolBlockDayResolution =
  | 'enrich_only'
  | 'partial_replace'
  | 'full_replace'
  | 'hours_adjusted'

export type SchoolBlockAudienceScope = 'common' | 'per_audience'

export interface SchoolBlockSubjectCandidate {
  subjectKey: string
  subject: string
  weight: number
}

export interface SchoolBlockAudienceEntry {
  audienceEntryId: string
  classCodes: string[]
  pulje: string | null
  start: string | null
  end: string | null
  room: string | null
  teacher: string | null
  /** Tri-state: true | false | null. */
  isChildAudience: boolean | null
}

export interface SchoolBlockResolvedChildAudience {
  audienceEntryId: string | null
  start: string | null
  end: string | null
  room: string | null
  teacher: string | null
}

export interface SchoolBlockCommonSchedule {
  start: string | null
  end: string | null
  room: string | null
  teacher: string | null
}

export interface SchoolBlockContentItem {
  itemId: string
  title: string
  contentType: SchoolBlockContentType
  action: SchoolBlockElementAction

  subject: string | null
  subjectKey: string | null
  customLabel: string | null
  subjectCandidates?: SchoolBlockSubjectCandidate[]

  audienceScope: SchoolBlockAudienceScope
  commonSchedule: SchoolBlockCommonSchedule | null
  audienceEntries: SchoolBlockAudienceEntry[]
  resolvedChildAudience: SchoolBlockResolvedChildAudience | null

  sections: SchoolBlockSections
  activityKind: SchoolBlockActivityKind | null

  evidence: string | null
  sourceText: string | null
  confidence: number
  reviewFlags: SchoolBlockReviewFlag[]
}

export interface SchoolBlockDay {
  dayId: string
  date: string | null
  weekdayIndex: SchoolBlockWeekdayIndex | null
  dayLabel: string | null
  blockTitle: string | null

  dayOperation: SchoolBlockDayOperation
  dayResolution: SchoolBlockDayResolution

  contentItems: SchoolBlockContentItem[]

  confidence: number
  evidence: string | null
  reviewFlags: SchoolBlockReviewFlag[]
}

export interface SchoolBlockProposal {
  proposalId: string
  kind: 'school_block'
  schemaVersion: '1.0.0'

  sourceTitle: string
  originalSourceType: string
  confidence: number

  personId: string | null
  personMatchStatus: TankestromPersonMatchStatus
  classCode: string | null

  weekNumber?: number | null

  days: SchoolBlockDay[]

  structureStatus: SchoolBlockStructureStatus
  reviewFlags: SchoolBlockReviewFlag[]

  languageTrack?: {
    resolvedTrack: string | null
    confidence: number
    reason: string
  }
}

// canonicalSchoolContentDraft-typene (Placement/Item/Day/Draft) er flyttet til den nøytrale
// modulen `../../lib/canonicalSchoolTypes` og re-eksporteres øverst i denne fila.

export interface PortalImportProposalBundle {
  schemaVersion: PortalImportSchemaVersion
  provenance: PortalImportProvenance
  items: PortalProposalItem[]
  schoolWeekOverlayProposal?: PortalSchoolWeekOverlayProposal
  /** Additiv toppnivå-struktur fra `documentKind: "school"` — kun parsing i dette steget. */
  schoolBlockProposal?: SchoolBlockProposal
  /**
   * Additiv, allerede fag-/child-scopet skole-draft. Når satt + gyldig er den AUTORITATIV for
   * preview og persist (schoolBlock/overlay brukes kun som fallback når denne mangler).
   */
  canonicalSchoolContentDraft?: CanonicalSchoolContentDraft
  /** Valgfri liste fra analyse — ellers utledes noen få fra lav sikkerhet på items (klient). */
  secondaryCandidates?: PortalSecondaryImportCandidate[]
}

/** Lokalt redigerbart utkast per forslag før import (speiler det brukeren kan endre i UI). */
export type TankestromPersonMatchStatus =
  | 'not_specified'
  | 'unmatched_document_name'
  | 'matched'
  // Vei 1 lag 3: serveren vet at dette er en skole-/ukeplan men er usikker på hvilket barn → bruker velger.
  | 'child_unresolved'

export interface TankestromEventDraft {
  title: string
  date: string
  start: string
  end: string
  personId: string
  /** Fra analyse/metadata; styrer requiresPersonForImport sammen med importSourceKind osv. */
  personMatchStatus?: TankestromPersonMatchStatus
  importSourceKind?: string
  importRequiresPerson?: boolean
  travelImportType?: string
  /** Manuell «tom» hendelse i review — person skal alltid velges. */
  isManualCalendarEntry?: boolean
  /**
   * Navn fra dokument (boarding pass, PDF, …) når det ikke kunne kobles til en kjent person.
   * Vises som «Navn i dokument: …» i review.
   */
  documentExtractedPersonName?: string
  /**
   * Flere deltakere på hendelsen (som `metadata.participants` ved import).
   * Første id skal alltid være lik `personId` (primær / kalendereier for raden).
   */
  participantPersonIds?: string[]
  location: string
  notes: string
  reminderMinutes?: number
  includeRecurrence: boolean
  dropoffBy: string
  pickupBy: string
  /** Satt ved bygging fra embedded program — styrer timePrecision ved persist. */
  embeddedScheduleExport?: {
    usesSyntheticLayoutEnd: boolean
    policy: EmbeddedScheduleChildExportTimePolicy
    /** Slutt estimert fra canonical policy (ikke bekreftet i kilde). */
    inferredEndTime?: boolean
    /** Kilde for sluttid ved persist (API eller fallback). */
    endTimeSource?: string
    endTimeProvenance?: 'source_confirmed_end' | 'api_inferred_end' | 'frontend_canonical_fallback'
  }
}

/** Utkast for gjøremål (Task) før import. */
export interface TankestromTaskDraft {
  title: string
  date: string
  notes: string
  dueTime: string
  childPersonId: string
  assignedToPersonId: string
  /** Vei 1: serverens barn-match-status (speiler TankestromEventDraft). Server-taus → not_specified. */
  personMatchStatus?: TankestromPersonMatchStatus
  showInMonthView: boolean
  taskIntent: TaskIntent
}

/** Brukerens valgte importtype per forslag (kan avvike fra API `kind` etter typebytte). */
export type TankestromImportDraft =
  | { importKind: 'event'; event: TankestromEventDraft }
  | { importKind: 'task'; task: TankestromTaskDraft }
