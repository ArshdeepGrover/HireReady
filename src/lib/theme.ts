/**
 * Theme preference.
 *
 * The chosen theme is written to <html data-theme>. Each page also runs a tiny
 * inline copy of this logic before first paint (see the <head> of each HTML
 * file) so there is no flash of the wrong palette.
 */

export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';

const STORAGE_KEY = 'hireready:theme';

/** localStorage throws in private mode in some browsers. Never let that break the page. */
function readStored(): ThemePreference | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : null;
  } catch {
    return null;
  }
}

function writeStored(value: ThemePreference): void {
  try {
    if (value === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Preference simply will not persist. Not worth surfacing.
  }
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function preference(): ThemePreference {
  return readStored() ?? 'system';
}

export function resolvedTheme(): Theme {
  const stored = readStored();
  return stored && stored !== 'system' ? stored : systemTheme();
}

function apply(pref: ThemePreference): void {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
}

export function setTheme(pref: ThemePreference): void {
  writeStored(pref);
  apply(pref);
  announce();
}

/** Flips between light and dark, dropping out of "follow system". */
export function toggleTheme(): Theme {
  const next: Theme = resolvedTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

function announce(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
  if (!button) return;
  const isDark = resolvedTheme() === 'dark';
  button.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
  button.setAttribute('aria-pressed', String(isDark));
}

/** Wires the toggle button and keeps "follow system" live. */
export function initTheme(): void {
  apply(preference());
  announce();

  const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
  button?.addEventListener('click', () => {
    toggleTheme();
  });

  // Only meaningful while the visitor has not made an explicit choice.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (preference() === 'system') announce();
  });
}
