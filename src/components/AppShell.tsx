import { type ReactNode } from 'react'
// TODO: remove build fingerprint after deploy verification
import { BuildFingerprintMarker } from './BuildFingerprintMarker'

interface AppShellProps {
  children: ReactNode
}

/** Full-viewport shell for phone and tablet (no desktop preview chrome). */
export function AppShell({ children }: AppShellProps) {
  return (
    <div
      className="app-shell-root flex h-[100dvh] min-h-0 w-full min-w-0 max-w-full flex-col overflow-x-hidden overflow-y-hidden bg-surface"
      style={{
        paddingTop: 'var(--safe-top)',
        paddingBottom: 'var(--safe-bottom)',
        paddingLeft: 'var(--safe-left)',
        paddingRight: 'var(--safe-right)',
      }}
    >
      <div className="app-shell-inner flex h-full min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden overflow-y-hidden">
        <div className="app-shell-stage flex h-full min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
          {children}
        </div>
      </div>
      {/* TODO: remove build fingerprint after deploy verification */}
      <BuildFingerprintMarker />
    </div>
  )
}
