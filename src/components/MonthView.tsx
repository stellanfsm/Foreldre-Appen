import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { Event } from '../types'
import { getISOWeek, getISOWeekYear } from '../lib/isoWeek'
import { formatTimeRange } from '../lib/time'
import { useFamily } from '../context/FamilyContext'
import { getParticipantPeople } from '../lib/eventParticipants'
import { ParticipantAvatarStrip } from './ParticipantAvatarStrip'
import { formatNorwegianCalendarSummary, norwegianDayHasCalendarHighlight } from '../lib/norwegianSchoolCalendar'

interface MonthViewProps {
  selectedDate: string
  onSelectDate: (date: string) => void
  /** Returns true if the given date (YYYY-MM-DD) has events */
  hasEventsOnDate?: (date: string) => boolean
  /** Visible events for a date (same filter as rest of app) — used for dots + day summary */
  getEventsForDate?: (date: string) => Event[]
  /** Called when the visible calendar month changes — prefetch events for dots */
  onVisibleMonthRange?: (startDate: string, endDate: string) => void
  /** Long-press or secondary action (e.g. høyreklikk) — open “legg til” for this date without day navigation */
  onAddEventForDate?: (date: string) => void
  /** Tap an event in måneds-agenda — typically åpne detalj + hopp til dag */
  onSelectEvent?: (event: Event, date: string) => void
  /** Returns true if the date has at least one open task flagged for month-view visibility */
  hasHighlightedTaskOnDate?: (date: string) => boolean
}

/** Local calendar day as YYYY-MM-DD (avoid UTC off-by-one from toISOString). */
function dateToKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function todayKeyLocal(): string {
  return dateToKey(new Date())
}

/** First and last calendar day of month as YYYY-MM-DD (local). */
function monthDateRangeKeys(year: number, monthIndex: number): { start: string; end: string } {
  const start = new Date(year, monthIndex, 1)
  const end = new Date(year, monthIndex + 1, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return { start: ymd(start), end: ymd(end) }
}

function getMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1)
  const startDay = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (Date | null)[] = []
  for (let i = 0; i < startDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)

  return cells
}

const MONTH_NAMES = [
  'Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Desember',
]

const DAY_HEADERS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn']

const SUMMARY_PREVIEW = 3

const LONG_PRESS_MS = 550

function chunkWeekRows(cells: (Date | null)[]): (Date | null)[][] {
  const rows: (Date | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7))
  }
  return rows
}

const DAY_ABBR_NB = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør']

type AgendaDay = { date: string; events: Event[] }
type AgendaWeek = { key: string; weekNum: number; days: AgendaDay[]; rangeLabel: string }

function buildMonthAgenda(
  year: number,
  monthIndex: number,
  getEventsForDate: (d: string) => Event[]
): AgendaWeek[] {
  const lastDom = new Date(year, monthIndex + 1, 0).getDate()
  const weekMap = new Map<string, { weekNum: number; days: AgendaDay[] }>()

  for (let dom = 1; dom <= lastDom; dom++) {
    const d = new Date(year, monthIndex, dom)
    const dateKey = dateToKey(d)
    const events = [...getEventsForDate(dateKey)].sort((a, b) => a.start.localeCompare(b.start))
    if (events.length === 0) continue

    const isoYear = getISOWeekYear(d)
    const weekNum = getISOWeek(d)
    const wk = `${isoYear}-W${String(weekNum).padStart(2, '0')}`
    if (!weekMap.has(wk)) {
      weekMap.set(wk, { weekNum, days: [] })
    }
    weekMap.get(wk)!.days.push({ date: dateKey, events })
  }

  const list: AgendaWeek[] = []
  for (const [key, v] of weekMap) {
    const days = v.days.sort((a, b) => a.date.localeCompare(b.date))
    const first = days[0].date
    const last = days[days.length - 1].date
    const fd = new Date(first + 'T12:00:00')
    const ld = new Date(last + 'T12:00:00')
    let rangeLabel: string
    if (fd.getMonth() === ld.getMonth() && fd.getFullYear() === ld.getFullYear()) {
      rangeLabel = `${fd.getDate()}.–${ld.getDate()}. ${MONTH_NAMES[fd.getMonth()]}`
    } else {
      rangeLabel = `${fd.getDate()}. ${MONTH_NAMES[fd.getMonth()]} – ${ld.getDate()}. ${MONTH_NAMES[ld.getMonth()]}`
    }
    list.push({ key, weekNum: v.weekNum, days, rangeLabel })
  }
  list.sort((a, b) => a.days[0].date.localeCompare(b.days[0].date))
  return list
}

function heatStrengthClass(count: number): string {
  if (count <= 0) return ''
  if (count === 1) return 'bg-primary-600/10'
  if (count === 2) return 'bg-primary-600/20'
  if (count === 3) return 'bg-primary-600/30'
  return 'bg-primary-600/40'
}

function formatNorwegianDayHeading(dateKey: string): string {
  const parts = dateKey.split('-').map(Number)
  const y = parts[0]
  const m = parts[1] - 1
  const d = parts[2]
  if (!Number.isFinite(y) || m < 0 || m > 11 || !Number.isFinite(d)) return dateKey
  return `${d}. ${MONTH_NAMES[m]} ${y}`
}

export function MonthView({
  selectedDate,
  onSelectDate,
  hasEventsOnDate,
  getEventsForDate,
  onVisibleMonthRange,
  onAddEventForDate,
  onSelectEvent,
  hasHighlightedTaskOnDate,
}: MonthViewProps) {
  const { people } = useFamily()
  const selectedParts = selectedDate.split('-').map(Number)
  const [viewYear, setViewYear] = useState(() => selectedParts[0])
  const [viewMonth, setViewMonth] = useState(() => selectedParts[1] - 1)

  const todayKey = useMemo(() => todayKeyLocal(), [])
  const longPressTimerRef = useRef<number | null>(null)
  const longPressFiredRef = useRef(false)

  function clearLongPressTimer() {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  /** Keep visible month/year aligned when selectedDate changes elsewhere in the app */
  useEffect(() => {
    const [ys, ms] = selectedDate.split('-')
    const y = Number(ys)
    const monthIndex = Number(ms) - 1
    if (!Number.isFinite(y) || monthIndex < 0 || monthIndex > 11) return
    setViewYear(y)
    setViewMonth(monthIndex)
  }, [selectedDate])

  useEffect(() => {
    const { start, end } = monthDateRangeKeys(viewYear, viewMonth)
    onVisibleMonthRange?.(start, end)
  }, [viewYear, viewMonth, onVisibleMonthRange])

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current != null) {
        window.clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
    }
  }, [])

  const cells = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth])
  const weekRows = useMemo(() => chunkWeekRows(cells), [cells])

  const eventCountByDate = useMemo(() => {
    const map = new Map<string, number>()
    if (!getEventsForDate) return map
    const lastDom = new Date(viewYear, viewMonth + 1, 0).getDate()
    for (let dom = 1; dom <= lastDom; dom++) {
      const key = dateToKey(new Date(viewYear, viewMonth, dom))
      map.set(key, getEventsForDate(key).length)
    }
    return map
  }, [viewYear, viewMonth, getEventsForDate])

  const monthAgenda = useMemo(() => {
    if (!getEventsForDate) return []
    return buildMonthAgenda(viewYear, viewMonth, getEventsForDate)
  }, [viewYear, viewMonth, getEventsForDate])

  const summaryEvents = useMemo(() => {
    if (!getEventsForDate) return []
    const list = [...getEventsForDate(selectedDate)]
    list.sort((a, b) => a.start.localeCompare(b.start))
    return list
  }, [getEventsForDate, selectedDate])

  const selectedDayCalendarLine = useMemo(
    () => formatNorwegianCalendarSummary(selectedDate),
    [selectedDate]
  )

  function prevMonth() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1)
      setViewMonth(11)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1)
      setViewMonth(0)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  const total = summaryEvents.length
  const preview = summaryEvents.slice(0, SUMMARY_PREVIEW)
  const rest = Math.max(0, total - SUMMARY_PREVIEW)

  return (
    <div className="flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden px-3 pt-2">
      <div className="grid shrink-0 grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-1 pb-3">
        <button
          type="button"
          onClick={prevMonth}
          className="justify-self-start rounded-lg p-2 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600"
          aria-label="Forrige måned"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h2 className="min-w-0 truncate text-center font-display text-[17px] font-semibold text-neutral-600">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </h2>
        <button
          type="button"
          onClick={nextMonth}
          className="justify-self-end rounded-lg p-2 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600"
          aria-label="Neste måned"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      <div
        className="relative isolate flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden overflow-y-auto scrollbar-none"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="relative z-0 mx-auto w-full max-w-[min(100%,24rem)] grid grid-cols-[minmax(2.75rem,auto)_repeat(7,minmax(0,1fr))] gap-x-0 gap-y-0">
          <div className="pb-2 pr-1 text-right text-[9px] font-medium uppercase tracking-wide text-neutral-300">
            Uke
          </div>
          {DAY_HEADERS.map((d) => (
            <div key={d} className="pb-2 text-center text-[11px] font-medium text-neutral-400">
              {d}
            </div>
          ))}

          {weekRows.map((row, rowIdx) => {
            const firstDay = row.find((c): c is Date => c != null)
            const weekNum = firstDay ? getISOWeek(firstDay) : null

            return (
              <Fragment key={`wrow-${rowIdx}`}>
                <div className="flex min-h-0 min-w-0 items-center justify-end pr-1 text-right">
                  {weekNum != null && (
                    <span className="max-w-[3.25rem] text-[10px] font-medium leading-tight text-neutral-400">
                      Uke <span className="tabular-nums text-neutral-500">{weekNum}</span>
                    </span>
                  )}
                </div>
                {row.map((cell, colIdx) => {
                  const idx = rowIdx * 7 + colIdx
                  if (!cell) {
                    return <div key={`empty-${idx}`} className="aspect-square min-h-0" />
                  }
                  const key = dateToKey(cell)
                  const isSelected = key === selectedDate
                  const isToday = key === todayKey
                  const hasEvents = hasEventsOnDate?.(key) ?? false
                  const dayNum = cell.getDate()
                  const label = `${dayNum}. ${MONTH_NAMES[viewMonth]}`
                  const eventCount = eventCountByDate.get(key) ?? 0
                  const heat = heatStrengthClass(eventCount)
                  const norwegianDay = norwegianDayHasCalendarHighlight(key)
                  const hasHighlightedTask = hasHighlightedTaskOnDate?.(key) ?? false

                  return (
                    <button
                      key={key}
                      type="button"
                      aria-label={label}
                      onPointerDown={() => {
                        if (!onAddEventForDate) return
                        longPressFiredRef.current = false
                        clearLongPressTimer()
                        longPressTimerRef.current = window.setTimeout(() => {
                          longPressTimerRef.current = null
                          longPressFiredRef.current = true
                          onAddEventForDate(key)
                        }, LONG_PRESS_MS)
                      }}
                      onPointerUp={clearLongPressTimer}
                      onPointerCancel={clearLongPressTimer}
                      onPointerLeave={clearLongPressTimer}
                      onClick={(e) => {
                        if (longPressFiredRef.current) {
                          longPressFiredRef.current = false
                          e.preventDefault()
                          return
                        }
                        onSelectDate(key)
                      }}
                      onContextMenu={
                        onAddEventForDate
                          ? (e) => {
                              e.preventDefault()
                              onAddEventForDate(key)
                            }
                          : undefined
                      }
                      className={`relative z-0 flex aspect-square min-h-0 select-none flex-col items-center justify-center rounded-xl border-2 text-[14px] font-medium transition-colors [-webkit-touch-callout:none] ${
                        isSelected
                          ? 'border-primary-700 bg-primary-100 font-semibold text-primary-700 shadow-planner-sm'
                          : isToday
                            ? `border-primary-600/40 font-bold text-primary-700 hover:bg-primary-50 ${heat || 'bg-neutral-100'}`
                            : `border-transparent text-neutral-500 ${heat ? '' : 'hover:bg-neutral-50'} ${heat}`
                      }`}
                    >
                      {dayNum}
                      {norwegianDay && (
                        <span
                          className="pointer-events-none absolute right-1 top-1 z-[1] h-1.5 w-1.5 rounded-full bg-accent-sun-main"
                          aria-hidden
                        />
                      )}
                      {hasEvents && (
                        <span
                          className={`pointer-events-none absolute bottom-1 left-1/2 z-[1] h-1 w-1 -translate-x-1/2 rounded-full ${
                            isSelected ? 'bg-primary-700' : 'bg-primary-600'
                          }`}
                        />
                      )}
                      {hasHighlightedTask && (
                        <span
                          className={`pointer-events-none absolute bottom-1 right-1 z-[1] h-1.5 w-1.5 rounded-full ${
                            isSelected ? 'bg-primary-700' : 'bg-semantic-red-500'
                          }`}
                          aria-hidden
                        />
                      )}
                    </button>
                  )
                })}
              </Fragment>
            )
          })}
        </div>

        {getEventsForDate && (
          <section
            className="relative z-0 mx-auto mt-4 w-full max-w-md shrink-0 rounded-xl border border-primary-700/10 bg-primary-50 px-3 py-3 shadow-card"
            aria-label="Oppsummering for valgt dag"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Valgt dag</p>
            <p className="font-display text-[15px] font-semibold text-neutral-600">{formatNorwegianDayHeading(selectedDate)}</p>
            {selectedDayCalendarLine && (
              <p className="mt-1 text-[12px] font-medium leading-snug text-primary-700">{selectedDayCalendarLine}</p>
            )}
            {total === 0 ? (
              <p className="mt-2 text-[13px] text-neutral-400">Ingen hendelser denne dagen.</p>
            ) : (
              <>
                <p className="mt-2 text-[13px] font-medium text-neutral-600">
                  {total} {total === 1 ? 'hendelse' : 'hendelser'}
                </p>
                <ul className="mt-2 space-y-2">
                  {preview.map((ev) => (
                    <li key={ev.id} className="flex min-w-0 flex-col gap-0.5 border-t border-neutral-200 pt-2 first:border-t-0 first:pt-0">
                      <span className="truncate text-[13px] font-semibold text-neutral-600">{ev.title}</span>
                      <span className="text-[12px] tabular-nums text-neutral-400">
                        {ev.metadata?.isAllDay ? 'Heldags' : formatTimeRange(ev.start, ev.end)}
                      </span>
                    </li>
                  ))}
                </ul>
                {rest > 0 && (
                  <p className="mt-2 text-[12px] font-medium text-neutral-500">+{rest} til</p>
                )}
              </>
            )}
          </section>
        )}

        {getEventsForDate && (
          <section
            className="relative z-0 mx-auto mt-6 w-full max-w-md shrink-0 rounded-xl border border-neutral-200 bg-neutral-100 px-3 py-3 shadow-card"
            aria-label="Agenda for måneden"
          >
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Agenda for måneden</h3>
            {monthAgenda.length === 0 ? (
              <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">Ingen hendelser denne måneden.</p>
            ) : (
              <div className="mt-3 space-y-5">
                {monthAgenda.map((week) => (
                  <div key={week.key}>
                    <p className="sticky top-0 z-10 -mx-3 border-b border-neutral-200 bg-primary-50 px-3 py-1.5 text-[12px] font-semibold text-primary-700">
                      Uke {week.weekNum} · {week.rangeLabel}
                    </p>
                    <div className="mt-2 space-y-4">
                      {week.days.map((day) => {
                        const dayDate = new Date(day.date + 'T12:00:00')
                        const abbr = DAY_ABBR_NB[dayDate.getDay()]
                        const dom = dayDate.getDate()
                        return (
                          <div key={day.date} className="relative z-0">
                            <p className="mb-1.5 text-[13px] font-medium text-neutral-600">
                              <span className="text-neutral-400">{abbr}</span>{' '}
                              <span className="tabular-nums">{dom}.</span>
                            </p>
                            <ul className="space-y-1.5">
                              {day.events.map((ev) => {
                                const plist = getParticipantPeople(ev, people)
                                return (
                                  <li key={ev.id}>
                                    <button
                                      type="button"
                                      onClick={() => onSelectEvent?.(ev, day.date)}
                                      className={`relative z-0 flex w-full items-start gap-2 rounded-lg border border-neutral-200 bg-neutral-100 px-2.5 py-2 text-left shadow-card transition hover:bg-neutral-50 ${onSelectEvent ? 'cursor-pointer' : 'cursor-default'}`}
                                    >
                                      <span className="shrink-0 pt-0.5 text-[11px] font-semibold tabular-nums text-neutral-500">
                                        {ev.metadata?.isAllDay ? 'Heldags' : ev.start}
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-start gap-2">
                                          <ParticipantAvatarStrip people={plist} />
                                          <span className="min-w-0 truncate text-[13px] font-semibold text-neutral-600">
                                            {ev.title}
                                          </span>
                                        </div>
                                        {!ev.metadata?.isAllDay && (
                                          <p className="mt-0.5 text-[11px] text-neutral-400">
                                            {formatTimeRange(ev.start, ev.end)}
                                          </p>
                                        )}
                                      </div>
                                    </button>
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 border-t border-neutral-200 pt-3 text-center text-[12px] leading-snug text-neutral-500">
              Trykk på en dato for å velge den og se oppsummeringen over. Langt trykk eller høyreklikk for å legge til på
              den datoen.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
