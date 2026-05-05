import { useState, useEffect, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import { springDialog } from '../../../lib/motion'
import type { Task, PersonId, TaskIntent } from '../../../types'
import { taskIntentLabelNb } from '../../../lib/taskIntent'
import { useFamily } from '../../../context/FamilyContext'
import { useConfirmClose } from '../../../hooks/useConfirmClose'
import {
  inputBase, textareaBase, selectBase, inputLabel,
  btnPrimary, btnSecondary, btnDanger, btnDisclosure,
  sheetPanel, sheetHandle, sheetHandleBar, sheetFormBody,
  sheetTitle,
} from '../../../lib/ui'

interface AddTaskSheetProps {
  date: string
  initialTask?: Task
  onSave: (data: Omit<Task, 'id' | 'completedAt'>) => void | Promise<void>
  onClose: () => void
}

const PERSON_NONE = '__none__'
const LAST_ASSIGNED_KEY = 'foreldre_task_last_assigned'

export function AddTaskSheet({ date, initialTask, onSave, onClose }: AddTaskSheetProps) {
  const { people } = useFamily()
  const isEdit = !!initialTask

  const [taskDate, setTaskDate] = useState(initialTask?.date ?? date)
  const [title, setTitle] = useState(initialTask?.title ?? '')
  const [notes, setNotes] = useState(initialTask?.notes ?? '')
  const [dueTime, setDueTime] = useState(initialTask?.dueTime ?? '')
  const [assignedTo, setAssignedTo] = useState<string>(() => {
    if (initialTask?.assignedToPersonId) return initialTask.assignedToPersonId
    try { return localStorage.getItem(LAST_ASSIGNED_KEY) ?? PERSON_NONE } catch { return PERSON_NONE }
  })
  const [childPerson, setChildPerson] = useState<string>(initialTask?.childPersonId ?? PERSON_NONE)
  const [showInMonthView, setShowInMonthView] = useState(initialTask?.showInMonthView ?? false)
  const [taskIntent, setTaskIntent] = useState<TaskIntent>(initialTask?.taskIntent ?? 'must_do')
  const [saving, setSaving] = useState(false)

  const isDirty = useMemo(
    () =>
      title !== (initialTask?.title ?? '')
      || taskDate !== (initialTask?.date ?? date)
      || notes !== (initialTask?.notes ?? '')
      || dueTime !== (initialTask?.dueTime ?? '')
      || showInMonthView !== (initialTask?.showInMonthView ?? false)
      || taskIntent !== (initialTask?.taskIntent ?? 'must_do'),
    [title, taskDate, notes, dueTime, showInMonthView, taskIntent, initialTask, date]
  )
  const { guardedClose, confirming, confirmClose, cancelConfirm } = useConfirmClose(isDirty, onClose)
  const [showMore, setShowMore] = useState(() => {
    if (!initialTask) return false
    return !!(initialTask.dueTime || initialTask.assignedToPersonId || initialTask.childPersonId || initialTask.notes || initialTask.showInMonthView)
  })

  const titleRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const t = setTimeout(() => titleRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true)
    try {
      if (assignedTo !== PERSON_NONE) {
        try { localStorage.setItem(LAST_ASSIGNED_KEY, assignedTo) } catch {}
      }
      await onSave({
        title: title.trim(),
        notes: notes.trim() || undefined,
        date: taskDate,
        dueTime: dueTime || undefined,
        assignedToPersonId: assignedTo !== PERSON_NONE ? (assignedTo as PersonId) : undefined,
        childPersonId: childPerson !== PERSON_NONE ? (childPerson as PersonId) : undefined,
        showInMonthView: showInMonthView || undefined,
        taskIntent,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <motion.div
        className="fixed inset-0 z-30 bg-black/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={guardedClose}
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-0 z-40 flex items-end justify-center px-3">
      <motion.div
        className={sheetPanel}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={springDialog}
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Rediger gjøremål' : 'Nytt gjøremål'}
      >
        <div className={`${sheetHandle} relative`}>
          <div className={sheetHandleBar} aria-hidden />
          <button
            type="button"
            onClick={guardedClose}
            aria-label="Lukk"
            className="absolute right-3 top-1 flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 transition hover:bg-neutral-200 hover:text-neutral-600 touch-manipulation"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className={sheetFormBody}>
          <h2 className={sheetTitle}>{isEdit ? 'Rediger gjøremål' : 'Nytt gjøremål'}</h2>
          <div className="space-y-1.5">
            <label className={inputLabel} htmlFor="task-title">Tittel *</label>
            <input
              id="task-title"
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Hva skal gjøres?"
              required
              className={inputBase}
            />
          </div>

          <div className="space-y-1.5">
            <label className={inputLabel} htmlFor="task-date">Dato *</label>
            <input
              id="task-date"
              type="date"
              value={taskDate}
              onChange={(e) => setTaskDate(e.target.value)}
              required
              className={inputBase}
            />
          </div>

          <div className="space-y-1">
            <span className={inputLabel}>Type</span>
            <div className="flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
              {(['must_do', 'can_help'] as const).map((intent) => (
                <button
                  key={intent}
                  type="button"
                  onClick={() => setTaskIntent(intent)}
                  className={`flex-1 rounded-lg px-2 py-2 text-[12px] font-semibold transition touch-manipulation ${
                    taskIntent === intent
                      ? intent === 'must_do'
                        ? 'bg-neutral-100 text-neutral-600 shadow-sm ring-1 ring-neutral-200'
                        : 'bg-primary-50 text-primary-700 shadow-sm ring-1 ring-primary-100'
                      : 'text-neutral-400'
                  }`}
                >
                  {taskIntentLabelNb(intent)}
                </button>
              ))}
            </div>
          </div>

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
            {showMore ? 'Skjul ekstradetaljer' : 'Mer (klokkeslett, person, notater)'}
          </button>

          {showMore && (
            <>
              <div className="space-y-1.5">
                <label className={inputLabel} htmlFor="task-time">Frist (klokkeslett)</label>
                <input
                  id="task-time"
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className={inputBase}
                />
              </div>

              {people.length > 0 && (
                <div className="space-y-1.5">
                  <label className={inputLabel} htmlFor="task-child">Hvem gjelder det?</label>
                  <select
                    id="task-child"
                    value={childPerson}
                    onChange={(e) => setChildPerson(e.target.value)}
                    className={selectBase}
                  >
                    <option value={PERSON_NONE}>Ingen</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {people.length > 0 && (
                <div className="space-y-1.5">
                  <label className={inputLabel} htmlFor="task-assigned">Ansvarlig</label>
                  <select
                    id="task-assigned"
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    className={selectBase}
                  >
                    <option value={PERSON_NONE}>Ingen</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className={inputLabel} htmlFor="task-notes">Notater</label>
                <textarea
                  id="task-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Valgfritt…"
                  rows={3}
                  className={textareaBase}
                />
              </div>

              <div className="flex items-center justify-between gap-3 py-0.5">
                <label
                  htmlFor="task-month-view"
                  className={`flex-1 cursor-pointer select-none ${inputLabel}`}
                >
                  Vis i månedsoversikt
                </label>
                <button
                  id="task-month-view"
                  type="button"
                  role="switch"
                  aria-checked={showInMonthView}
                  onClick={() => setShowInMonthView((v) => !v)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600/50 ${
                    showInMonthView ? 'bg-primary-600' : 'bg-neutral-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                      showInMonthView ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </>
          )}

          {confirming && (
            <div className="rounded-lg border border-accent-sun-tint bg-accent-sun-tint p-3.5 space-y-3">
              <p className="text-body-sm font-medium text-neutral-600">Du har ulagrede endringer. Forkaste?</p>
              <div className="flex gap-2">
                <button type="button" onClick={cancelConfirm} className={`flex-1 ${btnSecondary}`}>Bli her</button>
                <button type="button" onClick={confirmClose} className={`flex-1 ${btnDanger}`}>Forkast</button>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={guardedClose} className={`flex-1 ${btnSecondary}`}>
              Avbryt
            </button>
            <button type="submit" disabled={!title.trim() || saving} className={`flex-1 ${btnPrimary}`}>
              {saving ? 'Lagrer…' : isEdit ? 'Lagre endringer' : 'Legg til gjøremål'}
            </button>
          </div>
        </form>
      </motion.div>
      </div>
    </>
  )
}
