import type { SchoolWeekOverlaySubjectUpdate } from '../types'

export function filterSubjectUpdatesByLanguageTrack(
  updates: SchoolWeekOverlaySubjectUpdate[],
  resolvedTrack: string | undefined,
  resolvedValgfagTrack?: string
): SchoolWeekOverlaySubjectUpdate[] {
  const track = resolvedTrack?.trim().toLocaleLowerCase('nb-NO')
  const valgfagTrack = resolvedValgfagTrack?.trim().toLocaleLowerCase('nb-NO')
  if (!track && !valgfagTrack) return updates
  return updates.filter((u) => {
    if (u.subjectKey === 'fremmedspråk') {
      if (!track) return true
      const custom = u.customLabel?.trim().toLocaleLowerCase('nb-NO')
      if (custom && custom.includes(track)) return true
      const sectionLines = Object.values(u.sections ?? {}).flatMap((v) => v ?? [])
      if (sectionLines.length === 0) return true
      const ok = sectionLines.some((line) => line.toLocaleLowerCase('nb-NO').includes(track))
      if (!ok && (import.meta.env.DEV || import.meta.env.VITE_DEBUG_SCHOOL_IMPORT === 'true')) {
        console.debug('[tankestrom overlay filter]', {
          subjectKey: u.subjectKey,
          childLessonSubcategoryTrack: track,
          languageLineFilteredByStoredTrack: true,
        })
      }
      return ok
    }
    if (u.subjectKey === 'valgfag' && valgfagTrack) {
      const custom = u.customLabel?.trim().toLocaleLowerCase('nb-NO')
      if (custom && custom.includes(valgfagTrack)) return true
      const sectionLines = Object.values(u.sections ?? {}).flatMap((v) => v ?? [])
      if (sectionLines.length === 0) return true
      return sectionLines.some((line) => line.toLocaleLowerCase('nb-NO').includes(valgfagTrack))
    }
    return true
  })
}
