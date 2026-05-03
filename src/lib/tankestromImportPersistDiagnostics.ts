import type { PostgrestError } from '@supabase/supabase-js'
import { formatSupabaseError } from './supabaseErrors'

export type TankestromImportPersistOperation = 'createEvent' | 'createTask' | 'editEvent'

export type TankestromImportPersistErrorKind =
  | 'network'
  | 'validation'
  | 'auth'
  | 'permission'
  | 'event_create_failed'
  | 'task_create_failed'
  | 'event_update_failed'
  | 'event_update_target_missing'
  | 'unknown'

export type TankestromImportPersistFailureRecord = {
  proposalId: string
  proposalSurfaceType: 'event' | 'task'
  operation: TankestromImportPersistOperation | 'editEventPrecheck'
  kind: TankestromImportPersistErrorKind
  message: string
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function asPostgrestError(err: unknown): PostgrestError | null {
  if (!isRecord(err)) return null
  if (typeof err.code === 'string' && typeof err.message === 'string') {
    return err as unknown as PostgrestError
  }
  return null
}

function operationFallbackKind(
  operation: TankestromImportPersistOperation
): TankestromImportPersistErrorKind {
  if (operation === 'createTask') return 'task_create_failed'
  if (operation === 'editEvent') return 'event_update_failed'
  return 'event_create_failed'
}

/**
 * Klassifiser kastet feil fra createEvent / createTask / editEvent for import-review.
 */
export function classifyTankestromPersistThrownError(
  err: unknown,
  operation: TankestromImportPersistOperation
): { kind: TankestromImportPersistErrorKind; message: string } {
  const pg = asPostgrestError(err)
  const msgFromErr = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const lower = (msgFromErr || '').toLowerCase()

  if (
    lower.includes('network') ||
    lower.includes('failed to fetch') ||
    lower.includes('load failed') ||
    lower === 'networkerror'
  ) {
    return { kind: 'network', message: msgFromErr || 'Nettverksfeil' }
  }

  if (pg) {
    const formatted = formatSupabaseError(pg)
    const code = pg.code ?? ''
    const msg = (pg.message ?? '').toLowerCase()
    if (code === 'PGRST301' || msg.includes('jwt') || (msg.includes('expired') && msg.includes('token'))) {
      return { kind: 'auth', message: formatted }
    }
    if (code === '42501' || msg.includes('permission denied') || msg.includes('rls') || msg.includes('policy')) {
      return { kind: 'permission', message: formatted }
    }
    if (
      code === '23505' ||
      code === '23514' ||
      code === '22P02' ||
      msg.includes('constraint') ||
      msg.includes('violates') ||
      msg.includes('invalid input')
    ) {
      return { kind: 'validation', message: formatted }
    }
    if (msg.includes('network') || msg.includes('fetch')) {
      return { kind: 'network', message: formatted }
    }
    return { kind: operationFallbackKind(operation), message: formatted }
  }

  const fb = operationFallbackKind(operation)
  if (err instanceof Error && err.message) {
    return { kind: fb, message: err.message }
  }

  return { kind: fb, message: 'Ukjent feil ved lagring' }
}

const KIND_HINT_NB: Partial<Record<TankestromImportPersistErrorKind, string>> = {
  network: 'Mulig nettverks- eller tilkoblingsproblem.',
  auth: 'Sesjonen kan ha utløpt — logg inn på nytt.',
  permission: 'Manglende tilgang (sjekk innlogging).',
  event_update_target_missing: 'Ett arrangement som skulle oppdateres ble ikke funnet.',
  validation: 'Noe kan være ugyldig (dato, tid eller format).',
  task_create_failed: 'Noen oppgaver kunne ikke lagres.',
  event_update_failed: 'Noen oppdateringer av eksisterende arrangement feilet.',
  event_create_failed: 'Noen nye hendelser kunne ikke opprettes.',
  unknown: 'Ukjent årsak — prøv igjen.',
}

const HINT_PRIORITY: TankestromImportPersistErrorKind[] = [
  'network',
  'auth',
  'permission',
  'event_update_target_missing',
  'validation',
  'task_create_failed',
  'event_update_failed',
  'event_create_failed',
  'unknown',
]

/** Kompakt brukermelding (mobilvennlig), maks noen få setninger. */
export function buildTankestromImportFailureUserMessage(
  failures: TankestromImportPersistFailureRecord[],
  totalSelected: number
): string {
  if (failures.length === 0) return ''
  const n = failures.length
  const head = `${n} av ${totalSelected} forslag kunne ikke lagres.`
  const kinds = new Set(failures.map((f) => f.kind))
  const hints: string[] = []
  for (const k of HINT_PRIORITY) {
    if (kinds.has(k)) {
      const line = KIND_HINT_NB[k]
      if (line) hints.push(line)
      if (hints.length >= 3) break
    }
  }
  if (hints.length === 0) {
    return `${head} Prøv igjen om litt.`
  }
  return `${head} ${hints.join(' ')}`
}

export function aggregatePersistFailureKinds(
  failures: TankestromImportPersistFailureRecord[]
): Record<TankestromImportPersistErrorKind, number> {
  const keys: TankestromImportPersistErrorKind[] = [
    'network',
    'validation',
    'auth',
    'permission',
    'event_create_failed',
    'task_create_failed',
    'event_update_failed',
    'event_update_target_missing',
    'unknown',
  ]
  const out = {} as Record<TankestromImportPersistErrorKind, number>
  for (const k of keys) out[k] = 0
  for (const f of failures) {
    out[f.kind] += 1
  }
  return out
}
