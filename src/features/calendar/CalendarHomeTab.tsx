import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FamilyFilterBar } from '../../components/FamilyFilterBar'
import { SearchBar } from '../../components/SearchBar'
import { WeekStrip } from '../../components/WeekStrip'
import { CalendarDayNote } from '../../components/CalendarDayNote'
import { ScheduleLoadingSkeleton } from '../../components/ScheduleLoadingSkeleton'
import { EmptyState } from '../../components/EmptyState'
import { WeeklyList } from '../../components/WeeklyList'
import { TimelineContainer } from '../../components/TimelineContainer'
import { AllDayRow } from '../../components/AllDayRow'
import { springSnappy } from '../../lib/motion'
import { logEvent } from '../../lib/appLogger'
import { COPY } from '../../lib/norwegianCopy'
import { formatCalendarPeriodContextLabel, todayKeyOslo } from '../../lib/osloCalendar'
import { useFamily } from '../../context/FamilyContext'
import type { Event, Task, PersonId, TimelineLayoutItem, GapInfo } from '../../types'
import type { SaveFeedbackState } from '../app/hooks/useSaveFeedback'
import type { WeekDayLayout } from '../../hooks/useScheduleState'

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
  openAddTask: () => void
  taskCountByDate: Record<string, number>
  dayTasks: Task[]
  allDayEvents: Event[]
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
  openAddTask,
  taskCountByDate,
  dayTasks,
  allDayEvents,
}: CalendarHomeTabProps) {
  const [showTodayPanel, setShowTodayPanel] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const { people } = useFamily()

  const openTasksWithPerson = useMemo(() =>
    dayTasks
      .filter((t) => !t.completedAt)
      .sort((a, b) => (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99'))
      .map((t) => ({
        task: t,
        person: people.find((p) => p.id === (t.childPersonId ?? t.assignedToPersonId)),
      })),
    [dayTasks, people]
  )

  useEffect(() => {
    if (searchOpen) logEvent('search_opened', {})
  }, [searchOpen])

  const periodContextLabel = useMemo(
    () => (weekLayoutData.length > 0 ? formatCalendarPeriodContextLabel(selectedDate) : null),
    [selectedDate, weekLayoutData.length]
  )

  const todayKey = todayKeyOslo()
  const todayDayData = weekLayoutData.find((d) => d.date === todayKey)
  const todayEvents = todayDayData?.events ?? []
  const todayOpenTasks = selectedDate === todayKey ? dayTasks.filter((t) => !t.completedAt) : []
  const todayHasData = todayEvents.length > 0 || todayOpenTasks.length > 0

  return (
    <div className="relative mt-2 flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden pb-4">
      <div className="flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden overflow-y-hidden">
        <FamilyFilterBar
          selectedPersonIds={selectedPersonIds}
          onFilterChange={setSelectedPersonIds}
          mePersonId={mePersonId}
        />
        {/* Controls row — collapses to a full-width search strip when search is open */}
        {searchOpen ? (
          /* Search mode: only the SearchBar (input + X button), full row width */
          <div className="flex items-center px-3 pb-1.5 pt-0.5">
            <SearchBar
              open={true}
              onOpenChange={setSearchOpen}
              weekLayoutData={weekLayoutData}
              onJumpToDate={setSelectedDate}
              onSelectEvent={handleSelectEvent}
            />
          </div>
        ) : (
          /* Normal mode: nav + action buttons + search icon at right */
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none px-3 pb-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => handleChangeWeek(-1)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-100 text-neutral-400 shadow-card transition hover:bg-neutral-50 active:bg-neutral-200 touch-manipulation"
              aria-label="Forrige uke"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 19.5-7.5-7.5 7.5-7.5" />
              </svg>
            </button>
            <button
              id="onb-jump-today"
              type="button"
              onClick={handleJumpToToday}
              aria-label="Hopp til i dag"
              className="shrink-0 rounded-xl border border-neutral-200 bg-neutral-100 px-2.5 py-1.5 text-caption font-medium text-neutral-500 shadow-card transition hover:bg-neutral-50 active:bg-neutral-200 touch-manipulation"
            >
              I dag
            </button>
            <button
              type="button"
              onClick={() => handleChangeWeek(1)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-100 text-neutral-400 shadow-card transition hover:bg-neutral-50 active:bg-neutral-200 touch-manipulation"
              aria-label="Neste uke"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
            <div className="h-5 w-px shrink-0 bg-neutral-200" />
            <button
              id="onb-add-event"
              type="button"
              onClick={() => openAddEvent()}
              className="shrink-0 rounded-pill bg-primary-600 px-3 py-1.5 text-caption font-semibold text-neutral-100 shadow-card transition hover:bg-primary-700 active:translate-y-px active:shadow-press focus:outline-none focus:ring-2 focus:ring-primary-500/50 touch-manipulation"
            >
              + Hendelse
            </button>
            <button
              id="onb-add-task"
              type="button"
              onClick={() => openAddTask()}
              className="shrink-0 rounded-pill border border-primary-600 px-3 py-1.5 text-caption font-semibold text-primary-600 transition hover:bg-primary-50 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-primary-500/50 touch-manipulation"
            >
              + Gjøremål
            </button>
            {/* Right-side: save indicator + search icon — grouped so ml-auto works */}
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {saveFeedback && (
                <motion.span
                  initial={reducedMotion ? false : { scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={springSnappy}
                  className={`inline-flex shrink-0 items-center gap-1 text-caption font-medium ${
                    saveFeedback === 'error' ? 'text-semantic-red-600' : saveFeedback === 'saving' ? 'text-neutral-400' : 'text-primary-600'
                  }`}
                >
                  {saveFeedback !== 'saving' && (
                    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
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
              <SearchBar
                open={false}
                onOpenChange={setSearchOpen}
                weekLayoutData={weekLayoutData}
                onJumpToDate={setSelectedDate}
                onSelectEvent={handleSelectEvent}
              />
            </div>
          </div>
        )}
        <div id="onb-week-strip">
          {periodContextLabel ? (
            <p
              className="px-3 pb-1 pt-0.5 text-center text-[12px] font-semibold leading-tight text-neutral-500 tabular-nums"
              aria-live="polite"
            >
              {periodContextLabel}
            </p>
          ) : null}
          <WeekStrip
            days={weekLayoutData}
            selectedDate={selectedDate}
            onSelectDay={setSelectedDate}
            loading={weekEventsLoading}
            taskCountByDate={taskCountByDate}
          />
        </div>
        <CalendarDayNote date={selectedDate} />
        {todayHasData && (
          <div className="px-3 pb-1">
            <button
              type="button"
              onClick={() => setShowTodayPanel((v) => !v)}
              className="flex w-full items-center gap-2 rounded-xl px-1 py-1.5 text-left transition hover:bg-neutral-50"
            >
              <span className="text-caption font-semibold uppercase tracking-wider text-neutral-400">I dag</span>
              <span className="min-w-0 flex-1 truncate text-caption text-neutral-400">
                {todayEvents.length > 0 && `${todayEvents.length} ${todayEvents.length === 1 ? 'hendelse' : 'hendelser'}`}
                {todayEvents.length > 0 && todayOpenTasks.length > 0 && ' · '}
                {todayOpenTasks.length > 0 && (
                  <span className="text-accent-sun-main">{todayOpenTasks.length} gjøremål</span>
                )}
              </span>
              <motion.svg
                animate={{ rotate: showTodayPanel ? 180 : 0 }}
                transition={springSnappy}
                className="h-3 w-3 shrink-0 text-neutral-300"
                fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </motion.svg>
            </button>
            <AnimatePresence>
              {showTodayPanel && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-2 px-1 pb-2 pt-0.5">
                    {todayEvents.length > 0 && (
                      <div className="space-y-1">
                        {todayEvents.map((e) => (
                          <div key={e.id} className="flex items-center gap-2">
                            <span className="shrink-0 tabular-nums text-caption text-neutral-400">{e.start}–{e.end}</span>
                            <span className="min-w-0 truncate text-label font-medium text-neutral-600">{e.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {todayOpenTasks.length > 0 && (
                      <div className="space-y-1">
                        {todayOpenTasks.map((t) => (
                          <div key={t.id} className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-sm bg-accent-sun-main" />
                            {t.dueTime && (
                              <span className="shrink-0 tabular-nums text-caption font-semibold text-accent-sun-main">{t.dueTime}</span>
                            )}
                            <span className="min-w-0 truncate text-label font-medium text-neutral-600">{t.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        {openTasksWithPerson.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none px-3 pb-1.5 pt-0.5">
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-neutral-400" aria-hidden>Gjøremål</span>
            {openTasksWithPerson.map(({ task, person }) => (
              <div
                key={task.id}
                className="flex shrink-0 items-center gap-1.5 rounded-pill border px-2.5 py-1 text-caption font-medium"
                style={person ? {
                  backgroundColor: person.colorTint,
                  borderColor: person.colorAccent,
                  color: '#14211b',
                } : {
                  backgroundColor: '#fbedc1',
                  borderColor: '#c69a35',
                  color: '#14211b',
                }}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: person?.colorAccent ?? '#fbbf24' }}
                />
                {task.dueTime && (
                  <span
                    className="font-semibold"
                    style={{ color: person?.colorAccent ?? '#d97706' }}
                  >
                    {task.dueTime}
                  </span>
                )}
                <span className="max-w-[110px] truncate">{task.title}</span>
              </div>
            ))}
          </div>
        )}
        {!showListView && allDayEvents.length > 0 && (
          <AllDayRow
            events={allDayEvents}
            selectedDate={selectedDate}
            onSelectEvent={(event) => {
              const anchorDate = (event.metadata as any)?.__anchorDate as string | undefined ?? selectedDate
              handleSelectEvent(event, anchorDate)
            }}
          />
        )}
        <div id="onb-timeline" className="mt-1 flex min-h-0 flex-1 flex-col overflow-hidden">
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
                onAddEventForDay={(date) => openAddEvent(date)}
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
              dayTasks={dayTasks}
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
