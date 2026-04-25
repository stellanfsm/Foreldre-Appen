import { useEffect, useMemo, useRef } from 'react'
import type { ChildSchoolProfile, NorwegianGradeBand, SchoolLessonSlot, WeekdayMonFri } from '../types'
import {
  CUSTOM_SUBJECT_KEY,
  DEFAULT_SCHOOL_GATE_BY_BAND,
  FREMMSP_LEK_SUBCATEGORY_PRESETS,
  GRADE_BAND_LABELS,
  LESSON_SUBCATEGORY_CUSTOM_SENTINEL,
  SUBJECTS_BY_BAND,
  VALGFAG_SUBCATEGORY_PRESETS,
  lessonSubcategorySelectValue,
  lessonUsesStructuredSubcategory,
  matchSubjectFromText,
  isKnownSubjectKeyForBand,
  subjectDisplayPartsForKey,
  subjectLabelForKey,
} from '../data/norwegianSubjects'

const WD_LABELS: Record<WeekdayMonFri, string> = {
  0: 'Mandag',
  1: 'Tirsdag',
  2: 'Onsdag',
  3: 'Torsdag',
  4: 'Fredag',
}

interface SchoolProfileFieldsProps {
  value: ChildSchoolProfile
  onChange: (next: ChildSchoolProfile) => void
}

function parseTimeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(minutes, 23 * 60 + 59))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function toTitleCaseNb(s: string): string {
  if (!s.trim()) return s
  return s
    .trim()
    .split(/\s+/)
    .map((w) => w.slice(0, 1).toLocaleUpperCase('nb-NO') + w.slice(1).toLocaleLowerCase('nb-NO'))
    .join(' ')
}

function normalizeImportedSubcategory(subjectKey: string, rawValue: string | undefined): string | undefined {
  const raw = rawValue?.trim()
  if (!raw) return undefined
  const low = raw.toLocaleLowerCase('nb-NO')

  if (subjectKey === 'fremmedspråk') {
    const m = raw.match(/(?:fremmedspråk|språk)\s*[:\-()]\s*(.+)$/i)
    if (m?.[1]?.trim()) return toTitleCaseNb(m[1])
    if (low === 'fremmedspråk' || low === 'språk' || low === 'sprak') return undefined
    if (/\btysk|german|deutsch\b/i.test(raw)) return 'Tysk'
    if (/\bspansk|spanish\b/i.test(raw)) return 'Spansk'
    if (/\bfransk|french\b/i.test(raw)) return 'Fransk'
    if (/\bitaliensk|italian\b/i.test(raw)) return 'Italiensk'
    if (/\brussisk|russian\b/i.test(raw)) return 'Russisk'
    if (/\barabisk|arabic\b/i.test(raw)) return 'Arabisk'
    if (/\bjapansk|japanese\b/i.test(raw)) return 'Japansk'
    if (/\bmandarin|kinesisk|kinamål\b/i.test(raw)) return 'Mandarin (kinesisk)'
    return toTitleCaseNb(raw)
  }

  if (subjectKey === 'valgfag') {
    const m = raw.match(/valgfag\s*[:\-()]\s*(.+)$/i)
    if (m?.[1]?.trim()) return toTitleCaseNb(m[1])
    if (low === 'valgfag') return undefined
    return toTitleCaseNb(raw)
  }

  return raw
}

export function SchoolProfileFields({ value, onChange }: SchoolProfileFieldsProps) {
  const band = value.gradeBand
  const subjects = useMemo(() => SUBJECTS_BY_BAND[band], [band])
  const defaultLessonMinutes = band.startsWith('vg') ? 45 : 60
  const lessonStartRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const debugSchoolImport = import.meta.env.DEV || import.meta.env.VITE_DEBUG_SCHOOL_IMPORT === 'true'
  const harmonizeRunRef = useRef(0)

  useEffect(() => {
    harmonizeRunRef.current += 1
    const runId = harmonizeRunRef.current
    let changed = false
    const nextWeekdays = { ...value.weekdays }

    if (debugSchoolImport) {
      console.debug('[school import harmonize] run:start', {
        runId,
        band,
      })
      // #region agent log
      fetch('http://127.0.0.1:7535/ingest/049b3e24-eef8-4d09-b78d-4e257b02a969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4d90a0'},body:JSON.stringify({sessionId:'4d90a0',runId:'school-review-trace-v1',hypothesisId:'H2',location:'SchoolProfileFields.tsx:52',message:'harmonize run start',data:{runId,band},timestamp:Date.now()})}).catch(()=>{})
      // #endregion
    }

    for (const wd of [0, 1, 2, 3, 4] as WeekdayMonFri[]) {
      const plan = value.weekdays[wd]
      if (!plan || plan.useSimpleDay || !plan.lessons?.length) continue
      const nextLessons = plan.lessons.map((lesson) => ({ ...lesson }))
      let dayChanged = false

      for (let i = 0; i < nextLessons.length; i++) {
        const lesson = nextLessons[i]!
        const custom = lesson.customLabel?.trim()
        if (!custom || lesson.subjectKey === CUSTOM_SUBJECT_KEY) continue
        const inferred = matchSubjectFromText(band, custom)
        if (debugSchoolImport) {
          console.debug('[school import harmonize] lesson:check', {
            runId,
            weekday: wd,
            lessonIndex: i,
            before: { subjectKey: lesson.subjectKey, customLabel: lesson.customLabel },
            match: inferred,
          })
          // #region agent log
          fetch('http://127.0.0.1:7535/ingest/049b3e24-eef8-4d09-b78d-4e257b02a969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4d90a0'},body:JSON.stringify({sessionId:'4d90a0',runId:'school-review-trace-v1',hypothesisId:'H2',location:'SchoolProfileFields.tsx:70',message:'lesson check',data:{runId,weekday:wd,lessonIndex:i,before:{subjectKey:lesson.subjectKey,customLabel:lesson.customLabel,start:lesson.start,end:lesson.end},inferred},timestamp:Date.now()})}).catch(()=>{})
          // #endregion
        }
        if (inferred && inferred.subjectKey === lesson.subjectKey && inferred.matchType === 'exact' && custom) {
          // Samme fag to ganger: Tankestrøm kan sende både subjectKey og label/displayLabel som samme fagnavn.
          // Da gjør customLabel ingen nytte og kan forvirre import-feilsøking / snapshot-diff.
          lesson.customLabel = undefined
          dayChanged = true
          continue
        }

        if (!inferred || inferred.subjectKey === lesson.subjectKey) continue

        // Import kan sette faktisk fag i customLabel (f.eks. "Valgfag") mens subjectKey er feil.
        // Da løfter vi customLabel til riktig subjectKey for å unngå motstrid i dropdown/felt.
        const before = { subjectKey: lesson.subjectKey, customLabel: lesson.customLabel }
        lesson.subjectKey = inferred.subjectKey
        if (inferred.matchType === 'exact') {
          lesson.customLabel = undefined
        }
        if (debugSchoolImport) {
          console.debug('[school import harmonize] lesson:apply', {
            runId,
            weekday: wd,
            lessonIndex: i,
            match: inferred,
            before,
            after: {
              subjectKey: lesson.subjectKey,
              customLabel: lesson.customLabel,
              lessonSubcategory: lesson.lessonSubcategory,
            },
          })
          // #region agent log
          fetch('http://127.0.0.1:7535/ingest/049b3e24-eef8-4d09-b78d-4e257b02a969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4d90a0'},body:JSON.stringify({sessionId:'4d90a0',runId:'school-review-trace-v1',hypothesisId:'H3',location:'SchoolProfileFields.tsx:88',message:'lesson harmonized',data:{runId,weekday:wd,lessonIndex:i,match:inferred,before,after:{subjectKey:lesson.subjectKey,customLabel:lesson.customLabel,start:lesson.start,end:lesson.end}},timestamp:Date.now()})}).catch(()=>{})
          // #endregion
        }
        dayChanged = true
      }

      for (let i = 0; i < nextLessons.length; i++) {
        const lesson = nextLessons[i]!
        if (!lessonUsesStructuredSubcategory(lesson.subjectKey)) continue
        const importedLessonHadCustomLabel = !!lesson.customLabel?.trim()
        const normalizedSub = normalizeImportedSubcategory(
          lesson.subjectKey,
          lesson.lessonSubcategory ?? lesson.customLabel
        )
        if (normalizedSub && lesson.lessonSubcategory !== normalizedSub) {
          lesson.lessonSubcategory = normalizedSub
          dayChanged = true
        }
        if (importedLessonHadCustomLabel && lesson.lessonSubcategory !== undefined) {
          lesson.customLabel = undefined
          dayChanged = true
        }
        if (debugSchoolImport && importedLessonHadCustomLabel) {
          console.debug('[school import harmonize] lesson:subcategory-normalized', {
            runId,
            weekday: wd,
            lessonIndex: i,
            subjectKey: lesson.subjectKey,
            importedLessonHadCustomLabel,
            importedLessonSubcategoryNormalized: lesson.lessonSubcategory,
          })
        }
        if (lesson.lessonSubcategory !== undefined && !lesson.lessonSubcategory.trim()) {
          lesson.lessonSubcategory = undefined
          dayChanged = true
        }
        if (lesson.lessonSubcategory !== undefined) {
          if (debugSchoolImport) {
            console.debug('[school import harmonize] lesson:subcategory-migrate-from-custom', {
              runId,
              weekday: wd,
              lessonIndex: i,
              subjectKey: lesson.subjectKey,
              savedSchoolLessonSubcategory: lesson.lessonSubcategory,
            })
          }
        }
      }

      if (dayChanged) {
        nextWeekdays[wd] = { ...plan, useSimpleDay: false, lessons: nextLessons }
        changed = true
      }
    }

    if (changed) {
      if (debugSchoolImport) {
        console.debug('[school import harmonize] run:commit', {
          runId,
          weekdays: nextWeekdays,
        })
        // #region agent log
        fetch('http://127.0.0.1:7535/ingest/049b3e24-eef8-4d09-b78d-4e257b02a969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4d90a0'},body:JSON.stringify({sessionId:'4d90a0',runId:'school-review-trace-v1',hypothesisId:'H4',location:'SchoolProfileFields.tsx:108',message:'harmonize commit',data:{runId},timestamp:Date.now()})}).catch(()=>{})
        // #endregion
      }
      onChange({ ...value, weekdays: nextWeekdays })
    } else if (debugSchoolImport) {
      console.debug('[school import harmonize] run:no-change', { runId })
    }
  }, [band, debugSchoolImport, onChange, value])

  useEffect(() => {
    if (!debugSchoolImport) return
    const mismatches: Array<{
      weekday: WeekdayMonFri
      lessonIndex: number
      subjectKey: string
      customLabel?: string
      match: ReturnType<typeof matchSubjectFromText>
    }> = []
    for (const wd of [0, 1, 2, 3, 4] as WeekdayMonFri[]) {
      const plan = value.weekdays[wd]
      if (!plan || plan.useSimpleDay || !plan.lessons?.length) continue
      for (let i = 0; i < plan.lessons.length; i++) {
        const lesson = plan.lessons[i]!
        const custom = lesson.customLabel?.trim()
        if (!custom || lesson.subjectKey === CUSTOM_SUBJECT_KEY) continue
        const match = matchSubjectFromText(band, custom)
        if (match && match.subjectKey !== lesson.subjectKey) {
          mismatches.push({
            weekday: wd,
            lessonIndex: i,
            subjectKey: lesson.subjectKey,
            customLabel: lesson.customLabel,
            match,
          })
        }
      }
    }
    if (mismatches.length > 0) {
      console.debug('[school import harmonize] render:mismatches-still-visible', mismatches)
      // #region agent log
      fetch('http://127.0.0.1:7535/ingest/049b3e24-eef8-4d09-b78d-4e257b02a969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4d90a0'},body:JSON.stringify({sessionId:'4d90a0',runId:'school-review-trace-v1',hypothesisId:'H5',location:'SchoolProfileFields.tsx:149',message:'mismatches still visible in render',data:{mismatches},timestamp:Date.now()})}).catch(()=>{})
      // #endregion
    }
  }, [band, debugSchoolImport, value])

  function setBand(next: NorwegianGradeBand) {
    onChange({ ...value, gradeBand: next })
  }

  function setDaySimple(wd: WeekdayMonFri, useSimple: boolean) {
    const next = { ...value.weekdays }
    if (useSimple) {
      const cur = next[wd]
      next[wd] = {
        useSimpleDay: true,
        lessons: undefined,
        schoolStart: cur?.schoolStart ?? gates.start,
        schoolEnd: cur?.schoolEnd ?? gates.end,
      }
    } else {
      const start = next[wd]?.schoolStart ?? gates.start
      next[wd] = {
        useSimpleDay: false,
        lessons: [
          {
            subjectKey: subjects[0]?.key ?? 'norsk',
            start,
            end: minutesToTime(parseTimeToMinutes(start) + defaultLessonMinutes),
          },
        ],
      }
    }
    onChange({ ...value, weekdays: next })
  }

  function addLesson(wd: WeekdayMonFri) {
    const cur = value.weekdays[wd]
    const existing = cur?.lessons ?? []
    const previous = existing[existing.length - 1]
    const start = previous?.end ?? (cur?.schoolStart ?? gates.start)
    const lessons: SchoolLessonSlot[] = [
      ...existing,
      {
        subjectKey: subjects[0]?.key ?? 'norsk',
        start,
        end: minutesToTime(parseTimeToMinutes(start) + defaultLessonMinutes),
      },
    ]
    onChange({
      ...value,
      weekdays: {
        ...value.weekdays,
        [wd]: { useSimpleDay: false, lessons },
      },
    })
  }

  function firstSubcategoryForSubject(subjectKey: string): string | undefined {
    for (const wd of [0, 1, 2, 3, 4] as WeekdayMonFri[]) {
      const lessons = value.weekdays[wd]?.lessons ?? []
      for (const L of lessons) {
        if (L.subjectKey !== subjectKey) continue
        const s = L.lessonSubcategory?.trim()
        if (s) return s
      }
    }
    return undefined
  }

  function applySubcategoryToSubject(subjectKey: string, subcategory: string) {
    if (!subcategory.trim()) return
    const nextWeekdays = { ...value.weekdays }
    let changed = 0
    for (const wd of [0, 1, 2, 3, 4] as WeekdayMonFri[]) {
      const plan = value.weekdays[wd]
      if (!plan?.lessons?.length || plan.useSimpleDay) continue
      const lessons = plan.lessons.map((L) => ({ ...L }))
      let dayChanged = false
      for (const lesson of lessons) {
        if (lesson.subjectKey !== subjectKey) continue
        if ((lesson.lessonSubcategory ?? '') === subcategory) continue
        lesson.lessonSubcategory = subcategory
        dayChanged = true
        changed += 1
      }
      if (dayChanged) nextWeekdays[wd] = { ...plan, lessons, useSimpleDay: false }
    }
    if (changed > 0) {
      if (debugSchoolImport) {
        console.debug('[school profile lesson subcategory apply-all]', {
          subjectKey,
          selectedSubcategory: subcategory,
          subcategoryAutofillApplied: changed,
        })
      }
      onChange({ ...value, weekdays: nextWeekdays })
    }
  }

  function updateLesson(wd: WeekdayMonFri, index: number, patch: Partial<SchoolLessonSlot>) {
    const cur = value.weekdays[wd]
    const lessons = (cur?.lessons ?? []).map((L) => ({ ...L }))
    if (!lessons[index]) return
    if (debugSchoolImport && 'lessonSubcategory' in patch) {
      const L = lessons[index]!
      const display = subjectDisplayPartsForKey(
        band,
        L.subjectKey,
        L.customLabel,
        patch.lessonSubcategory ?? L.lessonSubcategory
      )
      console.debug('[school profile lesson subcategory]', {
        subjectKey: L.subjectKey,
        lessonSubcategory: patch.lessonSubcategory ?? L.lessonSubcategory,
        supportsSubcategorySelection: lessonUsesStructuredSubcategory(L.subjectKey),
        selectedSubcategory: patch.lessonSubcategory,
        displayPrimaryLabel: display.primary,
        displaySecondaryLabel: display.secondary,
      })
    }
    lessons[index] = { ...lessons[index], ...patch }
    // Keep flow fast: when an end time is chosen, suggest next start from it.
    if (patch.end && lessons[index + 1]) {
      lessons[index + 1] = { ...lessons[index + 1], start: patch.end }
    }
    onChange({
      ...value,
      weekdays: { ...value.weekdays, [wd]: { useSimpleDay: false, lessons } },
    })
  }

  function removeLesson(wd: WeekdayMonFri, index: number) {
    const cur = value.weekdays[wd]
    const lessons = (cur?.lessons ?? []).filter((_, i) => i !== index)
    onChange({
      ...value,
      weekdays: {
        ...value.weekdays,
        [wd]: { useSimpleDay: false, lessons: lessons.length ? lessons : undefined },
      },
    })
  }

  function addBreakAfterLesson(wd: WeekdayMonFri, index: number, breakMinutes: number) {
    const cur = value.weekdays[wd]
    const lessons = (cur?.lessons ?? []).map((L) => ({ ...L }))
    if (!lessons[index] || !lessons[index + 1]) return
    const nextStart = minutesToTime(parseTimeToMinutes(lessons[index].end) + breakMinutes)
    lessons[index + 1].start = nextStart
    onChange({
      ...value,
      weekdays: { ...value.weekdays, [wd]: { useSimpleDay: false, lessons } },
    })
  }

  function resetDay(wd: WeekdayMonFri) {
    onChange({
      ...value,
      weekdays: {
        ...value.weekdays,
        [wd]: {
          useSimpleDay: true,
          lessons: undefined,
          schoolStart: gates.start,
          schoolEnd: gates.end,
        },
      },
    })
  }

  const gates = DEFAULT_SCHOOL_GATE_BY_BAND[band]
  if (debugSchoolImport) {
    console.debug('[school profile layout]', { schoolProfileRowCompacted: true })
  }

  return (
    <div
      className="space-y-3 rounded-xl border border-zinc-200 bg-white/80 px-3 py-3 md:px-4 md:py-4"
      data-render-component="SchoolProfileFields"
    >
      {import.meta.env.DEV ? (
        <p
          className="rounded-md border-2 border-fuchsia-500 bg-fuchsia-100 px-2 py-1 text-center text-[11px] font-bold uppercase tracking-wide text-fuchsia-950"
          data-verify="school-profile-fields-root"
        >
          VERIFY: SchoolProfileFields (lesson-rader under er fra denne komponenten)
        </p>
      ) : null}
      <p className="text-[12px] font-medium text-zinc-800">Skolerute (bakgrunn)</p>
      <p className="text-[11px] leading-relaxed text-zinc-600">
        Basert på typiske tider i norsk grunnskole (LK20) — tilpass lokalt. Vises svakt; avtaler og hendelser
        legges oppå.
      </p>

      <div>
        <label className="text-[11px] font-medium text-zinc-600">Trinn / nivå</label>
        <select
          value={band}
          onChange={(e) => setBand(e.target.value as NorwegianGradeBand)}
          className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-[13px] outline-none focus:border-zinc-400"
        >
          {(Object.keys(GRADE_BAND_LABELS) as NorwegianGradeBand[]).map((k) => (
            <option key={k} value={k}>
              {GRADE_BAND_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      <p className="text-[11px] text-zinc-500">
        Standard skoledag når ingenting annet er satt: <span className="font-medium">{gates.start}–{gates.end}</span>{' '}
        (man–fre).
      </p>

      <div className="space-y-3">
        {([0, 1, 2, 3, 4] as WeekdayMonFri[]).map((wd) => {
          const plan = value.weekdays[wd]
          const mode = plan?.useSimpleDay !== false || !plan?.lessons?.length ? 'simple' : 'lessons'
          return (
            <div key={wd} className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-2.5 py-2.5 md:px-3 md:py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-zinc-800 md:text-[13px]">{WD_LABELS[wd]}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setDaySimple(wd, true)}
                    className={`min-h-9 rounded-full px-3 py-1 text-[12px] font-medium ${
                      mode === 'simple' ? 'bg-brandNavy text-white' : 'bg-white text-zinc-600'
                    }`}
                  >
                    En dag
                  </button>
                  <button
                    type="button"
                    onClick={() => setDaySimple(wd, false)}
                    className={`min-h-9 rounded-full px-3 py-1 text-[12px] font-medium ${
                      mode === 'lessons' ? 'bg-brandNavy text-white' : 'bg-white text-zinc-600'
                    }`}
                  >
                    Timer
                  </button>
                </div>
              </div>
              {mode === 'simple' && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="text-[12px] text-zinc-600">Fra</label>
                  <input
                    type="time"
                    value={plan?.schoolStart ?? gates.start}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        weekdays: {
                          ...value.weekdays,
                          [wd]: {
                            useSimpleDay: true,
                            lessons: undefined,
                            schoolStart: e.target.value,
                            schoolEnd: plan?.schoolEnd ?? gates.end,
                          },
                        },
                      })
                    }
                    className="h-10 w-[108px] rounded border border-zinc-200 px-2 py-1 text-[12px] md:w-[120px]"
                  />
                  <label className="text-[12px] text-zinc-600">Til</label>
                  <input
                    type="time"
                    value={plan?.schoolEnd ?? gates.end}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        weekdays: {
                          ...value.weekdays,
                          [wd]: {
                            useSimpleDay: true,
                            lessons: undefined,
                            schoolStart: plan?.schoolStart ?? gates.start,
                            schoolEnd: e.target.value,
                          },
                        },
                      })
                    }
                    className="h-10 w-[108px] rounded border border-zinc-200 px-2 py-1 text-[12px] md:w-[120px]"
                  />
                </div>
              )}
              {mode === 'lessons' && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-[11px] leading-relaxed text-zinc-500">
                    Neste time foreslås fra forrige sluttid. Standard varighet: {defaultLessonMinutes} min.
                  </p>
                  {(plan?.lessons ?? []).map((L, i) => (
                    <div key={i} className="flex flex-col gap-1.5">
                      <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-1.5">
                        <select
                          value={L.subjectKey === CUSTOM_SUBJECT_KEY ? CUSTOM_SUBJECT_KEY : L.subjectKey}
                          onChange={(e) => {
                            const v = e.target.value
                            if (v === L.subjectKey) return
                            if (v === CUSTOM_SUBJECT_KEY) {
                              updateLesson(wd, i, {
                                subjectKey: CUSTOM_SUBJECT_KEY,
                                customLabel: L.customLabel ?? '',
                                lessonSubcategory: undefined,
                              })
                            } else {
                              const inferredSubcategory = lessonUsesStructuredSubcategory(v)
                                ? firstSubcategoryForSubject(v)
                                : undefined
                              updateLesson(wd, i, {
                                subjectKey: v,
                                customLabel: undefined,
                                lessonSubcategory: inferredSubcategory,
                              })
                            }
                          }}
                          className="min-h-10 w-full min-w-0 rounded border border-zinc-200 px-2 py-1 text-[12px] md:flex-[1.8]"
                        >
                          {!isKnownSubjectKeyForBand(band, L.subjectKey) ? (
                            <option value={L.subjectKey}>
                              {subjectLabelForKey(band, L.subjectKey, L.customLabel, L.lessonSubcategory)}{' '}
                              (fra import)
                            </option>
                          ) : null}
                          {subjects.map((s) => (
                            <option key={s.key} value={s.key}>
                              {s.label}
                            </option>
                          ))}
                          <option value={CUSTOM_SUBJECT_KEY}>Annet fag…</option>
                        </select>
                        <div className="flex min-w-0 flex-nowrap items-center gap-1">
                          <input
                            type="time"
                            step={60}
                            value={L.start}
                            onChange={(e) => updateLesson(wd, i, { start: e.target.value })}
                            ref={(el) => {
                              lessonStartRefs.current[`${wd}-${i}-start`] = el
                            }}
                            className="h-8 w-[3.9rem] max-md:px-0.5 shrink-0 rounded border border-zinc-200 px-1 py-0.5 text-[10px] tabular-nums md:h-9 md:w-[88px] md:text-[11px]"
                          />
                          <input
                            type="time"
                            step={60}
                            value={L.end}
                            onChange={(e) => {
                              updateLesson(wd, i, { end: e.target.value })
                              const nextKey = `${wd}-${i + 1}-start`
                              window.requestAnimationFrame(() => {
                                lessonStartRefs.current[nextKey]?.focus()
                              })
                            }}
                            className="h-8 w-[3.9rem] max-md:px-0.5 shrink-0 rounded border border-zinc-200 px-1 py-0.5 text-[10px] tabular-nums md:h-9 md:w-[88px] md:text-[11px]"
                          />
                          <button
                            type="button"
                            onClick={() => removeLesson(wd, i)}
                            className="ml-auto inline-flex h-8 min-w-7 max-md:min-w-7 shrink-0 items-center justify-center rounded-full border border-red-200 px-1 text-[12px] font-semibold text-red-600 md:ml-0 md:min-w-8"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      {lessonUsesStructuredSubcategory(L.subjectKey) ? (
                        <div className="mt-1.5 rounded-md border border-zinc-200/90 bg-zinc-50/80 px-2 py-1.5">
                          {L.subjectKey === 'fremmedspråk' || L.subjectKey === 'valgfag' ? (
                            <>
                              <label className="block text-[11px] font-medium text-zinc-600">
                                Velg underkategori
                              </label>
                              {(() => {
                                const subPickPresets =
                                  L.subjectKey === 'fremmedspråk'
                                    ? FREMMSP_LEK_SUBCATEGORY_PRESETS
                                    : VALGFAG_SUBCATEGORY_PRESETS
                                const subSelectValue = lessonSubcategorySelectValue(
                                  L.lessonSubcategory,
                                  subPickPresets
                                )
                                const showSubCustom =
                                  subSelectValue === LESSON_SUBCATEGORY_CUSTOM_SENTINEL
                                const freeText =
                                  L.lessonSubcategory === undefined
                                    ? ''
                                    : subPickPresets.some(
                                        (p) => p.value === (L.lessonSubcategory ?? '').trim()
                                      )
                                      ? ''
                                      : (L.lessonSubcategory ?? '')
                                const hasMultiSameSubject = (() => {
                                  let total = 0
                                  for (const wd2 of [0, 1, 2, 3, 4] as WeekdayMonFri[]) {
                                    const lessons = value.weekdays[wd2]?.lessons ?? []
                                    total += lessons.filter((x) => x.subjectKey === L.subjectKey).length
                                  }
                                  return total > 1
                                })()
                                const applyAllValue = (L.lessonSubcategory ?? '').trim()
                                return (
                                  <>
                                    <select
                                      className="mt-0.5 w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-[12px] outline-none focus:border-zinc-400"
                                      value={
                                        subSelectValue === LESSON_SUBCATEGORY_CUSTOM_SENTINEL
                                          ? LESSON_SUBCATEGORY_CUSTOM_SENTINEL
                                          : subSelectValue || ''
                                      }
                                      onChange={(e) => {
                                        const v = e.target.value
                                        if (v === '') {
                                          updateLesson(wd, i, { lessonSubcategory: undefined })
                                        } else if (v === LESSON_SUBCATEGORY_CUSTOM_SENTINEL) {
                                          updateLesson(wd, i, { lessonSubcategory: '' })
                                        } else {
                                          updateLesson(wd, i, { lessonSubcategory: v })
                                        }
                                      }}
                                    >
                                      <option value="">— Velg —</option>
                                      {subPickPresets.map((p) => (
                                        <option key={p.value} value={p.value}>
                                          {p.label}
                                        </option>
                                      ))}
                                      <option value={LESSON_SUBCATEGORY_CUSTOM_SENTINEL}>
                                        Annet (skriv under)
                                      </option>
                                    </select>
                                    {showSubCustom ? (
                                      <input
                                        type="text"
                                        value={freeText}
                                        onChange={(e) => {
                                          const t = e.target.value
                                          if (t.trim() === '') {
                                            updateLesson(wd, i, { lessonSubcategory: '' })
                                          } else {
                                            updateLesson(wd, i, { lessonSubcategory: t.trim() })
                                          }
                                        }}
                                        placeholder="Skriv underkategori"
                                        aria-label="Underkategori (annet)"
                                        className="mt-1 w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-[12px] outline-none focus:border-zinc-400"
                                      />
                                    ) : null}
                                    {hasMultiSameSubject && applyAllValue ? (
                                      <button
                                        type="button"
                                        onClick={() => applySubcategoryToSubject(L.subjectKey, applyAllValue)}
                                        className="mt-1 text-[10px] font-medium text-brandTeal underline underline-offset-2"
                                      >
                                        Bruk samme for alle {L.subjectKey === 'fremmedspråk' ? 'språk' : 'valgfag'}-timer
                                      </button>
                                    ) : null}
                                  </>
                                )
                              })()}
                            </>
                          ) : (
                            <>
                              <label className="block text-[11px] font-medium text-zinc-600">
                                Underkategori / spor
                              </label>
                              <input
                                type="text"
                                value={L.lessonSubcategory ?? ''}
                                onChange={(e) =>
                                  updateLesson(wd, i, {
                                    lessonSubcategory: e.target.value.trim() || undefined,
                                  })
                                }
                                placeholder="Valgfritt — f.eks. programfagnavn"
                                aria-label="Underkategori for generisk fagblokk"
                                className="mt-0.5 w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-[12px] outline-none focus:border-zinc-400"
                              />
                            </>
                          )}
                        </div>
                      ) : null}
                      {L.subjectKey === CUSTOM_SUBJECT_KEY ? (
                        <input
                          type="text"
                          value={L.customLabel ?? ''}
                          onChange={(e) => updateLesson(wd, i, { customLabel: e.target.value })}
                          placeholder="Skriv inn fagnavn"
                          aria-label="Fagnavn for annet fag"
                          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[13px] outline-none focus:border-zinc-400"
                        />
                      ) : null}
                      {i < (plan?.lessons?.length ?? 0) - 1 && (
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-zinc-500">Pause:</span>
                          <button
                            type="button"
                            onClick={() => addBreakAfterLesson(wd, i, 10)}
                            className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-[10px] text-zinc-700"
                          >
                            +10 min
                          </button>
                          <button
                            type="button"
                            onClick={() => addBreakAfterLesson(wd, i, 15)}
                            className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-[10px] text-zinc-700"
                          >
                            +15 min
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => resetDay(wd)}
                      className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-[11px] text-zinc-700"
                    >
                      Nullstill dag
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => addLesson(wd)}
                    className="min-h-9 rounded-full border border-brandTeal/30 px-3 py-1.5 text-[12px] font-medium text-brandTeal"
                  >
                    + Legg til time
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
