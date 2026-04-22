/**
 * Felles import-forslag (v1) — Tankestrøm / fremtidige kilder.
 * Portalen støtter kind: "event", "task" (gjøremål) og "school_profile" (fast timeplan → skoleprofil).
 */

import type {
  ChildSchoolProfile,
  SchoolWeekOverlayAction,
  SchoolWeekOverlayDayAction,
  SchoolWeekOverlaySubjectUpdate,
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

export interface PortalImportProposalBundle {
  schemaVersion: PortalImportSchemaVersion
  provenance: PortalImportProvenance
  items: PortalProposalItem[]
  schoolWeekOverlayProposal?: PortalSchoolWeekOverlayProposal
}

/** Lokalt redigerbart utkast per forslag før import (speiler det brukeren kan endre i UI). */
export interface TankestromEventDraft {
  title: string
  date: string
  start: string
  end: string
  personId: string
  location: string
  notes: string
  reminderMinutes?: number
  includeRecurrence: boolean
  dropoffBy: string
  pickupBy: string
}

/** Utkast for gjøremål (Task) før import. Tasks har ikke metadata i DB i MVP. */
export interface TankestromTaskDraft {
  title: string
  date: string
  notes: string
  dueTime: string
  childPersonId: string
  assignedToPersonId: string
  showInMonthView: boolean
}

/** Brukerens valgte importtype per forslag (kan avvike fra API `kind` etter typebytte). */
export type TankestromImportDraft =
  | { importKind: 'event'; event: TankestromEventDraft }
  | { importKind: 'task'; task: TankestromTaskDraft }
