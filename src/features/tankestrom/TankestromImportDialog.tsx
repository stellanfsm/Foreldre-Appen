import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import type { PortalEventProposal, PortalProposalItem } from './types'
import type {
  ChildSchoolDayPlan,
  ChildSchoolProfile,
  Person,
  SchoolContext,
  SchoolLessonSlot,
  Task,
  WeekdayMonFri,
} from '../../types'
import type { UseEventControllerReturn } from '../calendar/hooks/useEventController'
import {
  useTankestromImport,
  getTankestromDraftFieldErrors,
  getTankestromTaskFieldErrors,
  type TankestromPendingFile,
} from './useTankestromImport'
import { cardSection, typSectionCap } from '../../lib/ui'
import { Button } from '../../components/ui/Button'
import { Input, Textarea } from '../../components/ui/Input'
import { SchoolProfileFields } from '../../components/SchoolProfileFields'
import { logEvent } from '../../lib/appLogger'
import { formatTimeRange } from '../../lib/time'
import {
  applyLessonConflictChoice,
  detectLessonConflicts,
  lessonConflictGroupId,
  lessonDisplayLabel,
} from '../../lib/schoolProfileConflicts'
import {
  schoolContextSubjectLabel,
  schoolItemTypeChipClass,
  schoolItemTypeLabel,
} from '../../lib/schoolContext'

/** Les `metadata.schoolContext` fra et event-forslag hvis det finnes. */
function schoolContextFromEventProposal(p: PortalEventProposal): SchoolContext | null {
  const meta = p.event.metadata
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
  const ctx = (meta as { schoolContext?: unknown }).schoolContext
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return null
  const candidate = ctx as Partial<SchoolContext>
  if (typeof candidate.itemType !== 'string') return null
  return candidate as SchoolContext
}

function confidenceBadgeStyle(confidence: number): { label: string; className: string } {
  const pct = Math.round(confidence * 100)
  if (confidence >= 0.85) {
    return {
      label: `${pct}% sikker`,
      className: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    }
  }
  if (confidence >= 0.55) {
    return {
      label: `${pct}% middels`,
      className: 'border-amber-200 bg-amber-50 text-amber-950',
    }
  }
  return {
    label: `${pct}% – bør sjekkes`,
    className: 'border-zinc-300 bg-zinc-100 text-zinc-800',
  }
}

/** Mandag–fredag (tallnøkkel matcher `WeekdayMonFri`). */
const WD_LABEL_NB: Record<number, string> = {
  0: 'Mandag',
  1: 'Tirsdag',
  2: 'Onsdag',
  3: 'Torsdag',
  4: 'Fredag',
}

const DEBUG_SCHOOL_IMPORT_PANEL =
  import.meta.env.DEV || import.meta.env.VITE_DEBUG_SCHOOL_IMPORT === 'true'

function describeSchoolDayPlanShort(plan: ChildSchoolDayPlan): string {
  if (plan.useSimpleDay) {
    return `enkel dag ${plan.schoolStart ?? '?'}–${plan.schoolEnd ?? '?'}`
  }
  return `${(plan.lessons ?? []).length} timer`
}

function formatLessonSlotOneLine(L: SchoolLessonSlot): string {
  const lab = L.customLabel ? ` «${L.customLabel}»` : ''
  return `${L.subjectKey}${lab} · ${L.start}–${L.end}`
}

/** Kompakt per-dag-oppsummering av `ChildSchoolProfile` (parsed/draft). */
function formatSchoolImportWeekdayDebug(profile: ChildSchoolProfile): string {
  const lines: string[] = []
  for (let wd = 0; wd <= 4; wd++) {
    const plan = profile.weekdays[wd as WeekdayMonFri]
    const name = WD_LABEL_NB[wd] ?? `Dag ${wd}`
    if (!plan) {
      lines.push(`${name}: (ingen dagplan i modellen)`)
      continue
    }
    if (plan.useSimpleDay) {
      const ss = plan.schoolStart ?? '(mangler schoolStart)'
      const se = plan.schoolEnd ?? '(mangler schoolEnd)'
      lines.push(`${name}: Enkel dag · modell: ${ss}–${se}`)
    } else {
      const lessons = plan.lessons ?? []
      lines.push(`${name}: ${lessons.length} timer (Timer-modus)`)
      lessons.forEach((L, i) => {
        const lab = L.customLabel ? ` «${L.customLabel}»` : ''
        lines.push(`  ${i + 1}. ${L.subjectKey}${lab} · ${L.start}–${L.end}`)
      })
    }
  }
  return lines.join('\n')
}

/**
 * Menneskelesbar diff: parsed snapshot (etter API) vs gjeldende draft.
 * Retning: «snapshot → draft» der det er avvik.
 */
function formatSchoolImportSnapshotDraftDiff(
  snapshot: ChildSchoolProfile | null,
  draft: ChildSchoolProfile
): string {
  if (!snapshot) return '(Ingen gyldig snapshot — kan ikke sammenligne.)'
  const lines: string[] = []
  for (let wd = 0; wd <= 4; wd++) {
    const name = WD_LABEL_NB[wd] ?? `Dag ${wd}`
    const sPlan = snapshot.weekdays[wd as WeekdayMonFri]
    const dPlan = draft.weekdays[wd as WeekdayMonFri]
    if (!sPlan && !dPlan) {
      lines.push(`${name}: ingen dagplan (snapshot eller draft)`)
      continue
    }
    if (!sPlan && dPlan) {
      lines.push(`${name}: KUN I DRAFT · ${describeSchoolDayPlanShort(dPlan)}`)
      if (!dPlan.useSimpleDay) {
        ;(dPlan.lessons ?? []).forEach((L, i) => {
          lines.push(`    draft time ${i + 1}: ${formatLessonSlotOneLine(L)}`)
        })
      }
      continue
    }
    if (sPlan && !dPlan) {
      lines.push(`${name}: KUN I SNAPSHOT · ${describeSchoolDayPlanShort(sPlan)}`)
      if (!sPlan.useSimpleDay) {
        ;(sPlan.lessons ?? []).forEach((L, i) => {
          lines.push(`    snapshot time ${i + 1}: ${formatLessonSlotOneLine(L)}`)
        })
      }
      continue
    }
    const s = sPlan!
    const d = dPlan!
    if (JSON.stringify(s) === JSON.stringify(d)) {
      lines.push(`${name}: lik`)
      continue
    }
    lines.push(`${name}: AVVIK (snapshot → draft)`)
    if (s.useSimpleDay !== d.useSimpleDay) {
      lines.push(
        `  modus: ${s.useSimpleDay ? 'enkel dag' : 'timer'} → ${d.useSimpleDay ? 'enkel dag' : 'timer'}`
      )
    }
    if (s.useSimpleDay && d.useSimpleDay) {
      if (s.schoolStart !== d.schoolStart) {
        lines.push(`  schoolStart: «${s.schoolStart ?? '(mangler)'}» → «${d.schoolStart ?? '(mangler)'}»`)
      }
      if (s.schoolEnd !== d.schoolEnd) {
        lines.push(`  schoolEnd: «${s.schoolEnd ?? '(mangler)'}» → «${d.schoolEnd ?? '(mangler)'}»`)
      }
    }
    if (!s.useSimpleDay && !d.useSimpleDay) {
      const sl = s.lessons ?? []
      const dl = d.lessons ?? []
      if (sl.length !== dl.length) {
        lines.push(`  antall timer: ${sl.length} → ${dl.length}`)
      }
      const max = Math.max(sl.length, dl.length)
      for (let i = 0; i < max; i++) {
        const a = sl[i]
        const b = dl[i]
        if (!a) {
          lines.push(`  time ${i + 1}: kun i draft: ${b ? formatLessonSlotOneLine(b) : '?'}`)
          continue
        }
        if (!b) {
          lines.push(`  time ${i + 1}: kun i snapshot: ${formatLessonSlotOneLine(a)}`)
          continue
        }
        const bits: string[] = []
        if (a.subjectKey !== b.subjectKey) {
          bits.push(`fag «${a.subjectKey}» → «${b.subjectKey}»`)
        }
        const ac = a.customLabel ?? ''
        const bc = b.customLabel ?? ''
        if (ac !== bc) {
          bits.push(`etikett «${ac || '(ingen)'}» → «${bc || '(ingen)'}»`)
        }
        if (a.start !== b.start) bits.push(`start ${a.start} → ${b.start}`)
        if (a.end !== b.end) bits.push(`slutt ${a.end} → ${b.end}`)
        if (bits.length > 0) lines.push(`  time ${i + 1}: ${bits.join('; ')}`)
      }
    }
  }
  if (snapshot.gradeBand !== draft.gradeBand) {
    lines.push(`Trinn (gradeBand): snapshot «${snapshot.gradeBand}» → draft «${draft.gradeBand}»`)
  }
  return lines.join('\n')
}

function formatNorwegianDateLabel(isoDate: string): string {
  const t = isoDate.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return isoDate
  try {
    return new Date(`${t}T12:00:00`).toLocaleDateString('nb-NO', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return isoDate
  }
}

/** Kompakt kildegrunnlag fra API (original), ikke nødvendigvis lik redigert notat. */
function getSourceContextText(item: PortalEventProposal): string | null {
  const meta = item.event.metadata
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    const rec = meta as Record<string, unknown>
    for (const key of ['sourceExcerpt', 'aiRationale', 'rationale', 'sourceText'] as const) {
      const v = rec[key]
      if (typeof v === 'string' && v.trim()) {
        const s = v.trim()
        return s.length > 200 ? `${s.slice(0, 197)}…` : s
      }
    }
  }
  const ref = item.externalRef?.trim()
  if (ref) return ref.length > 120 ? `Referanse: ${ref.slice(0, 117)}…` : `Referanse: ${ref}`
  return null
}

function getSourceContextTextForItem(item: PortalProposalItem): string | null {
  if (item.kind === 'event') return getSourceContextText(item)
  const ref = item.externalRef?.trim()
  if (ref) return ref.length > 120 ? `Referanse: ${ref.slice(0, 117)}…` : `Referanse: ${ref}`
  return null
}

const META_SOURCE_KEYS = ['sourceExcerpt', 'aiRationale', 'rationale', 'sourceText'] as const

function metaFieldHeading(key: (typeof META_SOURCE_KEYS)[number]): string {
  if (key === 'sourceExcerpt') return 'Utdrag fra kilde'
  if (key === 'aiRationale') return 'AI-begrunnelse'
  if (key === 'rationale') return 'Begrunnelse'
  return 'Kildetekst'
}

/** Fullt sammensatt kildegrunnlag for utvidet visning (ikke avkortet). */
function buildFullSourceContextDocument(item: PortalEventProposal): string | null {
  const blocks: string[] = []

  const meta = item.event.metadata
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    const rec = meta as Record<string, unknown>
    for (const key of META_SOURCE_KEYS) {
      const v = rec[key]
      if (typeof v !== 'string' || !v.trim()) continue
      const t = v.trim()
      blocks.push(`${metaFieldHeading(key)}\n${t}`)
    }
  }

  const ref = item.externalRef?.trim()
  if (ref) blocks.push(`Referanse\n${ref}`)

  if (blocks.length === 0) return null
  return blocks.join('\n\n────────\n\n')
}

function buildFullSourceContextDocumentForItem(item: PortalProposalItem): string | null {
  if (item.kind === 'event') return buildFullSourceContextDocument(item)
  const ref = item.externalRef?.trim()
  if (ref) return `Referanse\n${ref}`
  return null
}

function shouldOfferSourceExpand(full: string | null, preview: string | null): boolean {
  if (!full || !full.trim()) return false
  if (!preview || full.length > preview.length + 40) return true
  return full.includes('\n\n────────\n\n')
}

const TANKESTROM_FILE_ACCEPT =
  'image/*,.pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function pendingFileStatusLabel(p: TankestromPendingFile): string {
  switch (p.status) {
    case 'ready':
      return 'Klar'
    case 'analyzing':
      return 'Behandler…'
    case 'done':
      return 'Ferdig'
    case 'error':
      return p.statusDetail ? `Feilet: ${p.statusDetail}` : 'Feilet'
    default:
      return ''
  }
}

function pendingFileStatusClass(p: TankestromPendingFile): string {
  switch (p.status) {
    case 'ready':
      return 'border-zinc-200 bg-zinc-50 text-zinc-600'
    case 'analyzing':
      return 'border-brandTeal/40 bg-brandSky/30 text-brandNavy'
    case 'done':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900'
    case 'error':
      return 'border-rose-200 bg-rose-50 text-rose-900'
    default:
      return 'border-zinc-200 bg-zinc-50 text-zinc-600'
  }
}

function reminderLabel(reminderMinutes: number | undefined): string {
  if (reminderMinutes == null) return 'Ingen'
  if (reminderMinutes < 60) return `${reminderMinutes} min før`
  if (reminderMinutes % 60 === 0) return `${reminderMinutes / 60} t før`
  return `${reminderMinutes} min før`
}

export interface TankestromImportDialogProps {
  open: boolean
  onClose: () => void
  people: Person[]
  createEvent: UseEventControllerReturn['createEvent']
  createTask: (input: Omit<Task, 'id'>) => Promise<void>
  updatePerson?: (
    id: string,
    updates: Partial<Pick<Person, 'name' | 'colorTint' | 'colorAccent' | 'memberKind' | 'school' | 'work'>>
  ) => Promise<void>
}

export function TankestromImportDialog({
  open,
  onClose,
  people,
  createEvent,
  createTask,
  updatePerson,
}: TankestromImportDialogProps) {
  const {
    step,
    inputMode,
    setInputMode,
    pendingFiles,
    addFilesFromList,
    removePendingFile,
    textInput,
    setTextInput,
    analyzeWarning,
    calendarProposalItems,
    selectedIds,
    toggleProposal,
    draftByProposalId,
    updateEventDraft,
    updateTaskDraft,
    setProposalImportKind,
    analyzeLoading,
    saveLoading,
    error,
    runAnalyze,
    approveSelected,
    saveSchoolProfile,
    canApproveSelection,
    canSaveSchoolProfile,
    schoolReview,
    schoolProfileChildId,
    setSchoolProfileChildId,
    setSchoolProfileDraft,
  } = useTankestromImport({ open, people, createEvent, createTask, updatePerson })

  const validPersonIds = useMemo(() => new Set(people.map((p) => p.id)), [people])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileDropActive, setFileDropActive] = useState(false)

  const analyzedSourceSummary = useMemo(() => {
    if (inputMode !== 'file') return null
    const ok = pendingFiles.filter((p) => p.status === 'done')
    if (ok.length === 0) return null
    if (ok.length === 1) return ok[0]!.file.name
    return `${ok.length} filer`
  }, [inputMode, pendingFiles])

  const [expandedSourceIds, setExpandedSourceIds] = useState<Set<string>>(() => new Set())
  const [expandedDetailIds, setExpandedDetailIds] = useState<Set<string>>(() => new Set())
  const toggleSourceExpanded = useCallback((proposalId: string) => {
    setExpandedSourceIds((prev) => {
      const next = new Set(prev)
      if (next.has(proposalId)) next.delete(proposalId)
      else next.add(proposalId)
      return next
    })
  }, [])
  const toggleDetailsExpanded = useCallback((proposalId: string) => {
    setExpandedDetailIds((prev) => {
      const next = new Set(prev)
      if (next.has(proposalId)) next.delete(proposalId)
      else next.add(proposalId)
      return next
    })
  }, [])

  const reviewSelectionStats = useMemo(() => {
    const total = calendarProposalItems.length
    const selected = selectedIds.size
    let withErrors = 0
    let ready = 0
    for (const id of selectedIds) {
      const d = draftByProposalId[id]
      if (!d) {
        withErrors += 1
        continue
      }
      const fe =
        d.importKind === 'event'
          ? getTankestromDraftFieldErrors(d.event, validPersonIds)
          : getTankestromTaskFieldErrors(d.task)
      if (Object.keys(fe).length > 0) withErrors += 1
      else ready += 1
    }
    return { total, selected, withErrors, ready }
  }, [calendarProposalItems.length, selectedIds, draftByProposalId, validPersonIds])

  useEffect(() => {
    if (!open) {
      setExpandedSourceIds(new Set())
      setExpandedDetailIds(new Set())
    }
  }, [open])

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  const handleApprove = useCallback(async () => {
    const ok = await approveSelected()
    if (ok) {
      logEvent('tankestrom_import_completed', { count: selectedIds.size })
      onClose()
    }
  }, [approveSelected, onClose, selectedIds.size])

  const handleSaveSchoolProfile = useCallback(async () => {
    const ok = await saveSchoolProfile()
    if (ok) {
      logEvent('tankestrom_school_profile_saved', { childId: schoolProfileChildId })
      onClose()
    }
  }, [saveSchoolProfile, onClose, schoolProfileChildId])

  const childrenList = useMemo(() => people.filter((p) => p.memberKind === 'child'), [people])

  const schoolLessonConflicts = useMemo(
    () => (schoolReview ? detectLessonConflicts(schoolReview.draft) : []),
    [schoolReview?.draft]
  )

  const schoolImportDebugPanel = useMemo(() => {
    if (!schoolReview || !DEBUG_SCHOOL_IMPORT_PANEL) return null
    const snapshot = schoolReview.parsedProfileSnapshotJson
    const draftJson = JSON.stringify(schoolReview.draft, null, 2)
    const draftMatchesParsedSnapshot = draftJson === snapshot
    let snapshotProfile: ChildSchoolProfile | null = null
    try {
      snapshotProfile = JSON.parse(snapshot) as ChildSchoolProfile
    } catch {
      snapshotProfile = null
    }
    const draftLines = formatSchoolImportWeekdayDebug(schoolReview.draft)
    const snapshotLines = snapshotProfile
      ? formatSchoolImportWeekdayDebug(snapshotProfile)
      : '(ugyldig snapshot-JSON)'
    const summariesMatch = draftLines === snapshotLines
    const snapshotDraftDiff = formatSchoolImportSnapshotDraftDiff(snapshotProfile, schoolReview.draft)
    return {
      snapshot,
      draftJson,
      draftMatchesParsedSnapshot,
      draftLines,
      snapshotLines,
      summariesMatch,
      snapshotDraftDiff,
    }
  }, [schoolReview])

  if (!open) return null

  const hasPeople = people.length > 0

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 px-2 pb-2 pt-12 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tankestrom-import-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div
        className="flex max-h-[min(92vh,780px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 flex-col border-b border-zinc-100">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <h2 id="tankestrom-import-title" className="text-[17px] font-semibold text-zinc-900">
              {step === 'review' && schoolReview ? 'Timeplan fra Tankestrøm' : 'Importer fra Tankestrøm'}
            </h2>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
              aria-label="Lukk"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {step === 'review' ? (
            <>
              <p
                className="truncate px-4 pb-2.5 text-[11px] leading-snug text-zinc-500"
                title={
                  inputMode === 'file'
                    ? pendingFiles
                        .filter((p) => p.status === 'done')
                        .map((p) => p.file.name)
                        .join(', ') || undefined
                    : undefined
                }
              >
                <span className="font-medium text-zinc-400">Analysert kilde:</span>{' '}
                <span className="font-semibold text-zinc-700">
                  {inputMode === 'file' ? analyzedSourceSummary ?? 'Filer' : 'Limt inn tekst'}
                </span>
              </p>
              {DEBUG_SCHOOL_IMPORT_PANEL && schoolReview ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="mx-4 mb-2 flex items-center justify-center gap-2 rounded-lg border-2 border-violet-500 bg-violet-100 px-2 py-2 shadow-sm"
                >
                  <span className="rounded bg-violet-600 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                    Debug
                  </span>
                  <span className="text-center text-[11px] font-semibold leading-tight text-violet-950">
                    Skole-import-feilsøk er på — du ser parsed snapshot vs draft under
                  </span>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4">
          {!hasPeople ? (
            <p className="text-[13px] text-zinc-600">
              Legg til familiemedlemmer under Innstillinger før du kan knytte hendelser til en person.
            </p>
          ) : step === 'pick' ? (
            <div className="space-y-4">
              <p className="text-[13px] leading-relaxed text-zinc-600">
                Velg inputmodus og analyser innholdet. Du kan få{' '}
                <span className="font-medium text-zinc-800">fast timeplan</span> (lagres som skoleprofil), eller forslag
                som <span className="font-medium text-zinc-800">hendelser</span> og/eller{' '}
                <span className="font-medium text-zinc-800">gjøremål</span> — bytt type før import om nødvendig.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setInputMode('file')}
                  className={`rounded-xl border px-3 py-2 text-[13px] font-medium transition ${
                    inputMode === 'file'
                      ? 'border-brandTeal/50 bg-brandSky/35 text-brandNavy'
                      : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  Fil
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('text')}
                  className={`rounded-xl border px-3 py-2 text-[13px] font-medium transition ${
                    inputMode === 'text'
                      ? 'border-brandTeal/50 bg-brandSky/35 text-brandNavy'
                      : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  Tekst
                </button>
              </div>

              {inputMode === 'file' ? (
                <div className={`${cardSection} p-3`}>
                  <p className={typSectionCap}>Filer</p>
                  <p className="mt-1 text-[12px] leading-snug text-zinc-500">
                    Velg flere filer på én gang, eller slipp dem i feltet nedenfor.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={TANKESTROM_FILE_ACCEPT}
                    className="sr-only"
                    aria-label="Velg filer til analyse"
                    onChange={(e) => {
                      const list = e.target.files
                      if (list && list.length > 0) addFilesFromList(list)
                      e.target.value = ''
                    }}
                  />
                  <div
                    role="button"
                    tabIndex={0}
                    className={`mt-3 flex min-h-[100px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-3 py-4 text-center transition sm:min-h-[112px] ${
                      fileDropActive
                        ? 'border-brandTeal bg-brandSky/25 text-brandNavy'
                        : 'border-zinc-200 bg-zinc-50/80 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50'
                    }`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        fileInputRef.current?.click()
                      }
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    onDragEnter={(e: DragEvent) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setFileDropActive(true)
                    }}
                    onDragOver={(e: DragEvent) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setFileDropActive(true)
                    }}
                    onDragLeave={(e: DragEvent) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileDropActive(false)
                    }}
                    onDrop={(e: DragEvent) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setFileDropActive(false)
                      const list = e.dataTransfer.files
                      if (list && list.length > 0) addFilesFromList(list)
                    }}
                  >
                    <svg
                      className="pointer-events-none mb-2 h-8 w-8 text-zinc-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                      />
                    </svg>
                    <p className="pointer-events-none text-[13px] font-medium text-zinc-800">
                      Slipp filer her eller trykk for å velge
                    </p>
                    <p className="pointer-events-none mt-1 text-[11px] text-zinc-500">
                      PDF, bilder og Word-dokumenter
                    </p>
                  </div>

                  {pendingFiles.length > 0 ? (
                    <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto overscroll-y-contain" aria-label="Valgte filer">
                      {pendingFiles.map((p) => (
                        <li
                          key={p.id}
                          className={`flex items-start gap-2 rounded-xl border px-2.5 py-2 text-left text-[12px] ${pendingFileStatusClass(p)}`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium" title={p.file.name}>
                              {p.file.name}
                            </p>
                            <p className="mt-0.5 text-[11px] opacity-90">{pendingFileStatusLabel(p)}</p>
                          </div>
                          <button
                            type="button"
                            className="shrink-0 rounded-lg p-1.5 text-current opacity-70 hover:bg-black/5 hover:opacity-100 disabled:pointer-events-none disabled:opacity-40"
                            aria-label={`Fjern ${p.file.name}`}
                            disabled={analyzeLoading}
                            onClick={(e) => {
                              e.stopPropagation()
                              removePendingFile(p.id)
                            }}
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : (
                <div className={`${cardSection} p-3`}>
                  <p className={typSectionCap}>Tekst</p>
                  <Textarea
                    id="ts-import-text"
                    rows={6}
                    label="Lim inn tekst som skal analyseres"
                    placeholder="F.eks. ukeplan, e-post eller aktivitetsbeskrivelse"
                    value={textInput}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setTextInput(e.target.value)}
                  />
                </div>
              )}
              {error && <p className="text-[13px] text-rose-600">{error}</p>}
            </div>
          ) : schoolReview ? (
            <div className="space-y-4">
              {analyzeWarning ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-950 whitespace-pre-wrap">
                  {analyzeWarning}
                </p>
              ) : null}
              <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-3">
                <p className="text-[12px] font-semibold text-rose-900">Erstatter hele skoleprofilen</p>
                <p className="mt-1 text-[11px] leading-snug text-rose-800/95">
                  Lagring overskriver barnets eksisterende faste timeplan (mandag–fredag) med det du ser under. Importerte
                  A-planer og hendelser påvirkes ikke.
                </p>
              </div>
              <div>
                <label htmlFor="ts-school-child" className="text-[12px] font-medium text-zinc-700">
                  Velg barn
                </label>
                {childrenList.length === 0 ? (
                  <p className="mt-1 text-[12px] text-amber-800">
                    Legg til minst ett barn under Innstillinger for å lagre timeplanen.
                  </p>
                ) : (
                  <select
                    id="ts-school-child"
                    className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[14px] text-zinc-900"
                    value={schoolProfileChildId}
                    onChange={(e) => setSchoolProfileChildId(e.target.value)}
                  >
                    {childrenList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 px-2 py-2">
                <p className={typSectionCap}>Timeplan</p>
                <p className="mb-2 flex flex-wrap items-center gap-2 px-1 text-[11px] text-zinc-500">
                  <span className="font-medium text-zinc-600">{schoolReview.meta.originalSourceType}</span>
                  {(() => {
                    const badge = confidenceBadgeStyle(schoolReview.meta.confidence)
                    return (
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    )
                  })()}
                </p>
                {schoolLessonConflicts.length > 0 ? (
                  <div className="mb-3 rounded-xl border border-amber-300/80 bg-amber-50 px-3 py-3">
                    <p className="text-[12px] font-semibold text-amber-950">Velg spor (parallelle timer)</p>
                    <p className="mt-1 text-[11px] leading-snug text-amber-900/95">
                      Timeplanen viser flere mulige fag i samme tidsrom (for eksempel D1/D2 eller ulike språk). Dette er
                      vanligvis ulike grupper — barnet har bare ett av dem. Velg det som gjelder for dette barnet. Vi
                      lagrer ikke flere overlappende timer for samme spor.
                    </p>
                    <ul className="mt-3 space-y-3">
                      {schoolLessonConflicts.map((group) => (
                        <li
                          key={lessonConflictGroupId(group)}
                          className="rounded-lg border border-amber-200/90 bg-white/90 px-3 py-2.5 shadow-sm"
                        >
                          <p className="text-[12px] font-medium text-zinc-900">
                            {WD_LABEL_NB[group.weekday]}{' '}
                            <span className="tabular-nums text-zinc-600">
                              {formatTimeRange(group.displayStart, group.displayEnd)}
                            </span>
                          </p>
                          <fieldset className="mt-2 space-y-2 border-0 p-0">
                            <legend className="sr-only">Velg fag for dette tidsrommet</legend>
                            {group.candidates.map((slot, idx) => {
                              const label = lessonDisplayLabel(schoolReview.draft.gradeBand, slot)
                              const fieldId = `${lessonConflictGroupId(group)}-${idx}`
                              return (
                                <label
                                  key={fieldId}
                                  htmlFor={fieldId}
                                  className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-zinc-200/80 bg-zinc-50/80 px-2.5 py-2 transition hover:border-amber-300/60"
                                >
                                  <input
                                    id={fieldId}
                                    type="radio"
                                    name={lessonConflictGroupId(group)}
                                    className="mt-0.5 h-4 w-4 shrink-0 border-zinc-300 text-brandTeal focus:ring-brandTeal/30"
                                    onChange={() =>
                                      setSchoolProfileDraft(
                                        applyLessonConflictChoice(schoolReview.draft, group, idx)
                                      )
                                    }
                                  />
                                  <span className="text-[13px] leading-snug text-zinc-800">{label}</span>
                                  <span className="ml-auto shrink-0 text-[11px] tabular-nums text-zinc-500">
                                    {slot.start}–{slot.end}
                                  </span>
                                </label>
                              )
                            })}
                          </fieldset>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {schoolImportDebugPanel ? (
                  <details className="mb-3 rounded-lg border-2 border-violet-400 bg-violet-50/70 px-3 py-2 shadow-sm open:shadow-md">
                    <summary className="cursor-pointer select-none text-[12px] font-semibold text-violet-950">
                      <span className="mr-2 inline-flex rounded bg-violet-600 px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-wide text-white">
                        Debug
                      </span>
                      Feilsøk timeplan-import (parsed snapshot vs draft)
                    </summary>
                    <div className="mt-2 space-y-2 text-[11px] leading-snug text-zinc-800">
                      <p>
                        Rå HTTP-body fra Tankestrøm lagres ikke i klienten. Under er{' '}
                        <span className="font-medium">lag 2</span> (tolket profil rett etter parse, som JSON) og{' '}
                        <span className="font-medium">draft</span> (det skjemaet får — ved åpning klonet fra lag 2).
                      </p>
                      <p className="rounded-md border border-zinc-200/90 bg-white/90 px-2 py-1.5 text-[10px] text-zinc-600">
                        «Neste time foreslås fra forrige sluttid. Standard varighet: 60 min.» er statisk hjelpetekst i
                        «Timer»-modus. Den kjører ikke ved import og oppretter ikke timer; den beskriver redigering når du
                        endrer en sluttid.
                      </p>
                      <p className="tabular-nums">
                        Draft JSON identisk med parsed snapshot:{' '}
                        <span className="font-mono font-semibold">
                          {schoolImportDebugPanel.draftMatchesParsedSnapshot ? 'ja' : 'nei'}
                        </span>
                        {!schoolImportDebugPanel.summariesMatch ? (
                          <span className="text-zinc-500"> · Per-dag-oppsummering avviker</span>
                        ) : null}
                      </p>
                      <details className="rounded-md border border-amber-200/90 bg-amber-50/50 open:bg-amber-50/70">
                        <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-semibold text-amber-950">
                          Avvik per dag og per time (snapshot → draft)
                        </summary>
                        <pre className="max-h-48 overflow-auto border-t border-amber-100/80 bg-white/90 p-2 text-[10px] font-mono leading-snug whitespace-pre-wrap text-zinc-900">
                          {schoolImportDebugPanel.snapshotDraftDiff}
                        </pre>
                      </details>
                      <p className="text-[10px] text-zinc-500">
                        Tips: Åpne nettleserens devtools (F12) → Console. Med{' '}
                        <code className="rounded bg-zinc-100 px-0.5">VITE_DEBUG_SCHOOL_IMPORT=true</code> logges snapshot-lengde
                        ved import; du kan også lime inn JSON fra «Full JSON» under i konsollen som{' '}
                        <code className="rounded bg-zinc-100 px-0.5">JSON.parse(...)</code> for å inspisere objekter per ukedag.
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <p className="mb-0.5 font-medium text-zinc-700">Parsed snapshot (per dag)</p>
                          <pre className="max-h-36 overflow-auto rounded-md border border-zinc-200 bg-white p-2 text-[10px] font-mono whitespace-pre-wrap text-zinc-800">
                            {schoolImportDebugPanel.snapshotLines}
                          </pre>
                        </div>
                        <div>
                          <p className="mb-0.5 font-medium text-zinc-700">Nåværende draft (per dag)</p>
                          <pre className="max-h-36 overflow-auto rounded-md border border-zinc-200 bg-white p-2 text-[10px] font-mono whitespace-pre-wrap text-zinc-800">
                            {schoolImportDebugPanel.draftLines}
                          </pre>
                        </div>
                      </div>
                      <details className="rounded-md border border-zinc-200 bg-white/70">
                        <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-medium text-zinc-700">
                          Full JSON: snapshot vs draft
                        </summary>
                        <div className="grid max-h-56 gap-2 overflow-hidden border-t border-zinc-100 p-2 sm:grid-cols-2">
                          <pre className="max-h-52 overflow-auto rounded border border-zinc-100 bg-zinc-50/80 p-2 text-[9px] font-mono leading-tight whitespace-pre-wrap text-zinc-800">
                            {schoolImportDebugPanel.snapshot}
                          </pre>
                          <pre className="max-h-52 overflow-auto rounded border border-zinc-100 bg-zinc-50/80 p-2 text-[9px] font-mono leading-tight whitespace-pre-wrap text-zinc-800">
                            {schoolImportDebugPanel.draftJson}
                          </pre>
                        </div>
                      </details>
                      <p className="text-[10px] text-zinc-500">
                        I «Enkel dag» kan skjemaet vise gate-tider i feltene når modellen mangler schoolStart/schoolEnd —
                        det er visningsfallback til du lagrer endring; sjekk JSON over for faktiske feltverdier.
                      </p>
                    </div>
                  </details>
                ) : null}
                <div className="max-h-[min(50vh,420px)] overflow-y-auto overscroll-y-contain pr-1">
                  <SchoolProfileFields value={schoolReview.draft} onChange={setSchoolProfileDraft} />
                </div>
              </div>
              {error ? (
                <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[13px] text-rose-800">
                  {error}
                </p>
              ) : null}
              {!updatePerson ? (
                <p className="text-[12px] text-amber-800">Lagring er ikke tilgjengelig. Prøv å oppdatere appen.</p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              {analyzeWarning ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-950 whitespace-pre-wrap">
                  {analyzeWarning}
                </p>
              ) : null}
              <div className="rounded-xl border border-brandNavy/15 bg-brandSky/20 px-3 py-2.5">
                <p className="text-[12px] font-medium leading-snug text-brandNavy">
                  Gå gjennom forslagene nedenfor. Kun <span className="font-semibold">avkryssede</span> kort importeres
                  som hendelser eller gjøremål.
                </p>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-white/70 px-2 py-1.5">
                    <dt className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">Valgt</dt>
                    <dd className="text-[15px] font-bold tabular-nums text-brandNavy">{reviewSelectionStats.selected}</dd>
                  </div>
                  <div className="rounded-lg bg-white/70 px-2 py-1.5">
                    <dt className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">Trenger retting</dt>
                    <dd className="text-[15px] font-bold tabular-nums text-amber-800">{reviewSelectionStats.withErrors}</dd>
                  </div>
                  <div className="rounded-lg bg-white/70 px-2 py-1.5">
                    <dt className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">Klare</dt>
                    <dd className="text-[15px] font-bold tabular-nums text-emerald-800">{reviewSelectionStats.ready}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-[10px] leading-snug text-zinc-500">
                  Av {reviewSelectionStats.total} forslag · «Klare» = valgt og uten valideringsfeil.
                </p>
              </div>

              <ul className="space-y-4">
                {calendarProposalItems.map((item) => {
                  const u = draftByProposalId[item.proposalId]
                  if (!u) return null
                  const checked = selectedIds.has(item.proposalId)
                  const pid = item.proposalId
                  const disabled = !checked
                  const badge = confidenceBadgeStyle(item.confidence)
                  const sourceCtx = getSourceContextTextForItem(item)
                  const fullSourceDoc = buildFullSourceContextDocumentForItem(item)
                  const showSourceExpandToggle = sourceCtx && shouldOfferSourceExpand(fullSourceDoc, sourceCtx)
                  const sourceExpanded = expandedSourceIds.has(pid)
                  const detailsExpanded = expandedDetailIds.has(pid)
                  const cardTitle =
                    (u.importKind === 'event' ? u.event.title : u.task.title).trim() || 'Uten tittel'
                  const eventFieldErrors =
                    u.importKind === 'event' && checked
                      ? getTankestromDraftFieldErrors(u.event, validPersonIds)
                      : {}
                  const taskFieldErrors =
                    u.importKind === 'task' && checked ? getTankestromTaskFieldErrors(u.task) : {}
                  const schoolCtx =
                    item.kind === 'event' && u.importKind === 'event'
                      ? schoolContextFromEventProposal(item)
                      : null
                  const schoolCtxPerson =
                    schoolCtx && u.importKind === 'event'
                      ? people.find((p) => p.id === u.event.personId)
                      : null
                  const schoolCtxSubjectLabel = schoolCtx
                    ? schoolContextSubjectLabel(schoolCtxPerson?.school?.gradeBand, schoolCtx)
                    : null

                  return (
                    <li
                      key={pid}
                      className={`overflow-hidden rounded-2xl border-2 transition-colors ${
                        checked
                          ? 'border-brandTeal/50 bg-white shadow-planner-sm ring-1 ring-brandTeal/10'
                          : 'border-zinc-200 bg-zinc-50/90 opacity-[0.88]'
                      }`}
                    >
                      <div className="flex items-start gap-3 border-b border-zinc-100/80 px-3 py-2.5 sm:px-4">
                        <input
                          type="checkbox"
                          className="mt-1.5 h-[18px] w-[18px] shrink-0 rounded border-zinc-300 text-brandTeal focus:ring-brandTeal/30"
                          checked={checked}
                          onChange={() => toggleProposal(pid)}
                          aria-label={`Velg forslag: ${cardTitle}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                            <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                              {item.originalSourceType}
                            </span>
                            {schoolCtx ? (
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${schoolItemTypeChipClass(schoolCtx.itemType)}`}
                                title="Kobles til skoleblokk ved import"
                              >
                                {schoolCtxSubjectLabel ? (
                                  <span className="normal-case tracking-normal">
                                    {schoolCtxSubjectLabel}
                                  </span>
                                ) : null}
                                <span aria-hidden className="opacity-50">·</span>
                                <span>{schoolItemTypeLabel(schoolCtx.itemType)}</span>
                              </span>
                            ) : null}
                          </div>
                          <p
                            className={`mt-1.5 text-[11px] font-semibold uppercase tracking-wide ${checked ? 'text-brandNavy' : 'text-zinc-500'}`}
                          >
                            {checked ? 'Valgt for import' : 'Ikke valgt — huk av for å importere'}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => setProposalImportKind(pid, 'event')}
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                                u.importKind === 'event'
                                  ? 'bg-brandNavy text-white'
                                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                              }`}
                            >
                              Hendelse
                            </button>
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => setProposalImportKind(pid, 'task')}
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                                u.importKind === 'task'
                                  ? 'bg-brandNavy text-white'
                                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                              }`}
                            >
                              Gjøremål
                            </button>
                          </div>
                        </div>
                      </div>

                      {u.importKind === 'event' ? (
                        <>
                          <div className="border-b border-dashed border-zinc-200 bg-zinc-50/60 px-3 py-2 sm:px-4">
                            <p className="text-[12px] font-medium leading-snug text-zinc-600">
                              <span>{formatNorwegianDateLabel(u.event.date)}</span>
                              <span className="mx-1.5 text-zinc-300">·</span>
                              <span className="tabular-nums">
                                {(() => {
                                  const ts =
                                    u.event.start.length > 5 ? u.event.start.slice(0, 5) : u.event.start
                                  const te = u.event.end.length > 5 ? u.event.end.slice(0, 5) : u.event.end
                                  const hm = /^([01]\d|2[0-3]):[0-5]\d$/
                                  return hm.test(ts) && hm.test(te)
                                    ? formatTimeRange(ts, te)
                                    : ts && te
                                      ? `${ts} – ${te}`
                                      : '—'
                                })()}
                              </span>
                              {people.find((p) => p.id === u.event.personId)?.name ? (
                                <>
                                  <span className="mx-1.5 text-zinc-300">·</span>
                                  <span className="text-zinc-700">
                                    {people.find((p) => p.id === u.event.personId)?.name}
                                  </span>
                                </>
                              ) : null}
                            </p>
                          </div>

                          <div className="space-y-3 px-3 py-3 sm:px-4">
                            <Input
                              id={`ts-${pid}-title`}
                              label="Tittel"
                              value={u.event.title}
                              onChange={(e) => updateEventDraft(pid, { title: e.target.value })}
                              disabled={disabled}
                              error={eventFieldErrors.title}
                              className="text-[15px] font-semibold"
                            />
                            <Input
                              id={`ts-${pid}-date`}
                              label="Dato"
                              type="date"
                              value={u.event.date}
                              onChange={(e) => updateEventDraft(pid, { date: e.target.value })}
                              disabled={disabled}
                              error={eventFieldErrors.date}
                              className="text-[13px]"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                id={`ts-${pid}-start`}
                                label="Start"
                                type="time"
                                step={60}
                                value={u.event.start.length > 5 ? u.event.start.slice(0, 5) : u.event.start}
                                onChange={(e) => updateEventDraft(pid, { start: e.target.value })}
                                disabled={disabled}
                                error={eventFieldErrors.start}
                                className="text-[13px]"
                              />
                              <Input
                                id={`ts-${pid}-end`}
                                label="Slutt"
                                type="time"
                                step={60}
                                value={u.event.end.length > 5 ? u.event.end.slice(0, 5) : u.event.end}
                                onChange={(e) => updateEventDraft(pid, { end: e.target.value })}
                                disabled={disabled}
                                error={eventFieldErrors.end}
                                className="text-[13px]"
                              />
                            </div>
                            <div>
                              <label
                                htmlFor={`ts-${pid}-person`}
                                className="mb-1 block text-caption font-medium text-zinc-600"
                              >
                                Person
                              </label>
                              <select
                                id={`ts-${pid}-person`}
                                className={`w-full rounded-2xl border bg-zinc-50 px-3.5 py-2.5 text-body text-zinc-900 outline-none transition focus:bg-white focus:ring-1 disabled:opacity-50 ${
                                  eventFieldErrors.personId
                                    ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-400/20'
                                    : 'border-zinc-200 focus:border-brandTeal focus:ring-brandTeal/20'
                                }`}
                                value={u.event.personId}
                                onChange={(e) => updateEventDraft(pid, { personId: e.target.value })}
                                disabled={disabled}
                                aria-invalid={eventFieldErrors.personId ? true : undefined}
                              >
                                <option value="">— Velg —</option>
                                {people.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                              {eventFieldErrors.personId && (
                                <p className="mt-1 text-[12px] text-rose-600" role="alert">
                                  {eventFieldErrors.personId}
                                </p>
                              )}
                            </div>

                            <div className="rounded-xl border border-rose-100 bg-rose-50/50 px-3 py-3">
                              <p className="inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-700">
                                Notater
                              </p>
                              <div className="mt-2">
                                <Textarea
                                  id={`ts-${pid}-notes`}
                                  label="Notater"
                                  rows={3}
                                  autoResize
                                  minRows={3}
                                  maxRows={12}
                                  value={u.event.notes}
                                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                                    updateEventDraft(pid, { notes: e.target.value })
                                  }
                                  disabled={disabled}
                                  className="text-[13px] text-zinc-700"
                                  placeholder="Detaljer som skal med inn i kalenderen"
                                />
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleDetailsExpanded(pid)}
                              className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-left text-[12px] font-medium text-zinc-700 transition hover:bg-zinc-100"
                              aria-expanded={detailsExpanded}
                              aria-controls={`ts-extra-details-${pid}`}
                            >
                              <span>{detailsExpanded ? 'Skjul ekstradetaljer' : 'Vis ekstradetaljer'}</span>
                              <svg
                                className={`h-4 w-4 text-zinc-500 transition-transform ${detailsExpanded ? 'rotate-180' : ''}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={2.5}
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                              </svg>
                            </button>

                            {detailsExpanded ? (
                              <div
                                id={`ts-extra-details-${pid}`}
                                className="space-y-3 rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-3"
                              >
                                <Input
                                  id={`ts-${pid}-location`}
                                  label="Sted"
                                  value={u.event.location}
                                  onChange={(e) => updateEventDraft(pid, { location: e.target.value })}
                                  disabled={disabled}
                                  className="text-[13px] text-zinc-800"
                                  placeholder="F.eks. skole, adresse"
                                />
                                <div className="space-y-1">
                                  <label
                                    htmlFor={`ts-${pid}-reminder`}
                                    className="block text-caption font-medium text-zinc-600"
                                  >
                                    Påminnelse
                                  </label>
                                  <select
                                    id={`ts-${pid}-reminder`}
                                    className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-body text-zinc-900 outline-none transition focus:bg-white focus:border-brandTeal focus:ring-1 focus:ring-brandTeal/20 disabled:opacity-50"
                                    value={u.event.reminderMinutes == null ? '' : String(u.event.reminderMinutes)}
                                    onChange={(e) =>
                                      updateEventDraft(pid, {
                                        reminderMinutes: e.target.value === '' ? undefined : Number(e.target.value),
                                      })
                                    }
                                    disabled={disabled}
                                  >
                                    <option value="">Ingen</option>
                                    <option value="5">5 min før</option>
                                    <option value="15">15 min før</option>
                                    <option value="30">30 min før</option>
                                    <option value="60">1 time før</option>
                                    <option value="120">2 timer før</option>
                                    <option value="1440">24 timer før</option>
                                  </select>
                                  <p className="text-[11px] text-zinc-500">
                                    Valgt:{' '}
                                    <span className="font-medium text-zinc-700">
                                      {reminderLabel(u.event.reminderMinutes)}
                                    </span>
                                  </p>
                                </div>

                                <div className="space-y-1 rounded-lg border border-zinc-200/90 bg-white/70 px-2.5 py-2">
                                  <p className="text-caption font-medium text-zinc-600">Gjentakelse</p>
                                  {item.kind === 'event' && item.event.recurrenceGroupId ? (
                                    <label className="flex items-center gap-2 text-[12px] text-zinc-700">
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-zinc-300 text-brandTeal focus:ring-brandTeal/30"
                                        checked={u.event.includeRecurrence}
                                        onChange={(e) =>
                                          updateEventDraft(pid, { includeRecurrence: e.target.checked })
                                        }
                                        disabled={disabled}
                                      />
                                      Behold gjentakelse fra forslag
                                    </label>
                                  ) : (
                                    <p className="text-[12px] text-zinc-500">Ingen gjentakelse i dette forslaget.</p>
                                  )}
                                </div>

                                <div className="space-y-2 rounded-lg border border-zinc-200/90 bg-white/70 px-2.5 py-2">
                                  <p className="text-caption font-medium text-zinc-600">Levering og henting</p>
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <div>
                                      <label
                                        htmlFor={`ts-${pid}-dropoff`}
                                        className="mb-1 block text-[11px] font-medium text-zinc-500"
                                      >
                                        Levert av
                                      </label>
                                      <select
                                        id={`ts-${pid}-dropoff`}
                                        className="w-full rounded-xl border border-zinc-200 bg-white px-2.5 py-2 text-[13px] text-zinc-900 outline-none transition focus:border-brandTeal focus:ring-1 focus:ring-brandTeal/20 disabled:opacity-50"
                                        value={u.event.dropoffBy}
                                        onChange={(e) => updateEventDraft(pid, { dropoffBy: e.target.value })}
                                        disabled={disabled}
                                      >
                                        <option value="">Ingen</option>
                                        {people.map((p) => (
                                          <option key={p.id} value={p.id}>
                                            {p.name}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label
                                        htmlFor={`ts-${pid}-pickup`}
                                        className="mb-1 block text-[11px] font-medium text-zinc-500"
                                      >
                                        Hentes av
                                      </label>
                                      <select
                                        id={`ts-${pid}-pickup`}
                                        className="w-full rounded-xl border border-zinc-200 bg-white px-2.5 py-2 text-[13px] text-zinc-900 outline-none transition focus:border-brandTeal focus:ring-1 focus:ring-brandTeal/20 disabled:opacity-50"
                                        value={u.event.pickupBy}
                                        onChange={(e) => updateEventDraft(pid, { pickupBy: e.target.value })}
                                        disabled={disabled}
                                      >
                                        <option value="">Ingen</option>
                                        {people.map((p) => (
                                          <option key={p.id} value={p.id}>
                                            {p.name}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                </div>

                                {sourceCtx && (
                                  <div className="rounded-lg border border-zinc-200/80 bg-zinc-50/90 px-3 py-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                                      Kildegrunnlag (fra AI)
                                    </p>
                                    <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-zinc-600">
                                      {sourceCtx}
                                    </p>
                                    {showSourceExpandToggle && fullSourceDoc ? (
                                      <>
                                        <button
                                          type="button"
                                          className="mt-2 text-left text-[12px] font-semibold text-brandNavy underline decoration-brandNavy/30 underline-offset-2 hover:decoration-brandNavy"
                                          onClick={() => toggleSourceExpanded(pid)}
                                          aria-expanded={sourceExpanded}
                                          aria-controls={`ts-source-expanded-${pid}`}
                                        >
                                          {sourceExpanded ? 'Vis mindre' : 'Vis mer av kildegrunnlag'}
                                        </button>
                                        {sourceExpanded ? (
                                          <div
                                            id={`ts-source-expanded-${pid}`}
                                            className="mt-3 border-t border-zinc-200/90 pt-3"
                                          >
                                            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                                              Utvidet kildegrunnlag
                                            </p>
                                            <div
                                              className="mt-1.5 max-h-56 overflow-y-auto overscroll-y-contain rounded-md border border-zinc-100 bg-white px-2.5 py-2 text-[12px] leading-relaxed text-zinc-700 whitespace-pre-wrap break-words"
                                              role="region"
                                              aria-label="Fullt kildegrunnlag fra AI"
                                            >
                                              {fullSourceDoc.length > 12000
                                                ? `${fullSourceDoc.slice(0, 11997)}…`
                                                : fullSourceDoc}
                                            </div>
                                          </div>
                                        ) : null}
                                      </>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="border-b border-dashed border-zinc-200 bg-zinc-50/60 px-3 py-2 sm:px-4">
                            <p className="text-[12px] font-medium leading-snug text-zinc-600">
                              <span>{formatNorwegianDateLabel(u.task.date)}</span>
                              {u.task.dueTime.trim() ? (
                                <>
                                  <span className="mx-1.5 text-zinc-300">·</span>
                                  <span className="tabular-nums text-amber-700">
                                    Frist: {u.task.dueTime.trim()}
                                  </span>
                                </>
                              ) : null}
                              {u.task.childPersonId && people.find((p) => p.id === u.task.childPersonId)?.name ? (
                                <>
                                  <span className="mx-1.5 text-zinc-300">·</span>
                                  <span className="text-zinc-700">
                                    {people.find((p) => p.id === u.task.childPersonId)?.name}
                                  </span>
                                </>
                              ) : null}
                            </p>
                          </div>
                          <div className="space-y-3 px-3 py-3 sm:px-4">
                            <Input
                              id={`ts-${pid}-task-title`}
                              label="Tittel"
                              value={u.task.title}
                              onChange={(e) => updateTaskDraft(pid, { title: e.target.value })}
                              disabled={disabled}
                              error={taskFieldErrors.title}
                              className="text-[15px] font-semibold"
                            />
                            <Input
                              id={`ts-${pid}-task-date`}
                              label="Dato"
                              type="date"
                              value={u.task.date}
                              onChange={(e) => updateTaskDraft(pid, { date: e.target.value })}
                              disabled={disabled}
                              error={taskFieldErrors.date}
                              className="text-[13px]"
                            />
                            <Input
                              id={`ts-${pid}-task-due`}
                              label="Frist (klokkeslett, valgfritt)"
                              type="time"
                              step={60}
                              value={
                                u.task.dueTime.length > 5 ? u.task.dueTime.slice(0, 5) : u.task.dueTime
                              }
                              onChange={(e) => updateTaskDraft(pid, { dueTime: e.target.value })}
                              disabled={disabled}
                              error={taskFieldErrors.dueTime}
                              className="text-[13px]"
                            />
                            <div>
                              <label
                                htmlFor={`ts-${pid}-task-child`}
                                className="mb-1 block text-caption font-medium text-zinc-600"
                              >
                                Gjelder barn
                              </label>
                              <select
                                id={`ts-${pid}-task-child`}
                                className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-body text-zinc-900 outline-none transition focus:bg-white focus:border-brandTeal focus:ring-1 focus:ring-brandTeal/20 disabled:opacity-50"
                                value={u.task.childPersonId}
                                onChange={(e) => updateTaskDraft(pid, { childPersonId: e.target.value })}
                                disabled={disabled}
                              >
                                <option value="">— Ingen —</option>
                                {people.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label
                                htmlFor={`ts-${pid}-task-assign`}
                                className="mb-1 block text-caption font-medium text-zinc-600"
                              >
                                Ansvarlig
                              </label>
                              <select
                                id={`ts-${pid}-task-assign`}
                                className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-body text-zinc-900 outline-none transition focus:bg-white focus:border-brandTeal focus:ring-1 focus:ring-brandTeal/20 disabled:opacity-50"
                                value={u.task.assignedToPersonId}
                                onChange={(e) => updateTaskDraft(pid, { assignedToPersonId: e.target.value })}
                                disabled={disabled}
                              >
                                <option value="">— Ingen —</option>
                                {people.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <label className="flex items-center gap-2 text-[12px] text-zinc-700">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-zinc-300 text-brandTeal focus:ring-brandTeal/30"
                                checked={u.task.showInMonthView}
                                onChange={(e) => updateTaskDraft(pid, { showInMonthView: e.target.checked })}
                                disabled={disabled}
                              />
                              Vis markør i månedskalender
                            </label>
                            <div className="rounded-xl border border-rose-100 bg-rose-50/50 px-3 py-3">
                              <p className="inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-700">
                                Notater
                              </p>
                              <div className="mt-2">
                                <Textarea
                                  id={`ts-${pid}-task-notes`}
                                  label="Notater"
                                  rows={3}
                                  autoResize
                                  minRows={3}
                                  maxRows={12}
                                  value={u.task.notes}
                                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                                    updateTaskDraft(pid, { notes: e.target.value })
                                  }
                                  disabled={disabled}
                                  className="text-[13px] text-zinc-700"
                                  placeholder="Detaljer til oppgaven"
                                />
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleDetailsExpanded(pid)}
                              className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-left text-[12px] font-medium text-zinc-700 transition hover:bg-zinc-100"
                              aria-expanded={detailsExpanded}
                              aria-controls={`ts-task-extra-${pid}`}
                            >
                              <span>{detailsExpanded ? 'Skjul kildegrunnlag' : 'Vis kildegrunnlag'}</span>
                              <svg
                                className={`h-4 w-4 text-zinc-500 transition-transform ${detailsExpanded ? 'rotate-180' : ''}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={2.5}
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                              </svg>
                            </button>
                            {detailsExpanded && sourceCtx ? (
                              <div
                                id={`ts-task-extra-${pid}`}
                                className="rounded-lg border border-zinc-200/80 bg-zinc-50/90 px-3 py-2"
                              >
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                                  Kildegrunnlag (fra AI)
                                </p>
                                <p className="mt-1 text-[12px] leading-relaxed text-zinc-600">{sourceCtx}</p>
                                {showSourceExpandToggle && fullSourceDoc ? (
                                  <>
                                    <button
                                      type="button"
                                      className="mt-2 text-left text-[12px] font-semibold text-brandNavy underline decoration-brandNavy/30 underline-offset-2 hover:decoration-brandNavy"
                                      onClick={() => toggleSourceExpanded(pid)}
                                      aria-expanded={sourceExpanded}
                                    >
                                      {sourceExpanded ? 'Vis mindre' : 'Vis mer'}
                                    </button>
                                    {sourceExpanded && fullSourceDoc ? (
                                      <div className="mt-2 max-h-40 overflow-y-auto text-[12px] whitespace-pre-wrap text-zinc-700">
                                        {fullSourceDoc.length > 8000
                                          ? `${fullSourceDoc.slice(0, 7997)}…`
                                          : fullSourceDoc}
                                      </div>
                                    ) : null}
                                  </>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>

              {selectedIds.size > 0 && !canApproveSelection && (
                <p className="text-[12px] leading-snug text-amber-900">
                  <span className="font-semibold">Mangler eller ugyldig data</span> på et eller flere valgte kort. Se
                  røde feltmerknader over.
                </p>
              )}
              {error && (
                <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[13px] text-rose-800">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-zinc-100 px-4 py-3">
          <Button type="button" variant="secondary" fullWidth={false} className="flex-1" onClick={handleClose}>
            Avbryt
          </Button>
          {step === 'pick' ? (
            <Button
              type="button"
              variant="primary"
              className="flex-1"
              loading={analyzeLoading}
              disabled={
                !hasPeople || (inputMode === 'file' ? pendingFiles.length === 0 : !textInput.trim())
              }
              onClick={() => {
                logEvent('tankestrom_analyze_started', {
                  mode: inputMode,
                  fileCount: inputMode === 'file' ? pendingFiles.length : 0,
                })
                void runAnalyze()
              }}
            >
              Analyser
            </Button>
          ) : schoolReview ? (
            <Button
              type="button"
              variant="primary"
              className="flex-1"
              loading={saveLoading}
              disabled={!hasPeople || !canSaveSchoolProfile}
              title={
                schoolLessonConflicts.length > 0
                  ? 'Velg ett fag for hvert spor som kolliderer før du lagrer'
                  : undefined
              }
              onClick={() => void handleSaveSchoolProfile()}
            >
              Lagre skoleprofil
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              className="flex-1"
              loading={saveLoading}
              disabled={!hasPeople || !canApproveSelection}
              onClick={() => void handleApprove()}
            >
              Importer valgte ({selectedIds.size})
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
