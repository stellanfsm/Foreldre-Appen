/**
 * Review-visning: fjern eller demp «Høydepunkter»-blokk når den bare gjentar notater/tittel.
 * Endrer ikke persisted data — kun presentasjon i import-review.
 */

export function normalizeNotesDedupeKey(s: string): string {
  return s
    .toLocaleLowerCase('nb-NO')
    .replace(/\s+/g, ' ')
    .replace(/[·•\-\u2013\u2014.,;:!?'"()[\]]/g, '')
    .trim()
}

const FOLLOWING_SECTION_HEADERS =
  /(?:^|\n)\s*(?:notater|husk|frister|praktisk|detaljer|oppsummering|mer info|dagsprogram|program|informasjon)\s*:\s*/i

/**
 * Fjerner én «høydepunkter»-seksjon dersom den er tom/svak eller substansielt duplikat av resten / `compareAgainst`.
 */
export function stripRedundantHighlightsForReviewDisplay(
  raw: string,
  opts?: { compareAgainst?: string }
): { text: string | null; suppressed: false | 'duplicate' | 'weak' } {
  const trimmed = raw.trim()
  if (!trimmed) return { text: null, suppressed: false }

  const headerRe = /(?:^|\n)(\s*høydepunkt(?:er)?\s*:\s*)/i
  const match = headerRe.exec(trimmed)
  if (!match) return { text: trimmed, suppressed: false }

  const blockStart = match.index
  const afterHeaderStart = match.index + match[0].length
  const tail = trimmed.slice(afterHeaderStart)
  const nextIdxRel = (() => {
    const m = FOLLOWING_SECTION_HEADERS.exec(tail)
    return m ? m.index : -1
  })()
  const blockEnd = nextIdxRel === -1 ? trimmed.length : afterHeaderStart + nextIdxRel
  const highlightsBody = trimmed.slice(afterHeaderStart, blockEnd).trim()
  const before = trimmed.slice(0, blockStart).trim()
  const after = trimmed.slice(blockEnd).trim()
  const restCombined = [before, after].filter(Boolean).join('\n\n').trim()

  const hiKey = normalizeNotesDedupeKey(highlightsBody)
  const restKey = normalizeNotesDedupeKey(restCombined)
  const extraKey = opts?.compareAgainst ? normalizeNotesDedupeKey(opts.compareAgainst) : ''

  const weak =
    hiKey.length < 10 ||
    /^[•\-\d\.\s\uFEFF]+$/u.test(highlightsBody)

  let duplicate = false
  if (hiKey.length >= 10) {
    if (restKey.length > 0 && (restKey.includes(hiKey) || hiKey.includes(restKey))) {
      duplicate = true
    } else if (extraKey.length >= 8 && (extraKey.includes(hiKey) || hiKey.includes(extraKey))) {
      duplicate = true
    } else if (restKey.length > 0 && hiKey.length >= 16 && restKey.length >= 16) {
      const a = new Set(hiKey.split(' ').filter((w) => w.length > 2))
      const b = new Set(restKey.split(' ').filter((w) => w.length > 2))
      if (a.size > 0 && b.size > 0) {
        let inter = 0
        for (const w of a) if (b.has(w)) inter += 1
        const j = inter / Math.min(a.size, b.size)
        if (j >= 0.88) duplicate = true
      }
    }
  }

  if (duplicate) {
    const out = restCombined.trim() || null
    return { text: out, suppressed: 'duplicate' }
  }

  if (weak) {
    const out = restCombined.trim() || null
    return { text: out, suppressed: 'weak' }
  }

  return { text: trimmed, suppressed: false }
}
