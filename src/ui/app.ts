/**
 * The analyser controller.
 *
 * Owns the input state, decides when to re-run the engine, and delegates all
 * drawing to `render.ts`. No network calls exist in this file, or anywhere
 * downstream of it, which is what makes the privacy claim checkable.
 */

import { matchJobDescription, MIN_POSTING_CHARS } from '@core/jobmatch';
import { fromPastedText, parseResumeFile, UnsupportedFileError } from '@core/parsers';
import { SAMPLE_JOB_DESCRIPTION, SAMPLES } from '@core/samples';
import { analyse } from '@core/score';
import type { CategoryId, JobMatch, ParsedResume, Report } from '@core/types';
import { debounce, qs, qsa, replaceChildren } from '@lib/dom';
import { loadDraft, saveDraft } from '@lib/draft';
import {
  copyToClipboard,
  downloadText,
  reportFileName,
  reportToMarkdown,
} from './export';
import {
  renderActions,
  renderCheckFilter,
  renderChecks,
  renderMatch,
  renderScoreboard,
  type CheckFilter,
  type ReportRefs,
} from './render';

/** Below this the analysis is noise rather than feedback. */
const MIN_RESUME_CHARS = 120;

/** Pause after typing before re-running, long enough not to fight the user. */
const TYPING_DEBOUNCE_MS = 500;

/** How long a jumped-to check stays highlighted. */
const FLASH_MS = 1600;

type StatusTone = 'neutral' | 'busy' | 'success' | 'error';

export function initApp(): void {
  /* ---------------- element references ---------------- */

  const dropzone = qs<HTMLButtonElement>('[data-dropzone]');
  const fileInput = qs<HTMLInputElement>('[data-file-input]');
  const resumeInput = qs<HTMLTextAreaElement>('[data-resume-input]');
  const postingInput = qs<HTMLTextAreaElement>('[data-posting-input]');
  const statusEl = qs('[data-status]');
  const postingStatusEl = qs('[data-posting-status]');
  const postingDot = qs('[data-posting-dot]');
  const resumeCount = qs('[data-resume-count]');
  const postingCount = qs('[data-posting-count]');
  const tabs = qsa<HTMLButtonElement>('[data-tab]');
  const emptyEl = qs('[data-empty]');
  const reportEl = qs('[data-report]');
  const toastEl = qs('[data-toast]');
  const progressEl = qs('[data-progress]');
  const progressBar = qs('[data-progress-bar]');

  const refs: ReportRefs = {
    scoreboard: qs('[data-scoreboard]'),
    gauge: qs<SVGCircleElement>('[data-gauge]'),
    score: qs('[data-score]'),
    scoreDelta: qs('[data-score-delta]'),
    band: qs('[data-band]'),
    bandMessage: qs('[data-band-message]'),
    stats: qs('[data-stats]'),
    categories: qs('[data-categories]'),
    actions: qs('[data-actions]'),
    checks: qs('[data-checks]'),
    checkCount: qs('[data-check-count]'),
    checkFilter: qs('[data-check-filter]'),
    reportMeta: qs('[data-report-meta]'),
    matchPanel: qs('[data-match-panel]'),
    matchBody: qs('[data-match-body]'),
  };

  /* ---------------- state ---------------- */

  /**
   * The parsed document is kept so that editing the textarea re-analyses the
   * edited text, while an untouched uploaded file keeps its layout findings
   * (page count, column detection) which plain text cannot carry.
   */
  let currentDoc: ParsedResume | null = null;
  let currentReport: Report | null = null;
  let currentMatch: JobMatch | null = null;
  let busy = false;
  /** Drives the "+3" chip, so it reflects the last score the user actually saw. */
  let lastShownScore: number | null = null;
  let checkFilter: CheckFilter = 'all';
  /** Only holds categories the user has clicked; the rest use the default. */
  const openGroups = new Map<CategoryId, boolean>();
  /**
   * The posting is only compared when asked. Once it has been, later edits to
   * the resume keep the comparison current without another click.
   */
  let postingCompared = false;

  /* ---------------- status and toast ---------------- */

  function setStatus(message: string, tone: StatusTone = 'neutral'): void {
    statusEl.textContent = message;
    statusEl.dataset['tone'] = tone;
  }

  function setPostingStatus(message: string, tone: StatusTone = 'neutral'): void {
    postingStatusEl.textContent = message;
    postingStatusEl.dataset['tone'] = tone;
  }

  /* ---------------- tabs ---------------- */

  type TabId = 'resume' | 'posting';

  function selectTab(id: TabId, focus = false): void {
    for (const tab of tabs) {
      const selected = tab.dataset['tab'] === id;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      const pane = document.getElementById(tab.getAttribute('aria-controls') ?? '');
      if (pane) pane.hidden = !selected;
      if (selected && focus) tab.focus();
    }
    refreshCounts();
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => selectTab(tab.dataset['tab'] as TabId));
    // Arrow keys move between tabs, as the ARIA tabs pattern expects.
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      selectTab(tab.dataset['tab'] === 'resume' ? 'posting' : 'resume', true);
    });
  }

  /* ---------------- word counts ---------------- */

  function countWords(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
  }

  function refreshCounts(): void {
    const resumeWords = countWords(resumeInput.value);
    const postingWords = countWords(postingInput.value);
    resumeCount.textContent = resumeWords > 0 ? `${resumeWords} words` : '';
    postingCount.textContent = postingWords > 0 ? `${postingWords} words` : '';
    postingDot.hidden = postingWords === 0;
  }

  /* ---------------- progress ---------------- */

  /**
   * @param value 0..100 for a known fraction, `'indeterminate'` once reading has
   *              started but before there is anything to measure, `null` to hide.
   */
  function setProgress(value: number | 'indeterminate' | null): void {
    if (value === null) {
      progressEl.hidden = true;
      progressEl.removeAttribute('aria-valuenow');
      progressEl.dataset['indeterminate'] = 'false';
      progressBar.style.width = '0%';
      return;
    }

    progressEl.hidden = false;

    if (value === 'indeterminate') {
      progressEl.dataset['indeterminate'] = 'true';
      progressEl.removeAttribute('aria-valuenow');
      progressBar.style.width = '100%';
      return;
    }

    const pct = Math.round(Math.min(100, Math.max(0, value)));
    progressEl.dataset['indeterminate'] = 'false';
    progressEl.setAttribute('aria-valuenow', String(pct));
    progressBar.style.width = `${pct}%`;
  }

  let toastTimer: number | undefined;
  function toast(message: string): void {
    toastEl.textContent = message;
    toastEl.dataset['visible'] = 'true';
    if (toastTimer !== undefined) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.dataset['visible'] = 'false';
    }, 2600);
  }

  /* ---------------- analysis ---------------- */

  /**
   * Compares the posting with the resume.
   *
   * @param explicit True when the user pressed Compare, which is when problems
   *                 are reported and the result is scrolled into view. Background
   *                 re-runs after a resume edit stay quiet.
   */
  function runMatch(resumeText: string, explicit = false): void {
    const posting = postingInput.value.trim();

    const fail = (message: string): void => {
      currentMatch = null;
      renderMatch(refs, null, null);
      if (explicit) setPostingStatus(message, 'error');
    };

    if (!posting) {
      fail('Paste a job description first.');
      return;
    }
    if (posting.length < MIN_POSTING_CHARS) {
      fail('That posting is too short to pull keywords from. Paste a bit more of it.');
      return;
    }
    if (resumeText.trim().length < MIN_RESUME_CHARS) {
      fail('Add your resume in the first tab, then compare.');
      return;
    }

    currentMatch = matchJobDescription(resumeText, posting);
    renderMatch(refs, currentMatch, null);
    postingCompared = true;

    if (explicit) {
      setPostingStatus(
        `Compared. ${currentMatch.matched.length} of ${currentMatch.terms.length} key terms are already in your resume.`,
        'success',
      );
      refs.matchPanel.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  function showReport(report: Report): void {
    // Captured before the assignment so the delta compares against what was on
    // screen, not against this same report.
    const previous = lastShownScore;
    currentReport = report;
    emptyEl.hidden = true;
    reportEl.hidden = false;
    renderScoreboard(refs, report, previous);
    renderActions(refs, report);
    renderCheckFilter(refs, report, checkFilter);
    renderChecks(refs, report, { filter: checkFilter, open: openGroups });
    lastShownScore = report.score;
  }

  /** Redraws the checklist alone, for filter and expand changes. */
  function redrawChecks(): void {
    if (!currentReport) return;
    renderCheckFilter(refs, currentReport, checkFilter);
    renderChecks(refs, currentReport, { filter: checkFilter, open: openGroups });
  }

  /**
   * Brings one check into view from the actions list: drops any filter hiding
   * it, opens its group, then scrolls and highlights it.
   */
  function revealCheck(id: string): void {
    if (!currentReport) return;
    const check = currentReport.checks.find((entry) => entry.id === id);
    if (!check) return;

    checkFilter = 'all';
    openGroups.set(check.category, true);
    redrawChecks();

    // CSS.escape because check ids contain a dot, e.g. "parse.text".
    const target = refs.checks.querySelector<HTMLElement>(
      `[data-check-id="${CSS.escape(id)}"]`,
    );
    if (!target) return;

    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // tabindex="-1" on the row makes this land somewhere useful for a screen reader.
    target.focus({ preventScroll: true });
    target.dataset['flash'] = 'true';
    window.setTimeout(() => {
      delete target.dataset['flash'];
    }, FLASH_MS);
  }

  /**
   * @param doc  The parsed document to score.
   * @param quiet Suppress the status line, used for background re-runs while typing.
   */
  function analyseDoc(doc: ParsedResume, quiet = false): void {
    currentDoc = doc;
    showReport(analyse(doc));
    if (postingCompared) runMatch(doc.text);

    if (quiet) return;
    const warnings = doc.warnings.join(' ');
    if (warnings) setStatus(warnings, 'error');
    else setStatus(`Checked ${doc.text.split(/\s+/).filter(Boolean).length} words.`, 'success');
  }

  /** Scores whatever is currently in the textarea. */
  function analyseTextarea(quiet = false): void {
    const text = resumeInput.value;

    if (text.trim().length < MIN_RESUME_CHARS) {
      if (!quiet) {
        setStatus('That is too short to check. Paste your full resume text.', 'error');
      }
      return;
    }

    /*
     * If the text still matches the parsed file, reuse the file's document so
     * layout findings survive. Once the text diverges, fall back to treating it
     * as pasted text, since the layout facts no longer describe it.
     */
    const doc =
      currentDoc && currentDoc.text === text.trim() ? currentDoc : fromPastedText(text);
    analyseDoc(doc, quiet);
  }

  const analyseTextareaDebounced = debounce(() => {
    // Only auto-run once a report is already on screen, so the first result is
    // always something the user explicitly asked for.
    if (currentReport) analyseTextarea(true);
  }, TYPING_DEBOUNCE_MS);

  /* ---------------- file handling ---------------- */

  async function handleFile(file: File | null | undefined): Promise<void> {
    if (!file || busy) return;

    busy = true;
    fileInput.value = '';
    selectTab('resume');
    // A new document is not a change to the old one, so there is no delta to show.
    lastShownScore = null;
    setStatus(`Reading ${file.name}…`, 'busy');
    setProgress('indeterminate');
    dropzone.disabled = true;
    reportEl.setAttribute('aria-busy', 'true');

    try {
      const doc = await parseResumeFile(file, ({ page, pages }) => {
        if (pages <= 0) return;
        setProgress((page / pages) * 100);
        setStatus(
          page === 0
            ? `Reading ${file.name} - ${pages} ${pages === 1 ? 'page' : 'pages'}…`
            : `Reading page ${page} of ${pages}…`,
          'busy',
        );
      });
      resumeInput.value = doc.text;
      saveDraft({ resume: doc.text });
      refreshCounts();

      if (doc.meta.textDensity < 200) {
        // Still show the report: the parseability checks are the whole point here.
        analyseDoc(doc, true);
        setStatus(
          'Almost no text came out of that file. It is probably a scan or an image - see the first check below.',
          'error',
        );
        return;
      }

      analyseDoc(doc);
    } catch (error) {
      const message =
        error instanceof UnsupportedFileError
          ? error.message
          : error instanceof Error && error.message
            ? error.message
            : 'That file could not be read.';
      setStatus(`${message} You can paste the text instead.`, 'error');
    } finally {
      busy = false;
      setProgress(null);
      dropzone.disabled = false;
      reportEl.removeAttribute('aria-busy');
    }
  }

  /* ---------------- wiring: file input ---------------- */

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    void handleFile(fileInput.files?.[0]);
  });

  // Drag and drop is bound on the window so dropping anywhere works, which is
  // what people actually do. The zone still shows the highlight.
  let dragDepth = 0;
  window.addEventListener('dragenter', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    dragDepth += 1;
    dropzone.dataset['over'] = 'true';
  });
  window.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropzone.dataset['over'] = 'false';
  });
  window.addEventListener('drop', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    dragDepth = 0;
    dropzone.dataset['over'] = 'false';
    void handleFile(event.dataTransfer.files?.[0]);
  });

  /* ---------------- wiring: text inputs ---------------- */

  qs<HTMLButtonElement>('[data-analyse]').addEventListener('click', () => {
    analyseTextarea();
    if (currentReport) refs.scoreboard.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  resumeInput.addEventListener('input', () => {
    saveDraft({ resume: resumeInput.value });
    refreshCounts();
    analyseTextareaDebounced();
  });

  // Editing the posting only saves it; the comparison runs when asked.
  const postingChanged = debounce(() => {
    saveDraft({ posting: postingInput.value });
  }, 300);
  postingInput.addEventListener('input', () => {
    refreshCounts();
    if (postingStatusEl.textContent) setPostingStatus('');
    postingChanged();
  });

  qs<HTMLButtonElement>('[data-compare]').addEventListener('click', () => {
    saveDraft({ posting: postingInput.value });
    runMatch(resumeInput.value, true);
  });

  qs<HTMLButtonElement>('[data-clear-posting]').addEventListener('click', () => {
    postingInput.value = '';
    postingCompared = false;
    currentMatch = null;
    saveDraft({ posting: '' });
    renderMatch(refs, null, null);
    setPostingStatus('');
    refreshCounts();
    postingInput.focus();
  });

  /* ---------------- wiring: samples and reset ---------------- */

  for (const button of qsa<HTMLButtonElement>('[data-sample]')) {
    button.addEventListener('click', () => {
      const which = button.dataset['sample'];
      const sample = SAMPLES.find((entry) => entry.id === which);
      if (!sample) return;
      currentDoc = null;
      // Swapping documents, so comparing scores would be meaningless.
      lastShownScore = null;
      resumeInput.value = sample.text;
      saveDraft({ resume: sample.text });
      refreshCounts();
      analyseTextarea();
      setStatus(`${sample.label}: ${sample.note}`, 'neutral');
    });
  }

  qs<HTMLButtonElement>('[data-sample-posting]').addEventListener('click', () => {
    postingInput.value = SAMPLE_JOB_DESCRIPTION;
    saveDraft({ posting: SAMPLE_JOB_DESCRIPTION });
    refreshCounts();
    runMatch(resumeInput.value, true);
  });

  // Clears the resume and its report. The posting has its own Clear button.
  qs<HTMLButtonElement>('[data-clear]').addEventListener('click', () => {
    resumeInput.value = '';
    fileInput.value = '';
    currentDoc = null;
    currentReport = null;
    currentMatch = null;
    lastShownScore = null;
    checkFilter = 'all';
    openGroups.clear();
    saveDraft({ resume: '' });
    reportEl.hidden = true;
    emptyEl.hidden = false;
    replaceChildren(refs.actions);
    replaceChildren(refs.checks);
    replaceChildren(refs.checkFilter);
    replaceChildren(refs.scoreDelta);
    refs.scoreDelta.hidden = true;
    renderMatch(refs, null, null);
    setStatus('');
    refreshCounts();
    resumeInput.focus();
  });

  /* ---------------- wiring: checklist filter and navigation ---------------- */

  /*
   * A collapsed <details> and a filtered list would both print incomplete, and
   * "Save as PDF" is how a report leaves the app. So everything is expanded and
   * unfiltered for the duration of the print, then put back. `printing` stops
   * the toggle listener below from mistaking this for a user choice.
   */
  let printing = false;
  let filterBeforePrint: CheckFilter = 'all';

  window.addEventListener('beforeprint', () => {
    printing = true;
    filterBeforePrint = checkFilter;
    if (checkFilter !== 'all') {
      checkFilter = 'all';
      redrawChecks();
    }
    for (const group of qsa<HTMLDetailsElement>('details.check-group', refs.checks)) {
      group.open = true;
    }
  });

  window.addEventListener('afterprint', () => {
    checkFilter = filterBeforePrint;
    // Re-rendering restores the collapse state from `openGroups`.
    redrawChecks();
    printing = false;
  });

  refs.checkFilter.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-filter]');
    if (!button) return;
    const next = button.dataset['filter'] as CheckFilter | undefined;
    if (!next || next === checkFilter) return;
    checkFilter = next;
    redrawChecks();
  });

  // `toggle` does not bubble, so this listens in the capture phase.
  refs.checks.addEventListener(
    'toggle',
    (event) => {
      if (printing) return;
      const details = event.target;
      if (!(details instanceof HTMLDetailsElement)) return;
      const category = details.dataset['category'] as CategoryId | undefined;
      /*
       * Only remember choices made while everything is showing. A filtered view
       * forces groups open, so its state says nothing about what the user wants.
       */
      if (category && checkFilter === 'all') openGroups.set(category, details.open);
    },
    true,
  );

  refs.actions.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-jump]');
    const id = button?.dataset['jump'];
    if (id) revealCheck(id);
  });

  refs.matchBody.addEventListener('click', (event) => {
    if (!(event.target as HTMLElement | null)?.closest('[data-copy-missing]')) return;
    if (!currentMatch) return;
    const terms = currentMatch.missing.map((term) => term.term).join(', ');
    void copyToClipboard(terms).then((ok) => {
      toast(ok ? 'Missing terms copied to your clipboard.' : 'Could not copy those terms.');
    });
  });

  /* ---------------- wiring: export ---------------- */

  qs<HTMLButtonElement>('[data-copy]').addEventListener('click', () => {
    if (!currentReport) return;
    void copyToClipboard(reportToMarkdown(currentReport, currentMatch)).then((ok) => {
      toast(ok ? 'Report copied to your clipboard.' : 'Could not copy. Try the download instead.');
    });
  });

  qs<HTMLButtonElement>('[data-download]').addEventListener('click', () => {
    if (!currentReport) return;
    downloadText(reportFileName(currentReport), reportToMarkdown(currentReport, currentMatch));
    toast('Report downloaded.');
  });

  qs<HTMLButtonElement>('[data-print]').addEventListener('click', () => {
    if (!currentReport) return;
    window.print();
  });

  /* ---------------- restore a draft ---------------- */

  const draft = loadDraft();
  if (draft.posting) {
    postingInput.value = draft.posting;
    // A saved posting was compared last time, so keep showing that comparison.
    postingCompared = true;
  }
  if (draft.resume) {
    resumeInput.value = draft.resume;
    analyseTextarea(true);
    if (currentReport) {
      setStatus('Restored the text you had in this tab.', 'neutral');
    }
  } else {
    // First visit: show the weak sample so the report is never an empty shell.
    const intro = SAMPLES.find((entry) => entry.id === 'weak');
    if (intro) {
      resumeInput.value = intro.text;
      analyseTextarea(true);
      setStatus('Showing a sample. Paste or upload your own resume.', 'neutral');
    }
  }

  /* ---------------- extra input affordances ---------------- */

  // Paste a file straight from the clipboard, e.g. copied out of a file manager.
  window.addEventListener('paste', (event) => {
    const file = event.clipboardData?.files?.[0];
    if (file) {
      event.preventDefault();
      void handleFile(file);
    }
  });

  // Keyboard shortcut for the thing people do repeatedly.
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (document.activeElement === postingInput) runMatch(resumeInput.value, true);
      else analyseTextarea();
    }
  });

  refreshCounts();
}
