import type { EmbeddedScheduleSegment } from '../types'
import type { PortalEventProposal, PortalProposalItem, PortalTaskProposal } from '../features/tankestrom/types'
import { addCalendarDaysOslo } from './osloCalendar'
import { semanticTitleCore } from './tankestromImportDedupe'

/**
 * Konservativ klient-side merge: mange helge-eventforslag fra cup/turnering → ett parent-event
 * med metadata.embeddedSchedule. Tasks røres ikke.
 */

/** Norske sammensetninger (f.eks. «Vårcupen») har ikke ordgrense før «cup» — unngå kun `\bcup\b`. */
const CUP_OR_TOURNAMENT_HINT =
  /(vårcup|høstcup|julecup|fotballcup|håndballcup|sponscup|minicup|\bcup\b|turnering|turnerings|tournament|stevne|seriespill|kampoppsett|spillprogram|mesterskap|fotballstevne|håndballstevne)/i

const CONDITIONAL_SEGMENT_HINT =
  /eventuell|ved avansement|avhengig|hvis vi|om vi\b|sluttspill|kvalif|usikker|kan bli|\bevt\.?\b/i

const MIN_EVENTS_IN_CLUSTER = 3
const MIN_DISTINCT_DATES = 2
const MAX_SEGMENTS = 15
const MAX_NOTES_LEN = 220

function debugEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_DEBUG_SCHOOL_IMPORT === 'true'
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `ts-emb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function osloWeekendFridayKey(dateKey: string): string | null {
  const w = new Date(`${dateKey}T12:00:00`).getDay()
  if (w === 5) return dateKey
  if (w === 6) return addCalendarDaysOslo(dateKey, -1)
  if (w === 0) return addCalendarDaysOslo(dateKey, -2)
  return null
}

function clusterKey(ev: PortalEventProposal): string | null {
  const fri = osloWeekendFridayKey(ev.event.date)
  if (!fri) return null
  return `${ev.event.personId}|${fri}`
}

function proposalAlreadyHasEmbeddedSchedule(ev: PortalEventProposal): boolean {
  const raw = ev.event.metadata?.embeddedSchedule
  return Array.isArray(raw) && raw.length > 0
}

function isAllDayTimes(start: string, end: string): boolean {
  const s = start.length > 5 ? start.slice(0, 5) : start
  const e = end.length > 5 ? end.slice(0, 5) : end
  return s === '00:00' && (e === '23:59' || e === '24:00')
}

function commonLocation(group: PortalEventProposal[]): string | undefined {
  const locs = group.map((g) => g.event.location?.trim()).filter(Boolean) as string[]
  if (locs.length === 0) return undefined
  const first = locs[0]!
  return locs.every((l) => l === first) ? first : undefined
}

function segmentTitleForDisplay(rawTitle: string): string {
  const core = semanticTitleCore(rawTitle)
  if (core.length < 3) return rawTitle.trim()
  return core.charAt(0).toLocaleUpperCase('nb-NO') + core.slice(1)
}

/** Fjerner dag-/helg-påsydde traillere («… – fredag», «… – informasjon for helgen») fra parent-tittel. */
const PARENT_TITLE_TRAILERS: RegExp[] = [
  /\s*[–—\-:]\s*informasjon for helgen\b.*$/i,
  /\s*[–—\-:]\s*praktisk info(?:rmation)?\b.*$/i,
  /\s*[–—\-:]\s*(?:uke|helg)\s+\d+.*$/i,
  /\s*[–—\-:]\s*(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)\b(?:\s+\d{1,2}\.?(?:\s+[a-zæøå]+)?(?:\s+\d{4})?)?\s*$/i,
  /\s+[–—\-]\s*(?:fredag|lørdag|søndag)\s*$/i,
]

/**
 * Gjør merged parent-tittel container-aktig (samme navn som arrangementet, ikke én dags overskrift).
 */
export function normalizeEmbeddedScheduleParentDisplayTitle(raw: string): {
  title: string
  wasDayLikeTitle: boolean
} {
  const original = raw.trim()
  if (!original) return { title: raw, wasDayLikeTitle: false }

  let stripped = original
  let prev = ''
  while (stripped !== prev) {
    prev = stripped
    for (const p of PARENT_TITLE_TRAILERS) {
      stripped = stripped.replace(p, '').trim()
    }
  }

  const core = semanticTitleCore(stripped)
  const titled =
    core.length >= 4
      ? core.charAt(0).toLocaleUpperCase('nb-NO') + core.slice(1)
      : stripped.length >= 2
        ? stripped
        : original

  const wasDayLikeTitle =
    original !== titled ||
    PARENT_TITLE_TRAILERS.some((p) => p.test(original)) ||
    /\s[–—\-]\s*(?:fredag|lørdag|søndag)\b/i.test(original)

  return { title: titled.length >= 2 ? titled : original, wasDayLikeTitle }
}

function pickParentTitle(
  cluster: PortalEventProposal[],
  dateMin: string,
  dateMax: string
): { title: string; wasDayLikeTitle: boolean } {
  const withHint = cluster
    .filter((c) => CUP_OR_TOURNAMENT_HINT.test(c.event.title))
    .sort((a, b) => b.confidence - a.confidence)
  const rawCandidate = withHint[0]?.event.title?.trim()
  if (rawCandidate) {
    return normalizeEmbeddedScheduleParentDisplayTitle(rawCandidate)
  }
  return { title: `Sportshelg (${dateMin} – ${dateMax})`, wasDayLikeTitle: false }
}

function buildSegments(cluster: PortalEventProposal[]): EmbeddedScheduleSegment[] {
  const sorted = [...cluster].sort((a, b) => {
    const d = a.event.date.localeCompare(b.event.date)
    if (d !== 0) return d
    return a.event.start.localeCompare(b.event.start)
  })
  const out: EmbeddedScheduleSegment[] = []
  for (const ev of sorted) {
    const rawTitle = ev.event.title.trim()
    const title = segmentTitleForDisplay(rawTitle)
    if (title.length < 2) continue

    const meta = ev.event.metadata
    const allDay =
      meta?.isAllDay === true || isAllDayTimes(ev.event.start, ev.event.end)

    const seg: EmbeddedScheduleSegment = {
      date: ev.event.date,
      title,
    }

    const blob = `${rawTitle}\n${ev.event.notes ?? ''}`
    if (CONDITIONAL_SEGMENT_HINT.test(blob)) {
      seg.isConditional = true
    }

    if (!allDay) {
      const ss = ev.event.start.length > 5 ? ev.event.start.slice(0, 5) : ev.event.start
      const ee = ev.event.end.length > 5 ? ev.event.end.slice(0, 5) : ev.event.end
      const hm = /^([01]\d|2[0-3]):[0-5]\d$/
      if (hm.test(ss)) seg.start = ss
      if (hm.test(ee)) seg.end = ee
    }

    const notes = ev.event.notes?.trim()
    if (notes && notes.length <= MAX_NOTES_LEN) seg.notes = notes

    out.push(seg)
  }
  return out
}

/**
 * Etter dedupe: slå sammen flate helge-eventforslag til ett parent-event med `embeddedSchedule`
 * når signalene er tydelige (cup/turnering/stevne, minst tre hendelser, minst to datoer, kun fre–søn).
 */
export function applyCupWeekendEmbeddedScheduleMerge(
  items: PortalProposalItem[],
  options?: { sourceText?: string }
): PortalProposalItem[] {
  const sourceBlob = (options?.sourceText ?? '').toLocaleLowerCase('nb-NO')
  const schools = items.filter((i) => i.kind === 'school_profile')
  const tasks = items.filter((i): i is PortalTaskProposal => i.kind === 'task')
  const events = items.filter((i): i is PortalEventProposal => i.kind === 'event')

  const byCluster = new Map<string, PortalEventProposal[]>()
  for (const e of events) {
    if (proposalAlreadyHasEmbeddedSchedule(e)) continue
    const key = clusterKey(e)
    if (!key) continue
    if (!byCluster.has(key)) byCluster.set(key, [])
    byCluster.get(key)!.push(e)
  }

  const removeIds = new Set<string>()
  const newParents: PortalEventProposal[] = []

  for (const group of byCluster.values()) {
    if (group.length < MIN_EVENTS_IN_CLUSTER) continue

    const distinctDates = [...new Set(group.map((g) => g.event.date))].sort()
    if (distinctDates.length < MIN_DISTINCT_DATES) continue

    const clusterText = [
      ...group.map((g) => `${g.event.title}\n${g.event.notes ?? ''}`),
      sourceBlob,
    ]
      .join('\n')
      .toLocaleLowerCase('nb-NO')

    if (!CUP_OR_TOURNAMENT_HINT.test(clusterText)) continue

    const segments = buildSegments(group)
    if (segments.length < MIN_EVENTS_IN_CLUSTER) continue
    if (segments.length > MAX_SEGMENTS) continue

    const dateMin = distinctDates[0]!
    const dateMax = distinctDates[distinctDates.length - 1]!
    const { title: parentTitle, wasDayLikeTitle: parentWasDayLikeTitle } = pickParentTitle(group, dateMin, dateMax)
    const confidence = Math.max(...group.map((g) => g.confidence))
    const template = group.sort((a, b) => b.confidence - a.confidence)[0]!
    const blockGroupId = newId()
    const proposalId = newId()

    const conditionalSegments = segments.filter((s) => s.isConditional).length

    const parent: PortalEventProposal = {
      proposalId,
      kind: 'event',
      sourceId: template.sourceId,
      originalSourceType: template.originalSourceType,
      confidence,
      externalRef: template.externalRef,
      calendarOwnerUserId: template.calendarOwnerUserId,
      event: {
        date: dateMin,
        personId: template.event.personId,
        title: parentTitle,
        start: '00:00',
        end: '23:59',
        notes: '',
        location: commonLocation(group) ?? '',
        reminderMinutes: null,
        metadata: {
          isAllDay: true,
          endDate: dateMax,
          embeddedSchedule: segments,
          blockGroupId,
        },
      },
    }

    for (const g of group) removeIds.add(g.proposalId)
    newParents.push(parent)

    if (debugEnabled()) {
      console.debug('[tankestrom embedded schedule merge]', {
        embeddedScheduleCandidateDetected: true,
        embeddedScheduleSegmentsBuilt: segments.length,
        embeddedScheduleParentEventBuilt: {
          proposalId,
          title: parentTitle,
          dateMin,
          dateMax,
          blockGroupId,
        },
        embeddedScheduleParentTitleNormalized: parentTitle,
        embeddedScheduleParentWasDayLikeTitle: parentWasDayLikeTitle,
        embeddedScheduleParentMetaNormalized: true,
        embeddedScheduleParentDisplayRange: `${dateMin}…${dateMax}`,
        embeddedScheduleConditionalSegments: conditionalSegments,
        embeddedScheduleTasksPreserved: tasks.length,
      })
    }
  }

  if (newParents.length === 0) return items

  const keptEvents = events.filter((e) => !removeIds.has(e.proposalId))
  return [...schools, ...newParents, ...keptEvents, ...tasks]
}
