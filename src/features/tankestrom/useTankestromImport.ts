import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChildSchoolProfile, Event, Person, Task } from '../../types'
import type {
  PortalEventProposal,
  PortalImportProposalBundle,
  PortalProposalItem,
  PortalSchoolProfileProposal,
  PortalTaskProposal,
  TankestromEventDraft,
  TankestromImportDraft,
  TankestromTaskDraft,
} from './types'
import {
  analyzeDocumentWithTankestrom,
  analyzeTextWithTankestrom,
  mergePortalImportProposalBundles,
} from '../../lib/tankestromApi'
import { detectLessonConflicts } from '../../lib/schoolProfileConflicts'
import { parseTime } from '../../lib/time'

type Step = 'pick' | 'review'
export type TankestromInputMode = 'file' | 'text'

export type TankestromPendingFileStatus = 'ready' | 'analyzing' | 'done' | 'error'

export interface TankestromPendingFile {
  id: string
  file: File
  status: TankestromPendingFileStatus
  /** Kort feilmelding eller «Ingen hendelsesforslag» ved status error */
  statusDetail?: string
}

function newPendingFileId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

function isHm24(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s.trim())
}

/** Normaliser `type="time"`-verdi til HH:mm (f.eks. 09:30:00 → 09:30). */
export function normalizeTimeInput(s: string): string {
  const t = s.trim()
  const parts = t.split(':')
  if (parts.length >= 2) {
    const h = parts[0]!.padStart(2, '0').slice(-2)
    const m = parts[1]!.padStart(2, '0').slice(0, 2)
    return `${h}:${m}`
  }
  return t
}

function hmPlusMinutes(hm: string, addMinutes: number): string {
  const norm = normalizeTimeInput(hm)
  if (!isHm24(norm)) return '10:00'
  const total = parseTime(norm) + addMinutes
  const clamped = Math.min(Math.max(0, total), 23 * 60 + 59)
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function defaultChildPersonId(people: Person[], validPersonIds: Set<string>): string {
  const c = people.find((p) => p.memberKind === 'child' && validPersonIds.has(p.id))
  return c?.id ?? ''
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

export function validateTankestromTaskDraft(d: TankestromTaskDraft): string | null {
  if (!d.title.trim()) return 'Tittel kan ikke være tom.'
  const dateStr = d.date.trim()
  if (!DATE_KEY_RE.test(dateStr)) return 'Dato må være på formen ÅÅÅÅ-MM-DD.'
  const parsed = new Date(`${dateStr}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return 'Ugyldig dato.'
  const due = d.dueTime.trim()
  if (due && !isHm24(normalizeTimeInput(due))) return 'Frist (klokkeslett) må være HH:mm.'
  return null
}

export type TankestromFieldErrorKey = 'title' | 'date' | 'start' | 'end' | 'personId'
export type TankestromTaskFieldErrorKey = 'title' | 'date' | 'dueTime'

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

export function getTankestromTaskFieldErrors(
  d: TankestromTaskDraft
): Partial<Record<TankestromTaskFieldErrorKey, string>> {
  const out: Partial<Record<TankestromTaskFieldErrorKey, string>> = {}
  if (!d.title.trim()) out.title = 'Tittel kan ikke være tom.'
  const dateStr = d.date.trim()
  if (!DATE_KEY_RE.test(dateStr)) out.date = 'Bruk formatet ÅÅÅÅ-MM-DD.'
  else {
    const parsed = new Date(`${dateStr}T12:00:00`)
    if (Number.isNaN(parsed.getTime())) out.date = 'Ugyldig dato.'
  }
  const due = d.dueTime.trim()
  if (due && !isHm24(normalizeTimeInput(due))) out.dueTime = 'Ugyldig tid (HH:mm).'
  return out
}

function validateUnifiedDraft(d: TankestromImportDraft, validPersonIds: Set<string>): string | null {
  if (d.importKind === 'event') return validateTankestromDraft(d.event, validPersonIds)
  return validateTankestromTaskDraft(d.task)
}

function buildEventDraftFromProposal(
  p: PortalEventProposal,
  validPersonIds: Set<string>,
  defaultPersonId: string
): TankestromEventDraft {
  const ev = p.event
  const pid = validPersonIds.has(ev.personId) ? ev.personId : defaultPersonId
  const transport =
    ev.metadata && typeof ev.metadata === 'object' && !Array.isArray(ev.metadata)
      ? ((ev.metadata as { transport?: { dropoffBy?: unknown; pickupBy?: unknown } }).transport ?? null)
      : null
  const dropoffBy = typeof transport?.dropoffBy === 'string' ? transport.dropoffBy : ''
  const pickupBy = typeof transport?.pickupBy === 'string' ? transport.pickupBy : ''
  return {
    title: ev.title,
    date: ev.date,
    start: ev.start,
    end: ev.end,
    personId: pid,
    location: ev.location ?? '',
    notes: ev.notes ?? '',
    reminderMinutes: typeof ev.reminderMinutes === 'number' ? ev.reminderMinutes : undefined,
    includeRecurrence: !!ev.recurrenceGroupId,
    dropoffBy,
    pickupBy,
  }
}

function buildTaskDraftFromProposal(
  p: PortalTaskProposal,
  validPersonIds: Set<string>,
  people: Person[]
): TankestromTaskDraft {
  const t = p.task
  let childPersonId =
    t.childPersonId && validPersonIds.has(t.childPersonId) ? t.childPersonId : ''
  let assignedToPersonId =
    t.assignedToPersonId && validPersonIds.has(t.assignedToPersonId) ? t.assignedToPersonId : ''
  if (!childPersonId && !assignedToPersonId) {
    childPersonId = defaultChildPersonId(people, validPersonIds)
  }
  return {
    title: t.title,
    date: t.date,
    notes: t.notes ?? '',
    dueTime: t.dueTime ?? '',
    childPersonId,
    assignedToPersonId,
    showInMonthView: !!t.showInMonthView,
  }
}

function importDraftFromProposal(
  item: PortalEventProposal | PortalTaskProposal,
  validPersonIds: Set<string>,
  defaultPersonId: string,
  people: Person[]
): TankestromImportDraft {
  if (item.kind === 'event') {
    return { importKind: 'event', event: buildEventDraftFromProposal(item, validPersonIds, defaultPersonId) }
  }
  return { importKind: 'task', task: buildTaskDraftFromProposal(item, validPersonIds, people) }
}

function buildDraftsFromItems(
  items: PortalProposalItem[],
  validPersonIds: Set<string>,
  defaultPersonId: string,
  people: Person[]
): Record<string, TankestromImportDraft> {
  const drafts: Record<string, TankestromImportDraft> = {}
  for (const item of items) {
    if (item.kind === 'school_profile') continue
    if (item.kind === 'event' || item.kind === 'task') {
      drafts[item.proposalId] = importDraftFromProposal(item, validPersonIds, defaultPersonId, people)
    }
  }
  return drafts
}

function isSchoolProfileBundle(bundle: PortalImportProposalBundle): boolean {
  return bundle.items.length > 0 && bundle.items.every((i) => i.kind === 'school_profile')
}

function cloneSchoolProfile(profile: ChildSchoolProfile): ChildSchoolProfile {
  return JSON.parse(JSON.stringify(profile)) as ChildSchoolProfile
}

function taskDraftFromEventDraft(e: TankestromEventDraft, people: Person[], validPersonIds: Set<string>): TankestromTaskDraft {
  const pid = validPersonIds.has(e.personId) ? e.personId : ''
  const person = people.find((p) => p.id === pid)
  const isChild = person?.memberKind === 'child'
  return {
    title: e.title,
    date: e.date,
    notes: e.notes,
    dueTime: isHm24(normalizeTimeInput(e.start)) ? normalizeTimeInput(e.start) : '',
    childPersonId: isChild ? pid : '',
    assignedToPersonId: !isChild && pid ? pid : '',
    showInMonthView: false,
  }
}

function eventDraftFromTaskDraft(
  t: TankestromTaskDraft,
  validPersonIds: Set<string>,
  defaultPersonId: string
): TankestromEventDraft {
  const due = t.dueTime.trim()
  const start = due && isHm24(normalizeTimeInput(due)) ? normalizeTimeInput(due) : '09:00'
  const end = hmPlusMinutes(start, 60)
  let personId = ''
  if (t.childPersonId.trim() && validPersonIds.has(t.childPersonId)) personId = t.childPersonId
  else if (t.assignedToPersonId.trim() && validPersonIds.has(t.assignedToPersonId)) {
    personId = t.assignedToPersonId
  } else personId = defaultPersonId
  return {
    title: t.title,
    date: t.date,
    start,
    end,
    personId,
    location: '',
    notes: t.notes,
    reminderMinutes: undefined,
    includeRecurrence: false,
    dropoffBy: '',
    pickupBy: '',
  }
}

export interface SchoolProfileReviewState {
  draft: ChildSchoolProfile
  meta: { confidence: number; originalSourceType: string }
  /**
   * TODO: remove school import debug after feilsøking
   * JSON av `ChildSchoolProfile` rett etter `parseChildSchoolProfile` / første `cloneSchoolProfile` (lag 2 → 3).
   * Ikke identisk med rå HTTP-body fra Tankestrøm (den lagres ikke i klienten).
   */
  parsedProfileSnapshotJson: string
}

export interface UseTankestromImportOptions {
  open: boolean
  people: Person[]
  createEvent: (date: string, input: Omit<Event, 'id'>) => Promise<void>
  createTask: (input: Omit<Task, 'id'>) => Promise<void>
  /** Kreves for lagring av timeplan-import (skoleprofil). */
  updatePerson?: (
    id: string,
    updates: Partial<Pick<Person, 'name' | 'colorTint' | 'colorAccent' | 'memberKind' | 'school' | 'work'>>
  ) => Promise<void>
}

export function useTankestromImport({
  open,
  people,
  createEvent,
  createTask,
  updatePerson,
}: UseTankestromImportOptions) {
  const [step, setStep] = useState<Step>('pick')
  const [inputMode, setInputMode] = useState<TankestromInputMode>('file')
  const [pendingFiles, setPendingFiles] = useState<TankestromPendingFile[]>([])
  const [textInput, setTextInput] = useState('')
  const [bundle, setBundle] = useState<PortalImportProposalBundle | null>(null)
  const [schoolReview, setSchoolReview] = useState<SchoolProfileReviewState | null>(null)
  const [schoolProfileChildId, setSchoolProfileChildId] = useState('')

  const proposalItems = useMemo((): PortalProposalItem[] => bundle?.items ?? [], [bundle])

  const calendarProposalItems = useMemo(
    (): PortalProposalItem[] => proposalItems.filter((i) => i.kind !== 'school_profile'),
    [proposalItems]
  )

  /** @deprecated Bruk proposalItems; beholdt for enkel bakoverkompatibilitet i imports. */
  const eventProposals = useMemo((): PortalEventProposal[] => {
    return proposalItems.filter((i): i is PortalEventProposal => i.kind === 'event')
  }, [proposalItems])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [draftByProposalId, setDraftByProposalId] = useState<Record<string, TankestromImportDraft>>({})
  const [analyzeLoading, setAnalyzeLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analyzeWarning, setAnalyzeWarning] = useState<string | null>(null)

  const validPersonIds = useMemo(() => new Set(people.map((p) => p.id)), [people])

  const canApproveSelection = useMemo(() => {
    if (schoolReview) return false
    if (selectedIds.size === 0) return false
    for (const id of selectedIds) {
      const draft = draftByProposalId[id]
      if (!draft) return false
      if (validateUnifiedDraft(draft, validPersonIds) != null) return false
    }
    return true
  }, [schoolReview, selectedIds, draftByProposalId, validPersonIds])

  const canSaveSchoolProfile = useMemo(() => {
    if (!schoolReview || !updatePerson) return false
    if (detectLessonConflicts(schoolReview.draft).length > 0) return false
    const cid = schoolProfileChildId.trim()
    if (!cid) return false
    const child = people.find((p) => p.id === cid && p.memberKind === 'child')
    return !!child
  }, [schoolReview, schoolProfileChildId, people, updatePerson])

  const reset = useCallback(() => {
    setStep('pick')
    setInputMode('file')
    setPendingFiles([])
    setTextInput('')
    setBundle(null)
    setSchoolReview(null)
    setSchoolProfileChildId('')
    setSelectedIds(new Set())
    setDraftByProposalId({})
    setAnalyzeLoading(false)
    setSaveLoading(false)
    setError(null)
    setAnalyzeWarning(null)
  }, [])

  useEffect(() => {
    if (open) reset()
  }, [open, reset])

  const addFilesFromList = useCallback((list: FileList | File[]) => {
    const arr = Array.from(list)
    if (arr.length === 0) return
    setError(null)
    setAnalyzeWarning(null)
    setPendingFiles((prev) => [
      ...prev,
      ...arr.map((file) => ({
        id: newPendingFileId(),
        file,
        status: 'ready' as const,
      })),
    ])
  }, [])

  const removePendingFile = useCallback((id: string) => {
    if (analyzeLoading) return
    setPendingFiles((prev) => prev.filter((p) => p.id !== id))
    setError(null)
  }, [analyzeLoading])

  /** Bakoverkompatibilitet: første valgte fil (samme som tidligere enkeltfil). */
  const file = pendingFiles[0]?.file ?? null

  const setInputModeSafe = useCallback((mode: TankestromInputMode) => {
    setInputMode(mode)
    setError(null)
    setAnalyzeWarning(null)
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

  const updateEventDraft = useCallback((proposalId: string, patch: Partial<TankestromEventDraft>) => {
    setDraftByProposalId((prev) => {
      const cur = prev[proposalId]
      if (!cur || cur.importKind !== 'event') return prev
      return { ...prev, [proposalId]: { importKind: 'event', event: { ...cur.event, ...patch } } }
    })
  }, [])

  const updateTaskDraft = useCallback((proposalId: string, patch: Partial<TankestromTaskDraft>) => {
    setDraftByProposalId((prev) => {
      const cur = prev[proposalId]
      if (!cur || cur.importKind !== 'task') return prev
      return { ...prev, [proposalId]: { importKind: 'task', task: { ...cur.task, ...patch } } }
    })
  }, [])

  const setSchoolProfileDraft = useCallback((next: ChildSchoolProfile) => {
    setSchoolReview((prev) => (prev ? { ...prev, draft: next } : null))
  }, [])

  const setProposalImportKind = useCallback(
    (proposalId: string, importKind: 'event' | 'task') => {
      setDraftByProposalId((prev) => {
        const cur = prev[proposalId]
        if (!cur) return prev
        const defaultPersonId = people[0]?.id ?? ''
        if (importKind === 'task') {
          if (cur.importKind === 'task') return prev
          return {
            ...prev,
            [proposalId]: { importKind: 'task', task: taskDraftFromEventDraft(cur.event, people, validPersonIds) },
          }
        }
        if (cur.importKind === 'event') return prev
        return {
          ...prev,
          [proposalId]: {
            importKind: 'event',
            event: eventDraftFromTaskDraft(cur.task, validPersonIds, defaultPersonId),
          },
        }
      })
    },
    [people, validPersonIds]
  )

  const patchPendingFile = useCallback((id: string, patch: Partial<Pick<TankestromPendingFile, 'status' | 'statusDetail'>>) => {
    setPendingFiles((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }, [])

  const runAnalyze = useCallback(async () => {
    if (inputMode === 'file') {
      if (pendingFiles.length === 0) {
        setError('Velg minst én fil.')
        return
      }
    } else if (!textInput.trim()) {
      setError('Skriv inn tekst først.')
      return
    }
    setError(null)
    setAnalyzeWarning(null)
    setAnalyzeLoading(true)
    try {
      if (inputMode === 'text') {
        const b = await analyzeTextWithTankestrom(textInput)
        setBundle(b)
        if (isSchoolProfileBundle(b)) {
          const schoolItems = b.items.filter((i): i is PortalSchoolProfileProposal => i.kind === 'school_profile')
          const primary = schoolItems[0]!
          const childIds = people.filter((p) => p.memberKind === 'child').map((p) => p.id)
          const initialChild =
            primary.suggestedPersonId && childIds.includes(primary.suggestedPersonId)
              ? primary.suggestedPersonId
              : (childIds[0] ?? '')
          setSchoolProfileChildId(initialChild)
          const parsedProfileSnapshotJson = JSON.stringify(primary.schoolProfile, null, 2)
          setSchoolReview({
            draft: cloneSchoolProfile(primary.schoolProfile),
            meta: { confidence: primary.confidence, originalSourceType: primary.originalSourceType },
            parsedProfileSnapshotJson,
          })
          if (import.meta.env.VITE_DEBUG_SCHOOL_IMPORT === 'true') {
            console.debug('[tankestrom school import] text path: parsed profile (etter API)', {
              gradeBand: primary.schoolProfile.gradeBand,
              weekdays: primary.schoolProfile.weekdays,
              snapshotJsonLength: parsedProfileSnapshotJson.length,
            })
          }
          setDraftByProposalId({})
          setSelectedIds(new Set())
          if (schoolItems.length > 1) {
            setAnalyzeWarning('Flere timeplaner i svaret — kun den første brukes.')
          }
          setStep('review')
          return
        }
        setSchoolReview(null)
        setSchoolProfileChildId('')
        const defaultPersonId = people[0]?.id ?? ''
        setDraftByProposalId(buildDraftsFromItems(b.items, validPersonIds, defaultPersonId, people))
        setSelectedIds(new Set(b.items.map((i) => i.proposalId)))
        setStep('review')
        return
      }

      const queue = [...pendingFiles]
      const bundles: PortalImportProposalBundle[] = []
      const failureLines: string[] = []

      for (const pf of queue) {
        patchPendingFile(pf.id, { status: 'analyzing', statusDetail: undefined })
        try {
          const b = await analyzeDocumentWithTankestrom(pf.file)
          if (b.items.length === 0) {
            patchPendingFile(pf.id, {
              status: 'error',
              statusDetail: 'Ingen forslag',
            })
            failureLines.push(`${pf.file.name}: ingen forslag`)
            continue
          }
          bundles.push(b)
          patchPendingFile(pf.id, { status: 'done', statusDetail: undefined })
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Analyse feilet'
          patchPendingFile(pf.id, { status: 'error', statusDetail: msg })
          failureLines.push(`${pf.file.name}: ${msg}`)
        }
      }

      if (bundles.length === 0) {
        setError(
          failureLines.length > 0
            ? failureLines.join('\n')
            : 'Ingen filer ga forslag. Prøv andre filer eller tekstmodus.'
        )
        return
      }

      const merged = mergePortalImportProposalBundles(bundles)
      if (merged.items.length === 0) {
        setError('Ingen forslag etter sammenslåing.')
        return
      }

      setBundle(merged)
      if (isSchoolProfileBundle(merged)) {
        const schoolItems = merged.items.filter((i): i is PortalSchoolProfileProposal => i.kind === 'school_profile')
        const primary = schoolItems[0]!
        const childIds = people.filter((p) => p.memberKind === 'child').map((p) => p.id)
        const initialChild =
          primary.suggestedPersonId && childIds.includes(primary.suggestedPersonId)
            ? primary.suggestedPersonId
            : (childIds[0] ?? '')
        setSchoolProfileChildId(initialChild)
        const parsedProfileSnapshotJson = JSON.stringify(primary.schoolProfile, null, 2)
        setSchoolReview({
          draft: cloneSchoolProfile(primary.schoolProfile),
          meta: { confidence: primary.confidence, originalSourceType: primary.originalSourceType },
          parsedProfileSnapshotJson,
        })
        if (import.meta.env.VITE_DEBUG_SCHOOL_IMPORT === 'true') {
          console.debug('[tankestrom school import] file path: parsed profile (etter API)', {
            gradeBand: primary.schoolProfile.gradeBand,
            weekdays: primary.schoolProfile.weekdays,
            snapshotJsonLength: parsedProfileSnapshotJson.length,
          })
        }
        setDraftByProposalId({})
        setSelectedIds(new Set())
        const extra =
          schoolItems.length > 1 ? '\nFlere timeplaner i sammenslått svar — kun den første brukes.' : ''
        if (failureLines.length > 0) {
          setAnalyzeWarning(
            `${failureLines.length} fil(er) ble hoppet over:\n${failureLines.join('\n')}${extra}`
          )
        } else if (extra) {
          setAnalyzeWarning(extra.trim())
        }
        setStep('review')
        return
      }

      setSchoolReview(null)
      setSchoolProfileChildId('')
      const defaultPersonId = people[0]?.id ?? ''
      setDraftByProposalId(buildDraftsFromItems(merged.items, validPersonIds, defaultPersonId, people))
      setSelectedIds(new Set(merged.items.map((i) => i.proposalId)))
      setStep('review')

      if (failureLines.length > 0) {
        setAnalyzeWarning(
          `${failureLines.length} fil(er) ble hoppet over:\n${failureLines.join('\n')}`
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analyse feilet.')
    } finally {
      setAnalyzeLoading(false)
    }
  }, [inputMode, patchPendingFile, pendingFiles, people, textInput, validPersonIds])

  const saveSchoolProfile = useCallback(async (): Promise<boolean> => {
    if (!schoolReview || !updatePerson) {
      setError('Lagring av skoleprofil er ikke tilgjengelig.')
      return false
    }
    const cid = schoolProfileChildId.trim()
    const child = people.find((p) => p.id === cid && p.memberKind === 'child')
    if (!child) {
      setError('Velg hvilket barn den faste timeplanen skal lagres til.')
      return false
    }
    setError(null)
    setSaveLoading(true)
    try {
      await updatePerson(cid, { school: schoolReview.draft })
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikke lagre skoleprofil.')
      return false
    } finally {
      setSaveLoading(false)
    }
  }, [schoolReview, schoolProfileChildId, people, updatePerson])

  const approveSelected = useCallback(async (): Promise<boolean> => {
    if (schoolReview) return false
    if (!bundle || proposalItems.length === 0) return false
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
      const err = validateUnifiedDraft(draft, validPersonIds)
      if (err) {
        setError(err)
        return false
      }
    }

    setError(null)
    setSaveLoading(true)
    let failed = 0
    try {
      for (const id of ids) {
        const item = bundle.items.find((p) => p.proposalId === id)
        const unified = draftByProposalId[id]
        if (!item || !unified) continue

        if (unified.importKind === 'task') {
          const t = unified.task
          const taskInput: Omit<Task, 'id'> = {
            title: t.title.trim(),
            date: t.date.trim(),
            notes: t.notes.trim() ? t.notes.trim() : undefined,
            dueTime:
              t.dueTime.trim() && isHm24(normalizeTimeInput(t.dueTime))
                ? normalizeTimeInput(t.dueTime)
                : undefined,
            childPersonId: t.childPersonId.trim() || undefined,
            assignedToPersonId: t.assignedToPersonId.trim() || undefined,
            showInMonthView: t.showInMonthView || undefined,
          }
          try {
            await createTask(taskInput)
          } catch {
            failed += 1
          }
          continue
        }

        const raw = unified.event
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

        const integration = {
          proposalId: item.proposalId,
          importRunId: bundle.provenance.importRunId,
          confidence: item.confidence,
          originalSourceType: item.originalSourceType,
          externalRef: item.externalRef,
          sourceSystem: bundle.provenance.sourceSystem,
        }

        let baseMeta: Record<string, unknown> = {}
        let recurrenceGroupId: string | undefined
        if (item.kind === 'event') {
          const ev = item.event
          recurrenceGroupId = draft.includeRecurrence ? ev.recurrenceGroupId : undefined
          baseMeta =
            ev.metadata && typeof ev.metadata === 'object' && !Array.isArray(ev.metadata)
              ? { ...ev.metadata }
              : {}
        }

        const metadata: Record<string, unknown> = {
          ...baseMeta,
          sourceId: item.sourceId,
          integration,
        }
        const transportMeta: Record<string, unknown> = {}
        if (draft.dropoffBy.trim()) transportMeta.dropoffBy = draft.dropoffBy.trim()
        if (draft.pickupBy.trim()) transportMeta.pickupBy = draft.pickupBy.trim()
        if (Object.keys(transportMeta).length > 0) {
          metadata.transport = {
            ...(baseMeta.transport && typeof baseMeta.transport === 'object' && !Array.isArray(baseMeta.transport)
              ? (baseMeta.transport as Record<string, unknown>)
              : {}),
            ...transportMeta,
          }
        } else if (baseMeta.transport && typeof baseMeta.transport === 'object') {
          const prev = { ...(baseMeta.transport as Record<string, unknown>) }
          delete prev.dropoffBy
          delete prev.pickupBy
          if (Object.keys(prev).length > 0) metadata.transport = prev
          else delete metadata.transport
        }
        const input: Omit<Event, 'id'> = {
          personId: draft.personId,
          title: draft.title,
          start: draft.start,
          end: draft.end,
          notes: draft.notes.length > 0 ? draft.notes : undefined,
          location: draft.location.length > 0 ? draft.location : undefined,
          reminderMinutes: draft.reminderMinutes,
          recurrenceGroupId,
          metadata,
        }
        try {
          await createEvent(draft.date, input)
        } catch {
          failed += 1
        }
      }
      if (failed > 0) {
        setError(`${failed} av ${ids.length} forslag kunne ikke lagres. Sjekk nettverk og prøv igjen.`)
        return false
      }
      return true
    } finally {
      setSaveLoading(false)
    }
  }, [bundle, proposalItems, selectedIds, draftByProposalId, validPersonIds, createEvent, createTask, schoolReview])

  return {
    step,
    inputMode,
    setInputMode: setInputModeSafe,
    file,
    pendingFiles,
    addFilesFromList,
    removePendingFile,
    textInput,
    setTextInput: setTextInputSafe,
    bundle,
    proposalItems,
    calendarProposalItems,
    eventProposals,
    selectedIds,
    toggleProposal,
    draftByProposalId,
    updateEventDraft,
    updateTaskDraft,
    setProposalImportKind,
    analyzeLoading,
    saveLoading,
    error,
    analyzeWarning,
    runAnalyze,
    approveSelected,
    saveSchoolProfile,
    people,
    canApproveSelection,
    canSaveSchoolProfile,
    schoolReview,
    schoolProfileChildId,
    setSchoolProfileChildId,
    setSchoolProfileDraft,
  }
}
