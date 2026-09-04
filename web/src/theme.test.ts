import { describe, expect, it } from 'vitest';
import { isTheme, nextTheme, resolveTheme, THEME_ORDER } from './theme.ts';

describe('isTheme', () => {
  it('accepts the three states and rejects anything else', () => {
    expect(isTheme('system')).toBe(true);
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('midnight')).toBe(false);
    expect(isTheme(null)).toBe(false);
  });
});

describe('resolveTheme', () => {
  it('follows the system preference when set to system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('overrides the system preference in both directions', () => {
    // Forcing light while the phone is dark is the case a media query alone
    // cannot express.
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('nextTheme', () => {
  it('cycles through every state and returns to the start', () => {
    let theme = THEME_ORDER[0]!;
    const seen = [theme];
    for (let i = 0; i < THEME_ORDER.length; i++) {
      theme = nextTheme(theme);
      seen.push(theme);
    }
    expect(seen).toEqual(['system', 'light', 'dark', 'system']);
  });
});
