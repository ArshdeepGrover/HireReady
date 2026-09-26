/**
 * Interaction checks for the analyser page.
 *
 * Runs inside an already-booted /resume-score.html and drives the real DOM:
 * filters, collapsing, jump links, the score delta and read progress can only
 * break in a browser, so they are exercised in one.
 *
 * Loaded and invoked by scripts/verify-ui.mjs over the DevTools Protocol, which
 * uses real time. Do not run this under --virtual-time-budget: Chrome advances
 * virtual time by jumping to the next pending timer, which starves the pdf.js
 * worker of the real time it needs.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];

/** Polls until true, or gives up. Real time, so polling is harmless here. */
async function until(predicate, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (predicate()) return true;
    } catch {
      /* the DOM may not be there yet */
    }
    await sleep(40);
  }
  return false;
}

export async function run() {
  const lines = [];
  let failures = 0;

  const log = (message) => lines.push(message);
  const check = (label, ok, detail = '') => {
    if (ok) {
      log(`ok    ${label}`);
    } else {
      failures += 1;
      log(`FAIL  ${label}${detail ? ` ${detail}` : ''}`);
    }
  };

  try {
    if (!(await until(() => qa('.check').length > 0))) {
      throw new Error('the app never rendered a report');
    }

    /* ---------------- boot ---------------- */

    log('### boot');
    check('no boot error', !/went wrong starting/i.test(q('[data-status]')?.textContent ?? ''));
    check('report visible', q('[data-report]').hidden === false);
    // Read straight away, with no wait: the number must be right even if the
    // count-up animation's frames never run.
    check(
      'score is a number',
      /^\d+$/.test(q('[data-score]').textContent.trim()),
      JSON.stringify(q('[data-score]').textContent),
    );
    check('progress starts hidden', q('[data-progress]').hidden === true);
    check('score delta starts hidden', q('[data-score-delta]').hidden === true);
    log('');

    /* ---------------- collapsible groups ---------------- */

    log('### check groups');
    const groups = qa('details.check-group');
    check('groups are <details>', groups.length >= 4, `got ${groups.length}`);
    check(
      'every group carries its category',
      groups.every((group) => Boolean(group.dataset.category)),
    );

    const hasProblems = (group) =>
      Boolean(group.querySelector('.check[data-state="fail"], .check[data-state="warn"]'));
    const problemGroups = groups.filter(hasProblems);
    const cleanGroups = groups.filter((group) => !hasProblems(group));

    check(
      'groups with problems start open',
      problemGroups.length > 0 && problemGroups.every((group) => group.open),
      `${problemGroups.filter((group) => !group.open).length} were closed`,
    );
    check(
      'clean groups start collapsed',
      cleanGroups.every((group) => !group.open),
      `${cleanGroups.filter((group) => group.open).length} were open`,
    );
    check(
      'a group with problems shows a count of what to fix',
      problemGroups.every((group) =>
        /\d+ to fix/.test(group.querySelector('.check-group__flag')?.textContent ?? ''),
      ),
    );

    // Collapsing must survive a re-score, or typing would keep undoing it.
    const collapsed = problemGroups[0];
    const collapsedCategory = collapsed.dataset.category;
    collapsed.open = false;
    collapsed.dispatchEvent(new Event('toggle'));
    log('');

    /* ---------------- score delta ---------------- */

    log('### score delta');
    // Halving the resume is guaranteed to move the score, which is what a delta needs.
    const resumeInput = q('[data-resume-input]');
    resumeInput.value = resumeInput.value.slice(0, Math.floor(resumeInput.value.length * 0.5));
    resumeInput.dispatchEvent(new Event('input', { bubbles: true }));

    const deltaShown = await until(() => q('[data-score-delta]').hidden === false, 6000);
    const delta = q('[data-score-delta]');
    check('delta appears after editing the same resume', deltaShown);
    check(
      'delta reads as a signed number',
      /^[+\u2212]\d+$/.test(delta.textContent.trim().split(/\s/)[0] ?? ''),
      JSON.stringify(delta.textContent),
    );
    check('delta records a direction', ['up', 'down'].includes(delta.dataset.direction ?? ''));
    check(
      'a collapsed group stayed collapsed through the re-score',
      q(`details.check-group[data-category="${collapsedCategory}"]`)?.open === false,
    );
    log('');

    /* ---------------- filters ---------------- */

    log('### filters');
    const chipFor = (id) => q(`[data-check-filter] .chip[data-filter="${id}"]`);
    const pressed = (id) => chipFor(id)?.getAttribute('aria-pressed') === 'true';

    check('three filter chips', qa('[data-check-filter] .chip').length === 3);
    check('"all" is pressed to begin with', pressed('all'));
    check(
      'each chip shows a count',
      qa('[data-check-filter] .chip').every((chip) =>
        /^\d+$/.test(chip.querySelector('.chip__count')?.textContent ?? ''),
      ),
    );

    // Held across a redraw on purpose: rebuilt chips would lose keyboard focus.
    const todoChipBefore = chipFor('todo');
    todoChipBefore.click();
    await until(() => pressed('todo'), 4000);
    check('the chips are updated in place, not replaced', chipFor('todo') === todoChipBefore);
    check('"needs work" becomes the pressed chip', pressed('todo'));

    const shownForTodo = qa('.check');
    check(
      '"needs work" hides passing checks',
      shownForTodo.length > 0 &&
        shownForTodo.every((row) => ['fail', 'warn'].includes(row.dataset.state)),
      `${shownForTodo.filter((row) => !['fail', 'warn'].includes(row.dataset.state)).length} others shown`,
    );
    check(
      'a filtered view expands every group it shows',
      qa('details.check-group').every((group) => group.open),
    );

    chipFor('pass').click();
    await until(() => pressed('pass'), 4000);
    const shownForPass = qa('.check');
    check(
      '"passing" hides everything else',
      shownForPass.length > 0 && shownForPass.every((row) => row.dataset.state === 'pass'),
      `${shownForPass.filter((row) => row.dataset.state !== 'pass').length} others shown`,
    );
    log('');

    /* ---------------- action -> check navigation ---------------- */

    log('### jump to a check');
    const jump = q('[data-actions] [data-jump]');
    check('actions carry a jump link', Boolean(jump));
    const targetId = jump.dataset.jump;
    jump.click();

    const selector = `.check[data-check-id="${CSS.escape(targetId)}"]`;
    const landed = await until(() => Boolean(q(selector)), 4000);
    check('jumping reveals the check even from a filtered view', landed);
    const target = q(selector);
    check('jumping clears the filter', pressed('all'));
    check('the target group is open', target?.closest('details.check-group')?.open === true);
    check('the target is highlighted', target?.dataset.flash === 'true');
    check('the target takes focus', document.activeElement === target);
    log('');

    /* ---------------- print expands everything ---------------- */

    log('### print');
    // A collapsed <details> would be missing from the PDF, and "Save as PDF" is
    // how a report leaves the app.
    const toCollapse = qa('details.check-group').find((group) => group.open);
    toCollapse.open = false;
    toCollapse.dispatchEvent(new Event('toggle'));
    window.dispatchEvent(new Event('beforeprint'));
    check(
      'beforeprint expands every group',
      qa('details.check-group').every((group) => group.open),
    );
    window.dispatchEvent(new Event('afterprint'));
    await sleep(50);
    check(
      'afterprint restores the collapsed group',
      q(`details.check-group[data-category="${toCollapse.dataset.category}"]`)?.open === false,
    );
    log('');

    /* ---------------- job posting ---------------- */

    log('### job posting');
    q('[data-tab="posting"]').click();
    q('[data-sample-posting]').click();
    await until(() => q('[data-match-panel]').hidden === false, 5000);
    check('match panel shown', q('[data-match-panel]').hidden === false);
    check('keyword chips rendered', qa('[data-match-body] .keyword').length > 0);
    const copyMissing = q('[data-copy-missing]');
    check('copy-missing button offered', Boolean(copyMissing));
    check(
      'copy-missing names how many',
      /Copy the \d+ missing terms/.test(copyMissing?.textContent ?? ''),
      JSON.stringify(copyMissing?.textContent),
    );
    log('');

    /* ---------------- read progress on a real PDF ---------------- */

    log('### read progress');
    q('[data-tab="resume"]').click();

    const response = await fetch('/__fixtures/single-column.pdf');
    const file = new File([await response.blob()], 'single-column.pdf', {
      type: 'application/pdf',
    });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const fileInput = q('[data-file-input]');
    fileInput.files = transfer.files;

    const progressNode = q('[data-progress]');
    const statusNode = q('[data-status]');
    const seen = {
      progress: false,
      indeterminate: false,
      determinate: false,
      pageStatus: false,
      busyDropzone: false,
      ariaBusy: false,
    };
    const observer = new MutationObserver(() => {
      if (!progressNode.hidden) seen.progress = true;
      if (progressNode.dataset.indeterminate === 'true') seen.indeterminate = true;
      if (progressNode.hasAttribute('aria-valuenow')) seen.determinate = true;
      if (/page \d+ of \d+|- \d+ pages?/i.test(statusNode.textContent ?? '')) {
        seen.pageStatus = true;
      }
      if (q('[data-dropzone]').disabled) seen.busyDropzone = true;
      if (q('[data-report]').getAttribute('aria-busy') === 'true') seen.ariaBusy = true;
    });
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });

    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    const parsed = await until(
      () => /single-column\.pdf/.test(q('[data-report-meta]')?.textContent ?? ''),
      30000,
    );
    observer.disconnect();

    check('the PDF was parsed and reported', parsed, JSON.stringify(statusNode.textContent));
    check('progress bar was shown', seen.progress);
    check('progress started indeterminate', seen.indeterminate);
    check('progress became determinate once pages were known', seen.determinate);
    check('the status line named the pages', seen.pageStatus);
    check('the dropzone was disabled while reading', seen.busyDropzone);
    check('the report was marked aria-busy while reading', seen.ariaBusy);
    check('progress is hidden again afterwards', progressNode.hidden === true);
    check('the dropzone is re-enabled', q('[data-dropzone]').disabled === false);
    check('aria-busy was cleared', q('[data-report]').hasAttribute('aria-busy') === false);
    check(
      'a freshly loaded document shows no misleading delta',
      q('[data-score-delta]').hidden === true,
    );
    check(
      'the score came through',
      /^\d+$/.test(q('[data-score]').textContent.trim()),
      JSON.stringify(q('[data-score]').textContent),
    );
    log('');
  } catch (error) {
    failures += 1;
    log(`ERROR: ${error && error.message ? error.message : String(error)}`);
  }

  return { lines, failures };
}
