import type { Person } from '../types'
import type { PortalEventProposal } from '../features/tankestrom/types'

const MATCH_CONFIDENCE_THRESHOLD = 0.9

export type ImportPersonResolution =
  | {
      personId: string | null
      status: 'not_specified'
      label: string
      extractedName?: undefined
    }
  | {
      personId: string | null
      status: 'unmatched_document_name'
      label: string
      extractedName: string
    }
  | {
      personId: string
      status: 'matched'
      label: string
      extractedName?: string
    }

function normPersonName(s: string): string {
  return s
    .toLocaleLowerCase('nb-NO')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Les navn fra dokument-metadata (boarding pass, reise, etc.). */
export function readExtractedDocumentPersonNameFromMetadata(meta: unknown): string | undefined {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return undefined
  const m = meta as Record<string, unknown>
  const docExtracted = m.documentExtractedPersonName
  if (typeof docExtracted === 'string' && docExtracted.trim()) return docExtracted.trim()
  for (const key of ['passengerName', 'documentPersonName', 'personName'] as const) {
    const v = m[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  const travel = m.travel
  if (travel && typeof travel === 'object' && !Array.isArray(travel)) {
    const pn = (travel as Record<string, unknown>).passengerName
    if (typeof pn === 'string' && pn.trim()) return pn.trim()
  }
  return undefined
}

/**
 * Matcher dokumentnavn mot kjente familiemedlemmer.
 * Konservativ: fullt navn (normalisert), eller ett fornavn kun når det er entydig i familien.
 */
export function findKnownPersonByName(
  extractedName: string,
  knownPeople: readonly Person[]
): { id: string; name: string; confidence: number } | null {
  const ex = normPersonName(extractedName)
  if (!ex) return null

  let best: { id: string; name: string; confidence: number } | null = null

  for (const p of knownPeople) {
    const pn = normPersonName(p.name)
    if (!pn) continue
    if (ex === pn) {
      return { id: p.id, name: p.name, confidence: 1 }
    }
  }

  const exTokens = ex.split(' ').filter(Boolean)
  if (exTokens.length === 1) {
    const first = exTokens[0]!
    const hits = knownPeople.filter((p) => {
      const pn = normPersonName(p.name)
      const pt = pn.split(' ').filter(Boolean)
      return pt.length > 0 && pt[0] === first
    })
    if (hits.length === 1) {
      const p = hits[0]!
      best = { id: p.id, name: p.name, confidence: 0.92 }
    }
  }

  return best
}

/** Dokumentimport: ingen automatisk kobling uten entydig navnematch. */
export function resolvePersonForImport(
  item: PortalEventProposal,
  knownPeople: readonly Person[]
): ImportPersonResolution {
  const extractedName = readExtractedDocumentPersonNameFromMetadata(item.event.metadata)

  if (!extractedName) {
    return {
      personId: null,
      status: 'not_specified',
      label: 'Person ikke oppgitt',
    }
  }

  const match = findKnownPersonByName(extractedName, knownPeople)

  if (match && match.confidence >= MATCH_CONFIDENCE_THRESHOLD) {
    return {
      personId: match.id,
      status: 'matched',
      label: match.name,
      extractedName,
    }
  }

  return {
    personId: null,
    status: 'unmatched_document_name',
    label: 'Person ikke oppgitt',
    extractedName,
  }
}
