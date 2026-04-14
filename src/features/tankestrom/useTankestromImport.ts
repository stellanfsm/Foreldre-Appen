import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Event, Person } from '../../types'
import type { PortalEventProposal, PortalImportProposalBundle, TankestromEventDraft } from './types'
import { analyzeDocumentWithTankestrom, analyzeTextWithTankestrom } from '../../lib/tankestromApi'
import { parseTime } from '../../lib/time'

type Step = 'pick' | 'review'
export type TankestromInputMode = 'file' | 'text'

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

function isHm24(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s.trim())
}

/** Normaliser `type="time"`-verdi til HH:mm (f.eks. 09:30:00 → 09:30). */
function normalizeTimeInput(s: string): string {
  const t = s.trim()
  const parts = t.split(':')
  if (parts.length >= 2) {
    const h = parts[0]!.padStart(2, '0').slice(-2)
    const m = parts[1]!.padStart(2, '0').slice(0, 2)
    return `${h}:${m}`
  }
  return t
}

export function validateTankestromDraft(
  d: TankestromEventDraft,
  validPersonIds: Set<string>
): string | null {
  if (!d.title.trim()) return 'Tittel kan ikke være tom.'
  const dateStr = d.date.trim()
  if (!DATE_KEY_RE.test(dateStr)) return 'Dato må være på formen ÅÅÅÅ-MM-DD.'
  const parsed = new Date(`${dateStr}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return 'Ugyldig dato.'

  const startNorm = normalizeTimeInput(d.start)
  const endNorm = normalizeTimeInput(d.end)
  if (!isHm24(startNorm)) return 'Starttid må være gyldig klokkeslett (HH:mm, 24 t).'
  if (!isHm24(endNorm)) return 'Sluttid må være gyldig klokkeslett (HH:mm, 24 t).'

  const startMin = parseTime(startNorm)
  const endMin = parseTime(endNorm)
  if (endMin <= startMin) return 'Sluttid må være senere enn starttid.'

  if (!d.personId.trim() || !validPersonIds.has(d.personId)) return 'Velg en gyldig person.'
  return null
}

export type TankestromFieldErrorKey = 'title' | 'date' | 'start' | 'end' | 'personId'

/** Felt-spesifikke meldinger for inline validering (samme regler som validateTankestromDraft). */
export function getTankestromDraftFieldErrors(
  d: TankestromEventDraft,
  validPersonIds: Set<string>
): Partial<Record<TankestromFieldErrorKey, string>> {
  const out: Partial<Record<TankestromFieldErrorKey, string>> = {}
  if (!d.title.trim()) out.title = 'Tittel kan ikke være tom.'
  const dateStr = d.date.trim()
  if (!DATE_KEY_RE.test(dateStr)) out.date = 'Bruk formatet ÅÅÅÅ-MM-DD.'
  else {
    const parsed = new Date(`${dateStr}T12:00:00`)
    if (Number.isNaN(parsed.getTime())) out.date = 'Ugyldig dato.'
  }
  const startNorm = normalizeTimeInput(d.start)
  const endNorm = normalizeTimeInput(d.end)
  if (!isHm24(startNorm)) out.start = 'Ugyldig tid (HH:mm, 24 t).'
  if (!isHm24(endNorm)) out.end = 'Ugyldig tid (HH:mm, 24 t).'
  if (isHm24(startNorm) && isHm24(endNorm) && parseTime(endNorm) <= parseTime(startNorm)) {
    out.end = 'Slutt må være etter start.'
  }
  if (!d.personId.trim() || !validPersonIds.has(d.personId)) {
    out.personId = 'Velg hvem hendelsen gjelder.'
  }
  return out
}

function buildDraftsFromProposals(
  events: PortalEventProposal[],
  validPersonIds: Set<string>,
  defaultPersonId: string
): Record<string, TankestromEventDraft> {
  const drafts: Record<string, TankestromEventDraft> = {}
  for (const p of events) {
    const ev = p.event
    const pid = validPersonIds.has(ev.personId) ? ev.personId : defaultPersonId
    drafts[p.proposalId] = {
      title: ev.title,
      date: ev.date,
      start: ev.start,
      end: ev.end,
      personId: pid,
      location: ev.location ?? '',
      notes: ev.notes ?? '',
    }
  }
  return drafts
}

export interface UseTankestromImportOptions {
  open: boolean
  people: Person[]
  createEvent: (date: string, input: Omit<Event, 'id'>) => Promise<void>
}

export function useTankestromImport({ open, people, createEvent }: UseTankestromImportOptions) {
  const [step, setStep] = useState<Step>('pick')
  const [inputMode, setInputMode] = useState<TankestromInputMode>('file')
  const [file, setFile] = useState<File | null>(null)
  const [textInput, setTextInput] = useState('')
  const [bundle, setBundle] = useState<PortalImportProposalBundle | null>(null)
  const eventProposals = useMemo((): PortalEventProposal[] => {
    if (!bundle) return []
    return bundle.items.filter((i): i is PortalEventProposal => i.kind === 'event')
  }, [bundle])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [draftByProposalId, setDraftByProposalId] = useState<Record<string, TankestromEventDraft>>({})
  const [analyzeLoading, setAnalyzeLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validPersonIds = useMemo(() => new Set(people.map((p) => p.id)), [people])

  const canApproveSelection = useMemo(() => {
    if (selectedIds.size === 0) return false
    for (const id of selectedIds) {
      const draft = draftByProposalId[id]
      if (!draft) return false
      if (validateTankestromDraft(draft, validPersonIds) != null) return false
    }
    return true
  }, [selectedIds, draftByProposalId, validPersonIds])

  const reset = useCallback(() => {
    setStep('pick')
    setInputMode('file')
    setFile(null)
    setTextInput('')
    setBundle(null)
    setSelectedIds(new Set())
    setDraftByProposalId({})
    setAnalyzeLoading(false)
    setSaveLoading(false)
    setError(null)
  }, [])

  useEffect(() => {
    if (open) reset()
  }, [open, reset])

  const setFileFromInput = useCallback((f: File | null) => {
    setFile(f)
    setError(null)
  }, [])

  const setInputModeSafe = useCallback((mode: TankestromInputMode) => {
    setInputMode(mode)
    setError(null)
  }, [])

  const setTextInputSafe = useCallback((value: string) => {
    setTextInput(value)
    setError(null)
  }, [])

  const toggleProposal = useCallback((proposalId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(proposalId)) next.delete(proposalId)
      else next.add(proposalId)
      return next
    })
  }, [])

  const updateDraft = useCallback((proposalId: string, patch: Partial<TankestromEventDraft>) => {
    setDraftByProposalId((prev) => {
      const cur = prev[proposalId]
      if (!cur) return prev
      return { ...prev, [proposalId]: { ...cur, ...patch } }
    })
  }, [])

  const runAnalyze = useCallback(async () => {
    if (inputMode === 'file') {
      if (!file) {
        setError('Velg en fil først.')
        return
      }
    } else if (!textInput.trim()) {
      setError('Skriv inn tekst først.')
      return
    }
    setError(null)
    setAnalyzeLoading(true)
    try {
      const b =
        inputMode === 'file'
          ? await analyzeDocumentWithTankestrom(file!)
          : await analyzeTextWithTankestrom(textInput)
      const events = b.items.filter((i): i is PortalEventProposal => i.kind === 'event')
      if (events.length === 0) {
        setError('Ingen hendelsesforslag i svaret.')
        return
      }
      setBundle(b)
      const defaultPersonId = people[0]?.id ?? ''
      setDraftByProposalId(buildDraftsFromProposals(events, validPersonIds, defaultPersonId))
      setSelectedIds(new Set(events.map((e) => e.proposalId)))
      setStep('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analyse feilet.')
    } finally {
      setAnalyzeLoading(false)
    }
  }, [file, inputMode, people, textInput, validPersonIds])

  const approveSelected = useCallback(async (): Promise<boolean> => {
    if (!bundle || eventProposals.length === 0) return false
    const ids = [...selectedIds]
    if (ids.length === 0) {
      setError('Velg minst ett forslag som skal importeres.')
      return false
    }

    for (const id of ids) {
      const draft = draftByProposalId[id]
      if (!draft) {
        setError('Mangler redigeringsdata for et valgt forslag. Prøv å analysere på nytt.')
        return false
      }
      const normalized: TankestromEventDraft = {
        ...draft,
        start: normalizeTimeInput(draft.start),
        end: normalizeTimeInput(draft.end),
      }
      const v = validateTankestromDraft(normalized, validPersonIds)
      if (v) {
        setError(v)
        return false
      }
    }

    setError(null)
    setSaveLoading(true)
    let failed = 0
    try {
      for (const id of ids) {
        const item = eventProposals.find((p) => p.proposalId === id)
        if (!item) continue
        const raw = draftByProposalId[id]!
        const draft: TankestromEventDraft = {
          ...raw,
          title: raw.title.trim(),
          date: raw.date.trim(),
          start: normalizeTimeInput(raw.start),
          end: normalizeTimeInput(raw.end),
          personId: raw.personId,
          location: raw.location.trim(),
          notes: raw.notes.trim(),
        }

        const ev = item.event
        const integration = {
          proposalId: item.proposalId,
          importRunId: bundle.provenance.importRunId,
          confidence: item.confidence,
          originalSourceType: item.originalSourceType,
          externalRef: item.externalRef,
          sourceSystem: bundle.provenance.sourceSystem,
        }
        const baseMeta =
          ev.metadata && typeof ev.metadata === 'object' && !Array.isArray(ev.metadata)
            ? { ...ev.metadata }
            : {}
        const metadata: Record<string, unknown> = {
          ...baseMeta,
          sourceId: item.sourceId,
          integration,
        }
        const input: Omit<Event, 'id'> = {
          personId: draft.personId,
          title: draft.title,
          start: draft.start,
          end: draft.end,
          notes: draft.notes.length > 0 ? draft.notes : undefined,
          location: draft.location.length > 0 ? draft.location : undefined,
          reminderMinutes: ev.reminderMinutes ?? undefined,
          recurrenceGroupId: ev.recurrenceGroupId,
          metadata,
        }
        try {
          await createEvent(draft.date, input)
        } catch {
          failed += 1
        }
      }
      if (failed > 0) {
        setError(`${failed} av ${ids.length} hendelser kunne ikke lagres. Sjekk nettverk og prøv igjen.`)
        return false
      }
      return true
    } finally {
      setSaveLoading(false)
    }
  }, [bundle, eventProposals, selectedIds, draftByProposalId, validPersonIds, createEvent])

  return {
    step,
    inputMode,
    setInputMode: setInputModeSafe,
    file,
    setFileFromInput,
    textInput,
    setTextInput: setTextInputSafe,
    bundle,
    eventProposals,
    selectedIds,
    toggleProposal,
    draftByProposalId,
    updateDraft,
    analyzeLoading,
    saveLoading,
    error,
    runAnalyze,
    approveSelected,
    people,
    canApproveSelection,
  }
}
