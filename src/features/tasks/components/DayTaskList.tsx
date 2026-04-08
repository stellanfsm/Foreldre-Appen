import type { Task, Person } from '../../../types'
import { useFamily } from '../../../context/FamilyContext'

interface DayTaskListProps {
  tasks: Task[]
  onComplete: (task: Task) => void
  onUndoComplete: (task: Task) => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
}

function CheckCircleIcon() {
  return (
    <svg className="h-5 w-5 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  )
}

function EmptyCircleIcon() {
  return (
    <svg className="h-5 w-5 shrink-0 text-zinc-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}

function personName(people: Person[], personId?: string): string | undefined {
  if (!personId) return undefined
  return people.find((p) => p.id === personId)?.name
}

interface TaskRowProps {
  task: Task
  people: Person[]
  onComplete: (task: Task) => void
  onUndoComplete: (task: Task) => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
}

function TaskRow({ task, people, onComplete, onUndoComplete, onEdit, onDelete }: TaskRowProps) {
  const isDone = !!task.completedAt
  const assigned = personName(people, task.assignedToPersonId)
  const child = personName(people, task.childPersonId)
  const meta = [child, assigned ? `→ ${assigned}` : undefined].filter(Boolean).join(' ')

  return (
    <div className={`flex items-start gap-2.5 py-0.5 ${isDone ? 'opacity-50' : ''}`}>
      <button
        type="button"
        className="mt-0.5 shrink-0"
        onClick={() => (isDone ? onUndoComplete(task) : onComplete(task))}
        aria-label={isDone ? 'Angre ferdig' : 'Merk som ferdig'}
      >
        {isDone ? <CheckCircleIcon /> : <EmptyCircleIcon />}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={`text-[13px] font-medium leading-snug ${
            isDone ? 'text-zinc-400 line-through' : 'text-zinc-800'
          }`}
        >
          {task.title}
        </p>
        {task.dueTime && !isDone && (
          <p className="mt-0.5 text-[11px] font-medium text-amber-600">
            Frist: {task.dueTime}
          </p>
        )}
        {meta && (
          <p className="mt-0.5 text-[11px] text-zinc-400">{meta}</p>
        )}
        {task.notes && !isDone && (
          <p className="mt-0.5 text-[11px] text-zinc-500 line-clamp-2">{task.notes}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {!isDone && (
          <button
            type="button"
            onClick={() => onEdit(task)}
            className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-500 hover:bg-zinc-50"
          >
            Rediger
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(task)}
          className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-400 hover:bg-zinc-50 hover:text-rose-500"
          aria-label="Slett oppgave"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

export function DayTaskList({ tasks, onComplete, onUndoComplete, onEdit, onDelete }: DayTaskListProps) {
  const { people } = useFamily()
  if (tasks.length === 0) return null

  const open = tasks.filter((t) => !t.completedAt)
  const done = tasks.filter((t) => !!t.completedAt)

  return (
    <div className="mx-4 mb-2 mt-2">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        Oppgaver
      </p>
      <div className="divide-y divide-zinc-100 rounded-card border border-zinc-200 bg-white px-2.5 py-1">
        {open.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            people={people}
            onComplete={onComplete}
            onUndoComplete={onUndoComplete}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
        {done.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            people={people}
            onComplete={onComplete}
            onUndoComplete={onUndoComplete}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}
