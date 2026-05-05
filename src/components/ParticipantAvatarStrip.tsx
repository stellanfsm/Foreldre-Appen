import type { Person } from '../types'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}

interface ParticipantAvatarStripProps {
  people: Person[]
  /** Max avatars before +N (default 4) */
  max?: number
  className?: string
}

/** Compact overlapping initials for “hvem er med?” in list rows. */
export function ParticipantAvatarStrip({ people, max = 4, className = '' }: ParticipantAvatarStripProps) {
  const shown = people.slice(0, max)
  const rest = people.length - shown.length
  const label = people.map((p) => p.name).join(', ')

  if (people.length === 0) {
    return (
      <span
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[9px] font-bold text-neutral-500 ${className}`}
        aria-hidden
      >
        ?
      </span>
    )
  }

  return (
    <span className={`isolate inline-flex shrink-0 items-center ${className}`} aria-label={`Med: ${label}`}>
      {shown.map((p, i) => (
        <span
          key={p.id}
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[9px] font-bold text-white shadow-sm"
          style={{
            backgroundColor: p.colorAccent,
            marginLeft: i === 0 ? 0 : -6,
            zIndex: shown.length - i,
          }}
        >
          {initials(p.name)}
        </span>
      ))}
      {rest > 0 && (
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-neutral-400 text-[9px] font-bold text-white shadow-sm"
          style={{ marginLeft: shown.length === 0 ? 0 : -6, zIndex: 0 }}
        >
          +{rest}
        </span>
      )}
    </span>
  )
}
