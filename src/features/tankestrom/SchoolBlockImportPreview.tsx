import type { Person } from '../../types'
import type { SchoolBlockPreviewDay, SchoolBlockPreviewReplacement } from './schoolBlockPreview'

/**
 * Import-preview basert på `schoolBlockProposal` (autoritativ dagskilde). Dagsoperasjonene
 * (none / adjust_start / adjust_end / replace_day) er allerede påført i `buildSchoolBlockPreviewDays`
 * — denne komponenten er ren presentasjon. Hvert content item vises ÉN gang; ingen slugs, ingen
 * gammel tekstsplitting. Faller aldri tilbake på overlay her (siden velger kilde).
 */

function formatRange(start: string | null, end: string | null): string {
  if (start && end) return `${start}–${end}`
  if (start) return `Fra ${start}`
  if (end) return `Til ${end}`
  return ''
}

function ReplacementBlock({ replacement }: { replacement: SchoolBlockPreviewReplacement }) {
  const range = formatRange(replacement.start, replacement.end)
  return (
    <div className="mt-1 rounded-md border border-synkaNavy/10 bg-white/70 p-2">
      <p className="text-caption font-semibold text-synkaNavy">{replacement.title}</p>
      {range ? <p className="mt-0.5 text-caption text-synkaNavy/60">{range}</p> : null}
    </div>
  )
}

export function SchoolBlockImportPreview({
  days,
  child,
}: {
  days: SchoolBlockPreviewDay[]
  child: Person | undefined
}) {
  if (days.length === 0) return null

  return (
    <div className="mx-4 mt-4 rounded-md border border-synkaNavy/10 bg-white p-3">
      <p className="text-body-sm font-semibold text-synkaNavy">Slik blir skole-uken</p>
      <p className="mt-0.5 text-caption text-synkaNavy/50">
        Forhåndsvisning av skoleuken for {child?.name ?? 'barnet'} basert på ukeplanen.
      </p>
      <div className="mt-2 space-y-3">
        {days.map((d) => (
          <div key={d.weekday} className="rounded-md border border-synkaNavy/10 bg-synkaCream/40 p-2">
            <p className="text-caption font-semibold text-synkaNavy">{d.dayLabel}</p>

            {d.op === 'replace_day' && d.replacement ? (
              <ReplacementBlock replacement={d.replacement} />
            ) : (
              <>
                {d.note ? (
                  <p className="mt-0.5 text-caption font-medium text-synkaTeal">{d.note}</p>
                ) : null}
                {d.lessons.length > 0 ? (
                  <div className="mt-1 space-y-1">
                    {d.lessons.map((L) => (
                      <p key={L.key} className="text-caption font-medium text-synkaNavy/80">
                        {L.label} <span className="text-synkaNavy/40">{L.start}–{L.end}</span>
                      </p>
                    ))}
                  </div>
                ) : null}
              </>
            )}

            {d.contentLines.length > 0 ? (
              <div className="mt-2">
                {d.op !== 'replace_day' ? (
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-900">
                    Ellers denne dagen
                  </p>
                ) : null}
                <ul className="mt-1 list-disc space-y-1 pl-4 text-caption text-indigo-900">
                  {d.contentLines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
