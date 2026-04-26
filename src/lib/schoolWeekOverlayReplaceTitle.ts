/**
 * Tittel for `replace_school_block` i kalenderen — samme heuristikk som import-preview
 * (`replaceSchoolBlockDisplaySummary` i TankestromImportDialog).
 */
import type { NorwegianGradeBand, SchoolWeekOverlayDayAction } from '../types'
import {
  inferSubjectKeyFromText,
  matchSubjectFromText,
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

function titleCaseNbWord(word: string): string {
  const w = word.trim()
  if (!w) return w
  return w.charAt(0).toLocaleUpperCase('nb-NO') + w.slice(1)
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

function previewSectionsFromSubjectUpdate(update: {
  sections?: Record<string, string[]>
}): Record<OverlayPreviewSectionLabel, string[]> {
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

function overlayDayLinesFromAction(action: SchoolWeekOverlayDayAction): string[] {
  const out: string[] = []
  for (const u of action.subjectUpdates) {
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

type SpecialDayTitleKind = 'heldagsprove' | 'forberedelsesdag' | null

const SPECIAL_DAY_SIDE_THEME = /\b(valgfag|innsats\s+for\s+andre)\b/i

function specialDayTitleKindFromText(text: string): SpecialDayTitleKind {
  const n = normOverlayText(text.replace(/\./g, ''))
  if (/\bheldagsprøve\b/.test(n) || /\bheldags\s*prøve\b/.test(n)) return 'heldagsprove'
  if (/\bforberedelsesdag\b/.test(n) || /\bforberedelses\s*dag\b/.test(n)) return 'forberedelsesdag'
  return null
}

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

function tryInferSubjectLabelFromLine(band: NorwegianGradeBand, raw: string): string | undefined {
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
  for (const tok of t.split(/\s+/)) {
    if (tok.length < 4) continue
    const m = matchSubjectFromText(band, tok)
    if (m) return subjectLabelFromKey(band, m.subjectKey)
    const inf = inferSubjectKeyFromText(band, tok)
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

function specialDaySummaryAlreadyActionSpecific(base: string, band: NorwegianGradeBand): boolean {
  const kind = specialDayTitleKindFromText(base)
  if (!kind) return false
  return tryInferSubjectLabelFromLine(band, base) !== undefined
}

function replaceSchoolBlockTitleFromParts(
  base: string,
  mergedFlatLines: string[],
  extraLines: string[],
  band: NorwegianGradeBand
): string {
  const corpus = [base, ...mergedFlatLines, ...extraLines].filter((s) => s.trim())
  if (corpus.length === 0) return ''

  const kind = inferSpecialDayKindFromCorpus(corpus, base)

  if (base && specialDaySummaryAlreadyActionSpecific(base, band)) {
    return base
  }

  if (!kind) {
    return base
  }

  const subj = inferSubjectLabelForSpecialDayTitle(band, corpus, kind)
  if (!subj) {
    return kind === 'forberedelsesdag' ? 'Forberedelsesdag' : kind === 'heldagsprove' ? 'Heldagsprøve' : base
  }

  return kind === 'forberedelsesdag'
    ? `Forberedelsesdag i ${subj.toLocaleLowerCase('nb-NO')}`
    : `${subj} heldagsprøve`
}

/** Synlig tittel for erstatningsblokk (som import-preview). */
export function calendarReplaceSchoolBlockTitle(
  action: SchoolWeekOverlayDayAction,
  band: NorwegianGradeBand
): string {
  const mergedSections: Record<OverlayPreviewSectionLabel, string[]> = {
    'I timen': [],
    Lekse: [],
    'Ta med': [],
    'Prøve / vurdering': [],
    Ressurser: [],
    'Ekstra beskjed': [],
  }
  for (const u of action.subjectUpdates) {
    const s = previewSectionsFromSubjectUpdate(u)
    for (const key of OVERLAY_PREVIEW_SECTION_ORDER) {
      mergedSections[key].push(...s[key])
    }
  }
  for (const key of OVERLAY_PREVIEW_SECTION_ORDER) {
    mergedSections[key] = dedupeOverlayPreviewLines(mergedSections[key])
  }
  const mergedFlatForTitle = OVERLAY_PREVIEW_SECTION_ORDER.flatMap((k) => mergedSections[k])
  const base = action.summary?.trim() || action.reason?.trim() || ''
  const extra = overlayDayLinesFromAction(action)

  const fromHeuristic = replaceSchoolBlockTitleFromParts(base, mergedFlatForTitle, extra, band)
  if (fromHeuristic) return fromHeuristic

  if (base) return base
  const first = action.subjectUpdates[0]
  if (first?.customLabel?.trim()) return first.customLabel.trim()
  if (first?.subjectKey?.trim()) return `Spesialdag: ${first.subjectKey.trim()}`
  return 'Spesialdag'
}
