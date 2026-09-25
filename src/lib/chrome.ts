/** Page furniture shared by every entry point. */

import { initTheme } from './theme';

/** Adds a border to the sticky header only once the page has scrolled. */
function initStickyHeader(): void {
  const header = document.querySelector<HTMLElement>('[data-site-header]');
  if (!header) return;

  const update = (): void => {
    header.dataset['stuck'] = String(window.scrollY > 4);
  };

  update();
  window.addEventListener('scroll', update, { passive: true });
}

function initYear(): void {
  for (const node of document.querySelectorAll('[data-year]')) {
    node.textContent = String(new Date().getFullYear());
  }
}

export function initChrome(): void {
  initTheme();
  initStickyHeader();
  initYear();
}
