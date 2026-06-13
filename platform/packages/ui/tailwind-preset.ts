import type { Config } from 'tailwindcss';

/**
 * Cafe OS — "Roasted Daylight" Tailwind preset.
 * Shared across all surfaces. Dark-roast (KDS) is handled via the
 * `[data-skin="roast"]` overrides in tokens.css, which remap the CSS vars.
 */
const preset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: 'var(--paper)', 2: 'var(--paper-2)', 3: 'var(--paper-3)' },
        ink: { DEFAULT: 'var(--ink)', 2: 'var(--ink-2)', 3: 'var(--ink-3)' },
        line: { DEFAULT: 'var(--line)', 2: 'var(--line-2)' },
        turmeric: { DEFAULT: 'var(--turmeric)', d: 'var(--turmeric-d)', l: 'var(--turmeric-l)' },
        cardamom: { DEFAULT: 'var(--cardamom)', d: 'var(--cardamom-d)' },
        clay: { DEFAULT: 'var(--clay)', l: 'var(--clay-l)' },
        berry: 'var(--berry)',
        gold: 'var(--gold)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Fraunces', 'serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      borderRadius: { sm: '8px', DEFAULT: '14px', lg: '22px', xl: '30px' },
      boxShadow: {
        1: 'var(--sh-1)',
        2: 'var(--sh-2)',
        3: 'var(--sh-3)',
        glow: 'var(--sh-glow)',
      },
    },
  },
};

export default preset;
