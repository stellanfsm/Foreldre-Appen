import type { SchoolWeekDayOverride, SchoolWeekOverlay, WeekdayMonFri } from '../types'

/**
 * Rene, immutable domenehelpere for `SchoolWeekOverlay.dayOverrides` (persist-modellen for
 * replace_day / adjust_start / adjust_end). Ingen React/hook-avhengighet, ingen state.
 *
 * Serialiseringsstil (speiler prosjektets omit-absent-konvensjon, jf. overlayToChildWeekOverlay):
 * fravær av en dag = ingen overstyring; når siste override fjernes utelates `dayOverrides` HELT
 * (blir `undefined`) i stedet for et tomt `{}`. Helperne muterer aldri inputobjektet.
 */

/** Overstyring for en gitt ukedag, eller undefined når ingen finnes. Påvirker ikke input. */
export function getSchoolWeekDayOverride(
  overlay: SchoolWeekOverlay,
  weekday: WeekdayMonFri
): SchoolWeekDayOverride | undefined {
  return overlay.dayOverrides?.[weekday]
}

/**
 * Sett/erstatt overstyringen for ÉN ukedag. Bevarer alle andre dager, `dailyActions` og øvrige
 * felt. Returnerer en ny overlay (input uendret). Konstruerer ingen tomme/tilfeldige felt.
 */
export function upsertSchoolWeekDayOverride(
  overlay: SchoolWeekOverlay,
  weekday: WeekdayMonFri,
  override: SchoolWeekDayOverride
): SchoolWeekOverlay {
  return {
    ...overlay,
    dayOverrides: {
      ...overlay.dayOverrides,
      [weekday]: override,
    },
  }
}

/**
 * Fjern overstyringen for ÉN ukedag. Bevarer alle andre dager. Når det var den siste, utelates
 * `dayOverrides` helt (feltet blir `undefined`, ikke `{}`). Returnerer en ny overlay (input uendret).
 */
export function removeSchoolWeekDayOverride(
  overlay: SchoolWeekOverlay,
  weekday: WeekdayMonFri
): SchoolWeekOverlay {
  if (!overlay.dayOverrides || !(weekday in overlay.dayOverrides)) {
    return overlay
  }
  const next = { ...overlay.dayOverrides }
  delete next[weekday]
  if (Object.keys(next).length === 0) {
    // Utelat feltet helt (omit-absent) i stedet for et tomt objekt.
    const { dayOverrides: _dropped, ...rest } = overlay
    return rest
  }
  return { ...overlay, dayOverrides: next }
}
