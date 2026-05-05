import type { Event, EventMetadata } from '../types'
import type { PortalEventProposal } from '../features/tankestrom/types'
import {
  isEmbeddedScheduleParentProposalItem,
  parseEmbeddedScheduleFromMetadata,
} from './embeddedSchedule'
import { getEventEndDate, isAllDayEvent } from './eventLayer'
import { getEventParticipantIds } from './schedule'
import { semanticTitleCore } from './tankestromImportDedupe'

export type AnchoredExistingEvent = { event: Event; anchorDate: string }

export type ExistingEventMatchStatus = 'exact' | 'learned' | 'probable'

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

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

function dateToUtcMidnightMs(d: string): number {
  const [y, m, day] = d.split('-').map(Number)
  return Date.UTC(y, m - 1, day)
}

function daysBetweenDates(a: string, b: string): number {
  return Math.round((dateToUtcMidnightMs(a) - dateToUtcMidnightMs(b)) / 86400000)
}

function addDaysIso(d: string, delta: number): string {
  const ms = dateToUtcMidnightMs(d) + delta * 86400000
  const dt = new Date(ms)
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const day = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function iterateDaysInclusive(start: string, end: string): string[] {
  const out: string[] = []
  let cur = start
  let guard = 0
  while (cur <= end && guard < 400) {
    out.push(cur)
    if (cur === end) break
    cur = addDaysIso(cur, 1)
    guard += 1
  }
  return out
}

function dateRangesOverlap(a0: string, a1: string, b0: string, b1: string): boolean {
  return a1 >= b0 && a0 <= b1
}

export function readArrangementStableKey(meta: unknown): string | undefined {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return undefined
  const raw = (meta as Record<string, unknown>).arrangementStableKey
  if (typeof raw !== 'string') return undefined
  const t = raw.trim()
  return t.length > 0 ? t : undefined
}

export function readUpdateIntentLikelyFollowup(meta: unknown): boolean {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false
  const ui = (meta as Record<string, unknown>).updateIntent
  if (!ui || typeof ui !== 'object' || Array.isArray(ui)) return false
  return (ui as Record<string, unknown>).likelyFollowup === true
}

export function readArrangementCoreTitle(meta: unknown): string | undefined {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return undefined
  const raw = (meta as Record<string, unknown>).arrangementCoreTitle
  if (typeof raw !== 'string') return undefined
  const t = raw.trim()
  return t.length > 0 ? t : undefined
}

export function readArrangementBlockGroupId(meta: unknown): string | undefined {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return undefined
  const raw = (meta as Record<string, unknown>).arrangementBlockGroupId
  if (typeof raw !== 'string') return undefined
  const t = raw.trim()
  return t.length > 0 ? t : undefined
}

function getIncomingArrangementRange(
  proposal: PortalEventProposal,
  importStart: string,
  importEnd: string
): { start: string; end: string } {
  const dates = [importStart, importEnd].filter((d) => DATE_KEY.test(d))
  const meta = proposal.event.metadata
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    for (const seg of parseEmbeddedScheduleFromMetadata(meta as EventMetadata)) {
      dates.push(seg.date)
    }
  }
  const sorted = [...new Set(dates)].filter((d) => DATE_KEY.test(d)).sort()
  if (sorted.length === 0) return { start: importStart, end: importEnd }
  return { start: sorted[0]!, end: sorted[sorted.length - 1]! }
}

function embeddedScheduleContainsOrNearDate(
  schedule: ReturnType<typeof parseEmbeddedScheduleFromMetadata>,
  day: string,
  slackDays: number
): boolean {
  for (const seg of schedule) {
    if (!DATE_KEY.test(seg.date)) continue
    if (seg.date === day) return true
    if (Math.abs(daysBetweenDates(seg.date, day)) <= slackDays) return true
  }
  return false
}

/**
 * Tolerant dato-sjekk for flerdags/import med program: overlapp, program som dekker eksisterende dag,
 * eller ±3 dager når incoming har oppfølgingsintent.
 */
export function dateCompatibleForArrangement(
  proposal: PortalEventProposal,
  importStart: string,
  importEnd: string,
  anchor: AnchoredExistingEvent,
  likelyFollowup: boolean
): boolean {
  const { event, anchorDate } = anchor
  const exStart = anchorDate
  const exEnd = getEventEndDate(event, anchorDate)
  const inc = getIncomingArrangementRange(proposal, importStart, importEnd)

  if (dateRangesOverlap(inc.start, inc.end, exStart, exEnd)) return true

  const meta = proposal.event.metadata
  const sched =
    meta && typeof meta === 'object' && !Array.isArray(meta)
      ? parseEmbeddedScheduleFromMetadata(meta as EventMetadata)
      : []

  if (sched.length > 0) {
    const slack = 3
    for (const day of iterateDaysInclusive(exStart, exEnd)) {
      if (embeddedScheduleContainsOrNearDate(sched, day, slack)) return true
    }
  }

  if (likelyFollowup) {
    if (Math.abs(daysBetweenDates(inc.start, exStart)) <= 3) return true
    if (Math.abs(daysBetweenDates(inc.end, exStart)) <= 3) return true
    if (Math.abs(daysBetweenDates(inc.start, exEnd)) <= 3) return true
    if (Math.abs(daysBetweenDates(inc.end, exEnd)) <= 3) return true
  }

  return false
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

function titleDetailToReason(detail: string): string | null {
  if (detail.includes('exact_core')) return 'Lignende eller samme arrangementsnavn'
  if (detail.includes('substring_core') || detail.includes('token_overlap')) return 'Lignende arrangementsnavn'
  return null
}

function buildHeuristicMatchReasons(opts: {
  titleDetail: string
  locationMatch: boolean
  likelyFollowup: boolean
  canBackfillStable: boolean
  usedEmbeddedScheduleDateTolerance: boolean
}): string[] {
  const reasons: string[] = ['Samme barn/person']
  const tr = titleDetailToReason(opts.titleDetail)
  if (tr) reasons.push(tr)
  if (opts.locationMatch) reasons.push('Samme sted')
  reasons.push(
    opts.usedEmbeddedScheduleDateTolerance
      ? 'Dato overlapper, ligger i programmet eller er nær'
      : 'Dato overlapper eller ligger nær'
  )
  if (opts.likelyFollowup) reasons.push('Teksten ser ut som oppfølgingsinformasjon')
  if (opts.canBackfillStable) {
    reasons.push('Eksisterende arrangement mangler stableKey, men kan kobles nå')
  }
  return reasons
}

export type ExistingEventMatchResult = {
  candidate: AnchoredExistingEvent | null
  score: number
  rejected: boolean
  rejectReason?: string
  /** True når import har arrangementStableKey og treff mangler det — skal backfilles ved update. */
  learnedStableKey?: boolean
  matchStatus?: ExistingEventMatchStatus
  reasons?: string[]
  defaultAction?: 'update' | 'create'
}

const SUGGEST_MIN_SCORE = 78
/** Med incoming stableKey og uten nøkkel på treff: aksepter heuristikk ned til denne (bakoverkompatibel læring). */
export const LEARN_STABLE_KEY_MIN_SCORE_WITH_KEY = 55
/** Lavere gulv kun når incoming har stableKey + likelyFollowup (læring/backfill). */
const LEARN_STABLE_KEY_MIN_SCORE_WITH_KEY_AND_FOLLOWUP = 45
const FOLLOWUP_CLUSTER_SCORE_BOOST = 16
const EXISTING_CONTAINER_ANCHOR_BONUS = 12

/**
 * Finn én konservativ kandidat: overlapp i dato (ev. program/oppfølging), delt person, sterk nok tittel + container-lik import og eksisterende.
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
    return { candidate: null, score: 0, rejected: true, rejectReason: 'not_event', defaultAction: 'create' }
  }

  const incomingStableKey = readArrangementStableKey(proposal.event.metadata)
  const likelyFollowup = readUpdateIntentLikelyFollowup(proposal.event.metadata)
  const learnMin =
    incomingStableKey && likelyFollowup
      ? LEARN_STABLE_KEY_MIN_SCORE_WITH_KEY_AND_FOLLOWUP
      : LEARN_STABLE_KEY_MIN_SCORE_WITH_KEY

  if (incomingStableKey) {
    for (const anchor of anchoredExisting) {
      const existingStableKey = readArrangementStableKey(anchor.event.metadata)
      if (!existingStableKey || existingStableKey !== incomingStableKey) continue
      const { event, anchorDate } = anchor
      if (!dateCompatibleForArrangement(proposal, importStartDate, importEndDate, anchor, likelyFollowup)) continue
      const participants = getEventParticipantIds(event)
      if (!participants.includes(importPersonId)) continue
      if (dbg) {
        console.debug('[tankestrom existing event match]', {
          existingEventCandidateMatched: true,
          existingEventCandidateScore: 100,
          arrangementStableKeyMatch: true,
          stableKeyMatched: true,
          matchReason: 'stable_key_match',
          titleDetail: 'stable_key_match',
          eventId: event.id,
          anchorDate,
          arrangementStableKey: incomingStableKey,
        })
      }
      return {
        candidate: anchor,
        score: 100,
        rejected: false,
        matchStatus: 'exact',
        defaultAction: 'update',
        reasons: [
          'Samme arrangementsnøkkel',
          'Samme barn/person',
          'Dato overlapper, ligger i programmet eller er nær',
        ],
      }
    }
  }

  if (!importEventIsContainerLikeForMatching(proposal)) {
    if (dbg)
      console.debug('[tankestrom existing event match]', {
        existingEventCandidateRejected: true,
        existingEventCandidateScore: 0,
        reason: 'import_not_container_like',
      })
    return { candidate: null, score: 0, rejected: true, rejectReason: 'import_not_container', defaultAction: 'create' }
  }

  let best: {
    anchor: AnchoredExistingEvent
    score: number
    titleDetail: string
    containerLike: boolean
    clusterFollowUp: boolean
    locationMatch: boolean
    usedEmbeddedScheduleDateTolerance: boolean
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
    if (incomingStableKey) {
      const exKey = readArrangementStableKey(event.metadata)
      if (exKey && exKey !== incomingStableKey) continue
    }

    const containerLike = existingEventLooksLikeContainer(anchor)
    const clusterFollowUp = !containerLike && isFollowUpClusterDayRowAnchor(anchor)
    if (!containerLike && !clusterFollowUp) continue

    const exEnd = getEventEndDate(event, anchorDate)
    const naiveOverlap = dateRangesOverlap(importStartDate, importEndDate, anchorDate, exEnd)
    const expandedInc = getIncomingArrangementRange(proposal, importStartDate, importEndDate)
    const tolerantOverlap = dateCompatibleForArrangement(proposal, importStartDate, importEndDate, anchor, likelyFollowup)
    if (!tolerantOverlap) continue

    const usedEmbeddedScheduleDateTolerance = !naiveOverlap && tolerantOverlap

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
    const locationMatch = li.length > 2 && le.length > 2 && li === le
    if (locationMatch) score += 12

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

    if (expandedInc.end > importEndDate || expandedInc.start < importStartDate) {
      if (parseEmbeddedScheduleFromMetadata(proposal.event.metadata as EventMetadata).length > 0) {
        score += 4
      }
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

    const cand = {
      anchor,
      score,
      titleDetail,
      containerLike,
      clusterFollowUp,
      locationMatch,
      usedEmbeddedScheduleDateTolerance,
    }
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
    return { candidate: null, score: 0, rejected: true, rejectReason: 'no_candidate', defaultAction: 'create' }
  }

  const existingStableOnBest = readArrangementStableKey(best.anchor.event.metadata)
  const canBackfillStable = Boolean(incomingStableKey) && !existingStableOnBest

  const passesLearnFloor = !canBackfillStable || best.score >= learnMin
  const passesSuggestFloor = canBackfillStable || best.score >= SUGGEST_MIN_SCORE

  if (!passesLearnFloor || !passesSuggestFloor) {
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
        learnMin,
        canBackfillStable,
      })
    return { candidate: null, score: best.score, rejected: true, rejectReason: 'below_threshold', defaultAction: 'create' }
  }

  const learnedStableKey = canBackfillStable && best.score >= learnMin
  const matchStatus: ExistingEventMatchStatus = canBackfillStable ? 'learned' : 'probable'
  const reasons = buildHeuristicMatchReasons({
    titleDetail: best.titleDetail,
    locationMatch: best.locationMatch,
    likelyFollowup,
    canBackfillStable,
    usedEmbeddedScheduleDateTolerance: best.usedEmbeddedScheduleDateTolerance,
  })

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
      learnedStableKey,
      matchStatus,
      ...(learnedStableKey
        ? {
            existingEventStableKeyLearned: true,
            existingEventStableKeyBackfilled: true,
            arrangementStableKey: incomingStableKey,
            relaxedThresholdUsed: best.score < SUGGEST_MIN_SCORE,
            learnMin,
          }
        : {}),
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

  return {
    candidate: best.anchor,
    score: best.score,
    rejected: false,
    matchStatus,
    defaultAction: 'update',
    reasons,
    ...(learnedStableKey ? { learnedStableKey: true } : {}),
  }
}

/** Alias for tester og fremtidig API. */
export const findBestArrangementMatch = findConservativeExistingEventMatch
