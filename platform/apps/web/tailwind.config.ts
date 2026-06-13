import type { Config } from 'tailwindcss';
import preset from '@cafeos/ui/tailwind-preset';

export default {
  presets: [preset as Config],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
} satisfies Config;
