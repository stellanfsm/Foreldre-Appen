/**
 * Placeholder while week events load on the logistics screen (same perceived-speed pattern as schedule).
 */
export function LogisticsLoadingSkeleton() {
  return (
    <div className="flex flex-1 min-h-0 flex-col px-3 pb-4" aria-busy="true" aria-label="Laster logistikk">
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="border-b border-neutral-200 px-4 pt-4 pb-3">
          <div className="h-6 w-32 animate-pulse rounded-lg bg-neutral-200" />
          <div className="mt-2 h-4 w-48 animate-pulse rounded bg-neutral-200" />
          <div className="mt-4 flex flex-wrap gap-2">
            <div className="h-8 w-24 animate-pulse rounded-full bg-neutral-200" />
            <div className="h-8 w-20 animate-pulse rounded-full bg-neutral-200" />
          </div>
        </div>
        <div className="flex-1 space-y-6 overflow-hidden px-4 py-4">
          {[1, 2, 3].map((section) => (
            <div key={section} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="h-4 w-40 animate-pulse rounded bg-neutral-200" />
                <div className="h-3 w-16 animate-pulse rounded bg-neutral-200" />
              </div>
              <div className="space-y-2">
                <div className="h-[72px] w-full animate-pulse rounded-lg bg-neutral-200" />
                <div className="h-[72px] w-full animate-pulse rounded-lg bg-neutral-200" style={{ width: '92%' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
