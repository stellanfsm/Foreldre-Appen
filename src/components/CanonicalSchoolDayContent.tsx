import type { CanonicalPlanDay, CanonicalPlanItem, CanonicalPlanReplacement } from '../lib/canonicalSchoolImportPlan'

/**
 * ÉN delt, ren presentasjon av en `CanonicalPlanDay` — brukt av BÅDE import-previewen og den
 * lagrede skoleblokken (BackgroundDetailSheet). Ingen sourceText-parsing, ingen fagmatcher, ingen
 * overlay-fallback: alle beslutninger (dayOperation, fag-plassering, audience, general) er allerede
 * gjort i planen. Rendrer ikke dagsetiketten (konteksten eier overskriften). Hvert item vises én gang.
 */

const CONTENT_TYPE_LABELS: Partial<Record<CanonicalPlanItem['contentType'], string>> = {
  homework: 'Lekse',
  assessment: 'Prøve/vurdering',
  reminder: 'Husk',
  resource: 'Ressurs',
  alternative_program: 'Alternativt opplegg',
}

function formatRange(start: string | null, end: string | null): string {
  if (start && end) return `${start}–${end}`
  if (start) return `Fra ${start}`
  if (end) return `Til ${end}`
  return ''
}

function ItemLines({ item }: { item: CanonicalPlanItem }) {
  if (item.lines.length === 0) return null
  const badge = CONTENT_TYPE_LABELS[item.contentType]
  return (
    <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-caption text-synkaNavy/70">
      {item.lines.map((line, i) => (
        <li key={i}>
          {i === 0 && badge ? <span className="mr-1 text-synkaNavy/40">{badge}:</span> : null}
          {line}
        </li>
      ))}
    </ul>
  )
}

function ReplacementBlock({ replacement }: { replacement: CanonicalPlanReplacement }) {
  const range = formatRange(replacement.start, replacement.end)
  return (
    <div className="mt-1 rounded-md border border-synkaNavy/10 bg-white/70 p-2">
      <p className="text-caption font-semibold text-synkaNavy">{replacement.title}</p>
      {range ? <p className="mt-0.5 text-caption text-synkaNavy/60">{range}</p> : null}
    </div>
  )
}

export function CanonicalSchoolDayContent({ day }: { day: CanonicalPlanDay }) {
  return (
    <>
      {day.op === 'replace_day' && day.replacement ? <ReplacementBlock replacement={day.replacement} /> : null}
      {day.op !== 'replace_day' && day.note ? (
        <p className="mt-0.5 text-caption font-medium text-synkaTeal">{day.note}</p>
      ) : null}

      {/* Timeplan med fag-plasserte items under riktig økt. */}
      {day.timetable.length > 0 ? (
        <div className="mt-1 space-y-1.5">
          {day.timetable.map((row) => (
            <div key={row.key}>
              <p className="text-caption font-medium text-synkaNavy/80">
                {row.label} <span className="text-synkaNavy/40">{row.start}–{row.end}</span>
              </p>
              {row.items.map((item) => (
                <ItemLines key={item.itemId} item={item} />
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {/* Fag-items uten sikker økt — egen faggruppe (label beholdt), IKKE generell dagsmelding. */}
      {day.unplacedSubjectGroups.length > 0 ? (
        <div className="mt-1 space-y-1.5">
          {day.unplacedSubjectGroups.map((group) => (
            <div key={group.label}>
              <p className="text-caption font-medium text-synkaNavy/80">{group.label}</p>
              {group.items.map((item) => (
                <ItemLines key={item.itemId} item={item} />
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {/* Audience-items (allerede child-scopet) — vist én gang, ingen ny klassematching. */}
      {day.audienceItems.length > 0 ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-caption text-synkaNavy/70">
          {day.audienceItems.flatMap((item) => item.lines.map((line, i) => <li key={`${item.itemId}-${i}`}>{line}</li>))}
        </ul>
      ) : null}

      {/* Generelle dagsbeskjeder. */}
      {day.generalMessages.length > 0 ? (
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-900">Ellers denne dagen</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-caption text-indigo-900">
            {day.generalMessages.flatMap((item) => item.lines.map((line, i) => <li key={`${item.itemId}-${i}`}>{line}</li>))}
          </ul>
        </div>
      ) : null}
    </>
  )
}
