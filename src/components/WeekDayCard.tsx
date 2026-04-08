import { motion, type Variants } from 'framer-motion'
import type { WeekDayMeta } from '../types'
import { useFamily } from '../context/FamilyContext'
import { springSnappy } from '../lib/motion'
import { norwegianDayHasCalendarHighlight } from '../lib/norwegianSchoolCalendar'

interface WeekDayCardProps {
  day: WeekDayMeta
  isSelected: boolean
  onSelect: () => void
  variants?: Variants
  openTaskCount?: number
}

export function WeekDayCard({ day, isSelected, onSelect, variants, openTaskCount = 0 }: WeekDayCardProps) {
  const { people } = useFamily()
  const dateNum = day.date.slice(8).replace(/^0/, '')
  const norwegianDay = norwegianDayHasCalendarHighlight(day.date)
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      variants={variants}
      className={`relative flex min-h-[44px] min-w-0 flex-1 basis-0 flex-col items-center justify-center rounded-card border-2 py-2.5 touch-manipulation transition-shadow ${
        isSelected
          ? 'border-brandNavy bg-brandSky shadow-planner'
          : 'border-transparent bg-transparent'
      }`}
      whileTap={{ scale: 0.98, transition: springSnappy }}
      aria-pressed={isSelected}
      aria-label={`Select ${day.dayLabel} ${day.date}`}
    >
      <span
        className={`text-[12px] font-medium uppercase tracking-wide ${
          isSelected ? 'text-zinc-600' : 'text-zinc-400'
        }`}
      >
        {day.dayAbbr}
      </span>
      <span
        className={`font-display mt-0.5 text-[17px] font-semibold ${
          isSelected ? 'text-brandNavy' : 'text-zinc-500'
        }`}
      >
        {dateNum}
      </span>
      {norwegianDay && (
        <span
          className="pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500/90"
          title="Helligdag eller skoleferie"
          aria-hidden
        />
      )}
      <div className="mt-1 flex gap-0.5">
        {people.filter((p) => day.personIdsWithEvents.includes(p.id)).map((p) => (
          <span
            key={p.id}
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: p.colorAccent }}
            aria-hidden
          />
        ))}
        {openTaskCount > 0 && (
          <span
            className="h-1.5 w-1.5 rounded-sm bg-amber-400"
            title="Oppgaver"
            aria-hidden
          />
        )}
      </div>
    </motion.button>
  )
}
