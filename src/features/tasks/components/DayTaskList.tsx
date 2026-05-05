import type { Task, Person } from '../../../types'
import { taskIntentBadgeClassName, taskIntentLabelNb } from '../../../lib/taskIntent'
import { useFamily } from '../../../context/FamilyContext'

interface DayTaskListProps {
  tasks: Task[]
  onComplete: (task: Task) => void
  onUndoComplete: (task: Task) => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
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
  const childPerson = task.childPersonId ? people.find((p) => p.id === task.childPersonId) : undefined
  const assigneePerson = task.assignedToPersonId ? people.find((p) => p.id === task.assignedToPersonId) : undefined
  const primaryPerson = childPerson ?? assigneePerson

  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border px-2.5 py-2 transition-colors ${
        isDone ? 'border-neutral-200 bg-neutral-50' : 'border bg-neutral-100'
      }`}
      style={!isDone && primaryPerson ? {
        backgroundColor: primaryPerson.colorTint,
        borderLeftWidth: 4,
        borderLeftColor: primaryPerson.colorAccent,
        borderTopColor: '#e3ded2',
        borderRightColor: '#e3ded2',
        borderBottomColor: '#e3ded2',
      } : undefined}
    >
      {/* Completion toggle */}
      <button
        type="button"
        className="mt-0.5 shrink-0 active:scale-90 transition-transform"
        onClick={() => (isDone ? onUndoComplete(task) : onComplete(task))}
        aria-label={isDone ? 'Angre ferdig' : 'Merk som ferdig'}
      >
        {isDone ? (
          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary-600">
            <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
        ) : (
          <div className="h-4 w-4 rounded-full border-2 border-neutral-300 transition-colors hover:border-primary-600" />
        )}
      </button>

      {/* Content */}
      <div className={`min-w-0 flex-1 ${isDone ? 'opacity-50' : ''}`}>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <p
            className={`min-w-0 flex-1 text-[13px] font-medium leading-snug ${
              isDone ? 'text-neutral-400 line-through decoration-neutral-300' : 'text-neutral-600'
            }`}
          >
            {task.title}
          </p>
          {!isDone && (task.taskIntent ?? 'must_do') === 'can_help' ? (
            <span
              className={`shrink-0 rounded-full border px-1.5 py-px text-[9px] font-semibold ${taskIntentBadgeClassName(
                'can_help'
              )}`}
            >
              {taskIntentLabelNb('can_help')}
            </span>
          ) : null}
        </div>

        {!isDone && (task.dueTime || primaryPerson) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {task.dueTime && (
              <span className="text-[11px] font-semibold text-accent-sun-main">{task.dueTime}</span>
            )}
            {primaryPerson && (
              <span className="inline-flex items-center gap-1">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: primaryPerson.colorAccent }}
                />
                <span className="text-[11px] text-neutral-400">{primaryPerson.name}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Icon actions */}
      <div className="flex shrink-0 items-center gap-0.5">
        {!isDone && (
          <button
            type="button"
            onClick={() => onEdit(task)}
            className="rounded-lg p-1 text-neutral-300 transition hover:bg-neutral-200 hover:text-neutral-400"
            aria-label="Rediger"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(task)}
          className="rounded-lg p-1 text-neutral-300 transition hover:bg-semantic-red-50 hover:text-semantic-red-500"
          aria-label="Slett gjøremål"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
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
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
        Gjøremål
      </p>
      <div className="space-y-1.5">
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
