/**
 * Synka Design System — shared Tailwind class strings.
 *
 * Import these constants instead of repeating long class lists inline.
 * All strings are pure Tailwind utility classes; no custom CSS required.
 *
 * Visual direction: warm · playful · family-friendly · Nordic · polished
 */

// ── Typography ────────────────────────────────────────────────────────────────
/** Page/sheet title (serif display, 22px) */
export const typDisplay = 'font-display text-display font-bold text-neutral-600'
/** Screen section heading (17px semibold) */
export const typHeading = 'text-heading font-semibold text-neutral-600'
/** Sub-section or card title (15px semibold) */
export const typSubheading = 'text-subheading font-semibold text-neutral-500'
/** Standard body copy (14px) */
export const typBody = 'text-body text-neutral-500'
/** Secondary / supporting body (14px muted) */
export const typBodyMuted = 'text-body text-neutral-400'
/** Small body (13px) */
export const typBodySm = 'text-body-sm text-neutral-500'
/** Form field labels (12px medium) */
export const typLabel = 'text-label font-medium text-neutral-500'
/** Timestamps, metadata, captions (11px) */
export const typCaption = 'text-caption text-neutral-400'
/** Section separator label — ALL CAPS (11px) */
export const typSectionCap = 'text-caption font-semibold uppercase tracking-wider text-neutral-400'

// ── Buttons — full-width (sheets & forms) ─────────────────────────────────────
// Use these for primary actions inside sheets and form footers.

const _btnBase =
  'inline-flex items-center justify-center font-semibold transition-all duration-120 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-offset-2 touch-manipulation select-none'

/** Primary CTA — full width, brand green fill */
export const btnPrimary =
  `${_btnBase} w-full rounded-md bg-primary-600 py-[11px] text-[14px] text-neutral-100 shadow-card hover:bg-primary-700 active:bg-primary-800 active:shadow-press focus:ring-primary-500`

/** Secondary CTA — full width, outlined */
export const btnSecondary =
  `${_btnBase} w-full rounded-md border border-primary-700 bg-transparent py-[11px] text-[14px] text-primary-700 hover:bg-primary-50 active:bg-primary-100 focus:ring-primary-500`

/** Destructive action — full width, red fill */
export const btnDanger =
  `${_btnBase} w-full rounded-md bg-semantic-red-500 py-[11px] text-[14px] font-semibold text-neutral-100 hover:bg-semantic-red-600 active:bg-semantic-red-700 focus:ring-semantic-red-500`

/** Neutral dismiss — full width, warm fill */
export const btnNeutral =
  `${_btnBase} w-full rounded-md bg-neutral-200 py-[11px] text-[14px] text-neutral-600 hover:bg-neutral-300 active:bg-neutral-400 focus:ring-neutral-300`

// ── Buttons — inline / compact ────────────────────────────────────────────────

/** Small brand-green add-button (screen headers, FAB-style) */
export const btnPrimaryPill =
  `${_btnBase} rounded-full bg-primary-600 px-4 py-1.5 text-body-sm text-neutral-100 shadow-card hover:bg-primary-700 active:bg-primary-800 active:shadow-press focus:ring-primary-500`

/** Small outlined add-button (secondary header action) */
export const btnSecondaryPill =
  `${_btnBase} rounded-full border border-primary-600 px-4 py-1.5 text-body-sm text-primary-600 hover:bg-primary-50 active:bg-primary-100 focus:ring-primary-500`

/** Compact row action — ghost chip (Rediger, etc.) */
export const btnRowAction =
  `${_btnBase} rounded-md border border-neutral-200 bg-neutral-100 px-2.5 py-1 text-caption font-medium text-neutral-500 hover:bg-neutral-200 hover:text-neutral-600 focus:ring-neutral-300`

/** Text-only link button */
export const btnGhost =
  `${_btnBase} rounded-md px-3 py-1.5 text-label font-medium text-primary-600 hover:bg-primary-50 focus:ring-primary-500`

// ── Inputs ────────────────────────────────────────────────────────────────────
/** Standard text input — use on all form fields */
export const inputBase =
  'w-full rounded-md border border-neutral-200 bg-neutral-50 px-3.5 py-3 text-body text-neutral-600 placeholder:text-neutral-400 outline-none transition-all duration-120 focus:border-primary-600 focus:bg-neutral-100 focus:ring-2 focus:ring-primary-600/15 disabled:opacity-60'

/** Multi-line textarea */
export const textareaBase =
  'w-full rounded-md border border-neutral-200 bg-neutral-50 px-3.5 py-3 text-body text-neutral-600 placeholder:text-neutral-400 outline-none resize-none transition-all duration-120 focus:border-primary-600 focus:bg-neutral-100 focus:ring-2 focus:ring-primary-600/15'

/** Select / dropdown — matches inputBase */
export const selectBase =
  'w-full rounded-md border border-neutral-200 bg-neutral-50 px-3.5 py-3 text-body text-neutral-600 outline-none transition-all duration-120 focus:border-primary-600 focus:bg-neutral-100 focus:ring-2 focus:ring-primary-600/15'

/** Field label (sits above the input) */
export const inputLabel = 'mb-1.5 block text-label font-medium text-neutral-500'
/** Hint text below input */
export const inputHint = 'mt-1 text-caption text-neutral-400'
/** Validation error below input */
export const inputError = 'mt-1 text-caption text-semantic-red-600'

// ── Bottom sheet container ─────────────────────────────────────────────────────
/** Outer sheet panel — pair with `rounded-t-sheet shadow-sheet` */
export const sheetPanel =
  'pointer-events-auto flex w-full min-h-[52dvh] max-h-[min(92dvh,920px)] flex-col overflow-y-auto overflow-x-hidden rounded-t-sheet bg-neutral-100 shadow-sheet scrollbar-none'

/** Sticky drag-handle bar at top of sheet */
export const sheetHandle =
  'sticky top-0 z-10 flex shrink-0 justify-center bg-neutral-100 pt-2.5 pb-1'

/** The drag indicator pill */
export const sheetHandleBar = 'h-1 w-10 rounded-full bg-neutral-200'

/** Body padding for form sheets */
export const sheetFormBody =
  'flex min-h-0 flex-1 flex-col px-5 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-2 space-y-5'

/** Body padding for detail / read sheets */
export const sheetDetailBody =
  'flex min-h-0 flex-1 flex-col px-5 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-1'

// ── Cards & surfaces ──────────────────────────────────────────────────────────
/** Primary content card (warm white, rounded-card) */
export const cardBase = 'rounded-card border border-neutral-200 bg-neutral-100 shadow-card'

/** Settings-style section card */
export const cardSection = 'rounded-xl border border-neutral-200 bg-neutral-100 shadow-soft'

/** Inset / nested surface (slightly recessed, warm tint) */
export const cardInset = 'rounded-lg border border-neutral-200 bg-neutral-50'

/** Grouped list container (task groups, event lists) */
export const cardList = 'rounded-xl border border-neutral-200 bg-neutral-100'

// ── Sheet typography helpers ───────────────────────────────────────────────────
/** Primary title inside a sheet (h2) */
export const sheetTitle = 'text-[18px] font-semibold text-neutral-600'
/** Date / context subtitle below a sheet title */
export const sheetSubtitle = 'text-body-sm text-neutral-400'

// ── Progressive disclosure toggle ─────────────────────────────────────────────
/** Inline "Mer / Skjul" toggle — consistent across all sheets */
export const btnDisclosure =
  'inline-flex items-center gap-1.5 text-label font-medium text-primary-600 hover:text-primary-700 transition'

// ── Person selector chips (inside sheets) ─────────────────────────────────────
/** Selected person chip */
export const personChipActive =
  'rounded-full px-3 py-1 text-caption font-semibold bg-primary-700 text-neutral-100 transition'
/** Unselected person chip */
export const personChipInactive =
  'rounded-full px-3 py-1 text-caption font-medium bg-neutral-200 text-neutral-500 hover:bg-neutral-300 transition'

// ── Custom dropdown trigger (acts like a <select> but needs chevron) ───────────
/** Button that opens a custom listbox dropdown — visually matches inputBase */
export const dropdownTrigger =
  'flex w-full items-center justify-between rounded-md border border-neutral-200 bg-neutral-50 px-3.5 py-3 text-body text-neutral-600 outline-none transition-all duration-120 hover:border-neutral-300 focus:border-primary-600 focus:ring-2 focus:ring-primary-600/15'

// ── Screen layout ──────────────────────────────────────────────────────────────
/** Outer screen column wrapper */
export const screenWrapper =
  'flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden'

/** Scrollable inner column */
export const screenInner =
  'flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto scrollbar-none'

/** Horizontal padding for screen content (4 = 16px) */
export const screenPad = 'px-4'

/** Screen section header row (title left, action right) */
export const screenHeaderRow = 'flex items-center justify-between px-4 pb-4 pt-5'

/** Vertical gap between screen sections */
export const sectionGap = 'space-y-6'
