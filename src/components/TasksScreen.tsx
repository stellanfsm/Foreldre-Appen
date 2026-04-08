import { useState, useMemo } from 'react'
import { OnboardingHint } from './OnboardingHint'
import type { Task } from '../types'
import type { WeekDayLayout } from '../hooks/useScheduleState'
import { useFamily } from '../context/FamilyContext'
import { todayKeyOslo } from '../lib/osloCalendar'

const NB_DAYS: Record<number, string> = {
  0: 'Søndag',
  1: 'Mandag',
  2: 'Tirsdag',
  3: 'Onsdag',
  4: 'Torsdag',
  5: 'Fredag',
  6: 'Lørdag',
}

function formatDayLabel(dateKey: string): string {
  const d = new Date(dateKey + 'T12:00:00')
  const dayName = NB_DAYS[d.getDay()] ?? ''
  return `${dayName} ${d.getDate()}.`
}

export interface TasksScreenProps {
  weekLayoutData: WeekDayLayout[]
  tasksByDate: Record<string, Task[]>
  openAddTask: () => void
  onCompleteTask: (task: Task) => void
  onUndoCompleteTask: (task: Task) => void
  onEditTask: (task: Task) => void
  onDeleteTask: (task: Task) => void
}

interface TaskItemProps {
  task: Task
  personName?: string
  onComplete: () => void
  onUndoComplete: () => void
  onEdit: () => void
  onDelete: () => void
}

function TaskItem({ task, personName, onComplete, onUndoComplete, onEdit, onDelete }: TaskItemProps) {
  const isDone = !!task.completedAt
  return (
    <div className={`flex items-start gap-2.5 py-2.5 ${isDone ? 'opacity-50' : ''}`}>
      <button
        type="button"
        onClick={() => (isDone ? onUndoComplete() : onComplete())}
        className="mt-0.5 shrink-0"
        aria-label={isDone ? 'Angre ferdig' : 'Merk som ferdig'}
      >
        {isDone ? (
          <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        ) : (
          <svg className="h-5 w-5 text-zinc-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <circle cx="12" cy="12" r="9" />
          </svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-[14px] font-medium leading-snug ${isDone ? 'text-zinc-400 line-through' : 'text-zinc-800'}`}>
          {task.title}
        </p>
        {task.dueTime && !isDone && (
          <p className="mt-0.5 text-[12px] font-semibold text-amber-600">Frist: {task.dueTime}</p>
        )}
        {personName && !isDone && (
          <p className="mt-0.5 text-[12px] text-zinc-400">{personName}</p>
        )}
        {task.notes && !isDone && (
          <p className="mt-0.5 text-[12px] text-zinc-500 line-clamp-2">{task.notes}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!isDone && (
          <button
            type="button"
            onClick={onEdit}
            className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-500 hover:bg-zinc-50"
          >
            Rediger
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-400 hover:text-rose-500"
          aria-label="Slett"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

export function TasksScreen({
  weekLayoutData,
  tasksByDate,
  openAddTask,
  onCompleteTask,
  onUndoCompleteTask,
  onEditTask,
  onDeleteTask,
}: TasksScreenProps) {
  const { people } = useFamily()
  const [showCompleted, setShowCompleted] = useState(false)
  const today = todayKeyOslo()

  const { openDays, allCompleted } = useMemo(() => {
    const openDays: { date: string; label: string; isToday: boolean; tasks: Task[] }[] = []
    const allCompleted: Task[] = []

    for (const day of weekLayoutData) {
      const tasks = tasksByDate[day.date] ?? []
      const open = tasks
        .filter((t) => !t.completedAt)
        .sort((a, b) => (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99'))
      const done = tasks.filter((t) => !!t.completedAt)

      if (open.length > 0) {
        openDays.push({
          date: day.date,
          label: formatDayLabel(day.date),
          isToday: day.date === today,
          tasks: open,
        })
      }
      allCompleted.push(...done)
    }
    return { openDays, allCompleted }
  }, [weekLayoutData, tasksByDate, today])

  function resolvePersonName(task: Task): string | undefined {
    const pid = task.childPersonId ?? task.assignedToPersonId
    if (!pid) return undefined
    return people.find((p) => p.id === pid)?.name
  }

  const hasAnything = openDays.length > 0 || allCompleted.length > 0

  return (
    <div className="mt-3 flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden px-3 pb-4">
      <OnboardingHint hintId="tasks_page">
        Her samles alle oppgavene dine for uken. Merk dem ferdige direkte i listen. Bruk «+ Ny oppgave» for å legge til nye.
      </OnboardingHint>
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto scrollbar-none">
        <div className="flex items-center justify-between px-4 pb-3 pt-4">
          <h2 className="text-[17px] font-semibold text-zinc-900">Oppgaver</h2>
          <button
            type="button"
            onClick={openAddTask}
            className="rounded-full bg-brandTeal px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-planner transition hover:brightness-95 active:translate-y-px"
          >
            + Ny oppgave
          </button>
        </div>

        {!hasAnything ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
            <svg className="mb-3 h-9 w-9" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <p className="text-[13px]">Ingen oppgaver denne uken</p>
            <p className="mt-1 text-[11px]">Trykk «+ Ny oppgave» for å legge til</p>
          </div>
        ) : (
          <div className="px-4">
            {openDays.map((day) => (
              <section key={day.date} className="mb-5">
                <div className="mb-1.5 flex items-center gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    {day.label}
                  </h3>
                  {day.isToday && (
                    <span className="rounded-full bg-brandTeal/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brandTeal">
                      I dag
                    </span>
                  )}
                </div>
                <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white px-3">
                  {day.tasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      personName={resolvePersonName(task)}
                      onComplete={() => onCompleteTask(task)}
                      onUndoComplete={() => onUndoCompleteTask(task)}
                      onEdit={() => onEditTask(task)}
                      onDelete={() => onDeleteTask(task)}
                    />
                  ))}
                </div>
              </section>
            ))}

            {allCompleted.length > 0 && (
              <section className="mb-5">
                <button
                  type="button"
                  onClick={() => setShowCompleted((v) => !v)}
                  className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 hover:text-zinc-600"
                >
                  <svg
                    className={`h-3.5 w-3.5 transition-transform ${showCompleted ? 'rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                  {allCompleted.length} {allCompleted.length === 1 ? 'ferdig' : 'ferdige'}
                </button>
                {showCompleted && (
                  <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white px-3">
                    {allCompleted.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        personName={resolvePersonName(task)}
                        onComplete={() => onCompleteTask(task)}
                        onUndoComplete={() => onUndoCompleteTask(task)}
                        onEdit={() => onEditTask(task)}
                        onDelete={() => onDeleteTask(task)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
