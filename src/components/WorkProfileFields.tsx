import type { ParentWorkProfile, WeekdayMonFri } from '../types'

const WD_LABELS: Record<WeekdayMonFri, string> = {
  0: 'Man',
  1: 'Tir',
  2: 'Ons',
  3: 'Tor',
  4: 'Fre',
}

interface WorkProfileFieldsProps {
  value: ParentWorkProfile | undefined
  onChange: (next: ParentWorkProfile | undefined) => void
}

export function WorkProfileFields({ value, onChange }: WorkProfileFieldsProps) {
  const enabled = !!value?.weekdays && Object.keys(value.weekdays).length > 0
  const weekdays = value?.weekdays ?? {}

  function applyStandardWeek() {
    const w = { start: '09:00', end: '17:00' }
    onChange({
      weekdays: { 0: w, 1: w, 2: w, 3: w, 4: w },
    })
  }

  function clearWork() {
    onChange(undefined)
  }

  function setDay(wd: WeekdayMonFri, start: string, end: string) {
    onChange({
      weekdays: { ...weekdays, [wd]: { start, end } },
    })
  }

  return (
    <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-100/80 px-3 py-3">
      <p className="text-[12px] font-medium text-neutral-600">Arbeidstid (bakgrunn i ukesvisning)</p>
      <p className="text-[11px] leading-relaxed text-neutral-500">
        Vises svakt bak møter og andre avtaler. Enkel mal — tilpass etter behov.
      </p>
      {!enabled ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={applyStandardWeek}
            className="rounded-full bg-primary-50 px-3 py-1.5 text-[12px] font-medium text-neutral-600"
          >
            Bruk 09:00–17:00 man–fre
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {([0, 1, 2, 3, 4] as WeekdayMonFri[]).map((wd) => {
              const row = weekdays[wd]
              return (
                <div key={wd} className="flex flex-wrap items-center gap-2">
                  <span className="w-8 text-[12px] font-medium text-neutral-500">{WD_LABELS[wd]}</span>
                  <input
                    type="time"
                    value={row?.start ?? '09:00'}
                    onChange={(e) =>
                      setDay(wd, e.target.value, row?.end ?? '17:00')
                    }
                    className="rounded-lg border border-neutral-200 px-2 py-1 text-[12px]"
                  />
                  <span className="text-neutral-300">–</span>
                  <input
                    type="time"
                    value={row?.end ?? '17:00'}
                    onChange={(e) =>
                      setDay(wd, row?.start ?? '09:00', e.target.value)
                    }
                    className="rounded-lg border border-neutral-200 px-2 py-1 text-[12px]"
                  />
                </div>
              )
            })}
          </div>
          <button
            type="button"
            onClick={clearWork}
            className="text-[12px] font-medium text-neutral-400 underline"
          >
            Fjern arbeidstid
          </button>
        </>
      )}
    </div>
  )
}
