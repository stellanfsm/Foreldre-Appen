import { supabase } from './supabaseClient'
import type {
  PortalEventPayload,
  PortalEventProposal,
  PortalImportProposalBundle,
  PortalProposalItem,
  PortalSourceSystem,
} from '../features/tankestrom/types'

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function isUuidLike(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

function isDateKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function isHm(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
}

function asString(x: unknown, field: string): string {
  if (typeof x !== 'string' || !x.trim()) throw new Error(`Ugyldig svar: mangler eller tom streng for ${field}`)
  return x.trim()
}

function asOptionalString(x: unknown): string | undefined {
  if (x === undefined || x === null) return undefined
  if (typeof x !== 'string') return undefined
  const t = x.trim()
  return t.length ? t : undefined
}

function asNumber01(x: unknown, field: string): number {
  if (typeof x !== 'number' || Number.isNaN(x)) throw new Error(`Ugyldig svar: ${field} må være et tall`)
  if (x < 0 || x > 1) throw new Error(`Ugyldig svar: ${field} må være mellom 0 og 1`)
  return x
}

function parseProvenance(raw: unknown): PortalImportProposalBundle['provenance'] {
  if (!isRecord(raw)) throw new Error('Ugyldig svar: provenance mangler')
  const sourceSystem = asString(raw.sourceSystem, 'provenance.sourceSystem') as PortalSourceSystem
  if (!['tankestrom', 'mail_organizer', 'other'].includes(sourceSystem)) {
    throw new Error('Ugyldig svar: provenance.sourceSystem')
  }
  return {
    sourceSystem,
    sourceType: asString(raw.sourceType, 'provenance.sourceType'),
    generatorVersion: asOptionalString(raw.generatorVersion),
    generatedAt: asString(raw.generatedAt, 'provenance.generatedAt'),
    importRunId: asString(raw.importRunId, 'provenance.importRunId'),
  }
}

function parseEventPayload(raw: unknown): PortalEventPayload {
  if (!isRecord(raw)) throw new Error('Ugyldig svar: event-payload mangler')
  const date = asString(raw.date, 'event.date')
  if (!isDateKey(date)) throw new Error('Ugyldig svar: event.date må være YYYY-MM-DD')
  const start = asString(raw.start, 'event.start')
  const end = asString(raw.end, 'event.end')
  if (!isHm(start) || !isHm(end)) throw new Error('Ugyldig svar: start/slutt må være HH:mm')
  const personId = asString(raw.personId, 'event.personId')
  const title = asString(raw.title, 'event.title')
  const out: PortalEventPayload = {
    date,
    personId,
    title,
    start,
    end,
  }
  const notes = asOptionalString(raw.notes)
  if (notes !== undefined) out.notes = notes
  const location = asOptionalString(raw.location)
  if (location !== undefined) out.location = location
  if (raw.reminderMinutes !== undefined && raw.reminderMinutes !== null) {
    if (typeof raw.reminderMinutes !== 'number' || !Number.isInteger(raw.reminderMinutes)) {
      throw new Error('Ugyldig svar: reminderMinutes')
    }
    out.reminderMinutes = raw.reminderMinutes
  }
  const rg = asOptionalString(raw.recurrenceGroupId)
  if (rg !== undefined) out.recurrenceGroupId = rg
  if (raw.metadata !== undefined && raw.metadata !== null) {
    if (!isRecord(raw.metadata)) throw new Error('Ugyldig svar: event.metadata')
    out.metadata = { ...raw.metadata }
  }
  return out
}

/** Parser ett forslag. `task` hoppes over i portal-MVP (returnerer null). */
function tryParseProposalItem(raw: unknown, index: number): PortalEventProposal | null {
  if (!isRecord(raw)) throw new Error(`Forslag #${index + 1}: mangler felter`)
  const proposalId = asString(raw.proposalId, 'proposalId')
  if (!isUuidLike(proposalId)) throw new Error(`Forslag #${index + 1}: proposalId må være en UUID`)
  const kind = asString(raw.kind, 'kind')
  if (kind === 'task') return null
  if (kind !== 'event') throw new Error(`Forslag #${index + 1}: ukjent kind "${kind}"`)
  const sourceId = asString(raw.sourceId, 'sourceId')
  const originalSourceType = asString(raw.originalSourceType, 'originalSourceType')
  const confidence = asNumber01(raw.confidence, 'confidence')
  const base = {
    proposalId,
    kind: 'event' as const,
    sourceId,
    originalSourceType,
    confidence,
    externalRef: asOptionalString(raw.externalRef),
    calendarOwnerUserId: asOptionalString(raw.calendarOwnerUserId),
  }
  return { ...base, event: parseEventPayload(raw.event) }
}

/**
 * Validerer og parser JSON fra analyse-backend til typet bundle.
 */
export function parsePortalImportProposalBundle(data: unknown): PortalImportProposalBundle {
  if (!isRecord(data)) throw new Error('Ugyldig svar: forventet JSON-objekt')
  if (data.schemaVersion !== '1.0.0') {
    throw new Error(`Ustøttet schemaVersion: ${String(data.schemaVersion)}`)
  }
  const provenance = parseProvenance(data.provenance)
  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new Error('Ugyldig svar: items må være en ikke-tom liste')
  }
  const items: PortalProposalItem[] = []
  for (let i = 0; i < data.items.length; i++) {
    try {
      const parsed = tryParseProposalItem(data.items[i], i)
      if (parsed) items.push(parsed)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ukjent feil'
      throw new Error(msg.startsWith('Forslag #') ? msg : `Forslag #${i + 1}: ${msg}`)
    }
  }
  if (items.length === 0) {
    throw new Error('Ingen hendelsesforslag i svaret (kun oppgaver eller tom liste).')
  }
  return { schemaVersion: '1.0.0', provenance, items }
}

type AnalyzePayload =
  | { kind: 'file'; file: File }
  | { kind: 'text'; text: string }

async function analyzeWithTankestrom(payload: AnalyzePayload): Promise<PortalImportProposalBundle> {
  const urlRaw = import.meta.env.VITE_TANKESTROM_ANALYZE_URL
  const url = typeof urlRaw === 'string' ? urlRaw.trim() : ''
  if (!url) {
    throw new Error(
      'Tankestrøm er ikke konfigurert. Sett miljøvariabelen VITE_TANKESTROM_ANALYZE_URL til analyse-API-ets URL.'
    )
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) {
    throw new Error('Du må være innlogget for å analysere dokumenter.')
  }

  let body: BodyInit
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (payload.kind === 'file') {
    const form = new FormData()
    form.append('file', payload.file)
    body = form
  } else {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify({ text: payload.text })
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body,
  })

  const text = await res.text()
  let json: unknown
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    throw new Error(res.ok ? 'Ugyldig JSON fra server' : `Serverfeil (${res.status}): kunne ikke lese svar`)
  }

  if (!res.ok) {
    const detail =
      isRecord(json) && typeof json.error === 'string'
        ? json.error
        : isRecord(json) && typeof json.message === 'string'
          ? json.message
          : text.slice(0, 200)
    throw new Error(`Analyse feilet (${res.status}): ${detail}`)
  }

  return parsePortalImportProposalBundle(json)
}

function newBatchImportRunId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

/**
 * Slår sammen flere analyse-svar (én POST per fil) til én bundle for import-steget.
 * Ny `importRunId` knytter hele batchen til én import-økt.
 */
export function mergePortalImportProposalBundles(bundles: PortalImportProposalBundle[]): PortalImportProposalBundle {
  if (bundles.length === 0) {
    throw new Error('Ingen analyseresultater å slå sammen.')
  }
  if (bundles.length === 1) {
    return bundles[0]!
  }
  const items = bundles.flatMap((b) => b.items)
  const base = bundles[0]!.provenance
  return {
    schemaVersion: '1.0.0',
    provenance: {
      ...base,
      importRunId: newBatchImportRunId(),
      sourceType: `${base.sourceType} · ${bundles.length} filer`,
    },
    items,
  }
}

/**
 * Laster opp fil til analyse-backend og returnerer typet forslagspakke.
 * Krever VITE_TANKESTROM_ANALYZE_URL og innlogget Supabase-session.
 */
export async function analyzeDocumentWithTankestrom(file: File): Promise<PortalImportProposalBundle> {
  return analyzeWithTankestrom({ kind: 'file', file })
}

/** Analyse av ren tekst (MVP) med samme backend-endepunkt og svarformat. */
export async function analyzeTextWithTankestrom(text: string): Promise<PortalImportProposalBundle> {
  const normalized = text.trim()
  if (!normalized) throw new Error('Skriv inn tekst før du analyserer.')
  return analyzeWithTankestrom({ kind: 'text', text: normalized })
}
