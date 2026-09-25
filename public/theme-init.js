/**
 * Applies the saved theme before first paint, so there is no flash of the wrong
 * palette. Loaded as a blocking classic script in <head>.
 *
 * Light is the default; the OS preference is not consulted. Dark only applies
 * when the visitor picked it with the toggle.
 *
 * Kept as a separate file rather than an inline script so the site can ship a
 * strict Content-Security-Policy without needing 'unsafe-inline' or a nonce.
 * Keep it tiny and dependency-free.
 */
(function () {
  var theme = 'light';
  try {
    var saved = localStorage.getItem('hireready:theme');
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch (error) {
    /* Storage blocked. Fall back to the light default. */
  }
  document.documentElement.setAttribute('data-theme', theme);

  if (theme === 'dark') {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#0e1014');
  }
})();
