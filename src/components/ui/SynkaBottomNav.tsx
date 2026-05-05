import { LayoutGroup, motion } from 'framer-motion'
import { springSnappy } from '../../lib/motion'

export type NavTab = 'today' | 'week' | 'month' | 'logistics' | 'settings'

interface SynkaBottomNavProps {
  active: NavTab
  onSelect?: (tab: NavTab) => void
  logisticsNotifyCount?: number
  /** The last active calendar tab — used to restore context when returning from tasks/settings. */
  lastCalendarTab?: 'today' | 'week' | 'month'
}

const VIEW_CYCLE: NavTab[] = ['today', 'week', 'month']

function viewLabel(tab: NavTab): string {
  if (tab === 'today') return 'I dag'
  if (tab === 'week') return 'Uke'
  if (tab === 'month') return 'Måned'
  return 'I dag'
}

function nextViewLabel(tab: 'today' | 'week' | 'month'): string {
  const idx = VIEW_CYCLE.indexOf(tab)
  const next = VIEW_CYCLE[(idx + 1) % VIEW_CYCLE.length] as NavTab
  return viewLabel(next)
}

export function SynkaBottomNav({ active, onSelect, logisticsNotifyCount = 0, lastCalendarTab = 'today' }: SynkaBottomNavProps) {
  const base = 'relative z-0 flex flex-1 items-center justify-center overflow-hidden rounded-lg py-3 text-[14px] font-semibold transition-all duration-120 touch-manipulation'
  const inactiveText = 'text-neutral-400'
  const activeText = 'text-neutral-600'

  const calendarActive = active !== 'settings' && active !== 'logistics'
  const currentView = calendarActive ? active : lastCalendarTab

  function cycleView() {
    const idx = VIEW_CYCLE.indexOf(currentView)
    const next = VIEW_CYCLE[(idx + 1) % VIEW_CYCLE.length]
    onSelect?.(next)
  }

  return (
    <nav className="relative flex h-[72px] min-h-[72px] w-full max-w-full min-w-0 shrink-0 items-stretch overflow-x-hidden overflow-y-visible px-4 py-2">
      {/* Backdrop: opaque surface so scrolling content never bleeds through; blur sits above app body */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 border-t border-neutral-200 bg-neutral-100/98 backdrop-blur-md"
        aria-hidden
      />
      
      {/* Tab container - matches design from HTML assets */}
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 gap-1">
        <LayoutGroup id="synka-bottom-nav">
          <div className="inline-flex bg-neutral-100 border border-neutral-200 rounded-[18px] p-1.5 gap-1 shadow-card">
            {/* Calendar Cycle Button */}
            <button
              id="onb-nav-cycle"
              type="button"
              aria-label={calendarActive ? `Bytt til ${nextViewLabel(currentView)}-visning` : `Tilbake til ${viewLabel(lastCalendarTab)}-visning`}
              onClick={() => {
                if (active === 'settings' || active === 'logistics') {
                  onSelect?.(lastCalendarTab)
                } else {
                  cycleView()
                }
              }}
              className={`${base} ${calendarActive ? activeText : inactiveText} hover:bg-primary-50`}
            >
              {calendarActive && (
                <motion.div
                  layoutId="synka-bottom-nav-indicator"
                  className="pointer-events-none absolute inset-0 z-20 rounded-lg bg-primary-50 shadow-planner-sm"
                  style={{ zIndex: 30 }}
                  transition={springSnappy}
                />
              )}
              <span className="relative z-[40] inline-flex items-center gap-1">
                {calendarActive ? nextViewLabel(currentView) : viewLabel(currentView)}
                <span className="text-[11px] opacity-60" aria-hidden>↻</span>
              </span>
            </button>

            {/* Tasks Button */}
            <button
              id="onb-tasks-tab"
              type="button"
              onClick={() => onSelect?.('logistics')}
              className={`${base} ${active === 'logistics' ? activeText : inactiveText} hover:bg-primary-50`}
            >
              {active === 'logistics' && (
                <motion.div
                  layoutId="synka-bottom-nav-indicator"
                  className="pointer-events-none absolute inset-0 z-20 rounded-lg bg-primary-50 shadow-planner-sm"
                  style={{ zIndex: 30 }}
                  transition={springSnappy}
                />
              )}
              <span className="relative z-[40] inline-flex items-center gap-1.5">
                Gjøremål
                {logisticsNotifyCount > 0 && (
                  <span
                    aria-label={`${logisticsNotifyCount} uleste varsler`}
                    className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-semantic-red-500 px-1 text-[10px] font-bold leading-none text-white"
                  >
                    {logisticsNotifyCount > 9 ? '9+' : logisticsNotifyCount}
                  </span>
                )}
              </span>
            </button>

            {/* Settings Button */}
            <button
              type="button"
              onClick={() => onSelect?.('settings')}
              className={`${base} ${active === 'settings' ? activeText : inactiveText} hover:bg-primary-50`}
            >
              {active === 'settings' && (
                <motion.div
                  layoutId="synka-bottom-nav-indicator"
                  className="pointer-events-none absolute inset-0 z-20 rounded-lg bg-primary-50 shadow-planner-sm"
                  style={{ zIndex: 30 }}
                  transition={springSnappy}
                />
              )}
              <span className="relative z-[40]">Innstillinger</span>
            </button>
          </div>
        </LayoutGroup>
      </div>
    </nav>
  )
}
