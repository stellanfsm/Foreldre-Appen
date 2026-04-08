import { useState, useEffect, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { springDialog } from '../lib/motion'
import type { Event, PersonId } from '../types'
import { useFamily } from '../context/FamilyContext'
import { useConfirmClose } from '../hooks/useConfirmClose'

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
  return (
    <div className="space-y-1">
      <label className="text-[12px] font-medium text-zinc-600">Påminnelse</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex w-full items-center justify-between rounded-full border border-zinc-200 px-4 py-2 text-[14px] outline-none hover:border-zinc-300 focus:border-zinc-400"
        >
          <span className={reminderMinutes == null ? 'text-zinc-400' : 'text-zinc-900'}>
            {reminderLabel(reminderMinutes)}
          </span>
          <svg className={`h-4 w-4 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
        <ReminderDropdown open={open} onClose={() => setOpen(false)}>
          {[
            { value: undefined as number | undefined, label: 'Ingen' },
            { value: 5, label: '5 minutter før' },
            { value: 15, label: '15 minutter før' },
            { value: 30, label: '30 minutter før' },
            { value: 60, label: '1 time før' },
            { value: 120, label: '2 timer før' },
          ].map((opt) => (
            <DropdownItem
              key={String(opt.value)}
              label={opt.label}
              active={reminderMinutes === opt.value}
              onClick={() => { setReminderMinutes(opt.value); setOpen(false) }}
            />
          ))}
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
      notes !== (event.notes ?? '') ||
      location !== (event.location ?? '') ||
      reminderMinutes !== event.reminderMinutes ||
      initialTransport?.dropoffBy !== dropoffBy ||
      initialTransport?.pickupBy !== pickupBy,
    [selectedPersonIds, title, eventDate, date, start, end, notes, location, reminderMinutes, event, initialTransport, dropoffBy, pickupBy, initialParticipants]
  )
  const guardedClose = useConfirmClose(isDirty, onClose)

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
        guardedClose()
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
  }, [guardedClose])

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
    if (!start || !end || start === end) {
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
      await Promise.resolve(
        onSave(
          {
            personId: primaryPersonId,
            title: title.trim(),
            start,
            end,
            notes: notes.trim() || undefined,
            location: location.trim() || undefined,
            reminderMinutes,
            metadata: {
              ...(event.metadata ?? {}),
              participants: selectedPersonIds,
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
          className="pointer-events-auto flex w-full min-h-[52dvh] max-h-[min(92dvh,920px)] flex-col overflow-y-auto overflow-x-hidden rounded-t-[28px] bg-white shadow-card"
          role="dialog"
          aria-modal="true"
          aria-label="Rediger aktivitet"
        >
        <div className="sticky top-0 z-10 flex shrink-0 justify-center bg-white py-2">
          <div className="h-1 w-10 rounded-full bg-zinc-200" aria-hidden />
        </div>
        <form className="flex min-h-0 flex-1 flex-col px-6 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-2 space-y-4" onSubmit={handleSubmit}>
          <h2 className="text-[18px] font-semibold text-zinc-900">Rediger aktivitet</h2>

          <div className="space-y-1">
            <label className="text-[12px] font-medium text-zinc-600" htmlFor="edit-date">
              Dato
            </label>
            <input
              id="edit-date"
              type="date"
              className="w-full rounded-full border border-zinc-200 px-3 py-2 text-[14px] outline-none focus:border-zinc-400"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[12px] font-medium text-zinc-600">Hvem</label>
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
                  className={`rounded-full px-3 py-1 text-[12px] font-medium ${
                    selectedPersonIds.includes(p.id)
                      ? 'bg-brandNavy text-white'
                      : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[12px] font-medium text-zinc-600" htmlFor="edit-title">
              Tittel
            </label>
            <input
              id="edit-title"
              className="w-full rounded-full border border-zinc-200 px-3 py-2 text-[14px] outline-none focus:border-zinc-400"
              placeholder="f.eks. Fotball, Lekser"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-[12px] font-medium text-zinc-600" htmlFor="edit-start">
                Start
              </label>
              <input
                id="edit-start"
                type="time"
                className="w-full rounded-full border border-zinc-200 px-3 py-2 text-[14px] outline-none focus:border-zinc-400"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-[12px] font-medium text-zinc-600" htmlFor="edit-end">
                Slutt
              </label>
              <input
                id="edit-end"
                type="time"
                className="w-full rounded-full border border-zinc-200 px-3 py-2 text-[14px] outline-none focus:border-zinc-400"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>

          {/* Progressive disclosure toggle */}
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="flex items-center gap-1.5 text-[12px] font-medium text-brandTeal hover:text-brandTeal/80"
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
                <label className="text-[12px] font-medium text-zinc-600" htmlFor="edit-location">
                  Sted (valgfritt)
                </label>
                <input
                  id="edit-location"
                  className="w-full rounded-full border border-zinc-200 px-3 py-2 text-[14px] outline-none focus:border-zinc-400"
                  placeholder="f.eks. Parken"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[12px] font-medium text-zinc-600" htmlFor="edit-notes">
                  Notater (valgfritt)
                </label>
                <textarea
                  id="edit-notes"
                  rows={2}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-[14px] outline-none focus:border-zinc-400 resize-none"
                  placeholder="Eventuelle ekstra detaljer"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <ReminderDropdownField reminderMinutes={reminderMinutes} setReminderMinutes={setReminderMinutes} />

              {/* Transport section */}
              <div className="space-y-2 pt-1">
                <p className="text-[12px] font-medium text-zinc-600">Transport</p>
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <p className="text-[11px] font-medium text-zinc-500">Levering</p>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => setDropoffBy(undefined)}
                        className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                          !dropoffBy ? 'bg-brandNavy text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                        }`}
                      >
                        Ingen
                      </button>
                      {people.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setDropoffBy(p.id)}
                          className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                            dropoffBy === p.id
                              ? 'bg-brandNavy text-white'
                              : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                          }`}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-[11px] font-medium text-zinc-500">Henting</p>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => setPickupBy(undefined)}
                        className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                          !pickupBy ? 'bg-brandNavy text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                        }`}
                      >
                        Ingen
                      </button>
                      {people.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPickupBy(p.id)}
                          className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                            pickupBy === p.id
                              ? 'bg-brandNavy text-white'
                              : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                          }`}
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

          {error && <p className="text-[12px] text-red-500">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={guardedClose}
              className="flex-1 rounded-full border border-zinc-200 py-2.5 text-[14px] font-medium text-zinc-700"
            >
              Avbryt
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-full bg-brandTeal py-2.5 text-[14px] font-semibold text-white shadow-planner transition hover:brightness-95 disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-brandTeal focus:ring-offset-2"
            >
              {saving ? 'Lagrer…' : 'Lagre'}
            </button>
          </div>
        </form>
        </motion.div>
      </div>
    </>
  )
}
