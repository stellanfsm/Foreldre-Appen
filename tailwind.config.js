/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Synka Design System Colors (from design assets)
        primary: {
          50: '#e9f1ec',    // green-50
          100: '#d6e7dc',   // green-100  
          500: '#2c6a4f',   // green-500
          600: '#1d5a3f',   // green-600
          700: '#16472f',   // green-700 (main brand green)
          800: '#0f3724',   // green-800
        },
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
        semantic: {
          red: {
            50: '#fde9e7',
            100: '#fbd9d6',
            500: '#ec6464',
            600: '#d94e4e',
            700: '#b53d3d',
          },
        },
        neutral: {
          50: '#f4f1ea',   // warm beige background
          100: '#ffffff',  // clean white
          200: '#e3ded2',  // subtle borders
          300: '#cdc6b6',  // stronger borders
          400: '#7a7d77',  // secondary text
          500: '#3a4a42',  // softer text
          600: '#14211b',  // primary text
        },
        // Person-coded: tint (bg) and accent (border/active)
        emma: { tint: '#dcfce7', accent: '#16a34a' }, // fresh green
        leo: { tint: '#fef9c3', accent: '#ca8a04' }, // warm amber
        mom: { tint: '#fef2f2', accent: '#e11d48' }, // soft rose
        dad: { tint: '#ffedd5', accent: '#ea580c' }, // orange
        family: { tint: '#f5f5f4', accent: '#57534e' }, // warm neutral
        // Legacy brand colors (mapped to new system)
        brandSky: '#e9f1ec',        // Maps to primary-50
        brandSkyDeep: '#d6e7dc',    // Maps to primary-100
        brandTeal: '#2c6a4f',       // Maps to primary-500
        brandNavy: '#14211b',       // Maps to neutral-600
        brandSun: '#c69a35',        // Maps to accent.sun.main
        // RGB triplets in index.css so `bg-surface/95` etc. work with time-of-day tint
        surface: 'rgb(var(--color-surface-rgb) / <alpha-value>)',
        muted: '#7a7d77',
      },
      fontFamily: {
        sans: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
        display: ['Literata', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // Existing utility sizes (keep)
        'micro': ['0.75rem', { lineHeight: '1.25', letterSpacing: '0.05em' }],
        'rail': ['0.6875rem', { lineHeight: '1.25' }],
        // Semantic type scale (new — use these going forward)
        'display': ['1.375rem', { lineHeight: '1.15', letterSpacing: '-0.01em' }], // 22px
        'heading': ['1.0625rem', { lineHeight: '1.3' }],                           // 17px
        'subheading': ['0.9375rem', { lineHeight: '1.4' }],                        // 15px
        'body': ['0.875rem', { lineHeight: '1.5' }],                               // 14px
        'body-sm': ['0.8125rem', { lineHeight: '1.45' }],                          // 13px
        'label': ['0.75rem', { lineHeight: '1.25' }],                              // 12px
        'caption': ['0.6875rem', { lineHeight: '1.2' }],                           // 11px
      },
      borderRadius: {
        'none': '0px',
        'sm': '6px',      // checkboxes/radio
        'md': '12px',     // buttons, form fields
        'lg': '14px',     // blocks, medium cards
        'xl': '20px',     // large surface cards
        '2xl': '28px',    // bottom sheets
        'full': '9999px', // pills, chips, avatars
        // Legacy aliases
        'card': '20px',    // large surface cards
        'block': '14px',   // activity blocks, medium cards (updated to lg)
        'pill': '9999px',  // FAB-style add buttons, person chips
        'sheet': '28px',   // bottom sheet top radius
      },
      boxShadow: {
        // From design assets - using brand ink color for consistency
        card: '0 1px 2px rgb(20 33 27 / 0.04), 0 8px 24px -10px rgb(20 33 27 / 0.08)',
        press: 'inset 0 1px 2px rgb(0 0 0 / 0.18)',
        planner: '0 2px 8px -1px rgb(0 0 0 / 0.10), 0 1px 3px -1px rgb(0 0 0 / 0.07)',
        'planner-sm': '0 1px 4px -1px rgb(0 0 0 / 0.09)',
        'planner-press': '0 1px 2px 0 rgb(0 0 0 / 0.08)',
        // New elevation tokens
        'sheet': '0 -4px 32px -4px rgb(0 0 0 / 0.10), 0 -1px 4px 0 rgb(0 0 0 / 0.05)',
        'float': '0 4px 20px -4px rgb(0 0 0 / 0.12), 0 2px 8px -2px rgb(0 0 0 / 0.06)',
        // Legacy compatibility
        soft: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
      },
    },
  },
  plugins: [],
}
