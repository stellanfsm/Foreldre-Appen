import { useMemo, useState } from 'react'
import { LogisticsLoadingSkeleton } from './LogisticsLoadingSkeleton'
import type { WeekDayLayout } from '../hooks/useScheduleState'
import type { Event, Person, PersonId } from '../types'
import { useFamily } from '../context/FamilyContext'
import { useAuth } from '../context/AuthContext'
import { useUserPreferences } from '../context/UserPreferencesContext'
import { useProfile } from '../context/ProfileContext'
import { formatTimeRange } from '../lib/time'
import { getParticipantPeople } from '../lib/eventParticipants'

interface LogisticsScreenProps {
  weekLayoutData: WeekDayLayout[]
  /** While the week’s events are loading from the server */
  loading?: boolean
  /** Same resolved “deg” person as family filter (optional fallback inside) */
  mePersonId?: PersonId | null
  onJumpToEvent: (date: string, event: Event) => void
  onAssignTransport: (
    date: string,
    event: Event,
    role: 'dropoff' | 'pickup',
    personId: PersonId | null
  ) => void
  onChangeWeek?: (deltaWeeks: number) => void
}

interface TransportRow {
  event: Event
  date: string
  dropoffPerson: Person | null
  pickupPerson: Person | null
}

interface PersonTransportStats {
  person: Person
  dropoffs: number
  pickups: number
}

const NB_DAYS: Record<number, string> = {
  0: 'Søndag',
  1: 'Mandag',
  2: 'Tirsdag',
  3: 'Onsdag',
  4: 'Torsdag',
  5: 'Fredag',
  6: 'Lørdag',
}

function formatDayHeader(dateKey: string): string {
  const d = new Date(dateKey + 'T12:00:00')
  const dayName = NB_DAYS[d.getDay()] ?? ''
  return `${dayName} ${d.getDate()}.`
}

function formatWeekRange(weekData: WeekDayLayout[]): string {
  if (weekData.length === 0) return ''
  const first = new Date(weekData[0].date + 'T12:00:00')
  const last = new Date(weekData[weekData.length - 1].date + 'T12:00:00')
  const fDay = first.getDate()
  const lDay = last.getDate()
  const months = [
    'jan', 'feb', 'mar', 'apr', 'mai', 'jun',
    'jul', 'aug', 'sep', 'okt', 'nov', 'des',
  ]
  if (first.getMonth() === last.getMonth()) {
    return `${fDay}.–${lDay}. ${months[first.getMonth()]}`
  }
  return `${fDay}. ${months[first.getMonth()]}–${lDay}. ${months[last.getMonth()]}`
}

function personById(people: Person[], id?: PersonId): Person | null {
  if (!id) return null
  return people.find((p) => p.id === id) ?? null
}

export function LogisticsScreen({
  weekLayoutData,
  loading = false,
  mePersonId: mePersonIdProp,
  onJumpToEvent,
  onAssignTransport,
  onChangeWeek,
}: LogisticsScreenProps) {
  const { user } = useAuth()
  const { people } = useFamily()
  const { currentPersonId } = useUserPreferences()
  const { displayName } = useProfile()
  const [filterMode, setFilterMode] = useState<'all' | 'mine'>('all')

  const [unassignedDay, setUnassignedDay] = useState<string>(() => weekLayoutData[0]?.date ?? '')

  const { dayRows, stats, unassignedByDate } = useMemo(() => {
    const dayRows: { date: string; header: string; rows: TransportRow[] }[] = []
    const statsMap = new Map<string, { person: Person; dropoffs: number; pickups: number }>()
    const unassignedByDate: Record<string, TransportRow[]> = {}

    for (const day of weekLayoutData) {
      const rows: TransportRow[] = []
      for (const event of day.events) {
        const transport = event.metadata?.transport
        const dropoffPerson = transport?.dropoffBy ? personById(people, transport.dropoffBy) : null
        const pickupPerson = transport?.pickupBy ? personById(people, transport.pickupBy) : null

        const hasAnyAssignment = !!(transport?.dropoffBy || transport?.pickupBy)

        if (!hasAnyAssignment) {
          const list = unassignedByDate[day.date] ?? []
          list.push({ event, date: day.date, dropoffPerson, pickupPerson })
          unassignedByDate[day.date] = list
          continue
        }

        rows.push({ event, date: day.date, dropoffPerson, pickupPerson })

        if (dropoffPerson) {
          const entry = statsMap.get(dropoffPerson.id) ?? { person: dropoffPerson, dropoffs: 0, pickups: 0 }
          entry.dropoffs++
          statsMap.set(dropoffPerson.id, entry)
        }
        if (pickupPerson) {
          const entry = statsMap.get(pickupPerson.id) ?? { person: pickupPerson, dropoffs: 0, pickups: 0 }
          entry.pickups++
          statsMap.set(pickupPerson.id, entry)
        }
      }
      if (rows.length > 0) {
        dayRows.push({ date: day.date, header: formatDayHeader(day.date), rows })
      }
    }

    const stats: PersonTransportStats[] = [...statsMap.values()]
    return { dayRows, stats, unassignedByDate }
  }, [weekLayoutData, people])

  const totalUnassigned = useMemo(
    () => Object.values(unassignedByDate).reduce((sum, list) => sum + list.length, 0),
    [unassignedByDate]
  )

  const visibleUnassignedForDay = unassignedByDate[unassignedDay] ?? []

  const weekRange = formatWeekRange(weekLayoutData)

  const minePersonId = useMemo(() => {
    if (mePersonIdProp != null && people.some((p) => p.id === mePersonIdProp)) {
      return mePersonIdProp
    }
    if (displayName) {
      const byName = people.find((p) => p.name === displayName)
      if (byName) return byName.id
    }
    if (currentPersonId && people.some((p) => p.id === currentPersonId)) return currentPersonId
    if (user) {
      const selfId = `self-${user.id}` as PersonId
      if (people.some((p) => p.id === selfId)) return selfId
    }
    return people[0]?.id
  }, [mePersonIdProp, displayName, people, currentPersonId, user?.id])

  const visibleStats: PersonTransportStats[] =
    filterMode === 'all' || !minePersonId
      ? stats
      : stats.filter((s) => s.person.id === minePersonId)

  if (loading) {
    return <LogisticsLoadingSkeleton />
  }

  return (
    <div className="mt-3 flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden px-3 pb-4">
      <div className="flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden overflow-y-hidden">
        {/* Header: title + week in one block */}
        <div className="border-b border-neutral-200 px-4 pt-4 pb-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-[17px] font-semibold text-neutral-600">Logistikk</h2>
              <p className="mt-0.5 text-[12px] text-neutral-400">{weekRange}</p>
            </div>
            {typeof onChangeWeek === 'function' && (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => onChangeWeek(-1)}
                  className="rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-1.5 text-[11px] font-medium text-neutral-600 hover:bg-neutral-200"
                >
                  ‹ Forrige
                </button>
                <button
                  type="button"
                  onClick={() => onChangeWeek(1)}
                  className="rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-1.5 text-[11px] font-medium text-neutral-600 hover:bg-neutral-200"
                >
                  Neste ›
                </button>
              </div>
            )}
          </div>
          {/* Toolbar: filters + legend on one line */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  filterMode === 'all'
                    ? 'bg-primary-600 text-neutral-100 shadow-card'
                    : 'bg-neutral-200 text-neutral-600 hover:bg-neutral-300'
                }`}
              >
                Alle oppdrag
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('mine')}
                className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  filterMode === 'mine'
                    ? 'bg-primary-600 text-neutral-100 shadow-card'
                    : 'bg-neutral-200 text-neutral-600 hover:bg-neutral-300'
                }`}
              >
                Bare mine
              </button>
            </div>
            {visibleStats.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                  Ukeoversikt
                </span>
                {visibleStats.map((s) => (
                  <div
                    key={s.person.id}
                    className="flex items-center gap-2 rounded-full bg-neutral-200 px-3 py-1.5 text-[12px]"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: s.person.colorAccent }}
                    />
                    <span className="font-medium text-neutral-600">{s.person.name}</span>
                    <span className="text-neutral-400">
                      {s.dropoffs > 0 && <span>{s.dropoffs}L</span>}
                      {s.dropoffs > 0 && s.pickups > 0 && ' · '}
                      {s.pickups > 0 && <span>{s.pickups}H</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 scrollbar-none">
        {dayRows.length === 0 && totalUnassigned === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
            <svg className="mb-2 h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25m-2.25 0h-2.735a2.25 2.25 0 0 0-1.632.696l-3.697 3.859A2.25 2.25 0 0 0 3 14.25m14.25-7.5H5.625c-.621 0-1.125.504-1.125 1.125v4.5" />
            </svg>
            <p className="text-[13px]">Ingen logistikk denne uken</p>
            <p className="mt-1 text-[11px]">Legg til ansvar og logistikk via en hendelse</p>
          </div>
        ) : (
          <>
            {totalUnassigned > 0 && minePersonId && (
              <section className="mb-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                <h3 className="text-[13px] font-semibold text-neutral-600">Ufordelt</h3>
                <p className="mt-0.5 text-[11px] text-neutral-400">Velg dag og ta start eller slutt.</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {weekLayoutData.map((day) => {
                    const count = unassignedByDate[day.date]?.length ?? 0
                    const isActive = day.date === unassignedDay
                    return (
                      <button
                        key={day.date}
                        type="button"
                        onClick={() => setUnassignedDay(day.date)}
                        className={`rounded-full px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                          isActive
                            ? 'bg-primary-600 text-neutral-100 shadow-card'
                            : count > 0
                              ? 'border border-neutral-200 bg-neutral-100 text-neutral-600 shadow-card'
                              : 'border border-neutral-200 bg-neutral-50 text-neutral-400'
                        }`}
                      >
                        {day.dayAbbr} {count > 0 && <span className="ml-0.5 opacity-80">{count}</span>}
                      </button>
                    )
                  })}
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  {visibleUnassignedForDay.length === 0 ? (
                    <p className="py-2 text-[11px] text-neutral-400">Ingen ufordelte denne dagen.</p>
                  ) : (
                    visibleUnassignedForDay.map((row) => (
                      <UnassignedRowCard
                        key={row.event.id}
                        row={row}
                        people={people}
                        currentPersonId={minePersonId}
                        onAssign={(role) =>
                          onAssignTransport(row.date, row.event, role, minePersonId)
                        }
                        onOpen={() => onJumpToEvent(row.date, row.event)}
                      />
                    ))
                  )}
                </div>
              </section>
            )}

            {dayRows
              .map((day) => {
                if (filterMode === 'all' || !minePersonId) {
                  return day
                }
                const filteredRows = day.rows.filter((row) => {
                  const dropId = row.dropoffPerson?.id
                  const pickId = row.pickupPerson?.id
                  return dropId === minePersonId || pickId === minePersonId
                })
                return { ...day, rows: filteredRows }
              })
              .filter((day) => day.rows.length > 0)
              .map((day) => (
                <section key={day.date} className="mb-5">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[13px] font-semibold text-neutral-600">{day.header}</h3>
                    <span className="text-[10px] text-neutral-400">
                      {day.rows.length} {day.rows.length === 1 ? 'oppdrag' : 'oppdrag'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {day.rows.map((row) => (
                      <TransportRowCard
                        key={row.event.id}
                        row={row}
                        people={people}
                        onClick={() => onJumpToEvent(row.date, row.event)}
                      />
                    ))}
                  </div>
                </section>
              ))}
          </>
        )}
        </div>
      </div>
    </div>
  )
}

function TransportRowCard({
  row,
  people,
  onClick,
}: {
  row: TransportRow
  people: Person[]
  onClick: () => void
}) {
  const plist = getParticipantPeople(row.event, people)
  const personName =
    plist.length === 0
      ? 'Ukjent'
      : plist.length === 1
        ? plist[0].name
        : `${plist[0].name} +${plist.length - 1}`

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2.5 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-50 active:bg-neutral-200"
    >
      <span className="mt-0.5 flex shrink-0 gap-0.5">
        {plist.slice(0, 4).map((p) => (
          <span
            key={p.id}
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: p.colorAccent }}
            aria-hidden
          />
        ))}
        {plist.length === 0 && (
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-medium text-neutral-600">
            {row.event.title}
          </span>
          <span className="shrink-0 text-[11px] text-neutral-400">
            {formatTimeRange(row.event.start, row.event.end)}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-neutral-400">{personName}</p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
          {row.dropoffPerson && (
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: row.dropoffPerson.colorAccent }}
              />
              <span className="text-neutral-600 font-medium">L</span>
              <span className="text-neutral-500">{row.dropoffPerson.name}</span>
            </span>
          )}
          {row.pickupPerson && (
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: row.pickupPerson.colorAccent }}
              />
              <span className="text-neutral-600 font-medium">H</span>
              <span className="text-neutral-500">{row.pickupPerson.name}</span>
            </span>
          )}
        </div>
      </div>
      <svg
        className="mt-1 h-3.5 w-3.5 shrink-0 text-neutral-300"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
      </svg>
    </button>
  )
}

function UnassignedRowCard({
  row,
  people,
  currentPersonId: _currentPersonId,
  onAssign,
  onOpen,
}: {
  row: TransportRow
  people: Person[]
  currentPersonId: PersonId
  onAssign: (role: 'dropoff' | 'pickup') => void
  onOpen: () => void
}) {
  const plist = getParticipantPeople(row.event, people)
  const personName =
    plist.length === 0
      ? 'Ukjent'
      : plist.length === 1
        ? plist[0].name
        : `${plist[0].name} +${plist.length - 1}`

  return (
    <div className="flex w-full items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2.5 shadow-card">
      <span className="mt-0.5 flex shrink-0 gap-0.5">
        {plist.slice(0, 4).map((p) => (
          <span
            key={p.id}
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: p.colorAccent }}
            aria-hidden
          />
        ))}
        {plist.length === 0 && <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[13px] font-medium text-neutral-600">
                {row.event.title}
              </span>
              <span className="shrink-0 text-[11px] text-neutral-400">
                {formatTimeRange(row.event.start, row.event.end)}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-neutral-400">{personName}</p>
          </div>
          <svg
            className="mt-1 h-3.5 w-3.5 shrink-0 text-neutral-300"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
          <button
            type="button"
            onClick={() => onAssign('dropoff')}
            className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1.5 text-primary-700 hover:bg-primary-100 active:bg-primary-100"
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary-600" aria-hidden />
            Jeg kan levere
          </button>
          <button
            type="button"
            onClick={() => onAssign('pickup')}
            className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1.5 text-primary-700 hover:bg-primary-100 active:bg-primary-100"
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary-500" aria-hidden />
            Jeg kan hente
          </button>
        </div>
      </div>
    </div>
  )
}
