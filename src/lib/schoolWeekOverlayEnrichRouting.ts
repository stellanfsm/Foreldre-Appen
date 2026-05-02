import type { NorwegianGradeBand, SchoolLessonSlot, SchoolWeekOverlaySubjectUpdate } from '../types'
import {
  inferSubjectKeyFromText,
  isKnownSubjectKeyForBand,
  lessonUsesStructuredSubcategory,
  matchSubjectFromText,
  subjectDisplayPartsForKey,
  subjectLabelForKey,
  SUBJECTS_BY_BAND,
} from '../data/norwegianSubjects'

function normOverlayText(s: string): string {
  return s
    .trim()
    .toLocaleLowerCase('nb-NO')
    .replace(/\s+/g, ' ')
}

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

function foreignLanguageTokensInLine(line: string): Set<string> {
  const out = new Set<string>()
  for (const { canon, pattern } of REVIEW_FOREIGN_LANG_LEXEMES) {
    if (pattern.test(line)) out.add(canon)
  }
  return out
}

const OVERLAY_MATCH_GENERIC_HINTS = new Set(
  [
    'språk',
    'fremmedspråk',
    'valgfag',
    'fellesfag',
    'felles',
    'programfag',
    'eksamen',
    'annet fag',
    'skole',
    'timer',
  ].map((s) => normOverlayText(s))
)

const OVERLAY_SUBJECT_WORD_SKIP = new Set(
  ['språk', 'fremmedspråk', 'valgfag', 'fellesfag', 'felles', 'programfag'].map((s) => normOverlayText(s))
)

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function lineReferencesLessonToken(haystack: string, token: string): boolean {
  const raw = token.trim()
  if (raw.length < 2) return false
  const n = normOverlayText(raw)
  if (!n) return false
  if (n.includes(' ')) {
    return normOverlayText(haystack).includes(n)
  }
  try {
    return new RegExp(`\\b${escapeRegExp(n)}\\b`, 'i').test(haystack)
  } catch {
    return false
  }
}

function blockIdxUniqueSubjectWordHit(
  line: string,
  band: NorwegianGradeBand,
  baseLessons: SchoolLessonSlot[]
): number {
  const hits: number[] = []
  for (let i = 0; i < baseLessons.length; i++) {
    const L = baseLessons[i]!
    const parts = subjectDisplayPartsForKey(band, L.subjectKey, L.customLabel, L.lessonSubcategory)
    const tokenList: string[] = []
    if (parts.secondary?.trim()) tokenList.push(parts.secondary.trim())
    if (L.lessonSubcategory?.trim()) tokenList.push(L.lessonSubcategory.trim())
    if (L.customLabel?.trim()) tokenList.push(L.customLabel.trim())
    if (!lessonUsesStructuredSubcategory(L.subjectKey)) {
      if (parts.primary?.trim()) tokenList.push(parts.primary.trim())
      if (L.subjectKey === 'krle') {
        tokenList.push('KRLE', 'RLE')
      }
    }
    if (L.subjectKey !== 'fremmedspråk' && L.subjectKey !== 'valgfag') {
      tokenList.push(L.subjectKey.replace(/_/g, ' '))
    }

    const seen = new Set<string>()
    let matched = false
    for (const rawTok of tokenList) {
      const nt = normOverlayText(rawTok)
      if (nt.length < 2) continue
      if (OVERLAY_MATCH_GENERIC_HINTS.has(nt) || OVERLAY_SUBJECT_WORD_SKIP.has(nt)) continue
      if (seen.has(nt)) continue
      seen.add(nt)
      if (lineReferencesLessonToken(line, rawTok)) matched = true
    }
    if (matched) hits.push(i)
  }
  const uniq = [...new Set(hits)]
  if (uniq.length === 1) return uniq[0]!
  return -1
}

function lessonSubjectTokensForPrefixStrip(band: NorwegianGradeBand, lesson: SchoolLessonSlot): string[] {
  const parts = subjectDisplayPartsForKey(band, lesson.subjectKey, lesson.customLabel, lesson.lessonSubcategory)
  const out = new Set<string>()
  const add = (raw?: string) => {
    const t = raw?.trim()
    if (!t) return
    const n = normOverlayText(t)
    if (n.length >= 2) out.add(t)
  }
  add(parts.primary)
  add(parts.secondary)
  add(lesson.customLabel)
  add(lesson.lessonSubcategory)
  if (lesson.subjectKey === 'krle') {
    add('KRLE')
    add('RLE')
  }
  return [...out]
}

export function stripSubjectPrefixForBlockLine(
  line: string,
  band: NorwegianGradeBand,
  lesson: SchoolLessonSlot
): { text: string; stripped: boolean } {
  const t = line.trim()
  if (!t) return { text: t, stripped: false }
  for (const token of lessonSubjectTokensForPrefixStrip(band, lesson)) {
    const esc = escapeRegExp(token.trim())
    const stripped = t.replace(new RegExp(`^\\s*${esc}\\s*[:.–—-]\\s*`, 'i'), '').trim()
    if (stripped && stripped !== t) return { text: stripped, stripped: true }
  }
  return { text: t, stripped: false }
}

export type EnrichLineRoute = 'prefix_or_label' | 'unique_word' | 'weak_update' | 'fallback'

function normHintsForLesson(band: NorwegianGradeBand, L: SchoolLessonSlot): string[] {
  const parts = subjectDisplayPartsForKey(band, L.subjectKey, L.customLabel, L.lessonSubcategory)
  const s = new Set<string>()
  const add = (x?: string) => {
    const t = x?.trim()
    if (!t) return
    const n = normOverlayText(t)
    if (n.length >= 2) s.add(n)
  }
  add(L.subjectKey.replace(/_/g, ' '))
  add(L.customLabel)
  add(L.lessonSubcategory)
  add(parts.primary)
  add(parts.secondary)
  add(subjectLabelForKey(band, L.subjectKey, L.customLabel, L.lessonSubcategory))
  return [...s]
}

function normHintsForOverlayUpdate(band: NorwegianGradeBand, u: SchoolWeekOverlaySubjectUpdate): string[] {
  const s = new Set<string>()
  const add = (x?: string) => {
    const t = x?.trim()
    if (!t) return
    const n = normOverlayText(t)
    if (n.length >= 2) s.add(n)
  }
  add(u.subjectKey.replace(/_/g, ' '))
  add(u.customLabel)
  const inferred = u.customLabel?.trim() ? matchSubjectFromText(band, u.customLabel) : null
  if (inferred) {
    const cat = SUBJECTS_BY_BAND[band].find((x) => x.key === inferred.subjectKey)
    add(cat?.label)
    add(inferred.subjectKey)
  }
  if (isKnownSubjectKeyForBand(band, u.subjectKey)) {
    const cat = SUBJECTS_BY_BAND[band].find((x) => x.key === u.subjectKey)
    add(cat?.label)
  }
  return [...s]
}

function hintSetsOverlapSpecific(baseHints: string[], updateHints: string[]): boolean {
  const stripGeneric = (arr: string[]) =>
    arr.filter((h) => h.length >= 3 && !OVERLAY_MATCH_GENERIC_HINTS.has(h))
  const bh = stripGeneric(baseHints)
  const uh = stripGeneric(updateHints)
  for (const b of bh) {
    for (const u of uh) {
      if (b === u) return true
      if (b.length >= 4 && u.length >= 4 && (b.includes(u) || u.includes(b))) return true
    }
  }
  return false
}

function sectionLinesSampleForSubjectMatch(u: SchoolWeekOverlaySubjectUpdate): string[] {
  const out: string[] = []
  for (const lines of Object.values(u.sections ?? {})) {
    for (const line of lines ?? []) {
      const t = line.trim()
      if (t.length >= 4) out.push(t)
    }
  }
  return out
}

function overlayUpdateMatchesBaseLesson(
  band: NorwegianGradeBand,
  L: SchoolLessonSlot,
  u: SchoolWeekOverlaySubjectUpdate
): boolean {
  if (L.subjectKey === u.subjectKey) {
    if (!u.customLabel?.trim()) return true
    const c = u.customLabel.trim().toLocaleLowerCase('nb-NO')
    return !!(
      L.lessonSubcategory?.trim().toLocaleLowerCase('nb-NO').includes(c) ||
      L.customLabel?.trim().toLocaleLowerCase('nb-NO').includes(c) ||
      subjectLabelForKey(band, L.subjectKey, L.customLabel, L.lessonSubcategory)
        .toLocaleLowerCase('nb-NO')
        .includes(c)
    )
  }

  const inferredFromCustom = u.customLabel?.trim() ? matchSubjectFromText(band, u.customLabel) : null
  if (inferredFromCustom && inferredFromCustom.subjectKey === L.subjectKey) return true

  const inferredKey =
    inferSubjectKeyFromText(band, u.customLabel) ?? inferSubjectKeyFromText(band, u.subjectKey)
  if (inferredKey && inferredKey === L.subjectKey) return true

  if (L.subjectKey === 'fremmedspråk' || u.subjectKey === 'fremmedspråk') {
    const bh = normHintsForLesson(band, L)
    const uh = normHintsForOverlayUpdate(band, u)
    if (hintSetsOverlapSpecific(bh, uh)) return true
  }

  for (const line of sectionLinesSampleForSubjectMatch(u)) {
    const head = line.split(/[:–—]/)[0]?.trim() ?? ''
    if (head.length >= 3 && head.length < 48) {
      const hm = matchSubjectFromText(band, head)
      if (hm?.subjectKey === L.subjectKey) return true
    }
    const lm = matchSubjectFromText(band, line)
    if (lm?.subjectKey === L.subjectKey && line.length < 72) return true
  }

  return hintSetsOverlapSpecific(normHintsForLesson(band, L), normHintsForOverlayUpdate(band, u))
}

function blockIdxForForeignLanguageWord(
  word: string,
  band: NorwegianGradeBand,
  baseLessons: SchoolLessonSlot[]
): number {
  const wnorm = normOverlayText(word)
  if (wnorm.length < 3) return -1
  const hits: number[] = []
  for (let i = 0; i < baseLessons.length; i++) {
    const L = baseLessons[i]!
    if (L.subjectKey === 'fremmedspråk') {
      const sub = normOverlayText(L.lessonSubcategory ?? L.customLabel ?? '')
      if (sub.length >= 3 && (sub === wnorm || sub.includes(wnorm) || wnorm.includes(sub))) hits.push(i)
    } else if (normOverlayText(L.subjectKey.replace(/_/g, ' ')) === wnorm) {
      hits.push(i)
    } else {
      const parts = subjectDisplayPartsForKey(band, L.subjectKey, L.customLabel, L.lessonSubcategory)
      if (parts.secondary && normOverlayText(parts.secondary) === wnorm) hits.push(i)
    }
  }
  const uniq = [...new Set(hits)]
  if (uniq.length === 1) return uniq[0]!
  return -1
}

function tryResolveOverlayLineToBlockIdx(
  line: string,
  band: NorwegianGradeBand,
  baseLessons: SchoolLessonSlot[]
): number {
  const t = line.trim()
  if (!t) return -1
  const head = t.split(/[:–—]/)[0]?.trim() ?? ''
  if (head.length >= 3 && head.length < 48) {
    const headMatch = matchSubjectFromText(band, head)
    if (headMatch) {
      const idx = baseLessons.findIndex((L) => L.subjectKey === headMatch.subjectKey)
      if (idx >= 0) return idx
    }
    const firstW = head.split(/\s+/)[0] ?? ''
    if (firstW.length >= 3 && firstW.length < 24 && firstW !== head) {
      const wm = matchSubjectFromText(band, firstW)
      if (wm) {
        const j = baseLessons.findIndex((L) => L.subjectKey === wm.subjectKey)
        if (j >= 0) return j
      }
      const jFl = blockIdxForForeignLanguageWord(firstW, band, baseLessons)
      if (jFl >= 0) return jFl
    }
    if (!head.includes(' ') && head.length >= 3 && head.length < 24) {
      const jFl = blockIdxForForeignLanguageWord(head, band, baseLessons)
      if (jFl >= 0) return jFl
    }
  }
  const lineMatch = matchSubjectFromText(band, t)
  if (lineMatch && t.length < 56) {
    const idx = baseLessons.findIndex((L) => L.subjectKey === lineMatch.subjectKey)
    if (idx >= 0) return idx
  }
  const nLine = normOverlayText(t)
  for (let i = 0; i < baseLessons.length; i++) {
    const L = baseLessons[i]!
    const label = subjectLabelForKey(band, L.subjectKey, L.customLabel, L.lessonSubcategory)
    const nLabel = normOverlayText(label)
    const parts = subjectDisplayPartsForKey(band, L.subjectKey, L.customLabel, L.lessonSubcategory)
    const primary = normOverlayText(parts.primary)
    if (nLabel.length >= 4 && (nLine.startsWith(`${nLabel} `) || nLine.startsWith(`${nLabel}:`))) {
      return i
    }
    if (primary.length >= 4 && (nLine.startsWith(`${primary} `) || nLine.startsWith(`${primary}:`))) {
      return i
    }
    const sec = parts.secondary
    if (sec) {
      const ns = normOverlayText(sec)
      if (ns.length >= 4 && (nLine.startsWith(`${ns} `) || nLine.startsWith(`${ns}:`))) {
        return i
      }
    }
  }
  return -1
}

export function resolveEnrichPreviewLineToBlockIdx(
  line: string,
  band: NorwegianGradeBand,
  baseLessons: SchoolLessonSlot[],
  u: SchoolWeekOverlaySubjectUpdate
): { idx: number; route: EnrichLineRoute } {
  const idxPrefix = tryResolveOverlayLineToBlockIdx(line, band, baseLessons)
  if (idxPrefix >= 0) return { idx: idxPrefix, route: 'prefix_or_label' }

  const idxWord = blockIdxUniqueSubjectWordHit(line, band, baseLessons)
  if (idxWord >= 0) return { idx: idxWord, route: 'unique_word' }

  const weakHits = baseLessons
    .map((L, i) => (overlayUpdateMatchesBaseLesson(band, L, u) ? i : -1))
    .filter((i) => i >= 0)
  if (weakHits.length === 1 && foreignLanguageTokensInLine(line).size === 0) {
    return { idx: weakHits[0]!, route: 'weak_update' }
  }

  return { idx: -1, route: 'fallback' }
}

function subjectUpdateMetaForLesson(L: SchoolLessonSlot): Pick<SchoolWeekOverlaySubjectUpdate, 'subjectKey' | 'customLabel'> {
  let customLabel = L.customLabel?.trim() || undefined
  if (!customLabel && L.lessonSubcategory?.trim()) {
    customLabel = L.lessonSubcategory.trim()
  }
  return { subjectKey: L.subjectKey, ...(customLabel ? { customLabel } : {}) }
}

/** Samme mønster som import-preview — generell admintekst skal ikke forankres til fag. */
const CLIENT_OVERLAY_ADMIN_LINE_RES: RegExp[] = [
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

export function isClientOverlayAdminLine(line: string): boolean {
  return CLIENT_OVERLAY_ADMIN_LINE_RES.some((re) => re.test(line))
}

/**
 * Timer som kan motta tysk-overlay. Ved nøyaktig én «naken» fremmedspråk-time (uten språk-label)
 * kan den brukes kun når linjen har sterkt tysk-signal (score ≥ 10), se `tryClientOrphanLineToLessonIndex`.
 */
function lessonIndicesForTyskIntent(
  lessons: SchoolLessonSlot[],
  opts: { allowSingleUnlabeledFremmedspråk: boolean }
): number[] {
  const explicit: number[] = []
  const unlabeledFrem: number[] = []
  for (let i = 0; i < lessons.length; i++) {
    const L = lessons[i]!
    if (L.subjectKey === 'tysk') explicit.push(i)
    if (L.subjectKey === 'fremmedspråk') {
      const bag = `${L.customLabel ?? ''} ${L.lessonSubcategory ?? ''}`
      if (/\btysk\b|tyskland|german|deutsch/i.test(bag)) explicit.push(i)
      else unlabeledFrem.push(i)
    }
  }
  const uniq = [...new Set(explicit)]
  if (uniq.length === 1) return uniq
  if (uniq.length > 1) return uniq
  if (opts.allowSingleUnlabeledFremmedspråk && unlabeledFrem.length === 1) return [unlabeledFrem[0]!]
  return []
}

function lessonIndicesForSamfIntent(lessons: SchoolLessonSlot[]): number[] {
  const out: number[] = []
  for (let i = 0; i < lessons.length; i++) {
    const L = lessons[i]!
    if (L.subjectKey === 'samfunnsfag' || L.subjectKey === 'samfunnskunnskap') out.push(i)
  }
  return [...new Set(out)]
}

function clientOrphanSignalScores(n: string): { tysk: number; samf: number } {
  let tysk = 0
  let samf = 0
  const strongTyskPhrase =
    /\b(tyskprøve|tyskprøven|tysk\s*prøve|skriftlig\s+tysk|til\s+tyskprøven?)\b/.test(n) ||
    (/\b(ha\s+med|ta\s+med|husk(?:\s+å)?)\b/.test(n) && /\b(tyskprøve|tyskprøven)\b/.test(n))
  if (strongTyskPhrase) tysk = 10
  else if (/\btysk\b/.test(n) && /\b(prøve|skriftlig|muntlig|blyant|viskelær)\b/.test(n)) tysk = 6
  if (/mars-?bad|badetøy|håndkle/.test(n)) samf = 10
  else if (/\bspråktimen\b|møt\s+presis\b/.test(n)) samf = 5
  return { tysk, samf }
}

/**
 * Konservativ klient-tolkning av «Ikke plassert»-linjer når backend nesten treffer.
 * Returnerer null hvis signalet er svakt eller tvetydig (f.eks. flere mulige timer).
 */
export function tryClientOrphanLineToLessonIndex(
  line: string,
  _band: NorwegianGradeBand,
  lessons: SchoolLessonSlot[]
): { idx: number; reason: string } | null {
  const t = line.trim()
  if (!t || lessons.length === 0) return null
  if (isClientOverlayAdminLine(t)) return null
  const n = normOverlayText(t)
  const { tysk, samf } = clientOrphanSignalScores(n)
  if (tysk < 6 && samf < 5) return null
  if (tysk >= 6 && samf >= 5 && tysk === samf) return null

  const preferTysk = tysk >= 6 && (tysk > samf || samf < 5)
  const preferSamf = samf >= 5 && (samf > tysk || tysk < 6)
  if (preferTysk && preferSamf) return null

  if (preferTysk) {
    const idxs = lessonIndicesForTyskIntent(lessons, {
      allowSingleUnlabeledFremmedspråk: tysk >= 10,
    })
    if (idxs.length !== 1) return null
    return { idx: idxs[0]!, reason: `client_signal_tysk_${tysk >= 10 ? 'strong' : 'medium'}` }
  }
  if (preferSamf) {
    const idxs = lessonIndicesForSamfIntent(lessons)
    if (idxs.length !== 1) return null
    return { idx: idxs[0]!, reason: `client_signal_samf_${samf >= 10 ? 'strong' : 'medium'}` }
  }
  return null
}

/**
 * Flytter linjer fra `subjectKey: other` til riktig fag når tekstsignalet er tydelig.
 * Brukes etter `redistributeEnrichSubjectUpdatesForDay` og i detaljvisning.
 */
export function applyClientOrphanFallbackToSubjectUpdates(
  band: NorwegianGradeBand,
  lessons: SchoolLessonSlot[],
  updatesIn: SchoolWeekOverlaySubjectUpdate[]
): SchoolWeekOverlaySubjectUpdate[] {
  if (lessons.length === 0) return updatesIn
  const otherIdx = updatesIn.findIndex((u) => u.subjectKey === 'other')
  if (otherIdx < 0) return updatesIn

  const other = updatesIn[otherIdx]!
  const orphanLinesBefore: Array<{ sectionKey: string; line: string }> = []
  for (const [sectionKey, lines] of Object.entries(other.sections ?? {})) {
    for (const raw of lines ?? []) {
      const t = raw.trim()
      if (t) orphanLinesBefore.push({ sectionKey, line: t })
    }
  }
  if (orphanLinesBefore.length === 0) return updatesIn

  const dbg = import.meta.env.DEV || import.meta.env.VITE_DEBUG_SCHOOL_IMPORT === 'true'
  const assignmentLog: Array<{
    line: string
    outcome: 'assigned' | 'keep_other' | 'drop_admin'
    idx?: number
    reason?: string
  }> = []

  const remainingOther: Record<string, string[]> = {}
  const pushRemaining = (sk: string, line: string) => {
    if (!remainingOther[sk]) remainingOther[sk] = []
    remainingOther[sk].push(line)
  }

  const additionsByLessonIdx = new Map<number, Record<string, string[]>>()
  const addToLesson = (idx: number, sectionKey: string, line: string) => {
    let rec = additionsByLessonIdx.get(idx)
    if (!rec) {
      rec = {}
      additionsByLessonIdx.set(idx, rec)
    }
    if (!rec[sectionKey]) rec[sectionKey] = []
    rec[sectionKey]!.push(line)
  }

  for (const { sectionKey, line } of orphanLinesBefore) {
    if (isClientOverlayAdminLine(line)) {
      assignmentLog.push({ line, outcome: 'drop_admin' })
      continue
    }
    const hit = tryClientOrphanLineToLessonIndex(line, band, lessons)
    if (hit) {
      addToLesson(hit.idx, sectionKey, line)
      assignmentLog.push({ line, outcome: 'assigned', idx: hit.idx, reason: hit.reason })
    } else {
      pushRemaining(sectionKey, line)
      assignmentLog.push({ line, outcome: 'keep_other' })
    }
  }

  let next = updatesIn.filter((_, i) => i !== otherIdx)
  for (const [idx, sectionsToAdd] of additionsByLessonIdx) {
    const L = lessons[idx]!
    const meta = subjectUpdateMetaForLesson(L)
    const existingIdx = next.findIndex((u) => {
      if (u.subjectKey !== meta.subjectKey) return false
      const uCust = (u.customLabel ?? '').trim()
      const mCust = (meta.customLabel ?? '').trim()
      return uCust === mCust
    })
    if (existingIdx >= 0) {
      const u = next[existingIdx]!
      const merged: Record<string, string[]> = { ...(u.sections ?? {}) }
      for (const [sk, lines] of Object.entries(sectionsToAdd)) {
        merged[sk] = [...(merged[sk] ?? []), ...lines]
      }
      next[existingIdx] = { ...u, sections: merged }
    } else {
      next.push({ ...meta, sections: sectionsToAdd })
    }
  }

  if (Object.keys(remainingOther).length > 0) {
    next.push({ subjectKey: 'other', sections: remainingOther })
  }

  if (dbg) {
    const assigned = assignmentLog.filter((a) => a.outcome === 'assigned').length
    const dropped = assignmentLog.filter((a) => a.outcome === 'drop_admin').length
    const kept = assignmentLog.filter((a) => a.outcome === 'keep_other').length
    const fallbackOtherUsed = next.some((u) => u.subjectKey === 'other')
    const taMedLikeBefore = orphanLinesBefore.filter(
      ({ line, sectionKey }) =>
        /\b(ha med|ta med|husk(?:\s+å)?)\b/i.test(line) ||
        normOverlayText(sectionKey).includes('ta med') ||
        normOverlayText(sectionKey).includes('husk')
    )
    const taMedAssigned = assignmentLog.filter(
      (a) =>
        a.outcome === 'assigned' &&
        (/\b(ha med|ta med|husk(?:\s+å)?)\b/i.test(a.line) ||
          /\btyskprøve|tyskprøven|til\s+tyskprøv/i.test(a.line))
    )
    console.debug('[overlay client orphan fallback]', {
      overlayClientOrphanLinesBeforeAssignment: orphanLinesBefore.length,
      overlayClientOrphanLineAssignedToSubject: assigned,
      overlayClientOrphanLineAssignmentReason: assignmentLog,
      overlayClientUnplacedLinesRemaining: kept,
      overlaySubjectUpdatesBuilt: next.length,
      overlaySubjectUpdateFallbackOtherUsed: fallbackOtherUsed,
      overlayAdminLinesDropped: dropped,
      overlayClientOrphanTaMedBeforeAssignment: taMedLikeBefore.length,
      overlayClientOrphanTaMedAssignedToSubject: taMedAssigned.length,
      overlayClientOrphanTaMedAssignmentReason: taMedAssigned,
    })
  }

  if (next.length === 0) {
    return updatesIn.filter((u) => u.subjectKey !== 'other')
  }
  return next
}

/**
 * Deler opp overlay-linjer til én `subjectUpdate` per time (som import-preview),
 * med `subjectKey`/`customLabel` fra faktisk timeplan. Rest samles under `subjectKey: other`.
 */
export function redistributeEnrichSubjectUpdatesForDay(
  band: NorwegianGradeBand,
  baseLessons: SchoolLessonSlot[],
  updatesIn: SchoolWeekOverlaySubjectUpdate[]
): SchoolWeekOverlaySubjectUpdate[] {
  if (baseLessons.length === 0) return updatesIn

  const perLessonSections: Array<Record<string, string[]>> = baseLessons.map(() => ({}))
  const fallbackSections: Record<string, string[]> = {}

  const pushLine = (idx: number | null, sectionKey: string, line: string) => {
    const t = line.trim()
    if (!t) return
    const target = idx !== null && idx >= 0 ? perLessonSections[idx]! : fallbackSections
    if (!target[sectionKey]) target[sectionKey] = []
    target[sectionKey].push(t)
  }

  let totalLines = 0

  for (const u of updatesIn) {
    const sections = u.sections ?? {}
    for (const [sectionKey, lines] of Object.entries(sections)) {
      for (const raw of lines ?? []) {
        const t = raw.trim()
        if (!t) continue
        totalLines++
        const { idx } = resolveEnrichPreviewLineToBlockIdx(t, band, baseLessons, u)
        if (idx >= 0) {
          const lesson = baseLessons[idx]!
          const stripped = stripSubjectPrefixForBlockLine(t, band, lesson)
          pushLine(idx, sectionKey, stripped.text)
        } else {
          pushLine(null, sectionKey, t)
        }
      }
    }
  }

  if (totalLines === 0) return updatesIn

  const out: SchoolWeekOverlaySubjectUpdate[] = []
  for (let i = 0; i < baseLessons.length; i++) {
    const L = baseLessons[i]!
    const sec = perLessonSections[i]!
    if (Object.keys(sec).length === 0) continue
    out.push({ ...subjectUpdateMetaForLesson(L), sections: sec })
  }
  if (Object.keys(fallbackSections).length > 0) {
    out.push({ subjectKey: 'other', sections: fallbackSections })
  }

  const refined =
    out.length > 0 ? applyClientOrphanFallbackToSubjectUpdates(band, baseLessons, out) : out
  return refined.length > 0 ? refined : updatesIn
}
