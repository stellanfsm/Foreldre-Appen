import type {
  Event,
  NorwegianGradeBand,
  Person,
  PersonId,
  SchoolDayOverride,
  SchoolWeekOverlayDayAction,
  SchoolWeekOverlaySubjectUpdate,
  WeekdayMonFri,
} from '../types'
import { DEFAULT_SCHOOL_GATE_BY_BAND } from '../data/norwegianSubjects'
import { dateKeyToWeekdayMon0 } from './weekday'
import { pickSchoolDayOverrideForChild } from './schoolContext'
import { getISOWeek, getISOWeekYear } from './isoWeek'
import { calendarReplaceSchoolBlockTitle } from './schoolWeekOverlayReplaceTitle'

type BackgroundSubkind = 'school_day' | 'school_day_override' | 'school_lesson' | 'school_break' | 'work_day'

function normalizeSubjectUpdates(subjectUpdates: SchoolWeekOverlaySubjectUpdate[] | undefined): SchoolWeekOverlaySubjectUpdate[] {
  return (subjectUpdates ?? []).map((u) => ({
    subjectKey: u.subjectKey,
    customLabel: u.customLabel,
    sections: u.sections,
  }))
}

function buildSpecialSchoolTitle(action: SchoolWeekOverlayDayAction, band: NorwegianGradeBand): string {
  if (action.action === 'replace_school_block') {
    return calendarReplaceSchoolBlockTitle(action, band)
  }
  const summary = action.summary?.trim()
  const reason = action.reason?.trim()
  if (summary) return summary
  if (reason) return reason
  const first = action.subjectUpdates[0]
  if (first?.customLabel?.trim()) return first.customLabel.trim()
  if (first?.subjectKey?.trim()) return `Spesialdag: ${first.subjectKey.trim()}`
  return 'Spesialdag'
}

type ResolvedSchoolWeekOverlayDay = {
  action: SchoolWeekOverlayDayAction
  overlayId: string
  weekYear: number
  weekNumber: number
  dayIndex: number
}

function findSchoolWeekOverlayDayAction(person: Person, dateKey: string): ResolvedSchoolWeekOverlayDay | null {
  const school = person.school
  if (!school?.weekOverlays?.length) return null
  const date = new Date(`${dateKey}T12:00:00`)
  if (Number.isNaN(date.getTime())) return null
  const weekNumber = getISOWeek(date)
  const weekYear = getISOWeekYear(date)
  const dayMon0 = dateKeyToWeekdayMon0(dateKey)
  if (dayMon0 < 0 || dayMon0 > 6) return null
  for (let i = school.weekOverlays.length - 1; i >= 0; i--) {
    const overlay = school.weekOverlays[i]!
    if (overlay.weekYear !== weekYear || overlay.weekNumber !== weekNumber) continue
    const action = overlay.dailyActions[dayMon0]
      if (!action) continue
      return {
        action: {
          action: action.action,
          reason: action.reason,
          summary: action.summary,
          subjectUpdates: normalizeSubjectUpdates(action.subjectUpdates),
        },
        overlayId: overlay.id,
        weekYear: overlay.weekYear,
        weekNumber: overlay.weekNumber,
        dayIndex: dayMon0,
      }
  }
  return null
}

function makeBackgroundEvent(
  personId: PersonId,
  dateKey: string,
  start: string,
  end: string,
  title: string,
  kind: 'school' | 'work',
  idSuffix: string,
  subkind: BackgroundSubkind,
  extraMeta?: Record<string, unknown>
): Event {
  return {
    id: `bg-${kind}-${personId}-${dateKey}-${idSuffix}`,
    personId,
    title,
    start,
    end,
    metadata: {
      calendarLayer: 'background',
      backgroundKind: kind,
      backgroundSubkind: subkind,
      ...extraMeta,
    },
  }
}

/**
 * Bygger en syntetisk "spesialdag"-blokk fra en `replace_day`-override.
 * Bruker override-tider hvis satt, ellers faller tilbake til dagens normale skole-tider.
 */
function makeOverrideReplaceBlock(
  personId: PersonId,
  dateKey: string,
  override: SchoolDayOverride,
  fallbackStart: string,
  fallbackEnd: string,
  sourceEvent: Event
): Event {
  const start = override.schoolStart ?? fallbackStart
  const end = override.schoolEnd ?? fallbackEnd
  const title = override.label ?? sourceEvent.title ?? 'Spesialdag'
  return makeBackgroundEvent(personId, dateKey, start, end, title, 'school', 'day-override', 'school_day_override', {
    schoolDayOverride: override,
    schoolDayOverrideSourceId: sourceEvent.id,
  })
}

/**
 * Synthetic events from child school / parent work profiles (not stored in DB).
 * Rendered behind normal calendar activities.
 *
 * `dayEvents` er valgfri og brukes utelukkende for å sjekke `metadata.schoolDayOverride`
 * fra importerte events. Kalles uten dayEvents = eksakt samme oppførsel som før.
 */
export function buildBackgroundEventsForDate(
  dateKey: string,
  people: Person[],
  selectedPersonIds: PersonId[],
  dayEvents?: readonly Event[]
): Event[] {
  const mon0 = dateKeyToWeekdayMon0(dateKey)
  if (mon0 > 4) return []

  const wd = mon0 as WeekdayMonFri
  const passes = (pid: PersonId) =>
    selectedPersonIds.length === 0 || selectedPersonIds.includes(pid)

  const out: Event[] = []

  for (const p of people) {
    if (!passes(p.id)) continue

    if (p.memberKind === 'child' && p.school != null) {
      const band = p.school.gradeBand
      const gates = DEFAULT_SCHOOL_GATE_BY_BAND[band]
      const plan = p.school.weekdays[wd]

      // Regn ut forventet skoledags-range (brukes som fallback ved override).
      let dayStart = plan?.schoolStart ?? gates.start
      let dayEnd = plan?.schoolEnd ?? gates.end
      if (plan?.lessons?.length && !plan.useSimpleDay) {
        const lessons = [...plan.lessons].sort((a, b) => a.start.localeCompare(b.start))
        dayStart = lessons[0]?.start ?? dayStart
        dayEnd = lessons[lessons.length - 1]?.end ?? dayEnd
      }

      const weekOverlayDay = findSchoolWeekOverlayDayAction(p, dateKey)
      if (weekOverlayDay) {
        if (weekOverlayDay.action.action === 'remove_school_block') {
          continue
        }
        if (weekOverlayDay.action.action === 'replace_school_block') {
          const replaceTitle = buildSpecialSchoolTitle(weekOverlayDay.action, band)
          if (import.meta.env.DEV || import.meta.env.VITE_DEBUG_SCHOOL_IMPORT === 'true') {
            console.debug('[overlay replace block]', {
              overlayApplyReplaceCreatedBlock: true,
              overlayApplyReplaceTitle: replaceTitle,
              overlayApplyReplaceTimeRange: `${dayStart}–${dayEnd}`,
            })
          }
          out.push(
            makeBackgroundEvent(
              p.id,
              dateKey,
              dayStart,
              dayEnd,
              replaceTitle,
              'school',
              'day-override-week',
              'school_day_override',
              {
                schoolWeekOverlayDay: weekOverlayDay.action,
                schoolWeekOverlayMeta: {
                  overlayId: weekOverlayDay.overlayId,
                  weekYear: weekOverlayDay.weekYear,
                  weekNumber: weekOverlayDay.weekNumber,
                  dayIndex: weekOverlayDay.dayIndex,
                },
              }
            )
          )
          continue
        }
      }

      const picked = pickSchoolDayOverrideForChild(dayEvents, p.id)
      if (picked) {
        const { override, event: sourceEvent } = picked
        if (override.mode === 'hide_day') {
          continue // Skjul skoleblokken helt denne dagen.
        }
        if (override.mode === 'replace_day') {
          out.push(makeOverrideReplaceBlock(p.id, dateKey, override, dayStart, dayEnd, sourceEvent))
          continue // Ingen vanlig skoleblokk i tillegg.
        }
        if (override.mode === 'adjust_day') {
          const adjStart = override.schoolStart ?? dayStart
          const adjEnd = override.schoolEnd ?? dayEnd
          if (adjStart < adjEnd) {
            out.push(
              makeBackgroundEvent(p.id, dateKey, adjStart, adjEnd, 'Skole', 'school', 'day', 'school_day', {
                schoolDayOverride: override,
                schoolDayOverrideSourceId: sourceEvent.id,
              })
            )
            continue
          }
          // Hvis adjust gir tom/omvendt range: degrade til vanlig behandling.
        }
      }

      // ---- Normal (ingen override eller adjust som ikke kunne anvendes) ----
      if (plan === undefined) {
        out.push(
          makeBackgroundEvent(p.id, dateKey, gates.start, gates.end, 'Skole', 'school', 'day', 'school_day', {
            schoolWeekOverlayDay:
              weekOverlayDay?.action.action === 'enrich_existing_school_block' ? weekOverlayDay.action : undefined,
            schoolWeekOverlayMeta:
              weekOverlayDay?.action.action === 'enrich_existing_school_block'
                ? {
                    overlayId: weekOverlayDay.overlayId,
                    weekYear: weekOverlayDay.weekYear,
                    weekNumber: weekOverlayDay.weekNumber,
                    dayIndex: weekOverlayDay.dayIndex,
                  }
                : undefined,
          })
        )
        continue
      }

      const start = plan.schoolStart ?? gates.start
      const end = plan.schoolEnd ?? gates.end

      if (plan.useSimpleDay || !plan.lessons?.length) {
        out.push(
          makeBackgroundEvent(p.id, dateKey, start, end, 'Skole', 'school', 'day', 'school_day', {
            schoolWeekOverlayDay:
              weekOverlayDay?.action.action === 'enrich_existing_school_block' ? weekOverlayDay.action : undefined,
            schoolWeekOverlayMeta:
              weekOverlayDay?.action.action === 'enrich_existing_school_block'
                ? {
                    overlayId: weekOverlayDay.overlayId,
                    weekYear: weekOverlayDay.weekYear,
                    weekNumber: weekOverlayDay.weekNumber,
                    dayIndex: weekOverlayDay.dayIndex,
                  }
                : undefined,
          })
        )
      } else {
        // Lesson-based plans should still look like one continuous school day block.
        out.push(
          makeBackgroundEvent(p.id, dateKey, dayStart, dayEnd, 'Skole', 'school', 'day', 'school_day', {
            schoolWeekOverlayDay:
              weekOverlayDay?.action.action === 'enrich_existing_school_block' ? weekOverlayDay.action : undefined,
            schoolWeekOverlayMeta:
              weekOverlayDay?.action.action === 'enrich_existing_school_block'
                ? {
                    overlayId: weekOverlayDay.overlayId,
                    weekYear: weekOverlayDay.weekYear,
                    weekNumber: weekOverlayDay.weekNumber,
                    dayIndex: weekOverlayDay.dayIndex,
                  }
                : undefined,
          })
        )
      }
    }

    if (p.memberKind === 'parent' && p.work?.weekdays[wd]) {
      const { start, end } = p.work.weekdays[wd]!
      out.push(makeBackgroundEvent(p.id, dateKey, start, end, 'Arbeid', 'work', 'day', 'work_day'))
    }
  }

  return out
}
