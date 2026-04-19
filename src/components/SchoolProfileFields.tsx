import { useMemo, useRef } from 'react'
import type { ChildSchoolProfile, NorwegianGradeBand, SchoolLessonSlot, WeekdayMonFri } from '../types'
import {
  CUSTOM_SUBJECT_KEY,
  DEFAULT_SCHOOL_GATE_BY_BAND,
  GRADE_BAND_LABELS,
  SUBJECTS_BY_BAND,
  isKnownSubjectKeyForBand,
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

export function SchoolProfileFields({ value, onChange }: SchoolProfileFieldsProps) {
  const band = value.gradeBand
  const subjects = useMemo(() => SUBJECTS_BY_BAND[band], [band])
  const defaultLessonMinutes = band.startsWith('vg') ? 45 : 60
  const lessonStartRefs = useRef<Record<string, HTMLInputElement | null>>({})

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

  function updateLesson(wd: WeekdayMonFri, index: number, patch: Partial<SchoolLessonSlot>) {
    const cur = value.weekdays[wd]
    const lessons = (cur?.lessons ?? []).map((L) => ({ ...L }))
    if (!lessons[index]) return
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

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white/80 px-3 py-3 md:px-4 md:py-4">
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
                    <div key={i} className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={L.subjectKey === CUSTOM_SUBJECT_KEY ? CUSTOM_SUBJECT_KEY : L.subjectKey}
                        onChange={(e) => {
                          const v = e.target.value
                          if (v === CUSTOM_SUBJECT_KEY) {
                            updateLesson(wd, i, {
                              subjectKey: CUSTOM_SUBJECT_KEY,
                              customLabel: L.customLabel ?? '',
                            })
                          } else {
                            updateLesson(wd, i, { subjectKey: v, customLabel: undefined })
                          }
                        }}
                        className="min-h-10 min-w-0 flex-1 rounded border border-zinc-200 px-2 py-1 text-[12px]"
                      >
                        {!isKnownSubjectKeyForBand(band, L.subjectKey) ? (
                          <option value={L.subjectKey}>
                            {subjectLabelForKey(band, L.subjectKey, L.customLabel)}{' '}
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
                      <input
                        type="time"
                        value={L.start}
                        onChange={(e) => updateLesson(wd, i, { start: e.target.value })}
                        ref={(el) => {
                          lessonStartRefs.current[`${wd}-${i}-start`] = el
                        }}
                        className="h-10 w-[104px] rounded border border-zinc-200 px-2 py-1 text-[12px] md:w-[116px]"
                      />
                      <input
                        type="time"
                        value={L.end}
                        onChange={(e) => {
                          updateLesson(wd, i, { end: e.target.value })
                          const nextKey = `${wd}-${i + 1}-start`
                          window.requestAnimationFrame(() => {
                            lessonStartRefs.current[nextKey]?.focus()
                          })
                        }}
                        className="h-10 w-[104px] rounded border border-zinc-200 px-2 py-1 text-[12px] md:w-[116px]"
                      />
                      <button
                        type="button"
                        onClick={() => removeLesson(wd, i)}
                        className="inline-flex h-9 min-w-9 items-center justify-center rounded-full border border-red-200 px-2 text-[13px] font-semibold text-red-600"
                      >
                        ×
                      </button>
                      </div>
                      {i < (plan?.lessons?.length ?? 0) - 1 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-zinc-500">Pause:</span>
                          <button
                            type="button"
                            onClick={() => addBreakAfterLesson(wd, i, 10)}
                            className="rounded-full border border-zinc-300 bg-white px-2.5 py-0.5 text-[11px] text-zinc-700"
                          >
                            +10 min
                          </button>
                          <button
                            type="button"
                            onClick={() => addBreakAfterLesson(wd, i, 15)}
                            className="rounded-full border border-zinc-300 bg-white px-2.5 py-0.5 text-[11px] text-zinc-700"
                          >
                            +15 min
                          </button>
                        </div>
                      )}
                      {L.subjectKey === CUSTOM_SUBJECT_KEY && (
                        <input
                          type="text"
                          value={L.customLabel ?? ''}
                          onChange={(e) => updateLesson(wd, i, { customLabel: e.target.value })}
                          placeholder="Skriv inn fagnavn"
                          className="w-full rounded border border-zinc-200 px-2 py-1.5 text-[12px]"
                        />
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
