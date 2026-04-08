import { useRef, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { DragReschedulePayload, GapInfo, TimelineLayoutItem, Task } from '../types'
import { TimeRail } from './TimeRail'
import { TimelineGrid } from './TimelineGrid'
import { timelineTotalHeight, PIXELS_PER_HOUR, TIMELINE_START_HOUR, TIMELINE_END_HOUR } from '../lib/time'
import { getNowMinutes, isToday } from '../lib/schedule'
import type { Event } from '../types'
import { timelineDayVariants } from '../lib/motion'

interface TimelineContainerProps {
  layoutItems: TimelineLayoutItem[]
  backgroundLayoutItems?: TimelineLayoutItem[]
  gaps: GapInfo[]
  selectedDate: string
  pixelsPerHour?: number
  onSelectEvent: (event: Event) => void
  onSelectBackgroundEvent?: (event: Event) => void
  onDragReschedule?: (eventId: string, payload: DragReschedulePayload) => void | Promise<void>
  dayTasks?: Task[]
}

const DAY_START_MIN = TIMELINE_START_HOUR * 60
const DAY_END_MIN = TIMELINE_END_HOUR * 60

function getFirstItemTop(items: TimelineLayoutItem[]): number {
  if (items.length === 0) return 0
  return items[0].block.topPx
}

export function TimelineContainer({
  layoutItems,
  backgroundLayoutItems = [],
  gaps,
  selectedDate,
  pixelsPerHour = PIXELS_PER_HOUR,
  onSelectEvent,
  onSelectBackgroundEvent,
  onDragReschedule,
  dayTasks,
}: TimelineContainerProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion() ?? false
  const dayVariants = timelineDayVariants(reducedMotion)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const total = timelineTotalHeight(pixelsPerHour)

    if (isToday(selectedDate)) {
      const now = getNowMinutes()
      if (now >= DAY_START_MIN && now < DAY_END_MIN) {
        const y = ((now - DAY_START_MIN) / 60) * pixelsPerHour
        const target = Math.max(0, y - el.clientHeight / 2)
        el.scrollTo({ top: Math.min(target, total - el.clientHeight), behavior: 'smooth' })
      } else if (layoutItems.length > 0) {
        const firstY = getFirstItemTop(layoutItems)
        el.scrollTo({ top: Math.max(0, firstY - 40), behavior: 'smooth' })
      }
    } else {
      if (layoutItems.length > 0) {
        const firstY = getFirstItemTop(layoutItems)
        el.scrollTo({ top: Math.max(0, firstY - 40), behavior: 'smooth' })
      }
    }
  }, [selectedDate, pixelsPerHour])

  return (
    <div
      ref={scrollRef}
      className="flex min-h-0 w-full min-w-0 max-w-full flex-1 overflow-y-auto overflow-x-hidden scrollbar-none"
    >
      <TimeRail pixelsPerHour={pixelsPerHour} />
      <div className="relative min-w-0 flex-1 px-2">
        <motion.div
          key={selectedDate}
          variants={dayVariants}
          initial="dayEnter"
          animate="dayVisible"
        >
          <TimelineGrid
            layoutItems={layoutItems}
            backgroundLayoutItems={backgroundLayoutItems}
            gaps={gaps}
            showCurrentTime={isToday(selectedDate)}
            selectedDate={selectedDate}
            pixelsPerHour={pixelsPerHour}
            onSelectEvent={onSelectEvent}
            onSelectBackgroundEvent={onSelectBackgroundEvent}
            onDragReschedule={onDragReschedule}
            dayTasks={dayTasks}
          />
        </motion.div>
      </div>
    </div>
  )
}
