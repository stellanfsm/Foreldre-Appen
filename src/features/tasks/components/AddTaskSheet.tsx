import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { springDialog } from '../../../lib/motion'
import type { Task, PersonId } from '../../../types'
import { useFamily } from '../../../context/FamilyContext'

interface AddTaskSheetProps {
  date: string
  initialTask?: Task
  onSave: (data: Omit<Task, 'id' | 'completedAt'>) => void | Promise<void>
  onClose: () => void
}

const PERSON_NONE = '__none__'

export function AddTaskSheet({ date, initialTask, onSave, onClose }: AddTaskSheetProps) {
  const { people } = useFamily()
  const isEdit = !!initialTask

  const [title, setTitle] = useState(initialTask?.title ?? '')
  const [notes, setNotes] = useState(initialTask?.notes ?? '')
  const [dueTime, setDueTime] = useState(initialTask?.dueTime ?? '')
  const [assignedTo, setAssignedTo] = useState<string>(initialTask?.assignedToPersonId ?? PERSON_NONE)
  const [childPerson, setChildPerson] = useState<string>(initialTask?.childPersonId ?? PERSON_NONE)
  const [saving, setSaving] = useState(false)

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
      await onSave({
        title: title.trim(),
        notes: notes.trim() || undefined,
        date,
        dueTime: dueTime || undefined,
        assignedToPersonId: assignedTo !== PERSON_NONE ? (assignedTo as PersonId) : undefined,
        childPersonId: childPerson !== PERSON_NONE ? (childPerson as PersonId) : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-black/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onPointerDown={onClose}
      />
      <motion.div
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={springDialog}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-zinc-800">
            {isEdit ? 'Rediger oppgave' : 'Ny oppgave'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600"
            aria-label="Lukk"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-zinc-500">Tittel *</label>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Hva skal gjøres?"
              required
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-[14px] text-zinc-800 placeholder-zinc-400 outline-none focus:border-brandTeal focus:ring-1 focus:ring-brandTeal"
            />
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-medium text-zinc-500">Frist (klokkeslett)</label>
            <input
              type="time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-[14px] text-zinc-800 outline-none focus:border-brandTeal focus:ring-1 focus:ring-brandTeal"
            />
          </div>

          {people.length > 0 && (
            <div>
              <label className="mb-1 block text-[12px] font-medium text-zinc-500">Hvem gjelder det?</label>
              <select
                value={childPerson}
                onChange={(e) => setChildPerson(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-[14px] text-zinc-800 outline-none focus:border-brandTeal focus:ring-1 focus:ring-brandTeal"
              >
                <option value={PERSON_NONE}>Ingen</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {people.length > 0 && (
            <div>
              <label className="mb-1 block text-[12px] font-medium text-zinc-500">Ansvarlig</label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-[14px] text-zinc-800 outline-none focus:border-brandTeal focus:ring-1 focus:ring-brandTeal"
              >
                <option value={PERSON_NONE}>Ingen</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-[12px] font-medium text-zinc-500">Notater</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Valgfritt…"
              rows={3}
              className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-[14px] text-zinc-800 placeholder-zinc-400 outline-none focus:border-brandTeal focus:ring-1 focus:ring-brandTeal"
            />
          </div>

          <button
            type="submit"
            disabled={!title.trim() || saving}
            className="mt-auto w-full rounded-xl bg-brandTeal py-3 text-[14px] font-semibold text-white shadow-planner transition hover:brightness-95 active:translate-y-px disabled:opacity-40"
          >
            {saving ? 'Lagrer…' : isEdit ? 'Lagre endringer' : 'Legg til oppgave'}
          </button>
        </form>
      </motion.div>
    </>
  )
}
