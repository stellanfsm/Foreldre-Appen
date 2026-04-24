/**
 * Core data types for the parenting calendar.
 * Person-coded events; time as "HH:mm" (24h).
 */

export type PersonId = string;

/** Norwegian school stage for subject presets and default times (veiledende). */
export type NorwegianGradeBand = '1-4' | '5-7' | '8-10' | 'vg1' | 'vg2' | 'vg3'

/** Mon=0 … Fri=4 (weekday index for recurring school/work patterns). */
export type WeekdayMonFri = 0 | 1 | 2 | 3 | 4

export interface SchoolLessonSlot {
  subjectKey: string
  /** When set, shown instead of catalog name (e.g. «Kristendom»). */
  customLabel?: string
  /**
   * Strukturert underkategori for generiske fag (fremmedspråk, valgfag, programfag, …).
   * Kilde til sannhet for spor/variant — brukes f.eks. til språkspor og senere A-plan-filtrering.
   * Skilles fra `customLabel`, som fortsatt brukes til annet fag, tilleggstekst og import-runder.
   */
  lessonSubcategory?: string
  start: string
  end: string
}

export interface ChildSchoolDayPlan {
  /** If true, show one block «Skole» for default gate times */
  useSimpleDay: boolean
  /** Overrides gate times for this weekday */
  schoolStart?: string
  schoolEnd?: string
  /** When not useSimpleDay: ordered lessons */
  lessons?: SchoolLessonSlot[]
}

export interface ChildSchoolProfile {
  gradeBand: NorwegianGradeBand
  /** Per Mon–Fri; omit weekend — no school blocks */
  weekdays: Partial<Record<WeekdayMonFri, ChildSchoolDayPlan>>
  /** Uke-spesifikke avvik fra normal skoleprofil (A-plan/Tankestrøm overlay). */
  weekOverlays?: SchoolWeekOverlay[]
}

export type SchoolWeekOverlayAction =
  | 'remove_school_block'
  | 'replace_school_block'
  | 'enrich_existing_school_block'
  | 'none'

export interface SchoolWeekOverlaySubjectUpdate {
  subjectKey: string
  customLabel?: string
  sections?: Record<string, string[]>
}

export interface SchoolWeekOverlayDayAction {
  action: SchoolWeekOverlayAction
  reason?: string
  summary?: string
  subjectUpdates: SchoolWeekOverlaySubjectUpdate[]
}

export interface SchoolWeekOverlay {
  id: string
  weekYear: number
  weekNumber: number
  sourceTitle?: string
  originalSourceType?: string
  weeklySummary?: string[]
  classLabel?: string
  languageTrack?: {
    resolvedTrack?: string
    confidence?: number
    reason?: string
  }
  profileMatch?: {
    confidence?: number
    reason?: string
  }
  dailyActions: Partial<Record<number, SchoolWeekOverlayDayAction>>
  appliedAt?: string
}

export interface ParentWorkProfile {
  /** Typical work hours Mon–Fri */
  weekdays: Partial<Record<WeekdayMonFri, { start: string; end: string }>>
}

export type MemberKind = 'parent' | 'child'

export interface Person {
  id: PersonId;
  name: string;
  /** Tailwind-compatible tint class or hex for background */
  colorTint: string;
  /** Accent for border/chip active */
  colorAccent: string;
  /** Forelder = kan invitere annen forelder; barn = skolerute */
  memberKind: MemberKind;
  /** Child: school hours/subjects; parent: work hours */
  school?: ChildSchoolProfile;
  work?: ParentWorkProfile;
  /** Invited parent: auth user id that owns this row (mom’s «dad» profile). */
  linkedAuthUserId?: string;
}

export interface TransportInfo {
  dropoffBy?: PersonId;
  pickupBy?: PersonId;
  // Reserved for future: mode, car seat, etc.
  dropoffMode?: 'car' | 'walk' | 'bike';
  pickupMode?: 'car' | 'walk' | 'bike';
  needsCarSeat?: boolean;
}

/** Kategorier for fag-koblet innhold fra A-plan / Tankestrøm. */
export type SchoolItemType =
  | 'homework'   // lekse
  | 'note'       // generelt fagnotat
  | 'test'       // prøve / tentamen
  | 'equipment'  // "husk gymtøy"
  | 'trip'       // tur
  | 'other'

/**
 * Valgfri kobling fra et event til en spesifikk skoletime/fag for ett barn på én dato.
 * Matching skjer read-time mot `Person.school.weekdays[wd].lessons` — ingen stable lesson IDs i MVP.
 * Alt er valgfritt slik at eksisterende events forblir bakoverkompatible.
 */
/**
 * Én kandidat når A-planen kan referere flere mulige fag (språk/valgfag/programfag).
 * Matching velger kandidaten som best matcher barnets faktiske timeplan.
 */
export interface SchoolContextCandidate {
  subjectKey?: string;
  customLabel?: string;
}

export interface SchoolContext {
  /** Match mot `SchoolLessonSlot.subjectKey` (eller `CUSTOM_SUBJECT_KEY`). */
  subjectKey?: string;
  /** Fritekst-navn på faget når `subjectKey` mangler / er 'custom'. */
  customLabel?: string;
  /**
   * Flere mulige fag når A-planen er tvetydig (f.eks. "Spansk/Tysk/Fransk", "Valgfag").
   * Matcheren prøver hver kandidat, pluss hoved-`subjectKey`/`customLabel`, og velger beste treff.
   */
  subjectCandidates?: SchoolContextCandidate[];
  /** Sekundær match-nøkkel: `SchoolLessonSlot.start` (HH:mm). */
  lessonStart?: string;
  lessonEnd?: string;
  itemType: SchoolItemType;
  /** 0–1. Brukes for "forslag" vs "sikker". */
  confidence?: number;
  /** Peker tilbake til kilden. */
  sourceKind?: 'tankestrom_a_plan' | 'tankestrom_manual' | 'other';
}

/**
 * Beslutningsmodell for hvordan et importert event kan "trumfe" normal skoleblokk for én dato.
 *
 *  - `replace_day`: vis spesialdag i stedet for vanlig skole (f.eks. prøve, tur).
 *  - `hide_day`:    skjul skoleblokken helt (fri, planleggingsdag, studiedag).
 *  - `adjust_day`:  behold "Skole"-tittel men juster start/slutt (senere oppmøte, tidlig slutt).
 */
export type SchoolDayOverrideMode = 'replace_day' | 'hide_day' | 'adjust_day'

/** Semantisk kategori for override-en — styrer label/UI men ikke selve logikken. */
export type SchoolDayOverrideKind =
  | 'exam_day'
  | 'trip_day'
  | 'activity_day'
  | 'free_day'
  | 'delayed_start'
  | 'early_end'
  | 'other'

/**
 * Valgfri markør på et importert event som gjør at skoleblokken for barnet den dagen
 * skjules/erstattes/justeres. Leses read-time av `buildBackgroundEventsForDate`.
 * Migreringsfri: ligger i `event.metadata.schoolDayOverride`.
 */
export interface SchoolDayOverride {
  mode: SchoolDayOverrideMode;
  kind: SchoolDayOverrideKind;
  /** Synlig label i kalenderen ved `replace_day` (f.eks. "Matteprøve", "Skidag"). Faller tilbake til event.title. */
  label?: string;
  /** Ved `replace_day`/`adjust_day`: ny start HH:mm. Mangler = bruk normal skoledags-start. */
  schoolStart?: string;
  /** Ved `replace_day`/`adjust_day`: ny slutt HH:mm. Mangler = bruk normal skoledags-slutt. */
  schoolEnd?: string;
  /** 0–1, for QA/logging. Påvirker ikke beslutningen. */
  confidence?: number;
}

export interface EventMetadata {
  transport?: TransportInfo;
  /** Participant person ids for multi-person activities.
   *  Backwards compatible: if absent, the app falls back to `event.personId`.
   */
  participants?: PersonId[];
  /** Optional machine-readable source for integrations (e.g. 'ai', 'template', 'import'). */
  sourceId?: string;
  /** Generated school/work blocks sit behind normal activities */
  calendarLayer?: 'foreground' | 'background';
  backgroundKind?: 'school' | 'work';
  /** Optional detail for rendering different background subtypes.
   *  `school_day_override` markerer en syntetisk bakgrunnsblokk som er bygget fra en
   *  `SchoolDayOverride` (replace_day) — brukes av UI til å vise spesialdag-label i stedet for "Skole". */
  backgroundSubkind?: 'school_day' | 'school_day_override' | 'school_lesson' | 'school_break' | 'work_day';
  /** True for all-day events — stored as 00:00–23:59 but rendered in the all-day row, never in the hourly timeline. */
  isAllDay?: boolean;
  /** YYYY-MM-DD end date for multi-day events (anchor date = start date stored in DB `date` column).
   *  Absent for single-day events. Inclusive: the event is visible on every day from anchor → endDate. */
  endDate?: string;
  /** Migreringsfri kobling til et spesifikt fag/time i barnets timeplan. */
  schoolContext?: SchoolContext;
  /**
   * Migreringsfri markør som får dagen til å avvike fra normal skoleblokk (prøve, fri, tur, senere oppmøte).
   * Leses av `buildBackgroundEventsForDate` sammen med dagens events.
   */
  schoolDayOverride?: SchoolDayOverride;
  /** Knytter en syntetisk skoleblokk til uke-overlay-kilden som ble brukt for dagen. */
  schoolWeekOverlayMeta?: {
    overlayId: string
    weekYear: number
    weekNumber: number
    dayIndex: number
  }
  /** Konkrete dagsregler fra uke-overlay (for visning i detaljsheet). */
  schoolWeekOverlayDay?: SchoolWeekOverlayDayAction
  /** Free-form metadata reserved for future automation features. */
  [key: string]: unknown;
}

export interface Event {
  id: string;
  personId: PersonId;
  title: string;
  /** Start time "HH:mm" (24h) */
  start: string;
  /** End time "HH:mm" (24h) */
  end: string;
  notes?: string;
  location?: string;
  /** Shared ID across all occurrences of a recurring event */
  recurrenceGroupId?: string;
  /** Minutes before event start to send a reminder (e.g. 15). Null/undefined = no reminder. */
  reminderMinutes?: number;
  /** Optional structured metadata for automation features (transport, source, etc.) */
  metadata?: EventMetadata;
}

/** Events for a single calendar day (date key YYYY-MM-DD) */
export interface DaySchedule {
  date: string;
  events: Event[];
}

/** Which people are selected in the filter; empty or all = "All" */
export type FilterState = PersonId[];

export interface WeekDayMeta {
  date: string;
  dayLabel: string;
  /** Abbreviation e.g. Mon, Tue */
  dayAbbr: string;
  /** Person IDs that have at least one event this day (for dots) */
  personIdsWithEvents: PersonId[];
}

/** Event with layout info for rendering (top px, height px, column for overlaps) */
export interface EventLayoutBlock extends Event {
  topPx: number;
  heightPx: number;
  columnIndex: number;
  totalColumns: number;
}

/** Drag-to-reschedule: exact times before/after so undo restores the real previous slot (avoids shiftTime clamp bugs). */
export interface DragReschedulePayload {
  prevStart: string
  prevEnd: string
  nextStart: string
  nextEnd: string
}

/** Timeline layout item: currently always a single block (columns handle overlaps). */
export type TimelineLayoutItem = {
  type: 'single';
  block: EventLayoutBlock;
};

/** Gap between events for free-time label */
export interface GapInfo {
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
  topPx: number;
  heightPx: number;
}

export interface DaySummary {
  activityCount: number;
  freeTimeMinutes: number;
  /** Next upcoming event if any */
  nextEvent: Event | null;
  /** Minutes until next event start (if today and nextEvent exists) */
  minutesUntilNext: number | null;
}

/** A date-bound to-do item that is NOT a timed calendar block. */
export interface Task {
  id: string;
  title: string;
  notes?: string;
  /** YYYY-MM-DD — which day this task belongs to */
  date: string;
  /** Optional deadline time "HH:mm" (display only, not timeline placement) */
  dueTime?: string;
  /** person_id of the family member responsible for completing this task */
  assignedToPersonId?: PersonId;
  /** person_id of the child this task concerns */
  childPersonId?: PersonId;
  /** ISO timestamp when marked complete; undefined = open */
  completedAt?: string;
  /** When true, a visible indicator marks this day in month view (open tasks only). */
  showInMonthView?: boolean;
}
