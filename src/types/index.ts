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
  /** Optional detail for rendering different background subtypes. */
  backgroundSubkind?: 'school_day' | 'school_lesson' | 'school_break' | 'work_day';
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
}
