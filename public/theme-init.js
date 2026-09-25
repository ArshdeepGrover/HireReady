/**
 * Applies the saved theme before first paint, so there is no flash of the wrong
 * palette. Loaded as a blocking classic script in <head>.
 *
 * Kept as a separate file rather than an inline script so the site can ship a
 * strict Content-Security-Policy without needing 'unsafe-inline' or a nonce.
 * Keep it tiny and dependency-free.
 */
(function () {
  try {
    var saved = localStorage.getItem('hireready:theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch (error) {
    /* Storage blocked. The CSS prefers-color-scheme fallback handles it. */
  }
})();
