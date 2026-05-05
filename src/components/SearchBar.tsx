import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import type { Event } from '../types'
import { formatTime } from '../lib/time'
import { useFamily } from '../context/FamilyContext'
import { formatParticipantNamesLine, getParticipantPeople, participantSearchHaystack } from '../lib/eventParticipants'
import type { WeekDayLayout } from '../hooks/useScheduleState'
import { logEvent } from '../lib/appLogger'

interface SearchBarProps {
  /** Controlled open state — managed by the parent so it can reshape the toolbar layout. */
  open: boolean
  onOpenChange: (open: boolean) => void
  weekLayoutData: WeekDayLayout[]
  onJumpToDate: (date: string) => void
  onSelectEvent: (event: Event, date: string) => void
}

export function SearchBar({ open, onOpenChange, weekLayoutData, onJumpToDate, onSelectEvent }: SearchBarProps) {
  const [query, setQuery] = useState('')
  /** Fixed-position coords for the dropdown — escapes any overflow-x ancestor. */
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { people } = useFamily()

  /** Focus input when search opens. */
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [open])

  /** Clear query whenever search closes. */
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const matches: { event: Event; date: string; dayLabel: string }[] = []
    const seenIds = new Set<string>()
    for (const day of weekLayoutData) {
      const allEventsForDay = [...day.events, ...(day.allDayEvents ?? [])]
      for (const ev of allEventsForDay) {
        if (seenIds.has(ev.id)) continue
        seenIds.add(ev.id)
        const haystack = participantSearchHaystack(ev, people)
        if (haystack.includes(q)) {
          matches.push({ event: ev, date: day.date, dayLabel: day.dayAbbr })
        }
      }
    }
    return matches.slice(0, 12)
  }, [query, weekLayoutData, people])

  const updateDropPos = useCallback(() => {
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect()
      setDropPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 240) })
    }
  }, [])

  useEffect(() => {
    if (open && query.trim()) {
      updateDropPos()
    } else {
      setDropPos(null)
    }
  }, [open, query, updateDropPos])

  /** Debounced query logging — fires 600 ms after the user stops typing. */
  useEffect(() => {
    if (!open || !query.trim()) return
    const t = setTimeout(() => {
      logEvent('search_query', { length: query.trim().length, resultCount: results.length })
    }, 600)
    return () => clearTimeout(t)
  }, [open, query, results.length])

  return (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {open && (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Søk i hendelser denne uken…"
            className="flex-1 min-w-0 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[13px] outline-none focus:border-primary-600 text-neutral-600"
          />
        )}
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          className="shrink-0 rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600"
          aria-label={open ? 'Lukk søk' : 'Søk i hendelser'}
        >
          {open ? (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          )}
        </button>
      </div>

      {open && query.trim() && dropPos && (
        <div
          className="fixed z-50 max-h-56 overflow-y-auto overflow-x-hidden rounded-xl border border-neutral-200 bg-neutral-100 shadow-card"
          style={{ top: dropPos.top, left: dropPos.left, width: dropPos.width }}
        >
          {results.length === 0 ? (
            <p className="px-4 py-3 text-[13px] text-neutral-400">Ingen treff denne uken</p>
          ) : (
            results.map((r) => {
              const plist = getParticipantPeople(r.event, people)
              return (
                <button
                  key={`${r.date}-${r.event.id}`}
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-neutral-50"
                  onClick={() => {
                    logEvent('search_result_clicked', { title: r.event.title, date: r.date })
                    onJumpToDate(r.date)
                    onSelectEvent(r.event, r.date)
                    onOpenChange(false)
                  }}
                >
                  <div className="flex shrink-0 gap-0.5">
                    {plist.slice(0, 3).map((p) => (
                      <span
                        key={p.id}
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: p.colorAccent }}
                        aria-hidden
                      />
                    ))}
                    {plist.length === 0 && (
                      <span className="h-2 w-2 rounded-full bg-neutral-400" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-neutral-600">{r.event.title}</p>
                    <p className="text-[11px] text-neutral-400">
                      {r.dayLabel} &middot; {formatTime(r.event.start)}
                      {plist.length > 0 ? ` · ${formatParticipantNamesLine(r.event, people)}` : ''}
                    </p>
                  </div>
                </button>
              )
            })
          )}
        </div>
      )}
    </>
  )
}
