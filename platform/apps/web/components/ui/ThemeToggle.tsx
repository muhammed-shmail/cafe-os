'use client';
import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

type Theme = 'light' | 'dark';

/** Reads/writes the persisted theme and toggles `data-theme` on <html>.
 *  The initial value is applied pre-paint by the inline script in layout.tsx,
 *  so this only keeps React state in sync and handles the click. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    setThemeState(current);
  }, []);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    document.documentElement.setAttribute('data-theme', next);
    if (next === 'light') document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('cafe-theme', next); } catch { /* private mode */ }
  };

  return { theme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark'), setTheme };
}

/** Icon button that flips light/dark. Square 44px touch target, labelled. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      className={`btn btn-icon btn-sm ${className}`}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={dark}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      {dark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </button>
  );
}
