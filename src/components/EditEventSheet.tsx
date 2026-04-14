import { useState, useEffect, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { springDialog } from '../lib/motion'
import type { Event, PersonId } from '../types'
import { useFamily } from '../context/FamilyContext'
import { useConfirmClose } from '../hooks/useConfirmClose'
import {
  inputBase, textareaBase, inputLabel, typLabel,
  btnPrimary, btnSecondary, btnDanger,
  sheetPanel, sheetHandle, sheetHandleBar, sheetFormBody,
  sheetTitle, btnDisclosure, personChipActive, personChipInactive,
  dropdownTrigger,
} from '../lib/ui'

function reminderLabel(m: number | undefined): string {
  if (m == null) return 'Ingen'
  if (m < 60) return `${m} min før`
  const hours = m / 60
  return `${hours} t før`
}

function ReminderDropdown({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', handleClick)
    return () => document.removeEventListener('pointerdown', handleClick)
  }, [open, onClose])
  if (!open) return null
  return (
    <div
      ref={ref}
      role="listbox"
      className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-zinc-200 bg-white shadow-card overflow-hidden"
    >
      {children}
    </div>
  )
}

function DropdownItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] hover:bg-zinc-50 ${active ? 'font-semibold text-zinc-900' : 'text-zinc-700'}`}
    >
      {active && (
        <svg className="h-3.5 w-3.5 shrink-0 text-zinc-900" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      )}
      {!active && <span className="h-3.5 w-3.5 shrink-0" />}
      {label}
    </button>
  )
}

function ReminderDropdownField({ reminderMinutes, setReminderMinutes }: { reminderMinutes: number | undefined; setReminderMinutes: (v: number | undefined) => void }) {
  const [open, setOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [customMinutes, setCustomMinutes] = useState(60)
  return (
    <div className="space-y-1">
      <label className={inputLabel}>Påminnelse</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => { setOpen(!open); setShowCustom(false) }}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={dropdownTrigger}
        >
          <span className={reminderMinutes == null ? 'text-zinc-400' : 'text-zinc-900'}>
            {reminderLabel(reminderMinutes)}
          </span>
          <svg className={`h-4 w-4 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
        <ReminderDropdown open={open} onClose={() => { setOpen(false); setShowCustom(false) }}>
          {[
            { value: undefined as number | undefined, label: 'Ingen' },
            { value: 5, label: '5 minutter før' },
            { value: 15, label: '15 minutter før' },
            { value: 30, label: '30 minutter før' },
            { value: 60, label: '1 time før' },
            { value: 120, label: '2 timer før' },
            { value: 1440, label: '24 timer før' },
          ].map((opt) => (
            <DropdownItem
              key={String(opt.value)}
              label={opt.label}
              active={reminderMinutes === opt.value}
              onClick={() => { setReminderMinutes(opt.value); setOpen(false); setShowCustom(false) }}
            />
          ))}
          <DropdownItem
            key="custom"
            label="Tilpasset…"
            active={false}
            onClick={() => setShowCustom(true)}
          />
          {showCustom && (
            <div className="flex items-center gap-2 border-t border-zinc-100 px-4 py-3">
              <input
                type="number"
                min={1}
                max={10080}
                value={customMinutes}
                onChange={(e) => setCustomMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 rounded-lg border border-zinc-200 px-2 py-1 text-center text-[13px] outline-none focus:border-zinc-400"
              />
              <span className="text-[13px] text-zinc-600">min før</span>
              <button
                type="button"
                onClick={() => { setReminderMinutes(customMinutes); setShowCustom(false); setOpen(false) }}
                className="ml-auto rounded-full bg-brandTeal px-3 py-1 text-[12px] font-medium text-white shadow-planner-sm"
              >
                Ferdig
              </button>
            </div>
          )}
        </ReminderDropdown>
      </div>
    </div>
  )
}

interface EditEventSheetProps {
  event: Event
  date: string
  onSave: (
    data: {
      personId: PersonId
      title: string
      start: string
      end: string
      notes?: string
      location?: string
      reminderMinutes?: number
      metadata?: Event['metadata']
    },
    newDate?: string
  ) => void | Promise<void>
  onClose: () => void
}

export function EditEventSheet({ event, date, onSave, onClose }: EditEventSheetProps) {
  const { people } = useFamily()
  const initialParticipants: PersonId[] = (() => {
    const fromMetadata = (event.metadata as any)?.participants
    if (Array.isArray(fromMetadata) && fromMetadata.length > 0) {
      return fromMetadata.filter((x: unknown): x is PersonId => typeof x === 'string')
    }
    return event.personId ? [event.personId] : []
  })()
  const [selectedPersonIds, setSelectedPersonIds] = useState<PersonId[]>(initialParticipants)
  const [title, setTitle] = useState(event.title)
  const [eventDate, setEventDate] = useState(date)
  const [start, setStart] = useState(event.start)
  const [end, setEnd] = useState(event.end)
  const [isAllDay, setIsAllDay] = useState(() => !!(event.metadata?.isAllDay))
  const [allDayEndDate, setAllDayEndDate] = useState(() => (event.metadata?.endDate as string | undefined) ?? date)
  const [notes, setNotes] = useState(event.notes ?? '')
  const [location, setLocation] = useState(event.location ?? '')
  const [reminderMinutes, setReminderMinutes] = useState<number | undefined>(event.reminderMinutes)
  const initialTransport = (event.metadata as any)?.transport as
    | { dropoffBy?: PersonId; pickupBy?: PersonId }
    | undefined
  const [dropoffBy, setDropoffBy] = useState<PersonId | undefined>(initialTransport?.dropoffBy)
  const [pickupBy, setPickupBy] = useState<PersonId | undefined>(initialTransport?.pickupBy)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showMore, setShowMore] = useState(() =>
    !!(event.location || event.notes || event.reminderMinutes != null || initialTransport?.dropoffBy || initialTransport?.pickupBy)
  )
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const isDirty = useMemo(
    () =>
      selectedPersonIds.length !== initialParticipants.length ||
      selectedPersonIds.slice().sort().join('|') !== initialParticipants.slice().sort().join('|') ||
      title !== event.title ||
      eventDate !== date ||
      start !== event.start ||
      end !== event.end ||
      isAllDay !== !!(event.metadata?.isAllDay) ||
      allDayEndDate !== ((event.metadata?.endDate as string | undefined) ?? date) ||
      notes !== (event.notes ?? '') ||
      location !== (event.location ?? '') ||
      reminderMinutes !== event.reminderMinutes ||
      initialTransport?.dropoffBy !== dropoffBy ||
      initialTransport?.pickupBy !== pickupBy,
    [selectedPersonIds, title, eventDate, date, start, end, isAllDay, allDayEndDate, notes, location, reminderMinutes, event, initialTransport, dropoffBy, pickupBy, initialParticipants]
  )
  const { guardedClose, confirming, confirmClose, cancelConfirm } = useConfirmClose(isDirty, onClose)

  const guardedCloseRef = useRef(guardedClose)
  guardedCloseRef.current = guardedClose

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
        guardedCloseRef.current()
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
  }, []) // mount-only: guardedClose accessed via ref to avoid scroll-jump on re-render

  useEffect(() => {
    const nextParticipants = (() => {
      const fromMetadata = (event.metadata as any)?.participants
      if (Array.isArray(fromMetadata) && fromMetadata.length > 0) {
        return fromMetadata.filter((x: unknown): x is PersonId => typeof x === 'string')
      }
      return event.personId ? [event.personId] : []
    })()
    setSelectedPersonIds(nextParticipants)
    setTitle(event.title)
    setEventDate(date)
    setStart(event.start)
    setEnd(event.end)
    setIsAllDay(!!(event.metadata?.isAllDay))
    setAllDayEndDate((event.metadata?.endDate as string | undefined) ?? date)
    setNotes(event.notes ?? '')
    setLocation(event.location ?? '')
    setReminderMinutes(event.reminderMinutes)
    const t = (event.metadata as any)?.transport as
      | { dropoffBy?: PersonId; pickupBy?: PersonId }
      | undefined
    setDropoffBy(t?.dropoffBy)
    setPickupBy(t?.pickupBy)
  }, [event, date])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) {
      setError('Legg inn en kort tittel.')
      return
    }
    if (!isAllDay && (!start || !end || start === end)) {
      setError('Starttid og sluttid kan ikke være like.')
      return
    }
    if (!eventDate) {
      setError('Velg en dato.')
      return
    }
    if (selectedPersonIds.length === 0) {
      setError('Velg minst én person.')
      return
    }
    setSaving(true)
    try {
      const newDate = eventDate !== date ? eventDate : undefined
      const primaryPersonId = selectedPersonIds[0]
      const saveStart = isAllDay ? '00:00' : start
      const saveEnd = isAllDay ? '23:59' : end
      await Promise.resolve(
        onSave(
          {
            personId: primaryPersonId,
            title: title.trim(),
            start: saveStart,
            end: saveEnd,
            notes: notes.trim() || undefined,
            location: location.trim() || undefined,
            reminderMinutes: isAllDay ? undefined : reminderMinutes,
            metadata: {
              ...(event.metadata ?? {}),
              participants: selectedPersonIds,
              isAllDay: isAllDay || undefined,
              endDate: (allDayEndDate && allDayEndDate > eventDate) ? allDayEndDate : undefined,
              transport:
                dropoffBy || pickupBy
                  ? {
                      ...(event.metadata as any)?.transport,
                      dropoffBy,
                      pickupBy,
                    }
                  : undefined,
            },
          },
          newDate
        )
      )
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Kunne ikke lagre endringene.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-30 bg-black/30"
        onClick={guardedClose}
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
          aria-label="Rediger hendelse"
        >
        <div className={`${sheetHandle} relative`}>
          <div className={sheetHandleBar} aria-hidden />
          <button
            type="button"
            onClick={guardedClose}
            aria-label="Lukk"
            className="absolute right-3 top-1 flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 touch-manipulation"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form className={sheetFormBody} onSubmit={handleSubmit}>
          <h2 className={sheetTitle}>Rediger hendelse</h2>

          {confirming && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 space-y-3">
              <p className="text-body-sm font-medium text-amber-900">Du har ulagrede endringer. Forkaste?</p>
              <div className="flex gap-2">
                <button type="button" onClick={cancelConfirm} className={`flex-1 ${btnSecondary}`}>Bli her</button>
                <button type="button" onClick={confirmClose} className={`flex-1 ${btnDanger}`}>Forkast</button>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className={inputLabel} htmlFor="edit-date">
              Dato
            </label>
            <input
              id="edit-date"
              type="date"
              className={inputBase}
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className={inputLabel}>Hvem</label>
            <div className="flex flex-wrap gap-1">
              {people.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelectedPersonIds((prev) => {
                      if (prev.includes(p.id)) {
                        if (prev.length === 1) return prev
                        return prev.filter((id) => id !== p.id)
                      }
                      return [...prev, p.id]
                    })
                  }}
                  className={selectedPersonIds.includes(p.id) ? personChipActive : personChipInactive}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className={inputLabel} htmlFor="edit-title">
              Tittel
            </label>
            <input
              id="edit-title"
              className={inputBase}
              placeholder="f.eks. Fotball, Lekser"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <button
            type="button"
            onClick={() => { setIsAllDay((v) => !v); setError(null) }}
            className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${
              isAllDay
                ? 'border-brandTeal/40 bg-brandTeal/8 text-brandNavy'
                : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100'
            }`}
          >
            <span>Heldagshendelse</span>
            <span
              className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                isAllDay ? 'bg-brandTeal' : 'bg-zinc-300'
              }`}
            >
              <span
                className={`h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform ${isAllDay ? 'translate-x-4' : ''}`}
              />
            </span>
          </button>

          <div className="space-y-1">
            <label className={inputLabel} htmlFor="edit-all-day-end">Sluttdato</label>
            <input
              id="edit-all-day-end"
              type="date"
              className={inputBase}
              value={allDayEndDate}
              min={eventDate}
              onChange={(e) => setAllDayEndDate(e.target.value)}
            />
            <p className="text-[11px] text-zinc-500 mt-1">Velg sluttdato for flerdagers hendelser</p>
          </div>

          {!isAllDay && (
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <label className={inputLabel} htmlFor="edit-start">Starttid</label>
                <input
                  id="edit-start"
                  type="time"
                  className={inputBase}
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className={inputLabel} htmlFor="edit-end">Sluttid</label>
                <input
                  id="edit-end"
                  type="time"
                  className={inputBase}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
            </div>
          )}

          {!isAllDay && end < start && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
              Slutter neste dag kl. {end}
            </p>
          )}

          {/* Progressive disclosure toggle */}
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className={btnDisclosure}
          >
            <svg
              className={`h-3.5 w-3.5 transition-transform duration-150 ${showMore ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
            {showMore ? 'Skjul detaljer' : 'Mer detaljer (sted, notater, påminnelse, transport)'}
          </button>

          {showMore && (
            <>
              <div className="space-y-1">
                <label className={inputLabel} htmlFor="edit-location">
                  Sted (valgfritt)
                </label>
                <input
                  id="edit-location"
                  className={inputBase}
                  placeholder="f.eks. Parken"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className={inputLabel} htmlFor="edit-notes">
                  Notater (valgfritt)
                </label>
                <textarea
                  id="edit-notes"
                  rows={2}
                  className={textareaBase}
                  placeholder="Eventuelle ekstra detaljer"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <ReminderDropdownField reminderMinutes={reminderMinutes} setReminderMinutes={setReminderMinutes} />

              {/* Transport section */}
              <div className="space-y-2 pt-1">
                <p className={typLabel}>Transport</p>
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <p className={typLabel}>Levering</p>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => setDropoffBy(undefined)}
                        className={!dropoffBy ? personChipActive : personChipInactive}
                      >
                        Ingen
                      </button>
                      {people.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setDropoffBy(p.id)}
                          className={dropoffBy === p.id ? personChipActive : personChipInactive}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className={typLabel}>Henting</p>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => setPickupBy(undefined)}
                        className={!pickupBy ? personChipActive : personChipInactive}
                      >
                        Ingen
                      </button>
                      {people.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPickupBy(p.id)}
                          className={pickupBy === p.id ? personChipActive : personChipInactive}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {error && <p className="text-caption text-rose-600">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={guardedClose} className={`flex-1 ${btnSecondary}`}>
              Avbryt
            </button>
            <button type="submit" disabled={saving} className={`flex-1 ${btnPrimary}`}>
              {saving ? 'Lagrer…' : 'Lagre'}
            </button>
          </div>
        </form>
        </motion.div>
      </div>
    </>
  )
}
