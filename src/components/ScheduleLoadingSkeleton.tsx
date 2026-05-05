/**
 * Skeleton shown while the week's events are loading (timeline or list view).
 */
export function ScheduleLoadingSkeleton() {
  const widths = ['w-[72%]', 'w-[88%]', 'w-[64%]', 'w-[80%]', 'w-[70%]'] as const
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto overflow-x-hidden px-4 pt-2" aria-busy="true" aria-label="Loading schedule">
      <div className="flex w-full max-w-md flex-col items-center space-y-3">
        {widths.map((w, i) => (
          <div key={i} className={`h-14 ${w} max-w-full animate-pulse rounded-lg bg-neutral-200`} />
        ))}
      </div>
      <div className="mt-6 flex shrink-0 justify-center pb-2">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-primary-600" />
      </div>
    </div>
  )
}
