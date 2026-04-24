/**
 * Oppdager overlappende skoletimer i en `ChildSchoolProfile` (typisk parallelle spor: D1/D2, språkvalg).
 * Brukes kun i Tankestrøm-review for fast timeplan — ikke A-plan eller dag-overrides.
 */
import type { ChildSchoolProfile, NorwegianGradeBand, SchoolLessonSlot, WeekdayMonFri } from '../types'
import { subjectLabelForKey } from '../data/norwegianSubjects'

export interface LessonConflictGroup {
  weekday: WeekdayMonFri
  /** Start av felles overlapp-vindu (max av starttidene) — det brukeren velger spor innenfor */
  displayStart: string
  /** Slutt av felles overlapp-vindu (min av sluttidene) */
  displayEnd: string
  /** Alternative timer brukeren må velge én av */
  candidates: SchoolLessonSlot[]
}

/** Stabil nøkkel for én konfliktgruppe (React key, logging). */
export function lessonConflictGroupId(g: LessonConflictGroup): string {
  return `${g.weekday}:${g.candidates.map(lessonFingerprint).sort().join('¦')}`
}

export function lessonFingerprint(l: SchoolLessonSlot): string {
  return `${l.start}|${l.end}|${l.subjectKey}|${(l.customLabel ?? '').trim()}|${(l.lessonSubcategory ?? '').trim()}`
}

function minTime(a: string, b: string): string {
  return a <= b ? a : b
}

function maxTime(a: string, b: string): string {
  return a >= b ? a : b
}

/**
 * Ekte overlapp (ikke bare inngrening i endepunkt): [start,end) slik at påfølgende
 * 09:00–10:00 og 10:00–11:00 ikke regnes som konflikt.
 */
function lessonsOverlap(a: SchoolLessonSlot, b: SchoolLessonSlot): boolean {
  return a.start < b.end && b.start < a.end
}

/**
 * Maksimale klikker (størrelse ≥ 2) i overlappgrafen: hver gruppe er timer som
 * **parvis** overlapper i tid. Da unngår vi transitiv «bro» (A med B, B med C → alt i én bunke)
 * når A og C ikke overlapper — typisk feil for review-UI.
 *
 * n er liten per dag; enkel bitmask-utprøving er nok.
 */
function maximalLessonOverlapCliques(lessons: SchoolLessonSlot[]): SchoolLessonSlot[][] {
  const n = lessons.length
  if (n < 2) return []

  function isClique(mask: number): boolean {
    const idx: number[] = []
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) idx.push(i)
    }
    if (idx.length < 2) return false
    for (let a = 0; a < idx.length; a++) {
      for (let b = a + 1; b < idx.length; b++) {
        if (!lessonsOverlap(lessons[idx[a]!]!, lessons[idx[b]!]!)) return false
      }
    }
    return true
  }

  const out: SchoolLessonSlot[][] = []
  for (let mask = 0; mask < 1 << n; mask++) {
    if (!isClique(mask)) continue
    let maximal = true
    for (let k = 0; k < n; k++) {
      if (mask & (1 << k)) continue
      if (isClique(mask | (1 << k))) {
        maximal = false
        break
      }
    }
    if (!maximal) continue
    const subset: SchoolLessonSlot[] = []
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) subset.push(lessons[i]!)
    }
    out.push(subset)
  }

  return out
}

/**
 * Alle konfliktgrupper (minst to overlappende timer) i profilen.
 */
export function detectLessonConflicts(profile: ChildSchoolProfile): LessonConflictGroup[] {
  const out: LessonConflictGroup[] = []
  for (let wd = 0; wd <= 4; wd++) {
    const plan = profile.weekdays[wd as WeekdayMonFri]
    if (!plan || plan.useSimpleDay || !plan.lessons?.length) continue
    const groups = maximalLessonOverlapCliques(plan.lessons)
    for (const candidates of groups) {
      // Felles overlapp-vindu (alle kandidater treffer samme tidsrom)
      let displayStart = candidates[0]!.start
      let displayEnd = candidates[0]!.end
      for (const c of candidates) {
        displayStart = maxTime(displayStart, c.start)
        displayEnd = minTime(displayEnd, c.end)
      }
      const sortedCandidates = [...candidates].sort((a, b) => a.start.localeCompare(b.start))
      out.push({
        weekday: wd as WeekdayMonFri,
        displayStart,
        displayEnd,
        candidates: sortedCandidates,
      })
    }
  }
  out.sort((a, b) => {
    if (a.weekday !== b.weekday) return a.weekday - b.weekday
    return a.displayStart.localeCompare(b.displayStart)
  })
  return out
}

export function lessonDisplayLabel(band: NorwegianGradeBand, l: SchoolLessonSlot): string {
  return subjectLabelForKey(band, l.subjectKey, l.customLabel, l.lessonSubcategory)
}

/**
 * Erstatter alle kandidater i gruppen med én valgt `SchoolLessonSlot`, på plass til første kandidat i listen.
 */
export function applyLessonConflictChoice(
  profile: ChildSchoolProfile,
  group: LessonConflictGroup,
  choiceIndex: number
): ChildSchoolProfile {
  const chosen = group.candidates[choiceIndex]
  if (!chosen) return profile
  const wd = group.weekday
  const plan = profile.weekdays[wd]
  if (!plan?.lessons) return profile

  const drop = new Set(group.candidates.map(lessonFingerprint))
  const firstIdx = plan.lessons.findIndex((l) => drop.has(lessonFingerprint(l)))
  const filtered = plan.lessons.filter((l) => !drop.has(lessonFingerprint(l)))
  const insertAt = firstIdx < 0 ? filtered.length : Math.min(firstIdx, filtered.length)
  const newLessons = [...filtered.slice(0, insertAt), { ...chosen }, ...filtered.slice(insertAt)]

  return {
    ...profile,
    weekdays: {
      ...profile.weekdays,
      [wd]: { ...plan, useSimpleDay: false, lessons: newLessons },
    },
  }
}
