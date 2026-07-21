import type { Person, SchoolLessonSlot, WeekdayMonFri } from '../../types'
import {
  buildSchoolRowsForPlan,
  extractVisibleOverlayLinesForDay,
} from '../../lib/schoolOverlayDisplay'
import type {
  SchoolBlockContentItem,
  SchoolBlockDayOperation,
  SchoolBlockProposal,
  SchoolBlockWeekdayIndex,
  PortalSchoolWeekOverlayProposal,
} from './types'

/**
 * Ren, React-fri logikk for skole-forhåndsvisningen basert på `schoolBlockProposal` (wire).
 * Bygger en dag-modell der dagsoperasjonen (none / adjust_start / adjust_end / replace_day)
 * faktisk påvirker den viste timeplanen — mot barnets LAGREDE timeplan som grunnlag.
 *
 * Muterer ALDRI den lagrede timeplanen: alle lesson-objekter er nye kopier. Ingen persist,
 * ingen wire-endring. Brukes kun i forhåndsvisningen (autoritativ når gyldige dager finnes;
 * ellers faller siden tilbake til den eldre overlay-previewen).
 */

export type SchoolBlockPreviewLesson = {
  /** Stabil lokal nøkkel for React (ikke synlig). */
  key: string
  label: string
  start: string
  end: string
}

export type SchoolBlockPreviewReplacement = {
  title: string
  start: string | null
  end: string | null
}

export type SchoolBlockPreviewDay = {
  weekday: WeekdayMonFri
  dayLabel: string
  op: SchoolBlockDayOperation['op']
  /** Dagsmerknad (oppmøte/slutt) for adjust_*; `null` ellers. */
  note: string | null
  /** Ordinære (evt. klippede) timer å vise; tom ved replace_day. */
  lessons: SchoolBlockPreviewLesson[]
  /** Erstatningsblokk ved replace_day; `null` ellers. */
  replacement: SchoolBlockPreviewReplacement | null
  /** Day-level innhold — hver linje vist ÉN gang (deduplisert innen dagen). */
  contentLines: string[]
}

const WEEKDAY_LABELS: Record<WeekdayMonFri, string> = {
  0: 'Mandag',
  1: 'Tirsdag',
  2: 'Onsdag',
  3: 'Torsdag',
  4: 'Fredag',
}

/** Fallback-etikett for replace_day når `reason` mangler — aldri konstruert tid/innhold. */
const ACTIVITY_KIND_LABELS: Record<string, string> = {
  exam_day: 'Heldagsprøve',
  trip_day: 'Turdag',
  activity_day: 'Aktivitetsdag',
  free_day: 'Fri',
  other: 'Eget opplegg',
}

/** Seksjons-rekkefølge for day-level content (speiler wire `SchoolBlockSections`). */
const SECTION_ORDER = [
  'iTimen',
  'lekse',
  'husk',
  'proveVurdering',
  'ressurser',
  'ekstraBeskjed',
  'descriptionLines',
] as const

function isWeekdayMonFri(idx: SchoolBlockWeekdayIndex | null): idx is SchoolBlockWeekdayIndex {
  return idx === '0' || idx === '1' || idx === '2' || idx === '3' || idx === '4'
}

/** true når proposalet har minst én dag med gyldig ukedag (0–4). Ellers → overlay-fallback. */
export function hasValidSchoolBlockDays(proposal: SchoolBlockProposal | undefined): boolean {
  return !!proposal?.days?.some((d) => isWeekdayMonFri(d.weekdayIndex))
}

/** Normalisert nøkkel KUN for deduplisering (ikke synlig): trim + lowercase + kollaps whitespace. */
function normalizeForDedupe(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Synlig tekst for ett content item, i prioritert rekkefølge:
 * 1) resolvedChildAudience (barnets løste, filtrerte rad — VINNER over brede sections/sourceText),
 * 2) strukturerte sections, 3) sourceText, 4) title.
 *
 * Itererer ALDRI alle audienceEntries og parser ALDRI klassenavn fra fritekst → viser aldri hele
 * klasselisten, gjetter aldri. Når resolvedChildAudience finnes men mangler tid/rom/lærer, brukes
 * item-tittelen (trygg, allerede strukturert) — vi faller IKKE tilbake til bred all-class sourceText,
 * som ville utvidet audiencen igjen. Ingen slugs/subjectKey.
 */
function contentItemLines(item: SchoolBlockContentItem): string[] {
  const aud = item.resolvedChildAudience
  if (aud != null) {
    const time = aud.start && aud.end ? `${aud.start}–${aud.end}` : (aud.start ?? aud.end ?? '')
    const bits = [item.title?.trim(), time, aud.room?.trim(), aud.teacher?.trim()].filter(
      (b): b is string => !!b && b.length > 0
    )
    if (bits.length > 0) return [bits.join(' · ')]
    // Løst audience uten tid/rom/lærer → tittel; aldri bred all-class-tekst.
    const title = item.title?.trim()
    return title ? [title] : []
  }

  const sectionLines = SECTION_ORDER.flatMap((k) => item.sections?.[k] ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (sectionLines.length > 0) return sectionLines

  const src = item.sourceText?.trim()
  if (src) return [src]
  const title = item.title?.trim()
  return title ? [title] : []
}

/** true når dagen har minst ett content item med løst child-audience (→ schoolBlock-tekst vinner). */
function dayHasResolvedChildAudience(items: SchoolBlockContentItem[]): boolean {
  return items.some((i) => i.resolvedChildAudience != null)
}

/** Day-level content: hver contentItem-linje vist én gang (deduplisert innen dagen, stabil rekkefølge). */
function buildContentLines(items: SchoolBlockContentItem[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    for (const line of contentItemLines(item)) {
      const norm = normalizeForDedupe(line)
      if (norm.length === 0 || seen.has(norm)) continue
      seen.add(norm)
      out.push(line)
    }
  }
  return out
}

type OpResult = {
  op: SchoolBlockDayOperation['op']
  note: string | null
  lessons: SchoolBlockPreviewLesson[]
  replacement: SchoolBlockPreviewReplacement | null
}

/**
 * Bruker dagsoperasjonen på de ordinære timene. Rene kopier — muterer aldri input.
 * Tider er «HH:MM» (nullstilte) → leksikografisk sammenligning tilsvarer tidssammenligning.
 */
function applyDayOperation(
  lessons: SchoolBlockPreviewLesson[],
  op: SchoolBlockDayOperation
): OpResult {
  if (op.op === 'replace_day') {
    const title =
      op.reason?.trim() || ACTIVITY_KIND_LABELS[op.activityKind] || 'Eget opplegg'
    return {
      op: 'replace_day',
      note: null,
      lessons: [],
      replacement: { title, start: op.effectiveStart, end: op.effectiveEnd },
    }
  }

  if (op.op === 'adjust_start') {
    const t = op.effectiveStart
    const kept = lessons
      .filter((L) => L.end > t) // skjul timer som slutter før/nøyaktig ved t
      .map((L) => (L.start < t ? { ...L, start: t } : { ...L })) // klipp overlappende
    return {
      op: 'adjust_start',
      note: op.reason?.trim() || `Oppmøte kl. ${t}`,
      lessons: kept,
      replacement: null,
    }
  }

  if (op.op === 'adjust_end') {
    const t = op.effectiveEnd
    const kept = lessons
      .filter((L) => L.start < t) // skjul timer som starter ved/etter t
      .map((L) => (L.end > t ? { ...L, end: t } : { ...L })) // klipp overlappende
    return {
      op: 'adjust_end',
      note: op.reason?.trim() || `Slutt kl. ${t}`,
      lessons: kept,
      replacement: null,
    }
  }

  // op: 'none' — ordinære timer uendret
  return { op: 'none', note: null, lessons: lessons.map((L) => ({ ...L })), replacement: null }
}

/**
 * Velger ÉN deterministisk tekstkilde for dagen (dagsoperasjonen kommer alltid fra schoolBlock):
 *   A) schoolBlock-innhold når dagen har løst child-audience (barnets filtrerte rad vinner),
 *   B) overlay-tekst (samme match som legacy-previewen) når schoolBlock mangler løst audience,
 *   C) schoolBlock common-tekst ellers (kaster aldri informasjon).
 * Returnerer én deduplisert, flat liste uten seksjonsoverskrifter/subjectKey/slug.
 */
function chooseDayContentLines(args: {
  items: SchoolBlockContentItem[]
  overlayProposal: PortalSchoolWeekOverlayProposal | undefined
  weekday: WeekdayMonFri
  ordinaryLessons: SchoolLessonSlot[]
}): string[] {
  const { items, overlayProposal, weekday, ordinaryLessons } = args

  // A: schoolBlock har barnets løste audience → schoolBlock-tekst er autoritativ.
  if (dayHasResolvedChildAudience(items)) return buildContentLines(items)

  // B: ingen løst audience i schoolBlock → bruk overlayets allerede barnerelevante tekst for dagen.
  const overlayAction = overlayProposal?.dailyActions?.[weekday]
  if (
    overlayAction &&
    overlayAction.action !== 'none' &&
    overlayAction.action !== 'remove_school_block'
  ) {
    const overlayLines = extractVisibleOverlayLinesForDay({
      action: overlayAction,
      lessons: ordinaryLessons,
      isReplaceDay: overlayAction.action === 'replace_school_block',
    })
    if (overlayLines.length > 0) return overlayLines
  }

  // C: verken løst audience eller brukbar overlay-tekst → schoolBlock common-tekst, én gang.
  return buildContentLines(items)
}

/**
 * Bygger dag-modellen for forhåndsvisningen fra et `schoolBlockProposal`. Kun dager med gyldig
 * ukedag (0–4) tas med; sortert mandag→fredag. Barnets lagrede timeplan er grunnlaget for
 * vanlige dager og klippes/erstattes etter dagsoperasjonen uten å muteres.
 *
 * schoolBlock er ALLTID autoritativ for dagsoperasjon + vist timeplan; `overlayProposal` brukes
 * KUN som barnerelevant tekstfallback per dag (se `chooseDayContentLines`). Merk: dette gjelder kun
 * PREVIEW — persist/import bruker fortsatt den eksisterende skoleimportflyten (uendret her),
 * midlertidig frem til neste integrasjonssteg.
 */
export function buildSchoolBlockPreviewDays(args: {
  proposal: SchoolBlockProposal
  overlayProposal?: PortalSchoolWeekOverlayProposal
  child: Person | undefined
}): SchoolBlockPreviewDay[] {
  const { proposal, overlayProposal, child } = args
  const gradeBand = child?.school?.gradeBand ?? '8-10'
  const out: SchoolBlockPreviewDay[] = []

  for (const day of proposal.days ?? []) {
    if (!isWeekdayMonFri(day.weekdayIndex)) continue
    const weekday = Number(day.weekdayIndex) as WeekdayMonFri

    const plan = child?.school?.weekdays?.[weekday]
    const rows = buildSchoolRowsForPlan(gradeBand, plan)
    const ordinaryLessons = rows
      .map((r) => r.lesson)
      .filter((l): l is SchoolLessonSlot => !!l)
    const ordinary: SchoolBlockPreviewLesson[] = rows.map((r, i) => ({
      key: `${r.start}-${r.end}-${i}`,
      label: r.label,
      start: r.start,
      end: r.end,
    }))

    const applied = applyDayOperation(ordinary, day.dayOperation)
    out.push({
      weekday,
      dayLabel: WEEKDAY_LABELS[weekday],
      op: applied.op,
      note: applied.note,
      lessons: applied.lessons,
      replacement: applied.replacement,
      contentLines: chooseDayContentLines({
        items: day.contentItems ?? [],
        overlayProposal,
        weekday,
        ordinaryLessons,
      }),
    })
  }

  return out.sort((a, b) => a.weekday - b.weekday)
}
