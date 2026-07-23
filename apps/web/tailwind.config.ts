import type { Config } from 'tailwindcss';

/**
 * FlowTech brand tokens — extracted from the live marketing site
 * (flowtechapps.com). Colors are exposed as CSS variables (see index.css) in
 * "R G B" channel form so Tailwind opacity modifiers (e.g. bg-accent/20) work,
 * and so a light theme can override the same names.
 */
const withAlpha = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Page + surfaces
        ink: withAlpha('--ft-ink'), // page background  #04090C
        'surface-deep': withAlpha('--ft-surface-deep'), // #060E11
        surface: withAlpha('--ft-surface'), // card         #101C22
        elevated: withAlpha('--ft-elevated'), // raised card  #0C171D
        // Text
        content: withAlpha('--ft-content'), // primary text #EEF3F4
        muted: withAlpha('--ft-muted'), // #8A969B
        subtle: withAlpha('--ft-subtle'), // #5B6B72
        // Brand accents
        accent: {
          DEFAULT: withAlpha('--ft-accent'), // teal   #0097A9
          bright: withAlpha('--ft-accent-bright'), // cyan   #2FD4E6
        },
        // Lines / hairlines
        line: withAlpha('--ft-line'),
        // Status
        success: withAlpha('--ft-success'),
        warning: withAlpha('--ft-warning'),
        danger: withAlpha('--ft-danger'),
      },
      fontFamily: {
        // Inter — the neutral grotesque used in the client-portal design.
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        tightest: '-0.02em',
        tight2: '-0.011em', // Inter looks best with a touch of negative tracking
      },
      borderRadius: {
        pill: '9999px',
        card: '14px',
      },
      boxShadow: {
        // Soft, neutral card elevation that reads well on the light page and
        // stays subtle on dark (where the border carries the edge).
        card: '0 1px 2px rgb(15 30 35 / 0.04), 0 1px 3px rgb(15 30 35 / 0.06)',
        glow: '0 0 0 1px rgb(var(--ft-accent) / 0.35), 0 8px 30px -8px rgb(var(--ft-accent) / 0.35)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.35s ease-out both',
        shimmer: 'shimmer 1.4s infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
