import type { Person } from '../../types'
import type { CanonicalSchoolImportPlan } from '../../lib/canonicalSchoolImportPlan'
import { CanonicalSchoolDayContent } from '../../components/CanonicalSchoolDayContent'

/**
 * Forhåndsvisning som utelukkende bruker den delte `CanonicalSchoolImportPlan`. Ingen parallell
 * schoolBlock-/overlay-preview og ingen tekstfallback — canonical er autoritativ når planen finnes.
 * Selve dags-innholdet rendres av `CanonicalSchoolDayContent` — SAMME komponent som den lagrede
 * skoleblokken (BackgroundDetailSheet) bruker etter readback, så preview og persist er identiske.
 */
export function CanonicalSchoolImportPreview({
  plan,
  child,
}: {
  plan: CanonicalSchoolImportPlan
  child: Person | undefined
}) {
  if (plan.days.length === 0) return null
  return (
    <div className="mx-4 mt-4 rounded-md border border-synkaNavy/10 bg-white p-3">
      <p className="text-body-sm font-semibold text-synkaNavy">Slik blir skole-uken</p>
      <p className="mt-0.5 text-caption text-synkaNavy/50">
        Forhåndsvisning av skoleuken for {child?.name ?? 'barnet'} basert på ukeplanen.
      </p>
      <div className="mt-2 space-y-3">
        {plan.days.map((day, i) => (
          <div key={`${day.weekday ?? 'x'}-${i}`} className="rounded-md border border-synkaNavy/10 bg-synkaCream/40 p-2">
            <p className="text-caption font-semibold text-synkaNavy">{day.dayLabel}</p>
            <CanonicalSchoolDayContent day={day} />
          </div>
        ))}
      </div>
    </div>
  )
}
