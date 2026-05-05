import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { springDialog } from '../lib/motion'
import { Button } from './ui/Button'
import { inputBase, sheetPanel, sheetHandle, sheetHandleBar, sheetDetailBody, sheetSubtitle, btnSecondary, btnDanger } from '../lib/ui'
import type { EmbeddedScheduleSegment, Event } from '../types'
import { groupEmbeddedScheduleByDate, parseEmbeddedScheduleFromMetadata } from '../lib/embeddedSchedule'
import {
  tankestromConditionalAccessibleHintNb,
  tankestromConditionalBadgeLabelNb,
} from '../lib/tankestromConditionalCopy'
import { formatTimeRange, durationMinutes } from '../lib/time'
import { useFamily } from '../context/FamilyContext'
import { getParticipantPeople } from '../lib/eventParticipants'

interface EventDetailSheetProps {
  event: Event | null
  date: string
  onClose: () => void
  onEdit: (scope: 'this' | 'all') => void
  onDelete: (scope: 'this' | 'all') => void | Promise<void>
  /** Optional: duplicate this event to another date with given start/end times. */
  onDuplicate?: (targetDate: string, start: string, end: string) => void | Promise<void>
  /** Optional: move this event to a different date (keeps existing start/end times). */
  onMove?: (targetDate: string) => void | Promise<void>
  /** The current user's PersonId — used to render "Jeg henter/leverer" vs "Du henter/leverer" vs "Overta". */
  mePersonId?: string | null
  /** Quick-assign a transport role directly from the detail sheet without opening the edit form. */
  onQuickAssignTransport?: (role: 'dropoff' | 'pickup', personId: string) => Promise<void> | void
}

function formatScheduleDayHeading(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`)
  if (Number.isNaN(d.getTime())) return dateKey
  return d.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })
}

function segmentTimeLabel(s: EmbeddedScheduleSegment): string | null {
  if (s.start && s.end) return formatTimeRange(s.start, s.end)
  if (s.start) return s.start
  return null
}

export function EventDetailSheet({ event, date, onClose, onEdit, onDelete, onDuplicate, onMove, mePersonId, onQuickAssignTransport }: EventDetailSheetProps) {
  const [deleting, setDeleting] = useState(false)
  const [showSeriesChoice, setShowSeriesChoice] = useState<'edit' | 'delete' | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showDuplicate, setShowDuplicate] = useState(false)
  const [dupDate, setDupDate] = useState(date)
  const [dupStart, setDupStart] = useState(event?.start ?? '15:00')
  const [dupEnd, setDupEnd] = useState(event?.end ?? '16:00')
  const [dupSaving, setDupSaving] = useState(false)
  const [showMove, setShowMove] = useState(false)
  const [moveDate, setMoveDate] = useState(date)
  const [moveSaving, setMoveSaving] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  if (!event) return null

  const isRecurring = !!event.recurrenceGroupId

  function handleEditClick() {
    if (isRecurring) {
      setShowSeriesChoice('edit')
    } else {
      onEdit('this')
    }
  }

  function handleDeleteClick() {
    if (isRecurring) {
      setShowSeriesChoice('delete')
    } else {
      setShowDeleteConfirm(true)
    }
  }

  async function doDelete(scope: 'this' | 'all') {
    setDeleting(true)
    try {
      await Promise.resolve(onDelete(scope))
      onClose()
    } finally {
      setDeleting(false)
      setShowSeriesChoice(null)
    }
  }

  const { people } = useFamily()
  const participants = getParticipantPeople(event, people)
  const transport = (event.metadata as any)?.transport as
    | { dropoffBy?: string; pickupBy?: string }
    | undefined
  const dropoffPerson =
    transport?.dropoffBy != null ? people.find((p) => p.id === transport.dropoffBy) : undefined
  const pickupPerson =
    transport?.pickupBy != null ? people.find((p) => p.id === transport.pickupBy) : undefined
  const primaryPerson = people.find((p) => p.id === event.personId)
  const isChildEvent =
    primaryPerson?.memberKind === 'child' || participants.some((p) => p.memberKind === 'child')
  const showTransportSection =
    dropoffPerson != null ||
    pickupPerson != null ||
    (isChildEvent && mePersonId != null && onQuickAssignTransport != null)
  const isAllDay = !!(event.metadata?.isAllDay)
  const eventEndDate = event.metadata?.endDate as string | undefined
  const duration = durationMinutes(event.start, event.end)
  const durationStr =
    duration < 60 ? `${duration} min` : `${Math.floor(duration / 60)} t ${duration % 60} min`

  const scheduleGroups = useMemo(() => {
    const parsed = parseEmbeddedScheduleFromMetadata(event.metadata)
    return groupEmbeddedScheduleByDate(parsed)
  }, [event.metadata])

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = dialogRef.current
    const focusables = root?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    focusables?.[0]?.focus()

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
      if (e.key === 'Tab' && focusables && focusables.length > 1) {
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeydown)
    return () => {
      document.removeEventListener('keydown', handleKeydown)
      previousFocusRef.current?.focus()
    }
  }, [onClose])

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-30 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-0 z-40 flex items-end justify-center px-3">
        <motion.div
          ref={dialogRef}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={springDialog}
          className={sheetPanel}
          role="dialog"
          aria-modal="true"
          aria-label="Hendelsesdetaljer"
        >
        <div className={`${sheetHandle} relative`}>
          <div className={sheetHandleBar} aria-hidden />
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk"
            className="absolute right-3 top-1 flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 touch-manipulation"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className={sheetDetailBody}>
          {participants.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {participants.map((person) => (
                <span
                  key={person.id}
                  className="text-caption font-semibold"
                  style={{ color: person.colorAccent }}
                >
                  {person.name}
                </span>
              ))}
            </div>
          ) : !event.personId ? (
            <p className="text-caption text-zinc-500">
              Ikke knyttet til person
              {(() => {
                const docName = (event.metadata as { documentExtractedPersonName?: unknown } | undefined)
                  ?.documentExtractedPersonName
                return typeof docName === 'string' && docName.trim() ? (
                  <> · Navn i dokument: {docName.trim()}</>
                ) : null
              })()}
            </p>
          ) : null}
          <h2 className="mt-1 text-[22px] font-bold text-zinc-900 leading-tight">{event.title}</h2>
          {isAllDay ? (
            <p className="mt-2 text-body font-medium text-brandNavy">
              Heldags{eventEndDate && eventEndDate !== date ? ` · t.o.m. ${eventEndDate}` : ''}
            </p>
          ) : (
            <>
              <p className="mt-2 text-body text-zinc-700">{formatTimeRange(event.start, event.end)}</p>
              <p className={sheetSubtitle}>Varighet: {durationStr}</p>
            </>
          )}
          {showTransportSection && (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Transport</p>
              <div className="space-y-1.5">
                {(['dropoff', 'pickup'] as const).map((role) => {
                  const person = role === 'dropoff' ? dropoffPerson : pickupPerson
                  const verbNb = role === 'dropoff' ? 'leverer' : 'henter'
                  const labelNb = role === 'dropoff' ? 'Levering' : 'Henting'
                  const isMe = mePersonId != null && person?.id === mePersonId
                  const canAssign = onQuickAssignTransport != null && mePersonId != null
                  return (
                    <div key={role} className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-[11px] font-medium uppercase tracking-wide text-zinc-400">{labelNb}</span>
                      {!person && canAssign ? (
                        <button
                          type="button"
                          onClick={() => void onQuickAssignTransport(role, mePersonId!)}
                          className="rounded-full bg-brandTeal/10 px-2.5 py-0.5 text-[12px] font-semibold text-brandTeal transition hover:bg-brandTeal/20 touch-manipulation"
                        >
                          Jeg {verbNb}
                        </button>
                      ) : !person ? (
                        <span className="text-[12px] italic text-zinc-400">Ikke satt</span>
                      ) : isMe ? (
                        <span className="text-[13px] font-medium text-zinc-700">Du {verbNb}</span>
                      ) : (
                        <span className="flex items-center gap-2 text-[13px] text-zinc-700">
                          <span>{person.name} {verbNb}</span>
                          {canAssign && (
                            <button
                              type="button"
                              onClick={() => void onQuickAssignTransport(role, mePersonId!)}
                              className="rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-500 transition hover:bg-zinc-100 touch-manipulation"
                            >
                              Overta
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {isRecurring && (
            <p className="mt-1 text-caption font-semibold text-indigo-500">Gjentakende hendelse</p>
          )}
          {event.location && (
            <p className="mt-3 text-body-sm text-zinc-600">
              <span className="font-medium">Sted:</span> {event.location}
            </p>
          )}
          {event.notes && (
            <p className="mt-2 text-body-sm text-zinc-600">
              <span className="font-medium">Notater:</span> {event.notes}
            </p>
          )}

          {scheduleGroups.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Program</p>
              <div className="space-y-4">
                {scheduleGroups.map(({ date: dayKey, items }) => (
                  <div key={dayKey}>
                    <p className="mb-2 text-[13px] font-semibold capitalize text-zinc-800">
                      {formatScheduleDayHeading(dayKey)}
                    </p>
                    <ul className="space-y-3">
                      {items.map((seg, idx) => {
                        const timeStr = segmentTimeLabel(seg)
                        return (
                          <li key={`${dayKey}-${idx}-${seg.title}`} className="flex gap-3">
                            <div className="w-[4.25rem] shrink-0 pt-0.5 text-right">
                              {timeStr ? (
                                <span className="text-[12px] font-semibold tabular-nums text-zinc-600">{timeStr}</span>
                              ) : (
                                <span className="text-[11px] text-zinc-400">—</span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1 border-l border-zinc-200 pl-3">
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span className="text-[14px] font-medium leading-snug text-zinc-900">{seg.title}</span>
                                {seg.isConditional && (
                                  <span
                                    title={tankestromConditionalAccessibleHintNb()}
                                    className="rounded-md bg-amber-100/90 px-1.5 py-0.5 text-[10px] font-semibold leading-snug text-amber-950/95"
                                  >
                                    {tankestromConditionalBadgeLabelNb()}
                                  </span>
                                )}
                                {seg.kind ? (
                                  <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">{seg.kind}</span>
                                ) : null}
                              </div>
                              {seg.notes ? (
                                <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">{seg.notes}</p>
                              ) : null}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showDeleteConfirm && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 space-y-3">
              <p className="text-body-sm font-medium text-rose-900">Slette denne hendelsen?</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowDeleteConfirm(false)} className={`flex-1 ${btnSecondary}`}>Avbryt</button>
                <button type="button" disabled={deleting} onClick={() => { setShowDeleteConfirm(false); void doDelete('this') }} className={`flex-1 ${btnDanger}`}>{deleting ? 'Sletter…' : 'Slett'}</button>
              </div>
            </div>
          )}

          {!showDeleteConfirm && showSeriesChoice ? (
            <div className="mt-6 space-y-2">
              <p className="text-body-sm font-medium text-zinc-700">
                {showSeriesChoice === 'edit' ? 'Hvilke hendelser vil du redigere?' : 'Hvilke hendelser vil du slette?'}
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  if (showSeriesChoice === 'edit') onEdit('this')
                  else doDelete('this')
                }}
              >
                Denne forekomsten
              </Button>
              <Button
                variant={showSeriesChoice === 'delete' ? 'danger' : 'primary'}
                disabled={deleting}
                onClick={() => {
                  if (showSeriesChoice === 'edit') onEdit('all')
                  else doDelete('all')
                }}
              >
                {deleting ? 'Sletter…' : 'Alle i serien'}
              </Button>
              <Button variant="neutral" onClick={() => setShowSeriesChoice(null)}>
                Avbryt
              </Button>
            </div>
          ) : (
            <>
              <div className="mt-6 flex gap-2">
                <Button variant="secondary" fullWidth={false} className="flex-1" onClick={handleEditClick}>
                  Rediger
                </Button>
                <Button variant="danger" fullWidth={false} className="flex-1" disabled={deleting} onClick={handleDeleteClick}>
                  {deleting ? 'Sletter…' : 'Slett'}
                </Button>
              </div>
              {onMove && !showMove && !showDuplicate && (
                <button
                  type="button"
                  onClick={() => {
                    setMoveDate(date)
                    setShowMove(true)
                  }}
                  className="mt-3 w-full rounded-2xl border border-dashed border-zinc-300 py-2.5 text-body-sm font-medium text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700 touch-manipulation"
                >
                  Flytt til en annen dag…
                </button>
              )}
              {onMove && showMove && (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 space-y-3">
                  <p className="text-body-sm font-medium text-zinc-800">Flytt til dato</p>
                  <div className="space-y-1">
                    <label className="block text-caption font-medium text-zinc-500 mb-1">Dato</label>
                    <input
                      type="date"
                      value={moveDate}
                      onChange={(e) => setMoveDate(e.target.value)}
                      className={inputBase}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" fullWidth={false} className="flex-1" size="sm" onClick={() => setShowMove(false)}>
                      Avbryt
                    </Button>
                    <Button
                      variant="primary"
                      fullWidth={false}
                      className="flex-1"
                      size="sm"
                      disabled={moveSaving || !moveDate || moveDate === date}
                      onClick={async () => {
                        setMoveSaving(true)
                        try {
                          await Promise.resolve(onMove(moveDate))
                          onClose()
                        } finally {
                          setMoveSaving(false)
                        }
                      }}
                    >
                      {moveSaving ? 'Flytter…' : 'Flytt'}
                    </Button>
                  </div>
                </div>
              )}
              {onDuplicate && !showDuplicate && !showMove && (
                <button
                  type="button"
                  onClick={() => {
                    setDupDate(date)
                    setDupStart(event.start)
                    setDupEnd(event.end)
                    setShowDuplicate(true)
                  }}
                  className="mt-3 w-full rounded-2xl border border-dashed border-zinc-300 py-2.5 text-body-sm font-medium text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700 touch-manipulation"
                >
                  Dupliser til en annen dag…
                </button>
              )}
              {onDuplicate && showDuplicate && (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 space-y-3">
                  <p className="text-body-sm font-medium text-zinc-800">Kopier til dato og tid</p>
                  <div className="space-y-1">
                    <label className="block text-caption font-medium text-zinc-500 mb-1">Dato</label>
                    <input
                      type="date"
                      value={dupDate}
                      onChange={(e) => setDupDate(e.target.value)}
                      className={inputBase}
                    />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1 space-y-1">
                      <label className="block text-caption font-medium text-zinc-500">Start</label>
                      <input
                        type="time"
                        value={dupStart}
                        onChange={(e) => setDupStart(e.target.value)}
                        className={inputBase}
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className="block text-caption font-medium text-zinc-500">Slutt</label>
                      <input
                        type="time"
                        value={dupEnd}
                        onChange={(e) => setDupEnd(e.target.value)}
                        className={inputBase}
                      />
                    </div>
                  </div>
                  {dupStart >= dupEnd && (
                    <p className="text-caption text-amber-600">Starttid må være før sluttid.</p>
                  )}
                  <div className="flex gap-2">
                    <Button variant="secondary" fullWidth={false} className="flex-1" size="sm" onClick={() => setShowDuplicate(false)}>
                      Avbryt
                    </Button>
                    <Button
                      variant="primary"
                      fullWidth={false}
                      className="flex-1"
                      size="sm"
                      disabled={dupSaving || dupStart >= dupEnd}
                      onClick={async () => {
                        setDupSaving(true)
                        try {
                          await Promise.resolve(onDuplicate(dupDate, dupStart, dupEnd))
                          onClose()
                        } finally {
                          setDupSaving(false)
                        }
                      }}
                    >
                      {dupSaving ? 'Kopierer…' : 'Dupliser'}
                    </Button>
                  </div>
                </div>
              )}
              <Button variant="neutral" className="mt-3" onClick={onClose}>
                Lukk
              </Button>
            </>
          )}
        </div>
      </motion.div>
      </div>
    </>
  )
}
