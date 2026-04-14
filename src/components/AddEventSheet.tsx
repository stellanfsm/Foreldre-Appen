import { useState, useMemo, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { springDialog } from '../lib/motion'
import type { PersonId } from '../types'
import { useFamily } from '../context/FamilyContext'
import { useConfirmClose } from '../hooks/useConfirmClose'
import { requestNotificationPermission } from '../hooks/useReminders'
import { addCalendarDaysOslo } from '../lib/osloCalendar'
import {
  inputBase, textareaBase, inputLabel,
  btnPrimary, btnSecondary, btnDanger,
  sheetPanel, sheetHandle, sheetHandleBar, sheetFormBody,
  typLabel, sheetTitle, sheetSubtitle,
  btnDisclosure, personChipActive, personChipInactive, dropdownTrigger,
} from '../lib/ui'

export type RepeatFrequency = 'none' | 'daily' | 'weekly' | 'biweekly' | 'custom'

export type AddEventOptions = { repeat: RepeatFrequency; endDate: string; customIntervalDays?: number }

export const REPEAT_INTERVAL_DAYS: Record<RepeatFrequency, number> = {
  none: 0,
  daily: 1,
  weekly: 7,
  biweekly: 14,
  custom: 0,
}

interface AddEventSheetProps {
  date: string
  initialPersonId?: PersonId
  onSave: (
    data: {
      personId: PersonId
      title: string
      start: string
      end: string
      notes?: string
      reminderMinutes?: number
      metadata?: { transport?: { dropoffBy?: PersonId; pickupBy?: PersonId }; participants?: PersonId[] }
    },
    options?: AddEventOptions
  ) => void | Promise<void>
  onClose: () => void
}

const NB_WEEKDAYS: Record<number, string> = {
  0: 'Søndag', 1: 'Mandag', 2: 'Tirsdag', 3: 'Onsdag',
  4: 'Torsdag', 5: 'Fredag', 6: 'Lørdag',
}
const NB_MONTHS: Record<number, string> = {
  0: 'januar', 1: 'februar', 2: 'mars', 3: 'april',
  4: 'mai', 5: 'juni', 6: 'juli', 7: 'august',
  8: 'september', 9: 'oktober', 10: 'november', 11: 'desember',
}

function formatDisplayDate(dateKey: string): string {
  const d = new Date(dateKey + 'T12:00:00')
  return `${NB_WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${NB_MONTHS[d.getMonth()]}`
}

function addWeeks(dateKey: string, weeks: number): string {
  return addCalendarDaysOslo(dateKey, weeks * 7)
}

function repeatLabel(r: RepeatFrequency, customDays: number): string {
  if (r === 'none') return 'Ingen'
  if (r === 'daily') return 'Daglig'
  if (r === 'weekly') return 'Ukentlig'
  if (r === 'biweekly') return 'Hver 2. uke'
  if (r === 'custom') return customDays > 0 ? `Hver ${customDays}. dag` : 'Tilpasset…'
  return 'Ingen'
}

function reminderLabel(m: number | undefined): string {
  if (m == null) return 'Ingen'
  if (m < 60) return `${m} min før`
  const hours = m / 60
  return `${hours} t før`
}

function Dropdown({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
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

export function AddEventSheet({ date, initialPersonId, onSave, onClose }: AddEventSheetProps) {
  const { people } = useFamily()
  const [selectedPersonIds, setSelectedPersonIds] = useState<PersonId[]>(initialPersonId ? [initialPersonId] : [])
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('15:00')
  const [end, setEnd] = useState('16:00')
  const [isAllDay, setIsAllDay] = useState(false)
  const [allDayEndDate, setAllDayEndDate] = useState(date)
  const [repeat, setRepeat] = useState<RepeatFrequency>('none')
  const [customIntervalDays, setCustomIntervalDays] = useState(3)
  const [endDate, setEndDate] = useState(() => addWeeks(date, 12))
  const [reminderMinutes, setReminderMinutes] = useState<number | undefined>(undefined)
  const [notes, setNotes] = useState('')
  const [dropoffBy, setDropoffBy] = useState<PersonId | null>(null)
  const [pickupBy, setPickupBy] = useState<PersonId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  )
  const [repeatOpen, setRepeatOpen] = useState(false)
  const [reminderOpen, setReminderOpen] = useState(false)
  const [showCustomReminder, setShowCustomReminder] = useState(false)
  const [customReminderInput, setCustomReminderInput] = useState(60)
  const [showMore, setShowMore] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const isDirty = useMemo(() => {
    const initialLen = initialPersonId ? 1 : 0
    const initialFirst = initialPersonId ?? null
    return (
      title.trim() !== ''
      || start !== '15:00'
      || end !== '16:00'
      || isAllDay
      || selectedPersonIds.length !== initialLen
      || (selectedPersonIds[0] ?? null) !== initialFirst
      || repeat !== 'none'
      || notes.trim() !== ''
      || reminderMinutes !== undefined
      || allDayEndDate !== date
      || dropoffBy !== null
      || pickupBy !== null
    )
  }, [title, start, end, isAllDay, selectedPersonIds, initialPersonId, repeat, notes, reminderMinutes, allDayEndDate, date, dropoffBy, pickupBy])
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
    if (allDayEndDate && allDayEndDate < date) {
      setError('Sluttdato kan ikke være før startdato.')
      return
    }
    if (repeat !== 'none' && endDate && endDate < date) {
      setError('Sluttdato må være lik eller etter startdato.')
      return
    }
    if (repeat === 'custom' && customIntervalDays < 1) {
      setError('Tilpasset intervall må være minst 1 dag.')
      return
    }
    if (selectedPersonIds.length === 0) {
      setError('Velg minst én person.')
      return
    }
    const primaryPersonId = selectedPersonIds[0]
    setSaving(true)
    try {
      const saveStart = isAllDay ? '00:00' : start
      const saveEnd = isAllDay ? '23:59' : end
      const data: Parameters<AddEventSheetProps['onSave']>[0] = {
        personId: primaryPersonId,
        title: title.trim(),
        start: saveStart,
        end: saveEnd,
        notes: notes.trim() || undefined,
        reminderMinutes: isAllDay ? undefined : reminderMinutes,
      }
      data.metadata = {
        participants: selectedPersonIds,
        ...(isAllDay ? { isAllDay: true } : {}),
        ...(allDayEndDate && allDayEndDate > date ? { endDate: allDayEndDate } : {}),
        ...(dropoffBy || pickupBy
          ? {
              transport: {
                ...(dropoffBy ? { dropoffBy } : {}),
                ...(pickupBy ? { pickupBy } : {}),
              },
            }
          : {}),
      }
      const options =
        repeat !== 'none' && endDate
          ? { repeat, endDate, customIntervalDays: repeat === 'custom' ? customIntervalDays : undefined }
          : undefined
      await Promise.resolve(onSave(data, options))
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Kunne ikke lagre hendelsen.')
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
          aria-label="Legg til hendelse"
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
          <h2 className={sheetTitle}>Legg til hendelse</h2>
          <p className={sheetSubtitle}>{formatDisplayDate(date)}</p>

          {confirming && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 space-y-3">
              <p className="text-body-sm font-medium text-amber-900">Du har ulagrede endringer. Forkaste?</p>
              <div className="flex gap-2">
                <button type="button" onClick={cancelConfirm} className={`flex-1 ${btnSecondary}`}>Bli her</button>
                <button type="button" onClick={confirmClose} className={`flex-1 ${btnDanger}`}>Forkast</button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className={typLabel}>Hvem</label>
            <div className="flex flex-wrap gap-1">
              {people.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelectedPersonIds((prev) => {
                      if (prev.includes(p.id)) {
                        if (prev.length === 1) return prev // must keep at least one
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

          <div className="space-y-1.5">
            <label className={inputLabel} htmlFor="title">Tittel</label>
            <input
              id="title"
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

          {!isAllDay && (
            <div className="flex gap-3">
              <div className="flex-1 space-y-1.5">
                <label className={inputLabel} htmlFor="start">Starttid</label>
                <input
                  id="start"
                  type="time"
                  className={inputBase}
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <label className={inputLabel} htmlFor="end">Sluttid</label>
                <input
                  id="end"
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

          <div className="space-y-1.5">
            <label className={inputLabel} htmlFor="all-day-end">Sluttdato</label>
            <input
              id="all-day-end"
              type="date"
              className={inputBase}
              value={allDayEndDate}
              min={date}
              onChange={(e) => setAllDayEndDate(e.target.value)}
            />
            <p className="text-[11px] text-zinc-500">Velg sluttdato for flerdagers hendelser</p>
          </div>

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
            {showMore ? 'Skjul ekstradetaljer' : 'Mer (gjentak, påminnelse, transport)'}
          </button>

          {showMore && (
            <>
              {/* Repeat dropdown */}
              <div className="space-y-1">
                <label className={inputLabel}>Gjentakelse</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setRepeatOpen(!repeatOpen); setReminderOpen(false) }}
                    aria-haspopup="listbox"
                    aria-expanded={repeatOpen}
                    className={dropdownTrigger}
                  >
                    <span className={repeat === 'none' ? 'text-zinc-400' : 'text-zinc-900'}>
                      {repeatLabel(repeat, customIntervalDays)}
                    </span>
                    <svg className={`h-4 w-4 text-zinc-400 transition-transform ${repeatOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  <Dropdown open={repeatOpen} onClose={() => setRepeatOpen(false)}>
                    {(['none', 'daily', 'weekly', 'biweekly', 'custom'] as RepeatFrequency[]).map((val) => (
                      <DropdownItem
                        key={val}
                        label={repeatLabel(val, 0)}
                        active={repeat === val}
                        onClick={() => { setRepeat(val); if (val !== 'custom') setRepeatOpen(false) }}
                      />
                    ))}
                    {repeat === 'custom' && (
                      <div className="flex items-center gap-2 border-t border-zinc-100 px-4 py-3">
                        <span className="text-[13px] text-zinc-600">Hver</span>
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={customIntervalDays}
                          onChange={(e) => setCustomIntervalDays(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-16 rounded-lg border border-zinc-200 px-2 py-1 text-center text-[13px] outline-none focus:border-zinc-400"
                        />
                        <span className="text-[13px] text-zinc-600">dag</span>
                        <button
                          type="button"
                          onClick={() => setRepeatOpen(false)}
                          className="ml-auto rounded-full bg-brandTeal px-3 py-1 text-[12px] font-medium text-white shadow-planner-sm"
                        >
                          Ferdig
                        </button>
                      </div>
                    )}
                  </Dropdown>
                </div>
              </div>

              {repeat !== 'none' && (
                <div className="space-y-1.5">
                  <label className={inputLabel} htmlFor="end-date">Sluttdato</label>
                  <input
                    id="end-date"
                    type="date"
                    value={endDate}
                    min={date}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={inputBase}
                  />
                  <p className="text-[11px] text-zinc-500">
                    Gjentas {repeat === 'custom' ? `hver ${customIntervalDays}. dag` : repeat === 'daily' ? 'hver dag' : repeat === 'biweekly' ? 'hver 2. uke' : 'hver uke'} til denne datoen
                  </p>
                </div>
              )}

              {/* Reminder dropdown */}
              <div className="space-y-1">
                <label className={inputLabel}>Påminnelse</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setReminderOpen(!reminderOpen); setRepeatOpen(false); setShowCustomReminder(false) }}
                    aria-haspopup="listbox"
                    aria-expanded={reminderOpen}
                    className={dropdownTrigger}
                  >
                    <span className={reminderMinutes == null ? 'text-zinc-400' : 'text-zinc-900'}>
                      {reminderLabel(reminderMinutes)}
                    </span>
                    <svg className={`h-4 w-4 text-zinc-400 transition-transform ${reminderOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  <Dropdown open={reminderOpen} onClose={() => { setReminderOpen(false); setShowCustomReminder(false) }}>
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
                        onClick={() => { setReminderMinutes(opt.value); setReminderOpen(false); setShowCustomReminder(false) }}
                      />
                    ))}
                    <DropdownItem
                      key="custom"
                      label="Tilpasset…"
                      active={false}
                      onClick={() => setShowCustomReminder(true)}
                    />
                    {showCustomReminder && (
                      <div className="flex items-center gap-2 border-t border-zinc-100 px-4 py-3">
                        <input
                          type="number"
                          min={1}
                          max={10080}
                          value={customReminderInput}
                          onChange={(e) => setCustomReminderInput(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-16 rounded-lg border border-zinc-200 px-2 py-1 text-center text-[13px] outline-none focus:border-zinc-400"
                        />
                        <span className="text-[13px] text-zinc-600">min før</span>
                        <button
                          type="button"
                          onClick={() => { setReminderMinutes(customReminderInput); setShowCustomReminder(false); setReminderOpen(false) }}
                          className="ml-auto rounded-full bg-brandTeal px-3 py-1 text-[12px] font-medium text-white shadow-planner-sm"
                        >
                          Ferdig
                        </button>
                      </div>
                    )}
                  </Dropdown>
                </div>
              </div>

              {reminderMinutes !== undefined && notifPermission !== 'granted' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-800">
                  <p>Påminnelsen virker ikke uten varslingstillatelse.</p>
                  {notifPermission !== 'denied' && (
                    <button
                      type="button"
                      onClick={async () => {
                        const p = await requestNotificationPermission()
                        setNotifPermission(p)
                      }}
                      className="mt-1 font-medium underline underline-offset-2"
                    >
                      Gi tillatelse
                    </button>
                  )}
                </div>
              )}

              {/* Notes */}
              <div className="space-y-1.5">
                <label className={inputLabel} htmlFor="add-notes">Notater (valgfritt)</label>
                <textarea
                  id="add-notes"
                  rows={2}
                  className={textareaBase}
                  placeholder="Eventuelle ekstra detaljer"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Transport */}
              <div className="space-y-2 pt-1">
                <p className={typLabel}>Levering og henting</p>
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <p className={typLabel}>Levert av</p>
                    <div className="flex flex-wrap gap-1">
                      <button type="button" onClick={() => setDropoffBy(null)} className={dropoffBy === null ? personChipActive : personChipInactive}>Ingen</button>
                      {people.map((p) => (
                        <button key={p.id} type="button" onClick={() => setDropoffBy(p.id)} className={dropoffBy === p.id ? personChipActive : personChipInactive}>{p.name}</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className={typLabel}>Hentes av</p>
                    <div className="flex flex-wrap gap-1">
                      <button type="button" onClick={() => setPickupBy(null)} className={pickupBy === null ? personChipActive : personChipInactive}>Ingen</button>
                      {people.map((p) => (
                        <button key={p.id} type="button" onClick={() => setPickupBy(p.id)} className={pickupBy === p.id ? personChipActive : personChipInactive}>{p.name}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {error && <p className="text-caption text-rose-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={guardedClose}
              className={`flex-1 ${btnSecondary}`}
            >
              Avbryt
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`flex-1 ${btnPrimary}`}
            >
              {saving ? 'Lagrer…' : 'Legg til'}
            </button>
          </div>
        </form>
        </motion.div>
      </div>
    </>
  )
}
