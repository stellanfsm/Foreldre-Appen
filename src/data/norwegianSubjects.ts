/**
 * Subject name presets by Norwegian grade band (LK20 / grunnskole / VG — forenklet).
 * Used for building weekly timetables; kommuner/skoler varierer — dette er veiledende.
 */

import type { NorwegianGradeBand } from '../types'

export const GRADE_BAND_LABELS: Record<NorwegianGradeBand, string> = {
  '1-4': '1.–4. trinn (barneskole)',
  '5-7': '5.–7. trinn (mellomtrinn)',
  '8-10': '8.–10. trinn (ungdomsskole)',
  vg1: 'VG1',
  vg2: 'VG2',
  vg3: 'VG3',
}

/** Typical default school gate times by band (veiledende — tilpass lokalt). */
export const DEFAULT_SCHOOL_GATE_BY_BAND: Record<
  NorwegianGradeBand,
  { start: string; end: string }
> = {
  '1-4': { start: '08:30', end: '14:00' },
  '5-7': { start: '08:15', end: '14:30' },
  '8-10': { start: '08:15', end: '15:00' },
  vg1: { start: '08:15', end: '15:15' },
  vg2: { start: '08:15', end: '15:15' },
  vg3: { start: '08:15', end: '15:15' },
}

export type SubjectOption = { key: string; label: string }

export const SUBJECTS_BY_BAND: Record<NorwegianGradeBand, SubjectOption[]> = {
  '1-4': [
    { key: 'norsk', label: 'Norsk' },
    { key: 'matematikk', label: 'Matematikk' },
    { key: 'engelsk', label: 'Engelsk' },
    { key: 'naturfag', label: 'Naturfag' },
    { key: 'samfunnsfag', label: 'Samfunnsfag' },
    { key: 'krle', label: 'KRLE' },
    { key: 'kunst_håndverk', label: 'Kunst og håndverk' },
    { key: 'musikk', label: 'Musikk' },
    { key: 'kroppsøving', label: 'Kroppsøving' },
    { key: 'mat_helse', label: 'Mat og helse' },
    { key: 'valgfag', label: 'Valgfag / aktivitet' },
    { key: 'lesing', label: 'Lesetid / bibliotek' },
  ],
  '5-7': [
    { key: 'norsk', label: 'Norsk' },
    { key: 'matematikk', label: 'Matematikk' },
    { key: 'engelsk', label: 'Engelsk' },
    { key: 'naturfag', label: 'Naturfag' },
    { key: 'samfunnsfag', label: 'Samfunnsfag' },
    { key: 'krle', label: 'KRLE' },
    { key: 'kunst_håndverk', label: 'Kunst og håndverk' },
    { key: 'musikk', label: 'Musikk' },
    { key: 'kroppsøving', label: 'Kroppsøving' },
    { key: 'mat_helse', label: 'Mat og helse' },
    { key: 'valgfag', label: 'Valgfag' },
    { key: 'arbeidslivsfag', label: 'Arbeidslivsfag' },
  ],
  '8-10': [
    { key: 'norsk', label: 'Norsk' },
    { key: 'matematikk', label: 'Matematikk' },
    { key: 'engelsk', label: 'Engelsk' },
    { key: 'naturfag', label: 'Naturfag' },
    { key: 'samfunnsfag', label: 'Samfunnsfag' },
    { key: 'krle', label: 'KRLE' },
    { key: 'kunst_håndverk', label: 'Kunst og håndverk' },
    { key: 'musikk', label: 'Musikk' },
    { key: 'kroppsøving', label: 'Kroppsøving' },
    { key: 'mat_helse', label: 'Mat og helse' },
    { key: 'fremmedspråk', label: 'Fremmedspråk' },
    { key: 'valgfag', label: 'Valgfag' },
    { key: 'arbeidslivsfag', label: 'Arbeidslivsfag' },
  ],
  vg1: [
    { key: 'norsk', label: 'Norsk' },
    { key: 'engelsk', label: 'Engelsk' },
    { key: 'matematikk', label: 'Matematikk' },
    { key: 'naturfag', label: 'Naturfag' },
    { key: 'samfunnskunnskap', label: 'Samfunnskunnskap' },
    { key: 'geografi', label: 'Geografi' },
    { key: 'kroppsøving', label: 'Kroppsøving' },
    { key: 'fremmedspråk', label: 'Fremmedspråk' },
    { key: 'felles', label: 'Fellesfag' },
    { key: 'programfag', label: 'Programfag' },
  ],
  vg2: [
    { key: 'norsk', label: 'Norsk' },
    { key: 'historie', label: 'Historie' },
    { key: 'matematikk', label: 'Matematikk' },
    { key: 'fremmedspråk', label: 'Fremmedspråk' },
    { key: 'kroppsøving', label: 'Kroppsøving' },
    { key: 'felles', label: 'Fellesfag' },
    { key: 'programfag', label: 'Programfag' },
  ],
  vg3: [
    { key: 'norsk', label: 'Norsk' },
    { key: 'historie', label: 'Historie' },
    { key: 'religion_og_etikk', label: 'Religion og etikk' },
    { key: 'kroppsøving', label: 'Kroppsøving' },
    { key: 'felles', label: 'Fellesfag' },
    { key: 'programfag', label: 'Programfag' },
    { key: 'eksamen', label: 'Eksamen / opplæring' },
  ],
}

/** Lesson uses `customLabel` when subjectKey is this */
export const CUSTOM_SUBJECT_KEY = 'custom'

/**
 * Fag der `customLabel` alene er ønsket visning (språk, valg/program — katalognavnet er generisk).
 * Unngår «Fremmedspråk · Spansk» når import bare har «Spansk».
 */
const GENERIC_SUBJECT_KEYS = new Set<string>([
  'fremmedspråk',
  'valgfag',
  'programfag',
  'felles',
  'eksamen',
])

/** Fag der timeplanen ofte bare har en hovedblokk — underkategori velges for seg. */
export function lessonUsesStructuredSubcategory(subjectKey: string): boolean {
  return GENERIC_SUBJECT_KEYS.has(subjectKey)
}

/** Nedtrekk for fremmedspråk-spor (visningsverdier lagres i `lessonSubcategory`). */
export const FREMMSP_LEK_SUBCATEGORY_PRESETS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'Tysk', label: 'Tysk' },
  { value: 'Spansk', label: 'Spansk' },
  { value: 'Fransk', label: 'Fransk' },
  { value: 'Italiensk', label: 'Italiensk' },
  { value: 'Russisk', label: 'Russisk' },
  { value: 'Arabisk', label: 'Arabisk' },
  { value: 'Japansk', label: 'Japansk' },
  { value: 'Mandarin (kinesisk)', label: 'Mandarin / kinesisk' },
]

export const VALGFAG_SUBCATEGORY_PRESETS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'Programmering', label: 'Programmering' },
  { value: 'Musikk', label: 'Musikk' },
  { value: 'Idrett', label: 'Idrett' },
  { value: 'Teater', label: 'Teater' },
  { value: 'Kunst og visuell kultur', label: 'Kunst / visuell kultur' },
  { value: 'Mat og helse', label: 'Mat og helse' },
]

const CUSTOM_SUBCAT_SENTINEL = '__custom__'

/**
 * `undefined` = ikke valgt i nedtrekk.
 * `''` (tom streng) = «Annet» valgt, brukeren kan skrive fritekst.
 */
export function lessonSubcategorySelectValue(
  lessonSubcategory: string | undefined,
  presets: ReadonlyArray<{ value: string }>
): string {
  if (lessonSubcategory === undefined) return ''
  if (lessonSubcategory === '') return CUSTOM_SUBCAT_SENTINEL
  const v = lessonSubcategory.trim()
  if (!v) return ''
  const hit = presets.find((p) => p.value === v)
  if (hit) return hit.value
  return CUSTOM_SUBCAT_SENTINEL
}

export { CUSTOM_SUBCAT_SENTINEL as LESSON_SUBCATEGORY_CUSTOM_SENTINEL }

function normNb(s: string): string {
  return s
    .trim()
    .toLocaleLowerCase('nb-NO')
    .normalize('NFKC')
}

/** Normaliser fagtekst for trygg sammenligning mot keys/labels. */
function normalizeSubjectText(s: string): string {
  return normNb(s)
    .replace(/[./]/g, ' ')
    .replace(/[^a-z0-9æøå ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

type SubjectTextMatch = {
  subjectKey: string
  matchType: 'exact' | 'prefix'
}

function buildSubjectTextCandidates(band: NorwegianGradeBand): Array<{ key: string; textNorm: string }> {
  const out: Array<{ key: string; textNorm: string }> = []
  for (const s of SUBJECTS_BY_BAND[band]) {
    out.push({ key: s.key, textNorm: normalizeSubjectText(s.label) })
    out.push({ key: s.key, textNorm: normalizeSubjectText(s.key.replace(/_/g, ' ')) })
  }
  // Lengst først for å unngå at korte treff "spiser" mer spesifikke.
  out.sort((a, b) => b.textNorm.length - a.textNorm.length)
  return out
}

/** True når customLabel allerede inneholder katalognavnet (f.eks. «Norsk utenom»). */
function customAlreadyEmbedsCatalogLabel(custom: string, catalogLabel: string): boolean {
  const c = normNb(custom)
  const cat = normNb(catalogLabel)
  if (!cat.length) return false
  if (c === cat) return true
  if (c.startsWith(`${cat} `)) return true
  if (c.endsWith(` ${cat}`)) return true
  if (c.includes(` ${cat} `)) return true
  return false
}

/** Om `subjectKey` finnes i faglisten for valgt trinn (eller er «Annet fag»-nøkkelen). */
export function isKnownSubjectKeyForBand(band: NorwegianGradeBand, key: string): boolean {
  if (key === CUSTOM_SUBJECT_KEY) return true
  return SUBJECTS_BY_BAND[band].some((s) => s.key === key)
}

/**
 * Finn katalog-`subjectKey` fra fri tekst (label eller key), ellers `null`.
 * Brukes for å rydde opp i import der `customLabel` egentlig er selve faget.
 */
export function inferSubjectKeyFromText(
  band: NorwegianGradeBand,
  text: string | undefined | null
): string | null {
  const m = matchSubjectFromText(band, text)
  return m?.subjectKey ?? null
}

/**
 * Finn katalog-fag i fri tekst. Returnerer også om treffet var eksakt eller tydelig prefiks.
 * Prefiks brukes når teksten starter med fagnavn + tillegg (f.eks. "Samfunnsfag D2").
 */
export function matchSubjectFromText(
  band: NorwegianGradeBand,
  text: string | undefined | null
): SubjectTextMatch | null {
  const raw = text?.trim()
  if (!raw) return null
  const normalized = normalizeSubjectText(raw)
  if (!normalized) return null

  const candidates = buildSubjectTextCandidates(band)
  for (const c of candidates) {
    if (!c.textNorm) continue
    if (normalized === c.textNorm) {
      return { subjectKey: c.key, matchType: 'exact' }
    }
    if (normalized.startsWith(`${c.textNorm} `)) {
      return { subjectKey: c.key, matchType: 'prefix' }
    }
  }

  return null
}

/**
 * Pen visningslabel for timeplan / skolekontekst.
 * Bevarer importert tilleggstekst: «norsk» + «Utenom» → «Norsk · Utenom», mens «Norsk utenom» i customLabel vises hele.
 */
export function subjectLabelForKey(
  band: NorwegianGradeBand,
  key: string,
  customLabel?: string,
  lessonSubcategory?: string
): string {
  if (key === CUSTOM_SUBJECT_KEY) return (customLabel?.trim() || 'Annet fag')

  const list = SUBJECTS_BY_BAND[band]
  const catalogLabel = list.find((s) => s.key === key)?.label
  const custom = customLabel?.trim()
  const sub = lessonSubcategory?.trim()

  if (GENERIC_SUBJECT_KEYS.has(key)) {
    if (sub) return sub
    if (custom) return custom
    return catalogLabel ?? key
  }

  if (!custom) {
    return catalogLabel ?? key
  }

  if (!catalogLabel) {
    return custom
  }

  if (normNb(custom) === normNb(catalogLabel)) {
    return catalogLabel
  }

  if (customAlreadyEmbedsCatalogLabel(custom, catalogLabel)) {
    return custom
  }

  return `${catalogLabel} · ${custom}`
}
