/**
 * Felles import-forslag (v1) — Tankestrøm / fremtidige kilder.
 * MVP i portalen støtter kun kind: "event".
 */

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
  kind: 'event' | 'task'
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

export type PortalProposalItem = PortalEventProposal | PortalTaskProposal

export interface PortalImportProposalBundle {
  schemaVersion: PortalImportSchemaVersion
  provenance: PortalImportProvenance
  items: PortalProposalItem[]
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
