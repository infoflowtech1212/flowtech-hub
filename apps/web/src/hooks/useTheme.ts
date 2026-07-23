import { useCallback, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';
// v4: dark is the default. Bumping the key resets any stale 'light' choice from
// an earlier key so the Hub opens dark; the user's future toggle still sticks.
const KEY = 'ft-theme-v4';

/**
 * Theme toggle. Dark is the default; the choice persists and reflects on
 * <html data-theme> so both Tailwind and CSS vars follow.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return stored === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  return { theme, toggle, setTheme };
}
