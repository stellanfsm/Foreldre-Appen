/**
 * MVP: «Kanskje også relevant» — konservativ utvelgelse av usikre kandidater.
 */

import type {
  PortalEventProposal,
  PortalImportProposalBundle,
  PortalProposalItem,
  PortalSecondaryImportCandidate,
  PortalTaskProposal,
} from '../features/tankestrom/types'
import { isEmbeddedScheduleParentProposalItem } from './embeddedSchedule'

export const SECONDARY_ZONE_CONF_MIN = 0.37
export const SECONDARY_ZONE_CONF_MAX = 0.56
export const SECONDARY_ZONE_MAX_VISIBLE = 5

/** Kilde-lengde eller antall kandidater som utløser «langt dokument»-modus. */
export const LONG_DOCUMENT_CHAR_THRESHOLD = 6000
export const LONG_DOCUMENT_CANDIDATE_THRESHOLD = 8

const NOISE_TITLE = /^(?:info|merk|obs|nb|ps)\s*:?\s*$/i
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

function titleFromItem(item: PortalProposalItem): string {
  if (item.kind === 'event') return item.event.title.trim()
  if (item.kind === 'task') return item.task.title.trim()
  return ''
}

export type ImportClassificationContext = {
  isExplicitUserImport: boolean
  isLongDocumentMode: boolean
  sourceLength: number
  totalCandidateCount: number
}

export function buildImportClassificationContext(opts: {
  inputMode: 'text' | 'file'
  provenanceSourceType?: string
  sourceLength: number
  calendarItemCount: number
  secondaryCandidateCount: number
}): ImportClassificationContext {
  const st = (opts.provenanceSourceType ?? '').trim()
  const isExplicitUserImport =
    opts.inputMode === 'text' ||
    opts.inputMode === 'file' ||
    st === 'pasted_text' ||
    st === 'uploaded_file'
  const totalCandidateCount = opts.calendarItemCount + opts.secondaryCandidateCount
  const isLongDocumentMode =
    opts.sourceLength > LONG_DOCUMENT_CHAR_THRESHOLD || totalCandidateCount >= LONG_DOCUMENT_CANDIDATE_THRESHOLD
  return {
    isExplicitUserImport,
    isLongDocumentMode,
    sourceLength: opts.sourceLength,
    totalCandidateCount,
  }
}

export function hasConcreteDateOrDateRangeForEvent(item: PortalEventProposal): boolean {
  const d = item.event.date?.trim() ?? ''
  if (!DATE_KEY.test(d)) return false
  const meta = item.event.metadata
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    const endRaw = (meta as Record<string, unknown>).endDate
    if (typeof endRaw === 'string') {
      const end = endRaw.trim()
      if (DATE_KEY.test(end) && end !== d) return true
    }
  }
  return true
}

export function hasArrangementSignalsForEvent(item: PortalEventProposal): boolean {
  const meta = item.event.metadata
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false
  const m = meta as Record<string, unknown>
  if (typeof m.arrangementStableKey === 'string' && m.arrangementStableKey.trim().length > 0) return true
  if (typeof m.arrangementCoreTitle === 'string' && m.arrangementCoreTitle.trim().length > 0) return true
  if (Array.isArray(m.embeddedSchedule) && m.embeddedSchedule.length > 0) return true
  return false
}

/**
 * Hendelser som skal ligge i hovedlisten (ikke «Kanskje også relevant») selv ved middels confidence.
 */
export function shouldPromoteEventItemToPrimary(
  item: PortalProposalItem,
  ctx: ImportClassificationContext
): boolean {
  if (item.kind !== 'event') return false
  const title = titleFromItem(item)
  if (title.length < 1) return false
  if (!hasConcreteDateOrDateRangeForEvent(item)) return false

  if (hasArrangementSignalsForEvent(item)) return true

  if (ctx.isExplicitUserImport) {
    if (
      ctx.isLongDocumentMode &&
      item.confidence >= SECONDARY_ZONE_CONF_MIN &&
      item.confidence < SECONDARY_ZONE_CONF_MAX
    ) {
      return false
    }
    return true
  }

  if (!ctx.isLongDocumentMode) return true

  return false
}

/** Ting med lav nok sikkerhet til sekundær sone (men ikke ren støy). */
export function proposalItemQualifiesSecondaryZone(
  item: PortalProposalItem,
  ctx?: ImportClassificationContext
): boolean {
  if (item.kind === 'school_profile') return false
  if (item.kind === 'event' && isEmbeddedScheduleParentProposalItem(item)) return false
  if (item.kind === 'event' && ctx && shouldPromoteEventItemToPrimary(item, ctx)) return false
  if (item.confidence < SECONDARY_ZONE_CONF_MIN || item.confidence >= SECONDARY_ZONE_CONF_MAX) return false
  const t = titleFromItem(item)
  if (t.length < 4 || t.length > 180) return false
  if (NOISE_TITLE.test(t)) return false
  return true
}

function itemToSecondaryCandidate(
  item: PortalProposalItem,
  ctx?: ImportClassificationContext
): PortalSecondaryImportCandidate | null {
  if (!proposalItemQualifiesSecondaryZone(item, ctx)) return null
  if (item.kind === 'event') {
    const ev = item.event
    return {
      candidateId: `prop:${item.proposalId}`,
      title: ev.title.trim(),
      confidence: item.confidence,
      suggestedKind: 'event',
      date: ev.date,
      notes: ev.notes?.trim() || undefined,
      sourceProposalId: item.proposalId,
    }
  }
  if (item.kind === 'task') {
    const tk = item.task
    return {
      candidateId: `prop:${item.proposalId}`,
      title: tk.title.trim(),
      confidence: item.confidence,
      suggestedKind: 'task',
      date: tk.date,
      notes: tk.notes?.trim() || undefined,
      sourceProposalId: item.proposalId,
    }
  }
  return null
}

/**
 * Slår API-kandidater og utledede fra lav-sikkerhet items; begrenser antall.
 */
export function buildMergedSecondaryImportCandidates(
  bundle: PortalImportProposalBundle | null,
  calendarItems: PortalProposalItem[],
  ctx?: ImportClassificationContext
): PortalSecondaryImportCandidate[] {
  if (!bundle) return []
  const byId = new Map<string, PortalSecondaryImportCandidate>()
  for (const c of bundle.secondaryCandidates ?? []) {
    if (!byId.has(c.candidateId)) byId.set(c.candidateId, c)
  }
  const usedSource = new Set(
    [...byId.values()].map((c) => c.sourceProposalId).filter(Boolean) as string[]
  )
  const derived: PortalSecondaryImportCandidate[] = []
  for (const it of calendarItems) {
    if (it.kind !== 'event' && it.kind !== 'task') continue
    if (ctx && it.kind === 'event' && shouldPromoteEventItemToPrimary(it, ctx)) continue
    if (usedSource.has(it.proposalId)) continue
    const c = itemToSecondaryCandidate(it, ctx)
    if (c && !byId.has(c.candidateId)) derived.push(c)
  }
  derived.sort((a, b) => b.confidence - a.confidence)
  const merged: PortalSecondaryImportCandidate[] = [...byId.values()]
  for (const d of derived) {
    if (merged.length >= SECONDARY_ZONE_MAX_VISIBLE + 8) break
    merged.push(d)
  }
  merged.sort((a, b) => {
    const aApi = !a.sourceProposalId?.startsWith('prop:')
    const bApi = !b.sourceProposalId?.startsWith('prop:')
    if (aApi !== bApi) return aApi ? -1 : 1
    return b.confidence - a.confidence
  })
  return merged.slice(0, SECONDARY_ZONE_MAX_VISIBLE + 8)
}

export function filterVisibleSecondaryCandidates(
  candidates: PortalSecondaryImportCandidate[],
  dismissed: Set<string>,
  promotedSourceIds: Set<string>
): PortalSecondaryImportCandidate[] {
  const out: PortalSecondaryImportCandidate[] = []
  for (const c of candidates) {
    if (dismissed.has(c.candidateId)) continue
    if (c.sourceProposalId && promotedSourceIds.has(c.sourceProposalId)) continue
    out.push(c)
    if (out.length >= SECONDARY_ZONE_MAX_VISIBLE) break
  }
  return out
}

export function newSecondaryCandidateProposalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `ts-sec-${crypto.randomUUID()}`
  }
  return `ts-sec-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function buildTaskProposalFromSecondaryCandidate(
  c: PortalSecondaryImportCandidate,
  _provenance: PortalImportProposalBundle['provenance']
): PortalTaskProposal {
  const today = new Date().toISOString().slice(0, 10)
  return {
    proposalId: newSecondaryCandidateProposalId(),
    kind: 'task',
    sourceId: c.candidateId,
    originalSourceType: 'tankestrom_secondary_candidate',
    confidence: Math.max(0.5, Math.min(0.72, c.confidence + 0.08)),
    task: {
      date: c.date && /^\d{4}-\d{2}-\d{2}$/.test(c.date) ? c.date : today,
      title: c.title.trim(),
      notes: c.notes?.trim() || c.summary?.trim() || undefined,
      dueTime: undefined,
      childPersonId: '',
      assignedToPersonId: undefined,
      taskIntent: 'must_do',
    },
  }
}

export function buildEventProposalFromSecondaryCandidate(
  c: PortalSecondaryImportCandidate,
  provenance: PortalImportProposalBundle['provenance']
): PortalEventProposal {
  const today = new Date().toISOString().slice(0, 10)
  const date = c.date && /^\d{4}-\d{2}-\d{2}$/.test(c.date) ? c.date : today
  return {
    proposalId: newSecondaryCandidateProposalId(),
    kind: 'event',
    sourceId: c.candidateId,
    originalSourceType: 'tankestrom_secondary_candidate',
    confidence: Math.max(0.5, Math.min(0.72, c.confidence + 0.08)),
    event: {
      date,
      personId: '',
      title: c.title.trim(),
      start: '09:00',
      end: '10:00',
      notes: c.notes?.trim() || c.summary?.trim() || undefined,
      location: undefined,
      reminderMinutes: undefined,
      recurrenceGroupId: undefined,
      metadata: {
        integration: {
          importRunId: provenance.importRunId,
          confidence: c.confidence,
          originalSourceType: 'tankestrom_secondary_candidate',
          sourceSystem: provenance.sourceSystem,
          proposalId: c.candidateId,
        },
      },
    },
  }
}
