import type { TankestromEventDraft } from '../features/tankestrom/types'
import type { PersonId } from '../types'

/**
 * Kontekstuell regel: når må brukeren velge en kjent person før import?
 * Dokument/reise og eksplisitte «ingen match»-tilstander krever ikke personId.
 */
export function requiresPersonForImport(draft: TankestromEventDraft): boolean {
  if (draft.isManualCalendarEntry) return true
  if (draft.travelImportType === 'flight') return false

  if (
    draft.personMatchStatus === 'not_specified' ||
    draft.personMatchStatus === 'unmatched_document_name'
  ) {
    return false
  }

  const sk = draft.importSourceKind ?? ''
  if (sk === 'document_import' || sk === 'image_import' || sk === 'uploaded_file') return false

  return draft.importRequiresPerson === true
}

/** Tom/whitespace → null før lagring (ingen default-person). */
export function normalizePersistedPersonId(
  draftPersonId: string | undefined | null
): PersonId | null {
  if (typeof draftPersonId !== 'string') return null
  const t = draftPersonId.trim()
  return t.length > 0 ? (t as PersonId) : null
}
