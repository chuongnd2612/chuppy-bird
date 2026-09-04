import { useCallback, useEffect, useState } from 'react';
import { applyTheme, nextTheme, readStoredTheme, storeTheme, type Theme } from '../theme.ts';

const LABEL: Record<Theme, { icon: string; title: string }> = {
  system: { icon: '◐', title: 'Theme: follow system' },
  light: { icon: '☀', title: 'Theme: light' },
  dark: { icon: '☾', title: 'Theme: dark' },
};

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());

  // While on "system", the phone can switch themes under us (at sunset, or on a
  // schedule), and the address bar colour has to follow.
  useEffect(() => {
    if (theme !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [theme]);

  const cycle = useCallback(() => {
    setTheme((current) => {
      const next = nextTheme(current);
      storeTheme(next);
      applyTheme(next);
      return next;
    });
  }, []);

  const { icon, title } = LABEL[theme];
  return (
    <button type="button" className="theme-toggle" onClick={cycle} title={title} aria-label={title}>
      {icon}
    </button>
  );
}
