/**
 * Synka Design System Tokens
 * 
 * This file contains all design tokens extracted from the provided design assets.
 * These tokens should be used throughout the application to maintain visual consistency.
 */

// =============================================================================
// COLOR PALETTE
// =============================================================================

export const colors = {
  // Brand Primary Colors (from logo assets)
  primary: {
    50: '#e9f1ec',    // green-50
    100: '#d6e7dc',   // green-100  
    500: '#2c6a4f',   // green-500
    600: '#1d5a3f',   // green-600
    700: '#16472f',   // green-700 (main brand green)
    800: '#0f3724',   // green-800
  },

  // Accent Colors (from logo dots)
  accent: {
    mint: {
      tint: '#d6efde',
      main: '#4f9a73',
    },
    coral: {
      tint: '#fbd9d6', 
      main: '#d27970',
    },
    sun: {
      tint: '#fbedc1',
      main: '#c69a35',
    },
    lilac: {
      tint: '#e1d8f0',
      main: '#9685c1',
    },
  },

  // Semantic Colors
  semantic: {
    red: {
      50: '#fde9e7',
      100: '#fbd9d6',
      500: '#ec6464',
      600: '#d94e4e',
      700: '#b53d3d',
    },
  },

  // Neutral Colors (warm palette)
  neutral: {
    50: '#f4f1ea',   // --bg (warm beige background)
    100: '#ffffff',  // --card (clean white)
    200: '#e3ded2',  // --line (subtle borders)
    300: '#cdc6b6',  // --line-strong (stronger borders)
    400: '#7a7d77',  // --muted (secondary text)
    500: '#3a4a42',  // --ink-soft (softer text)
    600: '#14211b',  // --ink (primary text)
  },

  // Legacy compatibility (mapping to existing Tailwind config)
  brand: {
    sky: '#e9f1ec',        // Maps to primary-50
    skyDeep: '#d6e7dc',    // Maps to primary-100
    teal: '#2c6a4f',       // Maps to primary-500
    navy: '#14211b',       // Maps to neutral-600
    sun: '#c69a35',        // Maps to accent.sun.main
  },
} as const

// =============================================================================
// TYPOGRAPHY
// =============================================================================

export const typography = {
  // Font Families
  families: {
    sans: ['"Source Sans 3"', 'system-ui', '-apple-system', 'sans-serif'],
    serif: ['Literata', 'Georgia', 'serif'],
    mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
  },

  // Font Sizes (from design assets)
  sizes: {
    display: {
      fontSize: '22px',
      lineHeight: '1.15',
      letterSpacing: '-0.02em',
      fontWeight: 700,
    },
    heading: {
      fontSize: '18px', 
      lineHeight: '1.3',
      letterSpacing: '-0.01em',
      fontWeight: 600,
    },
    subheading: {
      fontSize: '15px',
      lineHeight: '1.4',
      fontWeight: 600,
    },
    body: {
      fontSize: '14px',
      lineHeight: '1.5',
      fontWeight: 400,
    },
    bodySm: {
      fontSize: '13px',
      lineHeight: '1.45',
      fontWeight: 400,
    },
    label: {
      fontSize: '12px',
      lineHeight: '1.25',
      fontWeight: 600,
      letterSpacing: '0.005em',
    },
    caption: {
      fontSize: '11px',
      lineHeight: '1.2',
      fontWeight: 500,
      letterSpacing: '0.04em',
    },
  },
} as const

// =============================================================================
// SPACING
// =============================================================================

export const spacing = {
  // Base spacing unit (4px)
  unit: 4,

  // Semantic spacing scale
  xs: '4px',    // 1 unit
  sm: '8px',    // 2 units  
  md: '12px',   // 3 units
  lg: '16px',   // 4 units
  xl: '20px',   // 5 units
  '2xl': '24px', // 6 units
  '3xl': '32px', // 8 units
  '4xl': '40px', // 10 units

  // Component-specific spacing
  button: {
    paddingX: '18px',
    paddingY: '11px',
    gap: '8px',
  },
  card: {
    padding: '24px 28px 28px',
    gap: '18px',
  },
  field: {
    paddingX: '12px',
    paddingY: '0px',
    gap: '8px',
  },
} as const

// =============================================================================
// BORDER RADIUS
// =============================================================================

export const borderRadius = {
  // From design assets
  none: '0px',
  sm: '6px',      // checkboxes/radio
  md: '12px',     // buttons, form fields
  lg: '14px',     // blocks, medium cards
  xl: '20px',     // large surface cards
  '2xl': '28px',  // bottom sheets
  full: '9999px', // pills, chips, avatars
} as const

// =============================================================================
// SHADOWS
// =============================================================================

export const shadows = {
  // From design assets
  card: '0 1px 2px rgb(20 33 27 / 0.04), 0 8px 24px -10px rgb(20 33 27 / 0.08)',
  press: 'inset 0 1px 2px rgb(0 0 0 / 0.18)',
  planner: '0 2px 8px -1px rgb(0 0 0 / 0.10), 0 1px 3px -1px rgb(0 0 0 / 0.07)',
  plannerSm: '0 1px 4px -1px rgb(0 0 0 / 0.09)',
  sheet: '0 -4px 32px -4px rgb(0 0 0 / 0.10), 0 -1px 4px 0 rgb(0 0 0 / 0.05)',
  float: '0 4px 20px -4px rgb(0 0 0 / 0.12), 0 2px 8px -2px rgb(0 0 0 / 0.06)',
} as const

// =============================================================================
// MOTION & ANIMATION
// =============================================================================

export const motion = {
  // Timing
  fast: '120ms cubic-bezier(0.2, 0, 0, 1)',
  normal: '200ms ease',
  slow: '300ms ease',

  // Loading dots animation
  loadingDots: {
    duration: '1s',
    timing: 'ease-in-out',
  },
} as const

// =============================================================================
// Z-INDEX SCALE
// =============================================================================

export const zIndex = {
  base: 0,
  sticky: 10,
  bottomNav: 20,
  sheetOverlay: 30,
  sheet: 40,
  undo: 50,
  toast: 60,
} as const

// =============================================================================
// COMPONENT-SPECIFIC TOKENS
// =============================================================================

export const components = {
  // Button System (from design assets)
  button: {
    height: {
      sm: '36px',
      md: '40px', 
      lg: '44px',
    },
    borderRadius: borderRadius.md,
    fontSize: typography.sizes.body.fontSize,
    fontWeight: typography.sizes.body.fontWeight,
    letterSpacing: 'normal',
    transition: motion.fast,
    gap: spacing.button.gap,
  },

  // Form Fields
  field: {
    height: '40px',
    borderRadius: borderRadius.md,
    fontSize: typography.sizes.body.fontSize,
    paddingX: spacing.field.paddingX,
    transition: motion.fast,
    focusRing: '0 0 0 3px rgb(28 90 63 / 0.15)',
    errorRing: '0 0 0 3px rgb(217 78 78 / 0.15)',
  },

  // Cards
  card: {
    borderRadius: borderRadius.xl,
    padding: spacing.card.padding,
    shadow: shadows.card,
    border: `1px solid ${colors.neutral[200]}`,
  },

  // Chips/Tags
  chip: {
    borderRadius: borderRadius.full,
    padding: '6px 14px 6px 6px',
    fontSize: typography.sizes.label.fontSize,
    fontWeight: typography.sizes.label.fontWeight,
    gap: '8px',
    avatarSize: '22px',
  },

  // Bottom Navigation
  bottomNav: {
    height: '72px',
    tabRadius: borderRadius.lg,
    activeBackground: colors.primary[50],
    activeBorder: `2px solid ${colors.primary[700]}`,
  },

  // Toast/Notifications
  toast: {
    borderRadius: borderRadius.md,
    padding: '10px 16px 10px 14px',
    gap: '10px',
    fontSize: typography.sizes.body.fontSize,
    shadow: '0 12px 32px -8px rgb(20 33 27 / 0.35)',
  },
} as const

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type ColorToken = keyof typeof colors
export type TypographySize = keyof typeof typography.sizes  
export type SpacingToken = keyof typeof spacing
export type BorderRadiusToken = keyof typeof borderRadius
export type ShadowToken = keyof typeof shadows
export type ZIndexToken = keyof typeof zIndex
