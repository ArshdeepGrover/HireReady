/**
 * Theme preference.
 *
 * Light is the default. The OS setting is deliberately ignored: visitors only
 * get dark mode by asking for it with the toggle. The chosen theme is written to
 * <html data-theme>, and /theme-init.js applies the stored value before first
 * paint so there is no flash of the wrong palette.
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'hireready:theme';
const DEFAULT_THEME: Theme = 'light';

/** Browser UI colour per theme. Must match --paper in tokens.css. */
const BROWSER_UI_COLOR: Record<Theme, string> = {
  light: '#f4f2ec',
  dark: '#0e1014',
};

/** localStorage throws in private mode in some browsers. Never let that break the page. */
function readStored(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function writeStored(value: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Preference simply will not persist. Not worth surfacing.
  }
}

export function resolvedTheme(): Theme {
  return readStored() ?? DEFAULT_THEME;
}

function apply(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', BROWSER_UI_COLOR[theme]);
}

export function setTheme(theme: Theme): void {
  writeStored(theme);
  apply(theme);
  announce();
}

/** Flips between light and dark. */
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

/** Wires the toggle button. */
export function initTheme(): void {
  apply(resolvedTheme());
  announce();

  const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
  button?.addEventListener('click', () => {
    toggleTheme();
  });
}
