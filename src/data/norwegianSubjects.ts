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

/** Om `subjectKey` finnes i faglisten for valgt trinn (eller er «Annet fag»-nøkkelen). */
export function isKnownSubjectKeyForBand(band: NorwegianGradeBand, key: string): boolean {
  if (key === CUSTOM_SUBJECT_KEY) return true
  return SUBJECTS_BY_BAND[band].some((s) => s.key === key)
}

export function subjectLabelForKey(band: NorwegianGradeBand, key: string, customLabel?: string): string {
  if (key === CUSTOM_SUBJECT_KEY) return (customLabel?.trim() || 'Annet fag')
  if (customLabel?.trim()) return customLabel.trim()
  const list = SUBJECTS_BY_BAND[band]
  return list.find((s) => s.key === key)?.label ?? key
}
