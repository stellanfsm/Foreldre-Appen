import type { EventLayoutBlock } from '../types'
import { useFamily } from '../context/FamilyContext'

interface BackgroundBlockProps {
  block: EventLayoutBlock
  onSelect?: () => void
}

/** School/work profile blocks — low contrast, behind real activities */
export function BackgroundBlock({ block, onSelect }: BackgroundBlockProps) {
  const { people } = useFamily()
  const person = people.find((p) => p.id === block.personId)
  const tint = person?.colorTint ?? '#e4e4e7'
  const accent = person?.colorAccent ?? '#a1a1aa'
  const kind = block.metadata?.backgroundKind
  const subkind = block.metadata?.backgroundSubkind as string | undefined
  const isLesson = subkind === 'school_lesson'
  const isBreak = subkind === 'school_break'
  const isDayBlock =
    subkind === 'school_day' || subkind === 'school_day_override' || subkind === 'work_day' || !subkind
  const isSchoolOverlay = isLesson || isBreak

  return (
    <div
      className={`${onSelect ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'} absolute flex min-w-0 overflow-hidden shadow-none ${
        isDayBlock ? 'rounded-md' : 'rounded-none'
      }`}
      style={{
        top: block.topPx,
        height: block.heightPx,
        width: `${100 / block.totalColumns}%`,
        left: `${(100 / block.totalColumns) * block.columnIndex}%`,
        boxSizing: 'border-box',
        backgroundColor: isDayBlock ? tint : 'transparent',
        borderColor: accent,
        borderStyle: isDayBlock ? 'solid' : 'none',
        borderWidth: isDayBlock ? '1px' : '0',
        opacity: isDayBlock ? 0.42 : 1,
        zIndex: isDayBlock ? 1 : 2,
      }}
      role={onSelect ? 'button' : undefined}
      onClick={onSelect}
      aria-hidden={!onSelect}
    >
      {isDayBlock && (
        <div
          className="pointer-events-none absolute left-0 top-0 bottom-0 w-[3px] opacity-70"
          style={{ backgroundColor: accent }}
        />
      )}
      {isDayBlock ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center px-2 py-0.5">
          <span className="truncate text-[10px] font-medium leading-tight text-zinc-700">
            {block.title}
          </span>
          {kind && (
            <span className="text-[9px] font-medium uppercase tracking-wide text-zinc-500">
              {kind === 'school' ? 'Skole' : 'Jobb'}
            </span>
          )}
        </div>
      ) : isSchoolOverlay ? (
        <div className="relative min-h-0 min-w-0 flex-1">
          <div
            className="absolute left-2 right-2 top-0 border-t border-zinc-500/45"
          />
          <div className="absolute inset-x-2 top-1 min-w-0">
            <span
              className={`inline-block max-w-full truncate rounded px-1.5 py-[1px] text-[9px] leading-tight ${
                isBreak ? 'bg-zinc-50/85 text-zinc-600' : 'bg-white/80 text-zinc-700'
              }`}
            >
              {block.title}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
