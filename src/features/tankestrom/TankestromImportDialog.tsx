import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import type { PortalEventProposal, PortalProposalItem, PortalSchoolWeekOverlayProposal } from './types'
import type {
  ChildSchoolDayPlan,
  ChildSchoolProfile,
  NorwegianGradeBand,
  Person,
  SchoolContext,
  SchoolLessonSlot,
  Task,
  WeekdayMonFri,
} from '../../types'
import type { UseEventControllerReturn } from '../calendar/hooks/useEventController'
import {
  useTankestromImport,
  filterSubjectUpdatesByLanguageTrack,
  getTankestromDraftFieldErrors,
  getTankestromTaskFieldErrors,
  inferLanguageTrackFromChildSchool,
  inferValgfagTrackFromChildSchool,
  scanNotesBodyForLanguage,
  taskIndicatesForeignLanguageMismatchWithTrack,
  type TankestromPendingFile,
} from './useTankestromImport'
import { cardSection, typSectionCap } from '../../lib/ui'
import { Button } from '../../components/ui/Button'
import { Input, Textarea } from '../../components/ui/Input'
import { SchoolProfileFields } from '../../components/SchoolProfileFields'
import { logEvent } from '../../lib/appLogger'
import { formatTimeRange } from '../../lib/time'
import {
  applyLessonConflictChoice,
  detectLessonConflicts,
  lessonConflictGroupId,
  lessonDisplayLabel,
} from '../../lib/schoolProfileConflicts'
import {
  schoolContextSubjectLabel,
  schoolItemTypeChipClass,
  schoolItemTypeLabel,
} from '../../lib/schoolContext'
import {
  inferSubjectKeyFromText,
  matchSubjectFromText,
  subjectLabelForKey,
  SUBJECTS_BY_BAND,
} from '../../data/norwegianSubjects'
import {
  clientOrphanLineHasStrongTyskProveSignal,
  clientOrphanTargetSectionKeyForTyskLine,
  isClientOverlayAdminLine,
  resolveEnrichPreviewLineToBlockIdx,
  stripSubjectPrefixForBlockLine,
  tryClientOrphanLineToLessonIndex,
} from '../../lib/schoolWeekOverlayEnrichRouting'
import { tryExtractHeldagsproveHovedmalSidemalTitle } from '../../lib/schoolWeekOverlayReplaceTitle'

/** Les `metadata.schoolContext` fra et event-forslag hvis det finnes. */
function schoolContextFromEventProposal(p: PortalEventProposal): SchoolContext | null {
  const meta = p.event.metadata
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
  const ctx = (meta as { schoolContext?: unknown }).schoolContext
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return null
  const candidate = ctx as Partial<SchoolContext>
  if (typeof candidate.itemType !== 'string') return null
  return candidate as SchoolContext
}

function confidenceBadgeStyle(confidence: number): { label: string; className: string } {
  const pct = Math.round(confidence * 100)
  if (confidence >= 0.85) {
    return {
      label: `${pct}% sikker`,
      className: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    }
  }
  if (confidence >= 0.55) {
    return {
      label: `${pct}% middels`,
      className: 'border-amber-200 bg-amber-50 text-amber-950',
    }
  }
  return {
    label: `${pct}% – bør sjekkes`,
    className: 'border-zinc-300 bg-zinc-100 text-zinc-800',
  }
}

/** Kortere chip i kompakt kort-header (mobilvennlig skanning). */
function confidenceBadgeCompactStyle(confidence: number): { label: string; className: string } {
  const pct = Math.round(confidence * 100)
  if (confidence >= 0.85) {
    return { label: `${pct}%`, className: 'border-emerald-200/80 bg-emerald-50/90 text-emerald-900' }
  }
  if (confidence >= 0.55) {
    return { label: `${pct}%`, className: 'border-amber-200/80 bg-amber-50/90 text-amber-950' }
  }
  return { label: 'Sjekk', className: 'border-zinc-300 bg-zinc-100 text-zinc-800' }
}

function notesPreviewSnippet(notes: string, maxChars = 140): string {
  let raw = notes.replace(/\r\n/g, '\n').trim()
  if (!raw) return ''
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length > 0 && /^fra:\s*/i.test(lines[0] ?? '')) {
    raw = lines.slice(1).join('\n').trim()
  }
  const t = raw.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  if (t.length <= maxChars) return t
  return `${t.slice(0, Math.max(0, maxChars - 1))}…`
}

function isGenericCollapsedSourceTypeLabel(s: string): boolean {
  const t = s.trim().toLowerCase()
  return t === '' || t === 'text' || t === 'plain' || t === 'plaintext'
}

/** Ukedager (0=man … 6=søn). */
const WD_LABEL_NB: Record<number, string> = {
  0: 'Mandag',
  1: 'Tirsdag',
  2: 'Onsdag',
  3: 'Torsdag',
  4: 'Fredag',
  5: 'Lørdag',
  6: 'Søndag',
}

function overlayActionLabel(action: string): string {
  if (action === 'replace_school_block') return 'Erstatter skoledag-blokk'
  if (action === 'remove_school_block') return 'Fjerner skoledag-blokk'
  if (action === 'enrich_existing_school_block') return 'Beriker eksisterende skoleblokk'
  return 'Ingen endring'
}

const DEBUG_SCHOOL_IMPORT_PANEL =
  import.meta.env.DEV || import.meta.env.VITE_DEBUG_SCHOOL_IMPORT === 'true'

function normOverlayText(s: string): string {
  return s
    .trim()
    .toLocaleLowerCase('nb-NO')
    .replace(/\s+/g, ' ')
}

/** Kompakt språk-token for aggressiv filtrering i overlay-review (linjer som tydelig handler om fremmedspråk). */
const REVIEW_FOREIGN_LANG_LEXEMES: ReadonlyArray<{ canon: string; pattern: RegExp }> = [
  { canon: 'spansk', pattern: /\bspansk\b|spanish/i },
  { canon: 'tysk', pattern: /\btysk\b|tyskland|german|deutsch/i },
  { canon: 'fransk', pattern: /\bfransk\b|french/i },
  { canon: 'russisk', pattern: /\brussisk\b|russian/i },
  { canon: 'italiensk', pattern: /\bitaliensk\b|italian/i },
  { canon: 'mandarin', pattern: /\bmandarin\b|kinesisk|kinamål/i },
  { canon: 'japansk', pattern: /\bjapansk\b|japanese/i },
  { canon: 'arabisk', pattern: /\barabisk\b|arabic/i },
]

const OVERLAY_LABEL_BLOB_RE = /(høydepunkter|husk|notater|frister)\s*:/i

const OVERLAY_ADMIN_LINE_RES: RegExp[] = [
  /fravær/i,
  /fraværs/i,
  /melde\s+fravær/i,
  /kontaktlærer/i,
  /kontakt\s*lærer/i,
  /skolemelding/i,
  /skolearena/i,
  /\bfronter\b/i,
  /its[\s-]*learning/i,
  /foresatte/i,
  /foreldre\s+må/i,
  /må\s+melde\s+seg/i,
  /innlogging/i,
  /innsyns/i,
  /søknad\s+om/i,
]

const SUBJECT_INVENTORY_KEYWORDS = new Set<string>(
  [
    'norsk',
    'engelsk',
    'matematikk',
    'matte',
    'naturfag',
    'samfunnsfag',
    'samfunnskunnskap',
    'krle',
    'rle',
    'musikk',
    'kunst',
    'håndverk',
    'kroppsøving',
    'gym',
    'fremmedspråk',
    'fysikk',
    'kjemi',
    'biologi',
    'historie',
    'geografi',
    'filosofi',
    'psykologi',
    'økonomi',
    'programfag',
    'fellesfag',
    'valgfag',
    'arbeidslivsfag',
    'religion',
    'etikk',
  ].map((s) => normOverlayText(s))
)

const MAX_OVERLAY_WEEKLY_SUMMARY_LINE_LEN = 130

function foreignLanguageTokensInLine(line: string): Set<string> {
  const out = new Set<string>()
  for (const { canon, pattern } of REVIEW_FOREIGN_LANG_LEXEMES) {
    if (pattern.test(line)) out.add(canon)
  }
  return out
}

function resolvedTrackCanon(track: string | undefined): string | undefined {
  const t = track?.trim()
  if (!t) return undefined
  return t.toLocaleLowerCase('nb-NO')
}

function overlayLineAllowedForLanguageTrack(line: string, resolvedTrack: string | undefined): boolean {
  const canon = resolvedTrackCanon(resolvedTrack)
  if (!canon) return true
  const mentioned = foreignLanguageTokensInLine(line)
  if (mentioned.size === 0) return true
  if (mentioned.has(canon)) return true
  return false
}

function isAdminOverlayLine(line: string): boolean {
  return OVERLAY_ADMIN_LINE_RES.some((re) => re.test(line))
}

function hasOverlayLabelBlobPattern(text: string): boolean {
  return OVERLAY_LABEL_BLOB_RE.test(text)
}

function stripOverlayLabelPrefixes(text: string): string {
  return text
    .replace(/(høydepunkter|husk|notater|frister)\s*:/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokensFromOverlayLine(line: string): string[] {
  return normOverlayText(line)
    .split(/[,.;•·|/]+|\bog\b/)
    .map((x) => x.trim())
    .filter(Boolean)
}

function isSubjectInventoryNoiseLine(line: string): boolean {
  const t = line.trim()
  if (t.length < 8 || t.length > 220) return false
  const tokens = tokensFromOverlayLine(t)
  if (tokens.length < 3) return false
  let subjectHits = 0
  for (const tok of tokens) {
    const n = normOverlayText(tok)
    if (n.length < 2) continue
    for (const kw of SUBJECT_INVENTORY_KEYWORDS) {
      if (n === kw || n.includes(kw) || kw.includes(n)) {
        subjectHits++
        break
      }
    }
  }
  if (subjectHits < 3) return false
  const infoHints =
    /\b(lekse|husk|prøve|vurdering|innlevering|møte|kl\.?\s*\d|klokka|øving|kapittel|kap\.|bok|notat|mappen|ta med|glemme|avlyst|endret|flyttet)\b/i.test(
      t
    )
  return !infoHints
}

function dropSubstringRedundantOverlayLines(lines: string[]): string[] {
  const norms = lines.map(normOverlayText)
  return lines.filter((_line, i) => {
    const n = norms[i]!
    if (n.length < 16) return true
    return !lines.some((_other, j) => {
      if (i === j) return false
      const no = norms[j]!
      return no.length > n.length + 12 && no.includes(n)
    })
  })
}

function collectOverlaySectionLinesFromDetails(
  details: NonNullable<PortalSchoolWeekOverlayProposal['dailyActions'][number]>,
  resolvedTrack: string | undefined,
  resolvedValgfagTrack?: string
): string[] {
  const filteredUpdates = filterSubjectUpdatesByLanguageTrack(
    details.subjectUpdates,
    resolvedTrack,
    resolvedValgfagTrack
  )
  const out: string[] = []
  for (const u of filteredUpdates) {
    if (!u.sections) continue
    for (const lines of Object.values(u.sections)) {
      for (const line of lines ?? []) {
        const t = line.trim()
        if (!t) continue
        if (!overlayLineAllowedForLanguageTrack(t, resolvedTrack)) continue
        if (isAdminOverlayLine(t)) continue
        if (isSubjectInventoryNoiseLine(t)) continue
        out.push(t)
      }
    }
  }
  const deduped = out.filter(
    (line, idx, arr) => arr.findIndex((x) => normOverlayText(x) === normOverlayText(line)) === idx
  )
  return dropSubstringRedundantOverlayLines(deduped)
}

function headlineOverlapsStructuredContent(headline: string, sectionNormSet: Set<string>): boolean {
  const hFull = normOverlayText(headline)
  if (sectionNormSet.has(hFull)) return true
  const stripped = normOverlayText(stripOverlayLabelPrefixes(headline))
  if (stripped && sectionNormSet.has(stripped)) return true
  if (stripped.length >= 10) {
    for (const sn of sectionNormSet) {
      if (sn.length >= stripped.length + 6 && sn.includes(stripped)) return true
    }
  }
  return false
}

type HeadlineSuppressReasons = {
  suppressedBecauseLabeledBlob: boolean
  suppressedBecauseAdminText: boolean
  suppressedBecauseNonMatchingLanguage: boolean
  suppressedBecauseDuplicate: boolean
}

function analyzeHeadlineSuppression(
  headline: string,
  hasStructuredSections: boolean,
  sectionNormSet: Set<string>,
  resolvedTrack: string | undefined
): { show: boolean; reasons: HeadlineSuppressReasons } {
  const reasons: HeadlineSuppressReasons = {
    suppressedBecauseLabeledBlob: false,
    suppressedBecauseAdminText: false,
    suppressedBecauseNonMatchingLanguage: false,
    suppressedBecauseDuplicate: false,
  }
  if (!headline.trim()) return { show: false, reasons }

  if (hasStructuredSections && hasOverlayLabelBlobPattern(headline)) {
    reasons.suppressedBecauseLabeledBlob = true
  }
  if (isAdminOverlayLine(headline)) {
    reasons.suppressedBecauseAdminText = true
  }
  const canon = resolvedTrackCanon(resolvedTrack)
  if (canon) {
    const mentioned = foreignLanguageTokensInLine(headline)
    if (mentioned.size > 0 && !mentioned.has(canon)) {
      reasons.suppressedBecauseNonMatchingLanguage = true
    }
  }
  if (hasStructuredSections && headlineOverlapsStructuredContent(headline, sectionNormSet)) {
    reasons.suppressedBecauseDuplicate = true
  }

  const show = !Object.values(reasons).some(Boolean)
  return { show, reasons }
}

function filterWeeklySummaryLine(
  line: string,
  resolvedTrack: string | undefined
): { ok: boolean; reason?: string } {
  const t = line.trim()
  if (!t) return { ok: false, reason: 'empty' }
  if (t.length > MAX_OVERLAY_WEEKLY_SUMMARY_LINE_LEN) return { ok: false, reason: 'tooLong' }
  if (isAdminOverlayLine(t)) return { ok: false, reason: 'admin' }
  if (!overlayLineAllowedForLanguageTrack(t, resolvedTrack)) return { ok: false, reason: 'language' }
  if (isSubjectInventoryNoiseLine(t)) return { ok: false, reason: 'subjectInventory' }
  return { ok: true }
}

function cloneOverlayDraft(overlay: PortalSchoolWeekOverlayProposal): PortalSchoolWeekOverlayProposal {
  return JSON.parse(JSON.stringify(overlay)) as PortalSchoolWeekOverlayProposal
}

function overlayDayLines(details: NonNullable<PortalSchoolWeekOverlayProposal['dailyActions'][number]>): string[] {
  const out: string[] = []
  for (const u of details.subjectUpdates) {
    if (!u.sections) continue
    for (const lines of Object.values(u.sections)) {
      for (const line of lines ?? []) {
        const t = line.trim()
        if (t) out.push(t)
      }
    }
  }
  return out
}

function applyOverlayDayLines(
  details: NonNullable<PortalSchoolWeekOverlayProposal['dailyActions'][number]>,
  nextLines: string[]
): NonNullable<PortalSchoolWeekOverlayProposal['dailyActions'][number]> {
  const cleaned = nextLines.map((x) => x.trim()).filter(Boolean)
  if (details.subjectUpdates.length === 0) {
    if (cleaned.length === 0) return details
    return {
      ...details,
      subjectUpdates: [
        {
          subjectKey: 'other',
          sections: { notater: cleaned },
        },
      ],
    }
  }
  const firstWithSectionsIdx = details.subjectUpdates.findIndex((u) => !!u.sections)
  const targetIdx = firstWithSectionsIdx >= 0 ? firstWithSectionsIdx : 0
  const nextSubjectUpdates = details.subjectUpdates.map((u, idx) => {
    if (idx !== targetIdx) return u
    const prevSections = u.sections ?? {}
    const sectionKeys = Object.keys(prevSections)
    const targetSectionKey = sectionKeys[0] ?? 'notater'
    const nextSections = { ...prevSections, [targetSectionKey]: cleaned }
    return { ...u, sections: nextSections }
  })
  return { ...details, subjectUpdates: nextSubjectUpdates }
}

const OVERLAY_PREVIEW_SECTION_ORDER = [
  'I timen',
  'Lekse',
  'Ta med',
  'Prøve / vurdering',
  'Ressurser',
  'Ekstra beskjed',
] as const

type OverlayPreviewSectionLabel = (typeof OVERLAY_PREVIEW_SECTION_ORDER)[number]

function overlayPreviewSectionLabel(rawKey: string, line: string): OverlayPreviewSectionLabel {
  const trimmed = line.trim()
  const k = normOverlayText(rawKey)
  const l = normOverlayText(line)
  /** Viktig: rå seksjonsnøkkel fra kilden kan være feil (f.eks. «Lekse» på alt) — prioriter tydelig linjestart. */
  if (/^\s*i\s+timen\s*[:.–—-]/i.test(trimmed)) return 'I timen'
  if (/^\s*lekse\s*[:.–—-]/i.test(trimmed)) return 'Lekse'

  const combined = `${k} ${l}`

  if (
    /\b(lekse|hjemmelekse|hjemmearbeid|hjemme\s*arbeid|innlevering(?!\s*i timen)|forbered(?:else)?\s+til|gjør\s+oppgave|oppgave\s+\d|lage\s+innlevering)\b/.test(
      l
    ) ||
    /\b(lekse|hjemmelekse|hjemmearbeid|hjemme\s*arbeid|innlevering(?!\s*i timen)|forbered(?:else)?\s+til|gjør\s+oppgave|oppgave\s+\d|lage\s+innlevering)\b/.test(
      combined
    )
  ) {
    return 'Lekse'
  }
  if (/\b(les\s+(?:kap|kapittel|side|glossar)|les\s+høyt|lese\s+lekse)\b/.test(combined)) return 'Lekse'

  if (
    /\b(i timen|undervisning|arbeid\s+i timen|gjøres\s+i timen|timen:\s*|vi(?:\s+skal)?\s+jobbe|gruppearbeid|klasseromsarbeid|gjennomgang|forelesning|delebøker|stasjons|exit\s*ticket)\b/.test(
      l
    ) ||
    /\b(i timen|undervisning|arbeid\s+i timen|gjøres\s+i timen|timen:\s*|vi(?:\s+skal)?\s+jobbe|gruppearbeid|klasseromsarbeid|gjennomgang|forelesning|delebøker|stasjons|exit\s*ticket)\b/.test(
      combined
    )
  ) {
    return 'I timen'
  }

  if (/\b(ta med|utstyr|ha med|husk å ta med|pakke)\b/.test(combined)) return 'Ta med'
  if (/\b(prøve|vurdering|test|quiz|muntlig|fremføring|tentamen)\b/.test(combined)) return 'Prøve / vurdering'

  if (/\b(https?:\/\/|www\.)\b/i.test(line)) return 'Ressurser'
  if (/\b(lenke til|se\s+video|fronter|itslearning|teams\.microsoft|youtube|vimeo)\b/i.test(combined)) {
    return 'Ressurser'
  }
  if (/\b(kap(?:ittel)?\.?\s*\d+|side\s+\d+)\b/.test(l) && /\b(bok|lærebok|tekstbok)\b/.test(combined)) {
    return 'Ressurser'
  }
  if (/\b(ressurs|presentasjon|powerpoint|\bpdf\b)\b/.test(combined)) return 'Ressurser'

  return 'Ekstra beskjed'
}

function dedupeOverlayPreviewLines(lines: string[]): string[] {
  const out: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    const n = normOverlayText(t).replace(/[.!]+$/g, '').trim()
    if (!n) continue
    const dup = out.some((existing) => {
      const en = normOverlayText(existing).replace(/[.!]+$/g, '').trim()
      return en === n || (en.length > 12 && n.length > 12 && (en.includes(n) || n.includes(en)))
    })
    if (!dup) out.push(t)
  }
  return out
}

function previewSectionsFromSubjectUpdate(
  update: { sections?: Record<string, string[]> }
): Record<OverlayPreviewSectionLabel, string[]> {
  const out: Record<OverlayPreviewSectionLabel, string[]> = {
    'I timen': [],
    Lekse: [],
    'Ta med': [],
    'Prøve / vurdering': [],
    Ressurser: [],
    'Ekstra beskjed': [],
  }
  for (const [key, lines] of Object.entries(update.sections ?? {}) as Array<[string, string[]]>) {
    for (const line of lines ?? []) {
      const t = line.trim()
      if (!t) continue
      out[overlayPreviewSectionLabel(key, t)].push(t)
    }
  }
  return out
}

/** Støy: rene fagnavn uten faktisk innhold (f.eks. «Tysk», «Norsk fordypning»). */
const OVERLAY_PREVIEW_SUBSTANTIVE_HINT = /\b(lekse|hjemme|innlevering|les\s|lesing|kap\.|kapittel|side\s|s\.\s*\d|prøve|vurdering|test|quiz|muntlig|øving|arbeid|gruppe|video|http|www|lenke|fronter|teams|kl\.?\s*\d|ta med|husk|gjør|oppgave|forbered|timen|undervisning)\b/i

function titleCaseNbWord(word: string): string {
  const w = word.trim()
  if (!w) return w
  return w.charAt(0).toLocaleUpperCase('nb-NO') + w.slice(1)
}

/** Ren enkeltords fremmedspråk-label (f.eks. «Tysk») uten katalog-treff. */
function isStandaloneForeignLanguageNoiseLine(line: string): boolean {
  const nt = normOverlayText(line)
  if (nt.length < 4 || nt.length > 14) return false
  if (/\s/.test(nt)) return false
  for (const { canon } of REVIEW_FOREIGN_LANG_LEXEMES) {
    if (nt === canon) return true
  }
  return false
}

function isOverlayPreviewSubjectOnlyNoiseLine(line: string, band: NorwegianGradeBand): boolean {
  const t = line.trim()
  if (!t || t.length > 72) return false
  if (/\d/.test(t)) return false
  if (OVERLAY_PREVIEW_SUBSTANTIVE_HINT.test(t)) return false
  if (isStandaloneForeignLanguageNoiseLine(t)) return true
  const m = matchSubjectFromText(band, t)
  if (!m) return false
  const cat = SUBJECTS_BY_BAND[band].find((s) => s.key === m.subjectKey)
  const label = cat?.label ?? m.subjectKey
  const normLine = normOverlayText(t)
  const normLabel = normOverlayText(label)
  if (normLine === normLabel) return true
  if (normLine === `${normLabel} fordypning`) return true
  if (normLine === `${normLabel} utenom`) return true
  if (m.matchType === 'prefix' && normLine.startsWith(`${normLabel} `)) {
    const rest = normLine.slice(normLabel.length).trim()
    if (rest === 'fordypning' || rest === 'utenom') return true
    if (rest.split(/\s+/).length === 1 && ['muntlig', 'skriftlig'].includes(rest)) return true
  }
  return false
}

function filterOverlayPreviewNoiseLines(
  lines: string[],
  band: NorwegianGradeBand,
  stats?: { dropped: number }
): string[] {
  const out: string[] = []
  for (const line of lines) {
    if (isOverlayPreviewSubjectOnlyNoiseLine(line, band)) {
      if (stats) stats.dropped++
      continue
    }
    out.push(line)
  }
  return out
}

function previewSectionsForOverlayPreview(
  update: { sections?: Record<string, string[]> },
  band: NorwegianGradeBand,
  noiseStats?: { dropped: number }
): Record<OverlayPreviewSectionLabel, string[]> {
  const base = previewSectionsFromSubjectUpdate(update)
  const out = { ...base }
  for (const key of OVERLAY_PREVIEW_SECTION_ORDER) {
    out[key] = filterOverlayPreviewNoiseLines(out[key], band, noiseStats)
  }
  return out
}

type SpecialDayTitleKind = 'heldagsprove' | 'forberedelsesdag' | null

const SPECIAL_DAY_SIDE_THEME = /\b(valgfag|innsats\s+for\s+andre)\b/i

function specialDayTitleKindFromText(text: string): SpecialDayTitleKind {
  const n = normOverlayText(text.replace(/\./g, ''))
  if (/\bheldagsprøve\b/.test(n) || /\bheldags\s*prøve\b/.test(n)) return 'heldagsprove'
  if (/\bforberedelsesdag\b/.test(n) || /\bforberedelses\s*dag\b/.test(n)) return 'forberedelsesdag'
  return null
}

/**
 * Hovedaktivitet i korpus vinner: forberedelsesdag i kildetekst skal ikke overskrives av generisk «Heldagsprøve» i summary alene.
 */
function inferSpecialDayKindFromCorpus(corpus: string[], base: string): SpecialDayTitleKind {
  const significant = corpus.filter((l) => l.trim() && !SPECIAL_DAY_SIDE_THEME.test(l))
  let sawForbered = false
  let sawHeldags = false
  for (const l of significant) {
    const n = normOverlayText(l.replace(/\./g, ''))
    if (/\bforberedelsesdag\b/.test(n) || /\bforberedelses\s*dag\b/.test(n)) sawForbered = true
    if (/\bheldagsprøve\b/.test(n) || /\bheldags\s*prøve\b/.test(n)) sawHeldags = true
  }
  if (sawForbered) return 'forberedelsesdag'
  if (sawHeldags) return 'heldagsprove'
  return specialDayTitleKindFromText(base)
}

function subjectLabelFromKey(band: NorwegianGradeBand, key: string): string {
  const cat = SUBJECTS_BY_BAND[band].find((s) => s.key === key)
  return cat?.label ?? key
}

/** «… i matematikk», «heldagsprøve i engelsk», fag før kolon, osv. */
function tryInferSubjectLabelFromLine(
  band: NorwegianGradeBand,
  raw: string
): string | undefined {
  const t = raw.trim()
  if (t.length < 4) return undefined
  const afterI = t.match(/\bi\s+([^.:\n;]+?)(?:[.:;]|$)/i)
  if (afterI?.[1]) {
    const chunk = afterI[1].trim()
    if (chunk.length >= 2 && chunk.length < 48) {
      const m = matchSubjectFromText(band, chunk)
      if (m) return subjectLabelFromKey(band, m.subjectKey)
      const inf = inferSubjectKeyFromText(band, chunk)
      if (inf) return subjectLabelFromKey(band, inf)
    }
  }
  const head = t.split(/[:–—]/)[0]?.trim() ?? ''
  const parts = head.length >= 3 ? [head] : []
  if (t.length < 120) parts.push(t)
  for (const part of parts) {
    if (part.length < 3) continue
    const m = matchSubjectFromText(band, part)
    if (m) return subjectLabelFromKey(band, m.subjectKey)
    const inf = inferSubjectKeyFromText(band, part)
    if (inf) return subjectLabelFromKey(band, inf)
  }
  if (t.length < 140) {
    for (const { canon, pattern } of REVIEW_FOREIGN_LANG_LEXEMES) {
      if (pattern.test(t)) return titleCaseNbWord(canon)
    }
  }
  return undefined
}

function inferSubjectLabelForSpecialDayTitle(
  band: NorwegianGradeBand,
  corpus: string[],
  kind: SpecialDayTitleKind
): string | undefined {
  if (!kind) return undefined
  const significant = corpus.filter((l) => l.trim() && !SPECIAL_DAY_SIDE_THEME.test(l))
  const kindRe =
    kind === 'forberedelsesdag'
      ? /\bforberedelsesdag\b|\bforberedelses\s*dag\b/i
      : /\bheldagsprøve\b|\bheldags\s*prøve\b/i
  const scored = [...significant].sort((a, b) => {
    const ka = kindRe.test(a) ? 1 : 0
    const kb = kindRe.test(b) ? 1 : 0
    if (ka !== kb) return kb - ka
    const sa = /\b(matematikk|matte|engelsk|norsk|tysk|fransk|spansk|naturfag|krle|samfunnsfag|historie|geografi)\b/i.test(
      a
    )
      ? 1
      : 0
    const sb = /\b(matematikk|matte|engelsk|norsk|tysk|fransk|spansk|naturfag|krle|samfunnsfag|historie|geografi)\b/i.test(
      b
    )
      ? 1
      : 0
    return sb - sa
  })
  for (const line of scored) {
    const hit = tryInferSubjectLabelFromLine(band, line)
    if (hit) return hit
  }
  return undefined
}

/** Summary/reason inneholder allerede dagstype + fag — ikke gjør den mer generisk. */
function specialDaySummaryAlreadyActionSpecific(base: string, band: NorwegianGradeBand): boolean {
  const kind = specialDayTitleKindFromText(base)
  if (!kind) return false
  return tryInferSubjectLabelFromLine(band, base) !== undefined
}

function replaceSchoolBlockDisplaySummary(
  details: NonNullable<PortalSchoolWeekOverlayProposal['dailyActions'][number]>,
  mergedFlatLines: string[],
  band: NorwegianGradeBand
): string {
  const base = details.summary?.trim() || details.reason?.trim() || ''
  if (!base) return ''
  const extra = overlayDayLines(details)
  const corpus = [base, ...mergedFlatLines, ...extra].filter((s) => s.trim())

  const rejectedSide = corpus.filter((l) => SPECIAL_DAY_SIDE_THEME.test(l))
  const kind = inferSpecialDayKindFromCorpus(corpus, base)

  if (specialDaySummaryAlreadyActionSpecific(base, band)) {
    if (DEBUG_SCHOOL_IMPORT_PANEL) {
      console.debug('[overlay preview]', {
        overlayPreviewSpecialDayTitle: base,
        overlayPreviewMainThemeSource: 'summary_already_specific',
        overlayPreviewRejectedSideTheme: rejectedSide.length,
      })
    }
    return base
  }

  if (!kind) {
    if (DEBUG_SCHOOL_IMPORT_PANEL) {
      console.debug('[overlay preview]', {
        overlayPreviewSpecialDayTitle: base,
        overlayPreviewMainThemeSource: 'none',
        overlayPreviewRejectedSideTheme: rejectedSide.length,
      })
    }
    return base
  }

  if (kind === 'heldagsprove') {
    const hovedSidemal = tryExtractHeldagsproveHovedmalSidemalTitle(corpus)
    if (hovedSidemal) {
      if (DEBUG_SCHOOL_IMPORT_PANEL) {
        console.debug('[overlay preview]', {
          overlayPreviewSpecialDayTitle: hovedSidemal,
          overlayPreviewTitleSubjectSource: 'hovedmal_sidemal',
          overlayPreviewDetectedAssessmentVariant: hovedSidemal.endsWith('sidemål') ? 'sidemål' : 'hovedmål',
          overlayPreviewRejectedSideTheme: rejectedSide.length,
        })
      }
      return hovedSidemal
    }
  }

  const subj = inferSubjectLabelForSpecialDayTitle(band, corpus, kind)
  if (!subj) {
    const fallback =
      kind === 'forberedelsesdag' ? 'Forberedelsesdag' : kind === 'heldagsprove' ? 'Heldagsprøve' : base
    if (DEBUG_SCHOOL_IMPORT_PANEL) {
      console.debug('[overlay preview]', {
        overlayPreviewSpecialDayTitle: fallback,
        overlayPreviewMainThemeSource: 'kind_only_no_subject',
        overlayPreviewRejectedSideTheme: rejectedSide.length,
      })
    }
    return fallback
  }

  const show =
    kind === 'forberedelsesdag'
      ? `Forberedelsesdag i ${subj.toLocaleLowerCase('nb-NO')}`
      : `${subj} heldagsprøve`
  if (DEBUG_SCHOOL_IMPORT_PANEL) {
    console.debug('[overlay preview]', {
      overlayPreviewSpecialDayTitle: show,
      overlayPreviewMainThemeSource: kind,
      overlayPreviewRejectedSideTheme: rejectedSide.length,
      inferredSubject: subj,
      replacedGenericSummary: base,
    })
  }
  return show
}

function isTautologicalOverlayPreviewLine(
  line: string,
  section: OverlayPreviewSectionLabel
): boolean {
  const n = normOverlayText(line).replace(/[.!]+$/g, '').trim()
  if (!n) return true
  if (section === 'I timen') {
    if (n === 'i timen' || n === 'undervisning' || n === 'arbeid i timen' || n === 'timen') return true
  }
  if (section === 'Lekse' && (n === 'lekse' || n === 'hjemmelekse')) return true
  if (section === 'Ta med' && (n === 'ta med' || n === 'utstyr')) return true
  if (section === 'Ressurser' && (n === 'ressurser' || n === 'ressurs')) return true
  return false
}

type SchoolWeekOverlayReviewCardProps = {
  overlay: PortalSchoolWeekOverlayProposal
  resolvedLanguageTrack?: string
  resolvedValgfagTrack?: string
  baseSchoolProfile?: ChildSchoolProfile
  onChange?: (next: PortalSchoolWeekOverlayProposal) => void
}

function SchoolWeekOverlayReviewCard({
  overlay,
  resolvedLanguageTrack,
  resolvedValgfagTrack,
  baseSchoolProfile,
  onChange,
}: SchoolWeekOverlayReviewCardProps) {
  const [editingDay, setEditingDay] = useState<number | null>(null)
  /** Lesemodus: utvid skjulte linjer uten å gå inn i Rediger. */
  const [readExpandedByDay, setReadExpandedByDay] = useState<Record<number, boolean>>({})
  const track =
    resolvedLanguageTrack?.trim() ||
    overlay.languageTrack?.resolvedTrack?.trim() ||
    undefined

  const dayEntries = Object.entries(overlay.dailyActions)
    .map(([day, details]) => ({ day: Number(day), details }))
    .filter((x): x is { day: number; details: NonNullable<typeof x.details> } => !!x.details)
    .sort((a, b) => a.day - b.day)

  const dayHeadlineSet = new Set<string>()
  const sectionLineSet = new Set<string>()
  for (const { details } of dayEntries) {
    const headline = details.summary?.trim() || details.reason?.trim() || ''
    if (headline) dayHeadlineSet.add(normOverlayText(headline))
    for (const line of collectOverlaySectionLinesFromDetails(details, track, resolvedValgfagTrack)) {
      sectionLineSet.add(normOverlayText(line))
    }
  }

  const condensedWeeklySummary: string[] = []
  for (const line of overlay.weeklySummary) {
    const wf = filterWeeklySummaryLine(line, track)
    if (!wf.ok) continue
    const n = normOverlayText(line)
    if (dayHeadlineSet.has(n) || sectionLineSet.has(n)) continue
    if (condensedWeeklySummary.some((x) => normOverlayText(x) === n)) continue
    condensedWeeklySummary.push(line.trim())
  }
  condensedWeeklySummary.sort((a, b) => a.length - b.length)
  const weeklyShown = condensedWeeklySummary.slice(0, 4)

  if (DEBUG_SCHOOL_IMPORT_PANEL) {
    console.debug('[overlay review render-levels]', {
      track,
      hasWeeklySummary: overlay.weeklySummary.length > 0,
      shownWeeklySummary: weeklyShown.length,
      dayModes: dayEntries.map(({ day, details }) => {
        const headline = details.summary?.trim() || details.reason?.trim() || ''
        const sectionLines = collectOverlaySectionLinesFromDetails(details, track, resolvedValgfagTrack)
        const sectionNormSet = new Set(sectionLines.map(normOverlayText))
        const hasStructuredSections = sectionLines.length > 0
        const { show, reasons } = analyzeHeadlineSuppression(
          headline,
          hasStructuredSections,
          sectionNormSet,
          track
        )
        const chosenRenderMode = sectionLines.length > 0 ? 'sections-first' : headline ? 'headline-only' : 'minimal'
        const filteredSubjectUpdatesDbg = filterSubjectUpdatesByLanguageTrack(
          details.subjectUpdates,
          track,
          resolvedValgfagTrack
        )
        const compactLinesDbg = hasStructuredSections
          ? sectionLines
          : filteredSubjectUpdatesDbg.map((u) =>
              u.customLabel ? `${u.customLabel} (${u.subjectKey})` : u.subjectKey
            )
        const hiddenDbg = Math.max(0, compactLinesDbg.length - 3)
        const readExpandedDbg = !!readExpandedByDay[day]
        return {
          day,
          overlayDayEditMode: editingDay === day ? 'edit' : 'compact',
          overlayDayHasSummary: !!details.summary?.trim(),
          overlayDayDetailCount: sectionLines.length,
          overlayCompactModeEnabled: true,
          hasDaySummary: !!details.summary,
          hasDayReason: !!details.reason,
          hasSubjectSections: sectionLines.length > 0,
          headlineShown: show,
          headlineSuppressReasons: reasons,
          chosenRenderMode,
          overlayDayCollapsed: hiddenDbg > 0 && !readExpandedDbg,
          overlayDayExpanded: readExpandedDbg,
          overlayDayHiddenLineCount: hiddenDbg,
        }
      }),
    })
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-3">
      <p className="text-[12px] font-semibold text-indigo-950">Uke-overlay-forslag</p>
      <p className="mt-1 text-[11px] leading-snug text-indigo-900/90">
        Midlertidige ukeendringer oppdaget i A-planen. Dette er kun review i denne versjonen.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-indigo-900">
        {overlay.weekNumber != null ? (
          <span className="inline-flex rounded-full border border-indigo-300 bg-white px-2 py-0.5 font-semibold">
            Uke {overlay.weekNumber}
          </span>
        ) : null}
        {overlay.classLabel ? (
          <span className="inline-flex rounded-full border border-indigo-300 bg-white px-2 py-0.5 font-semibold">
            Klasse {overlay.classLabel}
          </span>
        ) : null}
        <span className="inline-flex rounded-full border border-indigo-300 bg-white px-2 py-0.5">
          Kilde: {overlay.sourceTitle ?? overlay.originalSourceType}
        </span>
      </div>
      {weeklyShown.length > 0 ? (
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-indigo-950">
          {weeklyShown.map((line, idx) => (
            <li key={`${line}-${idx}`}>{line}</li>
          ))}
        </ul>
      ) : null}
      {dayEntries.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {dayEntries.map(({ day, details }) => {
            const headline = details.summary?.trim() || details.reason?.trim() || ''
            const sectionLines = collectOverlaySectionLinesFromDetails(details, track, resolvedValgfagTrack)
            const hasSections = sectionLines.length > 0
            const sectionNormSet = new Set(sectionLines.map(normOverlayText))
            const { show: headlineShown } = analyzeHeadlineSuppression(
              headline,
              hasSections,
              sectionNormSet,
              track
            )
            const filteredSubjectUpdates = filterSubjectUpdatesByLanguageTrack(
              details.subjectUpdates,
              track,
              resolvedValgfagTrack
            )
            const isEditing = onChange ? editingDay === day : false
            const compactLines =
              hasSections
                ? sectionLines
                : filteredSubjectUpdates.map((u) => (u.customLabel ? `${u.customLabel} (${u.subjectKey})` : u.subjectKey))
            const compactVisible = compactLines.slice(0, 3)
            const compactHiddenCount = Math.max(0, compactLines.length - compactVisible.length)
            const readExpanded = !!readExpandedByDay[day]
            const readLines =
              readExpanded || compactHiddenCount === 0 ? compactLines : compactVisible

            return (
              <li key={day} className="rounded-lg border border-indigo-200 bg-white/85 px-2.5 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[12px] font-medium text-zinc-900">
                    {WD_LABEL_NB[day] ?? `Dag ${day}`} · {overlayActionLabel(details.action)}
                  </p>
                  {onChange ? (
                    <button
                      type="button"
                      onClick={() => setEditingDay((prev) => (prev === day ? null : day))}
                      className="shrink-0 rounded-md border border-zinc-300 bg-white px-2 py-1 text-[10px] font-semibold text-zinc-700 transition hover:bg-zinc-50"
                    >
                      {isEditing ? 'Ferdig' : 'Rediger'}
                    </button>
                  ) : null}
                </div>
                {isEditing ? (
                  <div className="mt-1.5 space-y-2 rounded-md border border-zinc-200 bg-zinc-50/70 p-2">
                    <Input
                      id={`ts-overlay-day-summary-${day}`}
                      label={details.summary?.trim() ? 'Dagsoppsummering' : 'Legg til oppsummering (valgfritt)'}
                      value={details.summary ?? ''}
                      onChange={(e) => {
                        if (!onChange) return
                        const next = cloneOverlayDraft(overlay)
                        const d = next.dailyActions[day]
                        if (!d) return
                        d.summary = e.target.value
                        onChange(next)
                      }}
                      className="text-[12px]"
                    />
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-zinc-700">
                        Detaljlinjer (én per linje)
                      </label>
                      <Textarea
                        id={`ts-overlay-day-lines-${day}`}
                        rows={3}
                        autoResize
                        minRows={3}
                        maxRows={10}
                        value={overlayDayLines(details).join('\n')}
                        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                          if (!onChange) return
                          const next = cloneOverlayDraft(overlay)
                          const d = next.dailyActions[day]
                          if (!d) return
                          const lines = e.target.value.split('\n')
                          next.dailyActions[day] = applyOverlayDayLines(d, lines)
                          onChange(next)
                        }}
                        className="text-[12px]"
                        placeholder="Skriv én punktlinje per linje"
                      />
                    </div>
                  </div>
                ) : null}
                {!isEditing && headlineShown ? <p className="mt-0.5 text-[11px] text-zinc-700">{headline}</p> : null}
                {!isEditing ? (
                  <>
                    {(() => {
                      const filteredUpdates = filterSubjectUpdatesByLanguageTrack(
                        details.subjectUpdates,
                        track,
                        resolvedValgfagTrack
                      )
                      if (details.action === 'remove_school_block') {
                        return (
                          <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50/70 px-2.5 py-2">
                            <p className="text-[11px] font-semibold text-rose-900">Skoleblokken fjernes</p>
                            {(details.reason?.trim() || details.summary?.trim()) ? (
                              <p className="mt-1 text-[11px] leading-snug text-rose-900/90">
                                {details.reason?.trim() || details.summary?.trim()}
                              </p>
                            ) : null}
                          </div>
                        )
                      }

                      if (details.action === 'replace_school_block') {
                        const mergedSections: Record<OverlayPreviewSectionLabel, string[]> = {
                          'I timen': [],
                          Lekse: [],
                          'Ta med': [],
                          'Prøve / vurdering': [],
                          Ressurser: [],
                          'Ekstra beskjed': [],
                        }
                        const previewBand = baseSchoolProfile?.gradeBand ?? '8-10'
                        const replaceNoise = { dropped: 0 }
                        for (const u of filteredUpdates) {
                          const s = previewSectionsForOverlayPreview(u, previewBand, replaceNoise)
                          for (const key of OVERLAY_PREVIEW_SECTION_ORDER) mergedSections[key].push(...s[key])
                        }
                        for (const key of OVERLAY_PREVIEW_SECTION_ORDER) {
                          mergedSections[key] = dedupeOverlayPreviewLines(mergedSections[key])
                        }
                        const mergedFlatForTitle = OVERLAY_PREVIEW_SECTION_ORDER.flatMap((k) => mergedSections[k])
                        const summaryText = details.summary?.trim() || details.reason?.trim() || ''
                        const displaySummary = replaceSchoolBlockDisplaySummary(
                          details,
                          mergedFlatForTitle,
                          previewBand
                        )
                        if (summaryText) {
                          for (const key of OVERLAY_PREVIEW_SECTION_ORDER) {
                            mergedSections[key] = mergedSections[key].filter(
                              (line) =>
                                !(
                                  normOverlayText(line).includes(normOverlayText(summaryText)) ||
                                  normOverlayText(summaryText).includes(normOverlayText(line))
                                )
                            )
                          }
                        }
                        return (
                          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-2">
                            <p className="text-[11px] font-semibold text-amber-950">Spesialdag (erstatter skoleblokk)</p>
                            {displaySummary ? (
                              <p className="mt-1 text-[11px] leading-snug text-amber-900/90">
                                {displaySummary}
                              </p>
                            ) : null}
                            {OVERLAY_PREVIEW_SECTION_ORDER.map((label) => {
                              const lines = mergedSections[label]
                              if (lines.length === 0) return null
                              return (
                                <div key={label} className="mt-1.5">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900">{label}</p>
                                  <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[11px] text-amber-950">
                                    {lines.map((line, idx) => (
                                      <li key={`${label}-${idx}`}>{line}</li>
                                    ))}
                                  </ul>
                                </div>
                              )
                            })}
                          </div>
                        )
                      }

                      const baseLessons = (() => {
                        if (!baseSchoolProfile || day < 0 || day > 4) return [] as SchoolLessonSlot[]
                        const plan = baseSchoolProfile.weekdays[day as WeekdayMonFri]
                        if (!plan || plan.useSimpleDay || !plan.lessons?.length) return [] as SchoolLessonSlot[]
                        return [...plan.lessons].sort((a, b) => a.start.localeCompare(b.start))
                      })()
                      const blocks: Array<{
                        title: string
                        time?: string
                        sections: Record<OverlayPreviewSectionLabel, string[]>
                      }> = baseLessons.map((L) => ({
                        title: subjectLabelForKey(
                          baseSchoolProfile?.gradeBand ?? '8-10',
                          L.subjectKey,
                          L.customLabel,
                          L.lessonSubcategory
                        ),
                        time: `${L.start}–${L.end}`,
                        sections: {
                          'I timen': [],
                          Lekse: [],
                          'Ta med': [],
                          'Prøve / vurdering': [],
                          Ressurser: [],
                          'Ekstra beskjed': [],
                        },
                      }))
                      const unplaced: Record<OverlayPreviewSectionLabel, string[]> = {
                        'I timen': [],
                        Lekse: [],
                        'Ta med': [],
                        'Prøve / vurdering': [],
                        Ressurser: [],
                        'Ekstra beskjed': [],
                      }
                      const enrichBand = baseSchoolProfile?.gradeBand ?? '8-10'
                      const enrichNoise = { dropped: 0 }
                      const lineDbg = {
                        overlayPreviewLineMatchedToSubject: 0,
                        overlayPreviewLineStayedInBlock: 0,
                        overlayPreviewLineSentToFallback: 0,
                        overlayPreviewSectionReclassified: 0,
                        overlayPreviewStrippedSubjectPrefix: 0,
                        overlayPreviewDroppedTautology: 0,
                      }
                      for (const u of filteredUpdates) {
                        const sections = previewSectionsForOverlayPreview(u, enrichBand, enrichNoise)
                        for (const key of OVERLAY_PREVIEW_SECTION_ORDER) {
                          for (const line of sections[key]) {
                            const t = line.trim()
                            if (!t) continue
                            const { idx, route } = resolveEnrichPreviewLineToBlockIdx(
                              t,
                              enrichBand,
                              baseLessons,
                              u
                            )
                            if (route === 'prefix_or_label' || route === 'unique_word') {
                              lineDbg.overlayPreviewLineMatchedToSubject++
                            } else if (route === 'weak_update') {
                              lineDbg.overlayPreviewLineStayedInBlock++
                            } else {
                              lineDbg.overlayPreviewLineSentToFallback++
                            }
                            if (idx >= 0) {
                              const lesson = baseLessons[idx]!
                              const stripped = stripSubjectPrefixForBlockLine(t, enrichBand, lesson)
                              let finalLine = stripped.text
                              if (stripped.stripped) lineDbg.overlayPreviewStrippedSubjectPrefix++
                              let finalSection = key
                              const inferredSection = overlayPreviewSectionLabel('', finalLine)
                              if (
                                (key === 'Ekstra beskjed' || key === 'Ressurser' || key === 'Lekse') &&
                                inferredSection === 'I timen'
                              ) {
                                finalSection = 'I timen'
                                lineDbg.overlayPreviewSectionReclassified++
                              }
                              if (isTautologicalOverlayPreviewLine(finalLine, finalSection)) {
                                lineDbg.overlayPreviewDroppedTautology++
                                continue
                              }
                              blocks[idx]!.sections[finalSection].push(finalLine)
                            } else {
                              unplaced[key].push(t)
                            }
                          }
                        }
                      }
                      for (const b of blocks) {
                        for (const key of OVERLAY_PREVIEW_SECTION_ORDER) {
                          b.sections[key] = dedupeOverlayPreviewLines(
                            filterOverlayPreviewNoiseLines(b.sections[key], enrichBand, enrichNoise)
                          )
                        }
                      }
                      for (const key of OVERLAY_PREVIEW_SECTION_ORDER) {
                        unplaced[key] = dedupeOverlayPreviewLines(
                          filterOverlayPreviewNoiseLines(unplaced[key], enrichBand, enrichNoise)
                        )
                      }

                      const overlayClientOrphanLinesBeforeAssignment = OVERLAY_PREVIEW_SECTION_ORDER.reduce(
                        (n, key) => n + unplaced[key].length,
                        0
                      )
                      const overlayClientOrphanTaMedBeforeAssignment = OVERLAY_PREVIEW_SECTION_ORDER.reduce(
                        (n, sectionKey) => {
                          const sk = normOverlayText(sectionKey)
                          const isTaMedSection =
                            sectionKey === 'Ta med' || sk.includes('ta med') || sk.includes('husk')
                          return (
                            n +
                            unplaced[sectionKey].filter((line) => {
                              const t = line.trim()
                              return (
                                isTaMedSection ||
                                /\b(ha med|ta med|husk(?:\s+å)?)\b/i.test(t) ||
                                /\btyskprøve|tyskprøven|til\s+tyskprøv/i.test(t)
                              )
                            }).length
                          )
                        },
                        0
                      )
                      let overlayClientOrphanLineAssignedToSubject = 0
                      let overlayClientOrphanTaMedAssignedToSubject = 0
                      let overlayClientOrphanTyskProveBeforeAssignment = 0
                      let overlayClientOrphanTyskProveAssignedToSubject = 0
                      const overlayClientOrphanTyskProveAssignmentReason: Array<{
                        line: string
                        reason?: string
                      }> = []
                      if (baseLessons.length > 0 && details.action === 'enrich_existing_school_block') {
                        for (const key of OVERLAY_PREVIEW_SECTION_ORDER) {
                          for (const line of unplaced[key]) {
                            const t = line.trim()
                            if (t && !isClientOverlayAdminLine(t) && clientOrphanLineHasStrongTyskProveSignal(t)) {
                              overlayClientOrphanTyskProveBeforeAssignment++
                            }
                          }
                        }
                        for (const key of OVERLAY_PREVIEW_SECTION_ORDER) {
                          const nextUnplaced: string[] = []
                          const skNorm = normOverlayText(key)
                          const isTaMedSection = key === 'Ta med' || skNorm.includes('ta med') || skNorm.includes('husk')
                          for (const line of unplaced[key]) {
                            const t = line.trim()
                            if (!t) continue
                            if (isClientOverlayAdminLine(t)) continue
                            const hit = tryClientOrphanLineToLessonIndex(t, enrichBand, baseLessons)
                            if (hit) {
                              const lesson = baseLessons[hit.idx]!
                              const stripped = stripSubjectPrefixForBlockLine(t, enrichBand, lesson)
                              let finalLine = stripped.text
                              let finalSection: OverlayPreviewSectionLabel = key
                              const inferredSection = overlayPreviewSectionLabel('', finalLine)
                              if (
                                (key === 'Ekstra beskjed' || key === 'Ressurser' || key === 'Lekse') &&
                                inferredSection === 'I timen'
                              ) {
                                finalSection = 'I timen'
                              }
                              if (hit.reason.startsWith('client_signal_tysk')) {
                                const mapped = clientOrphanTargetSectionKeyForTyskLine(finalLine, finalSection)
                                if (mapped === 'huskTaMed') finalSection = 'Ta med'
                                else if (mapped === 'proveVurdering') finalSection = 'Prøve / vurdering'
                              }
                              if (!isTautologicalOverlayPreviewLine(finalLine, finalSection)) {
                                blocks[hit.idx]!.sections[finalSection].push(finalLine)
                                overlayClientOrphanLineAssignedToSubject++
                                if (
                                  hit.reason.startsWith('client_signal_tysk') &&
                                  clientOrphanLineHasStrongTyskProveSignal(t)
                                ) {
                                  overlayClientOrphanTyskProveAssignedToSubject++
                                  overlayClientOrphanTyskProveAssignmentReason.push({
                                    line: t,
                                    reason: hit.reason,
                                  })
                                }
                                if (
                                  isTaMedSection ||
                                  /\b(ha med|ta med|husk(?:\s+å)?)\b/i.test(t) ||
                                  /\btyskprøve|tyskprøven|til\s+tyskprøv/i.test(t)
                                ) {
                                  overlayClientOrphanTaMedAssignedToSubject++
                                }
                              }
                            } else {
                              nextUnplaced.push(line)
                            }
                          }
                          unplaced[key] = nextUnplaced
                        }
                        for (const b of blocks) {
                          for (const k of OVERLAY_PREVIEW_SECTION_ORDER) {
                            b.sections[k] = dedupeOverlayPreviewLines(
                              filterOverlayPreviewNoiseLines(b.sections[k], enrichBand, enrichNoise)
                            )
                          }
                        }
                        for (const key of OVERLAY_PREVIEW_SECTION_ORDER) {
                          unplaced[key] = dedupeOverlayPreviewLines(
                            filterOverlayPreviewNoiseLines(unplaced[key], enrichBand, enrichNoise)
                          )
                        }
                      }

                      if (DEBUG_SCHOOL_IMPORT_PANEL) {
                        console.debug('[overlay preview block]', {
                          overlayPreviewMode: details.action === 'enrich_existing_school_block' ? 'school_block' : 'special',
                          overlayPreviewDayAction: details.action,
                          overlayPreviewUsedSchoolProfileBase: baseLessons.length > 0,
                          overlayPreviewMatchedSubjectBlocks: blocks.length,
                          overlayPreviewUnplacedUpdates: OVERLAY_PREVIEW_SECTION_ORDER.reduce(
                            (n, key) => n + unplaced[key].length,
                            0
                          ),
                          overlayClientOrphanLinesBeforeAssignment,
                          overlayClientOrphanLineAssignedToSubject,
                          overlayClientOrphanTaMedBeforeAssignment,
                          overlayClientOrphanTaMedAssignedToSubject,
                          overlayClientOrphanTyskProveBeforeAssignment,
                          overlayClientOrphanTyskProveAssignedToSubject,
                          overlayClientOrphanTyskProveAssignmentReason,
                          overlayClientUnplacedLinesRemaining: OVERLAY_PREVIEW_SECTION_ORDER.reduce(
                            (n, key) => n + unplaced[key].length,
                            0
                          ),
                          ...lineDbg,
                          overlayPreviewDroppedNoiseLines: enrichNoise.dropped,
                          overlayPreviewSubjectBlocks: blocks.map((b) => ({
                            title: b.title,
                            sectionCount: OVERLAY_PREVIEW_SECTION_ORDER.reduce((n, key) => n + b.sections[key].length, 0),
                          })),
                          overlayPreviewDedupedLines: true,
                        })
                      }

                      if (blocks.length === 0 && compactLines.length > 0) {
                        return (
                          <>
                            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] text-zinc-700">
                              {readLines.map((line, idx) => (
                                <li key={`${line}-${idx}`}>{line}</li>
                              ))}
                            </ul>
                            {compactHiddenCount > 0 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setReadExpandedByDay((prev) => ({ ...prev, [day]: !prev[day] }))
                                }
                                className="mt-1 block max-w-full pl-4 text-left text-[10px] font-medium text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-900"
                              >
                                {readExpanded ? 'Vis færre' : `+ ${compactHiddenCount} flere linjer`}
                              </button>
                            ) : null}
                          </>
                        )
                      }

                      return (
                        <div className="mt-2 space-y-1.5">
                          {blocks.map((b, idx) => (
                            <div key={`${b.title}-${idx}`} className="rounded-lg border border-zinc-200 bg-zinc-50/70 px-2.5 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-semibold text-zinc-900">{b.title}</p>
                                {b.time ? <p className="text-[10px] text-zinc-500">{b.time}</p> : null}
                              </div>
                              {OVERLAY_PREVIEW_SECTION_ORDER.map((label) => {
                                const lines = b.sections[label]
                                if (lines.length === 0) return null
                                return (
                                  <div key={label} className="mt-1.5">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600">{label}</p>
                                    <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[11px] text-zinc-700">
                                      {lines.map((line, lineIdx) => (
                                        <li
                                          key={`${label}-${lineIdx}`}
                                          className={
                                            !overlayLineAllowedForLanguageTrack(line, track)
                                              ? 'text-zinc-500 opacity-90'
                                              : ''
                                          }
                                        >
                                          {line}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )
                              })}
                            </div>
                          ))}
                          {OVERLAY_PREVIEW_SECTION_ORDER.some((label) => unplaced[label].length > 0) ? (
                            <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/40 px-2 py-1.5">
                              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                                Ikke plassert
                              </p>
                              {OVERLAY_PREVIEW_SECTION_ORDER.map((label) => {
                                const lines = unplaced[label]
                                if (lines.length === 0) return null
                                return (
                                  <div key={label} className="mt-1">
                                    <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                                      {label}
                                    </p>
                                    <ul className="mt-0.5 list-disc space-y-0.5 pl-3 text-[10px] leading-snug text-zinc-600">
                                      {lines.map((line, lineIdx) => (
                                        <li
                                          key={`${label}-unplaced-${lineIdx}`}
                                          className={
                                            !overlayLineAllowedForLanguageTrack(line, track)
                                              ? 'text-zinc-400 opacity-90'
                                              : ''
                                          }
                                        >
                                          {line}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )
                              })}
                            </div>
                          ) : null}
                        </div>
                      )
                    })()}
                  </>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

function describeSchoolDayPlanShort(plan: ChildSchoolDayPlan): string {
  if (plan.useSimpleDay) {
    return `enkel dag ${plan.schoolStart ?? '?'}–${plan.schoolEnd ?? '?'}`
  }
  return `${(plan.lessons ?? []).length} timer`
}

function formatLessonSlotOneLine(L: SchoolLessonSlot): string {
  const lab = L.customLabel ? ` «${L.customLabel}»` : ''
  return `${L.subjectKey}${lab} · ${L.start}–${L.end}`
}

/** Kompakt per-dag-oppsummering av `ChildSchoolProfile` (parsed/draft). */
function formatSchoolImportWeekdayDebug(profile: ChildSchoolProfile): string {
  const lines: string[] = []
  for (let wd = 0; wd <= 4; wd++) {
    const plan = profile.weekdays[wd as WeekdayMonFri]
    const name = WD_LABEL_NB[wd] ?? `Dag ${wd}`
    if (!plan) {
      lines.push(`${name}: (ingen dagplan i modellen)`)
      continue
    }
    if (plan.useSimpleDay) {
      const ss = plan.schoolStart ?? '(mangler schoolStart)'
      const se = plan.schoolEnd ?? '(mangler schoolEnd)'
      lines.push(`${name}: Enkel dag · modell: ${ss}–${se}`)
    } else {
      const lessons = plan.lessons ?? []
      lines.push(`${name}: ${lessons.length} timer (Timer-modus)`)
      lessons.forEach((L, i) => {
        const lab = L.customLabel ? ` «${L.customLabel}»` : ''
        lines.push(`  ${i + 1}. ${L.subjectKey}${lab} · ${L.start}–${L.end}`)
      })
    }
  }
  return lines.join('\n')
}

/**
 * Menneskelesbar diff: parsed snapshot (etter API) vs gjeldende draft.
 * Retning: «snapshot → draft» der det er avvik.
 */
function formatSchoolImportSnapshotDraftDiff(
  snapshot: ChildSchoolProfile | null,
  draft: ChildSchoolProfile
): string {
  if (!snapshot) return '(Ingen gyldig snapshot — kan ikke sammenligne.)'
  const lines: string[] = []
  for (let wd = 0; wd <= 4; wd++) {
    const name = WD_LABEL_NB[wd] ?? `Dag ${wd}`
    const sPlan = snapshot.weekdays[wd as WeekdayMonFri]
    const dPlan = draft.weekdays[wd as WeekdayMonFri]
    if (!sPlan && !dPlan) {
      lines.push(`${name}: ingen dagplan (snapshot eller draft)`)
      continue
    }
    if (!sPlan && dPlan) {
      lines.push(`${name}: KUN I DRAFT · ${describeSchoolDayPlanShort(dPlan)}`)
      if (!dPlan.useSimpleDay) {
        ;(dPlan.lessons ?? []).forEach((L, i) => {
          lines.push(`    draft time ${i + 1}: ${formatLessonSlotOneLine(L)}`)
        })
      }
      continue
    }
    if (sPlan && !dPlan) {
      lines.push(`${name}: KUN I SNAPSHOT · ${describeSchoolDayPlanShort(sPlan)}`)
      if (!sPlan.useSimpleDay) {
        ;(sPlan.lessons ?? []).forEach((L, i) => {
          lines.push(`    snapshot time ${i + 1}: ${formatLessonSlotOneLine(L)}`)
        })
      }
      continue
    }
    const s = sPlan!
    const d = dPlan!
    if (JSON.stringify(s) === JSON.stringify(d)) {
      lines.push(`${name}: lik`)
      continue
    }
    lines.push(`${name}: AVVIK (snapshot → draft)`)
    if (s.useSimpleDay !== d.useSimpleDay) {
      lines.push(
        `  modus: ${s.useSimpleDay ? 'enkel dag' : 'timer'} → ${d.useSimpleDay ? 'enkel dag' : 'timer'}`
      )
    }
    if (s.useSimpleDay && d.useSimpleDay) {
      if (s.schoolStart !== d.schoolStart) {
        lines.push(`  schoolStart: «${s.schoolStart ?? '(mangler)'}» → «${d.schoolStart ?? '(mangler)'}»`)
      }
      if (s.schoolEnd !== d.schoolEnd) {
        lines.push(`  schoolEnd: «${s.schoolEnd ?? '(mangler)'}» → «${d.schoolEnd ?? '(mangler)'}»`)
      }
    }
    if (!s.useSimpleDay && !d.useSimpleDay) {
      const sl = s.lessons ?? []
      const dl = d.lessons ?? []
      if (sl.length !== dl.length) {
        lines.push(`  antall timer: ${sl.length} → ${dl.length}`)
      }
      const max = Math.max(sl.length, dl.length)
      for (let i = 0; i < max; i++) {
        const a = sl[i]
        const b = dl[i]
        if (!a) {
          lines.push(`  time ${i + 1}: kun i draft: ${b ? formatLessonSlotOneLine(b) : '?'}`)
          continue
        }
        if (!b) {
          lines.push(`  time ${i + 1}: kun i snapshot: ${formatLessonSlotOneLine(a)}`)
          continue
        }
        const bits: string[] = []
        if (a.subjectKey !== b.subjectKey) {
          bits.push(`fag «${a.subjectKey}» → «${b.subjectKey}»`)
        }
        const ac = a.customLabel ?? ''
        const bc = b.customLabel ?? ''
        if (ac !== bc) {
          bits.push(`etikett «${ac || '(ingen)'}» → «${bc || '(ingen)'}»`)
        }
        if (a.start !== b.start) bits.push(`start ${a.start} → ${b.start}`)
        if (a.end !== b.end) bits.push(`slutt ${a.end} → ${b.end}`)
        if (bits.length > 0) lines.push(`  time ${i + 1}: ${bits.join('; ')}`)
      }
    }
  }
  if (snapshot.gradeBand !== draft.gradeBand) {
    lines.push(`Trinn (gradeBand): snapshot «${snapshot.gradeBand}» → draft «${draft.gradeBand}»`)
  }
  return lines.join('\n')
}

function formatNorwegianDateLabel(isoDate: string): string {
  const t = isoDate.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return isoDate
  try {
    return new Date(`${t}T12:00:00`).toLocaleDateString('nb-NO', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return isoDate
  }
}

/** Kompakt datospenn for container-/programhendelser (f.eks. cup-helg). */
function formatNorwegianDateRangeLabel(isoStart: string, isoEnd: string): string {
  const s = isoStart.trim()
  const e = isoEnd.trim()
  if (s === e) return formatNorwegianDateLabel(s)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) {
    return `${isoStart} – ${isoEnd}`
  }
  try {
    const a = new Date(`${s}T12:00:00`)
    const b = new Date(`${e}T12:00:00`)
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return `${s} – ${e}`
    const y1 = a.getFullYear()
    const y2 = b.getFullYear()
    const m1 = a.getMonth()
    const m2 = b.getMonth()
    const d1 = a.getDate()
    const d2 = b.getDate()
    if (y1 === y2 && m1 === m2) {
      const month = a.toLocaleDateString('nb-NO', { month: 'long' })
      return `${d1}.–${d2}. ${month} ${y1}`
    }
    if (y1 === y2) {
      const ma = a.toLocaleDateString('nb-NO', { month: 'long' })
      const mb = b.toLocaleDateString('nb-NO', { month: 'long' })
      return `${d1}. ${ma} – ${d2}. ${mb} ${y1}`
    }
    return `${formatNorwegianDateLabel(s)} – ${formatNorwegianDateLabel(e)}`
  } catch {
    return `${s} – ${e}`
  }
}

/** Parent med innebygd program (merged cup/turnering) — egen meta-linje i review. */
function isEmbeddedScheduleParentReviewCard(item: PortalProposalItem, importKind: string): boolean {
  if (item.kind !== 'event' || importKind !== 'event') return false
  const m = item.event.metadata
  if (!m || typeof m !== 'object') return false
  const sched = (m as { embeddedSchedule?: unknown }).embeddedSchedule
  return (
    Array.isArray(sched) &&
    sched.length > 0 &&
    (m as { isAllDay?: boolean }).isAllDay === true
  )
}

/** Kompakt kildegrunnlag fra API (original), ikke nødvendigvis lik redigert notat. */
function getSourceContextText(item: PortalEventProposal): string | null {
  const meta = item.event.metadata
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    const rec = meta as Record<string, unknown>
    for (const key of ['sourceExcerpt', 'aiRationale', 'rationale', 'sourceText'] as const) {
      const v = rec[key]
      if (typeof v === 'string' && v.trim()) {
        const s = v.trim()
        return s.length > 200 ? `${s.slice(0, 197)}…` : s
      }
    }
  }
  const ref = item.externalRef?.trim()
  if (ref) return ref.length > 120 ? `Referanse: ${ref.slice(0, 117)}…` : `Referanse: ${ref}`
  return null
}

function getSourceContextTextForItem(item: PortalProposalItem): string | null {
  if (item.kind === 'event') return getSourceContextText(item)
  const ref = item.externalRef?.trim()
  if (ref) return ref.length > 120 ? `Referanse: ${ref.slice(0, 117)}…` : `Referanse: ${ref}`
  return null
}

const META_SOURCE_KEYS = ['sourceExcerpt', 'aiRationale', 'rationale', 'sourceText'] as const

function metaFieldHeading(key: (typeof META_SOURCE_KEYS)[number]): string {
  if (key === 'sourceExcerpt') return 'Utdrag fra kilde'
  if (key === 'aiRationale') return 'AI-begrunnelse'
  if (key === 'rationale') return 'Begrunnelse'
  return 'Kildetekst'
}

/** Fullt sammensatt kildegrunnlag for utvidet visning (ikke avkortet). */
function buildFullSourceContextDocument(item: PortalEventProposal): string | null {
  const blocks: string[] = []

  const meta = item.event.metadata
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    const rec = meta as Record<string, unknown>
    for (const key of META_SOURCE_KEYS) {
      const v = rec[key]
      if (typeof v !== 'string' || !v.trim()) continue
      const t = v.trim()
      blocks.push(`${metaFieldHeading(key)}\n${t}`)
    }
  }

  const ref = item.externalRef?.trim()
  if (ref) blocks.push(`Referanse\n${ref}`)

  if (blocks.length === 0) return null
  return blocks.join('\n\n────────\n\n')
}

function buildFullSourceContextDocumentForItem(item: PortalProposalItem): string | null {
  if (item.kind === 'event') return buildFullSourceContextDocument(item)
  const ref = item.externalRef?.trim()
  if (ref) return `Referanse\n${ref}`
  return null
}

function shouldOfferSourceExpand(full: string | null, preview: string | null): boolean {
  if (!full || !full.trim()) return false
  if (!preview || full.length > preview.length + 40) return true
  return full.includes('\n\n────────\n\n')
}

const TANKESTROM_FILE_ACCEPT =
  'image/*,.pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function pendingFileStatusLabel(p: TankestromPendingFile): string {
  switch (p.status) {
    case 'ready':
      return 'Klar'
    case 'analyzing':
      return 'Behandler…'
    case 'done':
      return 'Ferdig'
    case 'error':
      return p.statusDetail ? `Feilet: ${p.statusDetail}` : 'Feilet'
    default:
      return ''
  }
}

function pendingFileStatusClass(p: TankestromPendingFile): string {
  switch (p.status) {
    case 'ready':
      return 'border-zinc-200 bg-zinc-50 text-zinc-600'
    case 'analyzing':
      return 'border-brandTeal/40 bg-brandSky/30 text-brandNavy'
    case 'done':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900'
    case 'error':
      return 'border-rose-200 bg-rose-50 text-rose-900'
    default:
      return 'border-zinc-200 bg-zinc-50 text-zinc-600'
  }
}

function reminderLabel(reminderMinutes: number | undefined): string {
  if (reminderMinutes == null) return 'Ingen'
  if (reminderMinutes < 60) return `${reminderMinutes} min før`
  if (reminderMinutes % 60 === 0) return `${reminderMinutes / 60} t før`
  return `${reminderMinutes} min før`
}

export interface TankestromImportDialogProps {
  open: boolean
  onClose: () => void
  people: Person[]
  createEvent: UseEventControllerReturn['createEvent']
  createTask: (input: Omit<Task, 'id'>) => Promise<void>
  updatePerson?: (
    id: string,
    updates: Partial<Pick<Person, 'name' | 'colorTint' | 'colorAccent' | 'memberKind' | 'school' | 'work'>>
  ) => Promise<void>
}

export function TankestromImportDialog({
  open,
  onClose,
  people,
  createEvent,
  createTask,
  updatePerson,
}: TankestromImportDialogProps) {
  const {
    step,
    inputMode,
    setInputMode,
    pendingFiles,
    addFilesFromList,
    removePendingFile,
    textInput,
    setTextInput,
    bundle,
    analyzeWarning,
    calendarProposalItems,
    selectedIds,
    toggleProposal,
    draftByProposalId,
    updateEventDraft,
    updateTaskDraft,
    setProposalImportKind,
    analyzeLoading,
    saveLoading,
    error,
    runAnalyze,
    approveSelected,
    saveSchoolProfile,
    saveSchoolWeekOverlayThenCalendarSelection,
    canApproveSelection,
    canSaveSchoolProfile,
    canSaveSchoolWeekOverlay,
    schoolReview,
    schoolProfileChildId,
    setSchoolProfileChildId,
    setSchoolProfileDraft,
    setSchoolWeekOverlayProposalDraft,
  } = useTankestromImport({ open, people, createEvent, createTask, updatePerson })

  const validPersonIds = useMemo(() => new Set(people.map((p) => p.id)), [people])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileDropActive, setFileDropActive] = useState(false)

  const analyzedSourceSummary = useMemo(() => {
    if (inputMode !== 'file') return null
    const ok = pendingFiles.filter((p) => p.status === 'done')
    if (ok.length === 0) return null
    if (ok.length === 1) return ok[0]!.file.name
    return `${ok.length} filer`
  }, [inputMode, pendingFiles])

  const [expandedSourceIds, setExpandedSourceIds] = useState<Set<string>>(() => new Set())
  const [expandedDetailIds, setExpandedDetailIds] = useState<Set<string>>(() => new Set())
  const toggleSourceExpanded = useCallback((proposalId: string) => {
    setExpandedSourceIds((prev) => {
      const next = new Set(prev)
      if (next.has(proposalId)) next.delete(proposalId)
      else next.add(proposalId)
      return next
    })
  }, [])
  const toggleDetailsExpanded = useCallback((proposalId: string) => {
    setExpandedDetailIds((prev) => {
      const next = new Set(prev)
      if (next.has(proposalId)) next.delete(proposalId)
      else next.add(proposalId)
      return next
    })
  }, [])

  /** Full redigering for importkort — standard sammenslått for rask oversikt (særlig mobil). */
  const [reviewCardEditorOpen, setReviewCardEditorOpen] = useState<Set<string>>(() => new Set())
  const toggleReviewCardEditor = useCallback((proposalId: string) => {
    setReviewCardEditorOpen((prev) => {
      const next = new Set(prev)
      if (next.has(proposalId)) next.delete(proposalId)
      else next.add(proposalId)
      return next
    })
  }, [])

  const reviewSelectionStats = useMemo(() => {
    const total = calendarProposalItems.length
    const selected = selectedIds.size
    let withErrors = 0
    let ready = 0
    for (const id of selectedIds) {
      const d = draftByProposalId[id]
      if (!d) {
        withErrors += 1
        continue
      }
      const fe =
        d.importKind === 'event'
          ? getTankestromDraftFieldErrors(d.event, validPersonIds)
          : getTankestromTaskFieldErrors(d.task)
      if (Object.keys(fe).length > 0) withErrors += 1
      else ready += 1
    }
    return { total, selected, withErrors, ready }
  }, [calendarProposalItems.length, selectedIds, draftByProposalId, validPersonIds])

  useEffect(() => {
    if (!open) {
      setExpandedSourceIds(new Set())
      setExpandedDetailIds(new Set())
      setReviewCardEditorOpen(new Set())
    }
  }, [open])

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  const handleApprove = useCallback(async () => {
    const ok = await approveSelected()
    if (ok) {
      logEvent('tankestrom_import_completed', { count: selectedIds.size })
      onClose()
    }
  }, [approveSelected, onClose, selectedIds.size])

  const handleSaveSchoolProfile = useCallback(async () => {
    const ok = await saveSchoolProfile()
    if (ok) {
      logEvent('tankestrom_school_profile_saved', { childId: schoolProfileChildId })
      onClose()
    }
  }, [saveSchoolProfile, onClose, schoolProfileChildId])

  const handleSaveOverlayAndCalendar = useCallback(async () => {
    const ok = await saveSchoolWeekOverlayThenCalendarSelection()
    if (ok) {
      if (bundle?.schoolWeekOverlayProposal) {
        logEvent('tankestrom_school_week_overlay_saved', { childId: schoolProfileChildId })
      }
      if (selectedIds.size > 0) {
        logEvent('tankestrom_import_completed', { count: selectedIds.size })
      }
      onClose()
    }
  }, [
    saveSchoolWeekOverlayThenCalendarSelection,
    bundle?.schoolWeekOverlayProposal,
    schoolProfileChildId,
    selectedIds.size,
    onClose,
  ])

  const childrenList = useMemo(() => people.filter((p) => p.memberKind === 'child'), [people])

  const schoolLessonConflicts = useMemo(
    () => (schoolReview ? detectLessonConflicts(schoolReview.draft) : []),
    [schoolReview?.draft]
  )
  const schoolWeekOverlayProposal = bundle?.schoolWeekOverlayProposal ?? null
  const editableOverlayDaysCount = useMemo(() => {
    if (!schoolWeekOverlayProposal) return 0
    return Object.values(schoolWeekOverlayProposal.dailyActions).filter(Boolean).length
  }, [schoolWeekOverlayProposal])

  const homeworkTaskItemsCount = useMemo(
    () => calendarProposalItems.filter((i) => i.kind === 'task').length,
    [calendarProposalItems]
  )
  const selectedHomeworkTaskCount = useMemo(() => {
    let n = 0
    for (const id of selectedIds) {
      const d = draftByProposalId[id]
      if (d?.importKind === 'task') n += 1
    }
    return n
  }, [selectedIds, draftByProposalId])

  const resolvedOverlayChildName = useMemo(
    () => people.find((p) => p.id === schoolProfileChildId)?.name ?? '',
    [people, schoolProfileChildId]
  )

  const overlayReviewLanguageTrack = useMemo(() => {
    const child = people.find((p) => p.id === schoolProfileChildId)
    return inferLanguageTrackFromChildSchool(child?.school)
  }, [people, schoolProfileChildId])
  const overlayReviewValgfagTrack = useMemo(() => {
    const child = people.find((p) => p.id === schoolProfileChildId)
    return inferValgfagTrackFromChildSchool(child?.school)
  }, [people, schoolProfileChildId])
  const overlayPreviewSchoolBase = useMemo(
    () => people.find((p) => p.id === schoolProfileChildId)?.school,
    [people, schoolProfileChildId]
  )

  const tasksDefaultedToGlobalChild = useMemo(() => {
    if (!schoolProfileChildId.trim()) return 0
    let n = 0
    for (const item of calendarProposalItems) {
      if (item.kind !== 'task') continue
      const draft = draftByProposalId[item.proposalId]
      if (draft?.importKind === 'task' && draft.task.childPersonId.trim() === schoolProfileChildId.trim()) {
        n += 1
      }
    }
    return n
  }, [calendarProposalItems, draftByProposalId, schoolProfileChildId])

  const overlayDraftBaselineRef = useRef<string>('')
  useEffect(() => {
    if (!schoolWeekOverlayProposal) {
      overlayDraftBaselineRef.current = ''
      return
    }
    const marker = `${schoolWeekOverlayProposal.proposalId}::${JSON.stringify(schoolWeekOverlayProposal)}`
    if (!overlayDraftBaselineRef.current) overlayDraftBaselineRef.current = marker
    const currentProposalId = overlayDraftBaselineRef.current.split('::')[0] ?? ''
    if (currentProposalId !== schoolWeekOverlayProposal.proposalId) {
      overlayDraftBaselineRef.current = marker
    }
  }, [schoolWeekOverlayProposal])
  const overlayEditedDraftChanged = useMemo(() => {
    if (!schoolWeekOverlayProposal || !overlayDraftBaselineRef.current) return false
    return overlayDraftBaselineRef.current !== `${schoolWeekOverlayProposal.proposalId}::${JSON.stringify(schoolWeekOverlayProposal)}`
  }, [schoolWeekOverlayProposal])

  const schoolImportDebugPanel = useMemo(() => {
    if (!schoolReview || !DEBUG_SCHOOL_IMPORT_PANEL) return null
    const snapshot = schoolReview.parsedProfileSnapshotJson
    const draftJson = JSON.stringify(schoolReview.draft, null, 2)
    const draftMatchesParsedSnapshot = draftJson === snapshot
    let snapshotProfile: ChildSchoolProfile | null = null
    try {
      snapshotProfile = JSON.parse(snapshot) as ChildSchoolProfile
    } catch {
      snapshotProfile = null
    }
    const draftLines = formatSchoolImportWeekdayDebug(schoolReview.draft)
    const snapshotLines = snapshotProfile
      ? formatSchoolImportWeekdayDebug(snapshotProfile)
      : '(ugyldig snapshot-JSON)'
    const summariesMatch = draftLines === snapshotLines
    const snapshotDraftDiff = formatSchoolImportSnapshotDraftDiff(snapshotProfile, schoolReview.draft)
    return {
      snapshot,
      draftJson,
      draftMatchesParsedSnapshot,
      draftLines,
      snapshotLines,
      summariesMatch,
      snapshotDraftDiff,
    }
  }, [schoolReview])

  const prevGlobalOverlayChildRef = useRef<string>('')

  useEffect(() => {
    if (!open || step !== 'review' || schoolReview || !schoolWeekOverlayProposal) {
      prevGlobalOverlayChildRef.current = schoolProfileChildId.trim()
      return
    }
    const currentGlobalChildId = schoolProfileChildId.trim()
    const previousGlobalChildId = prevGlobalOverlayChildRef.current.trim()
    if (!currentGlobalChildId || !previousGlobalChildId || currentGlobalChildId === previousGlobalChildId) {
      prevGlobalOverlayChildRef.current = currentGlobalChildId
      return
    }

    let changedTaskDrafts = 0
    for (const item of calendarProposalItems) {
      if (item.kind !== 'task') continue
      const pid = item.proposalId
      const d = draftByProposalId[pid]
      if (!d || d.importKind !== 'task') continue
      const currentTaskChildId = d.task.childPersonId.trim()
      // Flytt bare tasks som fortsatt følger global default (eller mangler barn), og behold manuelle avvik.
      const shouldFollowGlobal = !currentTaskChildId || currentTaskChildId === previousGlobalChildId
      if (!shouldFollowGlobal) continue
      updateTaskDraft(pid, { childPersonId: currentGlobalChildId })
      changedTaskDrafts += 1
    }

    if (DEBUG_SCHOOL_IMPORT_PANEL && changedTaskDrafts > 0) {
      console.debug('[tankestrom overlay child retarget]', {
        fromChildId: previousGlobalChildId,
        toChildId: currentGlobalChildId,
        changedTaskDrafts,
      })
    }
    prevGlobalOverlayChildRef.current = currentGlobalChildId
  }, [
    open,
    step,
    schoolReview,
    schoolWeekOverlayProposal,
    schoolProfileChildId,
    calendarProposalItems,
    draftByProposalId,
    updateTaskDraft,
  ])

  useEffect(() => {
    if (!DEBUG_SCHOOL_IMPORT_PANEL || !open || step !== 'review' || schoolReview) return
    console.debug('[tankestrom import general review]', {
      overlayPresent: !!schoolWeekOverlayProposal,
      globalOverlayChildId: schoolProfileChildId,
      resolvedOverlayChildName,
      taskItemsCount: homeworkTaskItemsCount,
      selectedTaskItemsCount: selectedHomeworkTaskCount,
      tasksDefaultedToGlobalChild,
      reviewLanguageTrack: overlayReviewLanguageTrack,
      reviewValgfagTrack: overlayReviewValgfagTrack,
      editableOverlayDaysCount,
      overlayEditedDraftChanged,
      branch: schoolWeekOverlayProposal ? 'overlay_plus_calendar' : 'calendar_only',
    })
  }, [
    open,
    step,
    schoolReview,
    schoolWeekOverlayProposal,
    schoolProfileChildId,
    resolvedOverlayChildName,
    homeworkTaskItemsCount,
    selectedHomeworkTaskCount,
    tasksDefaultedToGlobalChild,
    overlayReviewLanguageTrack,
    overlayReviewValgfagTrack,
    editableOverlayDaysCount,
    overlayEditedDraftChanged,
  ])

  if (!open) return null

  const hasPeople = people.length > 0

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 px-2 pb-2 pt-12 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tankestrom-import-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div
        className="flex max-h-[min(92vh,780px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 flex-col border-b border-zinc-100">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <h2 id="tankestrom-import-title" className="text-[17px] font-semibold text-zinc-900">
              {step === 'review' && schoolReview ? 'Timeplan fra Tankestrøm' : 'Importer fra Tankestrøm'}
            </h2>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
              aria-label="Lukk"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {step === 'review' ? (
            <>
              <p
                className="truncate px-4 pb-2.5 text-[11px] leading-snug text-zinc-500"
                title={
                  inputMode === 'file'
                    ? pendingFiles
                        .filter((p) => p.status === 'done')
                        .map((p) => p.file.name)
                        .join(', ') || undefined
                    : undefined
                }
              >
                <span className="font-medium text-zinc-400">Analysert kilde:</span>{' '}
                <span className="font-semibold text-zinc-700">
                  {inputMode === 'file' ? analyzedSourceSummary ?? 'Filer' : 'Limt inn tekst'}
                </span>
              </p>
              {DEBUG_SCHOOL_IMPORT_PANEL && schoolReview ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="mx-4 mb-2 flex items-center justify-center gap-2 rounded-lg border-2 border-violet-500 bg-violet-100 px-2 py-2 shadow-sm"
                >
                  <span className="rounded bg-violet-600 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                    Debug
                  </span>
                  <span className="text-center text-[11px] font-semibold leading-tight text-violet-950">
                    Skole-import-feilsøk er på — du ser parsed snapshot vs draft under
                  </span>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4">
          {!hasPeople ? (
            <p className="text-[13px] text-zinc-600">
              Legg til familiemedlemmer under Innstillinger før du kan knytte hendelser til en person.
            </p>
          ) : step === 'pick' ? (
            <div className="space-y-4">
              <p className="text-[13px] leading-relaxed text-zinc-600">
                Velg inputmodus og analyser innholdet. Du kan få{' '}
                <span className="font-medium text-zinc-800">fast timeplan</span> (lagres som skoleprofil), eller forslag
                som <span className="font-medium text-zinc-800">hendelser</span> og/eller{' '}
                <span className="font-medium text-zinc-800">gjøremål</span> — bytt type før import om nødvendig.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setInputMode('file')}
                  className={`rounded-xl border px-3 py-2 text-[13px] font-medium transition ${
                    inputMode === 'file'
                      ? 'border-brandTeal/50 bg-brandSky/35 text-brandNavy'
                      : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  Fil
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('text')}
                  className={`rounded-xl border px-3 py-2 text-[13px] font-medium transition ${
                    inputMode === 'text'
                      ? 'border-brandTeal/50 bg-brandSky/35 text-brandNavy'
                      : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  Tekst
                </button>
              </div>

              {inputMode === 'file' ? (
                <div className={`${cardSection} p-3`}>
                  <p className={typSectionCap}>Filer</p>
                  <p className="mt-1 text-[12px] leading-snug text-zinc-500">
                    Velg flere filer på én gang, eller slipp dem i feltet nedenfor.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={TANKESTROM_FILE_ACCEPT}
                    className="sr-only"
                    aria-label="Velg filer til analyse"
                    onChange={(e) => {
                      const list = e.target.files
                      if (list && list.length > 0) addFilesFromList(list)
                      e.target.value = ''
                    }}
                  />
                  <div
                    role="button"
                    tabIndex={0}
                    className={`mt-3 flex min-h-[100px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-3 py-4 text-center transition sm:min-h-[112px] ${
                      fileDropActive
                        ? 'border-brandTeal bg-brandSky/25 text-brandNavy'
                        : 'border-zinc-200 bg-zinc-50/80 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50'
                    }`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        fileInputRef.current?.click()
                      }
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    onDragEnter={(e: DragEvent) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setFileDropActive(true)
                    }}
                    onDragOver={(e: DragEvent) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setFileDropActive(true)
                    }}
                    onDragLeave={(e: DragEvent) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileDropActive(false)
                    }}
                    onDrop={(e: DragEvent) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setFileDropActive(false)
                      const list = e.dataTransfer.files
                      if (list && list.length > 0) addFilesFromList(list)
                    }}
                  >
                    <svg
                      className="pointer-events-none mb-2 h-8 w-8 text-zinc-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                      />
                    </svg>
                    <p className="pointer-events-none text-[13px] font-medium text-zinc-800">
                      Slipp filer her eller trykk for å velge
                    </p>
                    <p className="pointer-events-none mt-1 text-[11px] text-zinc-500">
                      PDF, bilder og Word-dokumenter
                    </p>
                  </div>

                  {pendingFiles.length > 0 ? (
                    <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto overscroll-y-contain" aria-label="Valgte filer">
                      {pendingFiles.map((p) => (
                        <li
                          key={p.id}
                          className={`flex items-start gap-2 rounded-xl border px-2.5 py-2 text-left text-[12px] ${pendingFileStatusClass(p)}`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium" title={p.file.name}>
                              {p.file.name}
                            </p>
                            <p className="mt-0.5 text-[11px] opacity-90">{pendingFileStatusLabel(p)}</p>
                          </div>
                          <button
                            type="button"
                            className="shrink-0 rounded-lg p-1.5 text-current opacity-70 hover:bg-black/5 hover:opacity-100 disabled:pointer-events-none disabled:opacity-40"
                            aria-label={`Fjern ${p.file.name}`}
                            disabled={analyzeLoading}
                            onClick={(e) => {
                              e.stopPropagation()
                              removePendingFile(p.id)
                            }}
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : (
                <div className={`${cardSection} p-3`}>
                  <p className={typSectionCap}>Tekst</p>
                  <Textarea
                    id="ts-import-text"
                    rows={6}
                    label="Lim inn tekst som skal analyseres"
                    placeholder="F.eks. ukeplan, e-post eller aktivitetsbeskrivelse"
                    value={textInput}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setTextInput(e.target.value)}
                  />
                </div>
              )}
              {error && <p className="text-[13px] text-rose-600">{error}</p>}
            </div>
          ) : schoolReview ? (
            <div className="space-y-4">
              {schoolWeekOverlayProposal ? (
                <>
                  <SchoolWeekOverlayReviewCard
                    overlay={schoolWeekOverlayProposal}
                    resolvedLanguageTrack={overlayReviewLanguageTrack}
                    resolvedValgfagTrack={overlayReviewValgfagTrack}
                    baseSchoolProfile={overlayPreviewSchoolBase}
                  />
                  <div>
                    <label htmlFor="ts-overlay-child" className="text-[12px] font-medium text-zinc-700">
                      Knytt uke-overlay til barn
                    </label>
                    {childrenList.length === 0 ? (
                      <p className="mt-1 text-[12px] text-amber-800">
                        Legg til minst ett barn under Innstillinger for å lagre uke-overlay.
                      </p>
                    ) : (
                      <select
                        id="ts-overlay-child"
                        className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[14px] text-zinc-900"
                        value={schoolProfileChildId}
                        onChange={(e) => setSchoolProfileChildId(e.target.value)}
                      >
                        {childrenList.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Lagrer uke-spesifikt override på barnets eksisterende skoleprofil (ikke som egen kalenderaktivitet).
                    </p>
                  </div>
                </>
              ) : null}
              {analyzeWarning ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-950 whitespace-pre-wrap">
                  {analyzeWarning}
                </p>
              ) : null}
              <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-3">
                <p className="text-[12px] font-semibold text-rose-900">Erstatter hele skoleprofilen</p>
                <p className="mt-1 text-[11px] leading-snug text-rose-800/95">
                  Lagring overskriver barnets eksisterende faste timeplan (mandag–fredag) med det du ser under. Importerte
                  A-planer og hendelser påvirkes ikke.
                </p>
              </div>
              <div>
                <label htmlFor="ts-school-child" className="text-[12px] font-medium text-zinc-700">
                  Velg barn
                </label>
                {childrenList.length === 0 ? (
                  <p className="mt-1 text-[12px] text-amber-800">
                    Legg til minst ett barn under Innstillinger for å lagre timeplanen.
                  </p>
                ) : (
                  <select
                    id="ts-school-child"
                    className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[14px] text-zinc-900"
                    value={schoolProfileChildId}
                    onChange={(e) => setSchoolProfileChildId(e.target.value)}
                  >
                    {childrenList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 px-2 py-2">
                {import.meta.env.DEV || import.meta.env.VITE_SPF_BUILD_PROBE === '1' ? (
                  <p
                    role="status"
                    className="mb-2 rounded-lg border-2 border-black bg-yellow-300 px-2 py-2 text-center text-[13px] font-black uppercase tracking-widest text-black"
                    data-build-probe="SPF-LOCAL-V2"
                  >
                    SPF-LOCAL-V2 — build-probe (fjern etter verifisering)
                  </p>
                ) : null}
                <p className={typSectionCap}>Timeplan</p>
                <p className="mb-2 flex flex-wrap items-center gap-2 px-1 text-[11px] text-zinc-500">
                  <span className="font-medium text-zinc-600">{schoolReview.meta.originalSourceType}</span>
                  {(() => {
                    const badge = confidenceBadgeStyle(schoolReview.meta.confidence)
                    return (
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    )
                  })()}
                </p>
                {schoolLessonConflicts.length > 0 ? (
                  <div className="mb-3 rounded-xl border border-amber-300/80 bg-amber-50 px-3 py-3">
                    <p className="text-[12px] font-semibold text-amber-950">Velg spor (parallelle timer)</p>
                    <p className="mt-1 text-[11px] leading-snug text-amber-900/95">
                      Timeplanen viser flere mulige fag i samme tidsrom (for eksempel D1/D2 eller ulike språk). Dette er
                      vanligvis ulike grupper — barnet har bare ett av dem. Velg det som gjelder for dette barnet. Vi
                      lagrer ikke flere overlappende timer for samme spor.
                    </p>
                    <ul className="mt-3 space-y-3">
                      {schoolLessonConflicts.map((group) => (
                        <li
                          key={lessonConflictGroupId(group)}
                          className="rounded-lg border border-amber-200/90 bg-white/90 px-3 py-2.5 shadow-sm"
                        >
                          <p className="text-[12px] font-medium text-zinc-900">
                            {WD_LABEL_NB[group.weekday]}{' '}
                            <span className="tabular-nums text-zinc-600">
                              {formatTimeRange(group.displayStart, group.displayEnd)}
                            </span>
                          </p>
                          <fieldset className="mt-2 space-y-2 border-0 p-0">
                            <legend className="sr-only">Velg fag for dette tidsrommet</legend>
                            {group.candidates.map((slot, idx) => {
                              const label = lessonDisplayLabel(schoolReview.draft.gradeBand, slot)
                              const fieldId = `${lessonConflictGroupId(group)}-${idx}`
                              return (
                                <label
                                  key={fieldId}
                                  htmlFor={fieldId}
                                  className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-zinc-200/80 bg-zinc-50/80 px-2.5 py-2 transition hover:border-amber-300/60"
                                >
                                  <input
                                    id={fieldId}
                                    type="radio"
                                    name={lessonConflictGroupId(group)}
                                    className="mt-0.5 h-4 w-4 shrink-0 border-zinc-300 text-brandTeal focus:ring-brandTeal/30"
                                    onChange={() =>
                                      setSchoolProfileDraft(
                                        applyLessonConflictChoice(schoolReview.draft, group, idx)
                                      )
                                    }
                                  />
                                  <span className="text-[13px] leading-snug text-zinc-800">{label}</span>
                                  <span className="ml-auto shrink-0 text-[11px] tabular-nums text-zinc-500">
                                    {slot.start}–{slot.end}
                                  </span>
                                </label>
                              )
                            })}
                          </fieldset>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {schoolImportDebugPanel ? (
                  <details className="mb-3 rounded-lg border-2 border-violet-400 bg-violet-50/70 px-3 py-2 shadow-sm open:shadow-md">
                    <summary className="cursor-pointer select-none text-[12px] font-semibold text-violet-950">
                      <span className="mr-2 inline-flex rounded bg-violet-600 px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-wide text-white">
                        Debug
                      </span>
                      Feilsøk timeplan-import (parsed snapshot vs draft)
                    </summary>
                    <div className="mt-2 space-y-2 text-[11px] leading-snug text-zinc-800">
                      <p>
                        Rå HTTP-body fra Tankestrøm lagres ikke i klienten. Under er{' '}
                        <span className="font-medium">lag 2</span> (tolket profil rett etter parse, som JSON) og{' '}
                        <span className="font-medium">draft</span> (det skjemaet får — ved åpning klonet fra lag 2).
                      </p>
                      <p className="rounded-md border border-zinc-200/90 bg-white/90 px-2 py-1.5 text-[10px] text-zinc-600">
                        «Neste time foreslås fra forrige sluttid. Standard varighet: 60 min.» er statisk hjelpetekst i
                        «Timer»-modus. Den kjører ikke ved import og oppretter ikke timer; den beskriver redigering når du
                        endrer en sluttid.
                      </p>
                      <p className="tabular-nums">
                        Draft JSON identisk med parsed snapshot:{' '}
                        <span className="font-mono font-semibold">
                          {schoolImportDebugPanel.draftMatchesParsedSnapshot ? 'ja' : 'nei'}
                        </span>
                        {!schoolImportDebugPanel.summariesMatch ? (
                          <span className="text-zinc-500"> · Per-dag-oppsummering avviker</span>
                        ) : null}
                      </p>
                      <details className="rounded-md border border-amber-200/90 bg-amber-50/50 open:bg-amber-50/70">
                        <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-semibold text-amber-950">
                          Avvik per dag og per time (snapshot → draft)
                        </summary>
                        <pre className="max-h-48 overflow-auto border-t border-amber-100/80 bg-white/90 p-2 text-[10px] font-mono leading-snug whitespace-pre-wrap text-zinc-900">
                          {schoolImportDebugPanel.snapshotDraftDiff}
                        </pre>
                      </details>
                      <p className="text-[10px] text-zinc-500">
                        Tips: Åpne nettleserens devtools (F12) → Console. Med{' '}
                        <code className="rounded bg-zinc-100 px-0.5">VITE_DEBUG_SCHOOL_IMPORT=true</code> logges snapshot-lengde
                        ved import; du kan også lime inn JSON fra «Full JSON» under i konsollen som{' '}
                        <code className="rounded bg-zinc-100 px-0.5">JSON.parse(...)</code> for å inspisere objekter per ukedag.
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <p className="mb-0.5 font-medium text-zinc-700">Parsed snapshot (per dag)</p>
                          <pre className="max-h-36 overflow-auto rounded-md border border-zinc-200 bg-white p-2 text-[10px] font-mono whitespace-pre-wrap text-zinc-800">
                            {schoolImportDebugPanel.snapshotLines}
                          </pre>
                        </div>
                        <div>
                          <p className="mb-0.5 font-medium text-zinc-700">Nåværende draft (per dag)</p>
                          <pre className="max-h-36 overflow-auto rounded-md border border-zinc-200 bg-white p-2 text-[10px] font-mono whitespace-pre-wrap text-zinc-800">
                            {schoolImportDebugPanel.draftLines}
                          </pre>
                        </div>
                      </div>
                      <details className="rounded-md border border-zinc-200 bg-white/70">
                        <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-medium text-zinc-700">
                          Full JSON: snapshot vs draft
                        </summary>
                        <div className="grid max-h-56 gap-2 overflow-hidden border-t border-zinc-100 p-2 sm:grid-cols-2">
                          <pre className="max-h-52 overflow-auto rounded border border-zinc-100 bg-zinc-50/80 p-2 text-[9px] font-mono leading-tight whitespace-pre-wrap text-zinc-800">
                            {schoolImportDebugPanel.snapshot}
                          </pre>
                          <pre className="max-h-52 overflow-auto rounded border border-zinc-100 bg-zinc-50/80 p-2 text-[9px] font-mono leading-tight whitespace-pre-wrap text-zinc-800">
                            {schoolImportDebugPanel.draftJson}
                          </pre>
                        </div>
                      </details>
                      <p className="text-[10px] text-zinc-500">
                        I «Enkel dag» kan skjemaet vise gate-tider i feltene når modellen mangler schoolStart/schoolEnd —
                        det er visningsfallback til du lagrer endring; sjekk JSON over for faktiske feltverdier.
                      </p>
                    </div>
                  </details>
                ) : null}
                <div
                  className="max-h-[min(50vh,420px)] overflow-y-auto overscroll-y-contain pr-1"
                  data-render-parent="TankestromImportDialog-schoolReview-scroll"
                >
                  <SchoolProfileFields value={schoolReview.draft} onChange={setSchoolProfileDraft} />
                </div>
              </div>
              {error ? (
                <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[13px] text-rose-800">
                  {error}
                </p>
              ) : null}
              {!updatePerson ? (
                <p className="text-[12px] text-amber-800">Lagring er ikke tilgjengelig. Prøv å oppdatere appen.</p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              {schoolWeekOverlayProposal ? (
                <div className="rounded-xl border border-indigo-200/90 bg-indigo-50/60 px-3 py-2.5">
                  <label htmlFor="ts-global-overlay-child" className="text-[12px] font-medium text-indigo-950">
                    Gjelder barn
                  </label>
                  {childrenList.length === 0 ? (
                    <p className="mt-1 text-[12px] text-amber-800">
                      Legg til minst ett barn under Innstillinger for å lagre overlay og knytte oppgaver riktig.
                    </p>
                  ) : (
                    <select
                      id="ts-global-overlay-child"
                      className="mt-1.5 w-full rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-[14px] text-zinc-900"
                      value={schoolProfileChildId}
                      onChange={(e) => setSchoolProfileChildId(e.target.value)}
                    >
                      {childrenList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <p className="mt-1.5 text-[11px] text-indigo-900/90">
                    Denne planen er nå koblet til:{' '}
                    <span className="font-semibold">{resolvedOverlayChildName || 'ikke valgt barn'}</span>
                    {overlayReviewLanguageTrack ? (
                      <>
                        {' '}
                        · språkspor: <span className="font-semibold">{overlayReviewLanguageTrack}</span>
                      </>
                    ) : null}
                  </p>
                </div>
              ) : null}
              {schoolWeekOverlayProposal ? (
                <SchoolWeekOverlayReviewCard
                  overlay={schoolWeekOverlayProposal}
                  resolvedLanguageTrack={overlayReviewLanguageTrack}
                  resolvedValgfagTrack={overlayReviewValgfagTrack}
                  baseSchoolProfile={overlayPreviewSchoolBase}
                  onChange={setSchoolWeekOverlayProposalDraft}
                />
              ) : null}
              {schoolWeekOverlayProposal && calendarProposalItems.length > 0 ? (
                <div className="rounded-xl border border-emerald-200/90 bg-emerald-50/70 px-3 py-2.5">
                  <p className="text-[12px] font-semibold text-emerald-950">To typer innhold</p>
                  <p className="mt-1 text-[11px] leading-snug text-emerald-900/95">
                    <span className="font-medium">Uke-overlay</span> oppdaterer skoleblokken i kalenderen for valgt barn
                    denne uka. <span className="font-medium">Kortene under</span> blir egne hendelser eller gjøremål —
                    rediger feltene og bruk avkrysning for å styre hva som importeres sammen med overlayen.
                  </p>
                </div>
              ) : null}
              {analyzeWarning ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-950 whitespace-pre-wrap">
                  {analyzeWarning}
                </p>
              ) : null}
              <div className="rounded-xl border border-brandNavy/15 bg-brandSky/20 px-3 py-2.5">
                <p className="text-[12px] font-medium leading-snug text-brandNavy">
                  Gå gjennom forslagene nedenfor. Kun <span className="font-semibold">avkryssede</span> kort importeres
                  som hendelser eller gjøremål
                  {schoolWeekOverlayProposal
                    ? ' — samme knapp lagrer også uke-overlay (huk av alt du ikke vil ha med).'
                    : '.'}
                </p>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-white/70 px-2 py-1.5">
                    <dt className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">Valgt</dt>
                    <dd className="text-[15px] font-bold tabular-nums text-brandNavy">{reviewSelectionStats.selected}</dd>
                  </div>
                  <div className="rounded-lg bg-white/70 px-2 py-1.5">
                    <dt className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">Trenger retting</dt>
                    <dd className="text-[15px] font-bold tabular-nums text-amber-800">{reviewSelectionStats.withErrors}</dd>
                  </div>
                  <div className="rounded-lg bg-white/70 px-2 py-1.5">
                    <dt className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">Klare</dt>
                    <dd className="text-[15px] font-bold tabular-nums text-emerald-800">{reviewSelectionStats.ready}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-[10px] leading-snug text-zinc-500">
                  Av {reviewSelectionStats.total} forslag · «Klare» = valgt og uten valideringsfeil.
                </p>
                {schoolWeekOverlayProposal ? (
                  <p className="mt-1 text-[10px] leading-snug text-zinc-500">
                    Oppgaver satt til valgt barn: {tasksDefaultedToGlobalChild} av {homeworkTaskItemsCount}.
                    Per-kort «Gjelder barn» kan brukes for avvik.
                  </p>
                ) : null}
              </div>

              <ul className="space-y-2 sm:space-y-4">
                {calendarProposalItems.map((item) => {
                  const u = draftByProposalId[item.proposalId]
                  if (!u) return null
                  const checked = selectedIds.has(item.proposalId)
                  const pid = item.proposalId
                  const disabled = !checked
                  const badge = confidenceBadgeStyle(item.confidence)
                  const sourceCtx = getSourceContextTextForItem(item)
                  const fullSourceDoc = buildFullSourceContextDocumentForItem(item)
                  const hasMeaningfulSourceBasis = Boolean(
                    (sourceCtx && sourceCtx.trim()) || (fullSourceDoc && fullSourceDoc.trim())
                  )
                  const showSourceExpandToggle = sourceCtx && shouldOfferSourceExpand(fullSourceDoc, sourceCtx)
                  const sourceExpanded = expandedSourceIds.has(pid)
                  const detailsExpanded = expandedDetailIds.has(pid)
                  const cardTitle =
                    (u.importKind === 'event' ? u.event.title : u.task.title).trim() || 'Uten tittel'
                  const eventFieldErrors =
                    u.importKind === 'event' && checked
                      ? getTankestromDraftFieldErrors(u.event, validPersonIds)
                      : {}
                  const taskFieldErrors =
                    u.importKind === 'task' && checked ? getTankestromTaskFieldErrors(u.task) : {}
                  const schoolCtx =
                    item.kind === 'event' && u.importKind === 'event'
                      ? schoolContextFromEventProposal(item)
                      : null
                  const schoolCtxPerson =
                    schoolCtx && u.importKind === 'event'
                      ? people.find((p) => p.id === u.event.personId)
                      : null
                  const schoolCtxSubjectLabel = schoolCtx
                    ? schoolContextSubjectLabel(schoolCtxPerson?.school?.gradeBand, schoolCtx)
                    : null
                  const taskLangMismatch =
                    item.kind === 'task' &&
                    u.importKind === 'task' &&
                    taskIndicatesForeignLanguageMismatchWithTrack(
                      u.task.title,
                      scanNotesBodyForLanguage(u.task.notes),
                      overlayReviewLanguageTrack
                    )

                  const editorOpen = reviewCardEditorOpen.has(pid)
                  const compactConf = confidenceBadgeCompactStyle(item.confidence)
                  const notesRaw = u.importKind === 'event' ? u.event.notes : u.task.notes
                  const notesPrev = notesPreviewSnippet(notesRaw, 130)
                  const hasFieldErrors =
                    u.importKind === 'event'
                      ? Object.keys(eventFieldErrors).length > 0
                      : Object.keys(taskFieldErrors).length > 0

                  const eventTimeSummary = (() => {
                    if (u.importKind !== 'event') return ''
                    const ts = u.event.start.length > 5 ? u.event.start.slice(0, 5) : u.event.start
                    const te = u.event.end.length > 5 ? u.event.end.slice(0, 5) : u.event.end
                    const hm = /^([01]\d|2[0-3]):[0-5]\d$/
                    return hm.test(ts) && hm.test(te) ? formatTimeRange(ts, te) : ts && te ? `${ts}–${te}` : '—'
                  })()

                  const embeddedScheduleParentCard = isEmbeddedScheduleParentReviewCard(item, u.importKind)
                  const embeddedScheduleLen =
                    item.kind === 'event' && Array.isArray(item.event.metadata?.embeddedSchedule)
                      ? item.event.metadata.embeddedSchedule.length
                      : 0
                  const embeddedEndDate =
                    item.kind === 'event' && typeof item.event.metadata?.endDate === 'string'
                      ? item.event.metadata.endDate
                      : u.importKind === 'event'
                        ? u.event.date
                        : ''

                  const summaryMetaLine =
                    u.importKind === 'event'
                      ? embeddedScheduleParentCard
                        ? `${formatNorwegianDateRangeLabel(u.event.date, embeddedEndDate || u.event.date)} · Hele dagen · Program: ${embeddedScheduleLen} punkter${
                            people.find((p) => p.id === u.event.personId)?.name
                              ? ` · ${people.find((p) => p.id === u.event.personId)?.name}`
                              : ''
                          }`
                        : `${formatNorwegianDateLabel(u.event.date)} · ${eventTimeSummary}${
                            people.find((p) => p.id === u.event.personId)?.name
                              ? ` · ${people.find((p) => p.id === u.event.personId)?.name}`
                              : ''
                          }`
                      : `${formatNorwegianDateLabel(u.task.date)}${
                          u.task.dueTime.trim() ? ` · Frist ${u.task.dueTime.trim()}` : ''
                        }${
                          u.task.childPersonId && people.find((p) => p.id === u.task.childPersonId)?.name
                            ? ` · ${people.find((p) => p.id === u.task.childPersonId)?.name}`
                            : ''
                        }`

                  return (
                    <li
                      key={pid}
                      className={`overflow-hidden rounded-xl border-2 transition-colors sm:rounded-2xl ${
                        checked
                          ? 'border-brandTeal/50 bg-white shadow-planner-sm ring-1 ring-brandTeal/10'
                          : 'border-zinc-200 bg-zinc-50/90 opacity-[0.88]'
                      }`}
                    >
                      <div className="flex items-start gap-1.5 border-b border-zinc-100/80 px-2 py-1.5 sm:gap-3 sm:px-4 sm:py-2.5">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-brandTeal focus:ring-brandTeal/30 sm:mt-1 sm:h-[18px] sm:w-[18px]"
                          checked={checked}
                          onChange={() => toggleProposal(pid)}
                          aria-label={`Velg forslag: ${cardTitle}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-1.5">
                            <p className="min-w-0 flex-1 text-[13px] font-semibold leading-tight text-zinc-900 sm:text-[15px] sm:leading-snug">
                              <span className="line-clamp-2">{cardTitle}</span>
                            </p>
                            <div className="flex shrink-0 items-center gap-1">
                              <span
                                className={`inline-flex rounded border px-1 py-px text-[9px] font-semibold tabular-nums sm:rounded-full sm:px-1.5 sm:py-0.5 sm:text-[10px] ${compactConf.className}`}
                                title={badge.label}
                              >
                                {compactConf.label}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleReviewCardEditor(pid)}
                                className="rounded px-1 py-0.5 text-[9px] font-semibold text-brandNavy hover:bg-brandSky/30 sm:text-[11px]"
                                aria-expanded={editorOpen}
                              >
                                {editorOpen ? 'Skjul' : 'Rediger'}
                              </button>
                            </div>
                          </div>
                          <p className="mt-0.5 text-[10px] leading-snug text-zinc-600 sm:mt-1 sm:text-[11px]">
                            {summaryMetaLine}
                          </p>
                          {item.kind === 'event' &&
                          Array.isArray(item.event.metadata?.embeddedSchedule) &&
                          item.event.metadata.embeddedSchedule.length > 0 &&
                          !embeddedScheduleParentCard ? (
                            <p className="mt-0.5 text-[10px] font-medium text-brandNavy sm:text-[11px]">
                              Program: {item.event.metadata.embeddedSchedule.length} punkter (vises i hendelsesdetaljer)
                            </p>
                          ) : null}
                          {!editorOpen && notesPrev ? (
                            <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-zinc-500 sm:text-[11px]">
                              {notesPrev}
                            </p>
                          ) : null}
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            {(editorOpen || !isGenericCollapsedSourceTypeLabel(item.originalSourceType)) && (
                              <span className="text-[8px] font-medium uppercase tracking-wide text-zinc-400 sm:text-[9px]">
                                {item.originalSourceType}
                              </span>
                            )}
                            {schoolWeekOverlayProposal && item.kind === 'task' ? (
                              <span className="text-[8px] font-medium text-zinc-500 normal-case sm:text-[9px]">
                                · Plan
                              </span>
                            ) : null}
                            {schoolCtx ? (
                              <span
                                className={`max-w-[10rem] truncate rounded border px-1 py-px text-[8px] font-semibold uppercase tracking-wide sm:max-w-none sm:rounded-full sm:px-1.5 sm:text-[9px] ${schoolItemTypeChipClass(schoolCtx.itemType)}`}
                                title="Kobles til skoleblokk ved import"
                              >
                                {schoolCtxSubjectLabel ? (
                                  <span className="normal-case tracking-normal">{schoolCtxSubjectLabel}</span>
                                ) : null}
                                <span aria-hidden className="opacity-50">
                                  {' '}
                                  ·{' '}
                                </span>
                                <span>{schoolItemTypeLabel(schoolCtx.itemType)}</span>
                              </span>
                            ) : null}
                          </div>
                          {!checked ? (
                            <p className="mt-0.5 text-[9px] text-zinc-500 sm:text-[10px]">Ikke valgt</p>
                          ) : null}
                          {taskLangMismatch ? (
                            <p className="mt-0.5 text-[9px] leading-snug text-amber-800 sm:text-[10px]">
                              Annen språktrack.
                            </p>
                          ) : null}
                          {!editorOpen && checked && hasFieldErrors ? (
                            <p className="mt-0.5 text-[10px] font-medium text-rose-600 sm:text-[11px]" role="alert">
                              Mangler felt — Rediger
                            </p>
                          ) : null}
                          <div
                            className="mt-1 inline-flex rounded-md border border-zinc-200/90 bg-zinc-50/80 p-0.5 sm:mt-1.5"
                            role="group"
                            aria-label="Importer som"
                          >
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => setProposalImportKind(pid, 'event')}
                              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold transition sm:px-2 sm:text-[11px] ${
                                u.importKind === 'event'
                                  ? 'bg-brandNavy text-white shadow-sm'
                                  : 'text-zinc-600 hover:bg-zinc-100'
                              }`}
                            >
                              Hendelse
                            </button>
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => setProposalImportKind(pid, 'task')}
                              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold transition sm:px-2 sm:text-[11px] ${
                                u.importKind === 'task'
                                  ? 'bg-brandNavy text-white shadow-sm'
                                  : 'text-zinc-600 hover:bg-zinc-100'
                              }`}
                            >
                              Gjøremål
                            </button>
                          </div>
                        </div>
                      </div>

                      {u.importKind === 'event' ? (
                        editorOpen ? (
                          <div className="space-y-2 px-2.5 py-2 sm:space-y-3 sm:px-4 sm:py-3">
                            <Input
                              id={`ts-${pid}-title`}
                              label="Tittel"
                              value={u.event.title}
                              onChange={(e) => updateEventDraft(pid, { title: e.target.value })}
                              disabled={disabled}
                              error={eventFieldErrors.title}
                              className="text-[15px] font-semibold"
                            />
                            <Input
                              id={`ts-${pid}-date`}
                              label="Dato"
                              type="date"
                              value={u.event.date}
                              onChange={(e) => updateEventDraft(pid, { date: e.target.value })}
                              disabled={disabled}
                              error={eventFieldErrors.date}
                              className="text-[13px]"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                id={`ts-${pid}-start`}
                                label="Start"
                                type="time"
                                step={60}
                                value={u.event.start.length > 5 ? u.event.start.slice(0, 5) : u.event.start}
                                onChange={(e) => updateEventDraft(pid, { start: e.target.value })}
                                disabled={disabled}
                                error={eventFieldErrors.start}
                                className="text-[13px]"
                              />
                              <Input
                                id={`ts-${pid}-end`}
                                label="Slutt"
                                type="time"
                                step={60}
                                value={u.event.end.length > 5 ? u.event.end.slice(0, 5) : u.event.end}
                                onChange={(e) => updateEventDraft(pid, { end: e.target.value })}
                                disabled={disabled}
                                error={eventFieldErrors.end}
                                className="text-[13px]"
                              />
                            </div>
                            <div>
                              <label
                                htmlFor={`ts-${pid}-person`}
                                className="mb-1 block text-caption font-medium text-zinc-600"
                              >
                                Person
                              </label>
                              <select
                                id={`ts-${pid}-person`}
                                className={`w-full rounded-2xl border bg-zinc-50 px-3.5 py-2.5 text-body text-zinc-900 outline-none transition focus:bg-white focus:ring-1 disabled:opacity-50 ${
                                  eventFieldErrors.personId
                                    ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-400/20'
                                    : 'border-zinc-200 focus:border-brandTeal focus:ring-brandTeal/20'
                                }`}
                                value={u.event.personId}
                                onChange={(e) => updateEventDraft(pid, { personId: e.target.value })}
                                disabled={disabled}
                                aria-invalid={eventFieldErrors.personId ? true : undefined}
                              >
                                <option value="">— Velg —</option>
                                {people.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                              {eventFieldErrors.personId && (
                                <p className="mt-1 text-[12px] text-rose-600" role="alert">
                                  {eventFieldErrors.personId}
                                </p>
                              )}
                            </div>

                            <div className="rounded-lg border border-rose-100 bg-rose-50/50 px-2.5 py-2 sm:rounded-xl sm:px-3 sm:py-3">
                              <p className="inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-rose-700 sm:px-2 sm:text-[10px]">
                                Notater
                              </p>
                              <div className="mt-1.5 sm:mt-2">
                                <Textarea
                                  id={`ts-${pid}-notes`}
                                  label="Notater"
                                  rows={2}
                                  autoResize
                                  minRows={2}
                                  maxRows={8}
                                  value={u.event.notes}
                                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                                    updateEventDraft(pid, { notes: e.target.value })
                                  }
                                  disabled={disabled}
                                  className="text-[13px] text-zinc-700"
                                  placeholder="Detaljer som skal med inn i kalenderen"
                                />
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleDetailsExpanded(pid)}
                              className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-left text-[11px] font-medium text-zinc-700 transition hover:bg-zinc-100 sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-[12px]"
                              aria-expanded={detailsExpanded}
                              aria-controls={`ts-extra-details-${pid}`}
                            >
                              <span>{detailsExpanded ? 'Skjul ekstradetaljer' : 'Vis ekstradetaljer'}</span>
                              <svg
                                className={`h-4 w-4 text-zinc-500 transition-transform ${detailsExpanded ? 'rotate-180' : ''}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={2.5}
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                              </svg>
                            </button>

                            {detailsExpanded ? (
                              <div
                                id={`ts-extra-details-${pid}`}
                                className="space-y-3 rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-3"
                              >
                                <Input
                                  id={`ts-${pid}-location`}
                                  label="Sted"
                                  value={u.event.location}
                                  onChange={(e) => updateEventDraft(pid, { location: e.target.value })}
                                  disabled={disabled}
                                  className="text-[13px] text-zinc-800"
                                  placeholder="F.eks. skole, adresse"
                                />
                                <div className="space-y-1">
                                  <label
                                    htmlFor={`ts-${pid}-reminder`}
                                    className="block text-caption font-medium text-zinc-600"
                                  >
                                    Påminnelse
                                  </label>
                                  <select
                                    id={`ts-${pid}-reminder`}
                                    className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-body text-zinc-900 outline-none transition focus:bg-white focus:border-brandTeal focus:ring-1 focus:ring-brandTeal/20 disabled:opacity-50"
                                    value={u.event.reminderMinutes == null ? '' : String(u.event.reminderMinutes)}
                                    onChange={(e) =>
                                      updateEventDraft(pid, {
                                        reminderMinutes: e.target.value === '' ? undefined : Number(e.target.value),
                                      })
                                    }
                                    disabled={disabled}
                                  >
                                    <option value="">Ingen</option>
                                    <option value="5">5 min før</option>
                                    <option value="15">15 min før</option>
                                    <option value="30">30 min før</option>
                                    <option value="60">1 time før</option>
                                    <option value="120">2 timer før</option>
                                    <option value="1440">24 timer før</option>
                                  </select>
                                  <p className="text-[11px] text-zinc-500">
                                    Valgt:{' '}
                                    <span className="font-medium text-zinc-700">
                                      {reminderLabel(u.event.reminderMinutes)}
                                    </span>
                                  </p>
                                </div>

                                <div className="space-y-1 rounded-lg border border-zinc-200/90 bg-white/70 px-2.5 py-2">
                                  <p className="text-caption font-medium text-zinc-600">Gjentakelse</p>
                                  {item.kind === 'event' && item.event.recurrenceGroupId ? (
                                    <label className="flex items-center gap-2 text-[12px] text-zinc-700">
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-zinc-300 text-brandTeal focus:ring-brandTeal/30"
                                        checked={u.event.includeRecurrence}
                                        onChange={(e) =>
                                          updateEventDraft(pid, { includeRecurrence: e.target.checked })
                                        }
                                        disabled={disabled}
                                      />
                                      Behold gjentakelse fra forslag
                                    </label>
                                  ) : (
                                    <p className="text-[12px] text-zinc-500">Ingen gjentakelse i dette forslaget.</p>
                                  )}
                                </div>

                                <div className="space-y-2 rounded-lg border border-zinc-200/90 bg-white/70 px-2.5 py-2">
                                  <p className="text-caption font-medium text-zinc-600">Levering og henting</p>
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <div>
                                      <label
                                        htmlFor={`ts-${pid}-dropoff`}
                                        className="mb-1 block text-[11px] font-medium text-zinc-500"
                                      >
                                        Levert av
                                      </label>
                                      <select
                                        id={`ts-${pid}-dropoff`}
                                        className="w-full rounded-xl border border-zinc-200 bg-white px-2.5 py-2 text-[13px] text-zinc-900 outline-none transition focus:border-brandTeal focus:ring-1 focus:ring-brandTeal/20 disabled:opacity-50"
                                        value={u.event.dropoffBy}
                                        onChange={(e) => updateEventDraft(pid, { dropoffBy: e.target.value })}
                                        disabled={disabled}
                                      >
                                        <option value="">Ingen</option>
                                        {people.map((p) => (
                                          <option key={p.id} value={p.id}>
                                            {p.name}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label
                                        htmlFor={`ts-${pid}-pickup`}
                                        className="mb-1 block text-[11px] font-medium text-zinc-500"
                                      >
                                        Hentes av
                                      </label>
                                      <select
                                        id={`ts-${pid}-pickup`}
                                        className="w-full rounded-xl border border-zinc-200 bg-white px-2.5 py-2 text-[13px] text-zinc-900 outline-none transition focus:border-brandTeal focus:ring-1 focus:ring-brandTeal/20 disabled:opacity-50"
                                        value={u.event.pickupBy}
                                        onChange={(e) => updateEventDraft(pid, { pickupBy: e.target.value })}
                                        disabled={disabled}
                                      >
                                        <option value="">Ingen</option>
                                        {people.map((p) => (
                                          <option key={p.id} value={p.id}>
                                            {p.name}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                </div>

                                {sourceCtx && (
                                  <div className="rounded-lg border border-zinc-200/80 bg-zinc-50/90 px-3 py-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                                      Kildegrunnlag (fra AI)
                                    </p>
                                    <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-zinc-600">
                                      {sourceCtx}
                                    </p>
                                    {showSourceExpandToggle && fullSourceDoc ? (
                                      <>
                                        <button
                                          type="button"
                                          className="mt-2 text-left text-[12px] font-semibold text-brandNavy underline decoration-brandNavy/30 underline-offset-2 hover:decoration-brandNavy"
                                          onClick={() => toggleSourceExpanded(pid)}
                                          aria-expanded={sourceExpanded}
                                          aria-controls={`ts-source-expanded-${pid}`}
                                        >
                                          {sourceExpanded ? 'Vis mindre' : 'Vis mer av kildegrunnlag'}
                                        </button>
                                        {sourceExpanded ? (
                                          <div
                                            id={`ts-source-expanded-${pid}`}
                                            className="mt-3 border-t border-zinc-200/90 pt-3"
                                          >
                                            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                                              Utvidet kildegrunnlag
                                            </p>
                                            <div
                                              className="mt-1.5 max-h-40 overflow-y-auto overscroll-y-contain rounded-md border border-zinc-100 bg-white px-2.5 py-2 text-[12px] leading-relaxed text-zinc-700 whitespace-pre-wrap break-words sm:max-h-56"
                                              role="region"
                                              aria-label="Fullt kildegrunnlag fra AI"
                                            >
                                              {fullSourceDoc.length > 12000
                                                ? `${fullSourceDoc.slice(0, 11997)}…`
                                                : fullSourceDoc}
                                            </div>
                                          </div>
                                        ) : null}
                                      </>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                        ) : null
                      ) : editorOpen ? (
                          <div className="space-y-2 px-2.5 py-2 sm:space-y-3 sm:px-4 sm:py-3">
                            <Input
                              id={`ts-${pid}-task-title`}
                              label="Tittel"
                              value={u.task.title}
                              onChange={(e) => updateTaskDraft(pid, { title: e.target.value })}
                              disabled={disabled}
                              error={taskFieldErrors.title}
                              className="text-[15px] font-semibold"
                            />
                            <Input
                              id={`ts-${pid}-task-date`}
                              label="Dato"
                              type="date"
                              value={u.task.date}
                              onChange={(e) => updateTaskDraft(pid, { date: e.target.value })}
                              disabled={disabled}
                              error={taskFieldErrors.date}
                              className="text-[13px]"
                            />
                            <Input
                              id={`ts-${pid}-task-due`}
                              label="Frist (klokkeslett, valgfritt)"
                              type="time"
                              step={60}
                              value={
                                u.task.dueTime.length > 5 ? u.task.dueTime.slice(0, 5) : u.task.dueTime
                              }
                              onChange={(e) => updateTaskDraft(pid, { dueTime: e.target.value })}
                              disabled={disabled}
                              error={taskFieldErrors.dueTime}
                              className="text-[13px]"
                            />
                            <div>
                              <label
                                htmlFor={`ts-${pid}-task-child`}
                                className="mb-1 block text-caption font-medium text-zinc-600"
                              >
                                Gjelder barn
                              </label>
                              <select
                                id={`ts-${pid}-task-child`}
                                className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-body text-zinc-900 outline-none transition focus:bg-white focus:border-brandTeal focus:ring-1 focus:ring-brandTeal/20 disabled:opacity-50"
                                value={u.task.childPersonId}
                                onChange={(e) => updateTaskDraft(pid, { childPersonId: e.target.value })}
                                disabled={disabled}
                              >
                                <option value="">— Ingen —</option>
                                {people.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                              {schoolWeekOverlayProposal ? (
                                <p className="mt-1 text-[10px] text-zinc-500">
                                  Brukes kun ved avvik fra globalt valgt barn (
                                  <span className="font-medium">{resolvedOverlayChildName || 'ikke valgt'}</span>).
                                </p>
                              ) : null}
                            </div>
                            <div>
                              <label
                                htmlFor={`ts-${pid}-task-assign`}
                                className="mb-1 block text-caption font-medium text-zinc-600"
                              >
                                Ansvarlig
                              </label>
                              <select
                                id={`ts-${pid}-task-assign`}
                                className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-body text-zinc-900 outline-none transition focus:bg-white focus:border-brandTeal focus:ring-1 focus:ring-brandTeal/20 disabled:opacity-50"
                                value={u.task.assignedToPersonId}
                                onChange={(e) => updateTaskDraft(pid, { assignedToPersonId: e.target.value })}
                                disabled={disabled}
                              >
                                <option value="">— Ingen —</option>
                                {people.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <label className="flex items-center gap-2 text-[12px] text-zinc-700">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-zinc-300 text-brandTeal focus:ring-brandTeal/30"
                                checked={u.task.showInMonthView}
                                onChange={(e) => updateTaskDraft(pid, { showInMonthView: e.target.checked })}
                                disabled={disabled}
                              />
                              Vis markør i månedskalender
                            </label>
                            <div className="rounded-lg border border-rose-100 bg-rose-50/50 px-2.5 py-2 sm:rounded-xl sm:px-3 sm:py-3">
                              <p className="inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-rose-700 sm:px-2 sm:text-[10px]">
                                Notater
                              </p>
                              <div className="mt-1.5 sm:mt-2">
                                <Textarea
                                  id={`ts-${pid}-task-notes`}
                                  label="Notater"
                                  rows={2}
                                  autoResize
                                  minRows={2}
                                  maxRows={8}
                                  value={u.task.notes}
                                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                                    updateTaskDraft(pid, { notes: e.target.value })
                                  }
                                  disabled={disabled}
                                  className="text-[13px] text-zinc-700"
                                  placeholder="Detaljer til oppgaven"
                                />
                              </div>
                            </div>
                            {hasMeaningfulSourceBasis ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => toggleDetailsExpanded(pid)}
                                  className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-left text-[11px] font-medium text-zinc-700 transition hover:bg-zinc-100 sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-[12px]"
                                  aria-expanded={detailsExpanded}
                                  aria-controls={`ts-task-extra-${pid}`}
                                >
                                  <span>{detailsExpanded ? 'Skjul kildegrunnlag' : 'Vis kildegrunnlag'}</span>
                                  <svg
                                    className={`h-4 w-4 text-zinc-500 transition-transform ${detailsExpanded ? 'rotate-180' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={2.5}
                                    stroke="currentColor"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                                  </svg>
                                </button>
                                {detailsExpanded && sourceCtx ? (
                                  <div
                                    id={`ts-task-extra-${pid}`}
                                    className="rounded-lg border border-zinc-200/80 bg-zinc-50/90 px-3 py-2"
                                  >
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                                      Kildegrunnlag (fra AI)
                                    </p>
                                    <p className="mt-1 text-[12px] leading-relaxed text-zinc-600">{sourceCtx}</p>
                                    {showSourceExpandToggle && fullSourceDoc ? (
                                      <>
                                        <button
                                          type="button"
                                          className="mt-2 text-left text-[12px] font-semibold text-brandNavy underline decoration-brandNavy/30 underline-offset-2 hover:decoration-brandNavy"
                                          onClick={() => toggleSourceExpanded(pid)}
                                          aria-expanded={sourceExpanded}
                                        >
                                          {sourceExpanded ? 'Vis mindre' : 'Vis mer'}
                                        </button>
                                        {sourceExpanded && fullSourceDoc ? (
                                          <div className="mt-2 max-h-32 overflow-y-auto text-[12px] whitespace-pre-wrap text-zinc-700 sm:max-h-40">
                                            {fullSourceDoc.length > 8000
                                              ? `${fullSourceDoc.slice(0, 7997)}…`
                                              : fullSourceDoc}
                                          </div>
                                        ) : null}
                                      </>
                                    ) : null}
                                  </div>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                        ) : null
                    }
                    </li>
                  )
                })}
              </ul>

              {selectedIds.size > 0 && !canApproveSelection && (
                <p className="text-[12px] leading-snug text-amber-900">
                  <span className="font-semibold">Mangler eller ugyldig data</span> på et eller flere valgte kort. Se
                  røde feltmerknader over.
                </p>
              )}
              {error && (
                <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[13px] text-rose-800">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-zinc-100 px-4 py-3">
          <Button type="button" variant="secondary" fullWidth={false} className="flex-1" onClick={handleClose}>
            Avbryt
          </Button>
          {step === 'pick' ? (
            <Button
              type="button"
              variant="primary"
              className="flex-1"
              loading={analyzeLoading}
              disabled={
                !hasPeople || (inputMode === 'file' ? pendingFiles.length === 0 : !textInput.trim())
              }
              onClick={() => {
                logEvent('tankestrom_analyze_started', {
                  mode: inputMode,
                  fileCount: inputMode === 'file' ? pendingFiles.length : 0,
                })
                void runAnalyze()
              }}
            >
              Analyser
            </Button>
          ) : schoolReview ? (
            <Button
              type="button"
              variant="primary"
              className="flex-1"
              loading={saveLoading}
              disabled={!hasPeople || !canSaveSchoolProfile}
              title={
                schoolLessonConflicts.length > 0
                  ? 'Velg ett fag for hvert spor som kolliderer før du lagrer'
                  : undefined
              }
              onClick={() => void handleSaveSchoolProfile()}
            >
              Lagre skoleprofil
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              className="flex-1"
              loading={saveLoading}
              disabled={
                !hasPeople ||
                (schoolWeekOverlayProposal
                  ? !canSaveSchoolWeekOverlay || (selectedIds.size > 0 && !canApproveSelection)
                  : !canApproveSelection)
              }
              onClick={() =>
                schoolWeekOverlayProposal ? void handleSaveOverlayAndCalendar() : void handleApprove()
              }
            >
              {schoolWeekOverlayProposal
                ? selectedIds.size > 0
                  ? `Lagre overlay og importer (${selectedIds.size})`
                  : 'Lagre uke-overlay'
                : `Importer valgte (${selectedIds.size})`}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
