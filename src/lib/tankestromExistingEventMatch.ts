import type { Event, EventMetadata } from '../types'
import type { PortalEventProposal } from '../features/tankestrom/types'
import { getEventEndDate, isAllDayEvent } from './eventLayer'
import { getEventParticipantIds } from './schedule'
import { semanticTitleCore } from './tankestromImportDedupe'
import { isEmbeddedScheduleParentProposalItem } from './embeddedSchedule'

export type AnchoredExistingEvent = { event: Event; anchorDate: string }

/**
 * Kjerne for «samme arrangement» ved oppfølgingsimport: fjerner mellomtittel « · …», dag-påsats og år,
 * deretter semanticTitleCore. Brukes kun i konservativ existing-match (ikke dedupe-nøkler).
 */
export function arrangementTitleCoreForMatch(raw: string): string {
  let t = raw.trim().replace(/\s*·\s*.+$/, '').trim()
  let prev = ''
  while (t !== prev) {
    prev = t
    t = t
      .replace(
        /\s*[–—-]\s*(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)\b(?:\s+og\s+(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag))?\s*$/i,
        ''
      )
      .trim()
  }
  t = semanticTitleCore(t)
  t = t.replace(/\s+\d{4}$/, '').trim()
  return t.replace(/\s+/g, ' ').trim()
}

function normLoc(s: string | undefined): string {
  return (s ?? '').toLocaleLowerCase('nb-NO').replace(/\s+/g, ' ').trim()
}

function dateRangesOverlap(a0: string, a1: string, b0: string, b1: string): boolean {
  return a1 >= b0 && a0 <= b1
}

/** Importert forslag oppfører seg som container / flerdagers (smal MVP-fokus). */
export function importEventIsContainerLikeForMatching(item: PortalEventProposal): boolean {
  if (item.kind !== 'event') return false
  if (isEmbeddedScheduleParentProposalItem(item)) return true
  const end = item.event.metadata && typeof item.event.metadata === 'object' ? item.event.metadata.endDate : undefined
  return typeof end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(end) && end !== item.event.date.trim()
}

export function existingEventLooksLikeContainer(anchor: AnchoredExistingEvent): boolean {
  const { event, anchorDate } = anchor
  const meta = event.metadata
  const sched =
    meta && typeof meta === 'object' && Array.isArray((meta as EventMetadata).embeddedSchedule)
      ? (meta as EventMetadata).embeddedSchedule!
      : []
  if (sched.length > 0) return true
  return getEventEndDate(event, anchorDate) > anchorDate
}

function scoreTitleCores(a: string, b: string, detailPrefix: string): { score: number; detail: string } | null {
  if (!a || !b) return null
  if (a === b) return { score: 48, detail: `${detailPrefix}exact_core` }
  if (a.length >= 8 && b.length >= 8 && (a.includes(b) || b.includes(a))) {
    return { score: 42, detail: `${detailPrefix}substring_core` }
  }
  const wa = new Set(a.split(' ').filter((w) => w.length > 2))
  const wb = new Set(b.split(' ').filter((w) => w.length > 2))
  if (wa.size === 0 || wb.size === 0) return null
  let inter = 0
  for (const w of wa) if (wb.has(w)) inter += 1
  const j = inter / Math.min(wa.size, wb.size)
  if (j >= 0.55) return { score: Math.round(22 + j * 18), detail: `${detailPrefix}token_overlap` }
  return null
}

function titleScore(importTitle: string, existingTitle: string): { score: number; detail: string } {
  const ar = arrangementTitleCoreForMatch(importTitle)
  const br = arrangementTitleCoreForMatch(existingTitle)
  if (ar.length >= 4 && br.length >= 4) {
    const r = scoreTitleCores(ar, br, 'title_arrangement_')
    if (r) return r
  }
  const a = semanticTitleCore(importTitle)
  const b = semanticTitleCore(existingTitle)
  if (!a || !b) return { score: 0, detail: 'weak_title' }
  const fallback = scoreTitleCores(a, b, 'title_semantic_')
  if (fallback) return fallback
  return { score: 0, detail: 'title_mismatch' }
}

/** Én kalender-rad (typisk cup-dag eksportert som barn) uten flerdagers-span og uten embeddedSchedule på raden. */
function isFollowUpClusterDayRowAnchor(anchor: AnchoredExistingEvent): boolean {
  const { event, anchorDate } = anchor
  const exEnd = getEventEndDate(event, anchorDate)
  if (exEnd !== anchorDate) return false
  const meta = event.metadata
  const sched =
    meta && typeof meta === 'object' && Array.isArray((meta as EventMetadata).embeddedSchedule)
      ? (meta as EventMetadata).embeddedSchedule!
      : []
  if (sched.length > 0) return false
  return true
}

export type ExistingEventMatchResult = {
  candidate: AnchoredExistingEvent | null
  score: number
  rejected: boolean
  rejectReason?: string
}

const SUGGEST_MIN_SCORE = 78
const FOLLOWUP_CLUSTER_SCORE_BOOST = 16
const EXISTING_CONTAINER_ANCHOR_BONUS = 12

/**
 * Finn én konservativ kandidat: overlapp i dato, delt person, sterk nok tittel + container-lik import og eksisterende.
 */
export function findConservativeExistingEventMatch(
  proposal: PortalEventProposal,
  importTitle: string,
  importStartDate: string,
  importEndDate: string,
  importPersonId: string,
  anchoredExisting: readonly AnchoredExistingEvent[]
): ExistingEventMatchResult {
  const dbg = import.meta.env.DEV || import.meta.env.VITE_DEBUG_SCHOOL_IMPORT === 'true'

  if (proposal.kind !== 'event') {
    if (dbg)
      console.debug('[tankestrom existing event match]', {
        existingEventCandidateRejected: true,
        existingEventCandidateScore: 0,
        reason: 'not_event_proposal',
      })
    return { candidate: null, score: 0, rejected: true, rejectReason: 'not_event' }
  }

  if (!importEventIsContainerLikeForMatching(proposal)) {
    if (dbg)
      console.debug('[tankestrom existing event match]', {
        existingEventCandidateRejected: true,
        existingEventCandidateScore: 0,
        reason: 'import_not_container_like',
      })
    return { candidate: null, score: 0, rejected: true, rejectReason: 'import_not_container' }
  }

  let best: {
    anchor: AnchoredExistingEvent
    score: number
    titleDetail: string
    containerLike: boolean
    clusterFollowUp: boolean
  } | null = null

  let overlapPersonAnchors = 0
  let missedStrongOverlap = false
  const scoredCandidatesForDebug: Array<{
    eventId: string
    anchorDate: string
    score: number
    titleDetail: string
    containerLike: boolean
    clusterFollowUp: boolean
    skippedReason?: string
  }> = []

  for (const anchor of anchoredExisting) {
    const { event, anchorDate } = anchor
    const containerLike = existingEventLooksLikeContainer(anchor)
    const clusterFollowUp = !containerLike && isFollowUpClusterDayRowAnchor(anchor)
    if (!containerLike && !clusterFollowUp) continue

    const exEnd = getEventEndDate(event, anchorDate)
    if (!dateRangesOverlap(importStartDate, importEndDate, anchorDate, exEnd)) continue

    const participants = getEventParticipantIds(event)
    if (!participants.includes(importPersonId)) continue

    overlapPersonAnchors += 1

    const { score: ts, detail: titleDetail } = titleScore(importTitle, event.title)
    if (ts < 32) {
      if (dbg)
        scoredCandidatesForDebug.push({
          eventId: event.id,
          anchorDate,
          score: 0,
          titleDetail,
          containerLike,
          clusterFollowUp,
          skippedReason: 'title_below_32',
        })
      continue
    }

    let score = ts + 30
    const li = normLoc(proposal.event.location)
    const le = normLoc(event.location)
    if (li.length > 2 && le.length > 2 && li === le) score += 12

    if (
      isEmbeddedScheduleParentProposalItem(proposal) &&
      Array.isArray(event.metadata?.embeddedSchedule) &&
      event.metadata.embeddedSchedule.length > 0
    ) {
      score += 14
    }

    if (isAllDayEvent(event) && (proposal.event.metadata?.isAllDay || proposal.event.metadata?.multiDayAllDay)) {
      score += 6
    }

    if (containerLike) {
      score += EXISTING_CONTAINER_ANCHOR_BONUS
    }
    if (clusterFollowUp) {
      score += FOLLOWUP_CLUSTER_SCORE_BOOST
    }

    if (dbg) {
      scoredCandidatesForDebug.push({
        eventId: event.id,
        anchorDate,
        score,
        titleDetail,
        containerLike,
        clusterFollowUp,
      })
    }

    const cand = { anchor, score, titleDetail, containerLike, clusterFollowUp }
    if (!best) {
      best = cand
      continue
    }

    const betterScore = score > best.score
    const tie = score === best.score
    const preferContainer = tie && cand.containerLike && !best.containerLike
    const preferEarlier =
      tie &&
      cand.containerLike === best.containerLike &&
      anchor.anchorDate.localeCompare(best.anchor.anchorDate) < 0

    if (betterScore || preferContainer || preferEarlier) {
      best = cand
    }
  }

  if (!best) {
    if (dbg) {
      console.debug('[tankestrom existing event match]', {
        existingEventCandidateRejected: true,
        existingEventCandidateScore: 0,
        existingEventMatchCandidateRejectedReason: 'no_candidate_passed_filters',
        reason: 'no_candidate_passed_filters',
        existingEventMatchCandidatesComputed: scoredCandidatesForDebug,
        existingEventMatchMissedDespiteStrongOverlap: overlapPersonAnchors > 0,
        overlapPersonAnchors,
      })
    }
    return { candidate: null, score: 0, rejected: true, rejectReason: 'no_candidate' }
  }

  if (best.score < SUGGEST_MIN_SCORE) {
    missedStrongOverlap = overlapPersonAnchors > 0
    if (dbg)
      console.debug('[tankestrom existing event match]', {
        existingEventCandidateRejected: true,
        existingEventCandidateScore: best.score,
        existingEventMatchCandidateRejectedReason: 'below_threshold',
        existingEventMatchCandidateScore: best.score,
        reason: 'below_threshold',
        titleDetail: best.titleDetail,
        existingEventMatchCandidatesComputed: scoredCandidatesForDebug,
        existingEventMatchMissedDespiteStrongOverlap: missedStrongOverlap,
        existingEventMatchTitleCoreNormalized: {
          import: arrangementTitleCoreForMatch(importTitle),
          existing: arrangementTitleCoreForMatch(best.anchor.event.title),
        },
      })
    return { candidate: null, score: best.score, rejected: true, rejectReason: 'below_threshold' }
  }

  if (dbg) {
    console.debug('[tankestrom existing event match]', {
      existingEventCandidateMatched: true,
      existingEventCandidateScore: best.score,
      existingEventMatchCandidateScore: best.score,
      existingEventMatchCandidateRejectedReason: null,
      existingEventLinkSuggested: true,
      existingEventMatchCandidatesComputed: scoredCandidatesForDebug,
      titleDetail: best.titleDetail,
      anchorDate: best.anchor.anchorDate,
      eventId: best.anchor.event.id,
      existingEventMatchSelectedTarget: {
        eventId: best.anchor.event.id,
        anchorDate: best.anchor.anchorDate,
      },
      existingEventMatchTitleCoreNormalized: {
        import: arrangementTitleCoreForMatch(importTitle),
        existing: arrangementTitleCoreForMatch(best.anchor.event.title),
      },
      existingEventMatchClusterHeuristicUsed: best.clusterFollowUp,
      existingEventMatchChildEventAccepted: best.clusterFollowUp,
      existingEventMatchThresholdAdjustedForFollowupDetail: best.clusterFollowUp,
      existingEventMatchUpdateTargetResolved: {
        eventId: best.anchor.event.id,
        anchorDate: best.anchor.anchorDate,
      },
    })
  }

  return { candidate: best.anchor, score: best.score, rejected: false }
}
