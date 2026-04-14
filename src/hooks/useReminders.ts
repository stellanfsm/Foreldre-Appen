import { useEffect, useRef } from 'react'
import type { Event } from '../types'
import { parseTime } from '../lib/time'
import { todayKeyOslo } from '../lib/osloCalendar'

const SESSION_KEY = 'rmd_fired'

function getFiredFromSession(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

function markFiredInSession(key: string): void {
  try {
    const current = getFiredFromSession()
    current.add(key)
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(Array.from(current)))
  } catch {
    // sessionStorage unavailable (e.g. private browsing on some browsers)
  }
}

/**
 * Schedules browser notifications for Oslo-today events that have reminderMinutes set.
 */
export function useReminders(events: Event[], osloTodayKey: string) {
  const firedRef = useRef<Set<string>>(getFiredFromSession())

  useEffect(() => {
    if (osloTodayKey !== todayKeyOslo()) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

    const now = new Date()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    const timers: ReturnType<typeof setTimeout>[] = []

    for (const ev of events) {
      if (ev.reminderMinutes == null) continue
      const reminderKey = `${ev.id}-${ev.reminderMinutes}`
      if (firedRef.current.has(reminderKey)) continue

      const eventStartMin = parseTime(ev.start)
      const reminderMin = eventStartMin - ev.reminderMinutes

      if (reminderMin <= nowMinutes) {
        if (eventStartMin > nowMinutes) {
          fireNotification(ev)
          firedRef.current.add(reminderKey)
          markFiredInSession(reminderKey)
        }
        continue
      }

      const delayMs = (reminderMin - nowMinutes) * 60 * 1000
      const timer = setTimeout(() => {
        fireNotification(ev)
        firedRef.current.add(reminderKey)
        markFiredInSession(reminderKey)
      }, delayMs)
      timers.push(timer)
    }

    return () => timers.forEach(clearTimeout)
  }, [events, osloTodayKey])
}

function fireNotification(ev: Event) {
  try {
    const note = ev.notes?.trim().slice(0, 120)
    const body = note ? `${ev.start} – ${ev.end} · ${note}` : `${ev.start} – ${ev.end}`
    new Notification(`${ev.title} starter om ${ev.reminderMinutes} min`, {
      body,
      icon: '/favicon.svg',
      tag: ev.id,
    })
  } catch {
    // Notification API may not be available
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  return Notification.requestPermission()
}
