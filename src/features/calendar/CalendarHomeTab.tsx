import { motion } from 'framer-motion'
import { FamilyFilterBar } from '../../components/FamilyFilterBar'
import { SearchBar } from '../../components/SearchBar'
import { WeekStrip } from '../../components/WeekStrip'
import { WeeklyCheckCard } from '../../components/WeeklyCheckCard'
import { CalendarDayNote } from '../../components/CalendarDayNote'
import { DailyStatusLine } from '../../components/DailyStatusLine'
import { TodayActionStrip } from '../../components/TodayActionStrip'
import { ScheduleLoadingSkeleton } from '../../components/ScheduleLoadingSkeleton'
import { EmptyState } from '../../components/EmptyState'
import { WeeklyList } from '../../components/WeeklyList'
import { TimelineContainer } from '../../components/TimelineContainer'
import { springSnappy } from '../../lib/motion'
import { COPY } from '../../lib/norwegianCopy'
import type { Event, Task, PersonId, TimelineLayoutItem, GapInfo } from '../../types'
import type { SaveFeedbackState } from '../app/hooks/useSaveFeedback'
import type { WeekDayLayout } from '../../hooks/useScheduleState'
import { DayTaskList } from '../tasks/components/DayTaskList'

interface CalendarHomeTabProps {
  selectedPersonIds: PersonId[]
  setSelectedPersonIds: (ids: PersonId[]) => void
  mePersonId: string | null | undefined
  openAddEvent: (dateOverride?: string | null) => void
  weekLayoutData: WeekDayLayout[]
  setSelectedDate: (date: string) => void
  selectedDate: string
  handleSelectEvent: (event: Event, date: string) => void
  handleChangeWeek: (deltaWeeks: number) => void
  handleJumpToToday: () => void
  saveFeedback: SaveFeedbackState
  reducedMotion: boolean
  weeklyActivityCount: number
  weeklyCollisionCount: number
  unresolvedConflictCount: number
  visibleActionableCount: number
  completedCount: number
  hideTodayActionStrip: boolean
  setHideTodayActionStrip: (hidden: boolean) => void
  nextEvent: Event | null
  nextEventMinutesUntil: number | null
  nextEventHasConflict: boolean
  laterConflictCount: number
  onOpenNextEvent: () => void
  onMarkNextDone: () => Promise<void>
  onConfirmNext: () => Promise<void>
  onDelayNext: () => Promise<void>
  onMoveNext: () => Promise<void>
  completedEvents: Event[]
  showCompletedToday: boolean
  setShowCompletedToday: (value: boolean | ((prev: boolean) => boolean)) => void
  showAllCompletedToday: boolean
  setShowAllCompletedToday: (value: boolean | ((prev: boolean) => boolean)) => void
  onUndoComplete: (event: Event) => Promise<void>
  weekEventsLoading: boolean
  showNoFamilyEmpty: boolean
  showListView: boolean
  hasAnyWeekEvents: boolean
  isWeekFilteredEmpty: boolean
  isDayFilteredEmpty: boolean
  layoutItems: TimelineLayoutItem[]
  backgroundLayoutItems: TimelineLayoutItem[]
  gaps: GapInfo[]
  onSelectBackgroundEvent: (event: Event) => void
  onDragReschedule: (eventId: string, times: { prevStart: string; prevEnd: string; nextStart: string; nextEnd: string }) => Promise<void>
  onDeleteWeeklyEvent: (event: Event, date: string) => Promise<void>
  onMoveWeeklyEvent: (event: Event, fromDate: string, toDate: string) => Promise<void>
  dayTasks: Task[]
  openAddTask: () => void
  onEditTask: (task: Task) => void
  onCompleteTask: (task: Task) => void
  onUndoCompleteTask: (task: Task) => void
  onDeleteTask: (task: Task) => void
}

export function CalendarHomeTab({
  selectedPersonIds,
  setSelectedPersonIds,
  mePersonId,
  openAddEvent,
  weekLayoutData,
  setSelectedDate,
  selectedDate,
  handleSelectEvent,
  handleChangeWeek,
  handleJumpToToday,
  saveFeedback,
  reducedMotion,
  weeklyActivityCount,
  weeklyCollisionCount,
  unresolvedConflictCount,
  visibleActionableCount,
  completedCount,
  hideTodayActionStrip,
  setHideTodayActionStrip,
  nextEvent,
  nextEventMinutesUntil,
  nextEventHasConflict,
  laterConflictCount,
  onOpenNextEvent,
  onMarkNextDone,
  onConfirmNext,
  onDelayNext,
  onMoveNext,
  completedEvents,
  showCompletedToday,
  setShowCompletedToday,
  showAllCompletedToday,
  setShowAllCompletedToday,
  onUndoComplete,
  weekEventsLoading,
  showNoFamilyEmpty,
  showListView,
  hasAnyWeekEvents,
  isWeekFilteredEmpty,
  isDayFilteredEmpty,
  layoutItems,
  backgroundLayoutItems,
  gaps,
  onSelectBackgroundEvent,
  onDragReschedule,
  onDeleteWeeklyEvent,
  onMoveWeeklyEvent,
  dayTasks,
  openAddTask,
  onEditTask,
  onCompleteTask,
  onUndoCompleteTask,
  onDeleteTask,
}: CalendarHomeTabProps) {
  return (
    <div className="mt-3 flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden px-3 pb-4">
      <div className="flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden overflow-y-hidden">
        <FamilyFilterBar
          selectedPersonIds={selectedPersonIds}
          onFilterChange={setSelectedPersonIds}
          mePersonId={mePersonId}
        />
        <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-1">
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => openAddEvent()}
              className="rounded-full bg-brandTeal px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-planner transition hover:brightness-95 active:translate-y-px active:shadow-planner-press focus:outline-none focus:ring-2 focus:ring-brandTeal focus:ring-offset-2"
            >
              + Aktivitet
            </button>
            <button
              type="button"
              onClick={() => openAddTask()}
              className="rounded-full border-2 border-brandTeal px-3.5 py-1.5 text-[13px] font-semibold text-brandTeal shadow-planner-sm transition hover:bg-brandTeal/10 active:translate-y-px active:shadow-planner-press focus:outline-none focus:ring-2 focus:ring-brandTeal focus:ring-offset-2"
            >
              + Oppgave
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <SearchBar
              weekLayoutData={weekLayoutData}
              onJumpToDate={setSelectedDate}
              onSelectEvent={handleSelectEvent}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap px-4 pb-1 pt-1 text-[12px]">
          <div className="flex gap-2 items-center">
            <button
              type="button"
              onClick={() => handleChangeWeek(-1)}
              className="rounded-full border-2 border-brandNavy/15 bg-white px-3 py-1 font-medium text-brandNavy shadow-planner-sm transition hover:bg-brandSky/40 active:translate-y-px active:shadow-planner-press"
            >
              ‹ Forrige uke
            </button>
            <button
              type="button"
              onClick={() => handleChangeWeek(1)}
              className="rounded-full border-2 border-brandNavy/15 bg-white px-3 py-1 font-medium text-brandNavy shadow-planner-sm transition hover:bg-brandSky/40 active:translate-y-px active:shadow-planner-press"
            >
              Neste uke ›
            </button>
            <button
              type="button"
              onClick={handleJumpToToday}
              className="rounded-full border-2 border-brandNavy/15 bg-white px-3 py-1 font-medium text-brandNavy shadow-planner-sm transition hover:bg-brandSky/40 active:translate-y-px active:shadow-planner-press"
            >
              Gå til i dag
            </button>
          </div>
          {saveFeedback && (
            <motion.span
              initial={reducedMotion ? false : { scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={springSnappy}
              className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${
                saveFeedback === 'error' ? 'text-rose-700' : saveFeedback === 'saving' ? 'text-zinc-700' : 'text-emerald-700'
              }`}
            >
              {saveFeedback !== 'saving' && (
                <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              )}
              {saveFeedback === 'saving'
                ? COPY.feedback.saving
                : saveFeedback === 'error'
                  ? COPY.feedback.saveFailed
                  : COPY.feedback.saved}
            </motion.span>
          )}
        </div>
        <WeekStrip
          days={weekLayoutData}
          selectedDate={selectedDate}
          onSelectDay={setSelectedDate}
          loading={weekEventsLoading}
        />
        <WeeklyCheckCard totalActivities={weeklyActivityCount} collisionCount={weeklyCollisionCount} />
        <CalendarDayNote date={selectedDate} />
        <DailyStatusLine
          unresolvedCollisionCount={unresolvedConflictCount}
          remainingCount={visibleActionableCount}
          completedCount={completedCount}
        />
        {!hideTodayActionStrip && (
          <TodayActionStrip
            nextEvent={nextEvent}
            minutesUntilNext={nextEventMinutesUntil}
            nextEventHasConflict={nextEventHasConflict}
            laterConflictCount={laterConflictCount}
            moveActionLabel={nextEvent ? `Flytt til i morgen (${nextEvent.start})` : COPY.actions.moveTomorrow}
            onDismiss={() => setHideTodayActionStrip(true)}
            onOpenNext={onOpenNextEvent}
            onMarkDone={onMarkNextDone}
            onConfirmNext={onConfirmNext}
            onDelayNext={onDelayNext}
            onMoveNext={onMoveNext}
          />
        )}
        {completedEvents.length > 0 && (
          <div className="mx-4 mt-2">
            <button
              type="button"
              onClick={() => {
                setShowCompletedToday((value) => !value)
                if (showCompletedToday) setShowAllCompletedToday(false)
              }}
              className="min-h-9 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-700"
            >
              {showCompletedToday
                ? `Skjul ferdige (${completedEvents.length})`
                : `Vis ferdige (${completedEvents.length})`}
            </button>
            {showCompletedToday && (
              <div className="mt-2 space-y-1.5 rounded-card border border-zinc-200 bg-white p-2.5">
                {(showAllCompletedToday ? completedEvents : completedEvents.slice(0, 5)).map((event) => (
                  <div key={event.id} className="flex items-center justify-between gap-2">
                    <p className="text-[12px] text-zinc-600">
                      {event.start} {event.title}
                    </p>
                    <button
                      type="button"
                      onClick={() => void onUndoComplete(event)}
                      className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700"
                    >
                      Angre ferdig
                    </button>
                  </div>
                ))}
                {completedEvents.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllCompletedToday((value) => !value)}
                    className="min-h-9 w-full rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-700"
                  >
                    {showAllCompletedToday ? 'Vis færre ferdige' : `Vis alle ferdige (${completedEvents.length})`}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        <DayTaskList
          tasks={dayTasks}
          onComplete={onCompleteTask}
          onUndoComplete={onUndoCompleteTask}
          onEdit={onEditTask}
          onDelete={onDeleteTask}
        />
        <div className="mt-1 flex min-h-0 flex-1 flex-col overflow-hidden">
          {weekEventsLoading ? (
            <ScheduleLoadingSkeleton />
          ) : showNoFamilyEmpty ? (
            <EmptyState context="day" variant="no_family" />
          ) : showListView ? (
            hasAnyWeekEvents ? (
              <WeeklyList
                weekLayoutData={weekLayoutData}
                onSelectEvent={handleSelectEvent}
                onDeleteEvent={(event, date) => onDeleteWeeklyEvent(event, date)}
                onMoveEvent={(event, fromDate, toDate) => onMoveWeeklyEvent(event, fromDate, toDate)}
              />
            ) : isWeekFilteredEmpty ? (
              <EmptyState context="week" variant="filtered" />
            ) : (
              <EmptyState context="week" onAddEvent={() => openAddEvent()} />
            )
          ) : layoutItems.length > 0 || backgroundLayoutItems.length > 0 ? (
            <TimelineContainer
              layoutItems={layoutItems}
              backgroundLayoutItems={backgroundLayoutItems}
              gaps={gaps}
              selectedDate={selectedDate}
              onSelectEvent={(event) => handleSelectEvent(event, selectedDate)}
              onSelectBackgroundEvent={onSelectBackgroundEvent}
              onDragReschedule={(eventId, times) => onDragReschedule(eventId, times)}
            />
          ) : isDayFilteredEmpty ? (
            <EmptyState context="day" variant="filtered" />
          ) : (
            <EmptyState context="day" onAddEvent={() => openAddEvent()} />
          )}
        </div>
      </div>
    </div>
  )
}
