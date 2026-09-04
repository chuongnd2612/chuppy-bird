/**
 * Theme preference.
 *
 * Three states, not two: "system" is the default and follows the phone, which
 * on iOS and Android means the app dims with everything else in the evening.
 * An explicit choice has to beat the media query in *both* directions, which is
 * why the stylesheet carries the dark tokens twice.
 */

export type Theme = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'ado-reviewer-theme';

export function isTheme(value: unknown): value is Theme {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : 'system';
  } catch {
    // Private mode, or storage disabled. Following the system is a fine default.
    return 'system';
  }
}

export function storeTheme(theme: Theme): void {
  try {
    if (theme === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Not being able to remember the choice should not break setting it.
  }
}

/** The theme actually in effect, resolving "system" against the media query. */
export function resolveTheme(theme: Theme, prefersDark: boolean): 'light' | 'dark' {
  if (theme === 'system') return prefersDark ? 'dark' : 'light';
  return theme;
}

/** Colour behind the address bar, so it does not clash with the page. */
const THEME_COLOR = { light: '#f8f8f8', dark: '#0b0d10' } as const;

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);

  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', THEME_COLOR[resolveTheme(theme, prefersDark)]);
}

export const THEME_ORDER: Theme[] = ['system', 'light', 'dark'];

export function nextTheme(theme: Theme): Theme {
  const index = THEME_ORDER.indexOf(theme);
  return THEME_ORDER[(index + 1) % THEME_ORDER.length] ?? 'system';
}
