/**
 * Presentasjon av delprogram-barns notater i import-review (kun UI — ingen persistede endringer).
 * Samler klokkeslett som «Høydepunkter», sorterer og dedupliserer; øvrig tekst under «Notater».
 */

import type { EmbeddedScheduleSegment } from '../types'
import { semanticTitleCore } from './tankestromImportDedupe'
import { normalizeNotesDedupeKey, stripRedundantHighlightsForReviewDisplay } from './tankestromReviewNotesDisplay'

/** Linje som starter med klokkeslett (valgfritt punktmerke / «kl.»). */
const HM_START =
  /^\s*(?:(?:[•\-\*]|\d+[\.)])\s*)?(?:kl\.?\s*)?([01]?\d|2[0-3]):([0-5]\d)(?:\s*[–—\-]\s*([01]?\d|2[0-3]):([0-5]\d))?\s*(.*)$/i

const SECTION_HEADER_ONLY =
  /^\s*(?:høydepunkt(?:er)?|notater|husk|frister|praktisk|detaljer|dagsprogram|program|informasjon)\s*:?\s*$/i

const SYNTHETIC_CLOCK = new Set(['00:00', '06:00', '23:59'])

function hmToSortMinutes(h: string, m: string): number {
  const hh = String(parseInt(h, 10)).padStart(2, '0')
  return parseInt(hh, 10) * 60 + parseInt(m, 10)
}

function padHm(h: string, m: string): string {
  const hh = String(parseInt(h, 10)).padStart(2, '0')
  const mm = m.length === 1 ? `0${m}` : m.slice(0, 2)
  return `${hh}:${mm}`
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

function tryParseHighlightLine(line: string): Omit<EmbeddedChildHighlight, 'displayTime'> | null {
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
  const label = rest.length > 0 ? rest : '—'
  return { timeStart: start, timeEnd, label, sortMinutes }
}

function highlightDedupeKey(h: EmbeddedChildHighlight): string {
  return normalizeNotesDedupeKey(`${h.timeStart}${h.timeEnd ?? ''}${h.label}`)
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
  const lk = normalizeNotesDedupeKey(line)
  for (const h of highlights) {
    if (lk === fullLineDedupeKey(h)) return true
    const lab = normalizeNotesDedupeKey(h.label)
    if (lab.length >= 6 && lk === lab) return true
  }
  return false
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
  const highlightsDraft: EmbeddedChildHighlight[] = []
  const noteCandidates: string[] = []

  for (const line of lines) {
    if (!line) continue
    if (SECTION_HEADER_ONLY.test(line)) continue
    const hi = tryParseHighlightLine(line)
    if (hi) {
      const displayTime = hi.timeEnd ? `${hi.timeStart}–${hi.timeEnd}` : hi.timeStart
      highlightsDraft.push({ ...hi, displayTime })
    } else {
      noteCandidates.push(line)
    }
  }

  const segClock = segmentClockParts(seg)
  if (segClock) {
    const label = (displayTitle.trim() || seg.title.trim() || '—').trim()
    highlightsDraft.push({
      timeStart: segClock.start,
      timeEnd: segClock.end,
      label,
      displayTime: segClock.displayTime,
      sortMinutes: segClock.sortMinutes,
    })
  }

  const beforeDedupe = highlightsDraft.length
  const byKey = new Map<string, EmbeddedChildHighlight>()
  for (const h of highlightsDraft) {
    const k = highlightDedupeKey(h)
    const prev = byKey.get(k)
    if (!prev || h.label.length > prev.label.length) byKey.set(k, h)
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

  const useStructured = highlights.length > 0

  if (useStructured) {
    const noteLines: string[] = []
    for (const line of noteCandidates) {
      if (suppressParentLikeNoteLine(line, parentCardTitle)) {
        parentSuppressed += 1
        continue
      }
      if (noteDuplicatesHighlight(line, highlights)) continue
      noteLines.push(line)
    }

    logChildNotesDebug({
      embeddedScheduleChildHighlightsStructured: true,
      embeddedScheduleChildHighlightsDeduped: beforeDedupe > highlights.length,
      embeddedScheduleChildHighlightsSorted: highlights.length > 1,
      embeddedScheduleChildNotesSectionRendered: noteLines.length > 0,
      embeddedScheduleChildParentLikeTextSuppressed: parentSuppressed,
      childProposalId,
      highlightCount: highlights.length,
    })
    return { mode: 'structured', highlights, noteLines }
  }

  const plainLines = filterParent(lines.filter(Boolean))
  const finalPlain = plainLines.join('\n').trim()
  if (!finalPlain) return null

  logChildNotesDebug({
    embeddedScheduleChildHighlightsStructured: false,
    embeddedScheduleChildHighlightsDeduped: false,
    embeddedScheduleChildHighlightsSorted: false,
    embeddedScheduleChildNotesSectionRendered: true,
    embeddedScheduleChildParentLikeTextSuppressed: parentSuppressed,
    childProposalId,
  })
  return { mode: 'plain', notesText: finalPlain }
}

export function presentationHasRenderableContent(p: EmbeddedChildNotesPresentation | null): boolean {
  if (!p) return false
  if (p.mode === 'plain') return p.notesText.trim().length > 0
  return p.highlights.length > 0 || p.noteLines.length > 0
}
