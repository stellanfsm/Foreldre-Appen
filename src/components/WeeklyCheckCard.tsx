interface WeeklyCheckCardProps {
  totalActivities: number
  collisionCount: number
}

export function WeeklyCheckCard({ totalActivities, collisionCount }: WeeklyCheckCardProps) {
  const collisionLabel =
    collisionCount === 0 ? 'alt klart' : collisionCount === 1 ? '1 må avklares' : `${collisionCount} må avklares`

  return (
    <div className="mx-4 mt-2 rounded-card border border-neutral-200 bg-neutral-100 px-3 py-2.5 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Ukesjekk</p>
      <p className="mt-1 text-[13px] font-medium text-neutral-600">
        {totalActivities} {totalActivities === 1 ? 'hendelse' : 'hendelser'} planlagt
        {` · `}
        {collisionLabel}
      </p>
    </div>
  )
}
