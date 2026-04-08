import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FamilyFilterBar } from '../../components/FamilyFilterBar'
import { SearchBar } from '../../components/SearchBar'
import { WeekStrip } from '../../components/WeekStrip'
import { CalendarDayNote } from '../../components/CalendarDayNote'
import { ScheduleLoadingSkeleton } from '../../components/ScheduleLoadingSkeleton'
import { EmptyState } from '../../components/EmptyState'
import { WeeklyList } from '../../components/WeeklyList'
import { TimelineContainer } from '../../components/TimelineContainer'
import { springSnappy } from '../../lib/motion'
import { COPY } from '../../lib/norwegianCopy'
import { todayKeyOslo } from '../../lib/osloCalendar'
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
  onMoveWeeklyEvent: (event: Event, fromDate: string, toDate: string) => Promise<void>
  openAddTask: () => void
  taskCountByDate: Record<string, number>
  dayTasks: Task[]
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
  onMoveWeeklyEvent,
  openAddTask,
  taskCountByDate,
  dayTasks,
}: CalendarHomeTabProps) {
  const [showTodayPanel, setShowTodayPanel] = useState(false)
  const todayKey = todayKeyOslo()
  const todayDayData = weekLayoutData.find((d) => d.date === todayKey)
  const todayEvents = todayDayData?.events ?? []
  const todayOpenTasks = selectedDate === todayKey ? dayTasks.filter((t) => !t.completedAt) : []
  const todayHasData = todayEvents.length > 0 || todayOpenTasks.length > 0

  return (
    <div className="relative mt-3 flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden px-3 pb-4">
      <div className="flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden overflow-y-hidden">
        <FamilyFilterBar
          selectedPersonIds={selectedPersonIds}
          onFilterChange={setSelectedPersonIds}
          mePersonId={mePersonId}
        />
        <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-1">
          <div className="flex shrink-0 gap-2">
            <button
              id="onb-add-event"
              type="button"
              onClick={() => openAddEvent()}
              className="rounded-full bg-brandTeal px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-planner transition hover:brightness-95 active:translate-y-px active:shadow-planner-press focus:outline-none focus:ring-2 focus:ring-brandTeal focus:ring-offset-2"
            >
              + Aktivitet
            </button>
            <button
              id="onb-add-task"
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
        <div id="onb-week-strip">
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
          <div className="px-4 pb-1">
            <button
              type="button"
              onClick={() => setShowTodayPanel((v) => !v)}
              className="flex w-full items-center gap-2 py-1 text-left"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">I dag</span>
              <span className="flex-1 text-[11px] text-zinc-500">
                {todayEvents.length > 0 && `${todayEvents.length} aktivitet${todayEvents.length === 1 ? '' : 'er'}`}
                {todayEvents.length > 0 && todayOpenTasks.length > 0 && ' · '}
                {todayOpenTasks.length > 0 && (
                  <span className="text-amber-600">{todayOpenTasks.length} oppgave{todayOpenTasks.length === 1 ? '' : 'r'}</span>
                )}
              </span>
              <motion.svg
                animate={{ rotate: showTodayPanel ? 180 : 0 }}
                transition={springSnappy}
                className="h-3 w-3 shrink-0 text-zinc-400"
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
                  <div className="space-y-3 pb-2 pt-1">
                    {todayEvents.length > 0 && (
                      <div className="space-y-1">
                        {todayEvents.map((e) => (
                          <div key={e.id} className="flex items-center gap-2">
                            <span className="shrink-0 tabular-nums text-[11px] text-zinc-400">{e.start}–{e.end}</span>
                            <span className="min-w-0 truncate text-[12px] font-medium text-zinc-800">{e.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {todayOpenTasks.length > 0 && (
                      <div className="space-y-1">
                        {todayOpenTasks.map((t) => (
                          <div key={t.id} className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-sm bg-amber-400" />
                            {t.dueTime && (
                              <span className="shrink-0 tabular-nums text-[11px] font-semibold text-amber-500">{t.dueTime}</span>
                            )}
                            <span className="min-w-0 truncate text-[12px] font-medium text-zinc-800">{t.title}</span>
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
        {dayTasks.some((t) => !t.completedAt) && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none px-4 pb-2 pt-1">
            {dayTasks
              .filter((t) => !t.completedAt)
              .sort((a, b) => (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99'))
              .map((task) => (
                <div
                  key={task.id}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-sm bg-amber-400" />
                  {task.dueTime && (
                    <span className="font-semibold text-amber-500">{task.dueTime}</span>
                  )}
                  <span className="max-w-[110px] truncate">{task.title}</span>
                </div>
              ))}
          </div>
        )}
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
