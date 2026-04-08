import { useState, useMemo, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { springDialog } from '../lib/motion'
import type { PersonId } from '../types'
import { useFamily } from '../context/FamilyContext'
import { useConfirmClose } from '../hooks/useConfirmClose'
import { addCalendarDaysOslo } from '../lib/osloCalendar'

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
      reminderMinutes?: number
      metadata?: { transport?: { dropoffBy?: PersonId; pickupBy?: PersonId }; participants?: PersonId[] }
    },
    options?: AddEventOptions
  ) => void | Promise<void>
  onClose: () => void
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

export function AddEventSheet({ date, initialPersonId = 'family', onSave, onClose }: AddEventSheetProps) {
  const { people } = useFamily()
  const [selectedPersonIds, setSelectedPersonIds] = useState<PersonId[]>([initialPersonId])
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('15:00')
  const [end, setEnd] = useState('16:00')
  const [repeat, setRepeat] = useState<RepeatFrequency>('none')
  const [customIntervalDays, setCustomIntervalDays] = useState(3)
  const [endDate, setEndDate] = useState(() => addWeeks(date, 12))
  const [reminderMinutes, setReminderMinutes] = useState<number | undefined>(undefined)
  const [dropoffBy, setDropoffBy] = useState<PersonId | null>(null)
  const [pickupBy, setPickupBy] = useState<PersonId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [repeatOpen, setRepeatOpen] = useState(false)
  const [reminderOpen, setReminderOpen] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const isDirty = useMemo(
    () =>
      title.trim() !== ''
      || start !== '15:00'
      || end !== '16:00'
      || selectedPersonIds.length !== 1
      || (selectedPersonIds[0] ?? null) !== initialPersonId
      || repeat !== 'none',
    [title, start, end, selectedPersonIds, initialPersonId, repeat]
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
      const data: Parameters<AddEventSheetProps['onSave']>[0] = {
        personId: primaryPersonId,
        title: title.trim(),
        start,
        end,
        reminderMinutes,
      }
      data.metadata = {
        participants: selectedPersonIds,
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
      setError(err instanceof Error ? err.message : 'Kunne ikke lagre aktiviteten.')
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
          className="pointer-events-auto flex w-full min-h-[52dvh] max-h-[min(92dvh,920px)] flex-col overflow-y-auto overflow-x-hidden rounded-t-[28px] bg-white shadow-card scrollbar-none"
          role="dialog"
          aria-modal="true"
          aria-label="Legg til aktivitet"
        >
        <div className="sticky top-0 z-10 flex shrink-0 justify-center bg-white py-2">
          <div className="h-1 w-10 rounded-full bg-zinc-200" aria-hidden />
        </div>
        <form className="flex min-h-0 flex-1 flex-col px-6 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-2 space-y-4" onSubmit={handleSubmit}>
          <h2 className="text-[18px] font-semibold text-zinc-900">Legg til aktivitet</h2>
          <p className="text-[13px] text-zinc-500">{date}</p>

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
                        if (prev.length === 1) return prev // must keep at least one
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
            <label className="text-[12px] font-medium text-zinc-600" htmlFor="title">
              Tittel
            </label>
            <input
              id="title"
              className="w-full rounded-full border border-zinc-200 px-3 py-2 text-[14px] outline-none focus:border-zinc-400"
              placeholder="f.eks. Fotball, Lekser"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-[12px] font-medium text-zinc-600" htmlFor="start">
                Start
              </label>
              <input
                id="start"
                type="time"
                className="w-full rounded-full border border-zinc-200 px-3 py-2 text-[14px] outline-none focus:border-zinc-400"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-[12px] font-medium text-zinc-600" htmlFor="end">
                End
              </label>
              <input
                id="end"
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
            {showMore ? 'Skjul detaljer' : 'Mer detaljer (gjentak, påminnelse, transport)'}
          </button>

          {showMore && (
            <>
              {/* Repeat dropdown */}
              <div className="space-y-1">
                <label className="text-[12px] font-medium text-zinc-600">Gjentakelse</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setRepeatOpen(!repeatOpen); setReminderOpen(false) }}
                    aria-haspopup="listbox"
                    aria-expanded={repeatOpen}
                    className="flex w-full items-center justify-between rounded-full border border-zinc-200 px-4 py-2 text-[14px] outline-none hover:border-zinc-300 focus:border-zinc-400"
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
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-zinc-600" htmlFor="end-date">
                    Sluttdato
                  </label>
                  <input
                    id="end-date"
                    type="date"
                    value={endDate}
                    min={date}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-full border border-zinc-200 px-3 py-2 text-[14px] outline-none focus:border-zinc-400"
                  />
                  <p className="text-[11px] text-zinc-500">
                    Gjentas {repeat === 'custom' ? `hver ${customIntervalDays}. dag` : repeat === 'daily' ? 'hver dag' : repeat === 'biweekly' ? 'hver 2. uke' : 'hver uke'} til denne datoen
                  </p>
                </div>
              )}

              {/* Reminder dropdown */}
              <div className="space-y-1">
                <label className="text-[12px] font-medium text-zinc-600">Påminnelse</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setReminderOpen(!reminderOpen); setRepeatOpen(false) }}
                    aria-haspopup="listbox"
                    aria-expanded={reminderOpen}
                    className="flex w-full items-center justify-between rounded-full border border-zinc-200 px-4 py-2 text-[14px] outline-none hover:border-zinc-300 focus:border-zinc-400"
                  >
                    <span className={reminderMinutes == null ? 'text-zinc-400' : 'text-zinc-900'}>
                      {reminderLabel(reminderMinutes)}
                    </span>
                    <svg className={`h-4 w-4 text-zinc-400 transition-transform ${reminderOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  <Dropdown open={reminderOpen} onClose={() => setReminderOpen(false)}>
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
                        onClick={() => { setReminderMinutes(opt.value); setReminderOpen(false) }}
                      />
                    ))}
                  </Dropdown>
                </div>
              </div>

              {/* Transport */}
              <div className="space-y-2">
                <label className="text-[12px] font-medium text-zinc-600">Levering og henting</label>
                <div className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-[12px] text-zinc-500">Levert av</span>
                  <select
                    value={dropoffBy ?? ''}
                    onChange={(e) => setDropoffBy(e.target.value ? (e.target.value as PersonId) : null)}
                    className="flex-1 rounded-full border border-zinc-200 px-4 py-2 text-[14px] outline-none focus:border-zinc-400 bg-white"
                  >
                    <option value="">Ingen</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-[12px] text-zinc-500">Hentes av</span>
                  <select
                    value={pickupBy ?? ''}
                    onChange={(e) => setPickupBy(e.target.value ? (e.target.value as PersonId) : null)}
                    className="flex-1 rounded-full border border-zinc-200 px-4 py-2 text-[14px] outline-none focus:border-zinc-400 bg-white"
                  >
                    <option value="">Ingen</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
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
              {saving ? 'Lagrer…' : 'Legg til'}
            </button>
          </div>
        </form>
        </motion.div>
      </div>
    </>
  )
}
