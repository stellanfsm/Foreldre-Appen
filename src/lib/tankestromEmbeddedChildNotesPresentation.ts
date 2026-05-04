/**
 * Presentasjon av delprogram-barns notater i import-review (kun UI — ingen persistede endringer).
 * Høydepunkter: klokkeslett fra notat (prioritert) sortert og deduplisert; segment-vindu undertrykkes når konkrete tider finnes i tekst.
 */

import type { EmbeddedScheduleSegment } from '../types'
import { semanticTitleCore } from './tankestromImportDedupe'
import { normalizeNotesDedupeKey, stripRedundantHighlightsForReviewDisplay } from './tankestromReviewNotesDisplay'

/** Linje som starter med klokkeslett (valgfritt punktmerke / «kl.»). */
const HM_START =
  /^\s*(?:(?:[•\-\*]|\d+[\.)])\s*)?(?:kl\.?\s*)?([01]?\d|2[0-3]):([0-5]\d)(?:\s*[–—\-]\s*([01]?\d|2[0-3]):([0-5]\d))?\s*(.*)$/i

/** «Kamp kl. 09:20» / «Kampstart kl. 18:40. Mer tekst» — tid avsluttes med ordgrense. */
const KL_SUFFIX =
  /^(.+?)\s+kl\.?\s*([01]?\d|2[0-3]):([0-5]\d)\b\s*(.*)$/i

const SECTION_HEADER_ONLY =
  /^\s*(?:høydepunkt(?:er)?|notater|husk|frister|praktisk|detaljer|dagsprogram|program|informasjon)\s*:?\s*$/i

/** Ledende seksjonsord midt i linje (etter klokkeslett eller i notat). */
const LEADING_SECTION_PREFIX =
  /^\s*(?:høydepunkt(?:er)?|notater|status|husk|frister|praktisk|detaljer|dagsprogram|program|informasjon)\s*:\s*/i

const SYNTHETIC_CLOCK = new Set(['00:00', '06:00', '23:59'])

const TIME_TOKEN = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g

type HighlightSource = 'note' | 'segment'

type InternalHighlight = EmbeddedChildHighlight & { _source: HighlightSource }

function hmToSortMinutes(h: string, m: string): number {
  const hh = String(parseInt(h, 10)).padStart(2, '0')
  return parseInt(hh, 10) * 60 + parseInt(m, 10)
}

function padHm(h: string, m: string): string {
  const hh = String(parseInt(h, 10)).padStart(2, '0')
  const mm = m.length === 1 ? `0${m}` : m.slice(0, 2)
  return `${hh}:${mm}`
}

/** Fjern gjentatte seksjonsord fra start av streng (f.eks. «Notater: Notater: …»). */
export function stripEmbeddedChildSectionPrefixesFromLine(line: string): { text: string; stripped: boolean } {
  let s = line.trim()
  let stripped = false
  for (let i = 0; i < 5 && LEADING_SECTION_PREFIX.test(s); i++) {
    s = s.replace(LEADING_SECTION_PREFIX, '').trim()
    stripped = true
  }
  return { text: s, stripped }
}

function cleanHighlightLabel(label: string): string {
  if (label.trim() === '—') return '—'
  let { text } = stripEmbeddedChildSectionPrefixesFromLine(label)
  if (!text) return '—'
  return text
}

function cleanNoteLine(line: string): string {
  const { text } = stripEmbeddedChildSectionPrefixesFromLine(line)
  return text
}

export type EmbeddedChildHighlight = {
  timeStart: string
  timeEnd?: string
  label: string
  displayTime: string
  sortMinutes: number
}

export type EmbeddedChildNotesPresentation =
  | {
      mode: 'structured'
      highlights: EmbeddedChildHighlight[]
      noteLines: string[]
    }
  | {
      mode: 'plain'
      notesText: string
    }

function segmentClockParts(seg: EmbeddedScheduleSegment): {
  start: string
  end?: string
  sortMinutes: number
  displayTime: string
} | null {
  const rawS = seg.start?.trim()
  if (!rawS || !/^([01]\d|2[0-3]):[0-5]\d/.test(rawS.slice(0, 5))) return null
  const s = rawS.slice(0, 5)
  if (SYNTHETIC_CLOCK.has(s)) return null
  const rawE = seg.end?.trim()
  let end: string | undefined
  if (rawE && /^([01]\d|2[0-3]):[0-5]\d/.test(rawE.slice(0, 5))) {
    const e = rawE.slice(0, 5)
    if (e !== s && e !== '23:59' && e !== '24:00') end = e
  }
  const displayTime = end ? `${s}–${end}` : s
  const [sh, sm] = [s.slice(0, 2), s.slice(3, 5)]
  return { start: s, end, sortMinutes: hmToSortMinutes(sh, sm), displayTime }
}

/**
 * Når notat beskriver oppmøte relativt til «første kamp» og segment-slutt = aktivitetstid,
 * er «start–slutt» ofte misvisende (ikke varighet). Vis kun oppmøte/start i presentasjon.
 */
function applyChildReviewClockPolicy(
  seg: EmbeddedScheduleSegment,
  parts: NonNullable<ReturnType<typeof segmentClockParts>>
): { clock: NonNullable<ReturnType<typeof segmentClockParts>>; durationSuppressed: boolean } {
  const raw = typeof seg.notes === 'string' ? seg.notes.trim() : ''
  if (raw.length < 20) return { clock: parts, durationSuppressed: false }
  if (!relativeOffsetContextOk(raw)) return { clock: parts, durationSuppressed: false }
  const anchor = findActivityAnchorHm(raw)
  if (!anchor || !parts.end || parts.end !== anchor) return { clock: parts, durationSuppressed: false }
  return {
    clock: { ...parts, end: undefined, displayTime: parts.start },
    durationSuppressed: true,
  }
}

/** Klokkeslett for liste/detalj i import-review (samme syntetikk-filter som segmentClockParts + review-policy). */
const CONSERVATIVE_CALENDAR_SLOT_MINUTES = 60
/** Maks plausibel varighet for ett delprogram-segment i kalender (undertrykk «hele dagen»-vinduer). */
const MAX_REASONABLE_EMBEDDED_SEGMENT_SPAN_MINUTES = 12 * 60

function addMinutesToHmClamp(hm: string, addMinutes: number): string {
  const total = hmStringToMinutes(hm.slice(0, 5)) + addMinutes
  const clamped = Math.min(Math.max(0, total), 23 * 60 + 59)
  const nh = Math.floor(clamped / 60)
  const nm = clamped % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

function normalizeHmFive(hm: string): string {
  const t = hm.trim().slice(0, 5)
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return t
  return `${t.slice(0, 2)}:${t.slice(3, 5)}`
}

export type EmbeddedScheduleChildExportTimePolicy =
  | 'derived_meeting_conservative_end'
  | 'segment_pair_sanitized'
  | 'segment_start_conservative_end'
  | 'duration_suppressed_conservative_end'
  | 'broad_window_rejected_conservative_end'
  | 'no_safe_segment_clock_default_slot'

/**
 * Klokkeslett for kalender-persistens: samme signaler som import-review (avledet oppmøte,
 * undertrykt misvisende varighet, syntetiske starttider, for brede segment-vinduer).
 */
export function resolveEmbeddedScheduleSegmentTimesForCalendarExport(
  seg: EmbeddedScheduleSegment,
  opts?: { childProposalId?: string }
): {
  start: string
  end: string
  embeddedScheduleChildExportTimePolicyUsed: EmbeddedScheduleChildExportTimePolicy
  embeddedScheduleChildExportDerivedMeetingTimeApplied: boolean
  embeddedScheduleChildExportDurationSuppressed: boolean
  embeddedScheduleChildExportSyntheticTimeSkipped: boolean
  embeddedScheduleChildExportTimeNormalized: boolean
} {
  const dbg = import.meta.env.DEV || import.meta.env.VITE_DEBUG_SCHOOL_IMPORT === 'true'
  const log = (payload: Record<string, unknown>) => {
    if (dbg) console.debug('[tankestrom embedded schedule child export time]', payload)
  }

  const derived = tryDeriveOppmoteStartFromSegmentNotes(seg, opts)
  if (derived) {
    const start = normalizeHmFive(derived.displayClock)
    const end = addMinutesToHmClamp(start, CONSERVATIVE_CALENDAR_SLOT_MINUTES)
    const out = {
      start,
      end,
      embeddedScheduleChildExportTimePolicyUsed: 'derived_meeting_conservative_end' as const,
      embeddedScheduleChildExportDerivedMeetingTimeApplied: true,
      embeddedScheduleChildExportDurationSuppressed: true,
      embeddedScheduleChildExportSyntheticTimeSkipped: false,
      embeddedScheduleChildExportTimeNormalized: true,
    }
    log({
      ...out,
      embeddedScheduleChildExportTimeNormalized: out.embeddedScheduleChildExportTimeNormalized,
      ...opts,
    })
    return out
  }

  const parts = segmentClockParts(seg)
  if (!parts) {
    const start = '09:00'
    const end = addMinutesToHmClamp(start, CONSERVATIVE_CALENDAR_SLOT_MINUTES)
    const out = {
      start,
      end,
      embeddedScheduleChildExportTimePolicyUsed: 'no_safe_segment_clock_default_slot' as const,
      embeddedScheduleChildExportDerivedMeetingTimeApplied: false,
      embeddedScheduleChildExportDurationSuppressed: false,
      embeddedScheduleChildExportSyntheticTimeSkipped: true,
      embeddedScheduleChildExportTimeNormalized: true,
    }
    log({ ...out, ...opts })
    return out
  }

  const { clock: adjusted, durationSuppressed } = applyChildReviewClockPolicy(seg, parts)
  let endHm = adjusted.end
  let broadWindowRejected = false

  if (endHm) {
    if (SYNTHETIC_CLOCK.has(endHm)) {
      endHm = undefined
    } else if (hmStringToMinutes(endHm) <= hmStringToMinutes(adjusted.start)) {
      endHm = undefined
    } else if (
      hmStringToMinutes(endHm) - hmStringToMinutes(adjusted.start) >
      MAX_REASONABLE_EMBEDDED_SEGMENT_SPAN_MINUTES
    ) {
      endHm = undefined
      broadWindowRejected = true
    }
  }

  const start = normalizeHmFive(adjusted.start)
  if (!endHm) {
    const end = addMinutesToHmClamp(start, CONSERVATIVE_CALENDAR_SLOT_MINUTES)
    const policy: EmbeddedScheduleChildExportTimePolicy = durationSuppressed
      ? 'duration_suppressed_conservative_end'
      : broadWindowRejected
        ? 'broad_window_rejected_conservative_end'
        : 'segment_start_conservative_end'
    const out = {
      start,
      end,
      embeddedScheduleChildExportTimePolicyUsed: policy,
      embeddedScheduleChildExportDerivedMeetingTimeApplied: false,
      embeddedScheduleChildExportDurationSuppressed: durationSuppressed,
      embeddedScheduleChildExportSyntheticTimeSkipped: false,
      embeddedScheduleChildExportTimeNormalized:
        durationSuppressed || broadWindowRejected || !parts.end || Boolean(adjusted.end && !endHm),
    }
    log({ ...out, segmentRawEnd: seg.end ?? null, ...opts })
    return out
  }

  const end = normalizeHmFive(endHm)
  const out = {
    start,
    end,
    embeddedScheduleChildExportTimePolicyUsed: 'segment_pair_sanitized' as const,
    embeddedScheduleChildExportDerivedMeetingTimeApplied: false,
    embeddedScheduleChildExportDurationSuppressed: false,
    embeddedScheduleChildExportSyntheticTimeSkipped: false,
    embeddedScheduleChildExportTimeNormalized:
      normalizeHmFive(parts.start) !== start ||
      (parts.end != null && normalizeHmFive(parts.end) !== end),
  }
  log({ ...out, ...opts })
  return out
}

export function embeddedScheduleChildReviewListTimeClock(seg: EmbeddedScheduleSegment): {
  clock: string | null
  omittedSynthetic: boolean
  durationSuppressedAsUnknown: boolean
} {
  const rawS = seg.start?.trim()
  if (!rawS || !/^([01]\d|2[0-3]):[0-5]\d/.test(rawS.slice(0, 5))) {
    return { clock: null, omittedSynthetic: true, durationSuppressedAsUnknown: false }
  }
  const s = rawS.slice(0, 5)
  if (SYNTHETIC_CLOCK.has(s)) {
    return { clock: null, omittedSynthetic: true, durationSuppressedAsUnknown: false }
  }
  const parts = segmentClockParts(seg)
  if (!parts) return { clock: null, omittedSynthetic: true, durationSuppressedAsUnknown: false }
  const { clock: adjusted, durationSuppressed } = applyChildReviewClockPolicy(seg, parts)
  return {
    clock: adjusted.displayTime,
    omittedSynthetic: false,
    durationSuppressedAsUnknown: durationSuppressed,
  }
}

function toPublicHighlight(h: InternalHighlight): EmbeddedChildHighlight {
  return {
    timeStart: h.timeStart,
    timeEnd: h.timeEnd,
    label: h.label,
    displayTime: h.displayTime,
    sortMinutes: h.sortMinutes,
  }
}

function leadingLineHighlight(line: string): InternalHighlight | null {
  const m = HM_START.exec(line.trim())
  if (!m) return null
  const h1 = m[1]!
  const min1 = m[2]!
  const h2 = m[3]
  const min2 = m[4]
  const rest = (m[5] ?? '').trim()
  const start = padHm(h1, min1)
  if (SYNTHETIC_CLOCK.has(start)) return null
  let timeEnd: string | undefined
  if (h2 != null && min2 != null) {
    const e = padHm(h2, min2)
    if (!SYNTHETIC_CLOCK.has(e) && e !== start) timeEnd = e
  }
  const [sh, sm] = [start.slice(0, 2), start.slice(3, 5)]
  const sortMinutes = hmToSortMinutes(sh, sm)
  const label = cleanHighlightLabel(rest.length > 0 ? rest : '—')
  const displayTime = timeEnd ? `${start}–${timeEnd}` : start
  return {
    timeStart: start,
    timeEnd,
    label,
    displayTime,
    sortMinutes,
    _source: 'note',
  }
}

function klSuffixParse(line: string): { highlight: InternalHighlight | null; remainder: string | null } {
  const m = KL_SUFFIX.exec(line.trim())
  if (!m) return { highlight: null, remainder: null }
  const before = m[1]!.trim()
  const start = padHm(m[2]!, m[3]!)
  if (SYNTHETIC_CLOCK.has(start)) return { highlight: null, remainder: null }
  const rawAfter = (m[4] ?? '').trim().replace(/^[\s.:–—-]+/, '').trim()
  const label = cleanHighlightLabel((before || '—').trim() || '—')
  const [sh, sm] = [start.slice(0, 2), start.slice(3, 5)]
  const highlight: InternalHighlight = {
    timeStart: start,
    label,
    displayTime: start,
    sortMinutes: hmToSortMinutes(sh, sm),
    _source: 'note',
  }
  const remainder = rawAfter.length >= 6 ? rawAfter : null
  return { highlight, remainder }
}

function cleanSlotBetweenTimes(
  slice: string,
  side: 'before' | 'after',
  hasNeighborTime: boolean
): string {
  let t = slice.trim()
  if (!t) return ''
  if (side === 'after' && hasNeighborTime) {
    t = t.replace(/\s+kl\.?\s*$/i, '').trim()
    t = t.replace(/\s+og\s*$/i, '').trim()
  }
  if (side === 'before') {
    t = t.replace(/^(?:[;,]\s*|\s*og\s+)+/i, '').trim()
    t = t.replace(/\s+kl\.?\s*$/i, '').trim()
  }
  return t.replace(/\s+/g, ' ').trim()
}

/**
 * Flere klokkeslett på én linje: én highlight per tid, etikett fra tekst **mellom** tidene
 * (unngår «09:20 Kamper kl. 15:10» på begge).
 */
function inlineTimeHighlights(line: string): {
  list: InternalHighlight[]
  remainder: string
  ambiguousAllEmpty: boolean
} {
  const trimmed = line.trim()
  const matches: { start: number; end: number; h: string; m: string }[] = []
  let m: RegExpExecArray | null
  TIME_TOKEN.lastIndex = 0
  while ((m = TIME_TOKEN.exec(trimmed)) !== null) {
    const t = padHm(m[1]!, m[2]!)
    if (SYNTHETIC_CLOCK.has(t)) continue
    matches.push({ start: m.index, end: m.index + m[0].length, h: m[1]!, m: m[2]! })
  }
  if (matches.length === 0) return { list: [], remainder: trimmed, ambiguousAllEmpty: false }

  const list: InternalHighlight[] = []
  for (let i = 0; i < matches.length; i++) {
    const mat = matches[i]!
    const prev = matches[i - 1]
    const next = matches[i + 1]
    const start = padHm(mat.h, mat.m)
    const afterRaw = trimmed.slice(mat.end, next?.start ?? trimmed.length)
    const beforeRaw = trimmed.slice(prev?.end ?? 0, mat.start)
    const after = cleanSlotBetweenTimes(afterRaw, 'after', Boolean(next))
    const before = cleanSlotBetweenTimes(beforeRaw, 'before', Boolean(prev))
    const beforeEndsWithKl = /\bkl\.?\s*$/i.test(beforeRaw.trim())
    const afterHasLetters = after.length > 0 && /[a-zæøåA-ZÆØÅ]/.test(after)
    const beforeHasLetters = before.length > 0 && /[a-zæøåA-ZÆØÅ]/.test(before)

    let label: string
    if (!beforeEndsWithKl && afterHasLetters) {
      label = after
    } else if (beforeHasLetters) {
      label = before
    } else if (afterHasLetters) {
      label = after
    } else {
      label = '—'
    }

    if (i > 0 && label !== '—') {
      const prevLab = list[list.length - 1]!.label
      if (normalizeNotesDedupeKey(label) === normalizeNotesDedupeKey(prevLab)) {
        label = '—'
      }
    }

    const [sh, sm] = [start.slice(0, 2), start.slice(3, 5)]
    list.push({
      timeStart: start,
      label: cleanHighlightLabel(label),
      displayTime: start,
      sortMinutes: hmToSortMinutes(sh, sm),
      _source: 'note',
    })
  }

  let ambiguousAllEmpty = false
  if (matches.length >= 2) {
    const substantive = list.filter((h) => {
      const L = cleanHighlightLabel(h.label)
      return L !== '—' && L.trim().length > 0
    })
    ambiguousAllEmpty = substantive.length === 0
  }

  let remainder = trimmed
  for (const mat of [...matches].sort((a, b) => b.start - a.start)) {
    remainder = `${remainder.slice(0, mat.start)} ${remainder.slice(mat.end)}`
  }
  remainder = remainder
    .replace(/\bkl\.?\s*/gi, '')
    .replace(/[;,]\s*[;,]/g, ',')
    .replace(/\s+/g, ' ')
    .trim()

  return { list, remainder, ambiguousAllEmpty }
}

function countConcreteTimesInLine(line: string): number {
  let c = 0
  TIME_TOKEN.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TIME_TOKEN.exec(line)) !== null) {
    const t = padHm(m[1]!, m[2]!)
    if (!SYNTHETIC_CLOCK.has(t)) c += 1
  }
  return c
}

function parseLineForNoteHighlights(line: string): {
  highlights: InternalHighlight[]
  noteRemainder: string | null
  inlineMultiTime?: boolean
  inlineMultiAmbiguous?: boolean
} {
  if (countConcreteTimesInLine(line) >= 2) {
    const { list, remainder, ambiguousAllEmpty } = inlineTimeHighlights(line)
    if (ambiguousAllEmpty) {
      return {
        highlights: [],
        noteRemainder: line,
        inlineMultiTime: true,
        inlineMultiAmbiguous: true,
      }
    }
    const rem = remainder.length >= 6 ? remainder : null
    return { highlights: list, noteRemainder: rem, inlineMultiTime: true, inlineMultiAmbiguous: false }
  }

  const lead = leadingLineHighlight(line)
  if (lead) {
    return { highlights: [lead], noteRemainder: null }
  }
  const kl = klSuffixParse(line)
  if (kl.highlight) {
    return { highlights: [kl.highlight], noteRemainder: kl.remainder }
  }
  const { list, remainder, ambiguousAllEmpty } = inlineTimeHighlights(line)
  if (ambiguousAllEmpty) {
    return { highlights: [], noteRemainder: line, inlineMultiTime: true, inlineMultiAmbiguous: true }
  }
  if (list.length === 0) {
    return { highlights: [], noteRemainder: line }
  }
  const rem = remainder.length >= 6 ? remainder : null
  return { highlights: list, noteRemainder: rem }
}

/** Dedupe «18:40 Høydepunkter: Første kamp» med «18:40 Første kamp». */
function semanticHighlightDedupeKey(h: EmbeddedChildHighlight): string {
  const lab = cleanHighlightLabel(h.label)
  const core = semanticTitleCore(lab === '—' ? '' : lab)
  return `${h.timeStart}|${h.timeEnd ?? ''}|${normalizeNotesDedupeKey(core || lab)}`
}

function pickRicherHighlightLabel(a: string, b: string): string {
  const ca = cleanHighlightLabel(a)
  const cb = cleanHighlightLabel(b)
  if (ca === '—') return cb
  if (cb === '—') return ca
  const na = normalizeNotesDedupeKey(ca)
  const nb = normalizeNotesDedupeKey(cb)
  if (na === nb) return ca.length >= cb.length ? ca : cb
  if (na.includes(nb)) return ca
  if (nb.includes(na)) return cb
  return ca.length >= cb.length ? ca : cb
}

function fullLineDedupeKey(h: EmbeddedChildHighlight): string {
  return normalizeNotesDedupeKey(`${h.displayTime} ${h.label}`)
}

function suppressParentLikeNoteLine(line: string, parentTitle?: string): boolean {
  const p = parentTitle?.trim()
  if (!p || p.length < 4) return false
  const pc = normalizeNotesDedupeKey(p)
  const lc = normalizeNotesDedupeKey(line)
  if (lc === pc) return true
  if (lc.length >= pc.length && lc.startsWith(pc) && line.trim().length <= p.length + 10) return true
  const pCore = semanticTitleCore(p)
  const lCore = semanticTitleCore(line)
  if (pCore.length >= 8 && lCore === pCore && line.trim().length < 140) return true
  return false
}

function logChildNotesDebug(payload: Record<string, unknown>): void {
  if (!import.meta.env.DEV && import.meta.env.VITE_DEBUG_SCHOOL_IMPORT !== 'true') return
  console.debug('[tankestrom embedded child notes presentation]', payload)
}

function noteDuplicatesHighlight(line: string, highlights: EmbeddedChildHighlight[]): boolean {
  const cleaned = cleanNoteLine(line)
  const lk = normalizeNotesDedupeKey(line)
  const lineClean = normalizeNotesDedupeKey(cleaned)
  const lineCoreRaw = semanticTitleCore(cleaned)
  const lineCoreKey = lineCoreRaw.length >= 10 ? normalizeNotesDedupeKey(lineCoreRaw) : ''

  for (const h of highlights) {
    const labRaw = cleanHighlightLabel(h.label)
    if (lk === fullLineDedupeKey(h)) return true
    const lab = normalizeNotesDedupeKey(labRaw)
    const labCoreRaw = semanticTitleCore(labRaw === '—' ? '' : labRaw)
    const labCoreKey = labCoreRaw.length >= 10 ? normalizeNotesDedupeKey(labCoreRaw) : ''
    const fullClean = normalizeNotesDedupeKey(`${h.displayTime} ${labRaw}`)
    if (lab.length >= 4 && (lk === lab || lineClean === lab)) return true
    if (lineCoreKey && labCoreKey && lineCoreKey === labCoreKey) return true
    if (lk.includes(fullClean) && fullClean.length >= 10) return true
  }
  return false
}

type NearDuplicateNoteClass =
  | 'distinct'
  | 'identical_or_semantic'
  | 'keep_existing_drop_new'
  | 'replace_existing_with_new'

const NEAR_DUP_CONTAIN_MIN = 28

function classifyNearDuplicateNoteLines(a: string, b: string): NearDuplicateNoteClass {
  const ca = cleanNoteLine(a)
  const cb = cleanNoteLine(b)
  const ka = normalizeNotesDedupeKey(ca)
  const kb = normalizeNotesDedupeKey(cb)
  if (!ka || !kb) return 'distinct'
  if (ka === kb) return 'identical_or_semantic'

  const caCore = semanticTitleCore(ca)
  const cbCore = semanticTitleCore(cb)
  if (caCore.length >= 12 && cbCore.length >= 12 && caCore === cbCore) return 'identical_or_semantic'

  const shorter = ka.length <= kb.length ? ka : kb
  const longer = ka.length > kb.length ? ka : kb
  if (shorter.length >= NEAR_DUP_CONTAIN_MIN && longer.includes(shorter)) {
    return ka.length > kb.length ? 'keep_existing_drop_new' : 'replace_existing_with_new'
  }
  return 'distinct'
}

/**
 * Fjerner identiske og åpenbart like notatlinjer etter highlight-/tid-pruning.
 * Konservativ: krever lang nok «inneholder»-match (NEAR_DUP_CONTAIN_MIN) for å slå sammen.
 */
function dedupeChildReviewNoteLinesAmongSelves(lines: string[]): {
  lines: string[]
  exactDeduped: number
  semanticDeduped: number
} {
  let exactDeduped = 0
  const afterExact: string[] = []
  const seenKey = new Set<string>()
  for (const line of lines) {
    const k = normalizeNotesDedupeKey(cleanNoteLine(line))
    if (seenKey.has(k)) {
      exactDeduped += 1
      continue
    }
    seenKey.add(k)
    afterExact.push(line)
  }

  let semanticDeduped = 0
  const final: string[] = []
  for (const line of afterExact) {
    let skip = false
    let replaced = false
    for (let i = 0; i < final.length; i++) {
      const rel = classifyNearDuplicateNoteLines(final[i]!, line)
      if (rel === 'identical_or_semantic') {
        semanticDeduped += 1
        skip = true
        break
      }
      if (rel === 'keep_existing_drop_new') {
        semanticDeduped += 1
        skip = true
        break
      }
      if (rel === 'replace_existing_with_new') {
        final[i] = line
        semanticDeduped += 1
        replaced = true
        break
      }
    }
    if (skip) continue
    if (!replaced) final.push(line)
  }

  return { lines: final, exactDeduped, semanticDeduped }
}

/** Fjern notatlinjer som bare gjentar tider som allerede er i highlights. */
function pruneNoteLinesAgainstHighlights(
  lines: string[],
  highlights: EmbeddedChildHighlight[]
): { kept: string[]; removed: number } {
  let removed = 0
  const kept: string[] = []
  const timeKeys = new Set(highlights.map((h) => normalizeNotesDedupeKey(h.timeStart)))
  for (const h of highlights) {
    if (h.timeEnd) timeKeys.add(normalizeNotesDedupeKey(h.timeEnd))
  }

  for (const line of lines) {
    if (noteDuplicatesHighlight(line, highlights)) {
      removed += 1
      continue
    }
    let stripped = line
    for (const h of highlights) {
      stripped = stripped.replace(new RegExp(`\\b${h.timeStart.replace(':', '\\:')}\\b`, 'g'), ' ')
      if (h.timeEnd) stripped = stripped.replace(new RegExp(`\\b${h.timeEnd.replace(':', '\\:')}\\b`, 'g'), ' ')
    }
    stripped = stripped.replace(/\bkl\.?\s*/gi, ' ').replace(/\s+/g, ' ').trim()
    const onlyTimesLeft =
      stripped.length < 4 ||
      !/[a-zæøåA-ZÆØÅ]/.test(stripped) ||
      [...timeKeys].some((k) => k.length >= 4 && normalizeNotesDedupeKey(stripped) === k)

    if (onlyTimesLeft && /\d{1,2}:\d{2}/.test(line)) {
      removed += 1
      continue
    }
    kept.push(line)
  }
  return { kept, removed }
}

export function presentEmbeddedChildNotesForReview(args: {
  seg: EmbeddedScheduleSegment
  parentCardTitle?: string
  displayTitle: string
  childProposalId: string
}): EmbeddedChildNotesPresentation | null {
  const { seg, parentCardTitle, displayTitle, childProposalId } = args
  const raw = typeof seg.notes === 'string' ? seg.notes.trim() : ''
  if (!raw) return null

  const stripped = stripRedundantHighlightsForReviewDisplay(raw, {
    compareAgainst: displayTitle.trim() || undefined,
  })
  const text = (stripped.text ?? '').trim()
  if (!text) return null

  const lines = text.split(/\n/).map((l) => l.trim())
  const highlightsDraft: InternalHighlight[] = []
  const noteCandidates: string[] = []
  let sectionPrefixStripped = 0
  let inlineMultiTimeLineCount = 0
  let inlineMultiAmbiguousLineCount = 0

  for (const line of lines) {
    if (!line) continue
    if (SECTION_HEADER_ONLY.test(line)) continue

    const { highlights: fromLine, noteRemainder, inlineMultiTime, inlineMultiAmbiguous } =
      parseLineForNoteHighlights(line)
    if (inlineMultiTime) inlineMultiTimeLineCount += 1
    if (inlineMultiAmbiguous) inlineMultiAmbiguousLineCount += 1
    if (fromLine.length > 0) {
      for (const fh of fromLine) {
        const beforeLab = fh.label
        fh.label = cleanHighlightLabel(fh.label)
        if (beforeLab !== fh.label) sectionPrefixStripped += 1
        highlightsDraft.push(fh)
      }
      if (noteRemainder && noteRemainder.length >= 6) {
        const nr = cleanNoteLine(noteRemainder)
        const beforeN = noteRemainder.trim()
        if (beforeN !== nr) sectionPrefixStripped += 1
        if (nr.length >= 6) noteCandidates.push(nr)
      }
    } else {
      const cn = cleanNoteLine(line)
      if (cn.length > 0) {
        if (line.trim() !== cn) sectionPrefixStripped += 1
        noteCandidates.push(cn)
      }
    }
  }

  const segClockRaw = segmentClockParts(seg)
  let durationSuppressedAsUnknown = false
  let segClock: ReturnType<typeof segmentClockParts> = null
  if (segClockRaw) {
    const pol = applyChildReviewClockPolicy(seg, segClockRaw)
    segClock = pol.clock
    durationSuppressedAsUnknown = pol.durationSuppressed
  }
  let genericSegmentTimeSuppressed = false
  let concreteTimesPromoted = false

  if (segClock) {
    const hasNoteTimes = highlightsDraft.some((h) => h._source === 'note')
    if (hasNoteTimes) {
      genericSegmentTimeSuppressed = true
      concreteTimesPromoted = true
    } else {
      const label = cleanHighlightLabel((displayTitle.trim() || seg.title.trim() || '—').trim())
      highlightsDraft.push({
        timeStart: segClock.start,
        timeEnd: segClock.end,
        label,
        displayTime: segClock.displayTime,
        sortMinutes: segClock.sortMinutes,
        _source: 'segment',
      })
    }
  }

  const beforeDedupe = highlightsDraft.length
  const byKey = new Map<string, InternalHighlight>()
  let semanticHighlightDedupes = 0
  for (const h of highlightsDraft) {
    const k = semanticHighlightDedupeKey(h)
    const prev = byKey.get(k)
    if (prev) semanticHighlightDedupes += 1
    if (!prev) {
      byKey.set(k, { ...h })
    } else {
      const mergedLabel = pickRicherHighlightLabel(prev.label, h.label)
      byKey.set(k, {
        ...prev,
        label: cleanHighlightLabel(mergedLabel),
        _source: prev._source === 'note' || h._source === 'note' ? 'note' : prev._source,
      })
    }
  }
  let highlights = [...byKey.values()].sort((a, b) => a.sortMinutes - b.sortMinutes)

  if (highlights.length === 1 && highlights[0]!.label === '—') {
    highlights = []
  }

  let parentSuppressed = 0
  const filterParent = (ls: string[]): string[] => {
    const o: string[] = []
    for (const line of ls) {
      if (!line.trim()) continue
      if (SECTION_HEADER_ONLY.test(line)) continue
      if (suppressParentLikeNoteLine(line, parentCardTitle)) {
        parentSuppressed += 1
        continue
      }
      o.push(line.trim())
    }
    return o
  }

  const publicHighlights = highlights.map(toPublicHighlight)
  const useStructured = publicHighlights.length > 0

  if (useStructured) {
    const parentFiltered = filterParent(noteCandidates)
    let highlightDuplicateSuppressed = 0
    const afterHighlightDup: string[] = []
    for (const line of parentFiltered) {
      if (noteDuplicatesHighlight(line, publicHighlights)) {
        highlightDuplicateSuppressed += 1
        continue
      }
      afterHighlightDup.push(line)
    }
    const pruned = pruneNoteLinesAgainstHighlights(afterHighlightDup, publicHighlights)
    const among = dedupeChildReviewNoteLinesAmongSelves(pruned.kept)
    const noteLines = among.lines

    logChildNotesDebug({
      embeddedScheduleChildSectionPrefixStripped: sectionPrefixStripped > 0,
      embeddedScheduleChildHighlightDedupedSemantically: semanticHighlightDedupes > 0,
      embeddedScheduleChildGenericSegmentTimeSuppressed: genericSegmentTimeSuppressed,
      embeddedScheduleChildConcreteTimesPromoted: concreteTimesPromoted,
      embeddedScheduleChildHighlightsRenderedAsList: publicHighlights.length > 0,
      embeddedScheduleChildHighlightsRemovedFromNotes: pruned.removed > 0 || beforeDedupe > publicHighlights.length,
      embeddedScheduleChildTimeAccentApplied: publicHighlights.length > 0,
      embeddedScheduleChildHighlightsStructured: true,
      embeddedScheduleChildHighlightsDeduped: beforeDedupe > publicHighlights.length,
      embeddedScheduleChildHighlightsSorted: publicHighlights.length > 1,
      embeddedScheduleChildNotesSectionRendered: noteLines.length > 0,
      embeddedScheduleChildParentLikeTextSuppressed: parentSuppressed,
      embeddedScheduleChildNoteDedupedExact: among.exactDeduped,
      embeddedScheduleChildNoteDedupedSemantic: among.semanticDeduped,
      embeddedScheduleChildNoteDuplicateSuppressed:
        highlightDuplicateSuppressed + pruned.removed + among.exactDeduped + among.semanticDeduped,
      embeddedScheduleChildNotesAfterDedupeCount: noteLines.length,
      embeddedScheduleChildMultipleTimesParsed: inlineMultiTimeLineCount,
      embeddedScheduleChildMultipleTimesAmbiguous: inlineMultiAmbiguousLineCount,
      embeddedScheduleChildDurationSuppressedAsUnknown: durationSuppressedAsUnknown,
      embeddedScheduleChildSingleStartTimeDisplayed:
        publicHighlights.length > 0 &&
        publicHighlights.every((h) => !h.timeEnd && !h.displayTime.includes('–')),
      childProposalId,
      highlightCount: publicHighlights.length,
    })
    return { mode: 'structured', highlights: publicHighlights, noteLines }
  }

  const rawForPlain = filterParent(lines.filter(Boolean))
  let plainSectionStripped = 0
  const plainLines = rawForPlain
    .map((l) => {
      const cn = cleanNoteLine(l)
      if (l.trim() !== cn) plainSectionStripped += 1
      return cn
    })
    .filter(Boolean)
  const amongPlain = dedupeChildReviewNoteLinesAmongSelves(plainLines)
  const finalPlain = amongPlain.lines.join('\n').trim()
  if (!finalPlain) return null

  logChildNotesDebug({
    embeddedScheduleChildSectionPrefixStripped: plainSectionStripped > 0,
    embeddedScheduleChildHighlightDedupedSemantically: false,
    embeddedScheduleChildGenericSegmentTimeSuppressed: false,
    embeddedScheduleChildConcreteTimesPromoted: false,
    embeddedScheduleChildHighlightsRenderedAsList: false,
    embeddedScheduleChildHighlightsRemovedFromNotes: false,
    embeddedScheduleChildTimeAccentApplied: false,
    embeddedScheduleChildHighlightsStructured: false,
    embeddedScheduleChildNotesSectionRendered: true,
    embeddedScheduleChildParentLikeTextSuppressed: parentSuppressed,
    embeddedScheduleChildNoteDedupedExact: amongPlain.exactDeduped,
    embeddedScheduleChildNoteDedupedSemantic: amongPlain.semanticDeduped,
    embeddedScheduleChildNoteDuplicateSuppressed: amongPlain.exactDeduped + amongPlain.semanticDeduped,
    embeddedScheduleChildNotesAfterDedupeCount: amongPlain.lines.length,
    embeddedScheduleChildMultipleTimesParsed: inlineMultiTimeLineCount,
    embeddedScheduleChildMultipleTimesAmbiguous: inlineMultiAmbiguousLineCount,
    embeddedScheduleChildDurationSuppressedAsUnknown: false,
    embeddedScheduleChildSingleStartTimeDisplayed: false,
    childProposalId,
  })
  return { mode: 'plain', notesText: finalPlain }
}

export function presentationHasRenderableContent(p: EmbeddedChildNotesPresentation | null): boolean {
  if (!p) return false
  if (p.mode === 'plain') return p.notesText.trim().length > 0
  return p.highlights.length > 0 || p.noteLines.length > 0
}

function hmStringToMinutes(hm: string): number {
  return hmToSortMinutes(hm.slice(0, 2), hm.slice(3, 5))
}

function subtractMinutesFromHm(hm: string, delta: number): string | null {
  const total = hmStringToMinutes(hm) - delta
  if (total < 0 || total > 23 * 60 + 59) return null
  const nh = Math.floor(total / 60)
  const nm = total % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

/** Ett entydig minutt-tall før «før»; ellers null (f.eks. flere ulike verdier). */
function collectSingleOffsetMinutes(text: string): number | null {
  const found = new Set<number>()
  const re = /(\d{1,3})\s*min(?:utter|utt)?\s+før/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1]!, 10)
    if (n >= 5 && n <= 180) found.add(n)
  }
  if (/\ben\s*time\s+før\b/i.test(text)) found.add(60)
  if (/\bhalv\s*time\s+før\b/i.test(text)) found.add(30)
  if (found.size !== 1) return null
  return [...found][0]!
}

function relativeOffsetContextOk(text: string): boolean {
  return (
    /\boppmøte\b|\bmøtes?\b|\bmøt\s+opp\b|\bankomst\b|\binnfinn(?:ing|er)\b/i.test(text) ||
    /\d{1,3}\s*min(?:utter|utt)?\s+før\s+(?:kampstart|første\s+kamp|første\s+aktivitet|aktiviteten)\b/i.test(
      text
    ) ||
    /\b(?:senest|seneste|minimum)\s+\d{1,3}\s*min(?:utter|utt)?\s+før\b/i.test(text)
  )
}

function findActivityAnchorHm(notes: string): string | null {
  const t = notes.replace(/\r\n/g, '\n')
  const patterns: RegExp[] = [
    /første\s+(?:kamp|aktivitet)\D{0,120}?\b([01]?\d|2[0-3]):([0-5]\d)\b/i,
    /første\s+kamp\s+kl\.?\s*([01]?\d|2[0-3]):([0-5]\d)\b/i,
    /\b(?:kampstart|kamp)\s+kl\.?\s*([01]?\d|2[0-3]):([0-5]\d)\b/i,
    /\b([01]?\d|2[0-3]):([0-5]\d)\b(?=[^\n]{0,60}\b(?:første\s+)?kamp\b)/i,
  ]
  for (const p of patterns) {
    const m = p.exec(t)
    if (m) {
      const hm = padHm(m[1]!, m[2]!)
      if (!SYNTHETIC_CLOCK.has(hm)) return hm
    }
  }
  return null
}

/**
 * Utled visnings-klokkeslett for oppmøte (presentasjon): aktivitetstid minus offset.
 * Konservativ: krever ett tydelig minutt-tall, forankring til «første kamp»-lignende tid, og svak kontekst.
 */
export function tryDeriveOppmoteStartFromSegmentNotes(
  seg: EmbeddedScheduleSegment,
  opts?: { childProposalId?: string }
): { displayClock: string; anchorHm: string; offsetMinutes: number } | null {
  const dbg = import.meta.env.DEV || import.meta.env.VITE_DEBUG_SCHOOL_IMPORT === 'true'
  const log = (payload: Record<string, unknown>) => {
    if (dbg) console.debug('[tankestrom embedded child derived start]', payload)
  }

  const raw = typeof seg.notes === 'string' ? seg.notes.trim() : ''
  if (raw.length < 12) {
    log({ embeddedScheduleChildDerivedStartTimeSkipped: true, reason: 'notes_too_short', ...opts })
    return null
  }

  const offset = collectSingleOffsetMinutes(raw)
  if (offset == null) {
    log({ embeddedScheduleChildDerivedStartTimeSkipped: true, reason: 'offset_not_unique_or_missing', ...opts })
    return null
  }

  if (!relativeOffsetContextOk(raw)) {
    log({ embeddedScheduleChildDerivedStartTimeSkipped: true, reason: 'relative_context_weak', ...opts })
    return null
  }

  const anchor = findActivityAnchorHm(raw)
  if (!anchor) {
    log({ embeddedScheduleChildDerivedStartTimeSkipped: true, reason: 'no_activity_anchor', ...opts })
    return null
  }

  log({
    embeddedScheduleChildRelativeTimeSignalMatched: true,
    anchorHm: anchor,
    offsetMinutes: offset,
    ...opts,
  })

  const derived = subtractMinutesFromHm(anchor, offset)
  if (!derived) {
    log({ embeddedScheduleChildDerivedStartTimeSkipped: true, reason: 'subtract_out_of_range', ...opts })
    return null
  }

  if (hmStringToMinutes(derived) >= hmStringToMinutes(anchor)) {
    log({ embeddedScheduleChildDerivedStartTimeSkipped: true, reason: 'derived_not_before_anchor', ...opts })
    return null
  }

  log({
    embeddedScheduleChildDerivedStartTimeApplied: true,
    embeddedScheduleChildDerivedMeetingTimeApplied: true,
    displayClock: derived,
    anchorHm: anchor,
    offsetMinutes: offset,
    ...opts,
  })

  return { displayClock: derived, anchorHm: anchor, offsetMinutes: offset }
}
