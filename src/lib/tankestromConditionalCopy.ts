/**
 * Brukerrettet ordlyd for «betinget» programpunkter i Tankestrøm-review og innebygd program.
 * Ett enkelt variant-sett (v1) – ingen ny tolkningslogikk, kun presentasjon.
 */

export const TANKESTROM_CONDITIONAL_UI_VARIANT = 'v1_forelopig' as const

/** Kompakt merkelapp i lister (mobilvennlig, lett å skanne). */
export function tankestromConditionalBadgeLabelNb(): string {
  return 'Foreløpig'
}

/** Litt mer forklaring i detalj/status-rad. */
export function tankestromConditionalDetailStatusNb(): string {
  return 'Ikke endelig avklart'
}

/** Suffiks i kompakte programlinjer (parent preview), uten teknisk «betinget». */
export function tankestromConditionalPreviewTitleSuffixNb(): string {
  return 'foreløpig'
}

/** Kort forklaring ved peker (tilgjengelighet / hjelpsom kontekst). */
export function tankestromConditionalAccessibleHintNb(): string {
  return 'Kan avhenge av videre spill eller er ikke bekreftet ennå. Tid kan fortsatt endres.'
}

/** Suffix allerede satt i tittel (eldre import eller tidligere visning). */
export function tankestromConditionalTitleSuffixAlreadyPresent(title: string): boolean {
  return /\(\s*(?:betinget|foreløpig)\s*\)/i.test(title)
}

export function logTankestromConditionalCopyDebug(payload: Record<string, unknown>): void {
  if (!import.meta.env.DEV && import.meta.env.VITE_DEBUG_SCHOOL_IMPORT !== 'true') return
  console.debug('[tankestrom conditional copy]', {
    conditionalUiCopyVariantUsed: TANKESTROM_CONDITIONAL_UI_VARIANT,
    ...payload,
  })
}
