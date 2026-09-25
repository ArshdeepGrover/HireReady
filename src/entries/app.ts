/** Entry point for /resume-score — the analyser. */

import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import '../styles/app.css';
import '../styles/print.css';

import { initChrome } from '@lib/chrome';
import { initApp } from '@ui/app';

initChrome();

try {
  initApp();
} catch (error) {
  // A boot failure would otherwise leave a silent, dead page.
  console.error('HireReady failed to start.', error);
  const status = document.querySelector('[data-status]');
  if (status) {
    status.textContent =
      'Something went wrong starting the checker. Reload the page, and if it keeps happening please report it.';
    (status as HTMLElement).dataset['tone'] = 'error';
  }
}
