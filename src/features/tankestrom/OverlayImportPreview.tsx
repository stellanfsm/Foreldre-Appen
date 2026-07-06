import type { Person, SchoolLessonSlot, WeekdayMonFri } from '../../types'
import type { PortalSchoolWeekOverlayProposal, SchoolWeekOverlayDailyAction } from './types'
import { buildSchoolRowsForPlan } from '../../lib/schoolOverlayDisplay'
import { buildSpecialSchoolTitle } from '../../lib/backgroundEvents'
import { LessonOverlayBoxReadOnly, OverlayUnmatchedFallback } from '../../components/SchoolLessonOverlayRows'

const WEEKDAY_LABELS: Record<number, string> = {
  0: 'Mandag',
  1: 'Tirsdag',
  2: 'Onsdag',
  3: 'Torsdag',
  4: 'Fredag',
  5: 'Lørdag',
  6: 'Søndag',
}

/**
 * Import-preview: viser hvordan uke-overlayen (fra bundle) vil se ut som «ukeplan-info under fag»
 * i kalenderen — FØR import. Matcher bundle-overlayen mot barnets LAGREDE timeplan og bruker
 * NØYAKTIG samme read-only-render + matcher (schoolWeekOverlayLessonMatch) som kalenderens
 * skole-blokk, så previewen er garantert lik det brukeren får etter import. Ren read-only.
 */
export function OverlayImportPreview({
  overlay,
  child,
}: {
  overlay: PortalSchoolWeekOverlayProposal
  child: Person | undefined
}) {
  const gradeBand = child?.school?.gradeBand ?? '8-10'
  // Klassekode-utheving på overlay-linjene (samme som event-notatene) — entydig: previewens barn.
  const childClassCode = child?.relevanceProfile?.school?.classCode
  const days = (
    Object.entries(overlay.dailyActions) as Array<[string, SchoolWeekOverlayDailyAction | undefined]>
  )
    .map(([k, action]) => ({ wd: Number(k), action }))
    .filter(
      (d): d is { wd: number; action: SchoolWeekOverlayDailyAction } =>
        !!d.action && d.action.action !== 'none'
    )
    .sort((a, b) => a.wd - b.wd)

  if (days.length === 0) return null

  return (
    <div className="mx-4 mt-4 rounded-md border border-synkaNavy/10 bg-white p-3">
      <p className="text-body-sm font-semibold text-synkaNavy">Slik blir skole-uken</p>
      <p className="mt-0.5 text-caption text-synkaNavy/50">
        Forhåndsvisning av ukeplan-info lagt under fagene i {child?.name ?? 'barnets'} timeplan.
      </p>
      <div className="mt-2 space-y-3">
        {days.map(({ wd, action }) => {
          const dayLabel = WEEKDAY_LABELS[wd] ?? `Dag ${wd}`

          if (action.action === 'remove_school_block') {
            return (
              <div key={wd} className="rounded-md border border-rose-200 bg-rose-50/70 p-2">
                <p className="text-caption font-semibold text-rose-950">{dayLabel}: skoleblokken fjernes</p>
                {action.reason ? <p className="mt-0.5 text-caption text-rose-900/80">{action.reason}</p> : null}
              </div>
            )
          }

          if (action.action === 'replace_school_block') {
            return (
              <div key={wd} className="rounded-md border border-synkaNavy/10 bg-synkaCream/40 p-2">
                <p className="text-caption font-semibold text-synkaNavy">
                  {dayLabel}: {buildSpecialSchoolTitle(action, gradeBand)}
                </p>
                <LessonOverlayBoxReadOnly
                  lesson={undefined}
                  overlayDayAction={action}
                  isReplaceDay
                  childClassCode={childClassCode}
                />
              </div>
            )
          }

          // enrich_existing_school_block — fag-plassert visning mot lagret timeplan
          const plan = wd >= 0 && wd <= 4 ? child?.school?.weekdays?.[wd as WeekdayMonFri] : undefined
          const rows = buildSchoolRowsForPlan(gradeBand, plan)
          const lessons = rows.map((r) => r.lesson).filter((l): l is SchoolLessonSlot => !!l)
          return (
            <div key={wd} className="rounded-md border border-synkaNavy/10 bg-synkaCream/40 p-2">
              <p className="text-caption font-semibold text-synkaNavy">{dayLabel}</p>
              <div className="mt-1 space-y-1.5">
                {rows.map((r, i) => (
                  <div key={`${r.start}-${i}`}>
                    <p className="text-caption font-medium text-synkaNavy/80">
                      {r.label} <span className="text-synkaNavy/40">{r.start}–{r.end}</span>
                    </p>
                    <LessonOverlayBoxReadOnly
                      lesson={r.lesson}
                      overlayDayAction={action}
                      childClassCode={childClassCode}
                    />
                  </div>
                ))}
              </div>
              <OverlayUnmatchedFallback
                lessons={lessons}
                overlayDayAction={action}
                childClassCode={childClassCode}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
