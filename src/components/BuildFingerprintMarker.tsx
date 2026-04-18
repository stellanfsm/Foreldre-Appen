/**
 * TODO: remove build fingerprint after deploy verification
 *
 * Midlertidig synlig markør for å bekrefte at riktig deploy er aktiv.
 * Fjern: slett denne filen og import/brukssted i AppShell.tsx, og fjern `define` i vite.config.ts + `__APP_BUILD_FINGERPRINT__` i vite-env.d.ts
 */
function formatBuildInstant(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString('nb-NO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function BuildFingerprintMarker() {
  const raw = typeof __APP_BUILD_FINGERPRINT__ === 'string' ? __APP_BUILD_FINGERPRINT__ : ''
  if (!raw) return null
  const human = formatBuildInstant(raw)

  return (
    <div
      className="pointer-events-none fixed bottom-2 right-2 z-[65] max-w-[min(100vw-1rem,280px)] select-none"
      aria-hidden
    >
      <p className="rounded-md border border-amber-500/50 bg-zinc-950/88 px-2 py-1 font-mono text-[10px] font-semibold leading-tight text-amber-300 shadow-md backdrop-blur-[2px]">
        TEST BUILD · {human}
      </p>
    </div>
  )
}
