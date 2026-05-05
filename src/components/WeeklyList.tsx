import type { Event } from '../types'
import type { WeekDayLayout } from '../hooks/useScheduleState'
import { formatTimeRange } from '../lib/time'
import { useFamily } from '../context/FamilyContext'
import { formatParticipantNamesLine, getParticipantPeople } from '../lib/eventParticipants'
import { ParticipantAvatarStrip } from './ParticipantAvatarStrip'
import { SwipeableEventRow } from './SwipeableEventRow'
import { AllDayRow } from './AllDayRow'

interface WeeklyListProps {
  weekLayoutData: WeekDayLayout[]
  onSelectEvent: (event: Event, date: string) => void
  onDeleteEvent?: (event: Event, date: string) => void
  /** Optional: open AddEventSheet pre-filled for a specific day. */
  onAddEventForDay?: (date: string) => void
}

function dayHeaderLabel(_date: string, dayAbbr: string, dateStr: string): { day: string; num: string } {
  const d = new Date(dateStr + 'T12:00:00')
  return { day: dayAbbr, num: String(d.getDate()) }
}

export function WeeklyList({ weekLayoutData, onSelectEvent, onDeleteEvent, onAddEventForDay }: WeeklyListProps) {
  const { people } = useFamily()
  return (
    <div className="relative isolate min-h-0 w-full min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto px-4 scrollbar-none">
      <div className="space-y-5 pb-6">
        {weekLayoutData.map((day) => {
          const { day: dAbbr, num } = dayHeaderLabel(day.date, day.dayAbbr, day.date)
          const events = [...day.events].sort((a, b) => a.start.localeCompare(b.start))

          return (
            <section key={day.date} aria-label={`${day.dayLabel} list`}>
              <div className="sticky top-0 z-10 -mx-4 px-4 pb-2 pt-3 bg-surface/95 backdrop-blur">
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[12px] font-semibold uppercase tracking-wider text-neutral-400">
                      {dAbbr}
                    </span>
                    <span className="text-[18px] font-bold tabular-nums text-neutral-600">
                      {num}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium text-neutral-400">
                      {events.length + (day.allDayEvents?.length ?? 0)}{' '}
                      {events.length + (day.allDayEvents?.length ?? 0) === 1 ? 'hendelse' : 'hendelser'}
                    </span>
                    {onAddEventForDay && (
                      <button
                        type="button"
                        onClick={() => onAddEventForDay(day.date)}
                        aria-label={`Legg til hendelse ${day.dayLabel}`}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-[18px] font-light leading-none text-neutral-400 transition hover:bg-primary-50 hover:text-primary-600"
                      >
                        +
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {day.allDayEvents?.length > 0 && (
                <div className="-mx-4 mb-2">
                  <AllDayRow
                    events={day.allDayEvents}
                    selectedDate={day.date}
                    onSelectEvent={(ev) => {
                      const anchorDate = (ev.metadata as any)?.__anchorDate as string | undefined ?? day.date
                      onSelectEvent(ev, anchorDate)
                    }}
                  />
                </div>
              )}
              {events.length === 0 && !day.allDayEvents?.length ? (
                <div className="rounded-card border border-neutral-200 bg-neutral-100 px-4 py-3 text-[13px] text-neutral-400 shadow-card">
                  Ingen hendelser.
                </div>
              ) : events.length === 0 ? null : (
                <div className="space-y-2">
                  {events.map((e) => {
                    const plist = getParticipantPeople(e, people)
                    const accent = plist[0]?.colorAccent ?? 'rgb(113 113 122)'
                    const tint = plist[0]?.colorTint ?? 'white'
                    const namesLine = formatParticipantNamesLine(e, people)

                    const card = (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => onSelectEvent(e, day.date)}
                        className="w-full overflow-hidden rounded-card text-left shadow-card transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                        style={{
                          backgroundColor: tint,
                          borderLeftWidth: 6,
                          borderLeftColor: accent,
                        }}
                      >
                        <div className="flex items-start gap-3 px-4 py-3">
                          <div className="shrink-0 pt-0.5 text-[12px] font-semibold tabular-nums text-neutral-500">
                            {e.start}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-2">
                              <ParticipantAvatarStrip people={plist} className="pt-0.5" />
                              <span className="min-w-0 truncate text-[14px] font-semibold text-neutral-600">
                                {e.title}
                              </span>
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-[12px] font-medium text-neutral-500">
                                {formatTimeRange(e.start, e.end)}
                              </span>
                              {namesLine !== 'Ukjent' && (
                                <span className="text-[11px] font-medium text-neutral-400">· {namesLine}</span>
                              )}
                              {e.location && (
                                <span className="text-[12px] text-neutral-500">
                                  {e.location}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    )

                    return onDeleteEvent ? (
                      <SwipeableEventRow
                        key={e.id}
                        onDelete={() => onDeleteEvent(e, day.date)}
                      >
                        {card}
                      </SwipeableEventRow>
                    ) : (
                      <div key={e.id}>{card}</div>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
