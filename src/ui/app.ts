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
import type { JobMatch, ParsedResume, Report } from '@core/types';
import { debounce, qs, qsa, replaceChildren } from '@lib/dom';
import { loadDraft, saveDraft } from '@lib/draft';
import {
  copyToClipboard,
  downloadText,
  reportFileName,
  reportToMarkdown,
} from './export';
import { renderActions, renderChecks, renderMatch, renderScoreboard, type ReportRefs } from './render';

/** Below this the analysis is noise rather than feedback. */
const MIN_RESUME_CHARS = 120;

/** Pause after typing before re-running, long enough not to fight the user. */
const TYPING_DEBOUNCE_MS = 500;

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

  const refs: ReportRefs = {
    scoreboard: qs('[data-scoreboard]'),
    gauge: qs<SVGCircleElement>('[data-gauge]'),
    score: qs('[data-score]'),
    band: qs('[data-band]'),
    bandMessage: qs('[data-band-message]'),
    stats: qs('[data-stats]'),
    categories: qs('[data-categories]'),
    actions: qs('[data-actions]'),
    checks: qs('[data-checks]'),
    checkCount: qs('[data-check-count]'),
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
    currentReport = report;
    emptyEl.hidden = true;
    reportEl.hidden = false;
    renderScoreboard(refs, report);
    renderActions(refs, report);
    renderChecks(refs, report);
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
    setStatus(`Reading ${file.name}…`, 'busy');

    try {
      const doc = await parseResumeFile(file);
      resumeInput.value = doc.text;
      saveDraft({ resume: doc.text });
      refreshCounts();

      if (doc.meta.textDensity < 200) {
        // Still show the report: the parseability checks are the whole point here.
        analyseDoc(doc, true);
        setStatus(
          'Almost no text came out of that file. It is probably a scan or an image — see the first check below.',
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
    saveDraft({ resume: '' });
    reportEl.hidden = true;
    emptyEl.hidden = false;
    replaceChildren(refs.actions);
    replaceChildren(refs.checks);
    renderMatch(refs, null, null);
    setStatus('');
    refreshCounts();
    resumeInput.focus();
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
