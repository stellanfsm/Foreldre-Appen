import logoGreen from '../../assets/synka-logo-green.svg'
import logoBeige from '../../assets/synka-logo-beige.svg'
import logoBlack from '../../assets/synka-logo-black.svg'
import wordmarkGreen from '../../assets/synka-wordmark-green.svg'
import wordmarkBeige from '../../assets/synka-wordmark-beige.svg'

export type SynkaLogoVariant = 'green' | 'beige' | 'black' | 'text-green' | 'text-beige'

interface SynkaLogoProps {
  variant?: SynkaLogoVariant
  /** Width in px. Height is calculated automatically from the SVG aspect ratio. */
  size?: number
  className?: string
}

// Actual SVG viewBox ratios (w/h) from the source files
const ASPECT = {
  green:       798 / 822,
  beige:       798 / 822,
  black:       456 / 470,
  'text-green': 1256 / 508,
  'text-beige': 1256 / 508,
} as const

const SRCS: Record<SynkaLogoVariant, string> = {
  green:       logoGreen,
  beige:       logoBeige,
  black:       logoBlack,
  'text-green': wordmarkGreen,
  'text-beige': wordmarkBeige,
}

export function SynkaLogo({ variant = 'green', size = 120, className = '' }: SynkaLogoProps) {
  return (
    <img
      src={SRCS[variant]}
      alt="Synka"
      width={size}
      height={Math.round(size / ASPECT[variant])}
      className={className}
      draggable={false}
    />
  )
}

// ─── Convenience components ────────────────────────────────────────────────────

export const LogoSizes = {
  xs:   24,
  sm:   32,
  md:   48,
  lg:   64,
  xl:   96,
  '2xl': 120,
  '3xl': 160,
} as const

/** Square icon badge at a named size */
export function SynkaLogoIcon({
  size = 'md',
  className = '',
}: {
  size?: keyof typeof LogoSizes
  className?: string
}) {
  return (
    <SynkaLogo
      variant="green"
      size={LogoSizes[size]}
      className={className}
    />
  )
}

/** Horizontal "synka." wordmark */
export function SynkaWordmark({
  variant = 'green',
  width = 120,
  className = '',
}: {
  variant?: 'green' | 'beige'
  width?: number
  className?: string
}) {
  return (
    <SynkaLogo
      variant={`text-${variant}`}
      size={width}
      className={className}
    />
  )
}
