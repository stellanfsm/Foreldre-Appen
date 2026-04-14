import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'
import { AppShell } from './components/AppShell'
import { MobileFrame } from './components/MobileFrame'
import { BottomNav } from './components/BottomNav'
import { AuthScreen } from './components/AuthScreen'
import { SettingsScreen } from './components/SettingsScreen'
import { MonthView } from './components/MonthView'
import { TasksScreen } from './components/TasksScreen'
import type { NavTab } from './components/BottomNav'
import { useScheduleState } from './hooks/useScheduleState'
import { useAutoFillWeek } from './hooks/useAutoFillWeek'
import { useFamily } from './context/FamilyContext'
import type { Event, Task } from './types'
import { useAuth } from './context/AuthContext'
import { useEffectiveUserId } from './context/EffectiveUserIdContext'
import { useUserPreferences } from './context/UserPreferencesContext'
import { useReminders } from './hooks/useReminders'
import { usePartnerNotify } from './hooks/usePartnerNotify'
import { useNotifications } from './hooks/useNotifications'
import { checkAndRecordNotify } from './lib/notifyPartner'
import { useResolvedMePersonId } from './hooks/useResolvedMePersonId'
import { useTimeOfDaySurface } from './hooks/useTimeOfDaySurface'
import { startUxTimer, endUxTimer, logUxMetric } from './lib/uxMetrics'
import { logEvent } from './lib/appLogger'
import { addCalendarDaysOslo, todayKeyOslo } from './lib/osloCalendar'
import { useSaveFeedback } from './features/app/hooks/useSaveFeedback'
import { useInviteAcceptance } from './features/invites/hooks/useInviteAcceptance'
import { AppNoticeStack } from './features/app/components/AppNoticeStack'
import { CalendarHomeTab } from './features/calendar/CalendarHomeTab'
import { CalendarOverlays } from './features/calendar/CalendarOverlays'
import { useEventController } from './features/calendar/hooks/useEventController'
import { useTasksState } from './hooks/useTasksState'
import { useTaskController } from './features/tasks/hooks/useTaskController'
import { OnboardingTour } from './components/OnboardingTour'
import { DebugOverlay } from './components/DebugOverlay'
import { loadOnboarding, resetOnboarding } from './lib/onboarding'
import { FamilySetupScreen, isFamilySetupSkipped } from './components/FamilySetupScreen'
import { TankestromImportDialog } from './features/tankestrom/TankestromImportDialog'

/** Set to true to re-enable the onboarding tour. */
const ENABLE_ONBOARDING = false

function App() {
  useTimeOfDaySurface()
  const reducedMotion = useReducedMotion() ?? false
  const { user, loading } = useAuth()
  const { refetch: refetchEffectiveUserId, isLinked, linkLoading, effectiveUserId } = useEffectiveUserId()
  const { error: familyError, people, loading: familyLoading, loaded: familyLoaded } = useFamily()
  const {
    selectedDate,
    setSelectedDate,
    selectedPersonIds,
    setSelectedPersonIds,
    showListView,
    setShowListView,
    visibleEvents,
    allDayEventsForDay,
    layoutItems,
    backgroundLayoutItems,
    gaps,
    weekLayoutData,
    selectedEvent,
    setSelectedEvent,
    addEvent,
    addRecurring,
    updateEvent,
    deleteEvent,
    updateAllInSeries,
    deleteAllInSeries,
    purgePersonEvents,
    weekEventsLoading,
    clearAllEvents,
    scheduleError,
    clearScheduleError,
    dayEvents,
    reminderEvents,
    osloTodayDateKey,
    hasRawEventsInWeek,
    getVisibleEventsForDate,
    prefetchEventsForDateRange,
  } = useScheduleState()
  useReminders(reminderEvents, osloTodayDateKey)
  const hasLinkedPartner = people.some((p) => p.memberKind === 'parent' && !!p.linkedAuthUserId)

  const partnerAuthId = useMemo(() => {
    if (!hasLinkedPartner) return null
    if (isLinked) return effectiveUserId
    return people.find((p) => p.memberKind === 'parent' && !!p.linkedAuthUserId)?.linkedAuthUserId ?? null
  }, [hasLinkedPartner, isLinked, effectiveUserId, people])

  const { sendTaskNotify } = usePartnerNotify({
    effectiveUserId: hasLinkedPartner ? effectiveUserId : null,
    currentUserId: user?.id ?? null,
    partnerUserId: partnerAuthId,
  })

  const { notifications: inboxNotifications, unreadCount: inboxUnreadCount, markAllRead: markInboxRead, dismiss: dismissNotification } = useNotifications(user?.id ?? null)
  const [isAdding, setIsAdding] = useState(false)
  const [addFlowSaved, setAddFlowSaved] = useState(false)
  /** When set, AddEventSheet targets this date (e.g. måned → langt trykk) instead of selectedDate */
  const [addEventDateOverride, setAddEventDateOverride] = useState<string | null>(null)
  const [editingEvent, setEditingEvent] = useState<{ event: Event; date: string; scope: 'this' | 'all' } | null>(null)
  const [isAddingTask, setIsAddingTask] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [selectedBackgroundEvent, setSelectedBackgroundEvent] = useState<{ event: Event; date: string } | null>(null)
  const [navTab, setNavTab] = useState<NavTab>('today')
  const [lastCalendarTab, setLastCalendarTab] = useState<'today' | 'week' | 'month'>('today')
  const { currentPersonId, hapticsEnabled } = useUserPreferences()
  const mePersonId = useResolvedMePersonId(people, currentPersonId, user?.id)

  const [hideFamilyBanner, setHideFamilyBanner] = useState(false)
  const [notifyToast, setNotifyToast] = useState<string | null>(null)
  const notifyToastTimerRef = useRef<number | null>(null)
  const { saveFeedback, showSaveFeedback, showSavingFeedback, showSaveError } = useSaveFeedback(hapticsEnabled)
  const { tasksByDate, addTask, patchTask, removeTask, prefetchTasksForRange } = useTasksState(selectedDate)

  const handleMonthRangePrefetch = useCallback(
    (start: string, end: string) => {
      void prefetchEventsForDateRange(start, end)
      void prefetchTasksForRange(start, end)
    },
    [prefetchEventsForDateRange, prefetchTasksForRange]
  )

  const filteredTasksByDate = useMemo(() => {
    if (selectedPersonIds.length === 0) return tasksByDate
    const ids = new Set(selectedPersonIds)
    return Object.fromEntries(
      Object.entries(tasksByDate).map(([date, tasks]) => [
        date,
        tasks.filter(
          (t) =>
            (t.childPersonId != null && ids.has(t.childPersonId)) ||
            (t.assignedToPersonId != null && ids.has(t.assignedToPersonId))
        ),
      ])
    )
  }, [tasksByDate, selectedPersonIds])

  const hasHighlightedTaskOnDate = useCallback(
    (date: string): boolean =>
      (filteredTasksByDate[date] ?? []).some((t) => t.showInMonthView && !t.completedAt),
    [filteredTasksByDate]
  )
  const taskController = useTaskController({
    addTask,
    patchTask,
    removeTask,
    showSavingFeedback,
    showSaveFeedback,
    showSaveError,
  })
  const controller = useEventController({
    addEvent,
    addRecurring,
    updateEvent,
    deleteEvent,
    updateAllInSeries,
    deleteAllInSeries,
    showSavingFeedback,
    showSaveFeedback,
    showSaveError,
  })
  const [showTour, setShowTour] = useState(false)
  useEffect(() => {
    if (!ENABLE_ONBOARDING) return
    if (user && !loadOnboarding(user.id).tourCompleted) {
      const t = setTimeout(() => setShowTour(true), 600)
      return () => clearTimeout(t)
    }
  }, [user])

  const [familySetupDismissed, setFamilySetupDismissed] = useState(false)
  const [tankestromImportOpen, setTankestromImportOpen] = useState(false)
  useEffect(() => {
    if (user?.id && isFamilySetupSkipped(user.id)) setFamilySetupDismissed(true)
  }, [user?.id])

  useEffect(() => {
    if (user) logEvent('session_start', { userId: user.id.slice(0, 8) })
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const { inviteNotice, setInviteNotice, inviteProcessing } = useInviteAcceptance({
    userId: user?.id,
    onAccepted: refetchEffectiveUserId,
  })
  const taskCountByDate = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(filteredTasksByDate).map(([date, tasks]) => [
          date,
          tasks.filter((t) => !t.completedAt).length,
        ])
      ),
    [filteredTasksByDate]
  )

  useAutoFillWeek({
    week: weekLayoutData,
    addEvent,
    addRecurring,
    clearAllEvents,
  })

  useEffect(() => {
    setHideFamilyBanner(false)
  }, [familyError])

  if (loading) {
    return (
      <AppShell>
        <MobileFrame>
          <div className="flex h-full w-full min-w-0 max-w-full flex-col items-center justify-center gap-3 overflow-x-hidden text-zinc-500">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
            <p className="text-sm">Loading…</p>
          </div>
        </MobileFrame>
      </AppShell>
    )
  }

  if (!user) {
    return (
      <AppShell>
        <MobileFrame>
          <AuthScreen />
        </MobileFrame>
      </AppShell>
    )
  }

  const hasChildren = people.some((p) => p.memberKind === 'child')
  const needsFamilySetup =
    !isLinked && !linkLoading && familyLoaded && !hasChildren && !familySetupDismissed

  if (needsFamilySetup) {
    return (
      <AppShell>
        <MobileFrame>
          <FamilySetupScreen
            onSkip={() => setFamilySetupDismissed(true)}
          />
        </MobileFrame>
      </AppShell>
    )
  }

  const handleSelectEvent = (event: Event, date: string) => {
    if (event.metadata?.calendarLayer === 'background') return
    logEvent('event_opened', { eventId: event.id, title: event.title, date })
    setSelectedEvent({ event, date })
  }

  const shiftSelectedDateByDays = (days: number) => {
    setSelectedDate((prev) => addCalendarDaysOslo(prev, days))
  }

  const handleChangeWeek = (deltaWeeks: number) => {
    shiftSelectedDateByDays(deltaWeeks * 7)
  }

  const handleJumpToToday = () => {
    const today = todayKeyOslo()
    setSelectedDate(today)
    setNavTab('today')
    setShowListView(false)
    setLastCalendarTab('today')
  }

  const openAddEvent = (dateOverride: string | null = null) => {
    logEvent('sheet_opened', { sheet: 'add_event', date: dateOverride ?? selectedDate })
    startUxTimer('add_event_flow')
    setAddFlowSaved(false)
    setAddEventDateOverride(dateOverride)
    setIsAdding(true)
  }

  const openAddTask = () => {
    logEvent('sheet_opened', { sheet: 'add_task' })
    setEditingTask(null)
    setIsAddingTask(true)
  }

  const hasAnyWeekEvents = weekLayoutData.some((d) => d.events.length > 0)
  const isDayFilteredEmpty =
    !weekEventsLoading &&
    !showListView &&
    dayEvents.length > 0 &&
    visibleEvents.length === 0 &&
    selectedPersonIds.length > 0
  const isWeekFilteredEmpty =
    !weekEventsLoading && showListView && hasRawEventsInWeek && !hasAnyWeekEvents
  const showNoFamilyEmpty = !familyLoading && people.length === 0
  const effectiveNav: NavTab = navTab === 'settings' ? 'settings' : navTab === 'logistics' ? 'logistics' : navTab === 'month' ? 'month' : showListView ? 'week' : 'today'

  return (
    <AppShell>
      <MobileFrame>
        <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-x-hidden">
          <AppNoticeStack
            inviteNotice={inviteNotice}
            onDismissInvite={() => setInviteNotice(null)}
            inviteProcessing={inviteProcessing}
            scheduleError={scheduleError}
            onDismissScheduleError={clearScheduleError}
            familyError={familyError}
            hideFamilyBanner={hideFamilyBanner}
            onDismissFamilyError={() => setHideFamilyBanner(true)}
          />
          <div className="flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden overflow-y-hidden">
          {navTab === 'settings' ? (
            <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
              <SettingsScreen
                onPersonRemoved={purgePersonEvents}
                onClearAllEvents={clearAllEvents}
                onRestartOnboarding={() => {
                  resetOnboarding(user.id)
                  setNavTab('today')
                  setShowListView(false)
                  setLastCalendarTab('today')
                  setShowTour(true)
                }}
                onOpenTankestromImport={() => setTankestromImportOpen(true)}
              />
            </div>
          ) : navTab === 'month' ? (
            <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
            <MonthView
              selectedDate={selectedDate}
              onSelectDate={(date) => {
                setSelectedDate(date)
              }}
              hasEventsOnDate={(date) => getVisibleEventsForDate(date).length > 0}
              getEventsForDate={getVisibleEventsForDate}
              hasHighlightedTaskOnDate={hasHighlightedTaskOnDate}
              onVisibleMonthRange={handleMonthRangePrefetch}
              onAddEventForDate={(date) => {
                openAddEvent(date)
              }}
              onSelectEvent={(event, date) => {
                setSelectedDate(date)
                setSelectedEvent({ event, date })
                setNavTab('today')
                setShowListView(false)
                setLastCalendarTab('today')
              }}
            />
            </div>
          ) : navTab === 'logistics' ? (
            <TasksScreen
              weekLayoutData={weekLayoutData}
              tasksByDate={filteredTasksByDate}
              openAddTask={openAddTask}
              onCompleteTask={(task) => { void taskController.markTaskDone(task).catch(() => {}) }}
              onUndoCompleteTask={(task) => { void taskController.undoTaskComplete(task).catch(() => {}) }}
              onEditTask={(task) => { setIsAddingTask(false); setEditingTask(task) }}
              onDeleteTask={(task) => { void taskController.deleteTask(task).catch(() => {}) }}
              onNotifyTask={hasLinkedPartner ? (task) => {
                if (!checkAndRecordNotify(task.id)) return
                void sendTaskNotify(task.title, task.id, task.notes)
                if (notifyToastTimerRef.current != null) window.clearTimeout(notifyToastTimerRef.current)
                setNotifyToast(task.title)
                notifyToastTimerRef.current = window.setTimeout(() => {
                  setNotifyToast(null)
                  notifyToastTimerRef.current = null
                }, 2500)
              } : undefined}
              inboxNotifications={inboxNotifications}
              onMarkInboxRead={() => { void markInboxRead() }}
              onDismissNotification={(id) => { void dismissNotification(id) }}
            />
          ) : (
            <CalendarHomeTab
              selectedPersonIds={selectedPersonIds}
              setSelectedPersonIds={setSelectedPersonIds}
              mePersonId={mePersonId}
              openAddEvent={openAddEvent}
              weekLayoutData={weekLayoutData}
              setSelectedDate={setSelectedDate}
              selectedDate={selectedDate}
              handleSelectEvent={handleSelectEvent}
              handleChangeWeek={handleChangeWeek}
              handleJumpToToday={handleJumpToToday}
              saveFeedback={saveFeedback}
              reducedMotion={reducedMotion}
              weekEventsLoading={weekEventsLoading}
              showNoFamilyEmpty={showNoFamilyEmpty}
              showListView={showListView}
              hasAnyWeekEvents={hasAnyWeekEvents}
              isWeekFilteredEmpty={isWeekFilteredEmpty}
              isDayFilteredEmpty={isDayFilteredEmpty}
              layoutItems={layoutItems}
              backgroundLayoutItems={backgroundLayoutItems}
              gaps={gaps}
              onSelectBackgroundEvent={(event) => {
                startUxTimer('resolve_conflict_flow')
                setSelectedEvent(null)
                setSelectedBackgroundEvent({ event, date: selectedDate })
              }}
              onDragReschedule={async (eventId, times) => {
                await controller.dragReschedule(selectedDate, eventId, times).catch(() => {})
              }}
              onDeleteWeeklyEvent={async (event, date) => {
                await controller.deleteEvent(date, event).catch(() => {})
              }}
              openAddTask={openAddTask}
              taskCountByDate={taskCountByDate}
              dayTasks={filteredTasksByDate[selectedDate] ?? []}
              allDayEvents={allDayEventsForDay}
            />
          )}
          </div>

          {notifyToast && (
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-none fixed inset-x-0 z-[50] flex justify-center px-3"
              style={{ bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}
            >
              <div className="flex w-full max-w-[390px] items-center gap-3 rounded-2xl border-2 border-brandTeal/30 bg-brandTeal px-3 py-2.5 text-white shadow-planner">
                <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug">Varslet din partner om «{notifyToast}»</p>
              </div>
            </div>
          )}

          <BottomNav
            active={effectiveNav}
            logisticsNotifyCount={inboxUnreadCount}
            lastCalendarTab={lastCalendarTab}
            onSelect={(tab) => {
              logEvent('tab_switched', { tab })
              setNavTab(tab)
              if (tab === 'week') { setShowListView(true); setLastCalendarTab('week') }
              else if (tab === 'today') { setShowListView(false); setLastCalendarTab('today') }
              else if (tab === 'month') { setLastCalendarTab('month') }
            }}
          />
        </div>
      </MobileFrame>

      {ENABLE_ONBOARDING && showTour && (
        <OnboardingTour onComplete={() => setShowTour(false)} />
      )}
      <DebugOverlay />
      <TankestromImportDialog
        open={tankestromImportOpen}
        onClose={() => setTankestromImportOpen(false)}
        people={people}
        createEvent={controller.createEvent}
      />
      <CalendarOverlays
        selectedEvent={selectedEvent}
        setSelectedEvent={setSelectedEvent}
        selectedBackgroundEvent={selectedBackgroundEvent}
        setSelectedBackgroundEvent={setSelectedBackgroundEvent}
        dayEvents={dayEvents}
        isAdding={isAdding}
        selectedDate={selectedDate}
        addEventDateOverride={addEventDateOverride}
        addFlowSaved={addFlowSaved}
        setAddFlowSaved={setAddFlowSaved}
        setIsAdding={setIsAdding}
        setAddEventDateOverride={setAddEventDateOverride}
        editingEvent={editingEvent}
        setEditingEvent={setEditingEvent}
        controller={controller}
        mePersonId={mePersonId}
        onAddFlowSaved={() => endUxTimer('add_event_flow', 'time_to_add_event_ms')}
        onAddFlowClosedWithoutSave={() => logUxMetric('flow_backtracks', 1)}
        onConflictResolved={() => endUxTimer('resolve_conflict_flow', 'time_to_resolve_conflict_ms')}
        isAddingTask={isAddingTask}
        setIsAddingTask={setIsAddingTask}
        editingTask={editingTask}
        setEditingTask={setEditingTask}
        taskController={taskController}
      />
    </AppShell>
  )
}

export default App
