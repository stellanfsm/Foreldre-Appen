import { AnimatePresence } from 'framer-motion'
import { AddEventSheet, REPEAT_INTERVAL_DAYS } from '../../components/AddEventSheet'
import { EditEventSheet } from '../../components/EditEventSheet'
import { EventDetailSheet } from '../../components/EventDetailSheet'
import { BackgroundDetailSheet } from '../../components/BackgroundDetailSheet'
import { AddTaskSheet } from '../tasks/components/AddTaskSheet'
import type { Event, Task } from '../../types'
import type { UseEventControllerReturn } from './hooks/useEventController'
import type { UseTaskControllerReturn } from '../tasks/hooks/useTaskController'

interface CalendarOverlaysProps {
  selectedEvent: { event: Event; date: string } | null
  setSelectedEvent: (value: { event: Event; date: string } | null) => void
  selectedBackgroundEvent: { event: Event; date: string } | null
  setSelectedBackgroundEvent: (value: { event: Event; date: string } | null) => void
  dayEvents: Event[]
  isAdding: boolean
  selectedDate: string
  addEventDateOverride: string | null
  addFlowSaved: boolean
  setAddFlowSaved: (value: boolean) => void
  setIsAdding: (value: boolean) => void
  setAddEventDateOverride: (value: string | null) => void
  editingEvent: { event: Event; date: string; scope: 'this' | 'all' } | null
  setEditingEvent: (value: { event: Event; date: string; scope: 'this' | 'all' } | null) => void
  controller: UseEventControllerReturn
  onAddFlowSaved: () => void
  onAddFlowClosedWithoutSave: () => void
  onConflictResolved: () => void
  isAddingTask: boolean
  setIsAddingTask: (value: boolean) => void
  editingTask: Task | null
  setEditingTask: (value: Task | null) => void
  taskController: UseTaskControllerReturn
}

export function CalendarOverlays({
  selectedEvent,
  setSelectedEvent,
  selectedBackgroundEvent,
  setSelectedBackgroundEvent,
  dayEvents,
  isAdding,
  selectedDate,
  addEventDateOverride,
  addFlowSaved,
  setAddFlowSaved,
  setIsAdding,
  setAddEventDateOverride,
  editingEvent,
  setEditingEvent,
  controller,
  onAddFlowSaved,
  onAddFlowClosedWithoutSave,
  onConflictResolved,
  isAddingTask,
  setIsAddingTask,
  editingTask,
  setEditingTask,
  taskController,
}: CalendarOverlaysProps) {
  return (
    <AnimatePresence>
      {selectedEvent && (
        <EventDetailSheet
          key={selectedEvent.event.id}
          event={selectedEvent.event}
          date={selectedEvent.date}
          onClose={() => setSelectedEvent(null)}
          onDuplicate={async (targetDate, start, end) => {
            try {
              await controller.duplicateEvent(targetDate, selectedEvent.event, start, end)
            } catch {
              // feedback handled by controller
            }
          }}
          onEdit={(scope) => {
            setEditingEvent({ ...selectedEvent, scope })
            setSelectedEvent(null)
          }}
          onDelete={async (scope) => {
            try {
              if (scope === 'all' && selectedEvent.event.recurrenceGroupId) {
                await controller.deleteSeries(selectedEvent.event.recurrenceGroupId)
              } else {
                await controller.deleteEvent(selectedEvent.date, selectedEvent.event)
              }
            } catch {
              // feedback handled by controller
            }
          }}
        />
      )}
      {selectedBackgroundEvent && (
        <BackgroundDetailSheet
          event={selectedBackgroundEvent.event}
          date={selectedBackgroundEvent.date}
          foregroundEvents={dayEvents}
          onResolveConflict={async (decision) => {
            try {
              await controller.resolveConflict(
                selectedBackgroundEvent.date,
                selectedBackgroundEvent.event,
                decision
              )
              onConflictResolved()
            } catch {
              // feedback handled by controller
            }
          }}
          onClose={() => setSelectedBackgroundEvent(null)}
        />
      )}
      {isAdding && (
        <AddEventSheet
          key={`add-${addEventDateOverride ?? selectedDate}`}
          date={addEventDateOverride ?? selectedDate}
          onSave={async (data, options) => {
            const targetDate = addEventDateOverride ?? selectedDate
            try {
              if (options && options.repeat !== 'none' && options.endDate) {
                const interval = REPEAT_INTERVAL_DAYS[options.repeat]
                await controller.createRecurring(targetDate, options.endDate, interval, data)
              } else {
                await controller.createEvent(targetDate, data)
              }
              setAddFlowSaved(true)
              onAddFlowSaved()
            } catch {
              // feedback handled by controller
            }
          }}
          onClose={() => {
            if (!addFlowSaved) onAddFlowClosedWithoutSave()
            setIsAdding(false)
            setAddEventDateOverride(null)
          }}
        />
      )}
      {editingEvent && (
        <EditEventSheet
          key={`edit-${editingEvent.event.id}`}
          event={editingEvent.event}
          date={editingEvent.date}
          onSave={async (data, newDate) => {
            try {
              if (editingEvent.scope === 'all' && editingEvent.event.recurrenceGroupId) {
                const { metadata: _metadata, ...rest } = data
                await controller.editAllInSeries(editingEvent.event.recurrenceGroupId, rest)
              } else {
                await controller.editEvent(editingEvent.date, editingEvent.event, data, newDate)
              }
              setEditingEvent(null)
            } catch {
              // feedback handled by controller
            }
          }}
          onClose={() => setEditingEvent(null)}
        />
      )}
      {isAddingTask && (
        <AddTaskSheet
          key={`add-task-${selectedDate}`}
          date={selectedDate}
          onSave={async (data) => {
            try {
              await taskController.createTask(data)
            } catch {
              // feedback handled by controller
            }
            setIsAddingTask(false)
          }}
          onClose={() => setIsAddingTask(false)}
        />
      )}
      {editingTask && (
        <AddTaskSheet
          key={`edit-task-${editingTask.id}`}
          date={editingTask.date}
          initialTask={editingTask}
          onSave={async (data) => {
            try {
              await taskController.editTask(editingTask, data)
            } catch {
              // feedback handled by controller
            }
            setEditingTask(null)
          }}
          onClose={() => setEditingTask(null)}
        />
      )}
    </AnimatePresence>
  )
}
