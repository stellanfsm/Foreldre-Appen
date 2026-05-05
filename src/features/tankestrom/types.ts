/**
 * Felles import-forslag (v1) — Tankestrøm / fremtidige kilder.
 * Portalen støtter kind: "event", "task" (gjøremål) og "school_profile" (fast timeplan → skoleprofil).
 */

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

export interface PortalImportProposalBundle {
  schemaVersion: PortalImportSchemaVersion
  provenance: PortalImportProvenance
  items: PortalProposalItem[]
  schoolWeekOverlayProposal?: PortalSchoolWeekOverlayProposal
  /** Valgfri liste fra analyse — ellers utledes noen få fra lav sikkerhet på items (klient). */
  secondaryCandidates?: PortalSecondaryImportCandidate[]
}

/** Lokalt redigerbart utkast per forslag før import (speiler det brukeren kan endre i UI). */
export type TankestromPersonMatchStatus = 'not_specified' | 'unmatched_document_name' | 'matched'

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
}

/** Utkast for gjøremål (Task) før import. */
export interface TankestromTaskDraft {
  title: string
  date: string
  notes: string
  dueTime: string
  childPersonId: string
  assignedToPersonId: string
  showInMonthView: boolean
  taskIntent: TaskIntent
}

/** Brukerens valgte importtype per forslag (kan avvike fra API `kind` etter typebytte). */
export type TankestromImportDraft =
  | { importKind: 'event'; event: TankestromEventDraft }
  | { importKind: 'task'; task: TankestromTaskDraft }
