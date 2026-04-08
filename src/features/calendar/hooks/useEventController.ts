import { useCallback } from 'react'
import type { Event, DragReschedulePayload } from '../../../types'
import { shiftTime } from '../../../lib/time'
import { useUndo } from '../../../context/UndoContext'
import { startUxTimer, endUxTimer } from '../../../lib/uxMetrics'

// ─── Internal type aliases ─────────────────────────────────────────────────

type EventUpdates = Partial<
  Pick<Event, 'personId' | 'title' | 'start' | 'end' | 'notes' | 'location' | 'reminderMinutes' | 'metadata'>
>

type SeriesUpdates = Partial<
  Pick<Event, 'personId' | 'title' | 'start' | 'end' | 'notes' | 'location' | 'reminderMinutes'>
>

export type { EventUpdates, SeriesUpdates }

// ─── Options (dependency injection) ──────────────────────────────────────────

export interface UseEventControllerOptions {
  addEvent: (date: string, input: Omit<Event, 'id'>) => Promise<void>
  addRecurring: (
    startDate: string,
    endDate: string,
    intervalDays: number,
    input: Omit<Event, 'id'>
  ) => Promise<void>
  updateEvent: (
    date: string,
    eventId: string,
    updates: EventUpdates,
    newDate?: string
  ) => Promise<void>
  deleteEvent: (date: string, eventId: string) => Promise<void>
  updateAllInSeries: (groupId: string, updates: SeriesUpdates) => Promise<void>
  deleteAllInSeries: (groupId: string) => Promise<void>
  showSavingFeedback: () => void
  showSaveFeedback: () => void
  showSaveError: () => void
}

// ─── Return interface ─────────────────────────────────────────────────────────

export interface UseEventControllerReturn {
  /** Create a single event. Wraps with saving/saved feedback. */
  createEvent: (date: string, input: Omit<Event, 'id'>) => Promise<void>
  /** Create a recurring event series. Wraps with saving/saved feedback. */
  createRecurring: (
    startDate: string,
    endDate: string,
    intervalDays: number,
    input: Omit<Event, 'id'>
  ) => Promise<void>
  /** Edit a single event's fields, with optional date move. Wraps with feedback. */
  editEvent: (date: string, event: Event, updates: EventUpdates, newDate?: string) => Promise<void>
  /** Edit all events in a recurrence group (metadata excluded by type). Wraps with feedback. */
  editAllInSeries: (groupId: string, updates: SeriesUpdates) => Promise<void>
  /** Mark event as done (sets completedAt). Registers undo. */
  markDone: (date: string, event: Event) => Promise<void>
  /** Remove completedAt from an event (reverse of markDone). Wraps with feedback. */
  undoComplete: (date: string, event: Event) => Promise<void>
  /** Confirm event (sets confirmedAt). Registers undo. */
  confirmEvent: (date: string, event: Event) => Promise<void>
  /** Delay event start/end by N minutes (default 15). Registers undo. */
  delayEvent: (date: string, event: Event, minutes?: number) => Promise<void>
  /** Move event to a different date. Registers undo. Optional undoMessage overrides the default toast text. */
  moveEvent: (fromDate: string, event: Event, toDate: string, undoMessage?: string) => Promise<void>
  /** Apply drag-reschedule times. Registers undo with previous times. */
  dragReschedule: (date: string, eventId: string, times: DragReschedulePayload) => Promise<void>
  /** Delete a single event with undo (re-creates via addEvent). */
  deleteEvent: (date: string, event: Event) => Promise<void>
  /** Delete all events in a recurrence group. No undo. */
  deleteSeries: (groupId: string) => Promise<void>
  /** Assign a dropoff or pickup transport role for an event. */
  assignTransport: (
    date: string,
    event: Event,
    role: 'dropoff' | 'pickup',
    personId: string | null
  ) => Promise<void>
  /** Duplicate an event to a different date and/or time. Wraps with feedback. */
  duplicateEvent: (targetDate: string, event: Event, start: string, end: string) => Promise<void>
  /** Append a conflict resolution decision to event metadata. Wraps with feedback. */
  resolveConflict: (date: string, event: Event, decision: unknown) => Promise<void>
}

// ─── Hook implementation ──────────────────────────────────────────────────────

export function useEventController({
  addEvent: addEventData,
  addRecurring: addRecurringData,
  updateEvent: updateEventData,
  deleteEvent: deleteEventData,
  updateAllInSeries: updateAllInSeriesData,
  deleteAllInSeries: deleteAllInSeriesData,
  showSavingFeedback,
  showSaveFeedback,
  showSaveError,
}: UseEventControllerOptions): UseEventControllerReturn {
  const { showUndo } = useUndo()

  /**
   * Runs a mutation with saving → saved/error feedback. Re-throws on error so
   * callers can perform post-success UI work inside a try/catch if needed.
   */
  const run = useCallback(
    async (fn: () => Promise<void>): Promise<void> => {
      showSavingFeedback()
      try {
        await fn()
        showSaveFeedback()
      } catch (err) {
        showSaveError()
        throw err
      }
    },
    [showSavingFeedback, showSaveFeedback, showSaveError]
  )

  /**
   * Runs a mutation with feedback, then registers an undo toast on success.
   * Undo callbacks call the raw data layer directly (no extra feedback).
   */
  const runWithUndo = useCallback(
    async (
      fn: () => Promise<void>,
      undoMessage: string,
      onUndo: () => Promise<void>
    ): Promise<void> => {
      showSavingFeedback()
      try {
        await fn()
        showUndo({ message: undoMessage, onUndo })
        showSaveFeedback()
      } catch (err) {
        showSaveError()
        throw err
      }
    },
    [showSavingFeedback, showSaveFeedback, showSaveError, showUndo]
  )

  // ─── Creation ──────────────────────────────────────────────────────────────

  const createEvent = useCallback(
    (date: string, input: Omit<Event, 'id'>) =>
      run(() => addEventData(date, input)),
    [run, addEventData]
  )

  const createRecurring = useCallback(
    (startDate: string, endDate: string, intervalDays: number, input: Omit<Event, 'id'>) =>
      run(() => addRecurringData(startDate, endDate, intervalDays, input)),
    [run, addRecurringData]
  )

  // ─── Edit ──────────────────────────────────────────────────────────────────

  const editEvent = useCallback(
    (date: string, event: Event, updates: EventUpdates, newDate?: string) =>
      run(() => updateEventData(date, event.id, updates, newDate)),
    [run, updateEventData]
  )

  const editAllInSeries = useCallback(
    (groupId: string, updates: SeriesUpdates) =>
      run(() => updateAllInSeriesData(groupId, updates)),
    [run, updateAllInSeriesData]
  )

  // ─── Semantic next-event actions ───────────────────────────────────────────

  const markDone = useCallback(
    (date: string, event: Event) => {
      const previousMetadata = event.metadata ?? {}
      const nextMetadata = { ...previousMetadata, completedAt: new Date().toISOString() }
      return runWithUndo(
        () => updateEventData(date, event.id, { metadata: nextMetadata }),
        'Aktivitet markert som ferdig',
        () => updateEventData(date, event.id, { metadata: previousMetadata })
      )
    },
    [runWithUndo, updateEventData]
  )

  const undoComplete = useCallback(
    (date: string, event: Event) => {
      const nextMetadata = { ...(event.metadata ?? {}) }
      delete nextMetadata.completedAt
      return run(() => updateEventData(date, event.id, { metadata: nextMetadata }))
    },
    [run, updateEventData]
  )

  const confirmEvent = useCallback(
    (date: string, event: Event) => {
      const previousMetadata = event.metadata ?? {}
      const nextMetadata = { ...previousMetadata, confirmedAt: new Date().toISOString() }
      return runWithUndo(
        () => updateEventData(date, event.id, { metadata: nextMetadata }),
        'Aktivitet bekreftet',
        () => updateEventData(date, event.id, { metadata: previousMetadata })
      )
    },
    [runWithUndo, updateEventData]
  )

  const delayEvent = useCallback(
    (date: string, event: Event, minutes = 15) =>
      runWithUndo(
        () =>
          updateEventData(date, event.id, {
            start: shiftTime(event.start, minutes),
            end: shiftTime(event.end, minutes),
          }),
        `Aktivitet utsatt ${minutes} min`,
        () => updateEventData(date, event.id, { start: event.start, end: event.end })
      ),
    [runWithUndo, updateEventData]
  )

  const moveEvent = useCallback(
    (fromDate: string, event: Event, toDate: string, undoMessage = 'Aktivitet flyttet') =>
      runWithUndo(
        () => updateEventData(fromDate, event.id, {}, toDate),
        undoMessage,
        () => updateEventData(toDate, event.id, {}, fromDate)
      ),
    [runWithUndo, updateEventData]
  )

  const dragReschedule = useCallback(
    (date: string, eventId: string, times: DragReschedulePayload) =>
      runWithUndo(
        () => updateEventData(date, eventId, { start: times.nextStart, end: times.nextEnd }),
        'Tid endret',
        () => updateEventData(date, eventId, { start: times.prevStart, end: times.prevEnd })
      ),
    [runWithUndo, updateEventData]
  )

  // ─── Delete ────────────────────────────────────────────────────────────────

  const deleteEvent = useCallback(
    (date: string, event: Event) => {
      const snapshot = { ...event }
      return runWithUndo(
        () => deleteEventData(date, snapshot.id),
        `"${snapshot.title}" ble slettet`,
        async () => {
          const { id: _id, ...rest } = snapshot
          await addEventData(date, rest)
        }
      )
    },
    [runWithUndo, deleteEventData, addEventData]
  )

  const deleteSeries = useCallback(
    (groupId: string) => run(() => deleteAllInSeriesData(groupId)),
    [run, deleteAllInSeriesData]
  )

  // ─── Other mutations ───────────────────────────────────────────────────────

  const assignTransport = useCallback(
    async (
      date: string,
      event: Event,
      role: 'dropoff' | 'pickup',
      personId: string | null
    ): Promise<void> => {
      startUxTimer('reassign_participant_flow')
      const prevMeta = event.metadata ?? {}
      const prevTransport = prevMeta.transport ?? {}
      const nextTransport =
        role === 'dropoff'
          ? { ...prevTransport, dropoffBy: personId ?? undefined }
          : { ...prevTransport, pickupBy: personId ?? undefined }
      const nextMetadata = { ...prevMeta, transport: nextTransport }
      showSavingFeedback()
      try {
        await updateEventData(date, event.id, { metadata: nextMetadata })
        endUxTimer('reassign_participant_flow', 'time_to_reassign_participant_ms')
        showSaveFeedback()
      } catch (err) {
        showSaveError()
        throw err
      }
    },
    [updateEventData, showSavingFeedback, showSaveFeedback, showSaveError]
  )

  const duplicateEvent = useCallback(
    (targetDate: string, event: Event, start: string, end: string) => {
      const { id: _id, ...rest } = event
      return run(() => addEventData(targetDate, { ...rest, start, end }))
    },
    [run, addEventData]
  )

  const resolveConflict = useCallback(
    (date: string, event: Event, decision: unknown) => {
      const previousResolutions = (event.metadata?.conflictResolution ?? []) as unknown[]
      const nextResolution = {
        ...(decision as Record<string, unknown>),
        resolvedAt: new Date().toISOString(),
      }
      const nextMetadata = {
        ...(event.metadata ?? {}),
        conflictResolution: [...previousResolutions, nextResolution],
      }
      return run(() => updateEventData(date, event.id, { metadata: nextMetadata }))
    },
    [run, updateEventData]
  )

  // ─── Return ────────────────────────────────────────────────────────────────

  return {
    createEvent,
    createRecurring,
    editEvent,
    editAllInSeries,
    markDone,
    undoComplete,
    confirmEvent,
    delayEvent,
    moveEvent,
    dragReschedule,
    deleteEvent,
    deleteSeries,
    assignTransport,
    duplicateEvent,
    resolveConflict,
  }
}
