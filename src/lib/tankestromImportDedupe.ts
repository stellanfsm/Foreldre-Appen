import type { PortalProposalItem } from '../features/tankestrom/types'

/** Fjerner «fredag –» / «lørdag -» osv. slik at like cup-/Spond-titler med ulike ukedager likevel matcher. */
const WEEKDAY_TITLE_PREFIX =
  /^(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)\s*[–—\-]\s*/i

function normalizeTitleForDedupe(title: string): string {
  return title
    .trim()
    .replace(WEEKDAY_TITLE_PREFIX, '')
    .toLocaleLowerCase('nb-NO')
    .replace(/\s+/g, ' ')
}

/** Fjerner første «Fra: …»-linje (samme som i draft-prefill) og korter ned for robust duplikatmatch. */
function normalizeNotesForDedupe(notes?: string): string {
  const raw = (notes ?? '').replace(/\r\n/g, '\n').trim()
  let body = raw
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length > 0 && /^fra:\s*/i.test(lines[0] ?? '')) {
    body = lines.slice(1).join('\n').trim()
  }
  const t = body.toLocaleLowerCase('nb-NO').replace(/\s+/g, ' ')
  return t.length > 100 ? t.slice(0, 100) : t
}

function dedupeKeyForCalendarItem(item: PortalProposalItem): string | null {
  if (item.kind === 'school_profile') return null
  if (item.kind === 'event') {
    const e = item.event
    const start = e.start.length > 5 ? e.start.slice(0, 5) : e.start
    return [
      'e',
      e.date,
      start,
      e.personId,
      normalizeTitleForDedupe(e.title),
      normalizeNotesForDedupe(e.notes),
    ].join('|')
  }
  const t = item.task
  const due = (t.dueTime ?? '').trim().slice(0, 5)
  return [
    't',
    t.date,
    due,
    t.childPersonId ?? '',
    t.assignedToPersonId ?? '',
    normalizeTitleForDedupe(t.title),
    normalizeNotesForDedupe(t.notes),
  ].join('|')
}

/**
 * Slår sammen åpenbare duplikater fra analyse (samme dag/tid/person og nesten lik tittel+notat).
 * Beholder første forekomst (ofte høyest prioritet i listen). Skoleprofil-poster passeres uendret.
 */
export function dedupeNearDuplicateCalendarProposals(items: PortalProposalItem[]): PortalProposalItem[] {
  const seen = new Set<string>()
  const out: PortalProposalItem[] = []
  for (const item of items) {
    if (item.kind === 'school_profile') {
      out.push(item)
      continue
    }
    const key = dedupeKeyForCalendarItem(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}
