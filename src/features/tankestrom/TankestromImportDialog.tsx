import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import type { PortalEventProposal } from './types'
import type { UseEventControllerReturn } from '../calendar/hooks/useEventController'
import {
  useTankestromImport,
  getTankestromDraftFieldErrors,
  type TankestromPendingFile,
} from './useTankestromImport'
import { cardSection, typSectionCap } from '../../lib/ui'
import { Button } from '../../components/ui/Button'
import { Input, Textarea } from '../../components/ui/Input'
import { logEvent } from '../../lib/appLogger'
import { formatTimeRange } from '../../lib/time'

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
  people: import('../../types').Person[]
  createEvent: UseEventControllerReturn['createEvent']
}

export function TankestromImportDialog({ open, onClose, people, createEvent }: TankestromImportDialogProps) {
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
    canApproveSelection,
  } = useTankestromImport({ open, people, createEvent })

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
    const total = eventProposals.length
    const selected = selectedIds.size
    let withErrors = 0
    let ready = 0
    for (const id of selectedIds) {
      const d = draftByProposalId[id]
      if (!d) {
        withErrors += 1
        continue
      }
      const fe = getTankestromDraftFieldErrors(d, validPersonIds)
      if (Object.keys(fe).length > 0) withErrors += 1
      else ready += 1
    }
    return { total, selected, withErrors, ready }
  }, [eventProposals.length, selectedIds, draftByProposalId, validPersonIds])

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
              Importer fra Tankestrøm
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
                Velg inputmodus og analyser innholdet. Kun{' '}
                <span className="font-medium text-zinc-800">hendelsesforslag</span> vises i denne versjonen.
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
                  til kalenderen.
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
                {eventProposals.map((item) => {
                  const draft = draftByProposalId[item.proposalId]
                  if (!draft) return null
                  const checked = selectedIds.has(item.proposalId)
                  const pid = item.proposalId
                  const disabled = !checked
                  const badge = confidenceBadgeStyle(item.confidence)
                  const personName = people.find((p) => p.id === draft.personId)?.name ?? '—'
                  const fieldErrors = checked ? getTankestromDraftFieldErrors(draft, validPersonIds) : {}
                  const sourceCtx = getSourceContextText(item)
                  const fullSourceDoc = buildFullSourceContextDocument(item)
                  const showSourceExpandToggle = sourceCtx && shouldOfferSourceExpand(fullSourceDoc, sourceCtx)
                  const sourceExpanded = expandedSourceIds.has(pid)
                  const detailsExpanded = expandedDetailIds.has(pid)
                  const ts = draft.start.length > 5 ? draft.start.slice(0, 5) : draft.start
                  const te = draft.end.length > 5 ? draft.end.slice(0, 5) : draft.end
                  const hm = /^([01]\d|2[0-3]):[0-5]\d$/
                  const timeLabel =
                    hm.test(ts) && hm.test(te) ? formatTimeRange(ts, te) : ts && te ? `${ts} – ${te}` : '—'

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
                          aria-label={`Velg forslag: ${draft.title || 'Uten tittel'}`}
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
                          </div>
                          <p
                            className={`mt-1.5 text-[11px] font-semibold uppercase tracking-wide ${checked ? 'text-brandNavy' : 'text-zinc-500'}`}
                          >
                            {checked ? 'Valgt for import' : 'Ikke valgt — huk av for å importere'}
                          </p>
                        </div>
                      </div>

                      {/* Skannlinje: hva som telles (speiler utkast) */}
                      <div className="border-b border-dashed border-zinc-200 bg-zinc-50/60 px-3 py-3 sm:px-4">
                        <p className="text-[17px] font-bold leading-snug tracking-tight text-zinc-900">
                          {draft.title.trim() || 'Uten tittel'}
                        </p>
                        <p className="mt-1.5 text-[13px] font-medium text-zinc-700">
                          {formatNorwegianDateLabel(draft.date)}
                          <span className="mx-1.5 text-zinc-300">·</span>
                          <span className="tabular-nums">{timeLabel}</span>
                          <span className="mx-1.5 text-zinc-300">·</span>
                          <span className="text-zinc-800">{personName}</span>
                        </p>
                        {(draft.location.trim() || draft.notes.trim()) && (
                          <div className="mt-2 space-y-0.5 text-[12px] leading-snug text-zinc-500">
                            {draft.location.trim() ? (
                              <p>
                                <span className="font-medium text-zinc-400">Sted:</span> {draft.location.trim()}
                              </p>
                            ) : null}
                            {draft.notes.trim() ? (
                              <p className="line-clamp-2">
                                <span className="font-medium text-zinc-400">Notat:</span> {draft.notes.trim()}
                              </p>
                            ) : null}
                          </div>
                        )}
                      </div>

                      <div className="space-y-3 px-3 py-3 sm:px-4">
                        <Input
                          id={`ts-${pid}-title`}
                          label="Tittel"
                          value={draft.title}
                          onChange={(e) => updateDraft(pid, { title: e.target.value })}
                          disabled={disabled}
                          error={fieldErrors.title}
                          className="text-[15px] font-semibold"
                        />
                        <Input
                          id={`ts-${pid}-date`}
                          label="Dato"
                          type="date"
                          value={draft.date}
                          onChange={(e) => updateDraft(pid, { date: e.target.value })}
                          disabled={disabled}
                          error={fieldErrors.date}
                          className="text-[13px]"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            id={`ts-${pid}-start`}
                            label="Start"
                            type="time"
                            step={60}
                            value={draft.start.length > 5 ? draft.start.slice(0, 5) : draft.start}
                            onChange={(e) => updateDraft(pid, { start: e.target.value })}
                            disabled={disabled}
                            error={fieldErrors.start}
                            className="text-[13px]"
                          />
                          <Input
                            id={`ts-${pid}-end`}
                            label="Slutt"
                            type="time"
                            step={60}
                            value={draft.end.length > 5 ? draft.end.slice(0, 5) : draft.end}
                            onChange={(e) => updateDraft(pid, { end: e.target.value })}
                            disabled={disabled}
                            error={fieldErrors.end}
                            className="text-[13px]"
                          />
                        </div>
                        <div>
                          <label htmlFor={`ts-${pid}-person`} className="mb-1 block text-caption font-medium text-zinc-600">
                            Person
                          </label>
                          <select
                            id={`ts-${pid}-person`}
                            className={`w-full rounded-2xl border bg-zinc-50 px-3.5 py-2.5 text-body text-zinc-900 outline-none transition focus:bg-white focus:ring-1 disabled:opacity-50 ${
                              fieldErrors.personId
                                ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-400/20'
                                : 'border-zinc-200 focus:border-brandTeal focus:ring-brandTeal/20'
                            }`}
                            value={draft.personId}
                            onChange={(e) => updateDraft(pid, { personId: e.target.value })}
                            disabled={disabled}
                            aria-invalid={fieldErrors.personId ? true : undefined}
                          >
                            <option value="">— Velg —</option>
                            {people.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          {fieldErrors.personId && (
                            <p className="mt-1 text-[12px] text-rose-600" role="alert">
                              {fieldErrors.personId}
                            </p>
                          )}
                        </div>

                        <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Notater</p>
                          <div className="mt-2">
                            <Textarea
                              id={`ts-${pid}-notes`}
                              label="Notater"
                              rows={3}
                              autoResize
                              minRows={3}
                              maxRows={12}
                              value={draft.notes}
                              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => updateDraft(pid, { notes: e.target.value })}
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
                          <div id={`ts-extra-details-${pid}`} className="space-y-3 rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-3">
                            <Input
                              id={`ts-${pid}-location`}
                              label="Sted"
                              value={draft.location}
                              onChange={(e) => updateDraft(pid, { location: e.target.value })}
                              disabled={disabled}
                              className="text-[13px] text-zinc-800"
                              placeholder="F.eks. skole, adresse"
                            />
                            <div className="space-y-1">
                              <label htmlFor={`ts-${pid}-reminder`} className="block text-caption font-medium text-zinc-600">
                                Påminnelse
                              </label>
                              <select
                                id={`ts-${pid}-reminder`}
                                className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-body text-zinc-900 outline-none transition focus:bg-white focus:border-brandTeal focus:ring-1 focus:ring-brandTeal/20 disabled:opacity-50"
                                value={draft.reminderMinutes == null ? '' : String(draft.reminderMinutes)}
                                onChange={(e) =>
                                  updateDraft(pid, {
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
                                Valgt: <span className="font-medium text-zinc-700">{reminderLabel(draft.reminderMinutes)}</span>
                              </p>
                            </div>

                            <div className="space-y-1 rounded-lg border border-zinc-200/90 bg-white/70 px-2.5 py-2">
                              <p className="text-caption font-medium text-zinc-600">Gjentakelse</p>
                              {item.event.recurrenceGroupId ? (
                                <label className="flex items-center gap-2 text-[12px] text-zinc-700">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-zinc-300 text-brandTeal focus:ring-brandTeal/30"
                                    checked={draft.includeRecurrence}
                                    onChange={(e) => updateDraft(pid, { includeRecurrence: e.target.checked })}
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
                                  <label htmlFor={`ts-${pid}-dropoff`} className="mb-1 block text-[11px] font-medium text-zinc-500">
                                    Levert av
                                  </label>
                                  <select
                                    id={`ts-${pid}-dropoff`}
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-2.5 py-2 text-[13px] text-zinc-900 outline-none transition focus:border-brandTeal focus:ring-1 focus:ring-brandTeal/20 disabled:opacity-50"
                                    value={draft.dropoffBy}
                                    onChange={(e) => updateDraft(pid, { dropoffBy: e.target.value })}
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
                                  <label htmlFor={`ts-${pid}-pickup`} className="mb-1 block text-[11px] font-medium text-zinc-500">
                                    Hentes av
                                  </label>
                                  <select
                                    id={`ts-${pid}-pickup`}
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-2.5 py-2 text-[13px] text-zinc-900 outline-none transition focus:border-brandTeal focus:ring-1 focus:ring-brandTeal/20 disabled:opacity-50"
                                    value={draft.pickupBy}
                                    onChange={(e) => updateDraft(pid, { pickupBy: e.target.value })}
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
                                <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-zinc-600">{sourceCtx}</p>
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
