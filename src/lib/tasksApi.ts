import type { Task, PersonId } from '../types'
import { supabase } from './supabaseClient'

const TASK_COLUMNS =
  'id, user_id, title, notes, date, due_time, assigned_to_person_id, child_person_id, completed_at, created_at, updated_at'

type TaskRow = {
  id: string
  user_id: string
  title: string
  notes: string | null
  date: string
  due_time: string | null
  assigned_to_person_id: string | null
  child_person_id: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

function mapRowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes ?? undefined,
    date: row.date,
    dueTime: row.due_time ?? undefined,
    assignedToPersonId: (row.assigned_to_person_id ?? undefined) as PersonId | undefined,
    childPersonId: (row.child_person_id ?? undefined) as PersonId | undefined,
    completedAt: row.completed_at ?? undefined,
  }
}

export type TaskUpdates = Partial<
  Pick<Task, 'title' | 'notes' | 'dueTime' | 'assignedToPersonId' | 'childPersonId' | 'completedAt'>
>

export async function fetchTasksForDateRange(
  startDate: string,
  endDate: string
): Promise<{ byDate: Record<string, Task[]>; error: unknown }> {
  const { data, error } = await supabase.rpc('get_tasks_for_calendar', {
    p_start_date: startDate,
    p_end_date: endDate,
  })
  if (error) {
    console.error('[tasksApi] fetchTasksForDateRange error', error)
    return { byDate: {}, error }
  }
  const rows = (data as TaskRow[] | null) ?? []
  const byDate: Record<string, Task[]> = {}
  for (const row of rows) {
    const task = mapRowToTask(row)
    if (!byDate[row.date]) byDate[row.date] = []
    byDate[row.date].push(task)
  }
  return { byDate, error: null }
}

export async function createTask(
  userId: string,
  input: Omit<Task, 'id'>
): Promise<Task | null> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: userId,
      title: input.title,
      notes: input.notes ?? null,
      date: input.date,
      due_time: input.dueTime ?? null,
      assigned_to_person_id: input.assignedToPersonId ?? null,
      child_person_id: input.childPersonId ?? null,
      completed_at: null,
    })
    .select(TASK_COLUMNS)
    .single()
  if (error) {
    console.error('[tasksApi] createTask error', error)
    return null
  }
  return mapRowToTask(data as TaskRow)
}

export async function updateTask(
  taskId: string,
  updates: TaskUpdates
): Promise<Task | null> {
  const payload: Record<string, unknown> = {}
  if (updates.title != null) payload.title = updates.title
  if ('notes' in updates) payload.notes = updates.notes ?? null
  if ('dueTime' in updates) payload.due_time = updates.dueTime ?? null
  if ('assignedToPersonId' in updates) payload.assigned_to_person_id = updates.assignedToPersonId ?? null
  if ('childPersonId' in updates) payload.child_person_id = updates.childPersonId ?? null
  if ('completedAt' in updates) payload.completed_at = updates.completedAt ?? null
  if (Object.keys(payload).length === 0) return null

  const { data, error } = await supabase
    .from('tasks')
    .update(payload)
    .eq('id', taskId)
    .select(TASK_COLUMNS)
    .single()
  if (error) {
    console.error('[tasksApi] updateTask error', error)
    return null
  }
  return mapRowToTask(data as TaskRow)
}

export async function deleteTask(
  taskId: string,
  userId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .eq('user_id', userId)
  if (error) {
    console.error('[tasksApi] deleteTask error', error)
    return false
  }
  return true
}
