import { LayoutGroup, motion } from 'framer-motion'
import { springSnappy } from '../lib/motion'

export type NavTab = 'today' | 'week' | 'month' | 'logistics' | 'settings'

interface BottomNavProps {
  active: NavTab
  onSelect?: (tab: NavTab) => void
}

const VIEW_CYCLE: NavTab[] = ['today', 'week', 'month']

function viewLabel(tab: NavTab): string {
  if (tab === 'today') return 'I dag'
  if (tab === 'week') return 'Uke'
  if (tab === 'month') return 'Måned'
  return 'I dag'
}

export function BottomNav({ active, onSelect }: BottomNavProps) {
  const base =
    'relative z-0 flex flex-1 items-center justify-center overflow-visible rounded-lg py-3 text-[14px] font-semibold transition-colors'
  const inactiveText = 'text-zinc-500'
  const activeText = 'text-brandNavy'

  const calendarActive = active !== 'settings' && active !== 'logistics'
  const currentView = calendarActive ? active : 'today'

  function cycleView() {
    const idx = VIEW_CYCLE.indexOf(currentView)
    const next = VIEW_CYCLE[(idx + 1) % VIEW_CYCLE.length]
    onSelect?.(next)
  }

  return (
    <nav className="relative flex h-[72px] min-h-[72px] w-full max-w-full min-w-0 shrink-0 items-stretch overflow-x-hidden overflow-y-visible px-4 py-2">
      {/* Backdrop: opaque surface so scrolling content never bleeds through; blur sits above app body */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 border-t border-zinc-200/90 bg-surface/98 backdrop-blur-md"
        aria-hidden
      />
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 gap-1">
        <LayoutGroup id="bottom-nav">
          <button
            type="button"
            onClick={() => {
              if (active === 'settings' || active === 'logistics') {
                onSelect?.('today')
              } else {
                cycleView()
              }
            }}
            className={`${base} ${calendarActive ? activeText : inactiveText} hover:bg-brandSky/25`}
          >
            {calendarActive && (
              <motion.div
                layoutId="bottom-nav-indicator"
                className="pointer-events-none absolute inset-0 z-20 rounded-lg border-2 border-brandNavy bg-brandSky shadow-planner-sm"
                style={{ zIndex: 30 }}
                transition={springSnappy}
              />
            )}
            <span className="relative z-[40]">{viewLabel(currentView)}</span>
          </button>
          <button
            id="onb-tasks-tab"
            type="button"
            onClick={() => onSelect?.('logistics')}
            className={`${base} ${active === 'logistics' ? activeText : inactiveText} hover:bg-brandSky/25`}
          >
            {active === 'logistics' && (
              <motion.div
                layoutId="bottom-nav-indicator"
                className="pointer-events-none absolute inset-0 z-20 rounded-lg border-2 border-brandNavy bg-brandSky shadow-planner-sm"
                style={{ zIndex: 30 }}
                transition={springSnappy}
              />
            )}
            <span className="relative z-[40]">Oppgaver</span>
          </button>
          <button
            type="button"
            onClick={() => onSelect?.('settings')}
            className={`${base} ${active === 'settings' ? activeText : inactiveText} hover:bg-brandSky/25`}
          >
            {active === 'settings' && (
              <motion.div
                layoutId="bottom-nav-indicator"
                className="pointer-events-none absolute inset-0 z-20 rounded-lg border-2 border-brandNavy bg-brandSky shadow-planner-sm"
                style={{ zIndex: 30 }}
                transition={springSnappy}
              />
            )}
            <span className="relative z-[40]">Innstillinger</span>
          </button>
        </LayoutGroup>
      </div>
    </nav>
  )
}
