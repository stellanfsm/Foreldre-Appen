import type { PostgrestError } from '@supabase/supabase-js'
import type { Event, PersonId, EventMetadata } from '../types'
import { supabase } from './supabaseClient'

const EVENT_COLUMNS =
  'id, user_id, person_id, date, title, start, end, notes, location, recurrence_group_id, reminder_minutes, metadata'

type EventRow = {
  id: string
  user_id: string
  person_id: string | null
  date: string
  title: string
  start: string
  end: string
  notes: string | null
  location: string | null
  recurrence_group_id: string | null
  reminder_minutes: number | null
  metadata: EventMetadata | null
}

function mapRowToEvent(row: EventRow): Event {
  return {
    id: row.id,
    personId: row.person_id as PersonId,
    title: row.title,
    start: row.start,
    end: row.end,
    notes: row.notes ?? undefined,
    location: row.location ?? undefined,
    recurrenceGroupId: row.recurrence_group_id ?? undefined,
    reminderMinutes: row.reminder_minutes ?? undefined,
    metadata: row.metadata ?? undefined,
  }
}

export async function fetchEventsForDate(userId: string, date: string): Promise<Event[]> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .eq('user_id', userId)
    .eq('date', date)
    .order('start', { ascending: true })

  if (error) {
    console.error('[eventsApi] fetchEventsForDate error', error)
    return []
  }
  return (data as EventRow[] | null)?.map(mapRowToEvent) ?? []
}

export async function fetchEventsForDateRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<Record<string, Event[]>> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })
    .order('start', { ascending: true })

  if (error) {
    console.error('[eventsApi] fetchEventsForDateRange error', error)
    return {}
  }

  const byDate: Record<string, Event[]> = {}
  for (const row of (data as EventRow[] | null) ?? []) {
    const ev = mapRowToEvent(row)
    const key = row.date
    if (!byDate[key]) byDate[key] = []
    byDate[key].push(ev)
  }
  return byDate
}

/** Fetch events via RPC so the server decides whose calendar to return (owner or linked owner). Use this to avoid owner/link mix-ups. */
export async function fetchEventsForDateRangeFromCalendar(
  startDate: string,
  endDate: string
): Promise<{ byDate: Record<string, Event[]>; error: PostgrestError | null }> {
  const { data, error } = await supabase.rpc('get_events_for_calendar', {
    p_start_date: startDate,
    p_end_date: endDate,
  })

  if (error) {
    console.error('[eventsApi] fetchEventsForDateRangeFromCalendar error', error)
    return { byDate: {}, error }
  }

  const rows = (data as EventRow[] | null) ?? []
  const byDate: Record<string, Event[]> = {}
  for (const row of rows) {
    const ev = mapRowToEvent(row)
    const key = row.date
    if (!byDate[key]) byDate[key] = []
    byDate[key].push(ev)
  }
  return { byDate, error: null }
}

export async function createEventForDate(
  userId: string,
  date: string,
  input: Omit<Event, 'id'>
): Promise<Event | null> {
  const payload: Record<string, unknown> = {
    user_id: userId,
    date,
    person_id: input.personId,
    title: input.title,
    start: input.start,
    end: input.end,
    notes: input.notes ?? null,
    location: input.location ?? null,
  }
  if (input.recurrenceGroupId) {
    payload.recurrence_group_id = input.recurrenceGroupId
  }
  if (input.reminderMinutes != null) {
    payload.reminder_minutes = input.reminderMinutes
  }
  if (input.metadata != null) {
    payload.metadata = input.metadata
  }

  const { data, error } = await supabase
    .from('events')
    .insert(payload)
    .select(EVENT_COLUMNS)
    .single()

  if (error) {
    console.error('[eventsApi] createEventForDate error', error)
    return null
  }

  return mapRowToEvent(data as EventRow)
}

export async function insertRecurringEventsKeepOwner(
  startDate: string,
  endDate: string,
  intervalDays: number,
  input: Omit<Event, 'id'>
): Promise<Array<{ date: string; event: Event }> | null> {
  const payload: Record<string, unknown> = {
    person_id: input.personId,
    title: input.title,
    start: input.start,
    end: input.end,
    notes: input.notes ?? null,
    location: input.location ?? null,
    recurrence_group_id: input.recurrenceGroupId ?? null,
    reminder_minutes: input.reminderMinutes ?? null,
    metadata: input.metadata ?? null,
  }
  const { data, error } = await supabase.rpc('insert_recurring_events_keep_owner', {
    p_start_date: startDate,
    p_end_date: endDate,
    p_interval_days: intervalDays,
    p_input: payload,
  })

  if (error) {
    console.error('[eventsApi] insertRecurringEventsKeepOwner error', error)
    return null
  }

  const result = data as { ok?: boolean; rows?: EventRow[] } | null
  if (!result?.ok || !Array.isArray(result.rows)) {
    return null
  }
  return result.rows.map((row) => ({ date: row.date, event: mapRowToEvent(row) }))
}

export async function updateEvent(
  _userId: string,
  eventId: string,
  updates: Partial<Pick<Event, 'personId' | 'title' | 'start' | 'end' | 'notes' | 'location' | 'reminderMinutes' | 'metadata'>>,
  newDate?: string
): Promise<Event | null> {
  const payload: Record<string, unknown> = {}
  if (updates.personId !== undefined) payload.person_id = updates.personId
  if (updates.title != null) payload.title = updates.title
  if (updates.start != null) payload.start = updates.start
  if (updates.end != null) payload.end = updates.end
  if (updates.notes != null) payload.notes = updates.notes
  if (updates.location != null) payload.location = updates.location
  if (updates.reminderMinutes !== undefined) payload.reminder_minutes = updates.reminderMinutes ?? null
  if (updates.metadata !== undefined) payload.metadata = updates.metadata ?? null
  if (newDate != null) payload.date = newDate
  if (Object.keys(payload).length === 0) return null

  const { data, error } = await supabase.rpc('update_event_keep_owner', {
    p_event_id: eventId,
    p_updates: payload,
  })

  if (error) {
    console.error('[eventsApi] updateEvent error', error)
    return null
  }
  const result = data as { ok?: boolean; error?: string; row?: EventRow } | null
  if (!result?.ok || !result.row) return null
  return mapRowToEvent(result.row)
}

export async function updateEventsByGroup(
  _userId: string,
  groupId: string,
  updates: Partial<Pick<Event, 'personId' | 'title' | 'start' | 'end' | 'notes' | 'location' | 'reminderMinutes'>>
): Promise<boolean> {
  const payload: Record<string, unknown> = {}
  if (updates.personId !== undefined) payload.person_id = updates.personId
  if (updates.title != null) payload.title = updates.title
  if (updates.start != null) payload.start = updates.start
  if (updates.end != null) payload.end = updates.end
  if (updates.notes != null) payload.notes = updates.notes
  if (updates.location != null) payload.location = updates.location
  if (updates.reminderMinutes !== undefined) payload.reminder_minutes = updates.reminderMinutes ?? null
  if (Object.keys(payload).length === 0) return true

  const { data, error } = await supabase.rpc('update_events_by_group_keep_owner', {
    p_group_id: groupId,
    p_updates: payload,
  })

  if (error) {
    console.error('[eventsApi] updateEventsByGroup error', error)
    return false
  }
  const result = data as { ok?: boolean } | null
  return result?.ok === true
}

export async function deleteEvent(userId: string, eventId: string): Promise<boolean> {
  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)
    .eq('user_id', userId)
  if (error) {
    console.error('[eventsApi] deleteEvent error', error)
    return false
  }
  return true
}

export async function deleteEventsByPerson(userId: string, personId: string): Promise<boolean> {
  const { error } = await supabase
    .from('events')
    .delete()
    .eq('user_id', userId)
    .eq('person_id', personId)
  if (error) {
    console.error('[eventsApi] deleteEventsByPerson error', error)
    return false
  }
  return true
}

export async function deleteEventsByGroup(userId: string, groupId: string): Promise<boolean> {
  const { error } = await supabase
    .from('events')
    .delete()
    .eq('user_id', userId)
    .eq('recurrence_group_id', groupId)
  if (error) {
    console.error('[eventsApi] deleteEventsByGroup error', error)
    return false
  }
  return true
}

export async function deleteAllEventsForUser(userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('events')
    .delete()
    .eq('user_id', userId)
  if (error) {
    console.error('[eventsApi] deleteAllEventsForUser error', error)
    return false
  }
  return true
}

/**
 * Owner-only bulk delete via a SECURITY DEFINER RPC that rejects linked (partner) users
 * at the database level. Use this instead of deleteAllEventsForUser in the app.
 * Run supabase-delete-all-events-owner-only.sql in Supabase SQL Editor first.
 */
export async function deleteAllEventsOwnerOnly(): Promise<boolean> {
  const { data, error } = await supabase.rpc('delete_all_events_owner_only')
  if (error) {
    console.error('[eventsApi] deleteAllEventsOwnerOnly error', error)
    return false
  }
  const result = data as { ok?: boolean; error?: string } | null
  if (!result?.ok) {
    console.error('[eventsApi] deleteAllEventsOwnerOnly rejected', result?.error)
    return false
  }
  return true
}
